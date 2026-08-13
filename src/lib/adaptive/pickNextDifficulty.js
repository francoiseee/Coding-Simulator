// src/lib/adaptive/pickNextDifficulty.js
//
// The live adaptive picker: decides what difficulty a student's next problem
// should be. Composes three things, in order, each one a hard stop before
// the next is even considered:
//
//   1. selectInitialDifficulty()  — cold start (Risk 2). Zero submissions
//      ever -> Easy, no RF call, no exceptions.
//   2. checkCircuitBreaker()      — over-challenging (Risk 1). A fast, real
//      fail streak on the student's CURRENT active problem -> step down
//      immediately, no RF call.
//   3. The RF model (via rfClient) — the general case. Builds features from
//      the student's most recent completed problem, gets a procedural
//      complexity bucket from the SAME estimator training used
//      (ml/complexity.py, via the inference service — never reimplemented
//      here), and asks the trained model.
//
// FAIL-SAFE PHILOSOPHY: every failure path in this module returns Easy, not
// an error. A missing history row, an unreachable RF service, unparseable
// code — none of these should ever surface as a 500 to a student waiting for
// their next problem. Easy is the same conservative default the cold-start
// rule itself uses, for the same reason: the cost of a wrongly-easy problem
// is boredom; the cost of a wrongly-hard one, per Mr. de Jesus's review, is
// early over-challenging. See Codely_Decision_ExpertSignOff_Aug2026.docx.

import { DIFFICULTY_ORDER, selectInitialDifficulty, checkCircuitBreaker } from "./selectNextDifficulty";
import { getComplexityScore, predictDifficulty } from "./rfClient";

const DIFF_TO_ORD = Object.fromEntries(DIFFICULTY_ORDER.map((d, i) => [d, i]));

// How many recent submissions to scan to establish the student's last two
// distinct problems, by recency. 50 comfortably covers even a student who
// submitted many times on their most recent problem (the STRUGGLE labeling
// rule triggers at just 5 attempts) while staying a cheap, bounded query.
const HISTORY_SCAN_LIMIT = 50;

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.admin
 * @param {string} params.userId
 * @returns {Promise<{
 *   difficulty: string,
 *   source: 'cold_start_rule'|'circuit_breaker'|'rf_model'|'fallback_no_history'|'fallback_unparseable_code'|'fallback_rf_unreachable'|'fallback_unexpected_error',
 *   reason: string,
 *   warning?: string|null,
 * }>}
 */
export async function pickNextDifficulty({ admin, userId }) {
  try {
    // ---- 1. Cold start ----
    const coldStart = await selectInitialDifficulty({ admin, userId });
    if (coldStart.isColdStart) {
      return {
        difficulty: coldStart.difficulty,
        source: "cold_start_rule",
        reason: coldStart.reason,
      };
    }

    // ---- 2. Circuit breaker on any currently active session ----
    const { data: activeSession } = await admin
      .from("coding_sessions")
      .select("id, problem_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("last_active_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSession) {
      const breaker = await checkCircuitBreaker({
        admin,
        userId,
        problemId: activeSession.problem_id,
      });
      if (breaker.shouldStepDown) {
        return {
          difficulty: breaker.overrideDifficulty,
          source: "circuit_breaker",
          reason: breaker.reason,
        };
      }
    }

    // ---- 3. RF model, using the student's recent completed history ----
    const features = await buildFeaturesFromHistory({ admin, userId });
    if (!features) {
      return {
        difficulty: "easy",
        source: "fallback_no_history",
        reason:
          "Student has submissions but no resolvable recent completed problem " +
          "(unexpected data state) — defaulting conservatively to Easy.",
      };
    }

    let complexityScore;
    try {
      const c = await getComplexityScore(features.sourceCode);
      if (!c.parsedOk) {
        return {
          difficulty: "easy",
          source: "fallback_unparseable_code",
          reason: c.warning || "Source code could not be parsed for complexity.",
        };
      }
      complexityScore = c.complexityScore;
    } catch (err) {
      console.error("pickNextDifficulty: /complexity call failed:", err.message);
      return {
        difficulty: "easy",
        source: "fallback_rf_unreachable",
        reason: `Complexity service unreachable: ${err.message}`,
      };
    }

    try {
      const pred = await predictDifficulty({
        correctnessRate: features.correctnessRate,
        runtimeMs: features.runtimeMs,
        attempts: features.attempts,
        complexityScore,
        prevDifficultyOrd: features.prevDifficultyOrd,
      });
      return {
        difficulty: pred.difficulty,
        source: "rf_model",
        reason: `RF predicted ${pred.difficulty} with probabilities ${JSON.stringify(pred.probabilities)}.`,
        warning: pred.warning,
      };
    } catch (err) {
      console.error("pickNextDifficulty: /predict call failed:", err.message);
      return {
        difficulty: "easy",
        source: "fallback_rf_unreachable",
        reason: `Prediction service unreachable: ${err.message}`,
      };
    }
  } catch (err) {
    // Catch-all: anything not already handled above (e.g. an unexpected
    // Supabase error in step 1 or 2) still returns Easy rather than
    // throwing, per this module's fail-safe philosophy stated at the top.
    console.error("pickNextDifficulty: unexpected error:", err.message);
    return {
      difficulty: "easy",
      source: "fallback_unexpected_error",
      reason: "An unexpected error occurred; defaulting conservatively to Easy.",
    };
  }
}

