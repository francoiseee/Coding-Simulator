// src/lib/practice/generatePracticeRecommendations.js
// Phase 5 — After a diagnostic is scored, turn the student's weakest concepts
// into concrete, assignable problem recommendations.
//
// This is deterministic, not AI-generated: it just matches concepts to problems
// already tagged with that concept via problem_concepts. Runs with the
// service-role client since practice_recommendations has no INSERT policy for
// `authenticated` (students can only SELECT/UPDATE their own rows, e.g. to mark
// one dismissed — they cannot create their own recommendations).
//
// Non-fatal by design: if this fails, the diagnostic attempt and AI report are
// already saved. A missing recommendation batch just means the dashboard falls
// back to showing no "recommended next problems" yet.
//
// ---------------------------------------------------------------------------
// Coverage policy
// ---------------------------------------------------------------------------
// classify() in diagnostic/submit produces four labels:
//   strong (>=80) | developing (60-79) | needs_practice (40-59) | weak (<40)
//
// `developing` is INCLUDED here. Excluding it left a real hole: a student
// scoring 60-79% across the board — mid-level, and squarely the target
// audience — received an empty practice path. Weakest-first ordering means
// developing concepts still rank below genuinely weak ones; they fill out the
// tail of the batch rather than displacing anything.
//
// Students whose every concept is `strong` also receive a batch, drawn from
// their lowest-scoring concepts (see ALL_STRONG_FALLBACK_COUNT). An empty
// dashboard is a worse outcome than a slightly redundant suggestion, and a
// high scorer still benefits from continued practice.
//
// ---------------------------------------------------------------------------
// Parent-concept fallback
// ---------------------------------------------------------------------------
// Sub-concepts (concepts.parent_id IS NOT NULL) are assessed by the diagnostic
// but have no problems tagged directly to them — e.g. "Recursion Base Cases"
// is measured by 3 diagnostic questions yet no problem carries that tag. Left
// unhandled, a student told they are weak at a sub-concept receives nothing to
// practice for it.
//
// Rather than hand-tagging problem_concepts rows for every sub-concept, this
// walks up the existing concepts.parent_id hierarchy: a concept with no
// published problems of its own inherits its parent's. This is pedagogically
// sound (weak at recursion base cases -> practise recursion problems) and
// generalises automatically to sub-concepts added later.
//
// ---------------------------------------------------------------------------
// Parent takes precedence over its own children
// ---------------------------------------------------------------------------
// Because a sub-concept inherits its parent's problems, a sub-concept and its
// parent appearing in the same batch compete for one shared problem pool. In
// practice the sub-concept scores lower (fewer questions, so a single miss
// swings the percentage further), sorts first, claims every problem, and the
// duplicate guard then starves the parent — even though the parent carries
// more evidence.
//
// So when both a concept and its parent qualify, the SUB-CONCEPT is dropped.
// The parent's problems are the same set that would have been recommended
// anyway, and the parent's classification rests on more questions. Nothing is
// lost pedagogically; the attribution just moves to the better-evidenced
// concept.

// More problems for weaker concepts — attention should scale with need.
const PROBLEMS_PER_CONCEPT = {
  weak: 3,
  needs_practice: 2,
  developing: 1,
};

// How many of the lowest-scoring concepts to draw from when nothing is below
// `strong`, so a high-scoring student still gets a practice path.
const ALL_STRONG_FALLBACK_COUNT = 3;
const PROBLEMS_PER_FALLBACK_CONCEPT = 1;

// Ceiling on a single batch, so a broadly weak student isn't handed an
// unusable wall of 20+ problems.
const MAX_RECOMMENDATIONS_PER_BATCH = 10;

const TARGETED_CLASSIFICATIONS = ["weak", "needs_practice", "developing"];

function reasonFor(classification, scorePercentage) {
  const pct = `${scorePercentage}%`;
  switch (classification) {
    case "weak":
      return `You scored ${pct} on this concept in your diagnostic — this is your biggest gap, so practicing it has the most impact right now.`;
    case "needs_practice":
      return `You scored ${pct} on this concept in your diagnostic — targeted practice here should close the gap quickly.`;
    case "developing":
      return `You scored ${pct} on this concept — the fundamentals are there, and practice will help you apply them under interview conditions.`;
    default:
      return `You scored ${pct} on this concept — this problem keeps it sharp.`;
  }
}

