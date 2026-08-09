'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Welcome from '@/components/Welcome';
import DiagnosticRunner from '@/components/diagnostic/DiagnosticRunner';

export default function DiagnosticPage() {
  const router = useRouter();
  const [phase, setPhase] = useState("welcome"); // "welcome" | "diagnostic"

  const handleComplete = (data) => {
    const attemptId = data?.attemptId;
    if (attemptId) {
      router.push(`/results/${attemptId}`);
    } else {
      router.push('/');
    }
  };

  if (phase === "welcome") {
    return <Welcome onReady={() => setPhase("diagnostic")} />;
  }

  return <DiagnosticRunner onComplete={handleComplete} />;
}