/**
 * Build the 5-feature input for the RF model from the student's most recent
 * completed problem, mirroring ml/export.py's collapsing rules exactly:
 *   correctness_rate : MAX score_percentage across that problem's submissions
 *   runtime_ms        : runtime of the BEST-SCORING submission
 *   attempts          : COUNT of submissions for that problem
 *   prev_difficulty   : difficulty of the problem before THAT one (-1 if none)
 * complexity_score is NOT computed here — the caller gets it from the RF
 * service's /complexity endpoint, from this function's returned sourceCode.
 */
async function buildFeaturesFromHistory({ admin, userId }) {
  const { data: recent, error } = await admin
    .from("submissions")
    .select("problem_id, submitted_at")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .limit(HISTORY_SCAN_LIMIT);

  if (error || !recent?.length) return null;

  // Distinct problem_ids in recency order (first occurrence in the
  // already-DESC-ordered list wins).
  const seen = [];
  const seenSet = new Set();
  for (const row of recent) {
    if (!seenSet.has(row.problem_id)) {
      seenSet.add(row.problem_id);
      seen.push(row.problem_id);
    }
    if (seen.length >= 2) break;
  }
  if (seen.length === 0) return null;

  const [mostRecentProblemId, prevProblemId] = seen;

  const { data: subs, error: subsError } = await admin
    .from("submissions")
    .select("score_percentage, runtime_ms, source_code")
    .eq("user_id", userId)
    .eq("problem_id", mostRecentProblemId);

  if (subsError || !subs?.length) return null;

  const attempts = subs.length;
  const best = subs.reduce((a, b) =>
    (b.score_percentage ?? -1) > (a.score_percentage ?? -1) ? b : a,
  );

  let prevDifficultyOrd = -1;
  if (prevProblemId) {
    const { data: prevProblem } = await admin
      .from("problems")
      .select("difficulty")
      .eq("id", prevProblemId)
      .maybeSingle();
    if (prevProblem?.difficulty && prevProblem.difficulty in DIFF_TO_ORD) {
      prevDifficultyOrd = DIFF_TO_ORD[prevProblem.difficulty];
    }
  }

  return {
    correctnessRate: best.score_percentage ?? 0,
    // A submission with no runtime (e.g. compile error, never ran any test)
    // falls back to 0 rather than null — the RF service requires a number,
    // and 0 is the conservative direction (understates cost) rather than
    // guessing a plausible-but-fake runtime.
    runtimeMs: best.runtime_ms ?? 0,
    attempts,
    sourceCode: best.source_code,
    prevDifficultyOrd,
  };
}
