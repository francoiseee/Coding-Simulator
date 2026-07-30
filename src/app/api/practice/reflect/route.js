// src/app/api/practice/reflect/route.js
// Phase 6, Step 32 — Create reflective coding question instances.
//
// GET /api/practice/reflect?sessionId=123
// GET /api/practice/reflect?sessionId=123&trigger=after_failed_test&passed=0&total=2
//
//   Returns the reflective question instance(s) to show the student for this
//   session and trigger point, creating them on first request. Idempotent
//   PER TRIGGER TYPE: calling again for the same trigger returns the
//   already-created instances instead of making new ones.
//
// Why this is a server route (not a direct client insert):
//   coding_question_instances has NO client INSERT policy — only SELECT-own.
//   Instances are the system's record of *what it decided to ask*, so they must
//   be minted server-side with the service-role client, the same protection
//   pattern used for graded submissions. The student can read their own
//   instances (via session ownership) but cannot fabricate them.
//
// ---------------------------------------------------------------------------
// Trigger points
// ---------------------------------------------------------------------------
// `before_submit` (default) — asked while the student still believes their
//   solution is correct. Selection: the required prompt, plus ONE optional
//   prompt whose concept matches a primary concept of the problem.
//
// `after_failed_test` — asked once the verdict comes back failing. This is the
//   pedagogically strongest moment to prompt reflection: the student has just
//   received concrete evidence that their mental model was wrong, rather than
//   being asked to introspect while still confident.
//
//   Selection differs deliberately. The seeded after_failed_test templates are
//   tagged to the Debugging concept, which is never a *problem's* primary
//   concept — so the concept-matching rule used for before_submit cannot apply
//   here. Instead this picks the first published template of that trigger type
//   not already asked in this session. A student who fails twice therefore gets
//   a different prompt the second time rather than the same one repeated.
//
// Non-fatal philosophy: if instance creation fails, the caller must still let
// the student proceed — reflective questions must never block grading, and an
// after-the-fact prompt must never obscure the verdict the student just earned.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// The student's own answer is returned alongside each instance so the UI can
// distinguish three states: unanswered, answered-and-scored, and skipped.
// Without this the client cannot tell that an answer already exists, renders an
// editable field regardless, and any resubmit is rejected by RLS
// (cqa_update_own requires ai_score IS NULL) — a dead end for the student.
//
// Returning ai_score / ai_feedback here is also what finally surfaces the Step
// 34 evaluation to the student. Until now it was written to the database and
// never shown.
const INSTANCE_COLUMNS = `
  id, template_id, rendered_text, category, concept_id,
  trigger_type, trigger_reason, is_required, asked_at,
  coding_question_answers (
    id, answer_text, is_skipped, answered_at, time_to_answer_seconds,
    ai_score, ai_feedback, concepts_demonstrated, concepts_misunderstood
  )
`;

// Flatten the nested answer (PostgREST returns an array or object depending on
// cardinality) into a predictable shape, and precompute the state the UI needs
// so display logic isn't duplicated client-side.
function shapeInstance(row) {
  const raw = row.coding_question_answers;
  const answer = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
  const isEvaluated = answer != null && answer.ai_score != null;

  const { coding_question_answers, ...instance } = row;

  return {
    ...instance,
    answer: answer
      ? {
          id: answer.id,
          answerText: answer.answer_text,
          isSkipped: answer.is_skipped,
          answeredAt: answer.answered_at,
          timeToAnswerSeconds: answer.time_to_answer_seconds,
          aiScore: answer.ai_score,
          aiFeedback: answer.ai_feedback,
          conceptsDemonstrated: answer.concepts_demonstrated,
          conceptsMisunderstood: answer.concepts_misunderstood,
        }
      : null,
    // True once Step 34 has scored it: the row is immutable to the student from
    // this point, so the UI must render it read-only rather than editable.
    isEvaluated,
    // The reflection gate is satisfied by an answer EXISTING, not by one being
    // submitted in the current render. Otherwise reopening a session after
    // answering locks the student out of submitting their code.
    isAnswered: answer != null,
  };
}

