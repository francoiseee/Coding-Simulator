


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- Use a display_name from signup metadata if provided, else fall back to
    -- the local part of the email. Never fails on missing metadata.
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;  -- idempotent: never double-insert
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_reports" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" bigint NOT NULL,
    "report_type" "text" NOT NULL,
    "generated_text" "text" NOT NULL,
    "structured_output" "jsonb",
    "model_provider" "text",
    "model_name" "text",
    "prompt_version" "text",
    "status" "text" DEFAULT 'generated'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['weakness_report'::"text", 'code_feedback'::"text"]))),
    CONSTRAINT "ai_reports_source_type_check" CHECK (("source_type" = ANY (ARRAY['diagnostic_attempt'::"text", 'submission'::"text"]))),
    CONSTRAINT "ai_reports_status_check" CHECK (("status" = ANY (ARRAY['generated'::"text", 'validated'::"text", 'flagged'::"text"])))
);


ALTER TABLE "public"."ai_reports" OWNER TO "postgres";


ALTER TABLE "public"."ai_reports" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ai_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."assessments" (
    "id" integer NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "target_level" "text",
    "time_limit_seconds" integer,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "randomize_questions" boolean DEFAULT false NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assessments_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "assessments_time_limit_seconds_check" CHECK (("time_limit_seconds" > 0))
);


ALTER TABLE "public"."assessments" OWNER TO "postgres";


ALTER TABLE "public"."assessments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."assessments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."attempt_concept_results" (
    "id" bigint NOT NULL,
    "attempt_id" bigint NOT NULL,
    "concept_id" integer NOT NULL,
    "questions_relevant" integer DEFAULT 0 NOT NULL,
    "correct_count" integer DEFAULT 0 NOT NULL,
    "incorrect_count" integer DEFAULT 0 NOT NULL,
    "weighted_score" numeric(6,2),
    "score_percentage" numeric(5,2),
    "classification" "text" DEFAULT 'insufficient_evidence'::"text" NOT NULL,
    "confidence" numeric(4,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attempt_concept_results_classification_check" CHECK (("classification" = ANY (ARRAY['strong'::"text", 'developing'::"text", 'needs_practice'::"text", 'weak'::"text", 'insufficient_evidence'::"text"]))),
    CONSTRAINT "attempt_concept_results_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "attempt_concept_results_score_percentage_check" CHECK ((("score_percentage" >= (0)::numeric) AND ("score_percentage" <= (100)::numeric)))
);


ALTER TABLE "public"."attempt_concept_results" OWNER TO "postgres";


ALTER TABLE "public"."attempt_concept_results" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."attempt_concept_results_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."coding_sessions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "problem_id" integer NOT NULL,
    "language" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "current_code" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_active_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "first_run_at" timestamp with time zone,
    "last_opened_at" timestamp with time zone,
    "run_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "coding_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'submitted'::"text", 'abandoned'::"text"])))
);


ALTER TABLE "public"."coding_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."coding_sessions"."first_run_at" IS 'Timestamp of the student''s first code execution in this session. Used with started_at to derive pre_attempt_latency for RF training. NULL until the first run. Written server-side (service role) only.';



COMMENT ON COLUMN "public"."coding_sessions"."last_opened_at" IS 'Timestamp of the most recent time the student opened this problem page, including resumes. Paired with first_run_at to derive pre_attempt_latency for RF training, replacing started_at which is wrong for resumed sessions. Written server-side (service role) only.';



COMMENT ON COLUMN "public"."coding_sessions"."run_count" IS 'Total Run Code presses this session (not idempotent — increments on every call, unlike first_run_at). Combined with submissions COUNT at export time to compute the attempts RF feature per Codely_Decision_AttemptsFeatureDefinition_Aug2026.';



CREATE TABLE IF NOT EXISTS "public"."problems" (
    "id" integer NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "statement" "text" NOT NULL,
    "difficulty" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "examples" "jsonb",
    "constraints" "text",
    "hints" "jsonb",
    "official_solution" "text",
    "estimated_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published_at" timestamp with time zone,
    "progression" "text",
    "topic_position" smallint,
    "bank_code" "text",
    "execution_mode" "text" DEFAULT 'return'::"text" NOT NULL,
    CONSTRAINT "problems_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['easy'::"text", 'medium'::"text", 'hard'::"text"]))),
    CONSTRAINT "problems_execution_mode_check" CHECK (("execution_mode" = ANY (ARRAY['return'::"text", 'stdout'::"text", 'methods'::"text", 'multi_function'::"text"]))),
    CONSTRAINT "problems_progression_check" CHECK (("progression" = ANY (ARRAY['introductory'::"text", 'standard'::"text", 'advanced'::"text"]))),
    CONSTRAINT "problems_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "problems_topic_position_check" CHECK ((("topic_position" >= 1) AND ("topic_position" <= 9)))
);


