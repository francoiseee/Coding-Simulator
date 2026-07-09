"use client";

import styles from "./Progress.module.css";

// NOTE: The Skill Mastery radar chart and Recent Achievements section below
// remain decorative placeholders — there's no achievements/badges schema yet,
// and a real per-axis radar needs a broader concept-category mapping than the
// current 6-concept diagnostic covers. Learning Path, the performance tier,
// and the stats banner now reflect real diagnostic data.

const PLACEHOLDER_ACHIEVEMENTS = [
  {
    id: "sprinter",
    title: "Code Sprinter",
    description:
      "Solved 10 algorithms in under 30 minutes with perfect memory allocation.",
    tag: "COMBAT",
    footer: "EARNED 2 DAYS AGO",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    id: "sage",
    title: "Syntax Sage",
    description:
      "Achieved zero-error parsing rate for 5 consecutive complex Python scripts.",
    tag: "QUALITY",
    footer: "EARNED 4 DAYS AGO",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: "weaver",
    title: "Logic Weaver",
    description:
      "Successfully mapped a complex mesh network with zero packet loss in simulation.",
    tag: "LOGIC",
    footer: "EARNED 1 WEEK AGO",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    id: "breaker",
    title: "Vault Breaker",
    description:
      "Identified and patched 3 high-impact memory leaks in Python environments.",
    tag: "SYSTEMS",
    footer: "EARNED 2 WEEKS AGO",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
];

export default function Progress({ summary, summaryStatus }) {
  const hasResults =
    summaryStatus === "ready" && summary?.hasCompletedDiagnostic;
  const concepts = summary?.concepts ?? [];
  const weakest = summary?.weakest ?? [];
  const strongest = summary?.strongest ?? [];
  const tier = summary?.tier ?? "Not Yet Assessed";

  const masteredCount = concepts.filter(
    (c) => c.classification === "strong",
  ).length;

  return (
    <div className={styles.progressWrapper}>
      {/* Page Header */}
      <header className={styles.progressHeader}>
        <h1 className={styles.title}>My Progress</h1>
        <p className={styles.subtitle}>
          Tracking performance across Python simulation environments. Your
          current performance tier is{" "}
          <span className={styles.highlightText}>{tier}</span>.
        </p>
      </header>

      {/* Row 1: Skill Mastery & Learning Path */}
      <section className={styles.topRow}>
        {/* Skill Mastery (Radar Chart) — decorative, see note above */}
        <article className={styles.masteryCard}>
          <div className={styles.masteryHeader}>
            <div className={styles.masteryTitleWrapper}>
              <h2 className={styles.cardTitle}>Skill Mastery</h2>
              <span className={styles.masterySubtitle}>Python Proficiency</span>
            </div>
            <span className={styles.pythonBadge}>
              <span className={styles.badgeDot} />
              PYTHON
            </span>
          </div>

          <div className={styles.radarWrapper}>
            <svg
              viewBox="0 0 260 220"
              width="100%"
              height="100%"
              className={styles.radarSvg}
            >
              <defs>
                <filter
                  id="purpleGlow"
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <circle
                cx="130"
                cy="110"
                r="80"
                fill="none"
                stroke="rgba(255, 255, 255, 0.025)"
                strokeWidth="1"
              />
              <circle
                cx="130"
                cy="110"
                r="60"
                fill="none"
                stroke="rgba(255, 255, 255, 0.025)"
                strokeWidth="1"
              />
              <circle
                cx="130"
                cy="110"
                r="40"
                fill="none"
                stroke="rgba(255, 255, 255, 0.025)"
                strokeWidth="1"
              />
              <circle
                cx="130"
                cy="110"
                r="20"
                fill="none"
                stroke="rgba(255, 255, 255, 0.025)"
                strokeWidth="1"
              />

              <line
                x1="130"
                y1="30"
                x2="130"
                y2="190"
                stroke="rgba(255, 255, 255, 0.035)"
                strokeWidth="1"
              />
              <line
                x1="50"
                y1="110"
                x2="210"
                y2="110"
                stroke="rgba(255, 255, 255, 0.035)"
                strokeWidth="1"
              />

              <polygon
                points="130,50 182,110 130,150 88,110"
                fill="rgba(157, 78, 221, 0.12)"
                stroke="var(--accent-purple)"
                strokeWidth="2"
                filter="url(#purpleGlow)"
              />

              <circle cx="130" cy="50" r="3" fill="var(--accent-purple)" />
              <circle cx="182" cy="110" r="3" fill="var(--accent-purple)" />
              <circle cx="130" cy="150" r="3" fill="var(--accent-purple)" />
              <circle cx="88" cy="110" r="3" fill="var(--accent-purple)" />

              <text
                x="130"
                y="20"
                textAnchor="middle"
                className={styles.radarLabel}
              >
                SYNTAX
              </text>
              <text
                x="220"
                y="113"
                textAnchor="start"
                className={styles.radarLabel}
              >
                STRUCTURES
              </text>
              <text
                x="130"
                y="206"
                textAnchor="middle"
                className={styles.radarLabel}
              >
                OPTIMIZATION
              </text>
              <text
                x="40"
                y="113"
                textAnchor="end"
                className={styles.radarLabel}
              >
                CONCURRENCY
              </text>
            </svg>
          </div>
        </article>

        {/* Learning Path — built from real concept mastery */}
        <section className={styles.learningCard}>
          <div className={styles.learningHeader}>
            <h2 className={styles.cardTitle}>Learning Path</h2>
            <span className={styles.learningTag}>
              {hasResults
                ? `${masteredCount}/${concepts.length} CONCEPTS MASTERED`
                : "NOT STARTED"}
            </span>
          </div>

          <div className={styles.timeline}>
            {!hasResults && (
              <div className={`${styles.timelineNode} ${styles.lockedNode}`}>
                <div className={styles.nodeContent}>
                  <h3 className={styles.nodeTitle}>Complete your diagnostic</h3>
                  <p className={styles.nodeDesc}>
                    Finish the assessment to unlock your concept-by-concept
                    learning path.
                  </p>
                </div>
              </div>
            )}

            {hasResults && strongest[0] && (
              <div className={`${styles.timelineNode} ${styles.completedNode}`}>
                <div className={styles.nodeIconWrapper}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className={styles.nodeContent}>
                  <div className={styles.nodeHeader}>
                    <h3 className={styles.nodeTitle}>{strongest[0].name}</h3>
                    <span className={styles.nodeDate}>
                      {strongest[0].scorePercentage}%
                    </span>
                  </div>
                  <p className={styles.nodeDesc}>
                    Your strongest concept from the diagnostic —{" "}
                    {strongest[0].category}.
                  </p>
                </div>
              </div>
            )}

            {hasResults && weakest[0] && (
              <div className={styles.activeContainer}>
                <div className={`${styles.timelineNode} ${styles.activeNode}`}>
                  <div className={styles.nodeIconWrapper}>
                    <div className={styles.activeDot} />
                  </div>
                  <div className={styles.nodeContent}>
                    <div className={styles.nodeHeader}>
                      <h3 className={styles.nodeTitle}>{weakest[0].name}</h3>
                      <span className={styles.inProgressTag}>
                        NEEDS PRACTICE
                      </span>
                    </div>
                    <div className={styles.activeProgressTrack}>
                      <div
                        className={styles.activeProgressFill}
                        style={{ width: `${weakest[0].scorePercentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {hasResults && weakest[1] && (
              <div className={`${styles.timelineNode} ${styles.lockedNode}`}>
                <div className={styles.nodeIconWrapper}>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div className={styles.nodeContent}>
                  <h3 className={styles.nodeTitle}>{weakest[1].name}</h3>
                  <p className={styles.nodeDesc}>
                    {weakest[1].scorePercentage}% correct — practice content
                    coming soon.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </section>

      {/* Row 3: Recent Achievements — still placeholder, no schema yet */}
      <section className={styles.achievementsSection}>
        <div className={styles.achievementsHeader}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.achievementIcon}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <h2 className={styles.sectionTitle}>Recent Achievements</h2>
        </div>

        <div className={styles.achievementsGrid}>
          {PLACEHOLDER_ACHIEVEMENTS.map((a) => (
            <article key={a.id} className={styles.achievementCard}>
              <div className={styles.achCardHeader}>
                <div className={styles.achIconWrapper}>{a.icon}</div>
                <span className={styles.achTag}>{a.tag}</span>
              </div>
              <h3 className={styles.achTitle}>{a.title}</h3>
              <p className={styles.achDesc}>{a.description}</p>
              <div className={styles.achFooter}>{a.footer}</div>
            </article>
          ))}
        </div>
      </section>

      {/* Bottom Stats Banner — real per-user numbers */}
      <footer className={styles.statsBanner}>
        <div className={styles.statColumn}>
          <span className={styles.statNumber}>
            {hasResults ? concepts.length : 0}
          </span>
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
          <span className={styles.statNumber}>
            {hasResults ? masteredCount : 0}
          </span>
          <span className={styles.statLabel}>Concepts Mastered</span>
        </div>
      </footer>
    </div>
  );
}