const SUPPORTED_TRIGGERS = ["before_submit", "after_failed_test"];

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
  const trigger = searchParams.get("trigger") || "before_submit";

  // Failure context, only meaningful for after_failed_test. Recorded on the
  // instance so the reflection can later be interpreted against the verdict
  // that prompted it.
  //
  // Parsed strictly on PRESENCE, not just finiteness: Number(null) is 0 and
  // passes Number.isFinite, which previously caused a refresh with no params
  // to record a fabricated "0_of_0_passed" verdict.
  const passedParam = searchParams.get("passed");
  const totalParam = searchParams.get("total");
  const hasVerdict =
    passedParam !== null &&
    totalParam !== null &&
    Number.isFinite(Number(passedParam)) &&
    Number.isFinite(Number(totalParam));

  if (!sessionId || Number.isNaN(sessionId)) {
    return NextResponse.json(
      { error: "A valid sessionId is required." },
      { status: 400 },
    );
  }

  if (!SUPPORTED_TRIGGERS.includes(trigger)) {
    return NextResponse.json(
      { error: `trigger must be one of: ${SUPPORTED_TRIGGERS.join(", ")}` },
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

  // Every instance already asked in this session, across all triggers. Needed
  // for two separate purposes below: trigger-scoped idempotency, and knowing
  // which templates have already been used.
  const { data: allExisting, error: existingError } = await admin
    .from("coding_question_instances")
    .select(INSTANCE_COLUMNS)
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

  const existingForTrigger = (allExisting || [])
    .filter((i) => i.trigger_type === trigger)
    .map(shapeInstance);
  const usedTemplateIds = new Set(
    (allExisting || []).map((i) => i.template_id).filter(Boolean),
  );

  // 2. Choose templates for this trigger.
  const { data: templates, error: templatesError } = await admin
    .from("coding_question_templates")
    .select(
      "id, category, concept_id, template_text, trigger_type, trigger_config, is_required",
    )
    .eq("status", "published")
    .eq("trigger_type", trigger);

  if (templatesError) {
    console.error("Reflect: template load failed:", templatesError.message);
    return NextResponse.json(
      { error: "Could not load reflective question templates." },
      { status: 500 },
    );
  }

  if (!templates || templates.length === 0) {
    // No templates seeded for this trigger — not an error for the student.
    return NextResponse.json({
      instances: existingForTrigger,
      created: false,
      trigger,
    });
  }

  const orderOf = (t) => Number(t.trigger_config?.order ?? 999);
  // after_failed_test templates carry no explicit order, so fall back to id for
  // a stable, reproducible sequence.
  const byOrderThenId = (a, b) => orderOf(a) - orderOf(b) || a.id - b.id;

  let chosen = [];
  let reasonFor = () => null;

  if (trigger === "before_submit") {
    // Idempotent: this trigger asks a fixed set once per session.
    if (existingForTrigger.length > 0) {
      return NextResponse.json({
        instances: existingForTrigger,
        created: false,
        trigger,
      });
    }

    const { data: primaryConcepts } = await admin
      .from("problem_concepts")
      .select("concept_id")
      .eq("problem_id", session.problem_id)
      .eq("is_primary", true);

    const primaryConceptIds = (primaryConcepts || []).map((r) => r.concept_id);

    const required = templates.filter((t) => t.is_required).sort(byOrderThenId);

    const conceptMatched = templates
      .filter(
        (t) =>
          !t.is_required &&
          t.concept_id != null &&
          primaryConceptIds.includes(t.concept_id),
      )
      .sort(byOrderThenId)
      .slice(0, 1);

    chosen = [...required, ...conceptMatched];
    reasonFor = (t) =>
      t.is_required ? "required_before_submit" : "concept_match:primary";
  } else {
    // A new prompt is minted ONLY when an actual verdict is supplied. Without
    // this guard the endpoint has side effects on every read: re-fetching to
    // display saved answers would silently create another instance, and record
    // a verdict that never happened. A caller wanting to display existing
    // reflections simply omits passed/total.
    if (!hasVerdict) {
      return NextResponse.json({
        instances: existingForTrigger,
        created: false,
        trigger,
        readOnly: true,
      });
    }

    // One NEW prompt per failing submission. Prefer a template not yet asked in
    // this session so repeated failures produce different questions instead of
    // the same one again.
    const unused = templates
      .filter((t) => !usedTemplateIds.has(t.id))
      .sort(byOrderThenId);

    if (unused.length === 0) {
      // Every prompt for this trigger has already been asked. Return what
      // exists rather than repeating — the student has reflected enough here.
      return NextResponse.json({
        instances: existingForTrigger,
        created: false,
        trigger,
        exhausted: true,
      });
    }

    chosen = unused.slice(0, 1);

    const passed = Number(passedParam);
    const total = Number(totalParam);
    reasonFor = () => `failed_test:${passed}_of_${total}_passed`;
  }

  if (chosen.length === 0) {
    return NextResponse.json({
      instances: existingForTrigger,
      created: false,
      trigger,
    });
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
    trigger_reason: reasonFor(t),
    code_snapshot: codeSnapshot,
    relevant_selection: null,
    is_required: t.is_required,
  }));

  // 4. Insert. The unique index (session_id, template_id) makes this safe
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

  const { data: reloaded, error: reloadError } = await admin
    .from("coding_question_instances")
    .select(INSTANCE_COLUMNS)
    .eq("session_id", session.id)
    .eq("trigger_type", trigger)
    .order("is_required", { ascending: false })
    .order("id", { ascending: true });

  if (reloadError) {
    console.error("Reflect: reload after insert failed:", reloadError.message);
    return NextResponse.json(
      { error: "Could not load reflective questions." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    instances: (reloaded || []).map(shapeInstance),
    created: true,
    trigger,
  });
}
