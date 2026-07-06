'use client';

import { useRouter } from 'next/navigation';
import DiagnosticRunner from '@/components/diagnostic/DiagnosticRunner';

export default function DiagnosticPage() {
  const router = useRouter();

  const handleComplete = ({ attemptId, answers }) => {
    // Step 16 will replace this with a POST to /api/diagnostic/answers.
    console.log('Diagnostic complete:', { attemptId, answers });
    // "/" re-checks the session on mount and lands on the dashboard view.
    router.push('/');
  };

  return <DiagnosticRunner onComplete={handleComplete} />;
}
