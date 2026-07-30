// src/app/api/diagnostic/submit/route.js
// Step 16 — Save answers + server-side scoring.
// Phase 4 (Steps 21-23) — Also generates and saves an AI weakness report
// immediately after scoring, using the deterministic concept results as input.
//
// POST /api/diagnostic/submit
// Body: { attemptId: number, answers: { [questionId]: optionKey }, timeSpentSeconds?: number }
//
// Why service-role: the RLS design forbids the client from setting is_correct,
// updating diagnostic_attempts, inserting attempt_concept_results, or inserting
// ai_reports. Scoring AND report generation therefore run in a trusted server
// context. We STILL verify the user owns the attempt using their cookie session
// before doing any privileged writes.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDiagnosticReport } from "@/lib/ai/generateDiagnosticReport";
import { generatePracticeRecommendations } from "@/lib/practice/generatePracticeRecommendations";
import { updateMasteryFromAttempt } from "@/lib/mastery/updateConceptMastery";

const ASSESSMENT_SLUG = "codely-beginner-diagnostic";

// Map a concept's score % + evidence count to an allowed classification label.
function classify(scorePct, relevantCount) {
  if (relevantCount === 0) return "insufficient_evidence";
  if (scorePct >= 80) return "strong";
  if (scorePct >= 60) return "developing";
  if (scorePct >= 40) return "needs_practice";
  return "weak";
}

