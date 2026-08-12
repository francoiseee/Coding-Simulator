"use client";

// src/components/diagnostic/DiagnosticRunner.jsx
// Step 15 — Diagnostic interface with autosave (resume support).
// Flow:
//   1. POST /api/diagnostic/start  → get attemptId; on resume, rehydrate draft answers + last index
//   2. GET  /api/diagnostic/questions → safe questions (no answer key)
//   3. Render one question at a time; track selected option key
//   4. Debounced autosave: PATCH /api/diagnostic/save every 1.5 s after any answer change
//   5. navigator.sendBeacon flush on page unload so nothing is lost mid-navigation
//   6. POST /api/diagnostic/submit on final submit
//
// Step 15b — Question navigator + missing-answers modal.
//   - A numbered strip lets the student jump to any question directly.
//   - If they try to submit with gaps, a modal lists exactly which question
//     numbers are unanswered and jumps them straight there on click.

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./DiagnosticRunner.module.css";

const AUTOSAVE_DELAY_MS = 1500;

export default function DiagnosticRunner({ onComplete }) {
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // { [questionId]: optionKey }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState("loading"); // loading | ready | error | submitting | done
  const [errorMessage, setErrorMessage] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [showMissingModal, setShowMissingModal] = useState(false);

  // Refs so callbacks always see the latest values without stale closures.
  const attemptIdRef = useRef(null);
  const answersRef = useRef({});
  const currentIndexRef = useRef(0);
  const saveTimerRef = useRef(null);
  const lastSavedAnswers = useRef(null); // JSON snapshot of last successfully saved answers

  // Keep refs in sync.
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // ── Init: start/resume attempt + load questions ──────────────────────────
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

        attemptIdRef.current = startData.attemptId;
        setAttemptId(startData.attemptId);
        setQuestions(qData.questions);

        // 3. Rehydrate saved progress on resume.
        if (
          startData.resumed &&
          startData.draftAnswers &&
          Object.keys(startData.draftAnswers).length > 0
        ) {
          setAnswers(startData.draftAnswers);
          answersRef.current = startData.draftAnswers;
          lastSavedAnswers.current = JSON.stringify(startData.draftAnswers);
        }
        if (
          startData.resumed &&
          typeof startData.lastQuestionIndex === "number"
        ) {
          setCurrentIndex(startData.lastQuestionIndex);
          currentIndexRef.current = startData.lastQuestionIndex;
        }

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

  // ── Autosave: flush any pending save on unload ───────────────────────────
  useEffect(() => {
    const handleUnload = () => {
      const id = attemptIdRef.current;
      if (!id) return;

      // sendBeacon is fire-and-forget; it survives tab close / navigation.
      const payload = JSON.stringify({
        attemptId: id,
        answers: answersRef.current,
        lastQuestionIndex: currentIndexRef.current,
      });
      navigator.sendBeacon(
        "/api/diagnostic/save",
        new Blob([payload], { type: "application/json" }),
      );
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // ── Debounced autosave whenever answers change ───────────────────────────
  const scheduleSave = useCallback((nextAnswers, nextIndex) => {
    const id = attemptIdRef.current;
    if (!id) return;

    setSaveState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      // Skip the network call if nothing changed since the last successful save.
      const snapshot = JSON.stringify(nextAnswers);
      if (snapshot === lastSavedAnswers.current) {
        setSaveState("saved");
        return;
      }

      try {
        const res = await fetch("/api/diagnostic/save", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId: id,
            answers: nextAnswers,
            lastQuestionIndex: nextIndex,
          }),
        });

        if (res.ok) {
          lastSavedAnswers.current = snapshot;
          setSaveState("saved");
        } else {
          setSaveState("error");
        }
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const progressPct =
    totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;

  // Questions the student hasn't answered yet, in order — used by both the
  // navigator strip and the "missing answers" modal below.
  const unansweredQuestions = questions
    .map((q, idx) => ({ index: idx, id: q.id }))
    .filter(({ id }) => !(id in answers));

  // ── Handlers ─────────────────────────────────────────────────────────────
  const selectOption = (questionId, optionKey) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: optionKey };
      scheduleSave(next, currentIndexRef.current);
      return next;
    });
  };

  const goNext = () => {
    if (currentIndex < totalQuestions - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      currentIndexRef.current = next;
      scheduleSave(answersRef.current, next);
    }
  };

  const goPrevious = () => {
    if (currentIndex > 0) {
      const next = currentIndex - 1;
      setCurrentIndex(next);
      currentIndexRef.current = next;
      scheduleSave(answersRef.current, next);
    }
  };

  const jumpToQuestion = (index) => {
    setCurrentIndex(index);
    currentIndexRef.current = index;
    scheduleSave(answersRef.current, index);
    setShowMissingModal(false);
  };

  const handleSubmitClick = () => {
    // Instead of just disabling the button, tell the student exactly which
    // questions they still need to answer and let them jump straight there.
    if (unansweredQuestions.length > 0) {
      setShowMissingModal(true);
      return;
    }
    handleSubmit();
  };

  const handleSubmit = async () => {
    // Cancel any pending autosave — final submit handles persistence.
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

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

  // ── Render states ─────────────────────────────────────────────────────────
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

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      {/* Progress */}
      <div className={styles.progressHeader}>
        <span className={styles.progressLabel}>
          QUESTION {currentIndex + 1}/{totalQuestions} · {answeredCount}{" "}
          ANSWERED
        </span>

        {/* Autosave status badge */}
        <span className={styles.saveStatus} aria-live="polite">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "✓ Saved"}
          {saveState === "error" && "Save failed — check connection"}
        </span>

        <div className={styles.progressBarTrack}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Question navigator — jump to any question directly, unanswered ones flagged */}
      <div
        className={styles.navigatorStrip}
        role="tablist"
        aria-label="Question navigator"
      >
        {questions.map((q, idx) => {
          const isAnswered = q.id in answers;
          const isCurrent = idx === currentIndex;
          return (
            <button
              key={q.id}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              aria-label={`Question ${idx + 1}${isAnswered ? "" : " (unanswered)"}`}
              onClick={() => jumpToQuestion(idx)}
              className={`${styles.navigatorDot} ${isAnswered ? styles.navigatorDotAnswered : styles.navigatorDotUnanswered} ${isCurrent ? styles.navigatorDotCurrent : ""}`}
            >
              {idx + 1}
            </button>
          );
        })}
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

        {/* Options — options is a jsonb object of { "A": "text", "B": "text", ... } */}
        <ul className={styles.optionsList}>
          {Object.entries(currentQuestion.options).map(([key, text]) => {
            const selected = answers[currentQuestion.id] === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => selectOption(currentQuestion.id, key)}
                  aria-pressed={selected}
                  className={`${styles.optionCard} ${selected ? styles.optionCardSelected : ""}`}
                >
                  <span className={styles.optionKey}>{key}</span>
                  <span className={styles.optionText}>{text}</span>
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
            onClick={handleSubmitClick}
            disabled={status === "submitting"}
          >
            {status === "submitting" ? "Submitting…" : "Submit diagnostic"}
          </button>
        )}
      </div>

      {/* Missing-answers modal — shown when the student tries to submit with gaps */}
      {showMissingModal && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="missingModalTitle"
          onClick={() => setShowMissingModal(false)}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="missingModalTitle" className={styles.modalTitle}>
              {unansweredQuestions.length} question
              {unansweredQuestions.length === 1 ? "" : "s"} left unanswered
            </h4>
            <p className={styles.modalSubtext}>
              Tap a question below to jump straight to it.
            </p>
            <ul className={styles.modalMissedList}>
              {unansweredQuestions.map(({ index }) => (
                <li key={index}>
                  <button
                    type="button"
                    className={styles.modalMissedChip}
                    onClick={() => jumpToQuestion(index)}
                  >
                    Question {index + 1}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={() => setShowMissingModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
