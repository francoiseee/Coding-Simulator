"use client";

// src/components/diagnostic/DiagnosticRunner.jsx
// Step 15 — Diagnostic interface.
// Flow:
//   1. On mount, POST /api/diagnostic/start  -> get attemptId
//   2. GET /api/diagnostic/questions          -> get safe questions (no answer key)
//   3. Render one question at a time; track the student's selected option key
//   4. (Step 16 will POST answers to /api/diagnostic/answers — stubbed here)
//
// Scoring is intentionally NOT done in the browser. The client only records which
// option key the student picked; correctness is evaluated server-side later.

import { useEffect, useState } from "react";
import styles from "./DiagnosticRunner.module.css";

export default function DiagnosticRunner({ onComplete }) {
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // { [questionId]: optionKey }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState("loading"); // loading | ready | error | submitting | done
  const [errorMessage, setErrorMessage] = useState("");

  // Start the attempt + load questions once on mount.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Start (or resume) the attempt.
        const startRes = await fetch("/api/diagnostic/start", {
          method: "POST",
        });
        const startData = await startRes.json();
        if (!startRes.ok)
          throw new Error(startData.error || "Could not start the diagnostic.");

        // 2. Load safe questions.
        const qRes = await fetch("/api/diagnostic/questions");
        const qData = await qRes.json();
        if (!qRes.ok)
          throw new Error(qData.error || "Could not load questions.");

        if (cancelled) return;
        setAttemptId(startData.attemptId);
        setQuestions(qData.questions);
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
  }, []);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const selectOption = (questionId, optionKey) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));
  };

  const goNext = () => {
    if (currentIndex < totalQuestions - 1) setCurrentIndex((i) => i + 1);
  };

  const goPrevious = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const handleSubmit = async () => {
    setStatus("submitting");
    try {
      const res = await fetch("/api/diagnostic/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, answers }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Could not submit the diagnostic.");

      setStatus("done");
      onComplete?.(data); // { attemptId, rawScore, scorePercentage, conceptResults, ... }
    } catch (err) {
      setErrorMessage(err.message);
      setStatus("error");
    }
  };

  if (status === "loading") {
    return <p className={styles.stateWrapper}>Loading your diagnostic…</p>;
  }

  if (status === "error") {
    return (
      <div className={styles.stateWrapper}>
        <p>Something went wrong: {errorMessage}</p>
        <button
          type="button"
          className={styles.retryBtn}
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (totalQuestions === 0) {
    return (
      <p className={styles.stateWrapper}>
        No questions are available for this diagnostic yet.
      </p>
    );
  }

  const progressPct =
    totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;

  return (
    <div className={styles.container}>
      {/* Progress */}
      <div className={styles.progressHeader}>
        <span className={styles.progressLabel}>
          QUESTION {currentIndex + 1}/{totalQuestions} · {answeredCount}{" "}
          ANSWERED
        </span>
        <div className={styles.progressBarTrack}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className={styles.questionCard}>
        {currentQuestion.difficulty && (
          <span className={styles.categoryTag}>
            {currentQuestion.difficulty}
          </span>
        )}

        <h3 className={styles.questionTitle}>{currentQuestion.prompt}</h3>

        {currentQuestion.code_snippet && (
          <pre className={styles.codeBlock}>
            <code>{currentQuestion.code_snippet}</code>
          </pre>
        )}

        {/* Options — options is a jsonb array of { key, text } */}
        <ul className={styles.optionsList}>
          {currentQuestion.options.map((opt) => {
            const selected = answers[currentQuestion.id] === opt.key;
            return (
              <li key={opt.key}>
                <button
                  type="button"
                  onClick={() => selectOption(currentQuestion.id, opt.key)}
                  aria-pressed={selected}
                  className={`${styles.optionCard} ${selected ? styles.optionCardSelected : ""}`}
                >
                  <span className={styles.optionKey}>{opt.key}</span>
                  <span className={styles.optionText}>{opt.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Navigation */}
      <div className={styles.navRow}>
        <button
          type="button"
          className={styles.prevBtn}
          onClick={goPrevious}
          disabled={currentIndex === 0}
        >
          Previous
        </button>

        {!isLastQuestion && (
          <button type="button" className={styles.nextBtn} onClick={goNext}>
            Next
          </button>
        )}

        {isLastQuestion && (
          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={answeredCount < totalQuestions || status === "submitting"}
          >
            {status === "submitting" ? "Submitting…" : "Submit diagnostic"}
          </button>
        )}
      </div>
    </div>
  );
}
