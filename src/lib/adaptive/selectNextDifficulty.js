// src/lib/adaptive/selectNextDifficulty.js
//
// Two safeguards for the live adaptive difficulty engine, built ahead of the
// engine itself (Steps 35-46) so they exist as tested, reusable functions the
// picker can call into once it's built — rather than being retrofitted after
// the fact. Both come directly from Mr. de Jesus's M0 review
// (Codely_Decision_ExpertSignOff_Aug2026.docx, Section 3.3):
//
//   Risk 1 — Over-challenging: M0 mis-predicts Medium for 47/111 Easy-profile
//   rows in the dry-run. Hitting a student with a too-hard problem on their
//   first real interactions risks cognitive overload before the adaptive
//   system has any cycles to self-correct.
//   Fix -> checkCircuitBreaker(): if a student is failing FAST and
//   REPEATEDLY on a problem harder than what they were last doing fine on,
//   step them down immediately — do not wait for the standard STRUGGLE rule
//   (score <50% OR attempts >=5; see ml/config.py) to trigger, because that
//   rule is designed to catch genuine struggle over a full attempt, not a
//   student who is already overwhelmed two tries in.
//
//   Risk 2 — Cold-start anchoring: prev_difficulty_ord is M0's strongest
//   predictor (38.8% importance) but is undefined for a student's very first
//   problem, which the rule-based system must assign alone. If that default
//   is anything but Easy, a weak-precision Medium prediction (0.36 precision
//   in the dry-run) can trap the student in an over-challenged state from
//   session one.
//   Fix -> selectInitialDifficulty(): a student with zero submissions ever
//   is, by definition, a cold start. Always Easy. No RF call, no exceptions.
//
// Both functions are pure with respect to their inputs (no side effects, no
// writes) so they can be unit-tested without a live database and dropped
// into the picker as a pre-check before any RF call.

// Keep in lockstep with ml/config.py's DIFFICULTY_ORDER — index position
// defines what "one step up/down" means on both the Python and JS sides.
export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];

// --- Circuit breaker tuning -------------------------------------------------
//
// These are deliberately much more sensitive than the STRUGGLE labeling rule
// (STRUGGLE_ATTEMPTS_MIN = 5 in ml/config.py). The labeling rule measures
// genuine struggle across a finished attempt, for RF training purposes. The
// circuit breaker exists to catch a DIFFERENT thing — a student who is
// already overwhelmed — early enough to intervene mid-session, before a
// slow, effortful 5th attempt would ever happen. If a student needed 5
// thoughtful attempts, that's normal struggle and the RF/STRUGGLE rule
// handles it. If a student submits twice in a row within minutes with no
// sign of revision, that's a different pattern and the circuit breaker is
// the fix for it.

// Non-"accepted" submissions this close together (in ms) count as "fast" —
// too close for the student to have meaningfully revised between attempts.
export const FAST_FAIL_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

// Consecutive fast fails required to trip the breaker.
export const FAST_FAIL_STREAK = 2;

// Statuses that count as a "fail" for this purpose. Anything that isn't a
// clean accept — compile errors and runtime errors are, if anything, a
// STRONGER overload signal than a wrong answer, so all non-accepted
// statuses are treated the same here.
const FAIL_STATUSES = new Set([
  "wrong_answer",
  "runtime_error",
  "compile_error",
  "time_limit_exceeded",
]);

function stepIndex(difficulty) {
  return DIFFICULTY_ORDER.indexOf(difficulty);
}

/**
 * Cold-start rule (Risk 2 fix).
 *
 * A student's very first problem has no prev_difficulty_ord and cannot be
 * assigned by the RF — only by this rule. Always Easy, regardless of
 * anything else about the student (diagnostic score, skill_level, etc.),
 * because the risk of over-challenging on interaction #1 outweighs any
 * efficiency gained by guessing higher.
 *
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.admin
 * @param {string} params.userId
 * @returns {Promise<{isColdStart: boolean, difficulty: string|null, reason: string}>}
 *   difficulty is 'easy' when isColdStart is true, otherwise null — a null
 *   result means the caller should proceed to its normal (RF or rule-based)
 *   selection path, this function has nothing to add.
 */
export async function selectInitialDifficulty({ admin, userId }) {
  const { count, error } = await admin
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    // Fail safe, not fail open: if we can't confirm submission history,
    // treat as cold start. Defaulting to Easy is the conservative direction
    // on both branches of this uncertainty, so there is no tension between
    // "fail safe" and "fail toward the documented fix."
    return {
      isColdStart: true,
      difficulty: "easy",
      reason:
        "Could not confirm submission history; defaulting conservatively to Easy.",
    };
  }

  if (!count || count === 0) {
    return {
      isColdStart: true,
      difficulty: "easy",
      reason:
        "Student has no prior submissions — first problem, no prev_difficulty_ord available. Cold-start rule applies.",
    };
  }

  return { isColdStart: false, difficulty: null, reason: "" };
}

