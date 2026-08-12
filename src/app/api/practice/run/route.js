// src/app/api/practice/run/route.js
// Phase 6 — Execute student code against VISIBLE test cases only ("Run Code").
//
// POST /api/practice/run
// Body: { sessionId: number, code: string }
//
// Purpose (two things at once):
//   1. Student-facing: let the student try their code against the public sample
//      tests without burning a graded submission. Standard behaviour on coding
//      platforms, and it makes the practice loop far less punishing.
//   2. Research-facing: stamp `coding_sessions.first_run_at` on the FIRST
//      execution in a session. Together with `started_at` this yields
//      pre_attempt_latency — the time the student spent reading and thinking
//      before committing to an approach. This is an RF feature (AIC-2026-01,
//      Point 1) and CANNOT be reconstructed after the fact.
//
// How this differs from /api/practice/submit:
//   - Runs PUBLIC SAMPLE test cases only; hidden tests are never touched.
//   - Writes NOTHING to `submissions`. This is not a graded attempt.
//   - Stamps first_run_at (submit does not).
//   - Otherwise resolves execution_mode / class_name / per-test overrides
//     identically to submit, so Run and Submit build the same kind of
//     harness for a given problem (return / stdout / methods / multi_function).
//
// Security notes:
//   - Ownership is verified on the cookie client before anything else.
//   - Test cases are loaded with the service-role client, same as submit, so
//     the query path is identical even though only public rows are returned.
//   - first_run_at is written with the SERVICE-ROLE client by design: the
//     `sessions_update_own` RLS policy explicitly forbids the cookie client
//     from setting or altering it, so a student cannot spoof their own latency.
//
// Non-fatal philosophy: a failure to stamp first_run_at must NEVER block the
// student from running their code. The measurement is secondary to the UX.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runOnJudge0, PYTHON_LANGUAGE_ID } from "@/lib/judge0/client";
import {
  buildHarness,
  compareResult,
  functionNameFromSignature,
  classNameFromSpec,
} from "@/lib/judge0/buildHarness";

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

  const { sessionId, code } = body || {};
  if (!sessionId || typeof code !== "string" || !code.trim()) {
    return NextResponse.json(
      { error: "sessionId and code are required." },
      { status: 400 },
    );
  }

  // 1. Auth + ownership via cookie client.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("coding_sessions")
    .select("id, user_id, problem_id, language")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.user_id !== user.id) {
    return NextResponse.json(
      { error: "This session does not belong to you." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  // 2. Stamp first_run_at BEFORE executing.
  //
  // Why before and not after: we are measuring time-to-first-execution, i.e.
  // the moment the student decided their code was ready to try. Judge0 latency
  // is our infrastructure's cost, not the student's thinking time, so stamping
  // after would inflate every measurement by a variable amount.
  //
  // The `.is("first_run_at", null)` filter makes this idempotent: the second
  // and every later run matches zero rows and changes nothing. It also closes
  // the race where two clicks land at once — only one write can win.
  //
  // Wrapped in try/catch and deliberately NOT awaited on the failure path:
  // if this write fails, the student still gets to run their code. We lose one
  // row of RF data, which is an acceptable trade against a blocked session.
  try {
    const { error: stampError } = await admin
      .from("coding_sessions")
      .update({ first_run_at: new Date().toISOString() })
      .eq("id", session.id)
      .is("first_run_at", null);

    if (stampError) {
      console.error("Run: first_run_at stamp failed:", stampError.message);
    }
  } catch (err) {
    console.error("Run: first_run_at stamp threw:", err.message);
  }

  // 3. Load the problem's execution_mode — same resolution submit uses, so
  // Run and Submit build the exact same kind of harness for a given problem.
  const { data: problem, error: problemError } = await admin
    .from("problems")
    .select("execution_mode")
    .eq("id", session.problem_id)
    .single();

  if (problemError || !problem) {
    return NextResponse.json(
      { error: "Could not load problem metadata." },
      { status: 500 },
    );
  }

  const problemMode = problem.execution_mode ?? "return";

  // 4. Load function_signature and class_name from problem_languages.
  const { data: lang, error: langError } = await admin
    .from("problem_languages")
    .select("function_signature, class_name")
    .eq("problem_id", session.problem_id)
    .eq("language", "python")
    .maybeSingle();

  if (langError) {
    return NextResponse.json(
      { error: "Could not load problem language metadata." },
      { status: 500 },
    );
  }

  const functionName = functionNameFromSignature(lang?.function_signature);
  const className = classNameFromSpec(lang?.class_name);

  // For 'return' and 'stdout' modes we must have a function name. Mirrors the
  // same check in submit — 'methods' resolves its class per test case below,
  // and 'multi_function' needs neither at the problem level.
  const needsFunctionName = ["return", "stdout"].includes(problemMode);
  if (needsFunctionName && !functionName) {
    return NextResponse.json(
      {
        error:
          "This problem is not configured for function-based grading (missing function_signature).",
      },
      { status: 500 },
    );
  }

  // 5. Load PUBLIC SAMPLE test cases only.
  //
  // This is the key difference from submit. Hidden test cases are never
  // fetched here at all — not fetched and filtered, but never selected — so
  // there is no code path on which a hidden expected_output could reach the
  // response body.
  const { data: testCases, error: tcError } = await admin
    .from("test_cases")
    .select("input, expected_output, visibility, display_order")
    .eq("problem_id", session.problem_id)
    .eq("visibility", "public_sample")
    .order("display_order", { ascending: true });

  if (tcError) {
    return NextResponse.json(
      { error: "Could not load test cases." },
      { status: 500 },
    );
  }

  if (!testCases?.length) {
    return NextResponse.json(
      { error: "This problem has no sample test cases to run against." },
      { status: 400 },
    );
  }

  // 6. Execute each sample test on Judge0.
  const results = [];
  let passedCount = 0;
  const runtimes = [];

  try {
    for (const tc of testCases) {
      // Per-test-case mode/class override — same resolution submit uses
      // (e.g. mixed problems like PO-01 that carry a "mode" key per row).
      const tcInputParsed =
        tc.input !== null && tc.input !== undefined ? tc.input : [];

      const tcMode =
        typeof tcInputParsed === "object" &&
        !Array.isArray(tcInputParsed) &&
        tcInputParsed.mode
          ? tcInputParsed.mode
          : problemMode;

      const tcClassName =
        typeof tcInputParsed === "object" &&
        !Array.isArray(tcInputParsed) &&
        tcInputParsed.class
          ? tcInputParsed.class
          : className;

      const harness = buildHarness({
        studentCode: code,
        mode: tcMode,
        tcInput: tcInputParsed,
        functionName,
        className: tcClassName,
      });

      const jr = await runOnJudge0({
        sourceCode: harness,
        languageId: PYTHON_LANGUAGE_ID,
      });

      const statusId = jr.status?.id;
      const ranOk = statusId === 3;

      const { passed, actualDisplay } = compareResult(
        jr.stdout ?? "",
        tc.expected_output,
        tcMode,
      );
      const finalPassed = ranOk && passed;

      if (finalPassed) passedCount += 1;
      if (jr.time) runtimes.push(Math.round(parseFloat(jr.time) * 1000));

      // These are all public samples, so full detail is safe to return.
      results.push({
        input: tc.input,
        expected: tc.expected_output,
        actual: actualDisplay || null,
        passed: finalPassed,
        status: jr.status?.description || "Unknown",
        stderr: jr.stderr || jr.compile_output || null,
      });
    }
  } catch (err) {
    console.error("Run: Judge0 execution failed:", err.message);
    return NextResponse.json(
      {
        error:
          "The code execution service is unavailable right now. Please try again in a moment.",
      },
      { status: 503 },
    );
  }

  // Mean, not sum — a sum grows with test-case count and would be confounded
  // as a feature. Same fix that is pending on the submit route.
  const meanRuntimeMs = runtimes.length
    ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length)
    : null;

  // 7. Return results. Note there is no submissionId: nothing was graded.
  return NextResponse.json({
    passedCount,
    totalTests: testCases.length,
    allPassed: passedCount === testCases.length,
    meanRuntimeMs,
    results,
    graded: false,
  });
}
