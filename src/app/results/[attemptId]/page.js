'use client';

// src/app/results/[attemptId]/page.js
// Step 20 — Results page.
// Fetches GET /api/diagnostic/results/:attemptId and renders the score plus
// a weakest-first concept breakdown. Structural markup only — styling comes later.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const CLASSIFICATION_LABEL = {
  strong: 'Strong',
  developing: 'Developing',
  needs_practice: 'Needs Practice',
  weak: 'Weak',
  insufficient_evidence: 'Not Enough Data',
};

export default function ResultsPage() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/diagnostic/results/${attemptId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load results.');
        if (cancelled) return;
        setData(json);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err.message);
        setStatus('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (status === 'loading') return <p>Loading your results…</p>;

  if (status === 'error') {
    return <p>Something went wrong: {errorMessage}</p>;
  }

  const { attempt, conceptResults } = data;

  return (
    <div>
      <h1>Diagnostic Results</h1>

      <section>
        <p>Raw score: {attempt.rawScore}</p>
        <p>Score percentage: {attempt.scorePercentage}%</p>
        <p>Completed: {new Date(attempt.completedAt).toLocaleString()}</p>
      </section>

      <section>
        <h2>Concept Breakdown</h2>
        <p>Weakest areas first — this is where focused practice will help most.</p>

        <ul style={{ listStyle: 'none', padding: 0 }}>
          {conceptResults.map((c) => (
            <li key={c.conceptId} style={{ marginBottom: '0.75rem' }}>
              <strong>{c.name}</strong> ({c.category}) —{' '}
              {CLASSIFICATION_LABEL[c.classification] || c.classification}
              <br />
              {c.correct} / {c.relevant} correct ({c.scorePercentage}%)
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
