// src/app/api/practice/session/save/route.js
// Phase 6, Step 30 — Autosave the latest editor code.
//
// PATCH /api/practice/session/save
// Body: { sessionId: number, code: string }
//
// Called by the client on a debounce (after the student stops typing for
// ~1-2s), NOT on every keystroke. RLS restricts UPDATE to the owner, so a
// student can only ever save into their own session.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { sessionId, code } = body || {};
  if (!sessionId || typeof code !== "string") {
    return NextResponse.json(
      { error: "sessionId and code are required." },
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

  // RLS ensures this only updates a row the user owns. We also filter on
  // user_id explicitly and require the session still be active.
  const { error: updateError } = await supabase
    .from("coding_sessions")
    .update({ current_code: code, last_active_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "active");

  if (updateError) {
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
