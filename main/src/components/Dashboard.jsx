'use client';

import { useState } from 'react';
import styles from './Dashboard.module.css';

export default function Dashboard({ email }) {
  const [activeTab, setActiveTab] = useState('simulations');

  // Extract username from email or default to 'Nikko'
  const getUserName = () => {
    if (!email) return 'Nikko';
    const parts = email.split('@');
    if (parts[0]) {
      // Capitalize first letter
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    return 'Nikko';
  };

  return (
    <main className={styles.dashboardContainer}>
      <div className={styles.dashboardGrid}>
        
        {/* Left Column: Sidebar Navigation */}
        <aside className={styles.sidebar}>
          
          {/* Active Session Box */}
          <div className={styles.activeSessionCard}>
            <div className={styles.pythonIconWrapper}>
              {/* Python Logo SVG */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.91 2C6.54 2 6.64 4.32 6.64 4.32H9.08C9.08 4.32 9.08 3.12 11.91 3.12C14.74 3.12 14.78 4.19 14.78 4.19C14.78 4.19 14.82 5.39 12.02 5.39C9.22 5.39 6.84 5.39 6.84 5.39C6.84 5.39 2 5.16 2 10.3C2 15.43 5.48 15.22 5.48 15.22H6.9V13.88C6.9 13.88 6.74 10.66 10.02 10.66C13.3 10.66 14.78 10.66 14.78 10.66C14.78 10.66 19.38 10.74 19.38 5.6C19.38 0.46 14.78 2 14.78 2H11.91Z" fill="#306998" />
                <path d="M12.09 22C17.46 22 17.36 19.68 17.36 19.68H14.92C14.92 19.68 14.92 20.88 12.09 20.88C9.26 20.88 9.22 19.81 9.22 19.81C9.22 19.81 9.18 18.61 11.98 18.61C14.78 18.61 17.16 18.61 17.16 18.61C17.16 18.61 22 18.84 22 13.7C22 8.57 18.52 8.78 18.52 8.78H17.1V10.12C17.1 10.12 17.26 13.34 13.98 13.34C10.7 13.34 9.22 13.34 9.22 13.34C9.22 13.34 4.62 13.26 4.62 18.4C4.62 23.54 9.22 22 9.22 22H12.09Z" fill="#FFE873" />
                <circle cx="9.22" cy="4.5" r="0.75" fill="#FFE873" />
                <circle cx="14.78" cy="19.5" r="0.75" fill="#306998" />
              </svg>
            </div>
            <div className={styles.activeSessionMeta}>
              <h4 className={styles.activeSessionTitle}>Python Project</h4>
              <span className={styles.activeSessionStatus}>ACTIVE SESSION</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className={styles.sidebarNav}>
            <button
              onClick={() => setActiveTab('simulations')}
              className={`${styles.navBtn} ${activeTab === 'simulations' ? styles.navBtnActive : ''}`}
            >
              <svg className={styles.navIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="4" />
                <path d="M7 10l3 2-3 2" />
                <path d="M12 14h5" />
              </svg>
              <span>Simulations</span>
            </button>
            
            <button
              onClick={() => setActiveTab('gallery')}
              className={`${styles.navBtn} ${activeTab === 'gallery' ? styles.navBtnActive : ''}`}
            >
              <svg className={styles.navIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>Gallery</span>
            </button>
            
            <button
              onClick={() => setActiveTab('progress')}
              className={`${styles.navBtn} ${activeTab === 'progress' ? styles.navBtnActive : ''}`}
            >
              <svg className={styles.navIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>My Progress</span>
            </button>
          </nav>

          {/* Action Trigger */}
          <button className={styles.newSimulationBtn}>
            <span className={styles.btnIcon}>+</span> New Simulation
          </button>

          {/* Footer Utilities */}
          <div className={styles.sidebarFooter}>
            <a href="#help" className={styles.footerLink}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Help
            </a>
            <a href="#docs" className={styles.footerLink}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          
          {/* Welcome Card Banner */}
          <div className={styles.welcomeCard}>
            <div className={styles.welcomeInfo}>
              <h2 className={styles.welcomeTitle}>Welcome back, {getUserName()}</h2>
              <p className={styles.welcomeDesc}>
                Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,
              </p>
            </div>
            
            <div className={styles.adaptiveSessionBox}>
              <div className={styles.adaptiveSessionMeta}>
                <span className={styles.adaptiveLabel}>NEXT ADAPTIVE SESSION</span>
                <h5 className={styles.adaptiveTitle}>Spring Boot Internals</h5>
              </div>
              <div className={styles.adaptiveArrow}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </div>
          </div>

          {/* Middle Layout Grid: Chart + Active Simulations */}
          <div className={styles.middleRow}>
            
            {/* Widget 1: Skill Growth Chart */}
            <article className={styles.chartCard}>
              <div className={styles.cardHeader}>
                <div className={styles.chartTitleWrapper}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.chartIconTitle}>
                    <path d="M23 6l-9.5 9.5-5-5L1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                  <h3 className={styles.cardTitle}>Skill Growth Chart</h3>
                </div>
                
                <div className={styles.dropdownPill}>
                  Last 30 Days
                </div>
              </div>

              {/* Glowing SVG Chart */}
              <div className={styles.chartWrapper}>
                <svg className={styles.chartSvg} width="100%" height="200" viewBox="0 0 500 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid Lines */}
                  <line x1="0" y1="50" x2="500" y2="50" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
                  <line x1="0" y1="100" x2="500" y2="100" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
                  <line x1="0" y1="150" x2="500" y2="150" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
                  
                  {/* Area path */}
                  <path d="M0 160 Q 150 150, 250 110 T 500 70 L 500 200 L 0 200 Z" fill="url(#chartGradient)" />
                  
                  {/* Line path */}
                  <path d="M0 160 Q 150 150, 250 110 T 500 70" fill="none" stroke="var(--accent-cyan)" strokeWidth="3.5" strokeLinecap="round" />
                </svg>
                
                {/* Floating tooltip/annotation */}
                <div className={styles.chartTooltip}>
                  <span className={styles.tooltipLabel}>CURRENT PROFICIENCY</span>
                  <span className={styles.tooltipValue}>Level 42.8</span>
                </div>
              </div>
            </article>

            {/* Right stack: Active Sims + Milestone */}
            <div className={styles.rightStack}>
              
              {/* Active Simulations Widget */}
              <article className={styles.simsCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.simsTitleWrapper}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.simIconTitle}>
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <h3 className={styles.cardTitle}>Active Simulations</h3>
                  </div>
                </div>

                <div className={styles.simsList}>
                  {/* Sim Item 1 */}
                  <div className={styles.simItem}>
                    <div className={styles.simMeta}>
                      <span className={styles.simName}>JVM Memory Management</span>
                      <span className={`${styles.simPercent} ${styles.cyanTag}`}>84%</span>
                    </div>
                    <div className={styles.simProgressTrack}>
                      <div className={`${styles.simProgressFill} ${styles.cyanFill}`} style={{ width: '84%' }} />
                    </div>
                  </div>

                  {/* Sim Item 2 */}
                  <div className={styles.simItem}>
                    <div className={styles.simMeta}>
                      <span className={styles.simName}>Java Bytecode Editor</span>
                      <span className={`${styles.simPercent} ${styles.purpleTag}`}>32%</span>
                    </div>
                    <div className={styles.simProgressTrack}>
                      <div className={`${styles.simProgressFill} ${styles.purpleFill}`} style={{ width: '32%' }} />
                    </div>
                  </div>
                </div>

                <button className={styles.viewSimsBtn}>
                  View All Simulations
                </button>
              </article>

              {/* Milestone Widget */}
              <article className={styles.milestoneCard}>
                <span className={styles.milestoneLabel}>NEW MILESTONE</span>
                <h4 className={styles.milestoneTitle}>Master Algorithmicist</h4>
                <p className={styles.milestoneDesc}>
                  Achieved 99th percentile in Binary Logic tests.
                </p>
              </article>

            </div>
          </div>

          {/* Lower Layout Grid: Learning Path + Recent Activity */}
          <div className={styles.lowerRow}>
            
            {/* Widget 2: Learning Path Timeline */}
            <article className={styles.learningCard}>
              <h3 className={styles.cardTitle}>Learning Path</h3>
              
              <div className={styles.timeline}>
                {/* Node 1: Completed */}
                <div className={`${styles.timelineNode} ${styles.nodeCompleted}`}>
                  <div className={styles.nodeCircle}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div className={styles.nodeBody}>
                    <h4 className={styles.nodeTitle}>The Core Fundamentals</h4>
                    <span className={styles.nodeDesc}>Completed 12/12 modules</span>
                  </div>
                </div>

                {/* Node 2: Selected */}
                <div className={`${styles.timelineNode} ${styles.nodeSelected}`}>
                  <div className={styles.nodeCircle}>
                    <div className={styles.innerDot} />
                  </div>
                  <div className={styles.nodeBody}>
                    <h4 className={styles.nodeTitle}>Object-Oriented Programming (OOP)</h4>
                    <span className={styles.nodeDesc}>Next: CAP Theorem Simulation</span>
                  </div>
                </div>

                {/* Node 3: Locked */}
                <div className={`${styles.timelineNode} ${styles.nodeLocked}`}>
                  <div className={styles.nodeCircle}>
                    {/* Lock icon */}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div className={styles.nodeBody}>
                    <h4 className={styles.nodeTitle}>The Python Ecosystem</h4>
                    <span className={styles.nodeDesc}>Locked (Requires Level 45)</span>
                  </div>
                </div>
              </div>
            </article>

            {/* Widget 3: Recent Activity Table */}
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
                    {/* Row 1 */}
                    <tr>
                      <td className={styles.tableName}>Python Data Structures</td>
                      <td className={styles.tableDate}>Oct 24, 2023</td>
                      <td>
                        <div className={styles.perfWrapper}>
                          <div className={`${styles.perfTrack} ${styles.perfGreenFill}`} style={{ width: '95%' }} />
                          <span className={styles.perfVal}>95%</span>
                        </div>
                      </td>
                      <td className={styles.tableIconCell}>
                        <svg className={styles.tableGreenIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      </td>
                    </tr>

                    {/* Row 2 */}
                    <tr>
                      <td className={styles.tableName}>JVM Memory Management</td>
                      <td className={styles.tableDate}>Oct 22, 2023</td>
                      <td>
                        <div className={styles.perfWrapper}>
                          <div className={`${styles.perfTrack} ${styles.perfYellowFill}`} style={{ width: '72%' }} />
                          <span className={styles.perfVal}>72%</span>
                        </div>
                      </td>
                      <td className={styles.tableIconCell}>
                        <svg className={styles.tableYellowIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </td>
                    </tr>

                    {/* Row 3 */}
                    <tr>
                      <td className={styles.tableName}>Java Bytecode Editor</td>
                      <td className={styles.tableDate}>Oct 21, 2023</td>
                      <td>
                        <div className={styles.perfWrapper}>
                          <div className={`${styles.perfTrack} ${styles.perfGreenFill}`} style={{ width: '88%' }} />
                          <span className={styles.perfVal}>88%</span>
                        </div>
                      </td>
                      <td className={styles.tableIconCell}>
                        <svg className={styles.tableCyanIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Circular play button */}
              <button className={styles.floatingPlayBtn} title="Launch Simulation Workspace">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </button>
            </article>

          </div>

        </section>

      </div>
    </main>
  );
}
