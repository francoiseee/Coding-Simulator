'use client';

import styles from './Gallery.module.css';

export default function Gallery() {
  const challenges = [
    {
      id: 'ds',
      title: 'Python Data Structures',
      description: 'Implement custom HashMaps, Heaps, and balanced BSTs from scratch using Python classes.',
      time: '45 min',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      )
    },
    {
      id: 'mem',
      title: 'Python Memory Management',
      description: 'Profile garbage collection, reference counting, and optimize memory layout for large data objects.',
      time: '60 min',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
      )
    },
    {
      id: 'async',
      title: 'Asynchronous Python',
      description: 'Architect non-blocking I/O systems using asyncio, coroutines, and custom event loops.',
      time: '75 min',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      )
    },
    {
      id: 'api',
      title: 'FastAPI Internals',
      description: 'Deep dive into Dependency Injection, routing, middleware orchestration, and async request lifecycle.',
      time: '90 min',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    },
    {
      id: 'decor',
      title: 'Python Decorator Lab',
      description: 'Master metaprogramming techniques using function and class decorators, closures, and wrappers.',
      time: '30 min',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
          <line x1="19.07" y1="4.93" x2="14.83" y2="9.17" />
          <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
          <line x1="9.17" y1="14.83" x2="4.93" y2="19.07" />
        </svg>
      )
    },
    {
      id: 'comp',
      title: 'Python Bytecode Compiler',
      description: 'Analyze and manipulate compiled bytecode instructions to optimize script execution speeds.',
      time: '120 min',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      )
    }
  ];

  return (
    <div className={styles.galleryWrapper}>
      {/* Title Header */}
      <header className={styles.galleryHeader}>
        <h1 className={styles.title}>Python Gallery</h1>
        <p className={styles.subtitle}>
          Master core computer science concepts through specialized technical challenges in Python environments.
        </p>
      </header>

      {/* Featured Challenge Card */}
      <section className={styles.featuredCard}>
        <div className={styles.featuredContent}>
          <div className={styles.featuredTag}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.starIcon}>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            FEATURED CHALLENGE
          </div>
          <h2 className={styles.featuredTitle}>Python Multithreading Lab</h2>
          <p className={styles.featuredDesc}>
            Master threads, worker pools, coroutines, and the asyncio framework. Solve complex race conditions and concurrency challenges in a high-throughput Python data pipeline.
          </p>

          <div className={styles.featuredMeta}>
            <div className={styles.metaItem}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.metaIcon}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>60-90 min</span>
            </div>
            <div className={styles.metaItem}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.metaIcon}>
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span>Python 3.12</span>
            </div>
          </div>

          <button className={styles.featuredBtn}>
            Start Challenge
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.arrowIcon}>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>

        {/* Visual Wireframe Column */}
        <div className={styles.featuredVisual}>
          <svg viewBox="0 0 400 300" width="100%" height="100%" className={styles.visualSvg}>
            <defs>
              <linearGradient id="gridGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#7000ff" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#d000ff" stopOpacity="0.8" />
              </linearGradient>
              <filter id="svgGlow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g stroke="url(#gridGrad)" strokeWidth="1.5" filter="url(#svgGlow)" opacity="0.8">
              <path d="M 50 150 L 350 50 M 50 200 L 350 100 M 50 250 L 350 150" />
              <path d="M 50 150 L 350 250 M 50 100 L 350 200 M 50 50 L 350 150" />
              <line x1="120" y1="126" x2="120" y2="174" />
              <line x1="200" y1="100" x2="200" y2="200" />
              <line x1="280" y1="126" x2="280" y2="174" />
              <path d="M 120 150 L 200 100 L 280 150 L 200 200 Z" strokeWidth="2" />
            </g>
            <g fill="#00f0ff" filter="url(#svgGlow)">
              <circle cx="120" cy="150" r="4" />
              <circle cx="200" cy="100" r="5" fill="#00f0ff" />
              <circle cx="200" cy="200" r="5" fill="#d000ff" />
              <circle cx="280" cy="150" r="4" fill="#d000ff" />
            </g>
          </svg>
        </div>
      </section>

      {/* Challenge Cards Grid */}
      <section className={styles.gridSection}>
        {challenges.map((c) => (
          <article key={c.id} className={styles.challengeCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrapper}>{c.icon}</div>
              <span className={styles.cardTag}>PYTHON</span>
            </div>
            
            <h3 className={styles.cardTitle}>{c.title}</h3>
            <p className={styles.cardDesc}>{c.description}</p>

            <div className={styles.cardFooter}>
              <span className={styles.timeTag}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.cardClock}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {c.time}
              </span>
              <button className={styles.enterBtn}>
                ENTER <span className={styles.arrow}>&gt;</span>
              </button>
            </div>
          </article>
        ))}
      </section>

      {/* Bottom Stats Banner */}
      <footer className={styles.statsBanner}>
        <div className={styles.statColumn}>
          <span className={styles.statNumber}>1,204</span>
          <span className={styles.statLabel}>Active Sessions</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statColumn}>
          <span className={styles.statNumber}>89.4k</span>
          <span className={styles.statLabel}>Submissions Checked</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statColumn}>
          <span className={styles.statNumber}>4.92/5</span>
          <span className={styles.statLabel}>Skill Progression</span>
        </div>
      </footer>
    </div>
  );
}
