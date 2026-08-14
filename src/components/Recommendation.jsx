"use client";

import styles from "./Recommendation.module.css";

export default function Recommendation({
  recommendedProblems = [],
  onSelectProblem,
  hasDiagnostic = false,
}) {
  const hasProblems = recommendedProblems.length > 0;

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <h1 className={styles.title}>Recommendation</h1>
        <p className={styles.subtitle}>
          Practice problems targeted at your weakest concepts from the
          diagnostic.
        </p>
      </header>

      {!hasProblems && (
        <div className={styles.emptyState}>
          <p>
            {hasDiagnostic
              ? "You've completed all your recommended practice! Check My Progress to see your growth, or explore more concepts from Simulations."
              : "Complete your diagnostic to get problems recommended for your weakest concepts."}
          </p>
        </div>
      )}

      {hasProblems && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Recommended Practice</h2>
            <span className={styles.count}>
              {recommendedProblems.length} problems
            </span>
          </div>

          <ul className={styles.list}>
            {recommendedProblems.map((rp) => (
              <li key={rp.recommendationId}>
                <button
                  type="button"
                  className={styles.item}
                  onClick={() => onSelectProblem?.(rp.slug)}
                >
                  <div className={styles.itemMain}>
                    <span className={styles.itemTitle}>{rp.title}</span>
                    <span className={styles.itemReason}>
                      {rp.conceptName ? `${rp.conceptName} · ` : ""}
                      {rp.reason}
                    </span>
                  </div>
                  <div className={styles.itemMeta}>
                    <span
                      className={`${styles.difficultyDot} ${styles["difficulty_" + rp.difficulty]}`}
                    />
                    {rp.estimatedMinutes ? (
                      <span className={styles.minutes}>
                        ~{rp.estimatedMinutes}m
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