ALTER TABLE "public"."problems" OWNER TO "postgres";


COMMENT ON COLUMN "public"."problems"."progression" IS 'Sub-tier within a topic''s 9-question set: introductory (1-3), standard (4-6), advanced (7-9). Distinct from problems.difficulty, which encodes the overall tier (easy/medium/hard) the topic belongs to.';



COMMENT ON COLUMN "public"."problems"."topic_position" IS 'Position 1-9 of this problem within its topic''s ordered question set (matches the bank''s "[n/9]" position label).';



COMMENT ON COLUMN "public"."problems"."bank_code" IS 'Stable identifier from Main_Question_Bank_V11.md, e.g. "VM-01". Used to trace a problem back to its source bank entry and to key reflective-question seeding.';



COMMENT ON COLUMN "public"."problems"."execution_mode" IS 'How the Judge0 harness should grade this problem: return = call one function (from problem_languages.function_signature), compare its return value. stdout = call the function, ignore return, compare captured print() output as a string. methods = instantiate a class (problem_languages.class_name) and run a sequence of method calls, comparing the last call''s return value or a raised exception. multi_function = the problem defines several standalone functions; each test_cases.input names which one to call via {"function": "name", "args": [...]}, compared like return mode. See Codely_Harness_Extension_Spec.md.';



