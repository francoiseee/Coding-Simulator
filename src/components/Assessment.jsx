'use client';

import { useState, useEffect } from 'react';
import styles from './Assessment.module.css';

// 10 realistic computer science questions with code-highlighted terms using backticks
// need database of questions
const QUESTIONS = [
  {
    category: 'COMPUTER SCIENCE • DATA STRUCTURES',
    text: 'What is the average time complexity of a `HashMap.get()` operation in Java?',
    options: [
      { key: 'A', text: 'O(n)' },
      { key: 'B', text: 'O(1)' },
      { key: 'C', text: 'O(log n)' },
      { key: 'D', text: 'O(n log n)' }
    ],
    correctIndex: 1 // 'B'
  },
  {
    category: 'COMPUTER SCIENCE • WEB DEVELOPMENT',
    text: 'Which of the following is true about a `closure` in JavaScript?',
    options: [
      { key: 'A', text: 'It is a way to declare private class fields only' },
      { key: 'B', text: 'It allows an inner function to access the outer scope even after the outer function has returned' },
      { key: 'C', text: 'It is a mechanism that automatically closes inactive database sockets' },
      { key: 'D', text: 'It prevents memory leaks by deleting unused references' }
    ],
    correctIndex: 1 // 'B'
  },
  {
    category: 'DATABASE SYSTEMS • SQL',
    text: 'Which SQL join returns `all rows` from the left table, and the matched rows from the right table?',
    options: [
      { key: 'A', text: 'INNER JOIN' },
      { key: 'B', text: 'RIGHT JOIN' },
      { key: 'C', text: 'LEFT JOIN' },
      { key: 'D', text: 'FULL OUTER JOIN' }
    ],
    correctIndex: 2 // 'C'
  },
  {
    category: 'COMPUTER SCIENCE • ALGORITHMS',
    text: 'Which sorting algorithm has a guaranteed worst-case time complexity of `O(n log n)`?',
    options: [
      { key: 'A', text: 'Bubble Sort' },
      { key: 'B', text: 'Insertion Sort' },
      { key: 'C', text: 'Merge Sort' },
      { key: 'D', text: 'Selection Sort' }
    ],
    correctIndex: 2 // 'C'
  },
  {
    category: 'SOFTWARE ENGINEERING • DESIGN PATTERNS',
    text: 'Which design pattern restricts the instantiation of a class to a `single instance`?',
    options: [
      { key: 'A', text: 'Singleton Pattern' },
      { key: 'B', text: 'Factory Method' },
      { key: 'C', text: 'Observer Pattern' },
      { key: 'D', text: 'Strategy Pattern' }
    ],
    correctIndex: 0 // 'A'
  },
  {
    category: 'COMPUTER ARCHITECTURE • MEMORY',
    text: 'What is the primary purpose of a `CPU cache`?',
    options: [
      { key: 'A', text: 'To expand the virtual storage capacity of the solid state drive' },
      { key: 'B', text: 'To store frequently accessed instructions and data close to the CPU core for speed' },
      { key: 'C', text: 'To schedule parallel processes across hyperthreads' },
      { key: 'D', text: 'To isolate sandbox environments from host system memory' }
    ],
    correctIndex: 1 // 'B'
  },
  {
    category: 'COMPUTER SCIENCE • DATA STRUCTURES',
    text: 'In a binary search tree (BST), which `traversal method` visits nodes in ascending order?',
    options: [
      { key: 'A', text: 'Pre-order traversal' },
      { key: 'B', text: 'In-order traversal' },
      { key: 'C', text: 'Post-order traversal' },
      { key: 'D', text: 'Level-order traversal' }
    ],
    correctIndex: 1 // 'B'
  },
  {
    category: 'OPERATING SYSTEMS • CONCURRENCY',
    text: 'What constitutes a `deadlock` in an operating system environment?',
    options: [
      { key: 'A', text: 'A process that terminates immediately due to a page fault' },
      { key: 'B', text: 'A state where two or more processes are permanently blocked, each waiting for resources held by the other' },
      { key: 'C', text: 'A high network packet collision rate causing TCP packet drop' },
      { key: 'D', text: 'A stack overflow error in the main thread of execution' }
    ],
    correctIndex: 1 // 'B'
  },
  {
    category: 'WEB SECURITY • PROTOCOLS',
    text: 'What does the security layer in `HTTPS` encrypt?',
    options: [
      { key: 'A', text: 'Only the request URL path' },
      { key: 'B', text: 'Only the request headers' },
      { key: 'C', text: 'The entire HTTP request and response payload, headers, and query strings' },
      { key: 'D', text: 'Only the user authentication cookies' }
    ],
    correctIndex: 2 // 'C'
  },
  {
    category: 'DATA STRUCTURES • GRAPH THEORY',
    text: 'Which algorithm is commonly used to find the `shortest path` in a weighted graph with non-negative edge weights?',
    options: [
      { key: 'A', text: 'Depth-First Search (DFS)' },
      { key: 'B', text: 'Dijkstra\'s Algorithm' },
      { key: 'C', text: 'Kruskal\'s Algorithm' },
      { key: 'D', text: 'Prim\'s Algorithm' }
    ],
    correctIndex: 1 // 'B'
  }
];

