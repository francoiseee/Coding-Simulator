"""
export.py — Pull raw problem attempts from Supabase and shape them into rows.

ONE ROW = ONE PROBLEM ATTEMPT
-----------------------------
Not one row per submission. A student who submits nine times on one problem
contributes ONE row, with attempts=9 as a feature. Per-submission rows would
let one stubborn student dominate the model, and would not match the prediction
task — we are choosing what problem to serve next, so a row should be a problem.

Reference: Codely_RF_Dataset_And_Training_Guide.md section 6.
"""

from __future__ import annotations

import os
import sys

import pandas as pd

from .complexity import complexity_column
from .config import DATA_CUTOFF_ISO, DIFFICULTY_ORDER, EXCLUDED_USER_IDS

try:
    from supabase import create_client
except ImportError:
    print("ERROR: pip install supabase pandas scikit-learn joblib")
    sys.exit(1)


def _client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        print("  Service role is required — RLS would otherwise hide other")
        print("  students' rows and silently produce a single-student dataset.")
        sys.exit(1)
    return create_client(url, key)


def _fetch_all(client, table: str, columns: str, page: int = 1000) -> list[dict]:
    """Page through a table. PostgREST caps rows per request."""
    rows, offset = [], 0
    while True:
        res = (
            client.table(table)
            .select(columns)
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page:
            return rows
        offset += page


def fetch_raw(cohort: str, verbose: bool = True) -> pd.DataFrame:
    """
    Fetch submissions joined to problem difficulty, collapsed to one row per
    (student, problem) attempt.

    cohort is required, not optional, because profiles.cohort is now the
    authoritative source of pilot-group membership
    (Codely_UpdatedTrainingPlan_2Round.pdf) — inferring membership from
    activity patterns or an exclusion list alone previously caused a real
    participant (test@test.com) to be wrongly dropped from D1.
    EXCLUDED_USER_IDS is kept as a secondary safety net, not the primary
    mechanism.

    Collapsing rules, and why each is what it is:

      correctness_rate : MAX of score_percentage.
          The student's best result is what represents their capability on that
          problem. Mean would penalise exploration; last would penalise a
          student who found the answer then experimented further.

      attempts         : COUNT of submissions + SUM of coding_sessions.run_count.
          Feature 3. Definition changed per
          Codely_Decision_AttemptsFeatureDefinition_Aug2026.docx: attempts must
          now include ungraded Run Code calls, not just graded submissions.
          run_count is summed across every coding_sessions row for the
          (student, problem) pair, since a student can accumulate more than
          one session on the same problem over time.

      runtime_ms       : runtime of the BEST-SCORING submission.
          Must correspond to the same code as correctness_rate, or the two
          features describe different programs.

      source_code      : source of the BEST-SCORING submission.
          Same reason — feature 4 must be computed from the code that produced
          the reported score.

      attempted_at     : LAST submitted_at.
          Sequence position is when the student finished with the problem.
    """
    client = _client()

    if verbose:
        print(f"Fetching submissions after {DATA_CUTOFF_ISO} ...")

    subs = _fetch_all(
        client,
        "submissions",
        "id,user_id,problem_id,score_percentage,runtime_ms,source_code,submitted_at",
    )
    if not subs:
        print("ERROR: no submissions returned.")
        sys.exit(1)

    df = pd.DataFrame(subs)
    df["submitted_at"] = pd.to_datetime(df["submitted_at"], utc=True)

    # Apply the cutoff. Pre-cutoff rows have incomparable attempt counts,
    # because before /api/practice/run existed every test was a submission.
    before = len(df)
    df = df[df["submitted_at"] >= pd.Timestamp(DATA_CUTOFF_ISO)]
    if verbose:
        print(f"  {before} submissions -> {len(df)} after cutoff")

    # Exclude known non-participant accounts — see EXCLUDED_USER_IDS in
    # ml/config.py. The date cutoff above cannot catch these on its own, since
    # all of them were active well after DATA_CUTOFF_ISO. Filtering here, before
    # the coding_sessions merge later in this function, means the exclusion
    # propagates automatically — no separate filter needed on the sessions fetch.
    before_excl = len(df)
    df = df[~df["user_id"].isin(EXCLUDED_USER_IDS)]
    if verbose:
        print(f"  {before_excl} submissions -> {len(df)} after excluding "
              f"{len(EXCLUDED_USER_IDS)} known non-participant accounts")

    # Cohort filter — the authoritative mechanism for pilot-group membership.
    # See Codely_UpdatedTrainingPlan_2Round.pdf. This must run in addition to,
    # not instead of, the EXCLUDED_USER_IDS filter above — that list is a
    # defensive safety net for accounts that should never carry ANY cohort
    # value at all (dev/test, groupmates), while this filter selects which
    # cohort's real participants belong in THIS specific export.
    profiles = _fetch_all(client, "profiles", "id,cohort")
    pdf_cohort = pd.DataFrame(profiles).rename(columns={"id": "user_id"})
    cohort_ids = set(pdf_cohort[pdf_cohort["cohort"] == cohort]["user_id"])

    before_cohort = len(df)
    df = df[df["user_id"].isin(cohort_ids)]
    if verbose:
        print(f"  {before_cohort} submissions -> {len(df)} after filtering to "
              f"cohort={cohort} ({len(cohort_ids)} participants tagged)")

    if df.empty:
        print("ERROR: no submissions after the cutoff. Nothing to train on.")
        sys.exit(1)

    problems = _fetch_all(client, "problems", "id,difficulty")
    pdf = pd.DataFrame(problems).rename(columns={"id": "problem_id"})
    df = df.merge(pdf, on="problem_id", how="left")

    missing = df["difficulty"].isna().sum()
    if missing:
        print(f"  WARNING: dropping {missing} rows with no problem difficulty")
        df = df[df["difficulty"].notna()]

    bad = ~df["difficulty"].isin(DIFFICULTY_ORDER)
    if bad.any():
        print(f"  WARNING: dropping {int(bad.sum())} rows with unknown difficulty")
        df = df[~bad]

    df["score_percentage"] = pd.to_numeric(df["score_percentage"], errors="coerce")

    # Index of the best-scoring submission per (student, problem).
    # idxmax needs a non-NaN column, so fill for ranking purposes only.
    ranked = df.assign(_score=df["score_percentage"].fillna(-1))
    best_idx = ranked.groupby(["user_id", "problem_id"])["_score"].idxmax()
    best = df.loc[best_idx, ["user_id", "problem_id", "runtime_ms", "source_code"]]

    agg = (
        df.groupby(["user_id", "problem_id"])
        .agg(
            correctness_rate=("score_percentage", "max"),
            attempts=("id", "count"),
            attempted_at=("submitted_at", "max"),
            difficulty=("difficulty", "first"),
        )
        .reset_index()
    )

    # Attempts, per Codely_Decision_AttemptsFeatureDefinition_Aug2026.docx:
    # graded submissions PLUS ungraded Run Code calls. run_count is summed
    # across every coding_sessions row for the (student, problem) pair —
    # a student can hold more than one session on the same problem over time.
    # Same cutoff as submissions above, so both halves of `attempts` are drawn
    # from the same comparable time window.
    sessions = _fetch_all(
        client, "coding_sessions", "user_id,problem_id,run_count,started_at"
    )
    sdf = pd.DataFrame(sessions, columns=["user_id", "problem_id", "run_count", "started_at"])
    sdf["started_at"] = pd.to_datetime(sdf["started_at"], utc=True)
    sdf = sdf[sdf["started_at"] >= pd.Timestamp(DATA_CUTOFF_ISO)]
    sdf["run_count"] = pd.to_numeric(sdf["run_count"], errors="coerce").fillna(0)
    run_counts = (
        sdf.groupby(["user_id", "problem_id"])["run_count"].sum().reset_index()
    )

    # Preserve the submission-only count under its own name BEFORE folding in
    # run_count. The RF feature `attempts` (submissions + run_count) and the
    # labeling rule's struggle/mastery thresholds measure conceptually different
    # things and must not share one column — see
    # Codely_ExpertReview_M1Results_Aug2026.docx Section 7.
    agg["submission_count"] = agg["attempts"]

    agg = agg.merge(run_counts, on=["user_id", "problem_id"], how="left")
    agg["attempts"] = agg["attempts"] + agg["run_count"].fillna(0)
    agg = agg.drop(columns=["run_count"])

    out = agg.merge(best, on=["user_id", "problem_id"], how="left")
    out = out.rename(columns={"user_id": "student_id"})

    # Feature 4. Currently returns a sentinel — see complexity.py.
    out["complexity_score"] = complexity_column(out["source_code"])

    if verbose:
        print(f"  collapsed to {len(out)} problem attempts "
              f"across {out['student_id'].nunique()} students")

    return out
