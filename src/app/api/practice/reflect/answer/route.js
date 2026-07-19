// src/app/api/practice/reflect/answer/route.js
// Phase 6, Step 33 — Save a student's reflective answer.
//
// POST /api/practice/reflect/answer
// Body: {
//   instanceId: number,
//   answerText?: string,
//   isSkipped?: boolean,
//   timeToAnswerSeconds?: number
// }
//
// Why the cookie client (NOT service role):
//   coding_question_answers has own-row INSERT/UPDATE policies, both gated by
//   `ai_score IS NULL`. The student is *allowed* to write their own answer, so
//   RLS is the real enforcer here — the service role is deliberately NOT used,
//   which keeps the AI evaluation fields (ai_score, ai_feedback,
//   concepts_demonstrated, concepts_misunderstood) unreachable from this path.
//   Those are written only by the Step 34 server route.
//
// One answer per instance: coding_question_answers.instance_id is UNIQUE, so we
// upsert on it — re-answering updates in place rather than duplicating.
//
// Guard: if the answer was already AI-scored, the RLS `ai_score IS NULL` check
// blocks the update. We detect that and return a clean 409 instead of a raw
// database error.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const { instanceId, answerText, isSkipped, timeToAnswerSeconds } = body || {};

  if (!instanceId || Number.isNaN(Number(instanceId))) {
    return NextResponse.json(
      { error: "A valid instanceId is required." },
      { status: 400 },
    );
  }

  const skipped = isSkipped === true;

  // A non-skipped answer must have some text.
  if (!skipped && (typeof answerText !== "string" || !answerText.trim())) {
    return NextResponse.json(
      { error: "An answer is required unless the question is skipped." },
      { status: 400 },
    );
  }

  // 1. Auth via cookie client.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // 2. Verify the instance exists and belongs to this user (via its session).
  //    RLS on coding_question_instances (cqi_select_own) already restricts this
  //    read to instances the user owns, so a foreign instanceId returns null.
  const { data: instance, error: instanceError } = await supabase
    .from("coding_question_instances")
    .select("id, session_id")
    .eq("id", instanceId)
    .maybeSingle();

  if (instanceError) {
    console.error("Reflect answer: instance lookup failed:", instanceError.message);
    return NextResponse.json(
      { error: "Could not load the question." },
      { status: 500 },
    );
  }
  if (!instance) {
    // Either it doesn't exist or it isn't the user's — same opaque 404 either way.
    return NextResponse.json(
      { error: "Question not found." },
      { status: 404 },
    );
  }

  // 3. Build the row. Never include AI fields — RLS would reject them anyway.
  const now = new Date().toISOString();
  const row = {
    instance_id: instance.id,
    user_id: user.id,
    answer_text: skipped ? null : answerText.trim(),
    is_skipped: skipped,
    answered_at: now,
  };
  if (Number.isFinite(timeToAnswerSeconds)) {
    row.time_to_answer_seconds = Math.max(0, Math.floor(timeToAnswerSeconds));
  }

  // 4. Upsert on the unique instance_id. If a prior answer was already AI-scored,
  //    RLS blocks the update (ai_score IS NULL fails) -> treat as 409.
  const { data: saved, error: saveError } = await supabase
    .from("coding_question_answers")
    .upsert(row, { onConflict: "instance_id" })
    .select("id, instance_id, is_skipped, answered_at, time_to_answer_seconds")
    .maybeSingle();

  if (saveError) {
    // Postgres RLS violations surface with code 42501 / PGRST-style messages.
    const msg = (saveError.message || "").toLowerCase();
    const isRls =
      saveError.code === "42501" ||
      msg.includes("row-level security") ||
      msg.includes("violates row-level security");

    if (isRls) {
      return NextResponse.json(
        {
          error:
            "This answer has already been evaluated and can no longer be changed.",
        },
        { status: 409 },
      );
    }

    console.error("Reflect answer: save failed:", saveError.message);
    return NextResponse.json(
      { error: "Could not save your answer." },
      { status: 500 },
    );
  }

  return NextResponse.json({ answer: saved, saved: true });
}
