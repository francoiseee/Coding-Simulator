// src/lib/judge0/client.js
// Thin wrapper around the Judge0 CE API (hosted via RapidAPI).
// Server-only — the RapidAPI key must never reach the browser.
//
// Uses the synchronous ?wait=true mode so a single call submits code and
// returns the finished result. For a thesis-scale app this is simplest; if
// throughput ever becomes an issue, switch to the async token + poll pattern.

const BASE_URL =
  process.env.JUDGE0_BASE_URL || "https://judge0-ce.p.rapidapi.com";
const RAPID_KEY = process.env.JUDGE0_RAPIDAPI_KEY;
const RAPID_HOST =
  process.env.JUDGE0_RAPIDAPI_HOST || "judge0-ce.p.rapidapi.com";

// Python 3.12.5 on this Judge0 instance. Pinned here so a version change is a
// one-line edit. (Verified via GET /languages on the subscribed instance.)
export const PYTHON_LANGUAGE_ID = 100;

/**
 * Run a single source program against optional stdin.
 * @returns {Promise<object>} Judge0 result: { stdout, stderr, compile_output, status, time, memory, ... }
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
    `${BASE_URL}/submissions?base64_encoded=false&wait=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": RAPID_KEY,
        "X-RapidAPI-Host": RAPID_HOST,
      },
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Judge0 request failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }

  return res.json();
}
