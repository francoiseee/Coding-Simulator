// src/app/api/practice/next-problem/route.js
// The full adaptive recommendation: picks a difficulty (cold-start rule,
// circuit breaker, or the RF model — see pickNextDifficulty.js), then a
// specific problem within that difficulty (weakest-topic selection — see
// selectNextProblem.js). This is the endpoint the app should actually call
// to get an assignable next problem; /api/practice/next-difficulty stays
// available standalone for testing/debugging the difficulty decision alone.
//
// GET /api/practice/next-problem

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickNextDifficulty } from "@/lib/adaptive/pickNextDifficulty";
import { selectNextProblem } from "@/lib/adaptive/selectNextProblem";

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
    const difficultyResult = await pickNextDifficulty({
      admin,
      userId: user.id,
    });

    const problemResult = await selectNextProblem({
      admin,
      userId: user.id,
      difficulty: difficultyResult.difficulty,
    });

    if (!problemResult) {
      // Catastrophic: no published problem exists at all for this
      // difficulty. Not something selectNextProblem's own fallback could
      // recover from. Surface clearly rather than pretending success.
      return NextResponse.json(
        {
          error: `No published problems available at difficulty '${difficultyResult.difficulty}'.`,
          difficulty: difficultyResult,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      difficulty: difficultyResult.difficulty,
      difficultySource: difficultyResult.source,
      difficultyReason: difficultyResult.reason,
      difficultyWarning: difficultyResult.warning ?? null,
      problem: problemResult.problem,
      topic: problemResult.topic,
      problemSource: problemResult.source,
      problemReason: problemResult.reason,
    });
  } catch (err) {
    console.error("next-problem route: unexpected error:", err.message);
    return NextResponse.json(
      { error: "Could not determine a next problem. Please try again." },
      { status: 500 },
    );
  }
}
