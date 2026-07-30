"use client";

// src/app/practice/[slug]/page.js
// Phase 6 (Steps 29-34) — Coding practice page.
// Split view: problem statement + samples on the left, Monaco editor on the right.
// Creates a coding session on load and autosaves the editor code on a debounce.
//
// Reflection flow:
//   before_submit      — gates grading. Required prompt must be answered once.
//   after_failed_test  — offered AFTER a failing verdict. Never gates anything;
//                        the student already has their result.
//
// Answers that Step 34 has already AI-scored are immutable to the student under
// RLS (cqa_update_own requires ai_score IS NULL). They are therefore rendered
// read-only WITH their score and feedback, and skipped when re-submitting —
// re-POSTing one returns 409 and previously blocked grading permanently.

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Editor from "@monaco-editor/react";
import styles from "./PracticeProblem.module.css";

const AUTOSAVE_DELAY_MS = 1500;
const EDITOR_HEIGHT = "460px"; // must match .editorWrapper height in the CSS

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

  // Steps 32-34 — reflective question gate shown before grading.
  // idle | loading | asking | saving | reviewing
  // `reviewing` shows the AI evaluation of the just-submitted reflection BEFORE
  // the verdict. Deliberate ordering: once a student sees "All tests passed"
  // they have little interest in feedback about their reasoning, so the
  // feedback is shown while the outcome is still unknown — the same window in
  // which the question was asked.
  const [reflectState, setReflectState] = useState("idle");
  const [reflectInstances, setReflectInstances] = useState([]);
  const [reflectAnswers, setReflectAnswers] = useState({}); // { [instanceId]: text }
  const [reflectError, setReflectError] = useState("");
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

  // Monaco hands back the new value directly, not an event. It also handles
  // Tab-as-indent natively, so no manual key handling is needed.
  const onCodeChange = (next) => {
    const value = next ?? "";
    setCode(value);
    scheduleSave(value);
  };

  // Step 1 of submit: open the reflective-question gate. Fetches (and creates)
  // the instances for this session, then shows them. If there are none, all are
  // already answered, or the fetch fails, we do NOT block the student.
  const handleRunClick = async () => {
    if (!sessionId) return;
    setReflectError("");
    setReflectState("loading");
    try {
      const res = await fetch(`/api/practice/reflect?sessionId=${sessionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load questions.");

      const instances = data.instances || [];
      const unanswered = instances.filter((i) => !i.isAnswered);

      // Nothing to ask, or the student already reflected in this session —
      // either way the gate is satisfied, so go straight to grading. Without
      // this, reopening a session after answering left the student unable to
      // submit at all.
      if (instances.length === 0 || unanswered.length === 0) {
        setReflectState("idle");
        await runGrading();
        return;
      }

      reflectShownAt.current = Date.now();
      setReflectInstances(instances);
      setReflectState("asking");
    } catch (err) {
      // Reflective questions must never block grading. Log intent, grade anyway.
      console.warn("Reflection gate skipped:", err.message);
      setReflectState("idle");
      await runGrading();
    }
  };

  const onReflectChange = (instanceId, text) => {
    setReflectAnswers((prev) => ({ ...prev, [instanceId]: text }));
  };

  // Step 2: save each unanswered answer, then grade. `skipAll` handles Skip.
  const submitReflection = async (skipAll = false) => {
    setReflectError("");
    setReflectState("saving");

    const elapsed = reflectShownAt.current
      ? Math.round((Date.now() - reflectShownAt.current) / 1000)
      : null;

    try {
      for (const inst of reflectInstances) {
        // Already answered — the row is immutable to the student under RLS once
        // Step 34 has scored it, so re-POSTing guarantees a 409. Previously this
        // threw and grading was never reached.
        if (inst.isAnswered) continue;

        const text = (reflectAnswers[inst.id] || "").trim();
        const isSkipped = skipAll || text.length === 0;

        // A required question cannot be skipped with empty text.
        if (inst.is_required && isSkipped) {
          setReflectError(
            "Please answer the required question before submitting.",
          );
          setReflectState("asking");
          return;
        }

        const res = await fetch("/api/practice/reflect/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instanceId: inst.id,
            answerText: isSkipped ? null : text,
            isSkipped,
            timeToAnswerSeconds: elapsed,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Could not save your answer.");
        }
      }

      // Re-read so the Step 34 evaluation written server-side can be shown.
      // Omitting trigger params keeps this a plain read with no side effects.
      const refreshed = await fetch(
        `/api/practice/reflect?sessionId=${sessionId}`,
      );
      const refreshedData = await refreshed.json();
      if (refreshed.ok && refreshedData.instances?.length) {
        setReflectInstances(refreshedData.instances);
        setReflectState("reviewing");
        return;
      }

      // No feedback to show (evaluation may have degraded gracefully) — go
      // straight to grading rather than stalling the student.
      setReflectState("idle");
      await runGrading();
    } catch (err) {
      setReflectError(err.message);
      setReflectState("asking");
    }
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

  // Everything in the gate has been answered already — offer to continue
  // rather than a submit button that would 409.
  const allReflectAnswered =
    reflectInstances.length > 0 && reflectInstances.every((i) => i.isAnswered);

  // Renders one already-scored answer read-only, including the Step 34
  // evaluation. This is the only place the student ever sees that feedback.
  const renderEvaluated = (inst) => (
    <div key={inst.id} className={styles.reflectItem}>
      <span className={styles.reflectQuestion}>{inst.rendered_text}</span>
      <p className={styles.reflectAnswered}>
        {inst.answer.isSkipped ? "(skipped)" : inst.answer.answerText}
      </p>
      <div className={styles.reflectFeedbackBox}>
        <span className={styles.reflectScore}>
          Understanding: {inst.answer.aiScore} / 5
        </span>
        {inst.answer.aiFeedback && (
          <p className={styles.reflectFeedback}>{inst.answer.aiFeedback}</p>
        )}
        {Array.isArray(inst.answer.conceptsMisunderstood) &&
          inst.answer.conceptsMisunderstood.length > 0 && (
            <p className={styles.reflectGaps}>
              Worth revisiting: {inst.answer.conceptsMisunderstood.join(", ")}
            </p>
          )}
      </div>
    </div>
  );

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

          <div className={styles.editorWrapper}>
            <Editor
              height={EDITOR_HEIGHT}
              language="python"
              theme="vs-dark"
              value={code}
              onChange={onCodeChange}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                tabSize: 4,
                insertSpaces: true,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                padding: { top: 16 },
              }}
            />
          </div>

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

          {/* Reflective question gate (Steps 32-34) */}
          {(reflectState === "asking" || reflectState === "reviewing") && (
            <div className={styles.reflectPanel}>
              <h3 className={styles.reflectTitle}>
                {reflectState === "reviewing"
                  ? "How your reasoning looked"
                  : allReflectAnswered
                    ? "Your reflection on this solution"
                    : "Before you submit — reflect on your solution"}
              </h3>

              {reflectInstances.map((inst) =>
                inst.isEvaluated ? (
                  renderEvaluated(inst)
                ) : (
                  <div key={inst.id} className={styles.reflectItem}>
                    <label className={styles.reflectQuestion}>
                      {inst.rendered_text}
                      {inst.is_required && (
                        <span className={styles.reflectRequired}> *</span>
                      )}
                    </label>
                    <textarea
                      className={styles.reflectInput}
                      value={reflectAnswers[inst.id] || ""}
                      onChange={(e) => onReflectChange(inst.id, e.target.value)}
                      rows={3}
                      placeholder="Type your answer…"
                    />
                  </div>
                ),
              )}

              {reflectError && (
                <span className={styles.reflectError}>{reflectError}</span>
              )}

              <div className={styles.reflectActions}>
                {reflectState === "reviewing" ? (
                  <button
                    type="button"
                    className={styles.runBtn}
                    onClick={() => {
                      setReflectState("idle");
                      runGrading();
                    }}
                  >
                    See my results
                  </button>
                ) : allReflectAnswered ? (
                  <button
                    type="button"
                    className={styles.runBtn}
                    onClick={() => {
                      setReflectState("idle");
                      runGrading();
                    }}
                  >
                    Continue to grading
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.runBtn}
                      onClick={() => submitReflection(false)}
                      disabled={reflectState === "saving"}
                    >
                      {reflectState === "saving"
                        ? "Evaluating…"
                        : "Submit answer & grade"}
                    </button>
                    <button
                      type="button"
                      className={styles.reflectSkipBtn}
                      onClick={() => submitReflection(true)}
                      disabled={
                        reflectState === "saving" ||
                        reflectInstances.some(
                          (i) => i.is_required && !i.isAnswered,
                        )
                      }
                      title={
                        reflectInstances.some(
                          (i) => i.is_required && !i.isAnswered,
                        )
                          ? "A required question must be answered."
                          : "Skip and grade"
                      }
                    >
                      Skip
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className={styles.editorFooter}>
            <button
              type="button"
              className={styles.runBtn}
              onClick={handleRunClick}
              disabled={
                submitState === "running" ||
                reflectState === "loading" ||
                reflectState === "asking" ||
                reflectState === "saving" ||
                reflectState === "reviewing"
              }
            >
              {submitState === "running"
                ? "Running…"
                : reflectState === "loading"
                  ? "Loading…"
                  : "Run & Submit"}
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

            {/* Completion state. Deliberately NOT an automatic redirect: the
                student still wants to review their passing code, the AI
                feedback and the runtime. Leaving is offered, not imposed. */}
            {submitState === "done" && submitResult?.allPassed && (
              <div className={styles.completionPanel}>
                <span className={styles.completionHeadline}>
                  {recCompleted
                    ? "Nice — this problem is off your practice list."
                    : "Solved."}
                </span>
                <div className={styles.completionActions}>
                  <button
                    type="button"
                    className={styles.runBtn}
                    onClick={() => router.push("/")}
                  >
                    Back to dashboard
                  </button>
                </div>
              </div>
            )}

            {/* after_failed_test reflection — appears BELOW the verdict, and
                never blocks anything. The student already has their result. */}
            {postFailState !== "idle" && postFailInstances.length > 0 && (
              <div className={styles.postFailPanel}>
                <h3 className={styles.reflectTitle}>
                  {postFailState === "done"
                    ? "Your debugging reflection"
                    : "A test failed — think it through"}
                </h3>

                {postFailInstances.map((inst) =>
                  inst.isEvaluated ? (
                    renderEvaluated(inst)
                  ) : (
                    <div key={inst.id} className={styles.reflectItem}>
                      <label className={styles.reflectQuestion}>
                        {inst.rendered_text}
                      </label>
                      <textarea
                        className={styles.reflectInput}
                        value={postFailAnswers[inst.id] || ""}
                        onChange={(e) =>
                          onPostFailChange(inst.id, e.target.value)
                        }
                        rows={3}
                        placeholder="What's your hypothesis?"
                      />
                    </div>
                  ),
                )}

                {postFailError && (
                  <span className={styles.reflectError}>{postFailError}</span>
                )}

                {postFailState !== "done" && (
                  <div className={styles.reflectActions}>
                    <button
                      type="button"
                      className={styles.runBtn}
                      onClick={submitPostFailReflection}
                      disabled={postFailState === "saving"}
                    >
                      {postFailState === "saving"
                        ? "Evaluating…"
                        : "Submit reflection"}
                    </button>
                    <button
                      type="button"
                      className={styles.reflectSkipBtn}
                      onClick={() => setPostFailState("idle")}
                      disabled={postFailState === "saving"}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
