// src/app/api/practice/recommendation/route.js
// Phase 5 (follow-up) — Update the status of a practice recommendation.
//
// PATCH /api/practice/recommendation
// Body: { recommendationId: number, status: ... }   — target one recommendation
//   or: { problemId: number,        status: ... }   — target the pending
//                                                     recommendation for a problem
//
// The problemId form exists because the practice page is routed by slug and
// never receives a recommendationId; it knows only which problem it is showing.
// Plumbing the id through navigation would break deep links and bookmarks.
//
// Why this exists: practice_recommendations rows were created with status
// 'pending' and nothing ever moved them. A student who solved a recommended
// problem kept being recommended it, because the dashboard filters on
// status = 'pending'.
//
// ---------------------------------------------------------------------------
// Two-client split, matching the wider architecture
// ---------------------------------------------------------------------------
// 'started' and 'dismissed' are statements of student INTENT — there is no
// outcome to verify, and RLS (recs_update_own) already restricts them to the
// student's own rows. These use the cookie client.
//
// 'completed' is an OUTCOME claim. Allowing the client to assert it would let a
// student mark work finished without doing it, which contradicts the principle
// that the server owns anything representing achievement (the same reason
// is_correct, score_percentage and ai_score are all server-authored). So
// 'completed' is verified against an accepted submission for that problem
// first, and only then written with the service-role client.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STUDENT_ASSERTABLE = ["started", "dismissed"];
const SERVER_VERIFIED = ["completed"];
const ALLOWED = [...STUDENT_ASSERTABLE, ...SERVER_VERIFIED];

// status -> the timestamp column that records when it happened.
const TIMESTAMP_FOR = {
  started: "started_at",
  completed: "completed_at",
  dismissed: "dismissed_at",
};

export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const { recommendationId, problemId, status } = body || {};

  const hasRecId = recommendationId && !Number.isNaN(Number(recommendationId));
  const hasProblemId = problemId && !Number.isNaN(Number(problemId));

  if (!hasRecId && !hasProblemId) {
    return NextResponse.json(
      { error: "Either recommendationId or problemId is required." },
      { status: 400 },
    );
  }
  if (!ALLOWED.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED.join(", ")}` },
      { status: 400 },
    );
  }

  // 1. Auth + ownership. RLS on practice_recommendations (recs_select_own)
  //    already restricts this read, so a foreign id simply returns null.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // When targeting by problem, resolve the still-open recommendation for it.
  // Ordered by priority so the most important one wins if a problem somehow
  // appears more than once.
  let query = supabase
    .from("practice_recommendations")
    .select("id, user_id, problem_id, status");

  if (hasRecId) {
    query = query.eq("id", recommendationId);
  } else {
    query = query
      .eq("problem_id", problemId)
      .in("status", ["pending", "started"])
      .order("priority", { ascending: true })
      .limit(1);
  }

  const { data: rec, error: recError } = await query.maybeSingle();

  if (recError) {
    console.error("Recommendation lookup failed:", recError.message);
    return NextResponse.json(
      { error: "Could not load the recommendation." },
      { status: 500 },
    );
  }
  if (!rec) {
    // Targeting by problem and finding nothing open is normal: the student may
    // be practising a problem that was never recommended, or already completed
    // it. Not an error — report it as a no-op so callers need no special case.
    if (hasProblemId && !hasRecId) {
      return NextResponse.json({ recommendation: null, changed: false });
    }
    return NextResponse.json(
      { error: "Recommendation not found." },
      { status: 404 },
    );
  }

  // Terminal states are not walked back — a completed recommendation staying
  // completed keeps the dashboard and any later analysis consistent.
  if (rec.status === "completed" && status !== "completed") {
    return NextResponse.json(
      { error: "This recommendation is already completed." },
      { status: 409 },
    );
  }

  // Already in the requested state — succeed quietly so the caller can be
  // naive about retries.
  if (rec.status === status) {
    return NextResponse.json({ recommendation: rec, changed: false });
  }

  const patch = {
    status,
    [TIMESTAMP_FOR[status]]: new Date().toISOString(),
  };

  // 2a. Student-assertable transitions — cookie client, RLS enforces ownership.
  if (STUDENT_ASSERTABLE.includes(status)) {
    const { data: updated, error: updateError } = await supabase
      .from("practice_recommendations")
      .update(patch)
      .eq("id", rec.id)
      .select("id, status, started_at, completed_at, dismissed_at")
      .maybeSingle();

    if (updateError) {
      console.error("Recommendation update failed:", updateError.message);
      return NextResponse.json(
        { error: "Could not update the recommendation." },
        { status: 500 },
      );
    }

    return NextResponse.json({ recommendation: updated, changed: true });
  }

  // 2b. 'completed' — verify the outcome before recording it. The student must
  //     actually have an accepted submission for this problem.
  const admin = createAdminClient();

  const { count: acceptedCount, error: verifyError } = await admin
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("problem_id", rec.problem_id)
    .eq("execution_status", "accepted");

  if (verifyError) {
    console.error("Completion verification failed:", verifyError.message);
    return NextResponse.json(
      { error: "Could not verify completion." },
      { status: 500 },
    );
  }

  if (!acceptedCount || acceptedCount === 0) {
    return NextResponse.json(
      {
        error:
          "This problem has not been solved yet, so it cannot be marked complete.",
      },
      { status: 409 },
    );
  }

  const { data: completed, error: completeError } = await admin
    .from("practice_recommendations")
    .update(patch)
    .eq("id", rec.id)
    .select("id, status, started_at, completed_at, dismissed_at")
    .maybeSingle();

  if (completeError) {
    console.error("Recommendation completion failed:", completeError.message);
    return NextResponse.json(
      { error: "Could not update the recommendation." },
      { status: 500 },
    );
  }

  return NextResponse.json({ recommendation: completed, changed: true });
}
