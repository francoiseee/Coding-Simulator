// src/app/api/ai/diagnostic-report/route.js
// Step 22 — Create the AI Weakness Report Route.
//
// POST /api/ai/diagnostic-report
// Body: { attemptId: number }
//
// This is generated automatically during submit (see Step 16's route), so most
// students will never need to call this directly. It exists for cases where
// generation should be retried or re-run on demand later (e.g. a "regenerate
// my report" action, or if the automatic generation during submit failed).
// Reports are append-only — this always creates a NEW row, never overwrites.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDiagnosticReport } from "@/lib/ai/generateDiagnosticReport";

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

  const { attemptId } = body || {};
  if (!attemptId) {
    return NextResponse.json(
      { error: "attemptId is required." },
      { status: 400 },
    );
  }

  // Verify the caller owns this attempt using the normal cookie session
  // (RLS also enforces this, but we check explicitly for a clean error message).
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
    .select("id, user_id, status")
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
  if (attempt.status !== "completed") {
    return NextResponse.json(
      { error: "This diagnostic has not been completed yet." },
      { status: 409 },
    );
  }

  const admin = createAdminClient();

  try {
    const report = await generateDiagnosticReport({
      admin,
      userId: user.id,
      attemptId,
    });
    return NextResponse.json({ report });
  } catch (err) {
    console.error("AI report generation failed:", err.message);
    return NextResponse.json(
      { error: "Could not generate the AI report. Please try again." },
      { status: 500 },
    );
  }
}
