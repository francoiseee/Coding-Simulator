// src/app/api/practice/reflect/route.js
// Phase 6, Step 32 — Create reflective coding question instances.
//
// GET /api/practice/reflect?sessionId=123
//   Returns the reflective question instance(s) to show the student for this
//   session, creating them on first request. Idempotent: calling again returns
//   the already-created instances instead of making new ones.
//
// Why this is a server route (not a direct client insert):
//   coding_question_instances has NO client INSERT policy — only SELECT-own.
//   Instances are the system's record of *what it decided to ask*, so they must
//   be minted server-side with the service-role client, the same protection
//   pattern used for graded submissions. The student can read their own
//   instances (via session ownership) but cannot fabricate them.
//
// Selection rule (deterministic MVP):
//   1. Load published templates with trigger_type = 'before_submit'.
//   2. Always include the required one (is_required = true).
//   3. Additionally include ONE template whose concept_id matches a primary
//      concept of the current problem, if such a template exists.
//   4. Render template_text -> rendered_text (copy for now; see renderTemplate
//      for the future {placeholder} interpolation hook).
//   5. Snapshot the session's current_code into code_snapshot.
//
// Non-fatal philosophy: if instance creation fails, the caller can still let the
// student submit — reflective questions must never block grading.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Render a template into the concrete text shown to the student.
// Today templates are plain prompts, so this is effectively a copy. The hook is
// here so a later step can interpolate values like {functionName} or {loopVar}
// without changing callers.
function renderTemplate(templateText, context = {}) {
  if (!templateText) return "";
  return templateText.replace(/\{(\w+)\}/g, (match, key) =>
    context[key] != null ? String(context[key]) : match,
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = Number(searchParams.get("sessionId"));

  if (!sessionId || Number.isNaN(sessionId)) {
    return NextResponse.json(
      { error: "A valid sessionId is required." },
      { status: 400 },
    );
  }

  // 1. Auth + ownership via cookie client.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("coding_sessions")
    .select("id, user_id, problem_id, current_code")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.user_id !== user.id) {
    return NextResponse.json(
      { error: "This session does not belong to you." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  // If instances already exist for this session, return them (idempotent).
  // Ordered required-first so the UI can present the mandatory prompt first.
  const { data: existing, error: existingError } = await admin
    .from("coding_question_instances")
    .select(
      "id, template_id, rendered_text, category, concept_id, trigger_type, trigger_reason, is_required, asked_at",
    )
    .eq("session_id", session.id)
    .order("is_required", { ascending: false })
    .order("id", { ascending: true });

  if (existingError) {
    console.error("Reflect: existing lookup failed:", existingError.message);
    return NextResponse.json(
      { error: "Could not load reflective questions." },
      { status: 500 },
    );
  }

  if (existing && existing.length > 0) {
    return NextResponse.json({ instances: existing, created: false });
  }

  // 2. Choose templates.
  // Primary concepts of this problem, used to pick one concept-matched prompt.
  const { data: primaryConcepts } = await admin
    .from("problem_concepts")
    .select("concept_id")
    .eq("problem_id", session.problem_id)
    .eq("is_primary", true);

  const primaryConceptIds = (primaryConcepts || []).map((r) => r.concept_id);

  const { data: templates, error: templatesError } = await admin
    .from("coding_question_templates")
    .select(
      "id, category, concept_id, template_text, trigger_type, trigger_config, is_required",
    )
    .eq("status", "published")
    .eq("trigger_type", "before_submit");

  if (templatesError) {
    console.error("Reflect: template load failed:", templatesError.message);
    return NextResponse.json(
      { error: "Could not load reflective question templates." },
      { status: 500 },
    );
  }

  if (!templates || templates.length === 0) {
    // No templates seeded — not an error for the student; just nothing to ask.
    return NextResponse.json({ instances: [], created: false });
  }

  const orderOf = (t) => Number(t.trigger_config?.order ?? 999);

  // The required prompt(s), always included.
  const required = templates
    .filter((t) => t.is_required)
    .sort((a, b) => orderOf(a) - orderOf(b));

  // One concept-matched optional prompt, if the problem's primary concept has a
  // matching template. Lowest trigger order wins for determinism.
  const conceptMatched = templates
    .filter(
      (t) =>
        !t.is_required &&
        t.concept_id != null &&
        primaryConceptIds.includes(t.concept_id),
    )
    .sort((a, b) => orderOf(a) - orderOf(b))
    .slice(0, 1);

  const chosen = [...required, ...conceptMatched];

  if (chosen.length === 0) {
    return NextResponse.json({ instances: [], created: false });
  }

  // 3. Build instance rows.
  const codeSnapshot = session.current_code || "";
  const rows = chosen.map((t) => ({
    session_id: session.id,
    template_id: t.id,
    rendered_text: renderTemplate(t.template_text, {}),
    category: t.category,
    concept_id: t.concept_id,
    trigger_type: t.trigger_type,
    trigger_reason: t.is_required
      ? "required_before_submit"
      : "concept_match:primary",
    code_snapshot: codeSnapshot,
    relevant_selection: null,
    is_required: t.is_required,
  }));

  // 4. Insert. The partial unique index (session_id, template_id) makes this safe
  // against a duplicate concurrent request; ignore-duplicates then re-read so
  // both racers converge on the same instance set.
  const { error: insertError } = await admin
    .from("coding_question_instances")
    .upsert(rows, {
      onConflict: "session_id,template_id",
      ignoreDuplicates: true,
    });

  if (insertError) {
    console.error("Reflect: instance insert failed:", insertError.message);
    return NextResponse.json(
      { error: "Could not create reflective questions." },
      { status: 500 },
    );
  }

  const { data: created, error: reloadError } = await admin
    .from("coding_question_instances")
    .select(
      "id, template_id, rendered_text, category, concept_id, trigger_type, trigger_reason, is_required, asked_at",
    )
    .eq("session_id", session.id)
    .order("is_required", { ascending: false })
    .order("id", { ascending: true });

  if (reloadError) {
    console.error("Reflect: reload after insert failed:", reloadError.message);
    return NextResponse.json(
      { error: "Could not load reflective questions." },
      { status: 500 },
    );
  }

  return NextResponse.json({ instances: created, created: true });
}
