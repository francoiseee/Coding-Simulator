// src/lib/adaptive/selectNextProblem.js
//
// Given a target difficulty (from pickNextDifficulty), selects a SPECIFIC
// problem to serve. pickNextDifficulty answers "how hard" — this answers
// "which one." Two separate concerns, composed by the caller (see
// src/app/api/practice/next-problem/route.js).
//
// REDESIGN (Codely_Decision_WithinConceptScaffolding_Aug2026, 14 Aug 2026)
// ------------------------------------------------------------------------
// Previously, the RF's easy/medium/hard output filtered WHICH TOPIC to
// serve, because the V11 bank locks each of the 16 top-level concepts to
// exactly one difficulty tier (9 problems each: 5 easy, 6 medium, 5 hard
// topics). That meant "step down to Easy" couldn't give a struggling
// student an easier problem in the concept they were struggling with — it
// silently rerouted them to a DIFFERENT, easier-tier concept instead. A
// student struggling with Binary Trees never got scaffolded back into
// Binary Trees; they just stopped seeing it.
//
// This redesign decouples the two decisions:
//   - WHICH CONCEPT: continuity-based. Stay in the student's current active
//     concept until every problem in it is solved. Only rotate to a new
//     concept — by lowest mastery, same method as before — once the
//     current one is exhausted.
//   - HOW HARD WITHIN THAT CONCEPT: the RF's easy/medium/hard output now
//     selects a PROGRESSION BAND within the current concept instead of a
//     topic-level difficulty tier — easy -> introductory (1-3), medium ->
//     standard (4-6), hard -> advanced (7-9) — regardless of what tier the
//     concept itself carries in problems.difficulty. That tier stays fixed
//     and is irrelevant to this selection; only progression varies here.
//
// "Current active concept" is read from the student's most recent
// coding_sessions row (started_at desc) — the concept of whatever problem
// they most recently opened, which is a more direct signal of "what are
// they currently working on" than inferring it from submission/grading
// history.
//
// pickNextDifficulty.js is UNCHANGED by this redesign — it still just
// outputs an abstract easy/medium/hard signal with no assumption baked in
// about what that signal controls. Only this file's consumption of that
// signal changed.
//
// SELECTION STRATEGY
// -------------------
// 1. Determine the current active concept from the most recent
//    coding_sessions row. If that concept still has at least one unsolved
//    problem (in ANY band), stay there.
// 2. Otherwise (no session history yet, or the current concept is fully
//    solved), rotate to the concept with the LOWEST mastery_score among ALL
//    16 top-level concepts that still has at least one unsolved problem —
//    no longer filtered by difficulty tier, since concept choice and
//    difficulty are now fully decoupled.
// 3. Within the chosen concept, map the target difficulty to a progression
//    band and pick the lowest topic_position among that band's UNSOLVED
//    problems.
// 4. Edge case, decided explicitly rather than left implicit: if that
//    band has no unsolved problems left in this concept (e.g. a student
//    stuck at introductory with no lower band to fall to, but the concept
//    overall still has unsolved problems in other bands) — repeat the
//    lowest-topic_position problem WITHIN THAT SAME BAND rather than
//    drifting to an adjacent band or a different concept. Staying with the
//    struggling band is the point of this whole redesign.
// 5. Fallback if the chosen concept has literally zero problems tagged
//    with the target band at all (should not happen given the bank's fixed
//    3/3/3 structure per concept, but defensive): serve any unsolved
//    problem in the concept regardless of band.
// 6. Fallback if EVERY concept in the entire bank is fully solved: allow
//    repeats (spaced-repetition-ish) on the lowest-mastery concept rather
//    than dead-ending the session.
// 7. Fallback if the whole structured query fails for any reason: serve
//    any published problem at the target difficulty tier (topic-level,
//    degraded — band precision doesn't matter in this last-resort path).
//    A degraded pick beats no pick — this endpoint should never leave a
//    student with nothing to do.
//
// Unassessed concepts (no user_concept_mastery row yet) are treated as
// mastery_score = 40 — biased toward being picked over a concept with a
// genuinely-measured middling score, but not automatically ahead of a
// concept with a clearly low measured score. This is a heuristic, not a
// validated number; worth revisiting once real Group 1 usage data exists,
// same caveat as the circuit breaker's timing constants. Unchanged by this
// redesign.
const UNASSESSED_MASTERY_SCORE = 40;

