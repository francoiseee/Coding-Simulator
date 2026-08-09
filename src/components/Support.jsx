"use client";

import { useState } from "react";
import styles from "./Support.module.css";

const FAQS = [
  {
    q: "How do I get started?",
    a: "Sign up for an account, then take the diagnostic assessment. Once you finish, Codely generates a personalized weakness report and you can start working through your recommended practice problems.",
  },
  {
    q: "What is the diagnostic assessment?",
    a: "It's a set of 35 multiple-choice questions spanning 16 core programming topics — things like variables, conditionals, loops, functions, OOP, data structures, sorting, and recursion. Your results are used to generate an AI-powered report identifying the concepts you should focus on.",
  },
  {
    q: "How does the practice system work?",
    a: "Coding problems are assigned based on your diagnostic results, targeting the topics you're weakest in first. As you solve more problems, the system learns from your performance and adapts the difficulty — Easy, Medium, or Hard — to keep you challenged without being overwhelmed.",
  },
  {
    q: "What programming language do I use for coding problems?",
    a: "All coding problems on Codely are written and solved in Python.",
  },
  {
    q: "What should I do if my code runs but gives the wrong output?",
    a: "Check your logic against the visible test cases shown with the problem, and re-read the problem constraints carefully — a small edge case is usually the culprit. Try tracing through your code by hand with the sample input before resubmitting.",
  },
  {
    q: "What should I do if the code runner is unavailable?",
    a: "This is usually temporary. Wait a moment and try submitting again — your code and progress are preserved, so you won't lose any work.",
  },
  {
    q: "How do I retake the diagnostic?",
    a: "From your dashboard, use the \"Retake Diagnostic\" button to start a new assessment and refresh your weakness report.",
  },
  {
    q: "What is the reflective question after each problem?",
    a: "After you submit a solution, you'll be asked a short written question about your approach. It's a normal part of the workflow and helps Codely better personalize your learning path going forward.",
  },
];

export default function Support({ embedded = false }) {
  const [openIndex, setOpenIndex] = useState(0);

  const toggle = (i) => {
    setOpenIndex((prev) => (prev === i ? -1 : i));
  };

  return (
    <section
      id={embedded ? undefined : "support"}
      className={embedded ? styles.sectionEmbedded : styles.section}
    >
      <div className={embedded ? styles.containerEmbedded : styles.container}>
        {!embedded && <div className={styles.badge}>Help Center</div>}
        <h2 className={styles.heading}>Support</h2>
        <p className={styles.intro}>
          Answers to common questions about diagnostics, practice, and how
          Codely adapts to you.
        </p>

        <div className={styles.faqList}>
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={faq.q}
                className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}
              >
                <button
                  type="button"
                  className={styles.faqQuestion}
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                >
                  <span>{faq.q}</span>
                  <span className={styles.faqIcon} aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                <div className={styles.faqAnswerWrapper}>
                  <p className={styles.faqAnswer}>{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.contactCard}>
          <h3 className={styles.contactTitle}>Still having trouble?</h3>
          <p className={styles.contactText}>
            Reach out to your instructor or the Codely research team — we're
            happy to help.
          </p>
        </div>
      </div>
    </section>
  );
}
