// src/app/api/diagnostic/status/route.js
// GET /api/diagnostic/status
// Read-only check used by the diagnostic page to decide whether to skip the
// Welcome/nickname screen and drop a returning student straight back into
// their in-progress attempt. Never creates or modifies anything.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ASSESSMENT_SLUG = "codely-beginner-diagnostic";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [{ data: profile }, { data: assessment }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase
      .from("assessments")
      .select("id")
      .eq("slug", ASSESSMENT_SLUG)
      .eq("status", "published")
      .single(),
  ]);

  let hasInProgressAttempt = false;
  if (assessment) {
    const { data: attempt } = await supabase
      .from("diagnostic_attempts")
      .select("id")
      .eq("user_id", user.id)
      .eq("assessment_id", assessment.id)
      .eq("status", "in_progress")
      .limit(1)
      .maybeSingle();
    hasInProgressAttempt = !!attempt;
  }

  return NextResponse.json({
    displayName: profile?.display_name || null,
    hasInProgressAttempt,
  });
}
