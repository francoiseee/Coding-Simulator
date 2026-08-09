'use client';

import { useRouter } from 'next/navigation';
import DiagnosticRunner from '@/components/diagnostic/DiagnosticRunner';

export default function DiagnosticPage() {
  const router = useRouter();

  const handleComplete = (data) => {
    const attemptId = data?.attemptId;
    if (attemptId) {
      router.push(`/results/${attemptId}`);
    } else {
      // Fallback if attemptId is missing — go to dashboard
      router.push('/');
    }
  };

  return <DiagnosticRunner onComplete={handleComplete} />;
}
