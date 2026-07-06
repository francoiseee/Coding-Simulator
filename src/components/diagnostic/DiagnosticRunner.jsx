'use client';

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

import { useEffect, useState } from 'react';

export default function DiagnosticRunner({ onComplete }) {
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // { [questionId]: optionKey }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState('loading'); // loading | ready | error | submitting | done
  const [errorMessage, setErrorMessage] = useState('');

  // Start the attempt + load questions once on mount.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Start (or resume) the attempt.
        const startRes = await fetch('/api/diagnostic/start', { method: 'POST' });
        const startData = await startRes.json();
        if (!startRes.ok) throw new Error(startData.error || 'Could not start the diagnostic.');

        // 2. Load safe questions.
        const qRes = await fetch('/api/diagnostic/questions');
        const qData = await qRes.json();
        if (!qRes.ok) throw new Error(qData.error || 'Could not load questions.');

        if (cancelled) return;
        setAttemptId(startData.attemptId);
        setQuestions(qData.questions);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err.message);
        setStatus('error');
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
    setStatus('submitting');
    // Step 16 will send { attemptId, answers } to a save/score endpoint.
    // For now, hand the collected data up to the parent so the flow can advance.
    setStatus('done');
    onComplete?.({ attemptId, answers });
  };

  if (status === 'loading') {
    return <p>Loading your diagnostic…</p>;
  }

  if (status === 'error') {
    return (
      <div>
        <p>Something went wrong: {errorMessage}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (totalQuestions === 0) {
    return <p>No questions are available for this diagnostic yet.</p>;
  }

  return (
    <div>
      {/* Progress */}
      <div>
        <p>
          Question {currentIndex + 1} of {totalQuestions} · {answeredCount} answered
        </p>
      </div>

      {/* Question */}
      <div>
        <h3>{currentQuestion.prompt}</h3>

        {currentQuestion.code_snippet && (
          <pre>
            <code>{currentQuestion.code_snippet}</code>
          </pre>
        )}

        {/* Options — options is a jsonb array of { key, text } */}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {currentQuestion.options.map((opt) => {
            const selected = answers[currentQuestion.id] === opt.key;
            return (
              <li key={opt.key}>
                <button
                  type="button"
                  onClick={() => selectOption(currentQuestion.id, opt.key)}
                  aria-pressed={selected}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    fontWeight: selected ? 'bold' : 'normal',
                  }}
                >
                  {opt.key}. {opt.text}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Navigation */}
      <div>
        <button type="button" onClick={goPrevious} disabled={currentIndex === 0}>
          Previous
        </button>

        {!isLastQuestion && (
          <button type="button" onClick={goNext}>
            Next
          </button>
        )}

        {isLastQuestion && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={answeredCount < totalQuestions || status === 'submitting'}
          >
            {status === 'submitting' ? 'Submitting…' : 'Submit diagnostic'}
          </button>
        )}
      </div>
    </div>
  );
}
