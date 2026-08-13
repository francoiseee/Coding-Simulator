// src/app/api/practice/next-difficulty/route.js
// The live adaptive picker endpoint — decides what difficulty a student's
// next problem should be, combining the cold-start rule, the circuit
// breaker, and the trained RF model. See
// src/lib/adaptive/pickNextDifficulty.js for the full decision logic and
// the reasoning behind each safeguard.
//
// GET /api/practice/next-difficulty
//
// Read-only: makes no writes, so GET is correct here (unlike /session,
// /run, /submit which all record something and are POST).
//
// This endpoint does NOT pick a specific problem — only a difficulty. Which
// PROBLEM within that difficulty/topic gets served is a separate concern
// (see the V11 question bank's topic/progression structure) left to
// whatever calls this.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickNextDifficulty } from "@/lib/adaptive/pickNextDifficulty";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const result = await pickNextDifficulty({ admin, userId: user.id });
    return NextResponse.json(result);
  } catch (err) {
    // pickNextDifficulty already fails safe internally (see its own
    // catch-all) — this is a second, outer safety net in case something
    // throws before even entering that function. Same fail-safe answer
    // either way: the student should never see a 500 here.
    console.error("next-difficulty route: unexpected error:", err.message);
    return NextResponse.json({
      difficulty: "easy",
      source: "fallback_unexpected_error",
      reason:
        "An unexpected error occurred; defaulting conservatively to Easy.",
    });
  }
}
