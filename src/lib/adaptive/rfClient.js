// src/lib/adaptive/rfClient.js
// Thin wrapper around the Codely RF inference microservice (FastAPI).
// Server-only — same reasoning as judge0/client.js: this should never be
// called from the browser, both because there's no auth on that service yet
// (see inference_service/README.md, "Open items") and because the features
// going into a prediction are derived from other students' data shape, not
// something to expose client-side.

const BASE_URL = process.env.RF_SERVICE_URL || "http://127.0.0.1:8000";

// Both calls share a timeout: the RF service is a local dependency this app
// controls, not a third-party API with unpredictable latency, so a short
// timeout is appropriate. If it hasn't responded in 3s, something is wrong
// (not loaded, crashed, network issue) and callers should fall back rather
// than hang the student's request waiting on it.
const TIMEOUT_MS = 3000;

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get the procedural complexity bucket for a piece of source code, via the
 * SAME estimator train_model.py trains against (ml/complexity.py, wrapped
 * by the inference service's /complexity endpoint) — never reimplemented in
 * JS, so training-time and inference-time buckets cannot drift apart.
 *
 * @param {string} sourceCode
 * @returns {Promise<{complexityScore: number, parsedOk: boolean, warning: string|null}>}
 * @throws if the service is unreachable or returns a non-2xx status —
 *   callers are responsible for deciding the fallback (see
 *   selectNextDifficulty's pickNextDifficulty for the fail-safe pattern).
 */
export async function getComplexityScore(sourceCode) {
  const res = await fetchWithTimeout(`${BASE_URL}/complexity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_code: sourceCode }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RF service /complexity returned ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    complexityScore: data.complexity_score,
    parsedOk: data.parsed_ok,
    warning: data.warning ?? null,
  };
}

/**
 * Get a difficulty prediction from the trained RF model.
 *
 * @param {object} features
 * @param {number} features.correctnessRate
 * @param {number} features.runtimeMs
 * @param {number} features.attempts
 * @param {number} features.complexityScore
 * @param {number} features.prevDifficultyOrd  -1 if no predecessor
 * @returns {Promise<{
 *   difficulty: string,
 *   probabilities: Record<string, number>,
 *   supportedClasses: string[],
 *   warning: string|null,
 * }>}
 * @throws if the service is unreachable, returns non-2xx, or rejects the
 *   input (e.g. an out-of-range complexity_score) — callers must fall back.
 */
export async function predictDifficulty({
  correctnessRate,
  runtimeMs,
  attempts,
  complexityScore,
  prevDifficultyOrd,
}) {
  const res = await fetchWithTimeout(`${BASE_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      correctness_rate: correctnessRate,
      runtime_ms: runtimeMs,
      attempts,
      complexity_score: complexityScore,
      prev_difficulty_ord: prevDifficultyOrd,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RF service /predict returned ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    difficulty: data.difficulty,
    probabilities: data.probabilities,
    supportedClasses: data.supported_classes,
    warning: data.warning ?? null,
  };
}

/**
 * Health check — mainly useful for the picker to fail fast with a clear
 * reason rather than timing out on /predict when the service is simply down.
 * Never throws; returns null on any failure.
 */
export async function rfServiceHealth() {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/health`, { method: "GET" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