CREATE TABLE IF NOT EXISTS "public"."submissions" (
    "id" bigint NOT NULL,
    "session_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "problem_id" integer NOT NULL,
    "language" "text" NOT NULL,
    "source_code" "text" NOT NULL,
    "execution_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "score_percentage" numeric(5,2),
    "passed_test_count" integer,
    "total_test_count" integer,
    "runtime_ms" integer,
    "memory_kb" integer,
    "stdout" "text",
    "stderr" "text",
    "compile_output" "text",
    "judge_token" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "graded_at" timestamp with time zone,
    CONSTRAINT "submissions_execution_status_check" CHECK (("execution_status" = ANY (ARRAY['draft'::"text", 'queued'::"text", 'running'::"text", 'accepted'::"text", 'wrong_answer'::"text", 'compile_error'::"text", 'runtime_error'::"text", 'time_limit_exceeded'::"text", 'memory_limit_exceeded'::"text", 'internal_error'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "submissions_score_percentage_check" CHECK ((("score_percentage" >= (0)::numeric) AND ("score_percentage" <= (100)::numeric)))
);


ALTER TABLE "public"."submissions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."session_bounce_status" AS
 SELECT "cs"."id" AS "session_id",
    "cs"."user_id",
    "cs"."problem_id",
    "p"."difficulty",
    "cs"."started_at",
    "cs"."last_active_at",
    (EXISTS ( SELECT 1
           FROM "public"."submissions" "s"
          WHERE ("s"."session_id" = "cs"."id"))) AS "has_submission",
    ((NOT (EXISTS ( SELECT 1
           FROM "public"."submissions" "s"
          WHERE ("s"."session_id" = "cs"."id")))) AND ("cs"."last_active_at" < ("now"() - '00:15:00'::interval))) AS "bounced"
   FROM ("public"."coding_sessions" "cs"
     JOIN "public"."problems" "p" ON (("p"."id" = "cs"."problem_id")));


ALTER VIEW "public"."session_bounce_status" OWNER TO "postgres";


COMMENT ON VIEW "public"."session_bounce_status" IS 'Per-session bounce flag. bounced = true means the student opened this problem, never submitted a graded attempt, and has gone quiet for 15+ minutes. Threshold is a placeholder pending Group 1 timing data — see Codely_Decision_ExpertSignOff_Aug2026.docx.';



CREATE OR REPLACE VIEW "public"."bounce_rate_by_difficulty" AS
 SELECT "difficulty",
    "count"(*) AS "total_sessions",
    "count"(*) FILTER (WHERE "bounced") AS "bounced_sessions",
    "round"(((100.0 * ("count"(*) FILTER (WHERE "bounced"))::numeric) / (NULLIF("count"(*), 0))::numeric), 2) AS "bounce_rate_pct"
   FROM "public"."session_bounce_status"
  GROUP BY "difficulty"
  ORDER BY "difficulty";


ALTER VIEW "public"."bounce_rate_by_difficulty" OWNER TO "postgres";


COMMENT ON VIEW "public"."bounce_rate_by_difficulty" IS 'Bounce rate aggregated by problem difficulty — the metric the M0 sign-off condition asks to actively monitor during Group 1, since over-challenging (Easy-profile students pushed to Medium) is the specific risk it is meant to catch.';



CREATE TABLE IF NOT EXISTS "public"."coding_question_answers" (
    "id" bigint NOT NULL,
    "instance_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "answer_text" "text",
    "is_skipped" boolean DEFAULT false NOT NULL,
    "answered_at" timestamp with time zone,
    "time_to_answer_seconds" integer,
    "ai_score" numeric(5,2),
    "ai_feedback" "text",
    "concepts_demonstrated" "jsonb",
    "concepts_misunderstood" "jsonb",
    "eval_model" "text",
    "eval_prompt_version" "text",
    CONSTRAINT "coding_question_answers_ai_score_check" CHECK ((("ai_score" >= (0)::numeric) AND ("ai_score" <= (100)::numeric)))
);


ALTER TABLE "public"."coding_question_answers" OWNER TO "postgres";


ALTER TABLE "public"."coding_question_answers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."coding_question_answers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."coding_question_instances" (
    "id" bigint NOT NULL,
    "session_id" bigint NOT NULL,
    "template_id" integer,
    "rendered_text" "text" NOT NULL,
    "category" "text",
    "concept_id" integer,
    "trigger_type" "text",
    "trigger_reason" "text",
    "code_snapshot" "text",
    "relevant_selection" "text",
    "ai_model" "text",
    "is_required" boolean DEFAULT false NOT NULL,
    "asked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coding_question_instances" OWNER TO "postgres";


ALTER TABLE "public"."coding_question_instances" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."coding_question_instances_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."coding_question_templates" (
    "id" integer NOT NULL,
    "problem_id" integer,
    "category" "text",
    "concept_id" integer,
    "template_text" "text" NOT NULL,
    "trigger_type" "text" DEFAULT 'before_submit'::"text" NOT NULL,
    "trigger_config" "jsonb",
    "is_required" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    CONSTRAINT "coding_question_templates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "coding_question_templates_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['fixed_order'::"text", 'after_time'::"text", 'before_submit'::"text", 'after_code_change'::"text", 'after_failed_test'::"text", 'ai_detected'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."coding_question_templates" OWNER TO "postgres";


ALTER TABLE "public"."coding_question_templates" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."coding_question_templates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."coding_sessions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."coding_sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."concepts" (
    "id" integer NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "parent_id" integer,
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."concepts" OWNER TO "postgres";


ALTER TABLE "public"."concepts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."concepts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."diagnostic_answers" (
    "id" bigint NOT NULL,
    "attempt_id" bigint NOT NULL,
    "question_id" integer NOT NULL,
    "question_snapshot" "jsonb" NOT NULL,
    "selected_answer" "jsonb",
    "is_correct" boolean,
    "answered_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."diagnostic_answers" OWNER TO "postgres";


ALTER TABLE "public"."diagnostic_answers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."diagnostic_answers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."diagnostic_attempts" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assessment_id" integer NOT NULL,
    "assessment_version" integer NOT NULL,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "raw_score" integer,
    "score_percentage" numeric(5,2),
    "question_order" "jsonb",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "time_spent_seconds" integer,
    "draft_answers" "jsonb",
    "last_question_index" smallint DEFAULT 0,
    "last_saved_at" timestamp with time zone,
    CONSTRAINT "completed_needs_timestamp" CHECK ((("status" <> 'completed'::"text") OR ("completed_at" IS NOT NULL))),
    CONSTRAINT "diagnostic_attempts_score_percentage_check" CHECK ((("score_percentage" >= (0)::numeric) AND ("score_percentage" <= (100)::numeric))),
    CONSTRAINT "diagnostic_attempts_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text", 'abandoned'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."diagnostic_attempts" OWNER TO "postgres";


ALTER TABLE "public"."diagnostic_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."diagnostic_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."diagnostic_question_concepts" (
    "question_id" integer NOT NULL,
    "concept_id" integer NOT NULL,
    "weight" numeric(4,2) DEFAULT 1.0 NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."diagnostic_question_concepts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diagnostic_questions" (
    "id" integer NOT NULL,
    "assessment_id" integer NOT NULL,
    "question_type" "text" NOT NULL,
    "title" "text",
    "prompt" "text" NOT NULL,
    "code_snippet" "text",
    "language" "text",
    "options" "jsonb",
    "correct_config" "jsonb",
    "explanation" "text",
    "difficulty" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "diagnostic_questions_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['easy'::"text", 'medium'::"text", 'hard'::"text"]))),
    CONSTRAINT "diagnostic_questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['multiple_choice'::"text", 'multi_select'::"text", 'true_false'::"text", 'predict_output'::"text", 'find_bug'::"text", 'fill_blank'::"text", 'short_answer'::"text"]))),
    CONSTRAINT "diagnostic_questions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."diagnostic_questions" OWNER TO "postgres";


ALTER TABLE "public"."diagnostic_questions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."diagnostic_questions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."practice_recommendations" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "concept_id" integer NOT NULL,
    "problem_id" integer NOT NULL,
    "source" "text" NOT NULL,
    "reason" "text",
    "priority" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "batch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    CONSTRAINT "practice_recommendations_source_check" CHECK (("source" = ANY (ARRAY['diagnostic'::"text", 'mastery'::"text", 'manual'::"text"]))),
    CONSTRAINT "practice_recommendations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'started'::"text", 'completed'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."practice_recommendations" OWNER TO "postgres";


ALTER TABLE "public"."practice_recommendations" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."practice_recommendations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."problem_concepts" (
    "problem_id" integer NOT NULL,
    "concept_id" integer NOT NULL,
    "weight" numeric(4,2) DEFAULT 1.0 NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."problem_concepts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."problem_languages" (
    "id" integer NOT NULL,
    "problem_id" integer NOT NULL,
    "language" "text" NOT NULL,
    "starter_code" "text" DEFAULT ''::"text" NOT NULL,
    "function_signature" "text",
    "class_name" "text"
);


ALTER TABLE "public"."problem_languages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."problem_languages"."class_name" IS 'Populated only for execution_mode=methods problems: the class the harness should instantiate before running the test case''s call sequence (e.g. "StudentManager").';



ALTER TABLE "public"."problem_languages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."problem_languages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."problems" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."problems_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "school" "text",
    "program" "text",
    "year_level" smallint,
    "skill_level" "text",
    "preferred_language" "text" DEFAULT 'python'::"text" NOT NULL,
    "target_role" "text",
    "onboarding_status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cohort" "text",
    CONSTRAINT "profiles_cohort_check" CHECK (("cohort" = ANY (ARRAY['G1'::"text", 'G2'::"text", 'GF'::"text"]))),
    CONSTRAINT "profiles_onboarding_status_check" CHECK (("onboarding_status" = ANY (ARRAY['new'::"text", 'diagnostic_done'::"text", 'active'::"text"]))),
    CONSTRAINT "profiles_skill_level_check" CHECK (("skill_level" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"]))),
    CONSTRAINT "profiles_year_level_check" CHECK ((("year_level" >= 1) AND ("year_level" <= 6)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."cohort" IS 'Which pilot/study group this participant belongs to, per Codely_UpdatedTrainingPlan_2Round.pdf. NULL = not yet assigned (dev/test accounts, groupmates, or real participants pending cohort confirmation). Set manually — no automatic assignment mechanism exists yet.';



CREATE OR REPLACE VIEW "public"."published_diagnostic_questions" WITH ("security_invoker"='true') AS
 SELECT "id",
    "assessment_id",
    "question_type",
    "title",
    "prompt",
    "code_snippet",
    "language",
    "options",
    "difficulty",
    "status",
    "created_at"
   FROM "public"."diagnostic_questions"
  WHERE ("status" = 'published'::"text");


ALTER VIEW "public"."published_diagnostic_questions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."published_problems" WITH ("security_invoker"='true') AS
 SELECT "id",
    "slug",
    "title",
    "statement",
    "difficulty",
    "status",
    "examples",
    "constraints",
    "hints",
    "estimated_minutes",
    "created_at",
    "published_at"
   FROM "public"."problems"
  WHERE ("status" = 'published'::"text");


ALTER VIEW "public"."published_problems" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submission_test_results" (
    "id" bigint NOT NULL,
    "submission_id" bigint NOT NULL,
    "test_case_id" integer NOT NULL,
    "passed" boolean NOT NULL,
    "actual_output" "jsonb",
    "runtime_ms" integer,
    "memory_kb" integer,
    "judge_status" "text",
    "executed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."submission_test_results" OWNER TO "postgres";


ALTER TABLE "public"."submission_test_results" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."submission_test_results_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."submissions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."submissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."test_cases" (
    "id" integer NOT NULL,
    "problem_id" integer NOT NULL,
    "input" "jsonb" NOT NULL,
    "expected_output" "jsonb",
    "visibility" "text" DEFAULT 'hidden'::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "points" integer DEFAULT 1 NOT NULL,
    "timeout_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_cases_visibility_check" CHECK (("visibility" = ANY (ARRAY['public_sample'::"text", 'hidden'::"text", 'edge'::"text", 'performance'::"text"])))
);


ALTER TABLE "public"."test_cases" OWNER TO "postgres";


ALTER TABLE "public"."test_cases" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."test_cases_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_concept_mastery" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "concept_id" integer NOT NULL,
    "mastery_score" numeric(5,2),
    "confidence_score" numeric(4,2),
    "evidence_count" integer DEFAULT 0 NOT NULL,
    "last_assessed_at" timestamp with time zone,
    "last_practiced_at" timestamp with time zone,
    "algorithm_version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_concept_mastery_confidence_score_check" CHECK ((("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (1)::numeric))),
    CONSTRAINT "user_concept_mastery_mastery_score_check" CHECK ((("mastery_score" >= (0)::numeric) AND ("mastery_score" <= (100)::numeric)))
);


ALTER TABLE "public"."user_concept_mastery" OWNER TO "postgres";


ALTER TABLE "public"."user_concept_mastery" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_concept_mastery_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessments"
    ADD CONSTRAINT "assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessments"
    ADD CONSTRAINT "assessments_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."attempt_concept_results"
    ADD CONSTRAINT "attempt_concept_results_attempt_id_concept_id_key" UNIQUE ("attempt_id", "concept_id");



ALTER TABLE ONLY "public"."attempt_concept_results"
    ADD CONSTRAINT "attempt_concept_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coding_question_answers"
    ADD CONSTRAINT "coding_question_answers_instance_id_key" UNIQUE ("instance_id");



ALTER TABLE ONLY "public"."coding_question_answers"
    ADD CONSTRAINT "coding_question_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coding_question_instances"
    ADD CONSTRAINT "coding_question_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coding_question_templates"
    ADD CONSTRAINT "coding_question_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coding_sessions"
    ADD CONSTRAINT "coding_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."concepts"
    ADD CONSTRAINT "concepts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."concepts"
    ADD CONSTRAINT "concepts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."diagnostic_answers"
    ADD CONSTRAINT "diagnostic_answers_attempt_id_question_id_key" UNIQUE ("attempt_id", "question_id");



ALTER TABLE ONLY "public"."diagnostic_answers"
    ADD CONSTRAINT "diagnostic_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diagnostic_attempts"
    ADD CONSTRAINT "diagnostic_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diagnostic_question_concepts"
    ADD CONSTRAINT "diagnostic_question_concepts_pkey" PRIMARY KEY ("question_id", "concept_id");



ALTER TABLE ONLY "public"."diagnostic_questions"
    ADD CONSTRAINT "diagnostic_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."practice_recommendations"
    ADD CONSTRAINT "practice_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."problem_concepts"
    ADD CONSTRAINT "problem_concepts_pkey" PRIMARY KEY ("problem_id", "concept_id");



ALTER TABLE ONLY "public"."problem_languages"
    ADD CONSTRAINT "problem_languages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."problem_languages"
    ADD CONSTRAINT "problem_languages_problem_id_language_key" UNIQUE ("problem_id", "language");



ALTER TABLE ONLY "public"."problems"
    ADD CONSTRAINT "problems_bank_code_key" UNIQUE ("bank_code");



ALTER TABLE ONLY "public"."problems"
    ADD CONSTRAINT "problems_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."problems"
    ADD CONSTRAINT "problems_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submission_test_results"
    ADD CONSTRAINT "submission_test_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submission_test_results"
    ADD CONSTRAINT "submission_test_results_submission_id_test_case_id_key" UNIQUE ("submission_id", "test_case_id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_cases"
    ADD CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_concept_mastery"
    ADD CONSTRAINT "user_concept_mastery_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_concept_mastery"
    ADD CONSTRAINT "user_concept_mastery_user_id_concept_id_key" UNIQUE ("user_id", "concept_id");



CREATE INDEX "idx_attempts_user" ON "public"."diagnostic_attempts" USING "btree" ("user_id");



CREATE INDEX "idx_concepts_active" ON "public"."concepts" USING "btree" ("is_active") WHERE "is_active";



CREATE INDEX "idx_concepts_parent" ON "public"."concepts" USING "btree" ("parent_id");



CREATE INDEX "idx_cqi_session" ON "public"."coding_question_instances" USING "btree" ("session_id");



CREATE INDEX "idx_dq_assessment" ON "public"."diagnostic_questions" USING "btree" ("assessment_id");



CREATE INDEX "idx_dqc_concept" ON "public"."diagnostic_question_concepts" USING "btree" ("concept_id");



CREATE INDEX "idx_pc_concept" ON "public"."problem_concepts" USING "btree" ("concept_id");



CREATE INDEX "idx_recs_user" ON "public"."practice_recommendations" USING "btree" ("user_id", "status");



CREATE INDEX "idx_reports_user" ON "public"."ai_reports" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_sessions_user" ON "public"."coding_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_submissions_user" ON "public"."submissions" USING "btree" ("user_id");



CREATE INDEX "idx_tc_problem" ON "public"."test_cases" USING "btree" ("problem_id");



CREATE UNIQUE INDEX "uniq_one_active_session_per_user_problem" ON "public"."coding_sessions" USING "btree" ("user_id", "problem_id") WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "uniq_one_in_progress_attempt_per_user_assessment" ON "public"."diagnostic_attempts" USING "btree" ("user_id", "assessment_id") WHERE ("status" = 'in_progress'::"text");



CREATE UNIQUE INDEX "uniq_one_instance_per_session_template" ON "public"."coding_question_instances" USING "btree" ("session_id", "template_id");



CREATE OR REPLACE TRIGGER "trg_dq_updated" BEFORE UPDATE ON "public"."diagnostic_questions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_mastery_updated" BEFORE UPDATE ON "public"."user_concept_mastery" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_problems_updated" BEFORE UPDATE ON "public"."problems" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attempt_concept_results"
    ADD CONSTRAINT "attempt_concept_results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "public"."diagnostic_attempts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attempt_concept_results"
    ADD CONSTRAINT "attempt_concept_results_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id");



ALTER TABLE ONLY "public"."coding_question_answers"
    ADD CONSTRAINT "coding_question_answers_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."coding_question_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coding_question_answers"
    ADD CONSTRAINT "coding_question_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coding_question_instances"
    ADD CONSTRAINT "coding_question_instances_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coding_question_instances"
    ADD CONSTRAINT "coding_question_instances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."coding_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coding_question_instances"
    ADD CONSTRAINT "coding_question_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."coding_question_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coding_question_templates"
    ADD CONSTRAINT "coding_question_templates_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coding_question_templates"
    ADD CONSTRAINT "coding_question_templates_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coding_sessions"
    ADD CONSTRAINT "coding_sessions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id");



ALTER TABLE ONLY "public"."coding_sessions"
    ADD CONSTRAINT "coding_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."concepts"
    ADD CONSTRAINT "concepts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."concepts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."diagnostic_answers"
    ADD CONSTRAINT "diagnostic_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "public"."diagnostic_attempts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diagnostic_answers"
    ADD CONSTRAINT "diagnostic_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."diagnostic_questions"("id");



ALTER TABLE ONLY "public"."diagnostic_attempts"
    ADD CONSTRAINT "diagnostic_attempts_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id");



ALTER TABLE ONLY "public"."diagnostic_attempts"
    ADD CONSTRAINT "diagnostic_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diagnostic_question_concepts"
    ADD CONSTRAINT "diagnostic_question_concepts_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diagnostic_question_concepts"
    ADD CONSTRAINT "diagnostic_question_concepts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."diagnostic_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diagnostic_questions"
    ADD CONSTRAINT "diagnostic_questions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_recommendations"
    ADD CONSTRAINT "practice_recommendations_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id");



ALTER TABLE ONLY "public"."practice_recommendations"
    ADD CONSTRAINT "practice_recommendations_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id");



ALTER TABLE ONLY "public"."practice_recommendations"
    ADD CONSTRAINT "practice_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."problem_concepts"
    ADD CONSTRAINT "problem_concepts_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."problem_concepts"
    ADD CONSTRAINT "problem_concepts_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."problem_languages"
    ADD CONSTRAINT "problem_languages_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submission_test_results"
    ADD CONSTRAINT "submission_test_results_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submission_test_results"
    ADD CONSTRAINT "submission_test_results_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_cases"("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."coding_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_cases"
    ADD CONSTRAINT "test_cases_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_concept_mastery"
    ADD CONSTRAINT "user_concept_mastery_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id");



ALTER TABLE ONLY "public"."user_concept_mastery"
    ADD CONSTRAINT "user_concept_mastery_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "acr_select_own" ON "public"."attempt_concept_results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."diagnostic_attempts" "a"
  WHERE (("a"."id" = "attempt_concept_results"."attempt_id") AND ("a"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."ai_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "answers_insert_own" ON "public"."diagnostic_answers" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."diagnostic_attempts" "a"
  WHERE (("a"."id" = "diagnostic_answers"."attempt_id") AND ("a"."user_id" = "auth"."uid"())))) AND ("is_correct" IS NULL)));



CREATE POLICY "answers_select_own" ON "public"."diagnostic_answers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."diagnostic_attempts" "a"
  WHERE (("a"."id" = "diagnostic_answers"."attempt_id") AND ("a"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."assessments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessments_read_published" ON "public"."assessments" FOR SELECT USING (("status" = 'published'::"text"));



ALTER TABLE "public"."attempt_concept_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attempts_insert_own" ON "public"."diagnostic_attempts" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("status" = 'in_progress'::"text")));



CREATE POLICY "attempts_select_own" ON "public"."diagnostic_attempts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "attempts_update_own_draft" ON "public"."diagnostic_attempts" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND ("status" = 'in_progress'::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") AND ("status" = 'in_progress'::"text")));



ALTER TABLE "public"."coding_question_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coding_question_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coding_question_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coding_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."concepts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "concepts_read_active" ON "public"."concepts" FOR SELECT USING (("is_active" = true));



CREATE POLICY "cqa_insert_own" ON "public"."coding_question_answers" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("ai_score" IS NULL)));



CREATE POLICY "cqa_select_own" ON "public"."coding_question_answers" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "cqa_update_own" ON "public"."coding_question_answers" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND ("ai_score" IS NULL)));



