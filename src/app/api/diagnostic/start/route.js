// src/app/api/diagnostic/start/route.js
// POST /api/diagnostic/start
// Starts (or resumes) a diagnostic attempt for the logged-in user.
// On resume, also returns draft_answers and last_question_index so the client
// can restore the student's in-progress state.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ASSESSMENT_SLUG = "codely-beginner-diagnostic";

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("id, version")
    .eq("slug", ASSESSMENT_SLUG)
    .eq("status", "published")
    .single();

  if (assessmentError || !assessment) {
    return NextResponse.json(
      { error: "Assessment not found" },
      { status: 404 },
    );
  }

  // Check for an existing in-progress attempt first so refreshing/double-clicking
  // "Start" doesn't create duplicate rows (RLS would allow the insert, but we
  // don't want orphaned attempts).
  // Include autosave columns so we can rehydrate the client on resume.
  const findExistingAttempt = () =>
    supabase
      .from("diagnostic_attempts")
      .select("id, draft_answers, last_question_index")
      .eq("user_id", user.id)
      .eq("assessment_id", assessment.id)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  const { data: existingAttempt, error: existingAttemptError } =
    await findExistingAttempt();

  if (existingAttemptError) {
    return NextResponse.json(
      { error: "Could not start the diagnostic. Please try again." },
      { status: 500 },
    );
  }

  if (existingAttempt) {
    return NextResponse.json({
      attemptId: existingAttempt.id,
      resumed: true,
      draftAnswers: existingAttempt.draft_answers ?? {},
      lastQuestionIndex: existingAttempt.last_question_index ?? 0,
    });
  }

  // RLS on diagnostic_attempts only allows INSERT when auth.uid() = user_id AND
  // status = 'in_progress', so user_id must come from the authenticated session
  // (never from client input) and status must be exactly 'in_progress'.
  const { data: newAttempt, error: insertError } = await supabase
    .from("diagnostic_attempts")
    .insert({
      user_id: user.id,
      assessment_id: assessment.id,
      assessment_version: assessment.version,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (insertError) {
    // A partial unique index on (user_id, assessment_id) where status =
    // 'in_progress' means a near-simultaneous request may have already
    // inserted the in-progress attempt. Treat that race as a resume rather
    // than an error.
    if (insertError.code === "23505") {
      const { data: raceWinner, error: raceLookupError } =
        await findExistingAttempt();

      if (!raceLookupError && raceWinner) {
        return NextResponse.json({
          attemptId: raceWinner.id,
          resumed: true,
          draftAnswers: raceWinner.draft_answers ?? {},
          lastQuestionIndex: raceWinner.last_question_index ?? 0,
        });
      }
    }

    return NextResponse.json(
      { error: "Could not start the diagnostic. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    attemptId: newAttempt.id,
    resumed: false,
    draftAnswers: {},
    lastQuestionIndex: 0,
  });
}
