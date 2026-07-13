"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./Dashboard.module.css";
import Gallery from "./Gallery";
import Progress from "./Progress";

export default function Dashboard({ email }) {
  const [activeTab, setActiveTab] = useState("simulations");
  const [summary, setSummary] = useState(null);
  const [summaryStatus, setSummaryStatus] = useState("loading"); // loading | ready | error
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const res = await fetch("/api/dashboard/summary");
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Could not load your dashboard.");
        if (cancelled) return;
        setSummary(data);
        setSummaryStatus("ready");
      } catch {
        if (cancelled) return;
        setSummaryStatus("error");
      }
    }

    loadSummary();
    return () => {
      cancelled = true;
    };
  }, []);

  // Extract username from email or default to 'Nikko'
  const getUserName = () => {
    if (!email) return "Nikko";
    const parts = email.split("@");
    if (parts[0]) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    return "Nikko";
  };

  const goToDiagnostic = () => router.push("/diagnostic");

  const hasResults =
    summaryStatus === "ready" && summary?.hasCompletedDiagnostic;
  const weakest = summary?.weakest ?? [];
  const strongest = summary?.strongest ?? [];
  const recommendedProblems = summary?.recommendedProblems ?? [];
  // Pick a real "focus" concept for the learning path — the single weakest area.
  const focusConcept = weakest[0];

  const goToProblem = (slug) => router.push(`/practice/${slug}`);

  return (
    <main className={styles.dashboardContainer}>
      <div className={styles.dashboardGrid}>
        {/* Left Column: Sidebar Navigation */}
        <aside className={styles.sidebar}>
          {/* Active Session Box */}
          <div className={styles.activeSessionCard}>
            <div className={styles.pythonIconWrapper}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11.91 2C6.54 2 6.64 4.32 6.64 4.32H9.08C9.08 4.32 9.08 3.12 11.91 3.12C14.74 3.12 14.78 4.19 14.78 4.19C14.78 4.19 14.82 5.39 12.02 5.39C9.22 5.39 6.84 5.39 6.84 5.39C6.84 5.39 2 5.16 2 10.3C2 15.43 5.48 15.22 5.48 15.22H6.9V13.88C6.9 13.88 6.74 10.66 10.02 10.66C13.3 10.66 14.78 10.66 14.78 10.66C14.78 10.66 19.38 10.74 19.38 5.6C19.38 0.46 14.78 2 14.78 2H11.91Z"
                  fill="#306998"
                />
                <path
                  d="M12.09 22C17.46 22 17.36 19.68 17.36 19.68H14.92C14.92 19.68 14.92 20.88 12.09 20.88C9.26 20.88 9.22 19.81 9.22 19.81C9.22 19.81 9.18 18.61 11.98 18.61C14.78 18.61 17.16 18.61 17.16 18.61C17.16 18.61 22 18.84 22 13.7C22 8.57 18.52 8.78 18.52 8.78H17.1V10.12C17.1 10.12 17.26 13.34 13.98 13.34C10.7 13.34 9.22 13.34 9.22 13.34C9.22 13.34 4.62 13.26 4.62 18.4C4.62 23.54 9.22 22 9.22 22H12.09Z"
                  fill="#FFE873"
                />
                <circle cx="9.22" cy="4.5" r="0.75" fill="#FFE873" />
                <circle cx="14.78" cy="19.5" r="0.75" fill="#306998" />
              </svg>
            </div>
            <div className={styles.activeSessionMeta}>
              <h4 className={styles.activeSessionTitle}>Python Project</h4>
              <span className={styles.activeSessionStatus}>
                {hasResults
                  ? `${summary.overallScorePercentage}% DIAGNOSTIC SCORE`
                  : "ACTIVE SESSION"}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className={styles.sidebarNav}>
            <button
              onClick={() => setActiveTab("simulations")}
              className={`${styles.navBtn} ${activeTab === "simulations" ? styles.navBtnActive : ""}`}
            >
              <svg
                className={styles.navIcon}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="4" width="20" height="16" rx="4" />
                <path d="M7 10l3 2-3 2" />
                <path d="M12 14h5" />
              </svg>
              <span>Simulations</span>
            </button>

            <button
              onClick={() => setActiveTab("gallery")}
              className={`${styles.navBtn} ${activeTab === "gallery" ? styles.navBtnActive : ""}`}
            >
              <svg
                className={styles.navIcon}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>Gallery</span>
            </button>

            <button
              onClick={() => setActiveTab("progress")}
              className={`${styles.navBtn} ${activeTab === "progress" ? styles.navBtnActive : ""}`}
            >
              <svg
                className={styles.navIcon}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>My Progress</span>
            </button>
          </nav>

          {/* Action Trigger */}
          <button className={styles.newSimulationBtn} onClick={goToDiagnostic}>
            <svg
              className={styles.btnPlusIcon}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {hasResults ? "Retake Diagnostic" : "Start Diagnostic"}
          </button>

          {/* Footer Utilities */}
          <div className={styles.sidebarFooter}>
            <a href="#support" className={styles.footerLink}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              Support
            </a>
            <a href="#docs" className={styles.footerLink}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Documentation
            </a>
          </div>
        </aside>

        {/* Center/Right Columns: Dashboard Widgets */}
        <section className={styles.mainContent}>
          {activeTab === "simulations" && (
            <>
              {/* Welcome Card Banner */}
              <div className={styles.welcomeCard}>
                <div className={styles.welcomeInfo}>
                  <h2 className={styles.welcomeTitle}>
                    Welcome back, {getUserName()}
                  </h2>
                  <p className={styles.welcomeDesc}>
                    {hasResults
                      ? `You scored ${summary.overallScorePercentage}% on your diagnostic. ${
                          focusConcept
                            ? `${focusConcept.name} is your biggest opportunity to improve right now.`
                            : ""
                        }`
                      : "You haven't completed your diagnostic yet. Take it to see your personalized skill breakdown."}
                  </p>
                </div>

                <div
                  className={styles.adaptiveSessionBox}
                  onClick={() =>
                    recommendedProblems[0]
                      ? goToProblem(recommendedProblems[0].slug)
                      : goToDiagnostic()
                  }
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.adaptiveSessionMeta}>
                    <span className={styles.adaptiveLabel}>
                      {hasResults ? "SUGGESTED FOCUS" : "GET STARTED"}
                    </span>
                    <h5 className={styles.adaptiveTitle}>
                      {recommendedProblems[0]
                        ? recommendedProblems[0].title
                        : focusConcept
                          ? focusConcept.name
                          : "Take the Diagnostic"}
                    </h5>
                  </div>
                  <div className={styles.adaptiveArrow}>
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
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Middle Layout Grid: Chart + Learning Path */}
              <div className={styles.middleRow}>
                {/* Widget 1: Skill Growth Chart */}
                <article className={styles.chartCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.chartTitleWrapper}>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={styles.chartIconTitle}
                      >
                        <path d="M23 6l-9.5 9.5-5-5L1 18" />
                        <polyline points="17 6 23 6 23 12" />
                      </svg>
                      <h3 className={styles.cardTitle}>Skill Growth Chart</h3>
                    </div>

                    <div className={styles.dropdownPill}>
                      {hasResults ? "Latest Diagnostic" : "No Data Yet"}
                    </div>
                  </div>

                  {/* Glowing SVG Chart — decorative until multiple attempts exist for a real trend */}
                  <div className={styles.chartWrapper}>
                    <svg
                      className={styles.chartSvg}
                      width="100%"
                      height="200"
                      viewBox="0 0 500 200"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient
                          id="chartGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="var(--accent-cyan)"
                            stopOpacity="0.3"
                          />
                          <stop
                            offset="100%"
                            stopColor="var(--accent-cyan)"
                            stopOpacity="0.0"
                          />
                        </linearGradient>
                      </defs>

                      <line
                        x1="0"
                        y1="50"
                        x2="500"
                        y2="50"
                        stroke="rgba(255, 255, 255, 0.03)"
                        strokeWidth="1"
                      />
                      <line
                        x1="0"
                        y1="100"
                        x2="500"
                        y2="100"
                        stroke="rgba(255, 255, 255, 0.03)"
                        strokeWidth="1"
                      />
                      <line
                        x1="0"
                        y1="150"
                        x2="500"
                        y2="150"
                        stroke="rgba(255, 255, 255, 0.03)"
                        strokeWidth="1"
                      />

                      <path
                        d="M0 160 Q 150 150, 250 110 T 500 70 L 500 200 L 0 200 Z"
                        fill="url(#chartGradient)"
                      />
                      <path
                        d="M0 160 Q 150 150, 250 110 T 500 70"
                        fill="none"
                        stroke="var(--accent-cyan)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </svg>

                    <div className={styles.chartTooltip}>
                      <span className={styles.tooltipLabel}>OVERALL SCORE</span>
                      <span className={styles.tooltipValue}>
                        {hasResults
                          ? `${summary.overallScorePercentage}%`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </article>

                {/* Widget 2: Learning Path Timeline — built from real concept mastery */}
                <article className={styles.learningCard}>
                  <h3 className={styles.cardTitle}>Learning Path</h3>

                  <div className={styles.timeline}>
                    {!hasResults && (
                      <div
                        className={`${styles.timelineNode} ${styles.nodeLocked}`}
                      >
                        <div className={styles.nodeBody}>
                          <h4 className={styles.nodeTitle}>
                            Complete your diagnostic
                          </h4>
                          <span className={styles.nodeDesc}>
                            Your personalized learning path unlocks once you
                            finish the assessment.
                          </span>
                        </div>
                      </div>
                    )}

                    {hasResults && strongest[0] && (
                      <div
                        className={`${styles.timelineNode} ${styles.nodeCompleted}`}
                      >
                        <div className={styles.nodeCircle}>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <div className={styles.nodeBody}>
                          <h4 className={styles.nodeTitle}>
                            {strongest[0].name}
                          </h4>
                          <span className={styles.nodeDesc}>
                            Strongest area — {strongest[0].scorePercentage}%
                            correct
                          </span>
                        </div>
                      </div>
                    )}

                    {hasResults && focusConcept && (
                      <div
                        className={`${styles.timelineNode} ${styles.nodeSelected}`}
                      >
                        <div className={styles.nodeCircle}>
                          <div className={styles.innerDot} />
                        </div>
                        <div className={styles.nodeBody}>
                          <h4 className={styles.nodeTitle}>
                            {focusConcept.name}
                          </h4>
                          <span className={styles.nodeDesc}>
                            Recommended focus — {focusConcept.scorePercentage}%
                            correct
                          </span>
                        </div>
                      </div>
                    )}

                    {hasResults && weakest[1] && (
                      <div
                        className={`${styles.timelineNode} ${styles.nodeLocked}`}
                      >
                        <div className={styles.nodeCircle}>
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
                            <rect
                              x="3"
                              y="11"
                              width="18"
                              height="11"
                              rx="2"
                              ry="2"
                            />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </div>
                        <div className={styles.nodeBody}>
                          <h4 className={styles.nodeTitle}>
                            {weakest[1].name}
                          </h4>
                          <span className={styles.nodeDesc}>
                            Needs practice — {weakest[1].scorePercentage}%
                            correct
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              </div>

              {/* Recommended Practice — real problems matched to weak concepts */}
              {hasResults && recommendedProblems.length > 0 && (
                <article className={styles.recommendCard}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Recommended Practice</h3>
                    <span className={styles.recommendCount}>
                      {recommendedProblems.length} problems
                    </span>
                  </div>
                  <p className={styles.recommendSub}>
                    Targeted at your weakest concepts from the diagnostic.
                  </p>

                  <ul className={styles.recommendList}>
                    {recommendedProblems.slice(0, 6).map((rp) => (
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
                              {rp.reason}
                            </span>
                          </div>
                          <div className={styles.recommendItemMeta}>
                            <span
                              className={`${styles.difficultyPill} ${styles["difficulty_" + rp.difficulty]}`}
                            >
                              {rp.difficulty}
                            </span>
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

              {/* Lower Layout Grid: Milestone + Recent Activity */}
              <div className={styles.lowerRow}>
                {/* Milestone Widget */}
                <article className={styles.milestoneCard}>
                  <span className={styles.milestoneLabel}>
                    {hasResults ? "LATEST RESULT" : "GET STARTED"}
                  </span>

                  {hasResults ? (
                    <>
                      <h4 className={styles.milestoneTitle}>{summary.tier}</h4>
                      <p className={styles.milestoneDesc}>
                        Scored {summary.overallScorePercentage}% on the Codely
                        Beginner Diagnostic.
                      </p>
                    </>
                  ) : (
                    <>
                      <h4 className={styles.milestoneTitle}>
                        No diagnostic yet
                      </h4>
                      <p className={styles.milestoneDesc}>
                        Complete your diagnostic to see your skill breakdown
                        here.
                      </p>
                    </>
                  )}
                </article>

                {/* Widget 3: Recent Activity Table — real attempt(s) */}
                <article className={styles.activityCard}>
                  <h3 className={styles.cardTitle}>Recent Activity</h3>

                  <div className={styles.tableWrapper}>
                    <table className={styles.activityTable}>
                      <thead>
                        <tr>
                          <th>SIMULATION NAME</th>
                          <th>DATE</th>
                          <th>PERFORMANCE</th>
                          <th>BADGE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hasResults ? (
                          <tr>
                            <td className={styles.tableName}>
                              Codely Beginner Diagnostic
                            </td>
                            <td className={styles.tableDate}>
                              {new Date(
                                summary.latestAttempt.completedAt,
                              ).toLocaleDateString()}
                            </td>
                            <td>
                              <div className={styles.perfWrapper}>
                                <div
                                  className={`${styles.perfTrack} ${
                                    summary.overallScorePercentage >= 60
                                      ? styles.perfGreenFill
                                      : styles.perfYellowFill
                                  }`}
                                  style={{
                                    width: `${summary.overallScorePercentage}%`,
                                  }}
                                />
                                <span className={styles.perfVal}>
                                  {summary.overallScorePercentage}%
                                </span>
                              </div>
                            </td>
                            <td className={styles.tableIconCell}>
                              <svg
                                className={
                                  summary.overallScorePercentage >= 60
                                    ? styles.tableGreenIcon
                                    : styles.tableYellowIcon
                                }
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                              </svg>
                            </td>
                          </tr>
                        ) : (
                          <tr>
                            <td className={styles.tableName} colSpan={4}>
                              No activity yet — complete your first diagnostic
                              to see it here.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>
            </>
          )}

          {activeTab === "gallery" && <Gallery />}
          {activeTab === "progress" && (
            <Progress summary={summary} summaryStatus={summaryStatus} />
          )}
        </section>
      </div>

      {/* Floating play button at page level, outside all container boxes */}
      {activeTab === "simulations" && (
        <button
          className={styles.floatingPlayBtn}
          title="Start Diagnostic"
          onClick={goToDiagnostic}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>
      )}
    </main>
  );
}