// easy/medium/hard from pickNextDifficulty -> progression band within the
// chosen concept. This is the core mapping this redesign introduces.
const DIFFICULTY_TO_BAND = {
  easy: "introductory",
  medium: "standard",
  hard: "advanced",
};

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.admin
 * @param {string} params.userId
 * @param {string} params.difficulty  'easy'|'medium'|'hard' — maps to a
 *   progression band within the chosen concept (see DIFFICULTY_TO_BAND),
 *   NOT to which concept gets chosen.
 * @returns {Promise<{
 *   problem: {id: number, slug: string, title: string, progression: string, topicPosition: number},
 *   topic: {id: number, slug: string, name: string} | null,
 *   source: 'band_lowest_unsolved'|'band_repeat_fallback'|'band_missing_any_unsolved'
 *         | 'concept_repeat_fallback_all_solved'|'fallback_any_published',
 *   reason: string,
 * } | null>}
 *   null only in the catastrophic case where NO published problem exists at
 *   this difficulty tier at all — should not happen against the real V11 bank.
 */
export async function selectNextProblem({ admin, userId, difficulty }) {
  try {
    const structured = await selectStructured({ admin, userId, difficulty });
    if (structured) return structured;
  } catch (err) {
    console.error(
      "selectNextProblem: structured selection failed:",
      err.message,
    );
    // Fall through to the degraded fallback below.
  }

  return selectAnyFallback({ admin, difficulty });
}

/**
 * The concept of the student's most recently OPENED problem (coding_sessions,
 * started_at desc) — a direct signal of what they're currently working on,
 * independent of whether they've submitted yet.
 */
async function getCurrentActiveConceptId({ admin, userId }) {
  const { data: recentSession } = await admin
    .from("coding_sessions")
    .select("problem_id")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!recentSession?.problem_id) return null;

  const { data: link } = await admin
    .from("problem_concepts")
    .select("concept_id")
    .eq("problem_id", recentSession.problem_id)
    .eq("is_primary", true)
    .maybeSingle();

  return link?.concept_id ?? null;
}

