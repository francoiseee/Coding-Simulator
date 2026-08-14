// src/app/api/dashboard/summary/route.js
// Serves the real data the Dashboard and Progress tabs need: the student's
// latest completed diagnostic attempt, their per-concept results, and their
// current practice recommendations.
//
// GET /api/dashboard/summary
//
// Uses the normal cookie client. RLS already restricts diagnostic_attempts,
// attempt_concept_results and practice_recommendations to auth.uid() = user_id,
// so this can only ever return the caller's own data.
//
// ---------------------------------------------------------------------------
// Why `weakest` is filtered rather than "lowest three by score"
// ---------------------------------------------------------------------------
// Previously `weakest` was simply the three lowest-scoring concepts. That
// produced two user-facing defects:
//
//  1. Concepts classified `insufficient_evidence` (fewer than the minimum
//     number of diagnostic questions) surfaced as the headline "biggest
//     opportunity to improve" — directly contradicting the recommendation
//     engine, which correctly excludes them. A student was being pointed at
//     the one concept the system had explicitly decided it could not judge.
//
//  2. A concept could be labelled as needing practice purely because it
//     ranked lowest, even when classified `strong`. Telling a student who
//     scored 80% that they "need practice" undercuts the credibility of the
//     feedback.
//
// So: unjudgeable concepts are excluded entirely, and only concepts actually
// below `strong` are eligible for `weakest`. When nothing qualifies, `weakest`
// is empty and the UI should say the student is on track rather than
// manufacturing a weakness.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Human-readable label per classification. The UI should render these rather
// than inferring a label from a concept's position in a sorted list.
const CLASSIFICATION_LABELS = {
  strong: "Strong",
  developing: "Developing",
  needs_practice: "Needs practice",
  weak: "Weak",
  insufficient_evidence: "Not enough data yet",
};

