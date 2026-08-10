// src/app/api/diagnostic/save/route.js
// PATCH /api/diagnostic/save
// Autosave draft answers + current question index for an in-progress diagnostic attempt.
// Uses the cookie client (student-authored write; RLS enforces ownership + in_progress status).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { attemptId, answers, lastQuestionIndex } = body;

  if (!attemptId) {
    return NextResponse.json(
      { error: "attemptId is required." },
      { status: 400 },
    );
  }

  // Validate ownership + status before writing. RLS also enforces this, but an
  // explicit check gives a clearer error message than a generic RLS rejection.
  const { data: attempt, error: lookupError } = await supabase
    .from("diagnostic_attempts")
    .select("id, user_id, status")
    .eq("id", attemptId)
    .maybeSingle();

  if (lookupError || !attempt) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (attempt.status !== "in_progress") {
    // Attempt already completed or abandoned — silently succeed so the client
    // doesn't surface an error banner when the submit and a trailing autosave
    // land out of order.
    return NextResponse.json({
      saved: false,
      reason: "attempt_not_in_progress",
    });
  }

  const updatePayload = {
    draft_answers: answers ?? {},
    last_saved_at: new Date().toISOString(),
  };

  if (typeof lastQuestionIndex === "number" && lastQuestionIndex >= 0) {
    updatePayload.last_question_index = lastQuestionIndex;
  }

  const { error: updateError } = await supabase
    .from("diagnostic_attempts")
    .update(updatePayload)
    .eq("id", attemptId);

  if (updateError) {
    console.error("Diagnostic autosave failed:", updateError.message);
    return NextResponse.json(
      { error: "Could not save progress." },
      { status: 500 },
    );
  }

  return NextResponse.json({ saved: true });
}
