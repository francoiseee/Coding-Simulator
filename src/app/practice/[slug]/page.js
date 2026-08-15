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
import Link from "next/link";
import MonacoEditor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/lib/theme";
import styles from "./PracticeProblem.module.css";

// Formats a sample-test value for human reading.
// Test `input` is stored as an array of ARGUMENTS. A single-argument problem is
// therefore stored double-wrapped, e.g. [[["Alice",[90,85,92]]]]. We unwrap the
// outer arguments array so the student sees the actual argument, and pretty-print
// with spaces after commas/colons so nested structures don't read as one blob.
function formatValue(value) {
  const json = JSON.stringify(value);
  if (json === undefined) return "None";
  // Add a space after every comma and colon that isn't inside a string.
  let out = "";
  let inStr = false;
  for (let i = 0; i < json.length; i += 1) {
    const ch = json[i];
    if (ch === '"' && json[i - 1] !== "\\") inStr = !inStr;
    out += ch;
    if (!inStr && (ch === "," || ch === ":")) out += " ";
  }
  return out;
}

// Unwraps the arguments array. If there is exactly one argument, show it directly;
// if several, show them comma-separated as the student would pass them.
function formatInput(input) {
  const args = Array.isArray(input) ? input : [input];
  return args.map((a) => formatValue(a)).join(", ");
}

const AUTOSAVE_DELAY_MS = 1500;

