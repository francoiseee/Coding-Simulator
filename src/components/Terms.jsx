"use client";

import styles from "./Terms.module.css";

const TERMS_SECTIONS = [
  {
    id: "about",
    label: "About This Platform",
    accent: "cyan",
    items: [
      {
        heading: "Academic research context",
        body: "Codely is a research prototype built to study how adaptive, AI-assisted practice affects programming skill development. Your activity on this platform contributes to that research — it is not a hiring tool, and simulations such as the reflective HR-interview prompts are learning exercises, not real employment evaluations.",
      },
      {
        heading: "Who runs this study",
        body: "Codely is operated by its research team for educational and academic purposes only. No coding challenge, diagnostic score, or reflective answer you submit here is shared with employers or used to make decisions about you outside this platform.",
      },
    ],
  },
  {
    id: "participation",
    label: "Voluntary Participation",
    accent: "teal",
    items: [
      {
        heading: "Your participation is voluntary",
        body: "Creating an account and using Codely is entirely your choice. You may stop using the platform at any time, for any reason, without penalty or effect on your academic standing.",
      },
      {
        heading: "Skipping is always allowed",
        body: "Reflective questions and optional prompts can be skipped unless explicitly marked as required for a specific exercise. Skipping never blocks your access to problems, results, or your dashboard beyond that single step.",
      },
      {
        heading: "Withdrawing from the study",
        body: "You may withdraw at any time by contacting the research team through the Support section. On request, we will deactivate your account and delete your identifiable data from active systems, as described under Your Rights.",
      },
    ],
  },
  {
    id: "data-collected",
    label: "Data We Collect",
    accent: "purple",
    items: [
      {
        heading: "Account information",
        body: "Your email address and authentication credentials, used only to secure and identify your account.",
      },
      {
        heading: "Performance data",
        body: "Diagnostic answers, submitted code, test results, timing, and difficulty progression — used to understand how you engage with practice problems.",
      },
      {
        heading: "Reflective responses",
        body: "The short written answers you provide about your reasoning after a problem. These are read by an AI evaluator and, for research purposes, by the study team — never by an employer.",
      },
    ],
  },
  {
    id: "data-use",
    label: "How We Use Your Data",
    accent: "magenta",
    items: [
      {
        heading: "Personalizing your experience",
        body: "Your diagnostic and practice history are used to recommend problems and adjust difficulty to your current skill level.",
      },
      {
        heading: "Improving the platform and the research",
        body: "Aggregated, de-identified performance data helps us evaluate and improve the adaptive learning model and answer research questions about skill acquisition. Findings may be published in academic work, but never in a way that identifies you individually.",
      },
      {
        heading: "What we will never do",
        body: "We will not sell your data, share it with employers or third parties, or use it to make decisions outside of this learning platform.",
      },
    ],
  },
  {
    id: "privacy",
    label: "Privacy & Confidentiality",
    accent: "cyan",
    items: [
      {
        heading: "Restricted access",
        body: "Your data is accessible only to the Codely research team members directly responsible for maintaining the platform and analyzing study results.",
      },
      {
        heading: "De-identified reporting",
        body: "Any results shared in reports, papers, or presentations use aggregated or de-identified data — individual accounts are never named or identifiable in published findings.",
      },
      {
        heading: "Secure storage",
        body: "Data is stored using access-controlled infrastructure with encryption in transit. We retain data only as long as needed for the research and platform operation described here.",
      },
    ],
  },
  {
    id: "rights",
    label: "Your Rights",
    accent: "teal",
    items: [
      {
        heading: "Access and correction",
        body: "You may request a copy of the data associated with your account, or ask us to correct inaccurate account information, at any time.",
      },
      {
        heading: "Deletion on request",
        body: "You may request deletion of your identifiable data. Some de-identified, aggregated data already used in research analysis may be retained, as it can no longer be traced back to you.",
      },
      {
        heading: "Questions or concerns",
        body: "If you have questions about this research, how your data is handled, or wish to exercise any of the rights above, reach out through the Support section — the research team responds directly.",
      },
    ],
  },
];

function TermsSection({ section }) {
  return (
    <div
      className={`${styles.termsSection} ${styles[`accent-${section.accent}`]}`}
    >
      <h3 className={styles.termsSectionHeading}>{section.label}</h3>
      <div className={styles.termsItems}>
        {section.items.map((item) => (
          <div key={item.heading} className={styles.termsItem}>
            <h4 className={styles.termsItemHeading}>{item.heading}</h4>
            <p className={styles.termsItemBody}>{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Terms({ embedded = false }) {
  return (
    <section
      id={embedded ? undefined : "terms"}
      className={embedded ? styles.sectionEmbedded : styles.section}
    >
      <div
        className={
          embedded ? styles.sectionInnerEmbedded : styles.sectionInner
        }
      >
        {!embedded && (
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Legal</span>
            <h2 className={styles.sectionTitle}>Terms & Conditions</h2>
            <p className={styles.sectionSubtitle}>
              Codely is a research platform. Here&rsquo;s what that means for
              your participation, your data, and your rights.
            </p>
          </div>
        )}
        {embedded && (
          <>
            <h2 className={styles.headingEmbedded}>Terms & Conditions</h2>
            <p className={styles.introEmbedded}>
              Codely is a research platform. Here&rsquo;s what that means for
              your participation, your data, and your rights.
            </p>
          </>
        )}

        <div className={styles.termsGrid}>
          {TERMS_SECTIONS.map((section) => (
            <TermsSection key={section.id} section={section} />
          ))}
        </div>

        <div className={styles.consentCard}>
          <h3 className={styles.consentTitle}>Your continued use as consent</h3>
          <p className={styles.consentText}>
            By creating an account and using Codely, you acknowledge that you
            understand this is an academic research platform, that your
            participation is voluntary, and that you may withdraw at any time
            as described above. If you do not agree with these terms, please
            discontinue use of the platform.
          </p>
        </div>
      </div>
    </section>
  );
}
