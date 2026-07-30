// src/lib/mastery/updateConceptMastery.js
// Step 19 — Update persistent concept mastery.
//
// `attempt_concept_results` records how a student did on ONE diagnostic
// attempt. `user_concept_mastery` records their CURRENT estimated skill per
// concept across all evidence gathered so far — diagnostics and practice.
//
// Blending strategy: recency-weighted exponential moving average (EMA).
//
//     new_mastery = (1 - alpha) * prior_mastery + alpha * new_evidence_score
//
// Rationale: Codely's premise is adaptive difficulty that tracks a student's
// CURRENT ability. A plain cumulative average would keep penalising a student
// for weak early attempts long after they had improved, which would feed stale
// features to the Random Forest difficulty classifier. EMA lets genuine
// improvement surface within a few sessions while still damping single-session
// noise. alpha is exposed as a constant so it can be tuned and reported.
//
// Non-fatal philosophy: mastery is derived data. If this fails, the attempt or
// submission that triggered it is already scored and saved — the caller must
// swallow the error rather than failing the student's request.

import { createAdminClient } from "@/lib/supabase/admin";

// Weight given to the newest piece of evidence. 0.4 means the latest result
// accounts for 40% of the updated score, prior history for 60%.
export const MASTERY_ALPHA = 0.4;

// Bump this whenever the blending formula changes, so historical rows remain
// interpretable and mixed-version data can be filtered during RF training.
export const MASTERY_ALGORITHM_VERSION = 1;

// Evidence count at which confidence is considered saturated.
const CONFIDENCE_SATURATION = 5;

function clampScore(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Confidence grows with the amount of evidence behind a mastery estimate.
 * One data point is weak evidence; five or more is treated as saturated.
 * Reported 0-1.
 */
function confidenceFor(evidenceCount) {
  return round2(Math.min(1, evidenceCount / CONFIDENCE_SATURATION));
}

/**
 * Core blend + upsert. Shared by both evidence sources.
 *
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.admin
 * @param {string} params.userId
 * @param {Array<{conceptId: number, score: number}>} params.evidence
 * @param {'diagnostic'|'practice'} params.source - decides which timestamp to touch
 * @returns {Promise<{updated: number}>}
 */
async function applyEvidence({ admin, userId, evidence, source }) {
  if (!evidence?.length) return { updated: 0 };

  const conceptIds = evidence.map((e) => e.conceptId);

  // Load any existing mastery rows for just these concepts.
  const { data: priorRows, error: priorError } = await admin
    .from("user_concept_mastery")
    .select("concept_id, mastery_score, evidence_count")
    .eq("user_id", userId)
    .in("concept_id", conceptIds);

  if (priorError) {
    throw new Error(`Could not load prior mastery: ${priorError.message}`);
  }

  const prior = new Map(
    (priorRows || []).map((r) => [
      r.concept_id,
      {
        masteryScore: Number(r.mastery_score) || 0,
        evidenceCount: Number(r.evidence_count) || 0,
      },
    ]),
  );

  const now = new Date().toISOString();

  const rows = evidence.map(({ conceptId, score }) => {
    const newScore = clampScore(score);
    const existing = prior.get(conceptId);

    // Cold start: the first piece of evidence IS the estimate — there is no
    // prior to blend against, and seeding from 0 would understate the student.
    const blended = existing
      ? (1 - MASTERY_ALPHA) * existing.masteryScore + MASTERY_ALPHA * newScore
      : newScore;

    const evidenceCount = (existing?.evidenceCount || 0) + 1;

    const row = {
      user_id: userId,
      concept_id: conceptId,
      mastery_score: round2(blended),
      confidence_score: confidenceFor(evidenceCount),
      evidence_count: evidenceCount,
      algorithm_version: MASTERY_ALGORITHM_VERSION,
      updated_at: now,
    };

    // Keep the two timestamps semantically distinct: `last_assessed_at` means
    // "last measured by a diagnostic", `last_practiced_at` means "last
    // exercised through coding practice". Only touch the relevant one so
    // neither is silently overwritten by the other kind of evidence.
    if (source === "diagnostic") {
      row.last_assessed_at = now;
    } else {
      row.last_practiced_at = now;
    }

    return row;
  });

  // Safe to target (user_id, concept_id) — there is a PLAIN unique index on
  // exactly those columns, not a partial one, so PostgREST will not throw 42P10.
  const { error: upsertError } = await admin
    .from("user_concept_mastery")
    .upsert(rows, { onConflict: "user_id,concept_id" });

  if (upsertError) {
    throw new Error(`Could not upsert mastery: ${upsertError.message}`);
  }

  return { updated: rows.length };
}

/**
 * Update mastery from a completed diagnostic attempt.
 * Reads the deterministic per-concept results the submit route just wrote.
 *
 * Concepts classified `insufficient_evidence` are skipped — a concept the
 * attempt barely touched should not move the student's standing estimate.
 */
export async function updateMasteryFromAttempt({
  admin = createAdminClient(),
  userId,
  attemptId,
}) {
  const { data: results, error } = await admin
    .from("attempt_concept_results")
    .select("concept_id, score_percentage, classification")
    .eq("attempt_id", attemptId);

  if (error) {
    throw new Error(`Could not load attempt concept results: ${error.message}`);
  }

  const evidence = (results || [])
    .filter((r) => r.classification !== "insufficient_evidence")
    .map((r) => ({
      conceptId: r.concept_id,
      score: r.score_percentage,
    }));

  return applyEvidence({ admin, userId, evidence, source: "diagnostic" });
}

/**
 * Update mastery from a graded coding submission.
 *
 * A problem may map to several concepts with different weights. The
 * submission's score is attributed to each linked concept, scaled by that
 * concept's weight — a concept tagged weight 0.5 on the problem receives a
 * proportionally weaker signal than the primary concept at 1.0.
 */
export async function updateMasteryFromSubmission({
  admin = createAdminClient(),
  userId,
  problemId,
  scorePercentage,
}) {
  const { data: links, error } = await admin
    .from("problem_concepts")
    .select("concept_id, weight")
    .eq("problem_id", problemId);

  if (error) {
    throw new Error(`Could not load problem concepts: ${error.message}`);
  }

  const base = clampScore(scorePercentage);

  const evidence = (links || []).map((l) => {
    const weight = Number(l.weight);
    const w = Number.isFinite(weight) ? Math.min(1, Math.max(0, weight)) : 1;
    // Scale toward the neutral midpoint rather than toward zero, so a
    // low-weight concept link nudges the estimate instead of dragging it down.
    return {
      conceptId: l.concept_id,
      score: 50 + (base - 50) * w,
    };
  });

  return applyEvidence({ admin, userId, evidence, source: "practice" });
}
