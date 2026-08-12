"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Welcome from "@/components/Welcome";
import DiagnosticRunner from "@/components/diagnostic/DiagnosticRunner";
import styles from "./page.module.css";

export default function DiagnosticPage() {
  const router = useRouter();
  const [phase, setPhase] = useState("checking"); // "checking" | "welcome" | "diagnostic"
  const [initialName, setInitialName] = useState("");

  // On load, check whether this student already has a saved nickname and an
  // in-progress attempt — if so, skip straight to the diagnostic instead of
  // making them sit through onboarding again. If they have a saved nickname
  // but no in-progress attempt yet, still show Welcome but prefill the name.
  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const res = await fetch("/api/diagnostic/status");
        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.displayName) {
          setInitialName(data.displayName);
        }

        if (res.ok && data.displayName && data.hasInProgressAttempt) {
          setPhase("diagnostic");
        } else {
          setPhase("welcome");
        }
      } catch {
        if (!cancelled) setPhase("welcome");
      }
    }

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, []);

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
