"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import styles from "./Dashboard.module.css";
import Progress from "./Progress";
import Recommendation from "./Recommendation";
import Support from "./Support";
import Documentation from "./Documentation";
import Terms from "./Terms";

export default function Dashboard({ email }) {
  const [activeTab, setActiveTab] = useState("simulations");
  const [summary, setSummary] = useState(null);
  const [summaryStatus, setSummaryStatus] = useState("loading"); // loading | ready | error
  const [showAllConcepts, setShowAllConcepts] = useState(false);
  const [adaptiveLoading, setAdaptiveLoading] = useState(false);
  const [adaptiveSuggestion, setAdaptiveSuggestion] = useState(null);
  const [adaptiveSuggestionLoading, setAdaptiveSuggestionLoading] = useState(false);
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
        // Fetch the live RF suggestion immediately after summary loads —
        // this is what the Suggested Focus card label and click destination
        // will show, so it must reflect the live adaptive engine, not the
        // stale diagnostic-time recommendation list.
        if (data.hasCompletedDiagnostic) {
          setAdaptiveSuggestionLoading(true);
          try {
            const adaptiveRes = await fetch("/api/practice/next-problem");
            const adaptiveData = await adaptiveRes.json();
            if (!cancelled && adaptiveRes.ok && adaptiveData?.problem?.slug) {
              setAdaptiveSuggestion({
                title: adaptiveData.problem.title,
                slug: adaptiveData.problem.slug,
                conceptName: adaptiveData.topic?.name ?? null,
                difficulty: adaptiveData.difficulty ?? null,
                progression: adaptiveData.problem.progression ?? null,
              });
            }
          } catch {
            // Silently fall back — card will use suggestedFocus from summary
          } finally {
            if (!cancelled) setAdaptiveSuggestionLoading(false);
          }
        }
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

  // Switching tabs swaps the entire main-content panel — without resetting
  // scroll, a user who scrolled down in one tab (e.g. Terms) lands on the next
  // tab already scrolled to the bottom instead of at its top.
  const changeTab = (tab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const hasResults =
    summaryStatus === "ready" && summary?.hasCompletedDiagnostic;
  const weakest = summary?.weakest ?? [];
  const allConcepts = summary?.allConcepts ?? [];
  const recommendedProblems = summary?.recommendedProblems ?? [];
  const recentActivity = summary?.recentActivity ?? [];
  // Server-computed so the card's label always agrees with where clicking it
  // actually goes (see suggestedFocus in /api/dashboard/summary/route.js).
  const suggestedFocus = summary?.suggestedFocus ?? null;

  // Skill Growth donut — counts per classification feed both the ring
  // segments and the legend, so they can never drift out of sync.
  const classificationCounts = allConcepts.reduce((acc, c) => {
    const key = c.classification || "insufficient_evidence";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const masteredCount = classificationCounts.strong || 0;
  const DONUT_SEGMENTS = [
    {
      key: "strong",
      label: "Strong",
      color: "var(--accent-teal)",
      count: classificationCounts.strong || 0,
    },
    {
      key: "developing",
      label: "Developing",
      color: "var(--accent-cyan)",
      count: classificationCounts.developing || 0,
    },
    {
      key: "needs_practice",
      label: "Needs Practice",
      color: "#f59e0b",
      count: classificationCounts.needs_practice || 0,
    },
    {
      key: "weak",
      label: "Weak",
      color: "#ef4444",
      count: classificationCounts.weak || 0,
    },
  ];
  const DONUT_RADIUS = 76;
  const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
  const donutTotal = allConcepts.length || 1;
  let donutCumulative = 0;

  const goToProblem = (slug) => router.push(`/practice/${slug}`);

  // durationSeconds is only known when the source data allows computing it
  // (see recentActivity in /api/dashboard/summary/route.js) — show a dash
  // rather than a fabricated 0:00 when it isn't available.
  const formatDuration = (durationSeconds) => {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return "—";
    const totalMinutes = Math.round(durationSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (totalMinutes > 0) return `${totalMinutes}m`;
    return "<1m";
  };

  // Calls the LIVE adaptive picker (cold-start rule -> circuit breaker -> RF
  // model -> weakest-topic problem selection; see
  // src/lib/adaptive/pickNextDifficulty.js and selectNextProblem.js). Used
  // only as a fallback when there's no specific recommended problem to name
  // (suggestedFocus.kind === "concept") — this picker's own topic-selection
  // strategy does NOT correspond to any single displayed concept, so it must
  // never be reached while the card is showing a specific suggestion.
  const startAdaptivePractice = async () => {
    setAdaptiveLoading(true);
    try {
      const res = await fetch("/api/practice/next-problem");
      const data = await res.json();
      if (res.ok && data?.problem?.slug) {
        router.push(`/practice/${data.problem.slug}`);
        return;
      }
      throw new Error(data?.error || "Adaptive pick did not return a problem.");
    } catch (err) {
      console.error(
        "Adaptive practice pick failed, falling back:",
        err.message,
      );
      if (recommendedProblems[0]) {
        goToProblem(recommendedProblems[0].slug);
      } else {
        goToDiagnostic();
      }
    } finally {
      setAdaptiveLoading(false);
    }
  };

  // The card must take the student exactly where its own label says it will:
  // if the label names a specific problem (suggestedFocus.kind === "problem"),
  // go straight there. Only fall back to the generic adaptive picker when
  // there's no specific problem to name yet.
  const startSuggestedFocus = () => {
    if (!hasResults) {
      goToDiagnostic();
      return;
    }
    if (adaptiveSuggestion?.slug) {
      goToProblem(adaptiveSuggestion.slug);
      return;
    }
    if (suggestedFocus?.kind === "problem") {
      goToProblem(suggestedFocus.problemSlug);
      return;
    }
    startAdaptivePractice();
  };

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
              onClick={() => changeTab("simulations")}
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
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => changeTab("progress")}
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
              onClick={() => changeTab("recommendation")}
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
                <circle cx="12" cy="12" r="4.5" />
                <circle cx="12" cy="12" r="0.5" fill="currentColor" />
              </svg>
              <span>Recommendation</span>
            </button>
          </nav>

          {/* Footer Utilities */}
          <div className={styles.sidebarFooter}>
            <button
              type="button"
              onClick={() => changeTab("support")}
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
              onClick={() => changeTab("docs")}
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
            <button
              type="button"
              onClick={() => changeTab("terms")}
              className={`${styles.footerLink} ${activeTab === "terms" ? styles.footerLinkActive : ""}`}
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
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Terms & Conditions
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
                          adaptiveSuggestion
                            ? `${adaptiveSuggestion.conceptName ?? adaptiveSuggestion.title} is your biggest opportunity to improve right now.`
                            : suggestedFocus
                              ? `${suggestedFocus.title} is your biggest opportunity to improve right now.`
                              : ""
                        }`
                      : "You haven't completed your diagnostic yet. Take it to see your personalized skill breakdown."}
                  </p>
                </div>

                <div
                  className={styles.adaptiveSessionBox}
                  onClick={startSuggestedFocus}
                  role="button"
                  tabIndex={0}
                  aria-busy={adaptiveLoading}
                  style={
                    adaptiveLoading
                      ? { pointerEvents: "none", opacity: 0.7 }
                      : undefined
                  }
                >
                  <div className={styles.adaptiveSessionMeta}>
                    <span className={styles.adaptiveLabel}>
                      {hasResults ? "SUGGESTED FOCUS" : "GET STARTED"}
                    </span>
                    <h5 className={styles.adaptiveTitle}>
                      {adaptiveLoading || adaptiveSuggestionLoading
                        ? "Finding your next problem…"
                        : hasResults
                          ? suggestedFocus
                            ? adaptiveSuggestion
                              ? adaptiveSuggestion.title
                              : suggestedFocus.kind === "problem"
                                ? suggestedFocus.title
                                : `${suggestedFocus.title} Practice`
                            : "Continue Practicing"
                          : "Take the Diagnostic"}
                    </h5>
                    {adaptiveSuggestion?.conceptName && !adaptiveLoading && !adaptiveSuggestionLoading && (
                      <p className={styles.adaptiveConceptName}>
                        {adaptiveSuggestion.conceptName.toUpperCase()}
                      </p>
                    )}
                    {adaptiveSuggestion && !adaptiveLoading && !adaptiveSuggestionLoading && (
                      <p className={styles.adaptiveConceptName}>
                        {adaptiveSuggestion.difficulty && (
                          <>
                            <span className={styles.adaptiveConceptLabel}>Concept:</span>
                            {" "}<span className={styles[`adaptiveConcept${adaptiveSuggestion.difficulty.charAt(0).toUpperCase() + adaptiveSuggestion.difficulty.slice(1)}`]}>
                              {adaptiveSuggestion.difficulty.charAt(0).toUpperCase() + adaptiveSuggestion.difficulty.slice(1)}
                            </span>
                          </>
                        )}
                        {adaptiveSuggestion.difficulty && adaptiveSuggestion.progression && (
                          <span className={styles.adaptiveConceptSep}> · </span>
                        )}
                        {adaptiveSuggestion.progression && (
                          <>
                            <span className={styles.adaptiveConceptLabel}>Problem:</span>
                            {" "}<span className={styles[`adaptiveConcept${adaptiveSuggestion.progression.charAt(0).toUpperCase() + adaptiveSuggestion.progression.slice(1)}`]}>
                              {adaptiveSuggestion.progression.charAt(0).toUpperCase() + adaptiveSuggestion.progression.slice(1)}
                            </span>
                          </>
                        )}
                      </p>
                    )}
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

              {/* Middle Layout Grid: Skill Growth Chart + Learning Path */}
              <div className={styles.middleRow}>
              {/* Skill Growth Chart — donut of concept classifications */}
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

                  {hasResults ? (
                    <button
                      type="button"
                      className={styles.dropdownPill}
                      onClick={() => setShowAllConcepts(true)}
                    >
                      View all
                    </button>
                  ) : (
                    <div className={styles.dropdownPill}>No Data Yet</div>
                  )}
                </div>

                <div className={styles.chartWrapper}>
                  {!hasResults ? (
                    <div className={styles.chartEmpty}>
                      Complete your diagnostic to see your skill breakdown.
                    </div>
                  ) : (
                    <>
                      <div className={styles.donutRow}>
                        <div className={styles.donutBlock}>
                          <svg
                            className={styles.donutSvg}
                            viewBox="0 0 190 190"
                            width="190"
                            height="190"
                          >
                            <circle
                              cx="95"
                              cy="95"
                              r={DONUT_RADIUS}
                              fill="none"
                              stroke="rgba(255, 255, 255, 0.06)"
                              strokeWidth="20"
                            />
                            <g transform="rotate(-90 95 95)">
                              {DONUT_SEGMENTS.filter((s) => s.count > 0).map(
                                (s) => {
                                  const dash =
                                    (s.count / donutTotal) *
                                    DONUT_CIRCUMFERENCE;
                                  const offset = -donutCumulative;
                                  donutCumulative += dash;
                                  // Small gap + round caps give each arc a
                                  // pill-shaped end instead of touching seams.
                                  const gap = Math.min(6, dash * 0.3);
                                  const visibleDash = Math.max(dash - gap, 0);
                                  return (
                                    <circle
                                      key={s.key}
                                      className={styles.donutSlice}
                                      cx="95"
                                      cy="95"
                                      r={DONUT_RADIUS}
                                      fill="none"
                                      stroke={s.color}
                                      strokeWidth="20"
                                      strokeDasharray={`${visibleDash} ${DONUT_CIRCUMFERENCE}`}
                                      strokeDashoffset={offset}
                                      strokeLinecap="round"
                                    />
                                  );
                                },
                              )}
                            </g>
                          </svg>
                          <div className={styles.donutCenter}>
                            <span className={styles.donutScore}>
                              {summary.overallMasteryPercentage}%
                            </span>
                            <span className={styles.donutScoreLabel}>
                              Overall
                            </span>
                          </div>
                        </div>

                        <div className={styles.donutLegend}>
                          {DONUT_SEGMENTS.map((s, i) => (
                            <Fragment key={s.key}>
                              <span
                                className={`${styles.donutLegendDot} ${
                                  i % 2 === 1 ? styles.donutLegendDotRight : ""
                                }`}
                                style={{ background: s.color }}
                              />
                              <span className={styles.donutLegendLabel}>
                                {s.label}
                              </span>
                              <span className={styles.donutLegendCount}>
                                {s.count}
                              </span>
                            </Fragment>
                          ))}
                        </div>
                      </div>

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
                                  <span className={styles.modalSubtitle}>
                                    {allConcepts.length} concepts ·{" "}
                                    {summary.overallMasteryPercentage}% overall
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className={styles.modalClose}
                                  onClick={() => setShowAllConcepts(false)}
                                >
                                  ✕
                                </button>
                              </div>
                              <div className={styles.modalBody}>
                                {DONUT_SEGMENTS.filter((s) => s.count > 0).map(
                                  (s) => (
                                    <div
                                      key={s.key}
                                      className={styles.modalGroup}
                                    >
                                      <div className={styles.modalGroupHeader}>
                                        <span
                                          className={styles.modalGroupDot}
                                          style={{ background: s.color }}
                                        />
                                        <span className={styles.modalGroupLabel}>
                                          {s.label}
                                        </span>
                                        <span className={styles.modalGroupCount}>
                                          {s.count}
                                        </span>
                                      </div>
                                      <ul className={styles.modalGroupList}>
                                        {allConcepts
                                          .filter(
                                            (c) =>
                                              (c.classification ||
                                                "insufficient_evidence") ===
                                              s.key,
                                          )
                                          .map((c) => (
                                            <li
                                              key={c.conceptId}
                                              className={styles.modalItem}
                                            >
                                              <span
                                                className={styles.modalItemName}
                                              >
                                                {c.name}
                                              </span>
                                              <div
                                                className={styles.modalItemMeter}
                                              >
                                                <div
                                                  className={
                                                    styles.modalItemMeterFill
                                                  }
                                                  style={{
                                                    width: `${c.scorePercentage}%`,
                                                    backgroundColor: s.color,
                                                  }}
                                                />
                                              </div>
                                              <span
                                                className={styles.modalItemPct}
                                              >
                                                {c.scorePercentage}%
                                              </span>
                                            </li>
                                          ))}
                                      </ul>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          </div>,
                          document.body,
                        )}
                    </>
                  )}
                </div>
              </article>

              {/* Learning Path — top weak concepts, alongside the chart */}
              <article className={styles.learningCard}>
                <h3 className={styles.cardTitle}>Learning Path</h3>

                {!hasResults ? (
                  <p className={styles.nodeDesc}>
                    Complete your diagnostic to unlock your personalized
                    learning path.
                  </p>
                ) : (
                  <>
                    <ul className={styles.learningPathList}>
                      {allConcepts.slice(0, 4).map((c) => (
                        <li key={c.conceptId} className={styles.learningPathItem}>
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
                            width: `${(masteredCount / (allConcepts.length || 1)) * 100}%`,
                          }}
                        />
                      </div>
                      <span className={styles.masteryStripLabel}>
                        {masteredCount} of {allConcepts.length} concepts
                        mastered
                      </span>
                    </div>

                    <button
                      type="button"
                      className={styles.viewAllBtn}
                      onClick={() => setShowAllConcepts(true)}
                    >
                      View all {allConcepts.length} concepts →
                    </button>
                  </>
                )}
              </article>
              </div>

              {/* Lower Layout Grid: Recent Activity */}
              <div className={styles.lowerRow}>
                {/* Widget 3: Recent Activity Table — real attempt(s) */}
                <article className={styles.activityCard}>
                  <h3 className={styles.cardTitle}>Recent Activity</h3>

                  <div className={styles.tableWrapper}>
                    <table className={styles.activityTable}>
                      <colgroup>
                        <col style={{ width: "24%" }} />
                        <col style={{ width: "13%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "25%" }} />
                        <col style={{ width: "12%" }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>SIMULATION NAME</th>
                          <th>DATE</th>
                          <th>TIME</th>
                          <th>TIME SPENT</th>
                          <th>PERFORMANCE</th>
                          <th>BADGE</th>
                        </tr>
                      </thead>
                    </table>
                    <div className={styles.tableScrollBody}>
                    <table className={styles.activityTable}>
                      <colgroup>
                        <col style={{ width: "24%" }} />
                        <col style={{ width: "13%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "25%" }} />
                        <col style={{ width: "12%" }} />
                      </colgroup>
                      <tbody>
                        {recentActivity.length ? (
                          recentActivity.map((a, i) => (
                            <tr key={`${a.kind}-${a.slug ?? "diagnostic"}-${a.date}-${i}`}>
                              <td className={styles.tableName}>{a.name}</td>
                              <td className={styles.tableDate}>
                                {new Date(a.date).toLocaleDateString()}
                              </td>
                              <td className={styles.tableDate}>
                                {new Date(a.date).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className={styles.tableDate}>
                                {formatDuration(a.durationSeconds)}
                              </td>
                              <td>
                                <div className={styles.perfWrapper}>
                                  <div
                                    className={`${styles.perfTrack} ${
                                      a.scorePercentage >= 60
                                        ? styles.perfGreenFill
                                        : styles.perfYellowFill
                                    }`}
                                    style={{
                                      width: `${a.scorePercentage}%`,
                                    }}
                                  />
                                  <span className={styles.perfVal}>
                                    {a.scorePercentage}%
                                  </span>
                                </div>
                              </td>
                              <td className={styles.tableIconCell}>
                                {a.passed ? (
                                  <svg
                                    className={styles.tableGreenIcon}
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
                                ) : (
                                  <svg
                                    className={styles.tableYellowIcon}
                                    width="16"
                                    height="16"
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
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className={styles.tableName} colSpan={6}>
                              No activity yet — complete your first diagnostic
                              or practice problem to see it here.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    </div>
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
              recommendedProblems={recommendedProblems}
              onSelectProblem={goToProblem}
              hasDiagnostic={hasResults}
            />
          )}
          {activeTab === "support" && <Support embedded />}
          {activeTab === "docs" && <Documentation embedded />}
          {activeTab === "terms" && <Terms embedded />}
        </section>
      </div>
    </main>
  );
}