CREATE POLICY "cqi_select_own" ON "public"."coding_question_instances" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."coding_sessions" "s"
  WHERE (("s"."id" = "coding_question_instances"."session_id") AND ("s"."user_id" = "auth"."uid"())))));



CREATE POLICY "cqt_read_published" ON "public"."coding_question_templates" FOR SELECT USING (("status" = 'published'::"text"));



ALTER TABLE "public"."diagnostic_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."diagnostic_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."diagnostic_question_concepts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."diagnostic_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dq_read_published" ON "public"."diagnostic_questions" FOR SELECT TO "authenticated" USING (("status" = 'published'::"text"));



CREATE POLICY "dqc_read_all" ON "public"."diagnostic_question_concepts" FOR SELECT USING (true);



CREATE POLICY "mastery_select_own" ON "public"."user_concept_mastery" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "pcpt_read_all" ON "public"."problem_concepts" FOR SELECT USING (true);



CREATE POLICY "pl_read_all" ON "public"."problem_languages" FOR SELECT USING (true);



ALTER TABLE "public"."practice_recommendations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."problem_concepts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."problem_languages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."problems" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "problems_read_published" ON "public"."problems" FOR SELECT TO "authenticated" USING (("status" = 'published'::"text"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "recs_select_own" ON "public"."practice_recommendations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "recs_update_own" ON "public"."practice_recommendations" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "reports_select_own" ON "public"."ai_reports" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "sessions_insert_own" ON "public"."coding_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "sessions_select_own" ON "public"."coding_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "sessions_update_own" ON "public"."coding_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT ("first_run_at" IS DISTINCT FROM ( SELECT "s"."first_run_at"
   FROM "public"."coding_sessions" "s"
  WHERE ("s"."id" = "coding_sessions"."id")))) AND (NOT ("last_opened_at" IS DISTINCT FROM ( SELECT "s"."last_opened_at"
   FROM "public"."coding_sessions" "s"
  WHERE ("s"."id" = "coding_sessions"."id"))))));



