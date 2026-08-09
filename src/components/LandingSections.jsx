"use client";

import { useState } from "react";
import styles from "./LandingSections.module.css";
import Documentation from "./Documentation";

// ─── FAQ data ──────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "What should I do if my code runs but produces wrong output?",
    a: "Check your logic against the visible test cases shown below the editor. Pay attention to edge cases such as empty inputs, negative numbers, or boundary values. Re-read the problem constraints carefully — many errors come from off-by-one mistakes or missed conditions.",
  },
  {
    q: "What happens if the code runner is unavailable?",
    a: "The grading service may be temporarily unreachable. Wait a moment and try submitting again — your session and code are preserved. If the problem persists for more than a few minutes, contact your instructor or the research team.",
  },
  {
    q: "Can I attempt a problem more than once?",
    a: "Yes. You can revise your code and resubmit within the same session. Each submission attempt is recorded, and the number of attempts is one of the signals the system uses to assess problem difficulty for you.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Each student account can only access its own diagnostic results, submissions, and practice history. No student can view another student's data. All data is stored securely and is used only for academic research purposes.",
  },
  {
    q: "What does the AI report contain?",
    a: "The AI-generated report explains which programming concepts you struggled with and why, based on the specific questions you missed in the diagnostic. It does not just list wrong answers — it identifies the underlying concept gaps and describes what to focus on in practice.",
  },
  {
    q: "Do I have to complete all recommended problems?",
    a: "No. Work through as many problems as you can. The more sessions you complete, the more accurately the system can personalize your difficulty assignments. Even partial progress is recorded and counted.",
  },
  {
    q: "Who do I contact if I find a bug or have feedback?",
    a: "Reach out to your instructor or directly to the Codely research team. This platform is part of an ongoing thesis study, and your feedback genuinely helps improve the system.",
  },
];

// ─── Components ────────────────────────────────────────────────────────────

function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.faqItem} ${open ? styles.faqItemOpen : ""}`}>
      <button
        className={styles.faqQuestion}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{item.q}</span>
        <svg
          className={`${styles.faqChevron} ${open ? styles.faqChevronOpen : ""}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <p className={styles.faqAnswer}>{item.a}</p>}
    </div>
  );
}

// ─── Exported sections ─────────────────────────────────────────────────────

export default function LandingSections() {
  return (
    <>
      {/* ── Documentation ─────────────────────────────────────── */}
      <Documentation />

      {/* ── Support ───────────────────────────────────────────── */}
      <section id="support" className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={`${styles.sectionTag} ${styles.sectionTagSupport}`}>
              Support
            </span>
            <h2 className={styles.sectionTitle}>Help & Support</h2>
            <p className={styles.sectionSubtitle}>
              Answers to common questions. If you can't find what you need,
              reach out to your instructor or the research team.
            </p>
          </div>

          <div className={styles.faqList}>
            {FAQS.map((item) => (
              <FaqItem key={item.q} item={item} />
            ))}
          </div>

          <div className={styles.contactCard}>
            <div className={styles.contactIcon}>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <p className={styles.contactHeading}>Still need help?</p>
              <p className={styles.contactBody}>
                Contact your instructor or the Codely research team directly.
                This platform is part of an active thesis study at Holy Angel
                University — your feedback matters.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