async function selectStructured({ admin, userId, difficulty }) {
  const band = DIFFICULTY_TO_BAND[difficulty];
  if (!band) return null;

  // 1. ALL 16 top-level concepts — no longer filtered by difficulty tier,
  // since concept choice and difficulty are now fully decoupled.
  const { data: allConcepts, error: conceptsError } = await admin
    .from("concepts")
    .select("id, slug, name")
    .is("parent_id", null);

  if (conceptsError || !allConcepts?.length) return null;

  const allConceptIds = allConcepts.map((c) => c.id);

  // 2. This student's mastery on every concept.
  const { data: masteryRows } = await admin
    .from("user_concept_mastery")
    .select("concept_id, mastery_score")
    .eq("user_id", userId)
    .in("concept_id", allConceptIds);

  const masteryMap = new Map(
    (masteryRows || []).map((r) => [r.concept_id, Number(r.mastery_score)]),
  );

  // 3. Every published problem across ALL concepts, via each concept's
  // PRIMARY link (a problem can carry secondary concept tags too — only
  // the primary one determines which concept "owns" it for this purpose).
  const { data: rows, error: rowsError } = await admin
    .from("problem_concepts")
    .select(
      "problem_id, concept_id, problems!inner(id, slug, title, topic_position, progression, status)",
    )
    .in("concept_id", allConceptIds)
    .eq("is_primary", true)
    .eq("problems.status", "published");

  if (rowsError || !rows?.length) return null;

  // 4. This student's solved (accepted) problems among those.
  const problemIds = rows.map((r) => r.problem_id);
  const { data: acceptedSubs } = await admin
    .from("submissions")
    .select("problem_id")
    .eq("user_id", userId)
    .eq("execution_status", "accepted")
    .in("problem_id", problemIds);

  const solvedSet = new Set((acceptedSubs || []).map((s) => s.problem_id));

  // 5. Group by concept, sorted by topic_position within each.
  const byConcept = new Map();
  for (const r of rows) {
    if (!byConcept.has(r.concept_id)) byConcept.set(r.concept_id, []);
    byConcept.get(r.concept_id).push(r.problems);
  }
  for (const list of byConcept.values()) {
    list.sort((a, b) => (a.topic_position ?? 0) - (b.topic_position ?? 0));
  }

  const conceptHasUnsolved = (conceptId) =>
    (byConcept.get(conceptId) || []).some((p) => !solvedSet.has(p.id));

  // 6. Decide which concept: stay in the current one if it still has any
  // unsolved problem (in ANY band); otherwise rotate to lowest mastery.
  const currentConceptId = await getCurrentActiveConceptId({ admin, userId });

  let chosenConcept = null;
  let stayedInCurrent = false;

  if (currentConceptId && conceptHasUnsolved(currentConceptId)) {
    chosenConcept = allConcepts.find((c) => c.id === currentConceptId) || null;
    stayedInCurrent = true;
  }

  if (!chosenConcept) {
    const rotationCandidates = allConcepts
      .filter((c) => conceptHasUnsolved(c.id))
      .map((c) => ({
        ...c,
        masteryScore: masteryMap.has(c.id)
          ? masteryMap.get(c.id)
          : UNASSESSED_MASTERY_SCORE,
      }))
      .sort((a, b) => a.masteryScore - b.masteryScore);

    chosenConcept = rotationCandidates[0] || null;
  }

  // 7. Every concept in the entire bank is fully solved — repeat fallback
  // on the lowest-mastery concept overall rather than dead-ending.
  if (!chosenConcept) {
    const repeatCandidates = allConcepts
      .filter((c) => (byConcept.get(c.id) || []).length > 0)
      .map((c) => ({
        ...c,
        masteryScore: masteryMap.has(c.id)
          ? masteryMap.get(c.id)
          : UNASSESSED_MASTERY_SCORE,
      }))
      .sort((a, b) => a.masteryScore - b.masteryScore);

    const repeatConcept = repeatCandidates[0];
    if (!repeatConcept) return null;

    const pool = byConcept.get(repeatConcept.id) || [];
    const bandPool = pool.filter((p) => p.progression === band);
    const chosenProblem = (bandPool.length > 0 ? bandPool : pool)[0];
    if (!chosenProblem) return null;

    return buildResult({
      chosenProblem,
      chosenConcept: repeatConcept,
      source: "concept_repeat_fallback_all_solved",
      reason:
        `Every concept in the bank is fully solved — repeating lowest-mastery ` +
        `concept "${repeatConcept.name}" (mastery ${repeatConcept.masteryScore}), ` +
        `${band} band.`,
    });
  }

  const masteryScore = masteryMap.has(chosenConcept.id)
    ? masteryMap.get(chosenConcept.id)
    : UNASSESSED_MASTERY_SCORE;

  const pool = byConcept.get(chosenConcept.id) || [];
  const bandPool = pool.filter((p) => p.progression === band);
  const unsolvedInBand = bandPool.filter((p) => !solvedSet.has(p.id));

  const conceptNote = stayedInCurrent
    ? `staying in current concept "${chosenConcept.name}"`
    : `rotated to lowest-mastery concept "${chosenConcept.name}" (mastery ${masteryScore})`;

  // 8. Normal case: unsolved problem exists in the target band.
  if (unsolvedInBand.length > 0) {
    return buildResult({
      chosenProblem: unsolvedInBand[0],
      chosenConcept,
      source: "band_lowest_unsolved",
      reason: `${conceptNote}. Lowest-position unsolved problem in the ${band} band.`,
    });
  }

  // 9. Edge case: this band has no unsolved problems left in this concept
  // (e.g. stuck at introductory with nowhere lower to fall to), but the
  // concept overall still has unsolved problems elsewhere. Repeat within
  // the SAME band rather than drifting to a different band or concept.
  if (bandPool.length > 0) {
    return buildResult({
      chosenProblem: bandPool[0],
      chosenConcept,
      source: "band_repeat_fallback",
      reason:
        `${conceptNote}. The ${band} band is fully solved in this concept — ` +
        `repeating its lowest-position problem rather than leaving the band.`,
    });
  }

  // 10. Defensive: this concept has zero problems tagged with this band at
  // all (shouldn't happen given the bank's fixed 3/3/3 structure). Serve
  // any unsolved problem in the concept regardless of band.
  const anyUnsolved = pool.filter((p) => !solvedSet.has(p.id));
  if (anyUnsolved.length > 0) {
    return buildResult({
      chosenProblem: anyUnsolved[0],
      chosenConcept,
      source: "band_missing_any_unsolved",
      reason:
        `${conceptNote}. No problems tagged with the ${band} band in this ` +
        `concept — served the lowest-position unsolved problem regardless of band.`,
    });
  }

  return null;
}

function buildResult({ chosenProblem, chosenConcept, source, reason }) {
  return {
    problem: {
      id: chosenProblem.id,
      slug: chosenProblem.slug,
      title: chosenProblem.title,
      progression: chosenProblem.progression,
      topicPosition: chosenProblem.topic_position,
    },
    topic: {
      id: chosenConcept.id,
      slug: chosenConcept.slug,
      name: chosenConcept.name,
    },
    source,
    reason,
  };
}

async function selectAnyFallback({ admin, difficulty }) {
  const { data, error } = await admin
    .from("problems")
    .select("id, slug, title, progression, topic_position")
    .eq("difficulty", difficulty)
    .eq("status", "published")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    problem: {
      id: data.id,
      slug: data.slug,
      title: data.title,
      progression: data.progression,
      topicPosition: data.topic_position,
    },
    topic: null,
    source: "fallback_any_published",
    reason:
      "Structured concept/band selection failed; served the first published " +
      `problem at ${difficulty} difficulty as a degraded fallback.`,
  };
}
