// src/app/api/practice/submit/route.js
// Phase 6 — Grade a coding submission with Judge0.
// Phase 7, Step 36 — Also record per-test-case results in submission_test_results.
//
// POST /api/practice/submit
// Body: { sessionId: number, code: string }
//
// Flow:
//   1. Verify the user owns the session (cookie client).
//   2. Load the problem, its function name, and ALL test cases (including
//      hidden) using the service-role client — hidden tests never touch the
//      browser, same protection pattern as diagnostic answer keys.
//   3. For each test case: build a harness, run it on Judge0, compare output.
//   4. Aggregate pass/fail, runtime, errors.
//   5. Write a graded row to `submissions` via the service-role client
//      (RLS forbids clients from writing a scored submission directly).
//   5b. Write per-test-case rows to `submission_test_results` (Step 36).
//   6. Return per-visible-test results + overall verdict to the UI.
//
// Non-fatal philosophy: if Judge0 is unreachable, respond with a clear
// "grading service unavailable" message rather than crashing. Likewise, a
// failure to write submission_test_results does not block the graded
// verdict — the `submissions` row is the source of truth for grading; the
// per-test rows are supplementary evidence (e.g. for later RF feature work).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runOnJudge0, PYTHON_LANGUAGE_ID } from "@/lib/judge0/client";
import {
  buildHarness,
  normalizeForCompare,
  functionNameFromSignature,
} from "@/lib/judge0/buildHarness";
import { updateMasteryFromSubmission } from "@/lib/mastery/updateConceptMastery";

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

  // 2. Privileged loads (service role) — problem signature + ALL test cases.
  const admin = createAdminClient();

  const { data: lang, error: langError } = await admin
    .from("problem_languages")
    .select("function_signature")
    .eq("problem_id", session.problem_id)
    .eq("language", "python")
    .maybeSingle();

  if (langError) {
    return NextResponse.json(
      { error: "Could not load problem metadata." },
      { status: 500 },
    );
  }

  const functionName = functionNameFromSignature(lang?.function_signature);
  if (!functionName) {
    return NextResponse.json(
      { error: "This problem is not configured for function-based grading." },
      { status: 500 },
    );
  }

  // NOTE: `id` is now selected — required as the FK target for
  // submission_test_results.test_case_id (Step 36).
  const { data: testCases, error: tcError } = await admin
    .from("test_cases")
    .select("id, input, expected_output, visibility, display_order")
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
  const testResultRows = []; // Step 36 — per-test-case rows, submission_id filled in after insert
  let passedCount = 0;
  let totalRuntimeMs = 0;
  let maxMemoryKb = 0;
  let firstError = null;
  let sawCompileError = false;
  let sawRuntimeError = false;
  let sawTimeLimit = false;

  try {
    for (const tc of testCases) {
      const args = Array.isArray(tc.input) ? tc.input : [tc.input];
      const harness = buildHarness({ studentCode: code, functionName, args });

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

      const actual = (jr.stdout || "").trim();
      const expected = normalizeForCompare(tc.expected_output);
      const actualNorm = actual ? normalizeForCompare(actual) : "";
      const passed = ranOk && actualNorm === expected;

      const testRuntimeMs = jr.time
        ? Math.round(parseFloat(jr.time) * 1000)
        : null;
      const testMemoryKb = jr.memory || null;

      if (passed) passedCount += 1;
      if (testRuntimeMs) totalRuntimeMs += testRuntimeMs;
      if (testMemoryKb) maxMemoryKb = Math.max(maxMemoryKb, testMemoryKb);
      if (!firstError && (jr.stderr || jr.compile_output)) {
        firstError = jr.stderr || jr.compile_output;
      }

      // Only reveal details for public sample tests; hidden tests report
      // pass/fail only (never leak expected output or the input).
      const isPublic = tc.visibility === "public_sample";
      results.push({
        visibility: tc.visibility,
        passed,
        status: jr.status?.description || "Unknown",
        ...(isPublic
          ? {
              input: tc.input,
              expected: tc.expected_output,
              actual: actual || null,
            }
          : {}),
      });

      // Step 36 — full per-test-case record, including hidden tests, for
      // internal evidence (RF features later). submission_id is attached
      // after the submissions insert below.
      testResultRows.push({
        test_case_id: tc.id,
        passed,
        actual_output: actual ? JSON.stringify(actual) : null,
        runtime_ms: testRuntimeMs,
        memory_kb: testMemoryKb,
        judge_status: jr.status?.description || "Unknown",
        executed_at: new Date().toISOString(),
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
  // execution_status must be one of the DB's allowed values. Prefer the most
  // specific: compile error > runtime error > TLE > wrong answer > accepted.
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

  // 5b. Record per-test-case results (Step 36). Non-fatal: the aggregate
  // `submissions` row above is already the source of truth for grading —
  // per-test detail is supplementary and must never block the response.
  if (testResultRows.length > 0) {
    const { error: tcrError } = await admin
      .from("submission_test_results")
      .insert(
        testResultRows.map((row) => ({
          ...row,
          submission_id: submission.id,
        })),
      );
    if (tcrError) {
      console.error("submission_test_results insert failed:", tcrError.message);
    }
  }

  // 5c. Update persistent concept mastery from this submission's score.
  // Non-fatal: the graded `submissions` row above is already the source of
  // truth — a mastery blending failure must not block the verdict response.
  try {
    await updateMasteryFromSubmission({
      admin,
      userId: user.id,
      problemId: session.problem_id,
      scorePercentage,
    });
  } catch (err) {
    console.error("Mastery update from submission failed:", err.message);
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