CREATE POLICY "str_select_own" ON "public"."submission_test_results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "submission_test_results"."submission_id") AND ("s"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."submission_test_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submissions_insert_own" ON "public"."submissions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("execution_status" = 'draft'::"text") AND ("score_percentage" IS NULL)));



CREATE POLICY "submissions_select_own" ON "public"."submissions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "tc_public_samples" ON "public"."test_cases" FOR SELECT USING (("visibility" = 'public_sample'::"text"));



ALTER TABLE "public"."test_cases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_concept_mastery" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."ai_reports" TO "anon";
GRANT ALL ON TABLE "public"."ai_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ai_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ai_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ai_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."assessments" TO "anon";
GRANT ALL ON TABLE "public"."assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."assessments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."assessments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."assessments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."assessments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."attempt_concept_results" TO "anon";
GRANT ALL ON TABLE "public"."attempt_concept_results" TO "authenticated";
GRANT ALL ON TABLE "public"."attempt_concept_results" TO "service_role";



GRANT ALL ON SEQUENCE "public"."attempt_concept_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attempt_concept_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attempt_concept_results_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."coding_sessions" TO "anon";
GRANT ALL ON TABLE "public"."coding_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."coding_sessions" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."problems" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."problems" TO "authenticated";
GRANT ALL ON TABLE "public"."problems" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("slug") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("title") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("statement") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("difficulty") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("examples") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("constraints") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("hints") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("estimated_minutes") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("published_at") ON TABLE "public"."problems" TO "authenticated";



