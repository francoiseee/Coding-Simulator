// src/lib/practice/generatePracticeRecommendations.js
// Phase 5 — After a diagnostic is scored, turn concept results into concrete,
// assignable problem recommendations.
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
// ALL four classifications now receive recommendations.
//
// The diagnostic only tests theoretical/conceptual knowledge — MCQ cannot
// measure coding ability. A student who scores 100% on every concept has
// proven theoretical mastery only. They still need to demonstrate they can
// write code. Accordingly, strong concepts receive recommendations too, but
// are deliberately served harder problems (highest progression, hard
// difficulty preferred) to challenge practical skill, not just reinforce
// theory.
//
// Weakest-first ordering means strong concepts rank at the tail of the batch
// and never displace genuinely weak concepts.
//
// ---------------------------------------------------------------------------
// Problem selection by classification
// ---------------------------------------------------------------------------
// Rather than hard WHERE clauses (which break if no hard problem exists for a
// concept), a ranking function scores each candidate by how well it matches
// the preferred progression and difficulty for the student's classification.
// The best-matching problems win.
//
//   weak           → introductory progression, easy difficulty (build foundation)
//   needs_practice → standard progression, any difficulty (reinforce concept)
//   developing     → standard/advanced progression, medium+ difficulty
//   strong         → advanced progression, hard difficulty (prove it in code)
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
  strong: 1,
};

// How many of the lowest-scoring strong concepts to draw from when nothing
// is below `strong`. (Edge case: shouldn't happen now that strong is included,
// but retained as a guard if all concepts are insufficient_evidence.)
const ALL_STRONG_FALLBACK_COUNT = 3;
const PROBLEMS_PER_FALLBACK_CONCEPT = 1;

// Ceiling on a single batch, so a broadly weak student isn't handed an
// unusable wall of 20+ problems.
const MAX_RECOMMENDATIONS_PER_BATCH = 10;

// Pool size when fetching candidates to rank — must be larger than
// PROBLEMS_PER_CONCEPT so the ranking function has real choices.
const CANDIDATE_POOL_SIZE = 20;

const TARGETED_CLASSIFICATIONS = [
  "weak",
  "needs_practice",
  "developing",
  "strong",
];

// ---------------------------------------------------------------------------
// Selection strategy per classification
// ---------------------------------------------------------------------------
// progressionOrder: preferred progression values, most-preferred first.
// difficultyOrder:  preferred difficulty values, most-preferred first.
// Ranking uses these to score each candidate; the best-fitting problems win.

const SELECTION_STRATEGY = {
  weak: {
    progressionOrder: ["introductory", "standard", "advanced"],
    difficultyOrder: ["easy", "medium", "hard"],
  },
  needs_practice: {
    progressionOrder: ["standard", "introductory", "advanced"],
    difficultyOrder: ["easy", "medium", "hard"],
  },
  developing: {
    progressionOrder: ["standard", "advanced", "introductory"],
    difficultyOrder: ["medium", "hard", "easy"],
  },
  strong: {
    progressionOrder: ["advanced", "standard", "introductory"],
    difficultyOrder: ["hard", "medium", "easy"],
  },
};

function rankProblem(problem, strategy) {
  const progIdx = strategy.progressionOrder.indexOf(
    problem.progression ?? "standard",
  );
  const diffIdx = strategy.difficultyOrder.indexOf(
    problem.difficulty ?? "medium",
  );
  // Lower index = more preferred. Negate so higher rank = better.
  // Progression preference outweighs difficulty (×10).
  const progScore =
    progIdx === -1 ? -strategy.progressionOrder.length : -progIdx;
  const diffScore =
    diffIdx === -1 ? -strategy.difficultyOrder.length : -diffIdx;
  return progScore * 10 + diffScore;
}

function reasonFor(classification, scorePercentage) {
  const pct = `${scorePercentage}%`;
  switch (classification) {
    case "weak":
      return `You scored ${pct} on this concept in your diagnostic — this is your biggest gap, so practicing it has the most impact right now.`;
    case "needs_practice":
      return `You scored ${pct} on this concept in your diagnostic — targeted practice here should close the gap quickly.`;
    case "developing":
      return `You scored ${pct} on this concept — the fundamentals are there, and practice will help you apply them under interview conditions.`;
    case "strong":
      return `You scored ${pct} on this concept theoretically — now prove it in code. A strong MCQ score doesn't guarantee coding ability, so we're giving you a harder problem to challenge you.`;
    default:
      return `You scored ${pct} on this concept — this problem keeps it sharp.`;
  }
}

/**
 * Fetch published candidate problems tagged with a concept, including
 * difficulty and progression for ranking. If the concept has no problems of
 * its own (typical for sub-concepts), fall back to its parent's problems.
 */
async function loadProblemsForConcept({ admin, conceptId, strategy }) {
  async function fetchFor(id) {
    const { data, error } = await admin
      .from("problem_concepts")
      .select(
        "problem_id, is_primary, problems ( id, title, status, difficulty, progression )",
      )
      .eq("concept_id", id)
      .limit(CANDIDATE_POOL_SIZE);

    if (error) {
      throw new Error("Could not load problems for a concept.");
    }

    return (data || []).filter((r) => r.problems?.status === "published");
  }

  const direct = await fetchFor(conceptId);
  const pool =
    direct.length > 0
      ? direct
      : await (async () => {
          // No problems tagged directly — inherit from the parent concept, if any.
          const { data: conceptRow, error: conceptRowError } = await admin
            .from("concepts")
            .select("parent_id")
            .eq("id", conceptId)
            .maybeSingle();

          if (conceptRowError || !conceptRow?.parent_id) return [];
          return fetchFor(conceptRow.parent_id);
        })();

  // Rank by strategy fit. is_primary acts as a tiebreaker (primary tag = slight boost).
  return pool.sort((a, b) => {
    const rankDiff =
      rankProblem(b.problems, strategy) - rankProblem(a.problems, strategy);
    if (rankDiff !== 0) return rankDiff;
    return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
  });
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
  // Load ALL concept results, weakest first. Strong concepts sort to the tail
  // naturally, so weak ones always get lower priority numbers (= higher urgency
  // in the dashboard display).
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

  // Fallback: if somehow everything is insufficient_evidence, draw from the
  // lowest-scoring usable concepts. In practice this path is rare — it only
  // fires if TARGETED_CLASSIFICATIONS doesn't cover a returned label.
  const isFallback = targeted.length === 0;
  const workingSet = isFallback
    ? usable.slice(0, ALL_STRONG_FALLBACK_COUNT)
    : targeted;

  // Drop any concept whose parent also qualifies — see "Parent takes
  // precedence" above. Applied after the fallback branch so it covers both
  // paths.
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

    const strategy =
      SELECTION_STRATEGY[concept.classification] ??
      SELECTION_STRATEGY.developing; // safe default for any unknown label

    const limit = isFallback
      ? PROBLEMS_PER_FALLBACK_CONCEPT
      : (PROBLEMS_PER_CONCEPT[concept.classification] ?? 1);

    const ranked = await loadProblemsForConcept({
      admin,
      conceptId: concept.concept_id,
      strategy,
    });

    let taken = 0;
    for (const p of ranked) {
      if (rows.length >= MAX_RECOMMENDATIONS_PER_BATCH) break;
      if (taken >= limit) break;
      // A problem tagged with several concepts could appear twice in one batch.
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
      taken++;
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
