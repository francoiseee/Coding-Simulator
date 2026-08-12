"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import styles from "./Dashboard.module.css";
import Progress from "./Progress";
import Recommendation from "./Recommendation";
import Support from "./Support";
import Documentation from "./Documentation";

export default function Dashboard({ email }) {
  const [activeTab, setActiveTab] = useState("simulations");
  const [summary, setSummary] = useState(null);
  const [summaryStatus, setSummaryStatus] = useState("loading"); // loading | ready | error
  const [showAllConcepts, setShowAllConcepts] = useState(false);
  const [showChartDetails, setShowChartDetails] = useState(false);
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

  // Prefer the onboarding display name, then fall back to email, then a generic greeting
  const getUserName = () => {
    if (summary?.displayName) return summary.displayName;
    if (!email) return "there";
    const parts = email.split("@");
    if (parts[0]) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    return "there";
  };

  const goToDiagnostic = () => router.push("/diagnostic");

  const hasResults =
    summaryStatus === "ready" && summary?.hasCompletedDiagnostic;
  const weakest = summary?.weakest ?? [];
  const allConcepts = summary?.allConcepts ?? [];
  const recommendedProblems = summary?.recommendedProblems ?? [];
  // Pick a real "focus" concept for the learning path — the single weakest area.
  const focusConcept = weakest[0];

  const goToProblem = (slug) => router.push(`/practice/${slug}`);

  // Status colors double as the meter fill and the donut slice — one legend,
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

  // Donut geometry: one ring, one gap width, slices ordered to match the
  // legend below it so color always lands next to its label.
  const DONUT_RADIUS = 42;
  const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
  const DONUT_GAP = 3;
  const conceptTotal = allConcepts.length || 1;
  let donutCumulative = 0;
  const donutSlices = Object.keys(STATUS_META)
    .map((key) => ({
      key,
      ...STATUS_META[key],
      count: allConcepts.filter((c) => c.classification === key).length,
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

  // Same status buckets as the donut, reused to group the "All Concepts"
  // modal so it reads as one system with the chart instead of a flat list.
  const conceptGroups = Object.keys(STATUS_META)
    .map((key) => ({
      key,
      ...STATUS_META[key],
      items: allConcepts.filter((c) => c.classification === key),
    }))
    .filter((group) => group.items.length > 0);

  const masteredCount = allConcepts.filter(
    (c) => c.classification === "strong",
  ).length;

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

            <button
              onClick={() => setActiveTab("recommendation")}
              className={`${styles.navBtn} ${activeTab === "recommendation" ? styles.navBtnActive : ""}`}
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
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1" />
              </svg>
              <span>Recommendation</span>
            </button>
          </nav>

          {/* Footer Utilities */}
          <div className={styles.sidebarFooter}>
            <button
              type="button"
              onClick={() => setActiveTab("support")}
              className={`${styles.footerLink} ${activeTab === "support" ? styles.footerLinkActive : ""}`}
            >
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
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("docs")}
              className={`${styles.footerLink} ${activeTab === "docs" ? styles.footerLinkActive : ""}`}
            >
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
            </button>
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
                      {hasResults ? "CODING CHALLENGE" : "GET STARTED"}
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

              {/* Skill Growth Chart + Learning Path — one card, split in two */}
              <article className={styles.chartCard}>
                <div className={styles.chartSplitRow}>
                  {/* Left: donut + view all + legend */}
                  <div className={styles.chartLeftCol}>
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

                    {!hasResults ? (
                      <div className={styles.chartEmpty}>
                        Complete your diagnostic to see your skill breakdown.
                      </div>
                    ) : (
                      <>
                        <div className={styles.donutBlock}>
                          <svg
                            className={styles.donutSvg}
                            viewBox="0 0 100 100"
                            width="150"
                            height="150"
                          >
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
                                  {slice.label}: {slice.count} concept
                                  {slice.count === 1 ? "" : "s"}
                                </title>
                              </circle>
                            ))}
                          </svg>
                          <div className={styles.donutCenter}>
                            <span className={styles.donutScore}>
                              {summary.overallScorePercentage}%
                            </span>
                            <span className={styles.donutScoreLabel}>Overall</span>
                          </div>
                        </div>

                        <ul className={styles.donutLegend}>
                          {Object.keys(STATUS_META).map((key) => {
                            const meta = STATUS_META[key];
                            const count = allConcepts.filter(
                              (c) => c.classification === key,
                            ).length;
                            return (
                              <li
                                key={key}
                                className={styles.donutLegendItem}
                                style={{ opacity: count > 0 ? 1 : 0.35 }}
                              >
                                <span
                                  className={styles.donutLegendDot}
                                  style={{ backgroundColor: meta.color }}
                                />
                                <span className={styles.donutLegendLabel}>
                                  {meta.label}
                                </span>
                                <span className={styles.donutLegendCount}>
                                  {count}
                                </span>
                              </li>
                            );
                          })}
                        </ul>

                        <button
                          type="button"
                          className={`${styles.dropdownPill} ${styles.chartViewAllPill}`}
                          onClick={() => setShowChartDetails(true)}
                        >
                          View all
                        </button>
                      </>
                    )}
                  </div>

                  {/* Right: Learning Path — built from real concept mastery */}
                  <div className={styles.chartRightCol}>
                    <h3 className={styles.cardTitle}>Learning Path</h3>

                    {!hasResults ? (
                      <div className={styles.timeline}>
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
                      </div>
                    ) : (
                      <>
                        <ul className={styles.learningPathList}>
                          {allConcepts.slice(0, 3).map((c) => (
                            <li
                              key={c.conceptId}
                              className={styles.learningPathItem}
                            >
                              <span
                                className={`${styles.learningPathDot} ${
                                  c.classification === "strong"
                                    ? styles.dotStrong
                                    : c.classification === "weak" ||
                                        c.classification === "needs_practice"
                                      ? styles.dotWeak
                                      : styles.dotNeutral
                                }`}
                              />
                              <div className={styles.learningPathText}>
                                <h4 className={styles.nodeName}>{c.name}</h4>
                                <span className={styles.nodeDesc}>
                                  {c.classification === "strong"
                                    ? `Strongest area — ${c.scorePercentage}% correct`
                                    : c.classification === "weak"
                                      ? `Needs work — ${c.scorePercentage}% correct`
                                      : c.classification === "needs_practice"
                                        ? `Recommended focus — ${c.scorePercentage}% correct`
                                        : `${c.scorePercentage}% correct`}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>

                        <div className={styles.masteryStrip}>
                          <div className={styles.masteryStripTrack}>
                            <div
                              className={styles.masteryStripFill}
                              style={{
                                width: `${(masteredCount / conceptTotal) * 100}%`,
                              }}
                            />
                          </div>
                          <span className={styles.masteryStripLabel}>
                            {masteredCount} of {allConcepts.length} concepts
                            mastered
                          </span>
                        </div>

                        {allConcepts.length > 3 && (
                          <button
                            type="button"
                            className={styles.viewAllBtn}
                            onClick={() => setShowAllConcepts(true)}
                          >
                            View all {allConcepts.length} concepts
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
                              <line x1="5" y1="12" x2="19" y2="12" />
                              <polyline points="12 5 19 12 12 19" />
                            </svg>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {showChartDetails &&
                    hasResults &&
                    typeof document !== "undefined" &&
                    createPortal(
                      <div
                        className={styles.modalBackdrop}
                        onClick={() => setShowChartDetails(false)}
                      >
                        <div
                          className={styles.modalCard}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className={styles.modalHeader}>
                            <div className={styles.modalHeaderText}>
                              <h3 className={styles.modalTitle}>
                                Latest Diagnostic
                              </h3>
                              <p className={styles.modalSubtitle}>
                                {allConcepts.length} concepts ·{" "}
                                {summary.overallScorePercentage}% overall
                              </p>
                            </div>
                            <button
                              type="button"
                              className={styles.modalClose}
                              onClick={() => setShowChartDetails(false)}
                              aria-label="Close"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                          <div className={styles.modalBody}>
                            <div className={styles.barChart}>
                              {allConcepts.map((c) => {
                                const meta = getStatusMeta(c.classification);
                                return (
                                  <div
                                    key={c.conceptId}
                                    className={styles.barRow}
                                    title={`${c.name}: ${c.scorePercentage}% — ${c.classificationLabel}`}
                                  >
                                    <span className={styles.barLabel}>
                                      {c.name}
                                    </span>
                                    <div className={styles.barTrack}>
                                      <div
                                        className={styles.barFill}
                                        style={{
                                          width: `${c.scorePercentage}%`,
                                          backgroundColor: meta.color,
                                        }}
                                      />
                                    </div>
                                    <span
                                      className={styles.barStatusDot}
                                      style={{ backgroundColor: meta.color }}
                                    />
                                    <span className={styles.barPct}>
                                      {c.scorePercentage}%
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>,
                      document.body,
                    )}

                {showAllConcepts &&
                  typeof document !== "undefined" &&
                  createPortal(
                    <div
                      className={styles.modalBackdrop}
                      onClick={() => setShowAllConcepts(false)}
                    >
                      <div
                        className={styles.modalCard}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className={styles.modalHeader}>
                          <div className={styles.modalHeaderText}>
                            <h3 className={styles.modalTitle}>
                              All Concepts
                            </h3>
                            <p className={styles.modalSubtitle}>
                              {allConcepts.length} concepts ·{" "}
                              {summary.overallScorePercentage}% overall
                            </p>
                          </div>
                          <button
                            type="button"
                            className={styles.modalClose}
                            onClick={() => setShowAllConcepts(false)}
                            aria-label="Close"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                        <div className={styles.modalBody}>
                          {conceptGroups.map((group) => (
                            <div key={group.key} className={styles.modalGroup}>
                              <div className={styles.modalGroupHeader}>
                                <span
                                  className={styles.modalGroupDot}
                                  style={{ backgroundColor: group.color }}
                                />
                                <span className={styles.modalGroupLabel}>
                                  {group.label}
                                </span>
                                <span className={styles.modalGroupCount}>
                                  {group.items.length}
                                </span>
                              </div>
                              <ul className={styles.modalGroupList}>
                                {group.items.map((c) => (
                                  <li key={c.conceptId} className={styles.modalItem}>
                                    <span className={styles.modalItemName}>
                                      {c.name}
                                    </span>
                                    <div className={styles.modalItemMeter}>
                                      <div
                                        className={styles.modalItemMeterFill}
                                        style={{
                                          width: `${c.scorePercentage}%`,
                                          backgroundColor: group.color,
                                        }}
                                      />
                                    </div>
                                    <span className={styles.modalItemPct}>
                                      {c.scorePercentage}%
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )}
              </article>

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
                          <th className={styles.tableIconCell}>BADGE</th>
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

          {activeTab === "progress" && (
            <Progress summary={summary} summaryStatus={summaryStatus} />
          )}
          {activeTab === "recommendation" && (
            <Recommendation
              hasResults={hasResults}
              recommendedProblems={recommendedProblems}
            />
          )}
          {activeTab === "support" && <Support embedded />}
          {activeTab === "docs" && <Documentation embedded />}
        </section>
      </div>
    </main>
  );
}