/**
 * Circuit breaker (Risk 1 fix).
 *
 * Looks at the student's most recent submissions on their CURRENT problem
 * only (same problem_id) and checks for a fast, repeated fail streak on a
 * problem harder than the last difficulty they were doing fine on. If
 * tripped, the caller should step the student down immediately rather than
 * waiting for the RF or the standard STRUGGLE rule.
 *
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.admin
 * @param {string} params.userId
 * @param {number} params.problemId - the problem the student is currently on
 * @returns {Promise<{
 *   shouldStepDown: boolean,
 *   fromDifficulty: string|null,
 *   overrideDifficulty: string|null,
 *   consecutiveFastFails: number,
 *   reason: string,
 * }>}
 */
export async function checkCircuitBreaker({ admin, userId, problemId }) {
  // Current problem's difficulty, and the last-known "doing fine" difficulty
  // (the most recent ACCEPTED submission on a different, earlier problem).
  const { data: currentProblem, error: problemError } = await admin
    .from("problems")
    .select("id, difficulty")
    .eq("id", problemId)
    .maybeSingle();

  if (problemError || !currentProblem) {
    return noTrip("Could not load the current problem; breaker not evaluated.");
  }

  const { data: recent, error: subsError } = await admin
    .from("submissions")
    .select("problem_id, execution_status, graded_at, problems ( difficulty )")
    .eq("user_id", userId)
    .order("graded_at", { ascending: false })
    .limit(10);

  if (subsError || !recent?.length) {
    return noTrip("No submission history available; breaker not evaluated.");
  }

  // Fast-fail streak on the CURRENT problem, most recent first.
  const onCurrentProblem = recent.filter((s) => s.problem_id === problemId);

  let streak = 0;
  let prevTime = null;
  for (const s of onCurrentProblem) {
    if (!FAIL_STATUSES.has(s.execution_status)) break; // streak broken by any accept
    const t = new Date(s.graded_at).getTime();
    if (prevTime === null) {
      streak = 1;
    } else if (prevTime - t <= FAST_FAIL_WINDOW_MS) {
      streak += 1;
    } else {
      break; // gap too large — not a "fast" streak anymore
    }
    prevTime = t;
  }

  if (streak < FAST_FAIL_STREAK) {
    return noTrip(
      `Only ${streak} consecutive fast fail(s) on the current problem; below the ${FAST_FAIL_STREAK} threshold.`,
    );
  }

  // Only trips if the current problem is HARDER than the last difficulty the
  // student was doing fine on. If they're already at their known level (or
  // this is genuinely their level and they're just struggling normally),
  // this is not the over-challenging pattern the breaker exists for — let
  // the standard STRUGGLE rule handle it instead.
  const lastAccepted = recent.find(
    (s) => s.problem_id !== problemId && s.execution_status === "accepted",
  );

  if (!lastAccepted?.problems?.difficulty) {
    return noTrip(
      "No prior accepted submission on a different problem to compare against; breaker not evaluated.",
    );
  }

  const baselineIdx = stepIndex(lastAccepted.problems.difficulty);
  const currentIdx = stepIndex(currentProblem.difficulty);

  if (baselineIdx === -1 || currentIdx === -1 || currentIdx <= baselineIdx) {
    return noTrip(
      "Current problem is not harder than the student's last-known comfortable difficulty; breaker not evaluated.",
    );
  }

  const overrideDifficulty = DIFFICULTY_ORDER[currentIdx - 1];

  return {
    shouldStepDown: true,
    fromDifficulty: currentProblem.difficulty,
    overrideDifficulty,
    consecutiveFastFails: streak,
    reason:
      `${streak} consecutive fast fails (within ${FAST_FAIL_WINDOW_MS / 1000}s of each other) ` +
      `on a ${currentProblem.difficulty} problem, after last succeeding at ${lastAccepted.problems.difficulty}. ` +
      `Stepping down to ${overrideDifficulty} immediately rather than waiting for the standard STRUGGLE ` +
      `threshold (attempts >= 5) to be reached.`,
  };
}

function noTrip(reason) {
  return {
    shouldStepDown: false,
    fromDifficulty: null,
    overrideDifficulty: null,
    consecutiveFastFails: 0,
    reason,
  };
}
