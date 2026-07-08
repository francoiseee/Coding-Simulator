"use client";

// src/app/results/[attemptId]/page.js
// Step 20 — Results page.
// Fetches GET /api/diagnostic/results/:attemptId and renders the score plus
// a weakest-first concept breakdown. Structural markup only — styling comes later.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./DiagnosticResults.module.css";

const CLASSIFICATION_LABEL = {
  strong: "Strong",
  developing: "Developing",
  needs_practice: "Needs Practice",
  weak: "Weak",
  insufficient_evidence: "Not Enough Data",
};

const CLASSIFICATION_ROW_CLASS = {
  strong: styles.conceptRowStrong,
  developing: styles.conceptRowDeveloping,
  needs_practice: styles.conceptRowNeedsPractice,
  weak: styles.conceptRowWeak,
  insufficient_evidence: styles.conceptRowInsufficient,
};

const CLASSIFICATION_BADGE_CLASS = {
  strong: styles.badgeStrong,
  developing: styles.badgeDeveloping,
  needs_practice: styles.badgeNeedsPractice,
  weak: styles.badgeWeak,
  insufficient_evidence: styles.badgeInsufficient,
};

export default function ResultsPage() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/diagnostic/results/${attemptId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load results.");
        if (cancelled) return;
        setData(json);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err.message);
        setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (status === "loading")
    return <p className={styles.stateWrapper}>Loading your results…</p>;

  if (status === "error") {
    return (
      <p className={styles.stateWrapper}>
        Something went wrong: {errorMessage}
      </p>
    );
  }

  const { attempt, conceptResults } = data;

  return (
    <div className={styles.container}>
      <section className={styles.scoreCard}>
        <div className={styles.scoreHeader}>
          <div className={styles.terminalDotWrapper}>
            <span className={`${styles.dot} ${styles.dotRed}`} />
            <span className={`${styles.dot} ${styles.dotYellow}`} />
            <span className={`${styles.dot} ${styles.dotGreen}`} />
          </div>
          <h1 className={styles.scoreTitle}>Diagnostic results</h1>
          <p className={styles.scoreMeta}>
            Completed {new Date(attempt.completedAt).toLocaleString()}
          </p>
        </div>

        <div className={styles.scoreBody}>
          <div className={styles.scoreCircleWrapper}>
            <div className={styles.scoreCircle}>
              <span className={styles.scoreText}>{attempt.rawScore}</span>
              <span className={styles.scoreTotal}>points</span>
            </div>
            <span className={styles.scoreLabel}>
              {attempt.scorePercentage}% overall
            </span>
          </div>

          <p className={styles.scoreSideText}>
            Here&apos;s how you did across each concept. The list below is
            sorted weakest first — that&apos;s where focused practice will help
            the most.
          </p>
        </div>
      </section>

      <section className={styles.conceptSection}>
        <h2 className={styles.conceptSectionTitle}>Concept breakdown</h2>
        <p className={styles.conceptSectionDesc}>Weakest areas first.</p>

        <ul className={styles.conceptList}>
          {conceptResults.map((c) => (
            <li
              key={c.conceptId}
              className={`${styles.conceptRow} ${CLASSIFICATION_ROW_CLASS[c.classification] || ""}`}
            >
              <div className={styles.conceptRowHeader}>
                <span className={styles.conceptName}>{c.name}</span>
                <span
                  className={`${styles.classificationBadge} ${CLASSIFICATION_BADGE_CLASS[c.classification] || ""}`}
                >
                  {CLASSIFICATION_LABEL[c.classification] || c.classification}
                </span>
              </div>
              <span className={styles.conceptCategory}>{c.category}</span>
              <span className={styles.conceptStats}>
                {c.correct} / {c.relevant} correct ({c.scorePercentage}%)
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