export default function PracticeProblemPage() {
  const { slug } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();

  // Profile dropdown in the top bar — mirrors the one on the dashboard Navbar
  // (theme toggle + log off) so behavior is consistent across the app.
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target)
      ) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const [problem, setProblem] = useState(null);
  const [sampleTests, setSampleTests] = useState([]);
  const [hiddenTestCount, setHiddenTestCount] = useState(0);
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
        setHiddenTestCount(pData.hiddenTestCount || 0);
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
    // Clear any prior graded result so the terminal reflects this run, not a
    // stale submission. The run branches render only while submitState is idle.
    setSubmitResult(null);
    setSubmitState("idle");
    setSubmitError("");
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
      const evaluated = (refreshedData.instances || []).filter(
        (i) => i.isEvaluated,
      );
      // Only pause to show feedback if Step 34 actually produced a score. If it
      // degraded (no evaluated answers), don't show an empty feedback modal —
      // proceed straight to grading.
      if (refreshed.ok && evaluated.length > 0) {
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
      <div className={styles.errorStateWrapper}>
        <p>Something went wrong: {errorMessage}</p>
        <button
          type="button"
          className={styles.errorBackBtn}
          onClick={() => router.push("/")}
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  const hints = Array.isArray(problem.hints) ? problem.hints : [];
  // `problem.examples` is stored as { raw: "Input: ...\nOutput: ..." } — a single
  // preformatted string. Older/seeded rows may instead be an array of
  // { input, output } objects, or null. Normalize all three to a raw string we
  // can render in a <pre>. `null`/missing yields an empty string (section hidden).
  const exampleRaw = (() => {
    const ex = problem.examples;
    if (!ex) return "";
    if (typeof ex === "string") return ex;
    if (Array.isArray(ex)) {
      return ex
        .map((e) => `Input: ${e.input}\nOutput: ${e.output}`)
        .join("\n\n");
    }
    if (typeof ex === "object" && typeof ex.raw === "string") return ex.raw;
    return "";
  })();

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
    <div className={styles.appShell}>
      {/* Top header */}
      <header className={styles.topbar}>
        <Link href="/" className={styles.topbarLogo}>
          <img
            src="/images/Codely_Transparent.png"
            alt="Codely"
            className={styles.topbarLogoImage}
          />
        </Link>

        <div className={styles.profileWrapper} ref={profileMenuRef}>
          <button
            type="button"
            className={styles.topbarAvatar}
            onClick={() => setShowProfileMenu((v) => !v)}
            title="Profile Menu"
          >
            <img src="/images/user-avatar.svg" alt="User Profile" />
          </button>

          {showProfileMenu && (
            <div className={styles.dropdownMenu}>
              <div className={styles.dropdownHeader}>
                <p className={styles.dropdownTitle}>User Session</p>
              </div>

              <div className={styles.themeRow}>
                <span className={styles.themeLabel}>Theme</span>
                <button
                  type="button"
                  className={styles.themeToggle}
                  onClick={toggleTheme}
                  title={
                    theme === "dark"
                      ? "Switch to light mode"
                      : "Switch to dark mode"
                  }
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="4" />
                      <line x1="12" y1="2" x2="12" y2="4" />
                      <line x1="12" y1="20" x2="12" y2="22" />
                      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
                      <line x1="2" y1="12" x2="4" y2="12" />
                      <line x1="20" y1="12" x2="22" y2="12" />
                      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
                      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
                    </svg>
                  ) : (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  )}
                </button>
              </div>

              <button
                type="button"
                className={styles.dropdownItem}
                onClick={() => {
                  setShowProfileMenu(false);
                  handleLogOut();
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.logoutIcon}
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Log Off</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={styles.page}>
        {/* Left Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.challengeHeader}>
            <div className={styles.challengeHeaderLeft}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => router.push("/")}
                title="Back to dashboard"
                aria-label="Back to dashboard"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className={styles.challengeTitle}>PYTHON CHALLENGE</span>
            </div>
            <span className={styles.challengeStatus}>
              <span className={styles.statusDot} />
              ACTIVE SESSION
            </span>
          </div>

        <div className={styles.sidebarScroll}>
          {/* Instructions */}
          <div className={styles.problemBlock}>
            <p className={styles.problemBlockLabel}>PROBLEM</p>
            <h2 className={styles.problemTitle}>{problem.title}</h2>
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

            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p style={{ marginBottom: "0.75rem", lineHeight: "1.6" }}>
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul style={{ paddingLeft: "1.25rem", marginBottom: "0.75rem" }}>
                    {children}
                  </ul>
                ),
                li: ({ children }) => (
                  <li style={{ marginBottom: "0.3rem", lineHeight: "1.6" }}>
                    {children}
                  </li>
                ),
                code: ({ children }) => (
                  <code
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      padding: "1px 5px",
                      borderRadius: "3px",
                      fontSize: "0.85em",
                      fontFamily: "monospace",
                    }}
                  >
                    {children}
                  </code>
                ),
                strong: ({ children }) => (
                  <strong style={{ color: "var(--accent-teal)", fontWeight: 600 }}>
                    {children}
                  </strong>
                ),
              }}
            >
              {problem.statement}
            </ReactMarkdown>

            {exampleRaw && (
              <div className={styles.examplesBlock}>
                <span className={styles.examplesLabel}>EXAMPLES</span>
                <pre className={styles.exampleRaw}>{exampleRaw}</pre>
              </div>
            )}

            {problem.constraints && (
              <div className={styles.constraintsBlock}>
                <span className={styles.examplesLabel}>CONSTRAINTS</span>
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
          </div>

          {/* Sample tests */}
          {sampleTests.length > 0 && (
            <div className={styles.testSuiteBlock}>
              <p className={styles.problemBlockLabel}>TEST SUITE READY</p>
              {sampleTests.map((t, i) => (
                <div key={i} className={styles.sampleRow}>
                  <span className={styles.sampleCaseLabel}>
                    Example {i + 1}
                  </span>
                  <div className={styles.sampleField}>
                    <span className={styles.sampleFieldLabel}>Input</span>
                    <code className={styles.sampleFieldValue}>
                      {formatInput(t.input)}
                    </code>
                  </div>
                  <div className={styles.sampleField}>
                    <span className={styles.sampleFieldLabel}>
                      Expected output
                    </span>
                    <code className={styles.sampleFieldValue}>
                      {formatValue(t.expected_output)}
                    </code>
                  </div>
                </div>
              ))}
              {hiddenTestCount > 0 && (
                <p className={styles.hiddenTestNote}>
                  There {hiddenTestCount === 1 ? "is" : "are"}{" "}
                  {hiddenTestCount} hidden test{" "}
                  {hiddenTestCount === 1 ? "case" : "cases"} that will also
                  run when you submit.
                </p>
              )}
              <div className={styles.testSuiteFooter}>
                <span>Python 3.12</span>
                <span className={styles.envStable}>● Environment Stable</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.actionButtons}>
          <button
            type="button"
            className={styles.runBtn}
            onClick={handleRunCode}
            disabled={
              runState === "running" ||
              submitState === "running" ||
              reflectState === "asking" ||
              reflectState === "saving"
            }
          >
            {runState === "running" ? "Running…" : "Run Code"}
          </button>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleRunClick}
            disabled={
              submitState === "running" ||
              reflectState === "loading" ||
              reflectState === "asking" ||
              reflectState === "saving"
            }
          >
            {submitState === "running"
              ? "Running…"
              : reflectState === "loading"
                ? "Loading…"
                : "Submit Code"}
          </button>
        </div>
      </aside>

      {/* Center: Editor */}
      <main className={styles.centerPane}>
        <div className={styles.editorTabs}>
          <span className={styles.editorTabActive}>solution.py</span>
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
            theme={theme === "dark" ? "codely-dark" : "codely-light"}
            beforeMount={(monaco) => {
              // Stock vs-dark/vs are Monaco's defaults and don't relate to the
              // app palette — vs-dark's #1e1e1e is actually lighter than the
              // navbar. Anchor the editor background to --background instead,
              // which is deliberately darker (dark mode) / more muted (light
              // mode) than the navbar's flat rgb(10,15,26)/rgb(255,255,255).
              monaco.editor.defineTheme("codely-dark", {
                base: "vs-dark",
                inherit: true,
                rules: [],
                colors: { "editor.background": "#06070a" },
              });
              monaco.editor.defineTheme("codely-light", {
                base: "vs",
                inherit: true,
                rules: [],
                colors: { "editor.background": "#eef1f7" },
              });
            }}
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
              {submitState === "running" || runState === "running"
                ? "Running…"
                : "Ready"}
            </span>
          </div>
          <div className={styles.terminalBody}>
            {submitState === "idle" && runState === "idle" && (
              <span className={styles.terminalPlaceholder}>
                Run your code against the sample tests, or submit for grading.
              </span>
            )}

            {/* Run (ungraded) output — sample tests only. */}
            {submitState === "idle" && runState === "running" && (
              <span className={styles.terminalLine}>Running sample tests…</span>
            )}
            {submitState === "idle" && runState === "error" && (
              <span className={styles.terminalError}>{runError}</span>
            )}
            {submitState === "idle" && runState === "done" && runResult && (
              <div className={styles.terminalResults}>
                <span className={styles.terminalRunLabel}>
                  RUN (UNGRADED) — {runResult.passedCount}/
                  {runResult.totalTests} PASSED ON SAMPLE TESTS
                </span>
                {runResult.results.map((r, i) => (
                  <div
                    key={i}
                    className={`${styles.terminalLine} ${r.passed ? styles.terminalPass : styles.terminalFail}`}
                  >
                    <span>{r.passed ? "[PASS]" : "[FAIL]"}</span>
                    <div className={styles.terminalResultHeader}>
                      Test {i + 1}
                    </div>
                    <div className={styles.terminalResultDetail}>
                      <span className={styles.terminalResultLabel}>Input:</span>{" "}
                      {formatInput(r.input)}
                    </div>
                    <div className={styles.terminalResultDetail}>
                      <span className={styles.terminalResultLabel}>Expected:</span>{" "}
                      {formatValue(r.expected)}
                    </div>
                    {!r.passed && r.actual != null && (
                      <div className={styles.terminalResultDetail}>
                        <span className={styles.terminalResultLabel}>Got:</span>{" "}
                        {r.actual}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Submit (graded) output. */}
            {submitState === "running" && (
              <span className={styles.terminalLine}>Running tests…</span>
            )}
            {submitState === "error" && (
              <span className={styles.terminalError}>{submitError}</span>
            )}
            {submitState === "done" && submitResult && (
              <div className={styles.terminalResults}>
                {submitResult.results.map((r, i) => (
                  <div
                    key={i}
                    className={`${styles.terminalLine} ${r.passed ? styles.terminalPass : styles.terminalFail}`}
                  >
                    <span>{r.passed ? "[PASS]" : "[FAIL]"}</span>
                    {r.visibility === "public_sample" ? (
                      <>
                        <div className={styles.terminalResultHeader}>
                          Test {i + 1}
                        </div>
                        <div className={styles.terminalResultDetail}>
                          <span className={styles.terminalResultLabel}>Input:</span>{" "}
                          {formatInput(r.input)}
                        </div>
                        <div className={styles.terminalResultDetail}>
                          <span className={styles.terminalResultLabel}>Expected:</span>{" "}
                          {formatValue(r.expected)}
                        </div>
                        {!r.passed && r.actual != null && (
                          <div className={styles.terminalResultDetail}>
                            <span className={styles.terminalResultLabel}>Got:</span>{" "}
                            {r.actual}
                          </div>
                        )}
                      </>
                    ) : (
                      <span>
                        Hidden test {i + 1} {r.passed ? "passed" : "failed"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Right: Reflective question panel — inline, not a modal. Shows the
          pre-submit gate, its feedback, and the post-fail invitation in place
          depending on which reflection state is active; otherwise idle copy. */}
      <aside className={styles.rightPane}>
        <div className={styles.reflectPaneHeader}>
          <span className={styles.reflectPaneTitle}>REFLECTIVE QUESTION</span>
        </div>

        <div className={styles.reflectPaneBody}>
          {reflectState === "loading" && (
            <p className={styles.reflectEmptyState}>Loading questions…</p>
          )}

          {(reflectState === "asking" || reflectState === "saving") && (
            <>
              {reflectInstances
                .filter((inst) => !inst.isAnswered)
                .map((inst) => (
                  <div key={inst.id} className={styles.reflectCard}>
                    <span className={styles.reflectCardLabel}>
                      PROBLEM STATEMENT
                    </span>
                    <p className={styles.reflectCardQuote}>
                      &ldquo;{inst.rendered_text}&rdquo;
                      {inst.is_required && (
                        <span className={styles.reflectRequired}> *</span>
                      )}
                    </p>
                    <textarea
                      className={styles.reflectInput}
                      value={reflectAnswers[inst.id] || ""}
                      onChange={(e) =>
                        onReflectChange(inst.id, e.target.value)
                      }
                      rows={4}
                      placeholder="TYPE ANSWER HERE …"
                      disabled={reflectState === "saving"}
                    />
                  </div>
                ))}

              {reflectError && (
                <span className={styles.reflectError}>{reflectError}</span>
              )}

              <div className={styles.reflectActions}>
                <button
                  type="button"
                  className={styles.reflectSubmitBtn}
                  onClick={() => submitReflection(false)}
                  disabled={reflectState === "saving"}
                >
                  {reflectState === "saving" ? "LOCKING…" : "LOCK ANSWER"}
                </button>
                <button
                  type="button"
                  className={styles.reflectSkipBtn}
                  onClick={() => submitReflection(true)}
                  disabled={
                    reflectState === "saving" ||
                    reflectInstances.some((i) => i.is_required)
                  }
                >
                  Skip
                </button>
              </div>
            </>
          )}

          {/* Feedback on the just-submitted reflection, shown BEFORE the
              grading verdict — the only place this evaluation is surfaced. */}
          {reflectState === "reviewing" && (
            <>
              <p className={styles.reflectPaneSubLabel}>
                Feedback on your reasoning
              </p>
              {reflectInstances
                .filter((inst) => inst.isEvaluated)
                .map((inst) => renderEvaluated(inst))}
              <div className={styles.reflectActions}>
                <button
                  type="button"
                  className={styles.reflectSubmitBtn}
                  onClick={async () => {
                    setReflectState("idle");
                    await runGrading();
                  }}
                >
                  CONTINUE TO RESULTS
                </button>
              </div>
            </>
          )}

          {/* Post-fail invitation — never gates anything, so Skip just
              dismisses it without saving. */}
          {reflectState === "idle" &&
            (postFailState === "asking" || postFailState === "saving") && (
              <>
                {postFailInstances.map((inst) => (
                  <div key={inst.id} className={styles.reflectCard}>
                    <span className={styles.reflectCardLabel}>
                      PROBLEM STATEMENT
                    </span>
                    <p className={styles.reflectCardQuote}>
                      &ldquo;{inst.rendered_text}&rdquo;
                    </p>
                    <textarea
                      className={styles.reflectInput}
                      value={postFailAnswers[inst.id] || ""}
                      onChange={(e) =>
                        onPostFailChange(inst.id, e.target.value)
                      }
                      rows={4}
                      placeholder="TYPE ANSWER HERE …"
                      disabled={postFailState === "saving"}
                    />
                  </div>
                ))}

                {postFailError && (
                  <span className={styles.reflectError}>{postFailError}</span>
                )}

                <div className={styles.reflectActions}>
                  <button
                    type="button"
                    className={styles.reflectSubmitBtn}
                    onClick={submitPostFailReflection}
                    disabled={postFailState === "saving"}
                  >
                    {postFailState === "saving" ? "LOCKING…" : "LOCK ANSWER"}
                  </button>
                  <button
                    type="button"
                    className={styles.reflectSkipBtn}
                    onClick={() => setPostFailState("idle")}
                    disabled={postFailState === "saving"}
                  >
                    Skip
                  </button>
                </div>
              </>
            )}

          {reflectState === "idle" && postFailState === "done" && (
            <p className={styles.reflectEmptyState}>
              Thanks for reflecting — your notes were saved.
            </p>
          )}

          {reflectState === "idle" &&
            postFailState === "idle" &&
            postFailInstances.length === 0 && (
              <p className={styles.reflectEmptyState}>
                Reflective questions will appear here when you submit your
                code.
              </p>
            )}
        </div>
      </aside>
      </div>

      {/* Challenge Solved modal */}
      {submitState === "done" && submitResult?.allPassed && (
        <div className={styles.modalBackdrop}>
          <div className={styles.solvedModal}>
            <div className={styles.solvedIcon}>
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className={styles.solvedBadge}>COMPLETED</span>
            <h2 className={styles.solvedTitle}>Challenge Solved!</h2>

            <div className={styles.solvedScoreBlock}>
              <div className={styles.solvedScoreHeader}>
                <span className={styles.solvedScoreLabel}>
                  CODE EFFICIENCY SCORE
                </span>
                <span className={styles.solvedScoreVal}>
                  {submitResult.scorePercentage}%
                </span>
              </div>
              <div className={styles.solvedScoreTrack}>
                <div
                  className={styles.solvedScoreFill}
                  style={{ width: `${submitResult.scorePercentage}%` }}
                />
              </div>
            </div>

            <div className={styles.solvedActions}>
              <button
                type="button"
                className={styles.solvedNextBtn}
                onClick={() => router.push("/")}
              >
                NEXT PROBLEM →
              </button>
              <button
                type="button"
                className={styles.solvedDashBtn}
                onClick={() => router.push("/")}
              >
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
              Score: {submitResult.scorePercentage}% — keep refining your
              solution.
            </p>
            <div className={styles.solvedActions}>
              <button
                type="button"
                className={styles.solvedNextBtn}
                onClick={() => setSubmitState("idle")}
              >
                KEEP TRYING
              </button>
              <button
                type="button"
                className={styles.solvedDashBtn}
                onClick={() => router.push("/")}
              >
                GO BACK TO DASHBOARD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
