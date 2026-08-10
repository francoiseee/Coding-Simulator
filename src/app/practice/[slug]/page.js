"use client";

// src/app/practice/[slug]/page.js
// Phase 6 (Steps 29-34) — Coding practice page.
// Three-pane layout: instructions on the left, the Monaco editor + output
// terminal in the center, and the reflective question + submit action on the
// right — always visible, no tab-switching or modal gate.
//
// Reflection flow:
//   before_submit — fetched as soon as the session is ready and rendered
//     inline in the right pane. Each question is answered and "locked" on
//     its own; Submitting Code re-checks any question still unlocked and
//     saves it (skipping optional ones left blank) before grading runs.
//   after_failed_test — offered AFTER a failing verdict. Never gates
//     anything; the student already has their result. (Not surfaced in the
//     UI yet — tracked separately from the pre-submit gate above.)
//
// Answers that Step 34 has already AI-scored are immutable to the student
// under RLS (cqa_update_own requires ai_score IS NULL). They are therefore
// rendered read-only WITH their score and feedback, and skipped when
// re-submitting — re-POSTing one returns 409 and previously blocked grading
// permanently.

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import MonacoEditor from "@monaco-editor/react";
import { useTheme } from "@/lib/theme";
import styles from "./PracticeProblem.module.css";

const AUTOSAVE_DELAY_MS = 1500;

