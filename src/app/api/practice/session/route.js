// src/app/api/practice/session/route.js
// Phase 6, Step 29 — Create (or resume) a coding session when the student
// opens a problem.
//
// POST /api/practice/session
// Body: { problemId: number, language?: string }
//
// Runs on the cookie client — coding_sessions has own-row INSERT/SELECT/UPDATE
// policies, so the student can create and read their own sessions directly.
// Reuses an existing active session for the same problem so reopening the page
// or a double request doesn't spawn duplicates.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { problemId, language = 'python' } = body || {};
  if (!problemId) {
    return NextResponse.json({ error: 'problemId is required.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  // Resume an existing active session for this problem if one exists.
  const { data: existing } = await supabase
    .from('coding_sessions')
    .select('id, current_code, language, status')
    .eq('user_id', user.id)
    .eq('problem_id', problemId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // New sitting on an existing session: re-open the measurement window.
    // Non-fatal — a failed stamp costs one row of RF data, never the session.
    try {
      const admin = createAdminClient();
      const { error: stampError } = await admin
        .from('coding_sessions')
        .update({
          last_opened_at: new Date().toISOString(),
          first_run_at: null,
        })
        .eq('id', existing.id);
      if (stampError) {
        console.error('Session resume stamp failed:', stampError.message);
      }
    } catch (err) {
      console.error('Session resume stamp threw:', err.message);
    }

    return NextResponse.json({
      sessionId: existing.id,
      currentCode: existing.current_code,
      language: existing.language,
      resumed: true,
    });
  }

  const { data: created, error: insertError } = await supabase
    .from('coding_sessions')
    .insert({
      user_id: user.id,
      problem_id: problemId,
      language,
      status: 'active',
      last_opened_at: new Date().toISOString(),
    })
    .select('id, current_code, language')
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: 'Could not start a coding session. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    sessionId: created.id,
    currentCode: created.current_code,
    language: created.language,
    resumed: false,
  });
}
