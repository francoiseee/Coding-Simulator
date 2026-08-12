"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./Welcome.module.css";

export default function Welcome({ onReady }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const handleStart = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name or nickname to continue.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ display_name: trimmed })
          .eq("id", user.id);
      }
      onReady();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.badge}>Welcome to Codely</div>

        <h1 className={styles.title}>Let&apos;s get you started</h1>
        <p className={styles.subtitle}>
          Codely is an adaptive coding practice platform designed to help you
          prepare for technical interviews — at your own pace, at the right
          difficulty.
        </p>

        <div className={styles.divider} />

        <div className={styles.infoBlock}>
          <div className={styles.infoItem}>
            <span className={styles.infoIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1z" />
                <line x1="8" y1="11" x2="16" y2="11" />
                <line x1="8" y1="15" x2="16" y2="15" />
              </svg>
            </span>
            <div>
              <p className={styles.infoTitle}>First, a short diagnostic</p>
              <p className={styles.infoDesc}>
                35 multiple-choice questions covering core Python and CS
                concepts. Takes about 10–15 minutes.
              </p>
            </div>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <div>
              <p className={styles.infoTitle}>
                We personalize your learning path
              </p>
              <p className={styles.infoDesc}>
                Your answers help Codely understand where you are right now, so
                it can recommend the right problems — not too easy, not too
                hard.
              </p>
            </div>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <polyline points="8 12 11 15 16 9" />
              </svg>
            </span>
            <div>
              <p className={styles.infoTitle}>No pressure</p>
              <p className={styles.infoDesc}>
                This isn&apos;t graded. Answer honestly — the more accurate your
                responses, the better your personalized path will be.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.nameSection}>
          <label className={styles.nameLabel} htmlFor="display-name">
            What should we call you?
          </label>
          <input
            id="display-name"
            type="text"
            className={styles.nameInput}
            placeholder="Your name or nickname"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            maxLength={40}
            autoFocus
          />
          {error && <p className={styles.errorText}>{error}</p>}
        </div>

        <button
          type="button"
          className={styles.startBtn}
          onClick={handleStart}
          disabled={saving}
        >
          {saving ? "Just a moment…" : "Start Diagnostic →"}
        </button>

        <p className={styles.footer}>
          Your results stay private and are only used to personalize your Codely
          experience.
        </p>
      </div>
    </div>
  );
}
