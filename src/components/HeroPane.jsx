import styles from './HeroPane.module.css';

export default function HeroPane() {
  return (
    <section className={styles.heroPane}>
      {/* Background and Overlay */}
      <div className={styles.background} />
      <div className={styles.overlay} />
      
      {/* Content */}
      <div className={styles.content}>
        <h1 className={styles.title}>
          Initialize <span className={styles.gradientText}>Core Identity</span>
        </h1>
        <p className={styles.subtitle}>
          Access the next generation of academic simulation and collaborative node architecture.
        </p>
        
        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.statCardNodes}`}>
            <div className={`${styles.statLabel} ${styles.statLabelNodes}`}>Coding Challenge</div>
            <div className={styles.statValue}>144</div>
          </div>

          <div className={`${styles.statCard} ${styles.statCardUptime}`}>
            <div className={`${styles.statLabel} ${styles.statLabelUptime}`}>Diagnostic</div>
            <div className={styles.statValue}>35</div>
          </div>
        </div>
      </div>
    </section>
  );
}
