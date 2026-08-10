"use client";

import { useState } from "react";
import styles from "./Progress.module.css";

// Same status language as the dashboard's Skill Growth Chart — one legend,
// one meaning, reused everywhere a concept's classification is drawn.
const STATUS_META = {
  strong: { label: "Strong", color: "var(--accent-teal)" },
  developing: { label: "Developing", color: "var(--accent-cyan)" },
  needs_practice: { label: "Needs Practice", color: "#f59e0b" },
  weak: { label: "Weak", color: "#ef4444" },
  insufficient_evidence: { label: "Not Assessed", color: "#57657a" },
};
const getStatusMeta = (classification) =>
  STATUS_META[classification] || STATUS_META.insufficient_evidence;

const DONUT_RADIUS = 42;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const DONUT_GAP = 3;

export default function Progress({ summary, summaryStatus }) {
  const [aiPage, setAiPage] = useState(0);

  const hasResults = summaryStatus === "ready" && summary?.hasCompletedDiagnostic;
  const concepts = summary?.concepts ?? [];
  const tier = summary?.tier ?? "Not Yet Assessed";
  const aiReport = summary?.aiReport ?? null;
  const structured = aiReport?.structured;

  const masteredCount = concepts.filter((c) => c.classification === "strong").length;

  const conceptTotal = concepts.length || 1;
  let donutCumulative = 0;
  const donutSlices = Object.keys(STATUS_META)
    .map((key) => ({
      key,
      ...STATUS_META[key],
      count: concepts.filter((c) => c.classification === key).length,
    }))
    .filter((slice) => slice.count > 0)
    .map((slice) => {
      const sliceLength = (slice.count / conceptTotal) * DONUT_CIRCUMFERENCE;
      const rotation = (donutCumulative / DONUT_CIRCUMFERENCE) * 360 - 90;
      donutCumulative += sliceLength;
      return {
        ...slice,
        rotation,
        dasharray: `${Math.max(sliceLength - DONUT_GAP, 0)} ${DONUT_CIRCUMFERENCE}`,
      };
    });

  const aiPages = structured
    ? [
        structured.narrative && {
          key: "overview",
          title: "Overview",
          content: <p className={styles.aiNarrative}>{structured.narrative}</p>,
        },
        (structured.strengths?.length > 0 || structured.weaknesses?.length > 0) && {
          key: "breakdown",
          title: "Strengths & Gaps",
          content: (
            <div className={styles.aiGrid}>
              {structured.strengths?.length > 0 && (
                <div className={styles.aiBlock}>
                  <h3 className={styles.aiBlockTitle}>What you already understand</h3>
                  <ul className={styles.aiList}>
                    {structured.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {structured.weaknesses?.length > 0 && (
                <div className={styles.aiBlock}>
                  <h3 className={styles.aiBlockTitle}>Where you need more practice</h3>
                  <ul className={styles.aiList}>
                    {structured.weaknesses.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ),
        },
        structured.why_struggling && {
          key: "why",
          title: "Why You May Be Struggling",
          content: <p className={styles.aiBlockText}>{structured.why_struggling}</p>,
        },
        structured.study_order?.length > 0 && {
          key: "study",
          title: "What To Study First",
          content: (
            <ol className={styles.aiOrderedList}>
              {structured.study_order.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          ),
        },
        (structured.practice_plan || structured.encouragement) && {
          key: "plan",
          title: "Recommended Practice Plan",
          content: (
            <>
              {structured.practice_plan && (
                <p className={styles.aiBlockText}>{structured.practice_plan}</p>
              )}
              {structured.encouragement && (
                <p className={styles.aiEncouragement}>{structured.encouragement}</p>
              )}
            </>
          ),
        },
      ].filter(Boolean)
    : [];

  const currentAiPage = aiPages[Math.min(aiPage, aiPages.length - 1)];

  const goToAiPage = (delta) => {
    setAiPage((p) => (p + delta + aiPages.length) % aiPages.length);
  };

  return (
    <div className={styles.progressWrapper}>
      {/* Header */}
      <header className={styles.progressHeader}>
        <h1 className={styles.title}>My Progress</h1>
        <p className={styles.subtitle}>
          {summary?.displayName ? `${summary.displayName}'s` : "Your"} current performance tier is{" "}
          <span className={styles.highlightText}>{tier}</span>.
        </p>
      </header>

      {/* Stats banner */}
      <footer className={styles.statsBanner}>
        <div className={styles.statColumn}>
          <span className={styles.statNumber}>{hasResults ? concepts.length : 0}</span>
          <span className={styles.statLabel}>Concepts Assessed</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statColumn}>
          <span className={styles.statNumber}>
            {hasResults ? `${summary.overallScorePercentage}%` : "—"}
          </span>
          <span className={styles.statLabel}>Overall Score</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statColumn}>
          <span className={styles.statNumber}>{hasResults ? masteredCount : 0}</span>
          <span className={styles.statLabel}>Concepts Mastered</span>
        </div>
      </footer>

      {!hasResults && (
        <div className={styles.emptyState}>
          <p>Complete your diagnostic to see your progress breakdown here.</p>
        </div>
      )}

      {hasResults && (
        <div className={styles.progressRow}>
          {/* Concept Mastery Chart */}
          <section className={styles.chartCard}>
            <h2 className={styles.cardTitle}>Concept Mastery</h2>
            <p className={styles.cardDesc}>Your diagnostic score per concept, sorted weakest first.</p>

            <div className={styles.donutRow}>
              <div className={styles.donutBlock}>
                <svg className={styles.donutSvg} viewBox="0 0 100 100" width="118" height="118">
                  <circle
                    cx="50"
                    cy="50"
                    r={DONUT_RADIUS}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.06)"
                    strokeWidth="10"
                  />
                  {donutSlices.map((slice) => (
                    <circle
                      key={slice.key}
                      cx="50"
                      cy="50"
                      r={DONUT_RADIUS}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={slice.dasharray}
                      transform={`rotate(${slice.rotation} 50 50)`}
                      className={styles.donutSlice}
                    >
                      <title>
                        {slice.label}: {slice.count} concept{slice.count === 1 ? "" : "s"}
                      </title>
                    </circle>
                  ))}
                </svg>
                <div className={styles.donutCenter}>
                  <span className={styles.donutScore}>{summary.overallScorePercentage}%</span>
                  <span className={styles.donutScoreLabel}>Overall</span>
                </div>
              </div>

              <ul className={styles.donutLegend}>
                {Object.keys(STATUS_META).map((key) => {
                  const meta = STATUS_META[key];
                  const count = concepts.filter((c) => c.classification === key).length;
                  return (
                    <li
                      key={key}
                      className={styles.donutLegendItem}
                      style={{ opacity: count > 0 ? 1 : 0.35 }}
                    >
                      <span className={styles.donutLegendDot} style={{ backgroundColor: meta.color }} />
                      <span className={styles.donutLegendLabel}>{meta.label}</span>
                      <span className={styles.donutLegendCount}>{count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className={styles.chartList}>
              {concepts.map((c) => {
                const meta = getStatusMeta(c.classification);
                return (
                  <div
                    key={c.conceptId}
                    className={styles.chartRow}
                    title={`${c.name}: ${c.scorePercentage}% — ${c.classificationLabel}`}
                  >
                    <span className={styles.chartLabel}>{c.name}</span>
                    <div className={styles.chartBarTrack}>
                      <div
                        className={styles.chartBarFill}
                        style={{ width: `${c.scorePercentage}%`, backgroundColor: meta.color }}
                      />
                    </div>
                    <span className={styles.chartStatusDot} style={{ backgroundColor: meta.color }} />
                    <span className={styles.chartPct}>{c.scorePercentage}%</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* AI Diagnostic Report */}
          {structured && aiPages.length > 0 && (
            <section className={styles.aiCard}>
              <div className={styles.aiHeader}>
                <span className={styles.aiBadge}>AI-Generated Report</span>
                <h2 className={styles.cardTitle}>Your Personalized Breakdown</h2>
              </div>

              <div className={styles.aiNav}>
                <button
                  type="button"
                  className={styles.aiNavArrow}
                  onClick={() => goToAiPage(-1)}
                  disabled={aiPages.length < 2}
                  aria-label="Previous section"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                <div className={styles.aiPageInfo}>
                  <div className={styles.aiPageText}>
                    <span className={styles.aiPageTitle}>{currentAiPage.title}</span>
                    <span className={styles.aiPageCounter}>
                      Section {aiPage + 1} of {aiPages.length}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.aiNavArrow}
                  onClick={() => goToAiPage(1)}
                  disabled={aiPages.length < 2}
                  aria-label="Next section"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              <div className={styles.aiPageBody} key={currentAiPage.key}>
                {currentAiPage.content}
              </div>

              <div className={styles.aiDots}>
                {aiPages.map((p, i) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`${styles.aiDot} ${i === aiPage ? styles.aiDotActive : ""}`}
                    onClick={() => setAiPage(i)}
                    aria-label={`Go to ${p.title}`}
                  />
                ))}
              </div>
            </section>
          )}

          {!structured && (
            <section className={styles.aiCard}>
              <p className={styles.aiEmpty}>
                Your AI diagnostic report will appear here after your diagnostic is scored.
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
