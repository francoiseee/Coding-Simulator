// src/app/api/dashboard/summary/route.js
// Serves the real data the Dashboard and Progress tabs need: the student's
// latest completed diagnostic attempt plus their per-concept mastery, so the
// UI can stop showing hardcoded placeholder content.
//
// GET /api/dashboard/summary
//
// Uses the normal cookie client. RLS already restricts diagnostic_attempts and
// attempt_concept_results to auth.uid() = user_id, so this can only ever
// return the caller's own data.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      latestAttempt: null,
      concepts: [],
      strongest: [],
      weakest: [],
      overallScorePercentage: null,
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

  const concepts = conceptRows.map((c) => ({
    conceptId: c.concept_id,
    slug: c.concepts?.slug,
    name: c.concepts?.name,
    category: c.concepts?.category,
    scorePercentage: c.score_percentage,
    classification: c.classification,
  }));

  const weakest = concepts.slice(0, 3);
  const strongest = [...concepts].reverse().slice(0, 3);

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
        problems ( id, slug, title, difficulty, estimated_minutes )
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
      }));
  }

  return NextResponse.json({
    hasCompletedDiagnostic: true,
    latestAttempt: {
      id: attempt.id,
      rawScore: attempt.raw_score,
      scorePercentage: attempt.score_percentage,
      completedAt: attempt.completed_at,
    },
    concepts,
    strongest,
    weakest,
    recommendedProblems,
    overallScorePercentage: attempt.score_percentage,
    tier: tierFromScore(attempt.score_percentage),
  });
}
