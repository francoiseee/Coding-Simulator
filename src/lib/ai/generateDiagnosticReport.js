// src/lib/ai/generateDiagnosticReport.js
// Phase 4, Steps 22-23 — Turns a completed diagnostic attempt's deterministic
// scoring (attempt_concept_results) into a beginner-friendly written report,
// and saves it to ai_reports (append-only — never overwrites a prior report).
//
// IMPORTANT: the AI does not decide whether a student is weak. classification
// and score_percentage are already computed deterministically in the submit
// route (Step 16) before this ever runs. The AI's only job here is to EXPLAIN
// that existing data in plain language — strengths, weaknesses, likely causes,
// and a recommended study order. If this call fails, the diagnostic attempt
// itself is already safely scored and saved; a missing report is not fatal.
//
// This must only ever be called with the service-role admin client, since
// ai_reports has no INSERT policy for the `authenticated` role by design —
// students cannot write their own AI reports, only trusted server code can.

// NOTE: verify this model string against https://docs.claude.com before
// shipping — model identifiers change over time and this project's
// Anthropic API usage should track current docs, not this comment.
const MODEL_NAME = "claude-sonnet-4-6";
const MODEL_PROVIDER = "anthropic";
const PROMPT_VERSION = "v1";

const REPORT_JSON_SCHEMA_INSTRUCTIONS = `
Respond with ONLY valid JSON (no markdown fences, no prose before or after) matching exactly this shape:
{
  "narrative": string,        // 3-5 sentence beginner-friendly paragraph summarizing the whole report, in the style of: "You have a good understanding of variables and simple conditionals. However, you struggled with arrays and recursion..."
  "strengths": string[],      // concept names the student is strong or developing in
  "weaknesses": string[],     // concept names the student is weak or needs practice in
  "why_struggling": string,   // 1-3 sentences on likely root causes, grounded in the specific evidence given
  "study_order": string[],    // concept names in the recommended order to study next, weakest/most foundational first
  "practice_plan": string,    // 1-2 sentences describing a concrete next action
  "encouragement": string     // 1 short encouraging sentence, genuine and specific, not generic praise
}
`.trim();

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.admin - service-role client
 * @param {string} params.userId
 * @param {number} params.attemptId
 * @returns {Promise<object>} the saved ai_reports row
 */
export async function generateDiagnosticReport({ admin, userId, attemptId }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  // 1. Attempt summary.
  const { data: attempt, error: attemptError } = await admin
    .from("diagnostic_attempts")
    .select("id, raw_score, score_percentage")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt) {
    throw new Error("Could not load attempt for report generation.");
  }

  // 2. Per-concept results with real concept names, weakest first.
  const { data: conceptRows, error: conceptError } = await admin
    .from("attempt_concept_results")
    .select(
      `
      concept_id,
      correct_count,
      incorrect_count,
      questions_relevant,
      score_percentage,
      classification,
      concepts ( name, category )
    `,
    )
    .eq("attempt_id", attemptId)
    .order("score_percentage", { ascending: true });

  if (conceptError) {
    throw new Error("Could not load concept results for report generation.");
  }

  // 3. Specific evidence — a handful of the actual missed questions, so the
  // report can reference concrete mistakes rather than only percentages.
  const { data: incorrectAnswers, error: answersError } = await admin
    .from("diagnostic_answers")
    .select("question_snapshot")
    .eq("attempt_id", attemptId)
    .eq("is_correct", false)
    .limit(8);

  if (answersError) {
    throw new Error("Could not load answer evidence for report generation.");
  }

  // 4. Build the structured prompt per the doc's format.
  const correctLines = conceptRows
    .filter((c) => c.correct_count > 0)
    .map(
      (c) =>
        `- ${c.concepts?.name}: ${c.correct_count}/${c.questions_relevant} correct (${c.score_percentage}%)`,
    )
    .join("\n");

  const incorrectLines = conceptRows
    .filter((c) => c.incorrect_count > 0)
    .map(
      (c) =>
        `- ${c.concepts?.name}: missed ${c.incorrect_count}/${c.questions_relevant} (${c.score_percentage}% correct)`,
    )
    .join("\n");

  const evidenceLines = incorrectAnswers
    .map((a) => a.question_snapshot?.prompt)
    .filter(Boolean)
    .map((prompt) => `- Missed question: "${prompt}"`)
    .join("\n");

  const userPrompt = `
Student completed a diagnostic test. Overall score: ${attempt.score_percentage}%.

Correct answers by concept:
${correctLines || "(none)"}

Incorrect answers by concept:
${incorrectLines || "(none)"}

Specific evidence (individual missed questions):
${evidenceLines || "(no specific evidence available)"}

Please create a beginner-friendly weakness report explaining:
1. What the student is good at.
2. What concepts they are weak at.
3. Why they may be struggling.
4. What they should practice next.
5. Recommended order of practice.

${REPORT_JSON_SCHEMA_INSTRUCTIONS}
`.trim();

  // 5. Call Claude.
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      max_tokens: 1200,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Anthropic API error (${response.status}): ${errText.slice(0, 300)}`,
    );
  }

  const data = await response.json();
  const textBlock = data.content?.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("Anthropic response contained no text content.");
  }

  // Strip markdown fences defensively in case the model adds them anyway.
  const cleaned = textBlock.text.replace(/^```json\s*|```$/g, "").trim();

  let structured;
  try {
    structured = JSON.parse(cleaned);
  } catch {
    throw new Error("Could not parse AI report JSON.");
  }

  // 6. Save — append-only insert, never overwrite a prior report.
  const { data: savedReport, error: saveError } = await admin
    .from("ai_reports")
    .insert({
      user_id: userId,
      source_type: "diagnostic_attempt",
      source_id: attemptId,
      report_type: "weakness_report",
      generated_text: structured.narrative || "",
      structured_output: structured,
      model_provider: MODEL_PROVIDER,
      model_name: MODEL_NAME,
      prompt_version: PROMPT_VERSION,
      status: "generated",
    })
    .select()
    .single();

  if (saveError) {
    throw new Error("Failed to save AI report.");
  }

  return savedReport;
}
