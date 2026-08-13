// src/lib/adaptive/selectNextProblem.js
//
// Given a target difficulty (from pickNextDifficulty), selects a SPECIFIC
// problem to serve. pickNextDifficulty answers "how hard" — this answers
// "which one." Two separate concerns, composed by the caller (see
// src/app/api/practice/next-problem/route.js).
//
// TOPIC STRUCTURE (V11 question bank — see Main_Question_Bank_V11_corrected.md)
// ------------------------------------------------------------------------
// Each of the 16 top-level concepts (concepts.parent_id IS NULL) maps to
// EXACTLY ONE difficulty tier (concepts.category === problems.difficulty for
// every problem in that topic, 9 problems each: 5 easy, 6 medium, 5 hard
// topics). This means "pick a topic for this difficulty" is just filtering
// concepts by category — there's no cross-difficulty topic to worry about.
//
// SELECTION STRATEGY
// -------------------
// 1. Candidate topics = concepts at the target difficulty that still have at
//    least one problem this student hasn't solved (no accepted submission).
// 2. Among those, pick the topic with the LOWEST mastery_score — reusing
//    user_concept_mastery (src/lib/mastery/updateConceptMastery.js), the
//    same EMA-blended estimate the diagnostic recommendations already use.
//    Deliberately not recomputing mastery here; one source of truth.
// 3. Within the chosen topic, pick the lowest topic_position (1-9) among
//    that topic's unsolved problems — so a student progresses
//    introductory -> standard -> advanced within a topic in order, rather
//    than jumping straight to an advanced problem in a topic they've never
//    touched.
// 4. Fallback if EVERY topic at this difficulty is fully solved: allow
//    repeats (spaced-repetition-ish) rather than dead-ending the session —
//    pick the lowest-mastery topic again and serve its lowest-position
//    problem, even though it's already solved.
// 5. Fallback if the whole structured query fails for any reason: serve any
//    published problem at the target difficulty. A degraded pick beats no
//    pick — this endpoint should never leave a student with nothing to do.
//
// Unassessed topics (no user_concept_mastery row yet) are treated as
// mastery_score = 40 — biased toward being picked over a topic with a
// genuinely-measured middling score, but not automatically ahead of a
// topic with a clearly low measured score. This is a heuristic, not a
// validated number; worth revisiting once real Group 1 usage data exists,
// same caveat as the circuit breaker's timing constants.
const UNASSESSED_MASTERY_SCORE = 40;

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.admin
 * @param {string} params.userId
 * @param {string} params.difficulty  'easy'|'medium'|'hard'
 * @returns {Promise<{
 *   problem: {id: number, slug: string, title: string, progression: string, topicPosition: number},
 *   topic: {id: number, slug: string, name: string},
 *   source: 'weakest_topic_lowest_unsolved'|'repeat_fallback_all_solved'|'fallback_any_published',
 *   reason: string,
 * } | null>}
 *   null only in the catastrophic case where NO published problem exists at
 *   this difficulty at all — should not happen against the real V11 bank.
 */
export async function selectNextProblem({ admin, userId, difficulty }) {
  try {
    const structured = await selectStructured({ admin, userId, difficulty });
    if (structured) return structured;
  } catch (err) {
    console.error("selectNextProblem: structured selection failed:", err.message);
    // Fall through to the degraded fallback below.
  }

  return selectAnyFallback({ admin, difficulty });
}

async function selectStructured({ admin, userId, difficulty }) {
  // 1. Topics at this difficulty.
  const { data: topics, error: topicsError } = await admin
    .from("concepts")
    .select("id, slug, name")
    .is("parent_id", null)
    .eq("category", difficulty);

  if (topicsError || !topics?.length) return null;

  const topicIds = topics.map((t) => t.id);

  // 2. This student's mastery on those topics.
  const { data: masteryRows } = await admin
    .from("user_concept_mastery")
    .select("concept_id, mastery_score")
    .eq("user_id", userId)
    .in("concept_id", topicIds);

  const masteryMap = new Map(
    (masteryRows || []).map((r) => [r.concept_id, Number(r.mastery_score)]),
  );

  // 3. Every published problem in these topics, via each topic's PRIMARY
  // concept link (a problem can carry secondary concept tags too — only the
  // primary one determines which topic "owns" it for this purpose).
  const { data: rows, error: rowsError } = await admin
    .from("problem_concepts")
    .select("problem_id, concept_id, problems!inner(id, slug, title, topic_position, progression, status)")
    .in("concept_id", topicIds)
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

  // 5. Group by topic, sorted by topic_position within each.
  const byTopic = new Map();
  for (const r of rows) {
    if (!byTopic.has(r.concept_id)) byTopic.set(r.concept_id, []);
    byTopic.get(r.concept_id).push(r.problems);
  }
  for (const list of byTopic.values()) {
    list.sort((a, b) => (a.topic_position ?? 0) - (b.topic_position ?? 0));
  }

  // 6. Candidates: topics with at least one unsolved problem.
  let candidates = topics
    .map((t) => ({
      ...t,
      pool: (byTopic.get(t.id) || []).filter((p) => !solvedSet.has(p.id)),
      masteryScore: masteryMap.has(t.id) ? masteryMap.get(t.id) : UNASSESSED_MASTERY_SCORE,
    }))
    .filter((t) => t.pool.length > 0);

  let source = "weakest_topic_lowest_unsolved";

  if (candidates.length === 0) {
    // Every topic at this difficulty is fully solved — allow repeats rather
    // than leaving the student with nothing.
    source = "repeat_fallback_all_solved";
    candidates = topics
      .map((t) => ({
        ...t,
        pool: byTopic.get(t.id) || [],
        masteryScore: masteryMap.has(t.id) ? masteryMap.get(t.id) : UNASSESSED_MASTERY_SCORE,
      }))
      .filter((t) => t.pool.length > 0);
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.masteryScore - b.masteryScore);
  const chosenTopic = candidates[0];
  const chosenProblem = chosenTopic.pool[0];

  return {
    problem: {
      id: chosenProblem.id,
      slug: chosenProblem.slug,
      title: chosenProblem.title,
      progression: chosenProblem.progression,
      topicPosition: chosenProblem.topic_position,
    },
    topic: { id: chosenTopic.id, slug: chosenTopic.slug, name: chosenTopic.name },
    source,
    reason:
      source === "weakest_topic_lowest_unsolved"
        ? `Weakest ${difficulty} topic with unsolved problems: "${chosenTopic.name}" ` +
          `(mastery ${chosenTopic.masteryScore}). Lowest-position unsolved problem in that topic.`
        : `All ${difficulty} topics fully solved — repeating weakest topic ` +
          `"${chosenTopic.name}" (mastery ${chosenTopic.masteryScore}).`,
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
      "Structured topic/mastery selection failed; served the first published " +
      `problem at ${difficulty} difficulty as a degraded fallback.`,
  };
}