GRANT SELECT("progression") ON TABLE "public"."problems" TO "authenticated";



GRANT ALL ON TABLE "public"."submissions" TO "anon";
GRANT ALL ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";



GRANT ALL ON TABLE "public"."session_bounce_status" TO "anon";
GRANT ALL ON TABLE "public"."session_bounce_status" TO "authenticated";
GRANT ALL ON TABLE "public"."session_bounce_status" TO "service_role";



GRANT ALL ON TABLE "public"."bounce_rate_by_difficulty" TO "anon";
GRANT ALL ON TABLE "public"."bounce_rate_by_difficulty" TO "authenticated";
GRANT ALL ON TABLE "public"."bounce_rate_by_difficulty" TO "service_role";



GRANT ALL ON TABLE "public"."coding_question_answers" TO "anon";
GRANT ALL ON TABLE "public"."coding_question_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."coding_question_answers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."coding_question_answers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coding_question_answers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coding_question_answers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."coding_question_instances" TO "anon";
GRANT ALL ON TABLE "public"."coding_question_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."coding_question_instances" TO "service_role";



GRANT ALL ON SEQUENCE "public"."coding_question_instances_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coding_question_instances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coding_question_instances_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."coding_question_templates" TO "anon";
GRANT ALL ON TABLE "public"."coding_question_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."coding_question_templates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."coding_question_templates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coding_question_templates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coding_question_templates_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."coding_sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coding_sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coding_sessions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."concepts" TO "anon";
GRANT ALL ON TABLE "public"."concepts" TO "authenticated";
GRANT ALL ON TABLE "public"."concepts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."concepts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."concepts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."concepts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."diagnostic_answers" TO "anon";
GRANT ALL ON TABLE "public"."diagnostic_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."diagnostic_answers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."diagnostic_answers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."diagnostic_answers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."diagnostic_answers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."diagnostic_attempts" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."diagnostic_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."diagnostic_attempts" TO "service_role";