export async function POST(request) {
  // ---- 1. Parse + validate input ----
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const { attemptId, answers, timeSpentSeconds } = body || {};
  if (!attemptId || typeof answers !== "object" || answers === null) {
    return NextResponse.json(
      { error: "attemptId and answers are required." },
      { status: 400 },
    );
  }

  // ---- 2. Authenticate + verify ownership (cookie session, NOT service role) ----
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("diagnostic_attempts")
    .select("id, user_id, assessment_id, status")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.user_id !== user.id) {
    return NextResponse.json(
      { error: "This attempt does not belong to you." },
      { status: 403 },
    );
  }
  if (attempt.status === "completed") {
    return NextResponse.json(
      { error: "This attempt is already completed." },
      { status: 409 },
    );
  }

  // ---- 3. Privileged work begins (service role) ----
  const admin = createAdminClient();

  // Load full questions incl. answer key for this assessment.
  const { data: questions, error: qError } = await admin
    .from("diagnostic_questions")
    .select(
      "id, prompt, code_snippet, language, options, correct_config, difficulty, status",
    )
    .eq("assessment_id", attempt.assessment_id)
    .eq("status", "published");

  if (qError || !questions?.length) {
    return NextResponse.json(
      { error: "Could not load questions for scoring." },
      { status: 500 },
    );
  }

  // Concept links for per-concept aggregation.
  const questionIds = questions.map((q) => q.id);
  const { data: conceptLinks, error: clError } = await admin
    .from("diagnostic_question_concepts")
    .select("question_id, concept_id, weight, is_primary")
    .in("question_id", questionIds);

  if (clError) {
    return NextResponse.json(
      { error: "Could not load concept mappings." },
      { status: 500 },
    );
  }

  // ---- 4. Score each answered question ----
  let rawScore = 0;
  const answerRows = [];
  // conceptId -> { correct, incorrect, relevant }
  const conceptTally = new Map();

  for (const q of questions) {
    const selectedKey = answers[q.id] ?? answers[String(q.id)];
    if (selectedKey === undefined) continue; // unanswered — skip

    const correctKey = q.correct_config?.correct_key;
    const isCorrect = selectedKey === correctKey;
    if (isCorrect) rawScore += 1;

    // Build the required NOT NULL question_snapshot (freeze the safe question).
    const snapshot = {
      id: q.id,
      prompt: q.prompt,
      code_snippet: q.code_snippet,
      language: q.language,
      options: q.options,
      difficulty: q.difficulty,
    };

    answerRows.push({
      attempt_id: attemptId,
      question_id: q.id,
      question_snapshot: snapshot,
      selected_answer: { selected_key: selectedKey },
      is_correct: isCorrect,
    });

    // Tally per linked concept.
    const links = conceptLinks.filter((l) => l.question_id === q.id);
    for (const link of links) {
      const t = conceptTally.get(link.concept_id) || {
        correct: 0,
        incorrect: 0,
        relevant: 0,
      };
      t.relevant += 1;
      if (isCorrect) t.correct += 1;
      else t.incorrect += 1;
      conceptTally.set(link.concept_id, t);
    }
  }

  const answeredCount = answerRows.length;
  const scorePercentage =
    answeredCount > 0
      ? Math.round((rawScore / answeredCount) * 10000) / 100
      : 0;

  // ---- 5. Persist answers (upsert on unique (attempt_id, question_id)) ----
  const { error: ansError } = await admin
    .from("diagnostic_answers")
    .upsert(answerRows, { onConflict: "attempt_id,question_id" });

  if (ansError) {
    return NextResponse.json(
      { error: "Failed to save answers." },
      { status: 500 },
    );
  }

  // ---- 6. Persist per-concept results (upsert on unique (attempt_id, concept_id)) ----
  const conceptRows = [];
  for (const [conceptId, t] of conceptTally.entries()) {
    const pct =
      t.relevant > 0 ? Math.round((t.correct / t.relevant) * 10000) / 100 : 0;
    conceptRows.push({
      attempt_id: attemptId,
      concept_id: conceptId,
      correct_count: t.correct,
      incorrect_count: t.incorrect,
      questions_relevant: t.relevant,
      score_percentage: pct,
      classification: classify(pct, t.relevant),
    });
  }

  if (conceptRows.length > 0) {
    const { error: acrError } = await admin
      .from("attempt_concept_results")
      .upsert(conceptRows, { onConflict: "attempt_id,concept_id" });

    if (acrError) {
      return NextResponse.json(
        { error: "Failed to save concept results." },
        { status: 500 },
      );
    }
  }

  // ---- 7. Finalize the attempt ----
  const updatePayload = {
    raw_score: rawScore,
    score_percentage: scorePercentage,
    status: "completed",
    completed_at: new Date().toISOString(),
  };
  if (Number.isFinite(timeSpentSeconds)) {
    updatePayload.time_spent_seconds = Math.max(
      0,
      Math.floor(timeSpentSeconds),
    );
  }

  const { error: finalizeError } = await admin
    .from("diagnostic_attempts")
    .update(updatePayload)
    .eq("id", attemptId);

  if (finalizeError) {
    return NextResponse.json(
      { error: "Failed to finalize attempt." },
      { status: 500 },
    );
  }

  // Mark the student's onboarding as past the diagnostic. Non-fatal if it fails
  // (e.g. profile row missing) — the attempt itself is already scored and saved.
  await admin
    .from("profiles")
    .update({ onboarding_status: "diagnostic_done" })
    .eq("id", user.id)
    .eq("onboarding_status", "new"); // don't downgrade a user who is already 'active'

  // ---- 8. Generate + save the AI weakness report (Phase 4, Steps 21-23) ----
  // Non-fatal: the attempt is already fully scored and saved above. If the AI
  // call fails (bad key, network issue, rate limit), the student still gets
  // their real results — they just won't have a written report yet. The
  // results page (Step 24) handles a missing report gracefully.
  let aiReportGenerated = false;
  try {
    await generateDiagnosticReport({ admin, userId: user.id, attemptId });
    aiReportGenerated = true;
  } catch (err) {
    console.error("AI report generation failed:", err.message);
  }

  // ---- 8b. Generate practice recommendations from weak concepts (Phase 5) ----
  // Deterministic — matches weak/needs_practice concepts to problems already
  // tagged with that concept. Non-fatal: a missing recommendation batch just
  // means the dashboard has nothing to suggest yet, nothing else breaks.
  let practiceRecommendationCount = 0;
  try {
    const { count } = await generatePracticeRecommendations({
      admin,
      userId: user.id,
      attemptId,
    });
    practiceRecommendationCount = count;
  } catch (err) {
    console.error("Practice recommendation generation failed:", err.message);
  }

  // ---- 8c. Update persistent concept mastery (Step 19) ----
  // Non-fatal: mastery is derived data blended from attempt_concept_results,
  // which is already saved above. A failure here must not fail the request.
  let masteryUpdated = 0;
  try {
    const { updated } = await updateMasteryFromAttempt({
      admin,
      userId: user.id,
      attemptId,
    });
    masteryUpdated = updated;
  } catch (err) {
    console.error("Mastery update failed:", err.message);
  }

  // ---- 9. Return summary for the results page ----
  return NextResponse.json({
    attemptId,
    rawScore,
    answeredCount,
    scorePercentage,
    aiReportGenerated,
    practiceRecommendationCount,
    masteryUpdated,
    conceptResults: conceptRows
      .map((c) => ({
        conceptId: c.concept_id,
        scorePercentage: c.score_percentage,
        classification: c.classification,
        correct: c.correct_count,
        relevant: c.questions_relevant,
      }))
      .sort((a, b) => a.scorePercentage - b.scorePercentage),
  });
}
