// src/app/api/diagnostic/results/[attemptId]/route.js
// Step 20 — Serve diagnostic results (score + per-concept breakdown).
//
// GET /api/diagnostic/results/:attemptId
//
// Uses the normal cookie-based client (NOT the service-role admin client).
// RLS on diagnostic_attempts and attempt_concept_results already restricts
// SELECT to auth.uid() = user_id, so a student can only ever fetch their own
// results — no extra ownership check needed beyond what the database enforces.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request, { params }) {
  const { attemptId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  // RLS guarantees this only returns a row if it belongs to the caller.
  const { data: attempt, error: attemptError } = await supabase
    .from('diagnostic_attempts')
    .select('id, status, raw_score, score_percentage, started_at, completed_at')
    .eq('id', attemptId)
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json({ error: 'Results not found.' }, { status: 404 });
  }

  if (attempt.status !== 'completed') {
    return NextResponse.json(
      { error: 'This diagnostic has not been completed yet.' },
      { status: 409 }
    );
  }

  // Join concept results with concept names/slugs for display.
  const { data: conceptResults, error: conceptError } = await supabase
    .from('attempt_concept_results')
    .select(
      `
      concept_id,
      correct_count,
      incorrect_count,
      questions_relevant,
      score_percentage,
      classification,
      concepts ( slug, name, category )
    `
    )
    .eq('attempt_id', attemptId)
    .order('score_percentage', { ascending: true });

  if (conceptError) {
    return NextResponse.json({ error: 'Could not load concept results.' }, { status: 500 });
  }

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      rawScore: attempt.raw_score,
      scorePercentage: attempt.score_percentage,
      startedAt: attempt.started_at,
      completedAt: attempt.completed_at,
    },
    conceptResults: conceptResults.map((c) => ({
      conceptId: c.concept_id,
      slug: c.concepts?.slug,
      name: c.concepts?.name,
      category: c.concepts?.category,
      correct: c.correct_count,
      incorrect: c.incorrect_count,
      relevant: c.questions_relevant,
      scorePercentage: c.score_percentage,
      classification: c.classification,
    })),
  });
}
