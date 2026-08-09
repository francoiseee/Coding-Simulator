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
            <span className={styles.infoIcon}>📋</span>
            <div>
              <p className={styles.infoTitle}>First, a short diagnostic</p>
              <p className={styles.infoDesc}>
                35 multiple-choice questions covering core Python and CS
                concepts. Takes about 10–15 minutes.
              </p>
            </div>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoIcon}>🎯</span>
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
            <span className={styles.infoIcon}>✅</span>
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