export default function Assessment({ email, onEnterDashboard }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selections, setSelections] = useState(Array(QUESTIONS.length).fill(null));
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900); // 15:00 minutes (900 seconds)

  // Timer countdown hook
  useEffect(() => {
    if (isSubmitted || timeLeft <= 0) {
      if (timeLeft <= 0 && !isSubmitted) {
        setIsSubmitted(true);
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isSubmitted]);

  // Format time remaining
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format question text to highlight inline code inside backticks
  const renderQuestionText = (text) => {
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <span key={index} className={styles.highlightText}>
            {part.slice(1, -1)}
          </span>
        );
      }
      return part;
    });
  };

  const handleSelectOption = (optionIndex) => {
    const nextSelections = [...selections];
    nextSelections[currentIdx] = optionIndex;
    setSelections(nextSelections);
  };

  const handleConfirmAnswer = () => {
    if (selections[currentIdx] === null) {
      alert("Please select an option before confirming.");
      return;
    }

    if (currentIdx < QUESTIONS.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setIsSubmitted(true);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentIdx > 0) {
      setCurrentIdx((prev) => prev - 1);
    }
  };

  const calculateScore = () => {
    return selections.reduce((score, selection, idx) => {
      return score + (selection === QUESTIONS[idx].correctIndex ? 1 : 0);
    }, 0);
  };

  const getPlacementLevel = (score) => {
    if (score >= 9) return { level: 'L10 - System Architect Node', desc: 'Highest entry level. Access granted to core compiler nodes and unrestricted simulator APIs.' };
    if (score >= 7) return { level: 'L7 - Senior Node Operator', desc: 'Advanced status. Level bypassed past basic data structures and syntax operations.' };
    if (score >= 5) return { level: 'L5 - Mid-tier Operator', desc: 'Intermediate status. Unlocked intermediate simulation threads and database optimization units.' };
    if (score >= 3) return { level: 'L3 - Junior Operator', desc: 'Novice status. Ready for fundamental coding challenges and syntax-directed routing.' };
    return { level: 'L1 - Entry-level Node', desc: 'Starter node. Recommending core coding structures, debugging principles, and introductory packages.' };
  };

  const score = calculateScore();
  const placement = getPlacementLevel(score);

  if (isSubmitted) {
    return (
      <main className={styles.dashboardContainer}>
        <div className={styles.resultsCard}>
          <div className={styles.resultsHeader}>
            <div className={styles.terminalDotWrapper}>
              <span className={`${styles.dot} ${styles.dotRed}`} />
              <span className={`${styles.dot} ${styles.dotYellow}`} />
              <span className={`${styles.dot} ${styles.dotGreen}`} />
            </div>
            <h2 className={styles.resultsTitle}>Assessment Results Completed</h2>
            <p className={styles.resultsEmail}>Operator Identity: {email || 'operator@codely.io'}</p>
          </div>

          <div className={styles.resultsBody}>
            <div className={styles.scoreCircleWrapper}>
              <div className={styles.scoreCircle}>
                <span className={styles.scoreText}>{score}</span>
                <span className={styles.scoreTotal}>/ {QUESTIONS.length}</span>
              </div>
              <p className={styles.scoreLabel}>Correct Answers</p>
            </div>

            <div className={styles.placementCard}>
              <div className={styles.placementBadge}>Assigned Node Rank</div>
              <h3 className={styles.placementTitle}>{placement.level}</h3>
              <p className={styles.placementDesc}>{placement.desc}</p>
            </div>
          </div>

          <div className={styles.detailedSummary}>
            <h4 className={styles.summaryTitle}>Assessment Log</h4>
            <div className={styles.questionLogList}>
              {QUESTIONS.map((q, idx) => {
                const isCorrect = selections[idx] === q.correctIndex;
                return (
                  <div key={idx} className={`${styles.logRow} ${isCorrect ? styles.logCorrect : styles.logIncorrect}`}>
                    <div className={styles.logMeta}>
                      <span className={styles.logNumber}>Node #{idx + 1}</span>
                      <span className={styles.logStatus}>{isCorrect ? 'SUCCESS' : 'FAILURE'}</span>
                    </div>
                    <p className={styles.logQuestionText}>{renderQuestionText(q.text)}</p>
                    <div className={styles.logChoices}>
                      <p>Your choice: <span className={styles.choiceCode}>{selections[idx] !== null ? q.options[selections[idx]].key : 'None'}</span></p>
                      {!isCorrect && (
                        <p>Correct choice: <span className={styles.choiceCode}>{q.options[q.correctIndex].key} ({q.options[q.correctIndex].text})</span></p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.resultsFooter}>
            <button
              onClick={() => {
                setCurrentIdx(0);
                setSelections(Array(QUESTIONS.length).fill(null));
                setIsSubmitted(false);
                setTimeLeft(900);
              }}
              className={styles.resetBtn}
            >
              Restart Simulation Test
            </button>
            {onEnterDashboard && (
              <button
                onClick={onEnterDashboard}
                className={styles.enterDashboardBtn}
              >
                Enter Simulation Dashboard
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  const currentQuestion = QUESTIONS[currentIdx];
  const answeredCount = selections.filter((ans) => ans !== null).length;
  // Progress calculations
  const progressPercent = Math.round(((currentIdx + 1) / QUESTIONS.length) * 100);

  return (
    <main className={styles.dashboardContainer}>
      <div className={styles.dashboardGrid}>

        {/* Progress and Timer Banner - Spans Full Width */}
        <section className={styles.progressBanner}>
          <div className={styles.progressInfo}>
            <span className={styles.progressLabel}>
              ASSESSMENT PROGRESS: {currentIdx + 1}/{QUESTIONS.length}
            </span>
            <span className={styles.completionLabel}>
              {progressPercent}% Complete
            </span>
          </div>

          <div className={styles.progressBarWrapper}>
            <div
              className={styles.progressBarFill}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className={styles.timerWrapper}>
            <svg
              className={styles.timerIcon}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className={styles.timeString}>{formatTime(timeLeft)}</span>
          </div>
        </section>

        {/* Left Column: Question Card */}
        <section className={styles.questionCard}>
          <div className={styles.questionHeader}>
            <div className={styles.categoryTag}>
              <span className={styles.tagIcon}>&lt;&gt;</span>
              {currentQuestion.category}
            </div>
          </div>

          <h2 className={styles.questionTitle}>
            {renderQuestionText(currentQuestion.text)}
          </h2>

          <div className={styles.optionsList}>
            {currentQuestion.options.map((opt, idx) => {
              const isSelected = selections[currentIdx] === idx;
              return (
                <div
                  key={opt.key}
                  className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ''}`}
                  onClick={() => handleSelectOption(idx)}
                >
                  <div className={`${styles.optionKey} ${isSelected ? styles.optionKeySelected : ''}`}>
                    {opt.key}
                  </div>
                  <div className={styles.optionText}>
                    {opt.text}
                  </div>
                  {isSelected && (
                    <div className={styles.checkmarkWrapper}>
                      <svg
                        className={styles.checkmarkIcon}
                        width="16"
                        height="16"
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
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.actionButtons}>
            <button
              className={styles.prevBtn}
              onClick={handlePreviousQuestion}
              disabled={currentIdx === 0}
            >
              PREVIOUS QUESTION
            </button>
            <button
              className={styles.confirmBtn}
              onClick={handleConfirmAnswer}
              disabled={selections[currentIdx] === null}
            >
              {currentIdx === QUESTIONS.length - 1 ? 'SUBMIT TEST' : 'CONFIRM ANSWER'}
            </button>
          </div>
        </section>

        {/* Right Column: Sidebar */}
        <aside className={styles.sidebar}>

          {/* Card 1: Placement Leveling Info */}
          <article className={styles.infoCard}>
            <div className={styles.infoCardHeader}>
              <span className={styles.infoIcon}>ⓘ</span>
              <h3 className={styles.infoCardTitle}>Placement Leveling</h3>
            </div>

            <p className={styles.infoCardDesc}>
              This pre-test uses <span className={styles.infoHighlight}>Random Forest Classifier</span> to determine your current technical proficiency.
            </p>

            <ul className={styles.infoBullets}>
              <li>
                <span className={styles.bulletDot} />
                <span className={styles.bulletText}>Correct answers increase the difficulty of subsequent nodes.</span>
              </li>
              <li>
                <span className={styles.bulletDot} />
                <span className={styles.bulletText}>Your final score will skip you past redundant entry-level modules.</span>
              </li>
            </ul>
          </article>

          {/* Card 2: Current Session Project Info */}
          <article className={styles.projectCard}>
            <div className={styles.projectImageWrapper}>
              <img
                src="/images/project-ewan.png"
                alt="Project EWAN neural circuit board"
                className={styles.projectImage}
              />
            </div>

            <div className={styles.projectBody}>
              <div className={styles.projectTag}>
                CURRENT SESSION
              </div>
              <h3 className={styles.projectTitle}>
                Project EWAN
              </h3>

              <div className={styles.projectMeta}>
                <span className={styles.metaLabel}>Active Modules</span>
                <span className={styles.metaVal}>3 / 12</span>
              </div>

              <div className={styles.projectBadges}>
                <span className={styles.badge}>JV</span>
                <span className={styles.badge}>PY</span>
                <span className={styles.badge}>C++</span>
                <span className={styles.badge}>+2</span>
              </div>
            </div>
          </article>

        </aside>
      </div>
    </main>
  );
}
