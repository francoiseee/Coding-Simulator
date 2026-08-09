"use client";

import styles from "./Documentation.module.css";

const DOC_SECTIONS = [
  {
    id: "getting-started",
    label: "Getting Started",
    accent: "cyan",
    items: [
      {
        heading: "Creating your account",
        body: "Visit the Codely landing page and click Sign Up. Enter your email and a password, then confirm your registration. You will be redirected to the diagnostic assessment immediately after your first sign-up.",
      },
      {
        heading: "Logging in",
        body: "Return to the landing page and use the Log In form on the right side of the card. On success you will land on your personal dashboard.",
      },
      {
        heading: "Logging out",
        body: "Click your avatar in the top-right corner of the navigation bar and select Log Off from the dropdown menu.",
      },
    ],
  },
  {
    id: "diagnostic",
    label: "Diagnostic Assessment",
    accent: "teal",
    items: [
      {
        heading: "What is the diagnostic?",
        body: "The diagnostic is a 35-question multiple-choice assessment covering 16 programming topics — from variables and conditionals through data structures, sorting algorithms, and recursion. Your answers determine which concepts to prioritize in your practice path.",
      },
      {
        heading: "How to take the diagnostic",
        body: "After signing up, you are brought to the diagnostic automatically. Read each question carefully, select your answer, and use the Next and Previous buttons to navigate. A progress indicator at the top shows how many questions remain. Submit when you have answered all questions.",
      },
      {
        heading: "Understanding your results",
        body: "After submission, Codely calculates a per-topic score and generates an AI-written weakness report. The report explains which concepts need the most work and why, based on the specific questions you missed.",
      },
      {
        heading: "Retaking the diagnostic",
        body: "You can retake the diagnostic from the Retake Diagnostic button on your dashboard. Your previous results are preserved so you can compare progress over time.",
      },
    ],
  },
  {
    id: "practice",
    label: "Coding Practice",
    accent: "purple",
    items: [
      {
        heading: "How problem recommendations work",
        body: "Codely maps your diagnostic weak concepts to a curated bank of 144 coding problems across three difficulty levels — Easy, Medium, and Hard. Problems are recommended in order of priority based on your weakest areas.",
      },
      {
        heading: "The practice problem interface",
        body: "Each problem shows a description, example inputs and outputs, and a code editor pre-filled with a starter function signature. You can run your code against visible test cases at any time using the Run button before making a final submission.",
      },
      {
        heading: "Submitting your code",
        body: "When you are satisfied with your solution, click Submit. Codely runs your code against all test cases — including hidden ones — and records your score, number of attempts, and execution time. These are used to personalize future recommendations.",
      },
      {
        heading: "Reflective question",
        body: "Before your submission is finalized, Codely asks a short reflective question about your approach or thought process. Answer it honestly — your response is evaluated by the AI and factors into how the platform adapts difficulty over time. You may skip it, but answering provides better personalization.",
      },
      {
        heading: "Difficulty adaptation",
        body: "Codely uses a machine-learning model trained on your performance data to assign problem difficulty. As you complete more sessions, the model refines its understanding of your skill level and adjusts recommendations accordingly.",
      },
    ],
  },
  {
    id: "topics",
    label: "Topics Covered",
    accent: "magenta",
    items: [
      {
        heading: "Easy tier",
        body: "Variables & Math Operations, Conditionals & Boolean Logic, Loops & Iteration, Functions & Scope, String & List Processing.",
      },
      {
        heading: "Medium tier",
        body: "Classes & Constructors, Inheritance, Polymorphism, OOP System Design, Dictionary & Hash Map Operations, 2D Arrays & Matrix Processing.",
      },
      {
        heading: "Hard tier",
        body: "Linear Data Structures (Stacks & Queues), Linked Lists, Binary Trees & BST, Sorting Algorithms, Recursion & Divide-and-Conquer.",
      },
      {
        heading: "Programming language",
        body: "All coding problems use Python 3. The code editor provides a starter function signature for each problem. You do not need to write import statements or a main block — only implement the function body.",
      },
    ],
  },
];

function DocSection({ section }) {
  return (
    <div className={`${styles.docSection} ${styles[`accent-${section.accent}`]}`}>
      <h3 className={styles.docSectionHeading}>{section.label}</h3>
      <div className={styles.docItems}>
        {section.items.map((item) => (
          <div key={item.heading} className={styles.docItem}>
            <h4 className={styles.docItemHeading}>{item.heading}</h4>
            <p className={styles.docItemBody}>{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Documentation({ embedded = false }) {
  return (
    <section
      id={embedded ? undefined : "documentation"}
      className={embedded ? styles.sectionEmbedded : styles.section}
    >
      <div className={embedded ? styles.sectionInnerEmbedded : styles.sectionInner}>
        {!embedded && (
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Docs</span>
            <h2 className={styles.sectionTitle}>Documentation</h2>
            <p className={styles.sectionSubtitle}>
              Everything you need to navigate Codely — from signing up to
              submitting your first coding solution.
            </p>
          </div>
        )}
        {embedded && <h2 className={styles.headingEmbedded}>Documentation</h2>}

        <div className={styles.docGrid}>
          {DOC_SECTIONS.map((section) => (
            <DocSection key={section.id} section={section} />
          ))}
        </div>
      </div>
    </section>
  );
}
