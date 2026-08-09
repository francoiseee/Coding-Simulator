// src/app/api/practice/submit/route.js
// Phase 6 — Grade a coding submission with Judge0.
//
// POST /api/practice/submit
// Body: { sessionId: number, code: string }
//
// Flow:
//   1. Verify the user owns the session (cookie client).
//   2. Load the problem (including execution_mode), its function/class name,
//      and ALL test cases using the service-role client — hidden tests never
//      touch the browser.
//   3. For each test case: resolve mode (problem default or per-row override),
//      build a harness, run it on Judge0, compare output.
//   4. Aggregate pass/fail, runtime, errors.
//   5. Write a graded row to `submissions` via the service-role client.
//   6. Return per-visible-test results + overall verdict to the UI.
//
// Non-fatal philosophy: if Judge0 is unreachable, respond with a clear
// "grading service unavailable" message rather than crashing.

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

  // 2. Privileged loads — problem metadata + ALL test cases.
  const admin = createAdminClient();

  // Load the problem's execution_mode.
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

  // Load function_signature and class_name from problem_languages.
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

  // Derive identifiers needed by different modes.
  const functionName = functionNameFromSignature(lang?.function_signature);
  const className = classNameFromSpec(lang?.class_name);

  // For 'return' and 'stdout' modes we must have a function name.
  // For 'methods' we must have a class name (per-test-case override is handled
  // later, so className being null here is only fatal if every row uses the
  // problem default — we defer that validation to test-case time).
  // For 'multi_function', neither is required at the problem level.
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

  const { data: testCases, error: tcError } = await admin
    .from("test_cases")
    .select("input, expected_output, visibility, display_order")
    .eq("problem_id", session.problem_id)
    .order("display_order", { ascending: true });

  if (tcError || !testCases?.length) {
    return NextResponse.json(
      { error: "No test cases found for this problem." },
      { status: 500 },
    );
  }

  // 3. Run each test case through Judge0.
  const results = [];
  let passedCount = 0;
  let totalRuntimeMs = 0;
  let maxMemoryKb = 0;
  let firstError = null;
  let sawCompileError = false;
  let sawRuntimeError = false;
  let sawTimeLimit = false;

  try {
    for (const tc of testCases) {
      // Per-test-case mode override (e.g. mixed problems like PO-01).
      // input can be a plain array (return mode legacy) or an object that
      // may carry a "mode" key.
      const tcInputParsed =
        tc.input !== null && tc.input !== undefined ? tc.input : [];

      const tcMode =
        typeof tcInputParsed === "object" &&
        !Array.isArray(tcInputParsed) &&
        tcInputParsed.mode
          ? tcInputParsed.mode
          : problemMode;

      // For methods mode, resolve the class name: input.class overrides
      // problem_languages.class_name.
      const tcClassName =
        typeof tcInputParsed === "object" &&
        !Array.isArray(tcInputParsed) &&
        tcInputParsed.class
          ? tcInputParsed.class
          : className;

      // Resolve function name for return/stdout: not overridable per row
      // (only multi_function provides it inside the input spec).
      const tcFunctionName = functionName;

      const harness = buildHarness({
        studentCode: code,
        mode: tcMode,
        tcInput: tcInputParsed,
        functionName: tcFunctionName,
        className: tcClassName,
      });

      const jr = await runOnJudge0({
        sourceCode: harness,
        languageId: PYTHON_LANGUAGE_ID,
      });

      // Judge0 status.id: 3=Accepted, 4=Wrong Answer, 5=TLE, 6=Compile Error,
      // 7-12=various runtime errors.
      const statusId = jr.status?.id;
      const ranOk = statusId === 3;
      if (statusId === 6) sawCompileError = true;
      else if (statusId === 5) sawTimeLimit = true;
      else if (statusId >= 7 && statusId <= 12) sawRuntimeError = true;

      const { passed, actualDisplay } = compareResult(
        jr.stdout ?? "",
        tc.expected_output,
        tcMode,
      );

      // For stdout mode, Judge0 marks the submission "Accepted" (status 3)
      // even when the printed text differs from expected — it only knows
      // the process exited 0. We therefore derive pass/fail ourselves via
      // compareResult; ranOk is still used for error classification.
      const finalPassed = ranOk && passed;

      if (finalPassed) passedCount += 1;
      if (jr.time) totalRuntimeMs += Math.round(parseFloat(jr.time) * 1000);
      if (jr.memory) maxMemoryKb = Math.max(maxMemoryKb, jr.memory);
      if (!firstError && (jr.stderr || jr.compile_output)) {
        firstError = jr.stderr || jr.compile_output;
      }

      // Only reveal details for public sample tests; hidden tests report
      // pass/fail only (never leak expected output or the input).
      const isPublic = tc.visibility === "public_sample";
      results.push({
        visibility: tc.visibility,
        passed: finalPassed,
        status: jr.status?.description || "Unknown",
        ...(isPublic
          ? {
              input: tc.input,
              expected: tc.expected_output,
              actual: actualDisplay || null,
            }
          : {}),
      });
    }
  } catch (err) {
    console.error("Judge0 execution failed:", err.message);
    return NextResponse.json(
      {
        error:
          "The grading service is unavailable right now. Please try again in a moment.",
      },
      { status: 503 },
    );
  }

  const totalTests = testCases.length;
  const scorePercentage = Math.round((passedCount / totalTests) * 10000) / 100;

  // execution_status: prefer most specific —
  // compile error > runtime error > TLE > wrong answer > accepted.
  let executionStatus;
  if (passedCount === totalTests) {
    executionStatus = "accepted";
  } else if (sawCompileError) {
    executionStatus = "compile_error";
  } else if (sawRuntimeError) {
    executionStatus = "runtime_error";
  } else if (sawTimeLimit) {
    executionStatus = "time_limit_exceeded";
  } else {
    executionStatus = "wrong_answer";
  }

  // 5. Record the graded submission (service role — RLS blocks scored client writes).
  const { data: submission, error: insertError } = await admin
    .from("submissions")
    .insert({
      session_id: session.id,
      user_id: user.id,
      problem_id: session.problem_id,
      language: session.language || "python",
      source_code: code,
      execution_status: executionStatus,
      score_percentage: scorePercentage,
      passed_test_count: passedCount,
      total_test_count: totalTests,
      runtime_ms: totalRuntimeMs || null,
      memory_kb: maxMemoryKb || null,
      stderr: firstError || null,
      graded_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Submission insert failed:", insertError.message);
    return NextResponse.json(
      { error: "Could not record the submission." },
      { status: 500 },
    );
  }

  // 6. Return verdict.
  return NextResponse.json({
    submissionId: submission.id,
    passedCount,
    totalTests,
    scorePercentage,
    allPassed: passedCount === totalTests,
    results,
  });
}
