"use client";

import styles from "./Progress.module.css";

export default function MasteryBarRow({ concept }) {
  const masteryColor =
    concept.masteryScore > 70
      ? "var(--accent-teal)"
      : concept.masteryScore >= 50
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div
      className={styles.masteryRow}
      title={`${concept.name}: ${Math.round(concept.masteryScore)}%`}
    >
      <span className={styles.chartLabel}>{concept.name}</span>
      <div className={styles.chartBarTrack}>
        <div
          className={styles.chartBarFill}
          style={{
            width: `${concept.masteryScore}%`,
            backgroundColor: masteryColor,
          }}
        />
      </div>
      <span className={styles.chartPct}>
        {Math.round(concept.masteryScore)}%
      </span>
      <div className={styles.masteryMeta}>
        {concept.practiced && (
          <span className={styles.masteryBadge}>Practiced</span>
        )}
        {concept.diagnosticBaseline != null &&
          concept.masteryScore !== concept.diagnosticBaseline && (
            <span className={styles.masteryDelta}>
              from {Math.round(concept.diagnosticBaseline)}%
            </span>
          )}
      </div>
    </div>
  );
}