/**
 * Fetch published problems tagged with a concept. If the concept has none of
 * its own (typical for sub-concepts), fall back to its parent's problems.
 * Returns rows shaped like problem_concepts joins.
 */
async function loadProblemsForConcept({ admin, conceptId, limit }) {
  async function fetchFor(id, take) {
    const { data, error } = await admin
      .from("problem_concepts")
      .select("problem_id, is_primary, problems ( id, title, status )")
      .eq("concept_id", id)
      .order("is_primary", { ascending: false })
      .limit(take);

    if (error) {
      throw new Error("Could not load problems for a concept.");
    }
    return (data || []).filter((r) => r.problems?.status === "published");
  }

  const direct = await fetchFor(conceptId, limit);
  if (direct.length > 0) return direct;

  // No problems tagged directly — inherit from the parent concept, if any.
  const { data: conceptRow, error: conceptRowError } = await admin
    .from("concepts")
    .select("parent_id")
    .eq("id", conceptId)
    .maybeSingle();

  if (conceptRowError || !conceptRow?.parent_id) return [];

  return fetchFor(conceptRow.parent_id, limit);
}

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.admin
 * @param {string} params.userId
 * @param {number} params.attemptId
 * @returns {Promise<{ batchId: string|null, count: number }>}
 */
export async function generatePracticeRecommendations({
  admin,
  userId,
  attemptId,
}) {
  // Load ALL concept results, weakest first. Filtering happens below so the
  // all-strong fallback has the full picture to work from.
  const { data: allConcepts, error: conceptError } = await admin
    .from("attempt_concept_results")
    .select(
      "concept_id, score_percentage, classification, concepts ( parent_id )",
    )
    .eq("attempt_id", attemptId)
    .order("score_percentage", { ascending: true });

  if (conceptError) {
    throw new Error("Could not load concept results for recommendations.");
  }

  if (!allConcepts?.length) {
    return { batchId: null, count: 0 };
  }

  // Concepts the attempt barely touched shouldn't drive a practice path.
  const usable = allConcepts.filter(
    (c) => c.classification !== "insufficient_evidence",
  );

  const targeted = usable.filter((c) =>
    TARGETED_CLASSIFICATIONS.includes(c.classification),
  );

  // Decide the working set: genuinely below-strong concepts, or — if there are
  // none — the lowest-scoring strong concepts as a fallback.
  const isFallback = targeted.length === 0;
  const workingSet = isFallback
    ? usable.slice(0, ALL_STRONG_FALLBACK_COUNT)
    : targeted;

  // Drop any concept whose parent also qualifies — see "Parent takes
  // precedence" above. Applied after the fallback branch so it covers both
  // the targeted and all-strong paths.
  const qualifyingIds = new Set(workingSet.map((c) => c.concept_id));
  const finalSet = workingSet.filter((c) => {
    const parentId = c.concepts?.parent_id;
    return !(parentId && qualifyingIds.has(parentId));
  });

  if (finalSet.length === 0) {
    return { batchId: null, count: 0 };
  }

  const batchId = crypto.randomUUID();
  const rows = [];
  const seenProblemIds = new Set();
  let priority = 1;

  for (const concept of finalSet) {
    if (rows.length >= MAX_RECOMMENDATIONS_PER_BATCH) break;

    const limit = isFallback
      ? PROBLEMS_PER_FALLBACK_CONCEPT
      : PROBLEMS_PER_CONCEPT[concept.classification] || 1;

    const problems = await loadProblemsForConcept({
      admin,
      conceptId: concept.concept_id,
      limit,
    });

    for (const p of problems || []) {
      if (rows.length >= MAX_RECOMMENDATIONS_PER_BATCH) break;
      // A problem can be tagged with several concepts. Without this guard the
      // same problem could be recommended twice in one batch under two
      // different concepts, which reads as a bug to the student.
      if (seenProblemIds.has(p.problem_id)) continue;
      seenProblemIds.add(p.problem_id);

      rows.push({
        user_id: userId,
        concept_id: concept.concept_id,
        problem_id: p.problem_id,
        source: "diagnostic",
        reason: reasonFor(concept.classification, concept.score_percentage),
        priority: priority++,
        status: "pending",
        batch_id: batchId,
      });
    }
  }

  if (rows.length === 0) {
    return { batchId: null, count: 0 };
  }

  const { error: insertError } = await admin
    .from("practice_recommendations")
    .insert(rows);

  if (insertError) {
    throw new Error("Failed to save practice recommendations.");
  }

  return { batchId, count: rows.length };
}
