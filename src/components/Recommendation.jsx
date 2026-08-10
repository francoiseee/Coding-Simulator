"use client";

import { useRouter } from "next/navigation";
import styles from "./Recommendation.module.css";

export default function Recommendation({ hasResults, recommendedProblems }) {
  const router = useRouter();
  const goToProblem = (slug) => router.push(`/practice/${slug}`);

  return (
    <div className={styles.recommendationWrapper}>
      <header className={styles.recommendationHeader}>
        <h1 className={styles.title}>Recommendation</h1>
        <p className={styles.subtitle}>
          Practice problems targeted at your weakest concepts from the
          diagnostic.
        </p>
      </header>

      {!hasResults ? (
        <div className={styles.emptyState}>
          <p>Complete your diagnostic to get personalized recommendations.</p>
        </div>
      ) : recommendedProblems.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No recommendations yet — check back after your next diagnostic.</p>
        </div>
      ) : (
        <article className={styles.recommendCard}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Recommended Practice</h3>
            <span className={styles.recommendCount}>
              {recommendedProblems.length} problems
            </span>
          </div>

          <ul className={styles.recommendList}>
            {recommendedProblems.map((rp) => (
              <li key={rp.recommendationId}>
                <button
                  type="button"
                  className={styles.recommendItem}
                  onClick={() => goToProblem(rp.slug)}
                >
                  <div className={styles.recommendItemMain}>
                    <span className={styles.recommendItemTitle}>
                      {rp.title}
                    </span>
                    <span className={styles.recommendItemReason}>
                      {rp.conceptName ? `${rp.conceptName} · ` : ""}
                      {rp.reason}
                    </span>
                  </div>
                  <div className={styles.recommendItemMeta}>
                    <span
                      className={`${styles.difficultyDot} ${styles["difficulty_" + rp.difficulty]}`}
                      title={`Difficulty: ${rp.difficulty}`}
                    />
                    {rp.estimatedMinutes ? (
                      <span className={styles.recommendMinutes}>
                        ~{rp.estimatedMinutes}m
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </article>
      )}
    </div>
  );
}
