"use client";

// src/app/results/[attemptId]/page.js
// Step 20 — Results page: score + weakest-first concept breakdown.
// Step 24 — Also displays the saved AI weakness report (generated during
// submit). This page never calls the Anthropic API on load/refresh — it only
// reads whatever was already saved to ai_reports. If generation failed during
// submit, a "Generate my report" button lets the student trigger Step 22's
// on-demand route instead.

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
  const [generatingReport, setGeneratingReport] = useState(false);

  const loadResults = async () => {
    try {
      const res = await fetch(`/api/diagnostic/results/${attemptId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load results.");
      setData(json);
      setStatus("ready");
    } catch (err) {
      setErrorMessage(err.message);
      setStatus("error");
    }
  };

  useEffect(() => {
    loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const res = await fetch("/api/ai/diagnostic-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: Number(attemptId) }),
      });
      if (!res.ok) throw new Error("Report generation failed.");
      await loadResults(); // re-fetch so the new report appears
    } catch {
      // Non-fatal — leave the deterministic breakdown visible either way.
    } finally {
      setGeneratingReport(false);
    }
  };

  if (status === "loading")
    return <p className={styles.stateWrapper}>Loading your results…</p>;

  if (status === "error") {
    return (
      <p className={styles.stateWrapper}>
        Something went wrong: {errorMessage}
      </p>
    );
  }

  const { attempt, conceptResults, aiReport } = data;
  const structured = aiReport?.structured;

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

      {/* AI Weakness Report — Step 24 */}
      <section className={styles.aiReportCard}>
        {structured ? (
          <>
            <div className={styles.aiReportHeader}>
              <span className={styles.aiReportBadge}>AI-Generated Report</span>
              <h2 className={styles.aiReportTitle}>
                Your Personalized Breakdown
              </h2>
            </div>

            <p className={styles.aiNarrative}>{structured.narrative}</p>

            <div className={styles.aiReportGrid}>
              {structured.strengths?.length > 0 && (
                <div className={styles.aiReportBlock}>
                  <h3 className={styles.aiBlockTitle}>
                    What you already understand
                  </h3>
                  <ul className={styles.aiList}>
                    {structured.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {structured.weaknesses?.length > 0 && (
                <div className={styles.aiReportBlock}>
                  <h3 className={styles.aiBlockTitle}>
                    Where you need more practice
                  </h3>
                  <ul className={styles.aiList}>
                    {structured.weaknesses.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {structured.why_struggling && (
              <div className={styles.aiReportBlock}>
                <h3 className={styles.aiBlockTitle}>
                  Why you may be struggling
                </h3>
                <p className={styles.aiBlockText}>
                  {structured.why_struggling}
                </p>
              </div>
            )}

            {structured.study_order?.length > 0 && (
              <div className={styles.aiReportBlock}>
                <h3 className={styles.aiBlockTitle}>What to study first</h3>
                <ol className={styles.aiOrderedList}>
                  {structured.study_order.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            )}

            {structured.practice_plan && (
              <div className={styles.aiReportBlock}>
                <h3 className={styles.aiBlockTitle}>
                  Recommended practice plan
                </h3>
                <p className={styles.aiBlockText}>{structured.practice_plan}</p>
              </div>
            )}

            {structured.encouragement && (
              <p className={styles.aiEncouragement}>
                {structured.encouragement}
              </p>
            )}
          </>
        ) : (
          <div className={styles.aiReportEmpty}>
            <p>Your personalized AI report is not ready yet.</p>
            <button
              type="button"
              className={styles.generateReportBtn}
              onClick={handleGenerateReport}
              disabled={generatingReport}
            >
              {generatingReport ? "Generating…" : "Generate my report"}
            </button>
          </div>
        )}
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
