// src/lib/adaptive/resolveSuggestedConcept.js
//
// Single source of truth for "which concept should the student work on
// next," shared between the Dashboard's suggested-focus label
// (dashboard/summary/route.js) and — by deliberate mirroring, not by
// direct call — the live adaptive picker's concept-choice steps
// (selectNextProblem.js).
//
// WHY THIS EXISTS
// ----------------
// Before this file, dashboard/summary/route.js computed its own
// independent "weakest judged concept" label using only diagnostic/mastery
// scores. But after the within-concept-scaffolding redesign
// (Codely_Decision_WithinConceptScaffolding_Aug2026.docx), the actual
// picker a student reaches by clicking the card chooses concepts by
// SESSION CONTINUITY first — stay in whatever concept was most recently
// opened — and only falls back to lowest mastery once that concept is
// exhausted. Those are two different signals, so the two computations
// could and did disagree: the label showed one concept, clicking landed on
// a different one, entirely because the underlying algorithms differed.
//
// This function is the fix: dashboard/summary/route.js now uses THIS
// function's answer for its label instead of computing its own.
//
// WHY selectNextProblem.js DOESN'T IMPORT THIS FILE
// ----------------------------------------------------
// selectNextProblem.js already fetches concepts/mastery/problems/
// submissions once and reuses that data for both concept-choice AND
// band/problem selection. Having it call this function too would mean
// fetching the same data twice per request. Since selectNextProblem.js was
// only just written and verified live today, it was left untouched to
// avoid re-introducing risk into already-confirmed logic this close to the
// defense — deduplicating fully is a reasonable post-defense cleanup, not
// something to risk now.
//
// THIS MEANS: the concept-choice steps below (stay-in-current, then
// rotate-by-lowest-mastery-with-unsolved) are DELIBERATELY DUPLICATED from
// selectNextProblem.js's selectStructured(), steps 1-2. If either changes,
// check the other. This is an explicit, accepted trade-off, not an
// oversight.
//
// STRATEGY (mirrors selectNextProblem.js exactly)
// --------------------------------------------------
//   1. Stay in the student's current active concept (most recent
//      coding_sessions row) if it still has any unsolved problem.
//   2. Otherwise, rotate to the concept with the lowest mastery_score among
//      ALL 16 top-level concepts that still has at least one unsolved
//      problem — NOT filtered by diagnostic "judged" status or by
//      classification (a concept can need more practice regardless of
//      whether the diagnostic had enough questions to formally judge it).
//   3. If every concept in the bank is fully solved, return null. The
//      caller should fall back to something else (see
//      dashboard/summary/route.js) — this function only answers "which
//      concept still has work," not "what to show when nothing does."
//
// Deliberately stops short of picking an actual problem or progression
// band — that needs the target difficulty from pickNextDifficulty.js,
// which this function doesn't have and doesn't need. It only answers
// "which concept," the half of the decision both call sites must agree on.

const UNASSESSED_MASTERY_SCORE = 40;

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.client
 *   Either the service-role admin client or the request-scoped cookie
 *   client work — every query here is already scoped with
 *   .eq("user_id", userId), so RLS (if applied) restricts to the same rows
 *   this function already filters to explicitly.
 * @param {string} params.userId
 * @returns {Promise<{
 *   conceptId: number,
 *   slug: string,
 *   name: string,
 *   masteryScore: number,
 *   stayedInCurrent: boolean,
 * } | null>}
 *   null when every concept in the bank is fully solved for this student.
 */
export async function resolveSuggestedConcept({ client, userId }) {
  const { data: allConcepts, error: conceptsError } = await client
    .from("concepts")
    .select("id, slug, name")
    .is("parent_id", null);

  if (conceptsError || !allConcepts?.length) return null;
  const allConceptIds = allConcepts.map((c) => c.id);

  const { data: masteryRows } = await client
    .from("user_concept_mastery")
    .select("concept_id, mastery_score")
    .eq("user_id", userId)
    .in("concept_id", allConceptIds);

  const masteryMap = new Map(
    (masteryRows || []).map((r) => [r.concept_id, Number(r.mastery_score)]),
  );

  const { data: rows, error: rowsError } = await client
    .from("problem_concepts")
    .select("problem_id, concept_id, problems!inner(id, status)")
    .in("concept_id", allConceptIds)
    .eq("is_primary", true)
    .eq("problems.status", "published");

  if (rowsError || !rows?.length) return null;

  const problemIds = rows.map((r) => r.problem_id);
  const { data: acceptedSubs } = await client
    .from("submissions")
    .select("problem_id")
    .eq("user_id", userId)
    .eq("execution_status", "accepted")
    .in("problem_id", problemIds);

  const solvedSet = new Set((acceptedSubs || []).map((s) => s.problem_id));

  const byConcept = new Map();
  for (const r of rows) {
    if (!byConcept.has(r.concept_id)) byConcept.set(r.concept_id, []);
    byConcept.get(r.concept_id).push(r.problem_id);
  }

  const conceptHasUnsolved = (conceptId) =>
    (byConcept.get(conceptId) || []).some((pid) => !solvedSet.has(pid));

  // Current active concept: the primary concept of the most recently
  // OPENED problem (coding_sessions, started_at desc) — same signal
  // selectNextProblem.js uses, for the same reason (see that file's
  // header comment for the full rationale).
  const { data: recentSession } = await client
    .from("coding_sessions")
    .select("problem_id")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let currentConceptId = null;
  if (recentSession?.problem_id) {
    const { data: link } = await client
      .from("problem_concepts")
      .select("concept_id")
      .eq("problem_id", recentSession.problem_id)
      .eq("is_primary", true)
      .maybeSingle();
    currentConceptId = link?.concept_id ?? null;
  }

  if (currentConceptId && conceptHasUnsolved(currentConceptId)) {
    const concept = allConcepts.find((c) => c.id === currentConceptId);
    if (concept) {
      return {
        conceptId: concept.id,
        slug: concept.slug,
        name: concept.name,
        masteryScore: masteryMap.has(concept.id)
          ? masteryMap.get(concept.id)
          : UNASSESSED_MASTERY_SCORE,
        stayedInCurrent: true,
      };
    }
  }

  const rotationCandidates = allConcepts
    .filter((c) => conceptHasUnsolved(c.id))
    .map((c) => ({
      ...c,
      masteryScore: masteryMap.has(c.id)
        ? masteryMap.get(c.id)
        : UNASSESSED_MASTERY_SCORE,
    }))
    .sort((a, b) => a.masteryScore - b.masteryScore);

  const chosen = rotationCandidates[0];
  if (!chosen) return null;

  return {
    conceptId: chosen.id,
    slug: chosen.slug,
    name: chosen.name,
    masteryScore: chosen.masteryScore,
    stayedInCurrent: false,
  };
}
