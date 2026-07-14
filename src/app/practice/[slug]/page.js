"use client";

// src/app/practice/[slug]/page.js
// Phase 6 (Steps 29-30) — Coding practice page.
// Split view: problem statement + samples on the left, code editor on the right.
// Creates a coding session on load and autosaves the editor code on a debounce.
// Code execution / grading is NOT wired yet — the Submit button is present but
// intentionally disabled with a note, pending Judge0 integration.

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "./PracticeProblem.module.css";

const AUTOSAVE_DELAY_MS = 1500;

export default function PracticeProblemPage() {
  const { slug } = useParams();
  const router = useRouter();

  const [problem, setProblem] = useState(null);
  const [sampleTests, setSampleTests] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [submitState, setSubmitState] = useState("idle"); // idle | running | done | error
  const [submitResult, setSubmitResult] = useState(null);
  const [submitError, setSubmitError] = useState("");

  const saveTimer = useRef(null);

  // Load problem + start/resume session on mount.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const pRes = await fetch(`/api/practice/problem/${slug}`);
        const pData = await pRes.json();
        if (!pRes.ok)
          throw new Error(pData.error || "Could not load the problem.");

        const sRes = await fetch("/api/practice/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problemId: pData.problem.id }),
        });
        const sData = await sRes.json();
        if (!sRes.ok)
          throw new Error(sData.error || "Could not start a session.");

        if (cancelled) return;
        setProblem(pData.problem);
        setSampleTests(pData.sampleTests || []);
        setSessionId(sData.sessionId);
        // Resume saved code if present, else fall back to starter code.
        setCode(sData.currentCode || pData.starterCode || "");
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err.message);
        setStatus("error");
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Debounced autosave whenever code changes (after session exists).
  const scheduleSave = useCallback(
    (nextCode) => {
      if (!sessionId) return;
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/practice/session/save", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, code: nextCode }),
          });
          setSaveState(res.ok ? "saved" : "idle");
        } catch {
          setSaveState("idle");
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [sessionId],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const onCodeChange = (e) => {
    const next = e.target.value;
    setCode(next);
    scheduleSave(next);
  };

  // Tab inserts spaces instead of moving focus, so the editor feels code-like.
  const onKeyDown = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.target;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = code.slice(0, start) + "    " + code.slice(end);
      setCode(next);
      scheduleSave(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 4;
      });
    }
  };

  const handleSubmit = async () => {
    setSubmitState("running");
    setSubmitResult(null);
    setSubmitError("");
    try {
      const res = await fetch("/api/practice/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed.");
      setSubmitResult(data);
      setSubmitState("done");
    } catch (err) {
      setSubmitError(err.message);
      setSubmitState("error");
    }
  };

  if (status === "loading")
    return <p className={styles.stateWrapper}>Loading problem…</p>;
  if (status === "error") {
    return (
      <div className={styles.stateWrapper}>
        <p>Something went wrong: {errorMessage}</p>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => router.push("/")}
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  const hints = Array.isArray(problem.hints) ? problem.hints : [];
  const examples = Array.isArray(problem.examples) ? problem.examples : [];

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.backLink}
          onClick={() => router.push("/")}
        >
          ← Dashboard
        </button>
        <span
          className={`${styles.difficultyPill} ${styles["difficulty_" + problem.difficulty]}`}
        >
          {problem.difficulty}
        </span>
      </header>

      <div className={styles.splitPane}>
        {/* Left: problem statement */}
        <section className={styles.problemPane}>
          <h1 className={styles.problemTitle}>{problem.title}</h1>
          {problem.estimatedMinutes ? (
            <span className={styles.estimate}>
              ~{problem.estimatedMinutes} min
            </span>
          ) : null}

          <p className={styles.statement}>{problem.statement}</p>

          {examples.length > 0 && (
            <div className={styles.block}>
              <h2 className={styles.blockTitle}>Examples</h2>
              {examples.map((ex, i) => (
                <div key={i} className={styles.exampleRow}>
                  <code className={styles.exampleIn}>Input: {ex.input}</code>
                  <code className={styles.exampleOut}>Output: {ex.output}</code>
                </div>
              ))}
            </div>
          )}

          {problem.constraints && (
            <div className={styles.block}>
              <h2 className={styles.blockTitle}>Constraints</h2>
              <p className={styles.constraints}>{problem.constraints}</p>
            </div>
          )}

          {hints.length > 0 && (
            <details className={styles.hintsBlock}>
              <summary className={styles.hintsSummary}>
                Show hints ({hints.length})
              </summary>
              <ul className={styles.hintsList}>
                {hints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Right: editor */}
        <section className={styles.editorPane}>
          <div className={styles.editorHeader}>
            <span className={styles.editorLang}>Python</span>
            <span className={styles.saveIndicator}>
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Saved"}
            </span>
          </div>

          <textarea
            className={styles.editor}
            value={code}
            onChange={onCodeChange}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
          />

          {/* Sample tests (public only) */}
          {sampleTests.length > 0 && (
            <div className={styles.samplesBlock}>
              <h3 className={styles.samplesTitle}>Sample tests</h3>
              {sampleTests.map((t, i) => (
                <div key={i} className={styles.sampleRow}>
                  <code>in: {JSON.stringify(t.input)}</code>
                  <code>expected: {JSON.stringify(t.expected_output)}</code>
                </div>
              ))}
            </div>
          )}

          <div className={styles.editorFooter}>
            <button
              type="button"
              className={styles.runBtn}
              onClick={handleSubmit}
              disabled={submitState === "running"}
            >
              {submitState === "running" ? "Running…" : "Run & Submit"}
            </button>

            {submitState === "error" && (
              <span className={styles.submitError}>{submitError}</span>
            )}

            {submitState === "done" && submitResult && (
              <div
                className={`${styles.verdict} ${
                  submitResult.allPassed
                    ? styles.verdictPass
                    : styles.verdictFail
                }`}
              >
                <span className={styles.verdictHeadline}>
                  {submitResult.allPassed
                    ? "All tests passed!"
                    : `${submitResult.passedCount} / ${submitResult.totalTests} tests passed`}
                </span>
                <span className={styles.verdictScore}>
                  {submitResult.scorePercentage}%
                </span>

                <ul className={styles.verdictList}>
                  {submitResult.results.map((r, i) => (
                    <li
                      key={i}
                      className={`${styles.verdictItem} ${r.passed ? styles.itemPass : styles.itemFail}`}
                    >
                      <span className={styles.verdictMark}>
                        {r.passed ? "✓" : "✗"}
                      </span>
                      {r.visibility === "public_sample" ? (
                        <span className={styles.verdictDetail}>
                          in {JSON.stringify(r.input)} → expected{" "}
                          {JSON.stringify(r.expected)}
                          {!r.passed && r.actual != null
                            ? `, got ${r.actual}`
                            : ""}
                        </span>
                      ) : (
                        <span className={styles.verdictDetail}>
                          Hidden test {r.passed ? "passed" : "failed"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
