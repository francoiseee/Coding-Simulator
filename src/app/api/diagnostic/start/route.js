// src/app/api/diagnostic/start/route.js
// POST /api/diagnostic/start
// Starts (or resumes) a diagnostic attempt for the logged-in user.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ASSESSMENT_SLUG = 'codely-beginner-diagnostic';

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: assessment, error: assessmentError } = await supabase
    .from('assessments')
    .select('id, version')
    .eq('slug', ASSESSMENT_SLUG)
    .eq('status', 'published')
    .single();

  if (assessmentError || !assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
  }

  // Check for an existing in-progress attempt first so refreshing/double-clicking
  // "Start" doesn't create duplicate rows (RLS would allow the insert, but we
  // don't want orphaned attempts).
  const { data: existingAttempt, error: existingAttemptError } = await supabase
    .from('diagnostic_attempts')
    .select('id')
    .eq('user_id', user.id)
    .eq('assessment_id', assessment.id)
    .eq('status', 'in_progress')
    .maybeSingle();

  if (existingAttemptError) {
    return NextResponse.json({ error: existingAttemptError.message }, { status: 500 });
  }

  if (existingAttempt) {
    return NextResponse.json({ attemptId: existingAttempt.id, resumed: true });
  }

  // RLS on diagnostic_attempts only allows INSERT when auth.uid() = user_id AND
  // status = 'in_progress', so user_id must come from the authenticated session
  // (never from client input) and status must be exactly 'in_progress'.
  const { data: newAttempt, error: insertError } = await supabase
    .from('diagnostic_attempts')
    .insert({
      user_id: user.id,
      assessment_id: assessment.id,
      assessment_version: assessment.version,
      status: 'in_progress',
    })
    .select('id')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ attemptId: newAttempt.id, resumed: false });
}