GRANT UPDATE("draft_answers") ON TABLE "public"."diagnostic_attempts" TO "authenticated";



GRANT UPDATE("last_question_index") ON TABLE "public"."diagnostic_attempts" TO "authenticated";



GRANT UPDATE("last_saved_at") ON TABLE "public"."diagnostic_attempts" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."diagnostic_attempts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."diagnostic_attempts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."diagnostic_attempts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."diagnostic_question_concepts" TO "anon";
GRANT ALL ON TABLE "public"."diagnostic_question_concepts" TO "authenticated";
GRANT ALL ON TABLE "public"."diagnostic_question_concepts" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."diagnostic_questions" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."diagnostic_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."diagnostic_questions" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("assessment_id") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("question_type") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("title") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("prompt") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("code_snippet") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("language") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("options") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("difficulty") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."diagnostic_questions" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."diagnostic_questions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."diagnostic_questions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."diagnostic_questions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."practice_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."practice_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_recommendations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."practice_recommendations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."practice_recommendations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."practice_recommendations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."problem_concepts" TO "anon";
GRANT ALL ON TABLE "public"."problem_concepts" TO "authenticated";
GRANT ALL ON TABLE "public"."problem_concepts" TO "service_role";



GRANT ALL ON TABLE "public"."problem_languages" TO "anon";
GRANT ALL ON TABLE "public"."problem_languages" TO "authenticated";
GRANT ALL ON TABLE "public"."problem_languages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."problem_languages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."problem_languages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."problem_languages_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."problems_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."problems_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."problems_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."published_diagnostic_questions" TO "anon";
GRANT ALL ON TABLE "public"."published_diagnostic_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."published_diagnostic_questions" TO "service_role";



GRANT ALL ON TABLE "public"."published_problems" TO "anon";
GRANT ALL ON TABLE "public"."published_problems" TO "authenticated";
GRANT ALL ON TABLE "public"."published_problems" TO "service_role";



GRANT ALL ON TABLE "public"."submission_test_results" TO "anon";
GRANT ALL ON TABLE "public"."submission_test_results" TO "authenticated";
GRANT ALL ON TABLE "public"."submission_test_results" TO "service_role";



GRANT ALL ON SEQUENCE "public"."submission_test_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."submission_test_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."submission_test_results_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."submissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."submissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."submissions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."test_cases" TO "anon";
GRANT ALL ON TABLE "public"."test_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."test_cases" TO "service_role";



GRANT ALL ON SEQUENCE "public"."test_cases_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."test_cases_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."test_cases_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_concept_mastery" TO "anon";
GRANT ALL ON TABLE "public"."user_concept_mastery" TO "authenticated";
GRANT ALL ON TABLE "public"."user_concept_mastery" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_concept_mastery_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_concept_mastery_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_concept_mastery_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