export default function PracticeProblemPage() {
  const { slug } = useParams();
  const router = useRouter();
  const { theme } = useTheme();

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
  const [runState, setRunState] = useState("idle"); // idle | running | done | error
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState("");

  // Reflective question gate (before_submit) — fetched on load and rendered
  // inline in the right pane. `lockingId` tracks which single question is
  // mid-save so only that question's button shows a busy state.
  const [reflectInstances, setReflectInstances] = useState([]);
  const [reflectAnswers, setReflectAnswers] = useState({}); // { [instanceId]: text }
  const [reflectLoadState, setReflectLoadState] = useState("idle"); // idle | loading | ready | error
  const [lockingId, setLockingId] = useState(null);
  const [gateError, setGateError] = useState("");
  const [savingGate, setSavingGate] = useState(false);
  const reflectShownAt = useRef(null);

  // after_failed_test — post-verdict reflection. Separate state so it can never
  // interfere with the pre-submit gate.
  const [postFailInstances, setPostFailInstances] = useState([]);
  const [postFailAnswers, setPostFailAnswers] = useState({});
  const [postFailState, setPostFailState] = useState("idle"); // idle | asking | saving | done
  const [postFailError, setPostFailError] = useState("");
  const postFailShownAt = useRef(null);

  // Recommendation completion (server-verified once a solution is accepted).
  const [recCompleted, setRecCompleted] = useState(false);

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

  // Load the before_submit reflective question(s) as soon as a session
  // exists, so the right pane has something to show immediately rather than
  // gating it behind a click.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function loadReflect() {
      setReflectLoadState("loading");
      try {
        const res = await fetch(`/api/practice/reflect?sessionId=${sessionId}`);
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Could not load the reflective question.");
        if (cancelled) return;
        setReflectInstances(data.instances || []);
        setReflectLoadState("ready");
        reflectShownAt.current = Date.now();
      } catch {
        // Non-fatal — reflective questions must never block the page.
        if (cancelled) return;
        setReflectLoadState("error");
      }
    }

    loadReflect();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

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

  const onCodeChange = (value) => {
    const next = value || "";
    setCode(next);
    scheduleSave(next);
  };

  // Ungraded execution against public sample tests only. Does not open the
  // reflection gate and does not create a submission. Also causes the server
  // to stamp first_run_at on the first call for this session.
  const handleRunCode = async () => {
    if (!sessionId) return;
    setRunState("running");
    setRunResult(null);
    setRunError("");
    try {
      const res = await fetch("/api/practice/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not run your code.");
      setRunResult(data);
      setRunState("done");
    } catch (err) {
      setRunError(err.message);
      setRunState("error");
    }
  };

  const onReflectChange = (instanceId, text) => {
    setReflectAnswers((prev) => ({ ...prev, [instanceId]: text }));
  };

  const elapsedSinceShown = () =>
    reflectShownAt.current
      ? Math.round((Date.now() - reflectShownAt.current) / 1000)
      : null;

  const saveReflectAnswer = async (inst, text) => {
    const res = await fetch("/api/practice/reflect/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceId: inst.id,
        answerText: text || null,
        isSkipped: !text,
        timeToAnswerSeconds: elapsedSinceShown(),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Could not save your answer.");
    }
  };

  // Locks a single reflective answer in place. Re-fetches afterward so the
  // AI's evaluation (scored synchronously by the answer endpoint) shows up
  // immediately under the question.
  const lockReflectAnswer = async (instanceId) => {
    const inst = reflectInstances.find((i) => i.id === instanceId);
    if (!inst) return;
    const text = (reflectAnswers[instanceId] || "").trim();

    if (inst.is_required && !text) {
      setGateError("Please answer this question before locking it in.");
      return;
    }

    setGateError("");
    setLockingId(instanceId);
    try {
      await saveReflectAnswer(inst, text);
      const refreshed = await fetch(`/api/practice/reflect?sessionId=${sessionId}`);
      const refreshedData = await refreshed.json();
      if (refreshed.ok) setReflectInstances(refreshedData.instances || []);
    } catch (err) {
      setGateError(err.message);
    } finally {
      setLockingId(null);
    }
  };

  // Submitting code: any reflective question still unlocked is saved first
  // (skipped if optional and left blank; blocked if required and empty),
  // then grading runs.
  const handleSubmitCode = async () => {
    if (!sessionId) return;
    setGateError("");

    const pending = reflectInstances.filter((i) => !i.isAnswered);

    for (const inst of pending) {
      const text = (reflectAnswers[inst.id] || "").trim();
      if (inst.is_required && !text) {
        setGateError("Please answer the required question before submitting.");
        return;
      }
    }

    if (pending.length > 0) {
      setSavingGate(true);
      try {
        for (const inst of pending) {
          const text = (reflectAnswers[inst.id] || "").trim();
          await saveReflectAnswer(inst, text);
        }
      } catch (err) {
        setGateError(err.message);
        setSavingGate(false);
        return;
      }
      setSavingGate(false);
    }

    await runGrading();
  };

  // Post-verdict reflection (after_failed_test). Invitation only — this must
  // never gate anything, because the student already has their result.
  const loadPostFailReflection = async (verdict) => {
    try {
      const res = await fetch(
        `/api/practice/reflect?sessionId=${sessionId}` +
          `&trigger=after_failed_test` +
          `&passed=${verdict.passedCount}&total=${verdict.totalTests}`,
      );
      const data = await res.json();
      if (!res.ok) return;

      const pending = (data.instances || []).filter((i) => !i.isAnswered);
      if (data.exhausted || pending.length === 0) return;

      postFailShownAt.current = Date.now();
      setPostFailInstances(pending);
      setPostFailState("asking");
    } catch {
      // Non-fatal by design — the verdict is already on screen.
    }
  };

  const onPostFailChange = (instanceId, text) => {
    setPostFailAnswers((prev) => ({ ...prev, [instanceId]: text }));
  };

  const submitPostFailReflection = async () => {
    setPostFailError("");
    setPostFailState("saving");

    const elapsed = postFailShownAt.current
      ? Math.round((Date.now() - postFailShownAt.current) / 1000)
      : null;

    try {
      for (const inst of postFailInstances) {
        const text = (postFailAnswers[inst.id] || "").trim();
        if (!text) continue; // nothing typed for this one — leave it unanswered

        const res = await fetch("/api/practice/reflect/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instanceId: inst.id,
            answerText: text,
            isSkipped: false,
            timeToAnswerSeconds: elapsed,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Could not save your reflection.");
        }
      }

      // Re-read so the AI score and feedback written by Step 34 can be shown.
      const res = await fetch(
        `/api/practice/reflect?sessionId=${sessionId}&trigger=after_failed_test`,
      );
      const data = await res.json();
      if (res.ok) setPostFailInstances(data.instances || []);
      setPostFailState("done");
    } catch (err) {
      setPostFailError(err.message);
      setPostFailState("asking");
    }
  };

  const runGrading = async () => {
    setSubmitState("running");
    setRunResult(null);
    setRunState("idle");
    setSubmitResult(null);
    setSubmitError("");
    setPostFailInstances([]);
    setPostFailState("idle");
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

      if (data.allPassed) {
        // Close out the recommendation that sent the student here, so the
        // dashboard stops suggesting a problem they have already solved.
        // Server-verified: the route confirms an accepted submission exists
        // before writing 'completed'. Non-fatal — a failure here must not
        // disturb the verdict the student just earned.
        try {
          const res2 = await fetch("/api/practice/recommendation", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              problemId: problem.id,
              status: "completed",
            }),
          });
          const d2 = await res2.json();
          if (res2.ok && d2.changed) setRecCompleted(true);
        } catch {
          // Ignored by design.
        }
      } else {
        // Offer a debugging reflection only when something actually failed.
        await loadPostFailReflection(data);
      }
    } catch (err) {
      setSubmitError(err.message);
      setSubmitState("error");
    }
  };

  if (status === "loading")
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
      </div>
    );
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
  const constraintLines = (problem.constraints || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const submitDisabled =
    submitState === "running" || savingGate || reflectLoadState === "loading";

  return (
    <div className={styles.pageOuter}>
      {/* Top bar */}
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.topBarBrand}
          onClick={() => router.push("/")}
        >
          <img
            src="/images/Codely_Transparent.png"
            alt="Codely"
            className={styles.topBarLogo}
          />
        </button>
        <img
          src="/images/user-avatar.svg"
          alt="Profile"
          className={styles.topBarAvatar}
        />
      </header>

      <div className={styles.page}>
        {/* Left: Instructions */}
        <aside className={styles.instructionsPane}>
          <div className={styles.instructionsScroll}>
            <p className={styles.paneLabel}>Instructions</p>

            <h2 className={styles.instructionsTitle}>{problem.title}</h2>
            <div className={styles.instructionsMeta}>
              <span
                className={`${styles.difficultyPill} ${styles["difficulty_" + problem.difficulty]}`}
              >
                {problem.difficulty}
              </span>
              {problem.estimatedMinutes && (
                <span className={styles.estimate}>
                  ~{problem.estimatedMinutes} min
                </span>
              )}
            </div>

            <p className={styles.instructionsBody}>{problem.statement}</p>

            {examples.length > 0 && (
              <div className={styles.instructionsSection}>
                <h3 className={styles.instructionsSectionTitle}>Examples</h3>
                {examples.map((ex, i) => (
                  <div key={i} className={styles.exampleRow}>
                    <code className={styles.exampleIn}>Input: {ex.input}</code>
                    <code className={styles.exampleOut}>Output: {ex.output}</code>
                  </div>
                ))}
              </div>
            )}

            {constraintLines.length > 0 && (
              <div className={styles.paneSection}>
                <p className={styles.paneSectionLabel}>Constraints</p>
                <ul className={styles.constraintsList}>
                  {constraintLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
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

            {sampleTests.length > 0 && (
              <div className={styles.paneSection}>
                <p className={styles.paneSectionLabel}>Test Suite</p>
                {sampleTests.map((t, i) => (
                  <div key={i} className={styles.sampleRow}>
                    <code>in: {JSON.stringify(t.input)}</code>
                    <code>&rarr; {JSON.stringify(t.expected_output)}</code>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.sidebarFooter}>
            <button
              type="button"
              className={styles.footerLink}
              onClick={() => router.push("/")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              Support
            </button>
            <button
              type="button"
              className={styles.footerLink}
              onClick={() => router.push("/")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Documentation
            </button>
          </div>
        </aside>

        {/* Center: Editor */}
        <main className={styles.centerPane}>
          <div className={styles.editorTabs}>
            <span className={styles.editorTabActive}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              solution.py
            </span>
            <div className={styles.editorTabActions}>
              <span className={styles.saveIndicator}>
                {saveState === "saving" && "Saving…"}
                {saveState === "saved" && "✓ Saved"}
              </span>
            </div>
          </div>

          <div className={styles.editor}>
            <MonacoEditor
              height="100%"
              language="python"
              theme={theme === "light" ? "light" : "vs-dark"}
              value={code}
              onChange={onCodeChange}
              options={{
                fontSize: 13,
                fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 4,
                insertSpaces: true,
                lineNumbers: "on",
                renderLineHighlight: "line",
                automaticLayout: true,
                padding: { top: 16, bottom: 16 },
                scrollbar: {
                  verticalScrollbarSize: 4,
                  horizontalScrollbarSize: 4,
                },
              }}
            />
          </div>

          {/* Output terminal */}
          <div className={styles.terminal}>
            <div className={styles.terminalHeader}>
              <span className={styles.terminalTitle}>OUTPUT TERMINAL</span>
              <span className={styles.terminalStatus}>
                {submitState === "running" ? "Running…" : "Ready"}
              </span>
            </div>
            <div className={styles.terminalBody}>
              {submitState === "idle" && (
                <span className={styles.terminalPlaceholder}>
                  Submit your code to see test results here.
                </span>
              )}
              {submitState === "running" && (
                <span className={styles.terminalLine}>Running tests…</span>
              )}
              {submitState === "error" && (
                <span className={styles.terminalError}>{submitError}</span>
              )}
              {submitState === "done" && submitResult && (
                <div className={styles.terminalResults}>
                  {submitResult.results.map((r, i) => (
                    <div key={i} className={`${styles.terminalLine} ${r.passed ? styles.terminalPass : styles.terminalFail}`}>
                      <span>{r.passed ? "[PASS]" : "[FAIL]"}</span>
                      {r.visibility === "public_sample" ? (
                        <span>Test {i + 1}: in {JSON.stringify(r.input)} → expected {JSON.stringify(r.expected)}{!r.passed && r.actual != null ? `, got ${r.actual}` : ""}</span>
                      ) : (
                        <span>Hidden test {i + 1} {r.passed ? "passed" : "failed"}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right: Reflective question + submit */}
        <aside className={styles.rightPane}>
          <div className={styles.rightPaneScroll}>
            <p className={styles.paneLabel}>Reflective Question</p>

            {reflectLoadState === "loading" && (
              <p className={styles.reflectEmpty}>Loading…</p>
            )}

            {reflectLoadState !== "loading" && reflectInstances.length === 0 && (
              <p className={styles.reflectEmpty}>
                No reflective question for this problem.
              </p>
            )}

            {reflectInstances.map((inst) => (
              <div key={inst.id} className={styles.reflectItem}>
                <p className={styles.paneSectionLabel}>Problem Statement</p>
                <div className={styles.reflectQuoteBox}>
                  <p className={styles.reflectQuestion}>
                    &ldquo;{inst.rendered_text}&rdquo;
                    {inst.is_required && (
                      <span className={styles.reflectRequired}> *</span>
                    )}
                  </p>
                </div>

                {inst.isAnswered ? (
                  <div className={styles.reflectLockedBox}>
                    <p className={styles.reflectAnswered}>
                      {inst.answer.isSkipped
                        ? "(skipped)"
                        : inst.answer.answerText}
                    </p>
                    {inst.answer.aiScore != null && (
                      <div className={styles.reflectFeedbackBox}>
                        <span className={styles.reflectScore}>
                          Understanding: {inst.answer.aiScore} / 5
                        </span>
                        {inst.answer.aiFeedback && (
                          <p className={styles.reflectFeedback}>
                            {inst.answer.aiFeedback}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <textarea
                      className={styles.reflectInput}
                      value={reflectAnswers[inst.id] || ""}
                      onChange={(e) => onReflectChange(inst.id, e.target.value)}
                      rows={6}
                      placeholder="Type answer here ..."
                    />
                    <button
                      type="button"
                      className={styles.lockAnswerBtn}
                      onClick={() => lockReflectAnswer(inst.id)}
                      disabled={lockingId === inst.id}
                    >
                      {lockingId === inst.id ? "Locking…" : "Lock Answer"}
                    </button>
                  </>
                )}
              </div>
            ))}

            {gateError && <p className={styles.reflectError}>{gateError}</p>}
          </div>

          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmitCode}
            disabled={submitDisabled}
          >
            {submitState === "running"
              ? "Running…"
              : savingGate
                ? "Saving…"
                : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Submit Code
                  </>
                )}
          </button>
        </aside>
      </div>

      {/* Challenge Solved modal */}
      {submitState === "done" && submitResult?.allPassed && (
        <div className={styles.modalBackdrop}>
          <div className={styles.solvedModal}>
            <div className={styles.solvedIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className={styles.solvedBadge}>COMPLETED</span>
            <h2 className={styles.solvedTitle}>Challenge Solved!</h2>

            <div className={styles.solvedScoreBlock}>
              <div className={styles.solvedScoreHeader}>
                <span className={styles.solvedScoreLabel}>CODE EFFICIENCY SCORE</span>
                <span className={styles.solvedScoreVal}>{submitResult.scorePercentage}%</span>
              </div>
              <div className={styles.solvedScoreTrack}>
                <div className={styles.solvedScoreFill} style={{ width: `${submitResult.scorePercentage}%` }} />
              </div>
            </div>

            <div className={styles.solvedActions}>
              <button type="button" className={styles.solvedNextBtn} onClick={() => router.push("/")}>
                NEXT PROBLEM →
              </button>
              <button type="button" className={styles.solvedDashBtn} onClick={() => router.push("/")}>
                GO BACK TO DASHBOARD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Partial pass modal */}
      {submitState === "done" && submitResult && !submitResult.allPassed && (
        <div className={styles.modalBackdrop}>
          <div className={styles.solvedModal}>
            <h2 className={styles.solvedTitle} style={{ color: "#f59e0b" }}>
              {submitResult.passedCount}/{submitResult.totalTests} Tests Passed
            </h2>
            <p className={styles.solvedPartialDesc}>
              Score: {submitResult.scorePercentage}% — keep refining your solution.
            </p>
            <div className={styles.solvedActions}>
              <button type="button" className={styles.solvedNextBtn} onClick={() => setSubmitState("idle")}>
                KEEP TRYING
              </button>
              <button type="button" className={styles.solvedDashBtn} onClick={() => router.push("/")}>
                GO BACK TO DASHBOARD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
