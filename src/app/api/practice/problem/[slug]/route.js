// src/app/api/practice/problem/[slug]/route.js
// Phase 6 — Fetch a problem for the coding page.
//
// GET /api/practice/problem/:slug
//
// Returns the published problem, its Python starter code, and ONLY the
// public_sample test cases. RLS already enforces all three restrictions
// (problems: published only; test_cases: public_sample only; official_solution
// is column-revoked from `authenticated`), so this is safe on the cookie client.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request, { params }) {
  const { slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  // Problem (RLS returns it only if published). official_solution is not
  // selected here and is column-revoked anyway — double protection.
  const { data: problem, error: problemError } = await supabase
    .from('problems')
    .select('id, slug, title, statement, difficulty, examples, constraints, hints, estimated_minutes')
    .eq('slug', slug)
    .single();

  if (problemError || !problem) {
    return NextResponse.json({ error: 'Problem not found.' }, { status: 404 });
  }

  // Python starter code for this problem.
  const { data: lang } = await supabase
    .from('problem_languages')
    .select('language, starter_code, function_signature')
    .eq('problem_id', problem.id)
    .eq('language', 'python')
    .maybeSingle();

  // Public sample test cases only (RLS hides hidden/edge/performance).
  const { data: sampleTests } = await supabase
    .from('test_cases')
    .select('input, expected_output, display_order')
    .eq('problem_id', problem.id)
    .order('display_order', { ascending: true });

  // Count-only query via the admin client so the student sees how many
  // hidden tests exist without RLS having to expose their content — a
  // head request never returns rows, only the count.
  const admin = createAdminClient();
  const { count: hiddenTestCount } = await admin
    .from('test_cases')
    .select('id', { count: 'exact', head: true })
    .eq('problem_id', problem.id)
    .neq('visibility', 'public_sample');

  return NextResponse.json({
    problem: {
      id: problem.id,
      slug: problem.slug,
      title: problem.title,
      statement: problem.statement,
      difficulty: problem.difficulty,
      examples: problem.examples,
      constraints: problem.constraints,
      hints: problem.hints,
      estimatedMinutes: problem.estimated_minutes,
    },
    starterCode: lang?.starter_code ?? '',
    functionSignature: lang?.function_signature ?? null,
    sampleTests: sampleTests ?? [],
    hiddenTestCount: hiddenTestCount ?? 0,
  });
}
