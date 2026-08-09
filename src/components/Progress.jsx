"use client";

import styles from "./Progress.module.css";

export default function Progress({ summary, summaryStatus }) {
  const hasResults = summaryStatus === "ready" && summary?.hasCompletedDiagnostic;
  const concepts = summary?.concepts ?? [];
  const tier = summary?.tier ?? "Not Yet Assessed";
  const aiReport = summary?.aiReport ?? null;
  const structured = aiReport?.structured;

  const masteredCount = concepts.filter((c) => c.classification === "strong").length;

  const barColor = (classification) => {
    if (classification === "strong") return "var(--accent-teal)";
    if (classification === "weak") return "#ef4444";
    if (classification === "needs_practice") return "#f59e0b";
    if (classification === "developing") return "var(--accent-cyan)";
    return "rgba(255,255,255,0.15)";
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
        <>
          {/* Concept Mastery Chart */}
          <section className={styles.chartCard}>
            <h2 className={styles.cardTitle}>Concept Mastery</h2>
            <p className={styles.cardDesc}>Your diagnostic score per concept, sorted weakest first.</p>
            <div className={styles.chartList}>
              {concepts.map((c) => (
                <div key={c.conceptId} className={styles.chartRow}>
                  <span className={styles.chartLabel}>{c.name}</span>
                  <div className={styles.chartBarTrack}>
                    <div
                      className={styles.chartBarFill}
                      style={{
                        width: `${c.scorePercentage}%`,
                        backgroundColor: barColor(c.classification),
                      }}
                    />
                  </div>
                  <span className={styles.chartPct}>{c.scorePercentage}%</span>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className={styles.legend}>
              <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "var(--accent-teal)" }} />Strong</span>
              <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "var(--accent-cyan)" }} />Developing</span>
              <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "#f59e0b" }} />Needs Practice</span>
              <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "#ef4444" }} />Weak</span>
            </div>
          </section>

          {/* AI Diagnostic Report */}
          {structured && (
            <section className={styles.aiCard}>
              <div className={styles.aiHeader}>
                <span className={styles.aiBadge}>AI-Generated Report</span>
                <h2 className={styles.cardTitle}>Your Personalized Breakdown</h2>
              </div>

              {structured.narrative && (
                <p className={styles.aiNarrative}>{structured.narrative}</p>
              )}

              <div className={styles.aiGrid}>
                {structured.strengths?.length > 0 && (
                  <div className={styles.aiBlock}>
                    <h3 className={styles.aiBlockTitle}>What you already understand</h3>
                    <ul className={styles.aiList}>
                      {structured.strengths.map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {structured.weaknesses?.length > 0 && (
                  <div className={styles.aiBlock}>
                    <h3 className={styles.aiBlockTitle}>Where you need more practice</h3>
                    <ul className={styles.aiList}>
                      {structured.weaknesses.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {structured.why_struggling && (
                <div className={styles.aiBlock}>
                  <h3 className={styles.aiBlockTitle}>Why you may be struggling</h3>
                  <p className={styles.aiBlockText}>{structured.why_struggling}</p>
                </div>
              )}

              {structured.study_order?.length > 0 && (
                <div className={styles.aiBlock}>
                  <h3 className={styles.aiBlockTitle}>What to study first</h3>
                  <ol className={styles.aiOrderedList}>
                    {structured.study_order.map((item) => <li key={item}>{item}</li>)}
                  </ol>
                </div>
              )}

              {structured.practice_plan && (
                <div className={styles.aiBlock}>
                  <h3 className={styles.aiBlockTitle}>Recommended practice plan</h3>
                  <p className={styles.aiBlockText}>{structured.practice_plan}</p>
                </div>
              )}

              {structured.encouragement && (
                <p className={styles.aiEncouragement}>{structured.encouragement}</p>
              )}
            </section>
          )}

          {!structured && (
            <section className={styles.aiCard}>
              <p className={styles.aiEmpty}>
                Your AI diagnostic report will appear here after your diagnostic is scored.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
