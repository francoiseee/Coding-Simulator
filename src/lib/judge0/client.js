// src/lib/judge0/client.js
// Thin wrapper around the Judge0 CE API (hosted via RapidAPI).
// Server-only — the RapidAPI key must never reach the browser.
//
// Uses the synchronous ?wait=true mode so a single call submits code and
// returns the finished result. For a thesis-scale app this is simplest; if
// throughput ever becomes an issue, switch to the async token + poll pattern.
//
// BASE64 MODE (fixed 2026-08-16): Judge0 CE rejects the entire submission
// with a 400 before executing anything if source_code/stdin contains a
// character it can't carry raw over its transport — confirmed root cause
// of "some attributes for this submission cannot be converted to UTF-8"
// errors on bmi-classifier (em dash in the required output format) and
// other problems with non-ASCII expected output. This isn't limited to
// known problems: any non-ASCII character ANY student types or pastes
// (smart quotes, accented characters, arrows, non-breaking spaces) can
// trigger the same 400, sporadically, per student. base64-encoding
// source_code/stdin before sending, and decoding stdout/stderr/
// compile_output/message on the way back, avoids the transport entirely —
// every caller downstream (compareResult, submit/route.js, run/route.js)
// keeps working with plain text exactly as before, since decoding happens
// here and only here.

const BASE_URL =
  process.env.JUDGE0_BASE_URL || "https://judge0-ce.p.rapidapi.com";
const RAPID_KEY = process.env.JUDGE0_RAPIDAPI_KEY;
const RAPID_HOST =
  process.env.JUDGE0_RAPIDAPI_HOST || "judge0-ce.p.rapidapi.com";

// Python 3.12.5 on this Judge0 instance. Pinned here so a version change is a
// one-line edit. (Verified via GET /languages on the subscribed instance.)
export const PYTHON_LANGUAGE_ID = 100;

function toBase64(text) {
  return Buffer.from(text, "utf-8").toString("base64");
}

function fromBase64(text) {
  if (text == null) return text;
  return Buffer.from(text, "base64").toString("utf-8");
}

/**
 * Run a single source program against optional stdin.
 * @returns {Promise<object>} Judge0 result: { stdout, stderr, compile_output, status, time, memory, ... }
 *   stdout/stderr/compile_output/message are already decoded to plain text —
 *   callers never need to know base64 mode is being used under the hood.
 */
export async function runOnJudge0({
  sourceCode,
  stdin = "",
  languageId = PYTHON_LANGUAGE_ID,
}) {
  if (!RAPID_KEY) {
    throw new Error("JUDGE0_RAPIDAPI_KEY is not set.");
  }

  const res = await fetch(
    `${BASE_URL}/submissions?base64_encoded=true&wait=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": RAPID_KEY,
        "X-RapidAPI-Host": RAPID_HOST,
      },
      body: JSON.stringify({
        source_code: toBase64(sourceCode),
        language_id: languageId,
        stdin: toBase64(stdin),
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Judge0 request failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }

  const result = await res.json();

  return {
    ...result,
    stdout: fromBase64(result.stdout),
    stderr: fromBase64(result.stderr),
    compile_output: fromBase64(result.compile_output),
    message: fromBase64(result.message),
  };
}