function tierFromScore(pct) {
  if (pct >= 80) return "Advanced Architect";
  if (pct >= 60) return "Proficient Engineer";
  if (pct >= 40) return "Developing Coder";
  return "Getting Started";
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Fetch display name from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name || null;

  // Most recent completed attempt, if any.
  const { data: attempt, error: attemptError } = await supabase
    .from("diagnostic_attempts")
    .select("id, raw_score, score_percentage, completed_at")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (attemptError) {
    return NextResponse.json(
      { error: "Could not load attempt data." },
      { status: 500 },
    );
  }

  if (!attempt) {
    // Student hasn't finished a diagnostic yet — nothing else to fetch.
    return NextResponse.json({
      hasCompletedDiagnostic: false,
      displayName,
      latestAttempt: null,
      concepts: [],
      strongest: [],
      weakest: [],
      recommendedProblems: [],
      masteryConcepts: [],
      overallScorePercentage: null,
      overallMasteryPercentage: null,
      tier: "Not Yet Assessed",
    });
  }

  const { data: conceptRows, error: conceptError } = await supabase
    .from("attempt_concept_results")
    .select(
      `
      concept_id,
      score_percentage,
      classification,
      questions_relevant,
      concepts ( slug, name, category )
    `,
    )
    .eq("attempt_id", attempt.id)
    .order("score_percentage", { ascending: true });

  if (conceptError) {
    return NextResponse.json(
      { error: "Could not load concept results." },
      { status: 500 },
    );
  }

  // Fixed snapshot of the diagnostic — used below as the baseline / fallback,
  // but NOT shown directly wherever live mastery is available (see `concepts`
  // below). Showing this alone would mean a solved practice problem never
  // moves any dashboard stat, since this table is only ever written once, at
  // diagnostic submission time.
  const diagnosticConcepts = conceptRows.map((c) => ({
    conceptId: c.concept_id,
    slug: c.concepts?.slug,
    name: c.concepts?.name,
    category: c.concepts?.category,
    scorePercentage: c.score_percentage,
    classification: c.classification,
    questionsRelevant: c.questions_relevant,
  }));

  // Live concept mastery — the EWMA estimate that both diagnostic and practice
  // feed into (see updateMasteryFromAttempt / updateMasteryFromSubmission in
  // src/lib/mastery/updateConceptMastery.js). last_practiced_at != null means
  // the concept has been exercised through coding practice beyond its
  // diagnostic baseline.
  const { data: masteryRows, error: masteryError } = await supabase
    .from("user_concept_mastery")
    .select(`
      concept_id,
      mastery_score,
      evidence_count,
      last_practiced_at,
      updated_at,
      concepts ( name, category )
    `)
    .order("mastery_score", { ascending: true });

  if (masteryError) {
    return NextResponse.json(
      { error: "Could not load concept mastery." },
      { status: 500 },
    );
  }

  const masteryByConceptId = new Map(
    (masteryRows || []).map((m) => [
      m.concept_id,
      { scorePercentage: Number(m.mastery_score), evidenceCount: Number(m.evidence_count) || 0 },
    ]),
  );

  // Same thresholds used for the diagnostic's own classify() in
  // src/app/api/diagnostic/submit/route.js, applied to the live mastery
  // score so a concept's classification stays consistent whichever source
  // (diagnostic snapshot or live mastery) is currently backing it.
  function classifyScore(scorePct) {
    if (scorePct >= 80) return "strong";
    if (scorePct >= 60) return "developing";
    if (scorePct >= 40) return "needs_practice";
    return "weak";
  }

  // The dashboard's headline concept stats (Skill Growth Chart, Learning
  // Path, weakest/strongest) should reflect the student's CURRENT standing,
  // not just their diagnostic result — otherwise a correctly solved practice
  // problem never changes anything on the dashboard. Prefer live mastery per
  // concept; fall back to the diagnostic snapshot only for concepts with no
  // mastery row yet (evidence_count filters in updateMasteryFromAttempt can
  // leave insufficient-evidence concepts without one).
  const concepts = diagnosticConcepts.map((c) => {
    const live = masteryByConceptId.get(c.conceptId);
    const scorePercentage = live ? live.scorePercentage : c.scorePercentage;
    const classification = live ? classifyScore(live.scorePercentage) : c.classification;
    return {
      conceptId: c.conceptId,
      slug: c.slug,
      name: c.name,
      category: c.category,
      scorePercentage,
      classification,
      // Surfaced so the UI can render an honest label instead of deriving one
      // from sort position, and can show how much evidence backs the estimate.
      classificationLabel: CLASSIFICATION_LABELS[classification] || classification,
      questionsRelevant: c.questionsRelevant,
      hasEnoughEvidence: classification !== "insufficient_evidence",
    };
  });

  // Only concepts the attempt could actually judge are eligible for headline
  // guidance — see the note at the top of this file.
  const judged = concepts.filter((c) => c.hasEnoughEvidence);

  // "Needs work" means genuinely below `strong`, not merely lowest-ranked.
  const needsWork = judged.filter((c) => c.classification !== "strong");

  const weakest = needsWork.slice(0, 3);
  const strongest = [...judged].reverse().slice(0, 3);
  const allConcepts = concepts; // all 16, weakest first

  // The Skill Growth Chart's donut is built from `allConcepts` (live-aware,
  // see above), so its center number must be too — otherwise the ring moves
  // when a practice problem is solved but the number in the middle doesn't.
  // Averaged across all 16 concepts, same as the ring's per-concept basis.
  const overallMasteryPercentage = concepts.length
    ? Math.round(
        (concepts.reduce((sum, c) => sum + c.scorePercentage, 0) /
          concepts.length) *
          100,
      ) / 100
    : null;

  // Diagnostic baseline per concept, so the UI can show baseline vs. current.
  const baselineByConcept = new Map(
    diagnosticConcepts.map((c) => [c.conceptId, c.scorePercentage]),
  );

  const masteryConcepts = (masteryRows || []).map((m) => ({
    conceptId: m.concept_id,
    name: m.concepts?.name ?? null,
    category: m.concepts?.category ?? null,
    masteryScore: Number(m.mastery_score),
    evidenceCount: m.evidence_count,
    practiced: m.last_practiced_at != null,
    diagnosticBaseline:
      baselineByConcept.has(m.concept_id)
        ? Number(baselineByConcept.get(m.concept_id))
        : null,
  }));

  // Latest batch of practice recommendations, if any (Phase 5). RLS already
  // restricts this to the caller's own rows.
  const { data: latestRec } = await supabase
    .from("practice_recommendations")
    .select("batch_id")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let recommendedProblems = [];
  if (latestRec?.batch_id) {
    const { data: recRows } = await supabase
      .from("practice_recommendations")
      .select(
        `
        id,
        priority,
        reason,
        status,
        problems ( id, slug, title, difficulty, estimated_minutes ),
        concepts ( name )
      `,
      )
      .eq("batch_id", latestRec.batch_id)
      .eq("status", "pending")
      .order("priority", { ascending: true });

    recommendedProblems = (recRows || [])
      .filter((r) => r.problems)
      .map((r) => ({
        recommendationId: r.id,
        problemId: r.problems.id,
        slug: r.problems.slug,
        title: r.problems.title,
        difficulty: r.problems.difficulty,
        estimatedMinutes: r.problems.estimated_minutes,
        reason: r.reason,
        priority: r.priority,
        conceptName: r.concepts?.name ?? null,
      }));
  }

  // The headline "suggested focus" must agree with what the recommendation
  // engine actually produced. Prefer the top-priority recommendation; fall
  // back to the weakest judged concept only if no recommendations exist.
  const suggestedFocus = recommendedProblems.length
    ? {
        kind: "problem",
        problemSlug: recommendedProblems[0].slug,
        title: recommendedProblems[0].title,
        reason: recommendedProblems[0].reason,
      }
    : weakest.length
      ? {
          kind: "concept",
          conceptSlug: weakest[0].slug,
          title: weakest[0].name,
          reason: `Scored ${weakest[0].scorePercentage}% on this concept.`,
        }
      : null;

  // Fetch latest AI report for this attempt
  let aiReport = null;
  const { data: reportRow } = await supabase
    .from("ai_reports")
    .select("generated_text, structured_output, created_at")
    .eq("source_type", "diagnostic_attempt")
    .eq("source_id", attempt.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reportRow) {
    aiReport = {
      generatedText: reportRow.generated_text,
      structured: reportRow.structured_output,
      createdAt: reportRow.created_at,
    };
  }

  return NextResponse.json({
    hasCompletedDiagnostic: true,
    displayName,
    latestAttempt: {
      id: attempt.id,
      rawScore: attempt.raw_score,
      scorePercentage: attempt.score_percentage,
      completedAt: attempt.completed_at,
    },
    concepts,
    strongest,
    weakest,
    allConcepts,
    recommendedProblems,
    masteryConcepts,
    aiReport,
    suggestedFocus,
    overallMasteryPercentage,
    // True when every judged concept is already `strong` — the UI should
    // congratulate rather than invent a weakness.
    allConceptsStrong: judged.length > 0 && needsWork.length === 0,
    overallScorePercentage: attempt.score_percentage,
    tier: tierFromScore(attempt.score_percentage),
  });
}
