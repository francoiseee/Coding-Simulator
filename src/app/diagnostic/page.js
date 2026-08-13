"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Welcome from "@/components/Welcome";
import DiagnosticRunner from "@/components/diagnostic/DiagnosticRunner";
import styles from "./page.module.css";

export default function DiagnosticPage() {
  const router = useRouter();
  const [phase, setPhase] = useState("checking"); // "checking" | "welcome" | "diagnostic" | "error"
  const [initialName, setInitialName] = useState("");

  // On load, check the student's diagnostic status:
  // - Not signed in → inline error.
  // - Already completed → redirect to their results (no retakes).
  // - Saved nickname + in-progress attempt → skip onboarding, resume.
  // - Saved nickname, no in-progress attempt → show Welcome, prefill name.
  // - Otherwise → show Welcome.
  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const res = await fetch("/api/diagnostic/status");

        if (res.status === 401) {
          if (!cancelled) setPhase("error");
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.displayName) {
          setInitialName(data.displayName);
        }

        // Already finished the diagnostic — send them to their results and
        // never show onboarding again. Stays in "checking" so no Welcome flash.
        if (res.ok && data.hasCompletedAttempt && data.completedAttemptId) {
          router.replace(`/results/${data.completedAttemptId}`);
          return;
        }

        if (res.ok && data.displayName && data.hasInProgressAttempt) {
          setPhase("diagnostic");
        } else {
          setPhase("welcome");
        }
      } catch {
        if (!cancelled) setPhase("error");
      }
    }

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleComplete = (data) => {
    const attemptId = data?.attemptId;
    if (attemptId) {
      router.push(`/results/${attemptId}`);
    } else {
      router.push("/");
    }
  };

  if (phase === "checking") {
    return <p className={styles.stateWrapper}>Loading…</p>;
  }

  if (phase === "error") {
    return (
      <div className={styles.stateWrapper}>
        <p>You must be signed in to access the diagnostic.</p>
        <button
          type="button"
          className={styles.loginBtn}
          onClick={() => router.push("/")}
        >
          Go to login
        </button>
      </div>
    );
  }

  if (phase === "welcome") {
    return (
      <Welcome
        onReady={() => setPhase("diagnostic")}
        initialName={initialName}
      />
    );
  }

  return <DiagnosticRunner onComplete={handleComplete} />;
}
