// src/app/api/diagnostic/questions/route.js
// Step 15 — Serve diagnostic questions to the browser WITHOUT the answer key.
//
// GET /api/diagnostic/questions
// Returns the published diagnostic's questions with only the columns a student
// is allowed to see. The answer key (correct_config) and explanation are never
// selected here, and are additionally revoked at the database level for the
// `authenticated` role — so this is defense-in-depth, not the only safeguard.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ASSESSMENT_SLUG = 'codely-beginner-diagnostic';

// Explicit allow-list. NEVER add correct_config or explanation here.
const SAFE_COLUMNS = 'id, question_type, prompt, code_snippet, language, options, difficulty';

export async function GET() {
  const supabase = await createClient();

  // Require an authenticated user (matches the rest of the diagnostic flow).
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'You must be signed in to load the diagnostic.' },
      { status: 401 }
    );
  }

  // Resolve the published assessment id.
  const { data: assessment, error: assessmentError } = await supabase
    .from('assessments')
    .select('id')
    .eq('slug', ASSESSMENT_SLUG)
    .eq('status', 'published')
    .single();

  if (assessmentError || !assessment) {
    return NextResponse.json(
      { error: 'No published diagnostic assessment is available.' },
      { status: 404 }
    );
  }

  // Fetch only safe columns for published questions, in a stable order.
  const { data: questions, error: questionsError } = await supabase
    .from('diagnostic_questions')
    .select(SAFE_COLUMNS)
    .eq('assessment_id', assessment.id)
    .eq('status', 'published')
    .order('id', { ascending: true });

  if (questionsError) {
    return NextResponse.json(
      { error: 'Could not load diagnostic questions.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    assessmentId: assessment.id,
    count: questions.length,
    questions,
  });
}
