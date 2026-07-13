// src/lib/practice/generatePracticeRecommendations.js
// Phase 5 — After a diagnostic is scored, turn the weak/needs_practice
// concepts into concrete, assignable problem recommendations.
//
// This is deterministic, not AI-generated: it just matches weak concepts to
// problems already tagged with that concept via problem_concepts. Runs with
// the service-role client since practice_recommendations has no INSERT
// policy for `authenticated` (students can only SELECT/UPDATE their own rows,
// e.g. to mark one dismissed — they cannot create their own recommendations).
//
// Non-fatal by design: if this fails, the diagnostic attempt and AI report
// are already saved. A missing recommendation batch just means the
// dashboard falls back to showing no "recommended next problems" yet.

const PROBLEMS_PER_WEAK_CONCEPT = 2;

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.admin
 * @param {string} params.userId
 * @param {number} params.attemptId
 * @returns {Promise<{ batchId: string, count: number }>}
 */
export async function generatePracticeRecommendations({
  admin,
  userId,
  attemptId,
}) {
  // Weakest concepts first — these are the ones worth recommending practice for.
  const { data: weakConcepts, error: conceptError } = await admin
    .from("attempt_concept_results")
    .select("concept_id, score_percentage, classification")
    .eq("attempt_id", attemptId)
    .in("classification", ["weak", "needs_practice"])
    .order("score_percentage", { ascending: true });

  if (conceptError) {
    throw new Error("Could not load concept results for recommendations.");
  }

  if (!weakConcepts?.length) {
    // Nothing weak enough to recommend practice for — not an error.
    return { batchId: null, count: 0 };
  }

  const batchId = crypto.randomUUID();
  const rows = [];
  let priority = 1;

  for (const concept of weakConcepts) {
    const { data: problems, error: problemError } = await admin
      .from("problem_concepts")
      .select("problem_id, is_primary, problems ( id, title, status )")
      .eq("concept_id", concept.concept_id)
      .order("is_primary", { ascending: false })
      .limit(PROBLEMS_PER_WEAK_CONCEPT);

    if (problemError) {
      throw new Error("Could not load problems for a weak concept.");
    }

    for (const p of problems || []) {
      if (!p.problems || p.problems.status !== "published") continue;

      rows.push({
        user_id: userId,
        concept_id: concept.concept_id,
        problem_id: p.problem_id,
        source: "diagnostic",
        reason: `You scored ${concept.score_percentage}% on this concept in your diagnostic — practicing it directly targets that gap.`,
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
