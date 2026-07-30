// src/lib/ai/evaluateReflectiveAnswer.js
// Phase 6, Step 34 — Evaluate a student's reflective answer with Claude.
//
// Sends: problem statement, student's code snapshot, the reflective question,
// and the student's answer. Returns a structured score + feedback, written
// server-side only (RLS blocks students from writing ai_score directly).
//
// Non-fatal philosophy: if this fails, the raw answer is already saved by the
// caller — a missing AI score must never block grading or the submit flow.

const MODEL_NAME = "claude-sonnet-4-6";
const PROMPT_VERSION = "v1";

const EVAL_JSON_SCHEMA_INSTRUCTIONS = `
Respond with ONLY valid JSON (no markdown fences, no prose before or after) matching exactly this shape:
{
  "score": number,                        // 1-5, how well the answer demonstrates genuine understanding (decimals allowed, e.g. 3.5)
  "feedback": string,                     // 1-3 sentences, direct and specific, addressed to the student
  "concepts_demonstrated": string[],      // concept names the answer shows real understanding of
  "concepts_misunderstood": string[]      // concept names the answer suggests confusion about (empty array if none)
}
`.trim();

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.admin - service-role client
 * @param {number} params.answerId - coding_question_answers.id, already saved
 * @returns {Promise<object>} the updated coding_question_answers row
 */
export async function evaluateReflectiveAnswer({ admin, answerId }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  // 1. Load the answer + its instance + the originating problem statement.
  // Verified join path: coding_question_instances.session_id -> coding_sessions.problem_id -> problems.statement
  const { data: answer, error: answerError } = await admin
    .from("coding_question_answers")
    .select(
      `
      id, answer_text, is_skipped,
      coding_question_instances (
        rendered_text, category, concept_id, code_snapshot,
        coding_sessions ( problem_id, problems ( statement ) )
      )
    `,
    )
    .eq("id", answerId)
    .single();

  if (answerError || !answer) {
    throw new Error("Could not load answer for evaluation.");
  }

  // A skipped answer isn't evaluable content — score it minimally without
  // calling Claude at all (saves a call, and there's nothing to assess).
  // eval_model / eval_prompt_version stay null here since no model was invoked.
  if (answer.is_skipped) {
    const { data: updated, error: updateError } = await admin
      .from("coding_question_answers")
      .update({
        ai_score: 1,
        ai_feedback: "Question was skipped.",
        concepts_demonstrated: [],
        concepts_misunderstood: [],
      })
      .eq("id", answerId)
      .select()
      .single();
    if (updateError) throw new Error("Failed to save skip evaluation.");
    return updated;
  }

  const instance = answer.coding_question_instances;
  const problemStatement =
    instance?.coding_sessions?.problems?.statement || "(unavailable)";

  // 2. Build the prompt.
  const userPrompt = `
Problem statement:
${problemStatement}

Student's code at the time of the question:
${instance?.code_snapshot || "(no code snapshot)"}

Reflective question asked:
${instance?.rendered_text || "(unknown question)"}

Student's answer:
${answer.answer_text}

Evaluate whether the student's answer demonstrates genuine understanding of
their own code and reasoning, not just correct terminology. Be specific about
which concepts the answer shows understanding of, and which it suggests
confusion about.

${EVAL_JSON_SCHEMA_INSTRUCTIONS}
`.trim();

  // 3. Call Claude.
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      max_tokens: 500,
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

  const cleaned = textBlock.text.replace(/^```json\s*|```$/g, "").trim();

  let structured;
  try {
    structured = JSON.parse(cleaned);
  } catch {
    throw new Error("Could not parse AI evaluation JSON.");
  }

  // Clamp score defensively — never trust the model's number blindly.
  // ai_score is numeric, so decimals are fine; just bound it to [1, 5].
  const score = Math.min(5, Math.max(1, Number(structured.score) || 1));

  // 4. Update the same row (admin client — RLS would otherwise block this).
  const { data: updated, error: updateError } = await admin
    .from("coding_question_answers")
    .update({
      ai_score: score,
      ai_feedback: structured.feedback || "",
      concepts_demonstrated: structured.concepts_demonstrated || [],
      concepts_misunderstood: structured.concepts_misunderstood || [],
      eval_model: MODEL_NAME,
      eval_prompt_version: PROMPT_VERSION,
    })
    .eq("id", answerId)
    .select()
    .single();

  if (updateError) {
    throw new Error("Failed to save AI evaluation.");
  }

  return updated;
}
