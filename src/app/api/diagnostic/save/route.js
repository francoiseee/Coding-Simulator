// src/app/api/diagnostic/save/route.js
// Step 15b — Autosave in-progress diagnostic answers so a student can leave
// and resume without losing progress.
//
// PATCH /api/diagnostic/save  — called on a debounce after each answer/nav change
// POST  /api/diagnostic/save  — called by navigator.sendBeacon() on page unload
//   (sendBeacon can only issue POST, so this route accepts both methods and
//   runs the exact same logic.)
//
// Body: { attemptId: number, answers: { [questionId]: optionKey }, lastQuestionIndex: number }
//
// Only ever touches a row the caller owns, and only while it's still
// in_progress — a completed/abandoned attempt is never overwritten.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function handleSave(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const { attemptId, answers, lastQuestionIndex } = body || {};

  if (
    !attemptId ||
    typeof answers !== "object" ||
    answers === null ||
    Array.isArray(answers) ||
    typeof lastQuestionIndex !== "number"
  ) {
    return NextResponse.json(
      {
        error:
          "attemptId, answers (object), and lastQuestionIndex (number) are required.",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // RLS restricts this update to rows the caller owns; the explicit filters
  // below are defense-in-depth and also make sure we never resurrect a
  // completed/abandoned attempt.
  const { error: updateError } = await supabase
    .from("diagnostic_attempts")
    .update({
      draft_answers: answers,
      last_question_index: lastQuestionIndex,
      last_saved_at: new Date().toISOString(),
    })
    .eq("id", attemptId)
    .eq("user_id", user.id)
    .eq("status", "in_progress");

  if (updateError) {
    return NextResponse.json(
      { error: "Could not save progress." },
      { status: 500 },
    );
  }

  return NextResponse.json({ saved: true });
}

export async function PATCH(request) {
  return handleSave(request);
}

// navigator.sendBeacon() always sends a POST — this is what the
// beforeunload flush in DiagnosticRunner actually hits.
export async function POST(request) {
  return handleSave(request);
}
