"""
labeling.py — Outcome-based label generation for the Codely RF dataset.

THE RULE
--------
    Row i's label is the difficulty that should have been served at position
    i+1, judged by how the student actually performed at position i+1.

Each row's features describe performance on problem i. Its label answers:
"given that, what difficulty should have come next?" Ground truth comes from
observing what the student actually received at i+1 and how it went:

    performed WELL at i+1  -> that problem was too easy -> label = up(diff[i+1])
    STRUGGLED at i+1       -> that problem was too hard -> label = down(diff[i+1])
    neither                -> it was right              -> label = diff[i+1]

Steps clamp at the ends: nothing above "hard", nothing below "easy".

WHY LABELS ARE COMPUTED, NOT COLLECTED
--------------------------------------
At the moment a student finishes a problem, nobody knows what the correct next
difficulty was — that is a fact about the future. So labels cannot be recorded
live. They are derived afterward by walking each student's sequence in order.

WHY NOT USE THE RULE-BASED ENGINE'S OWN PICKS AS LABELS
-------------------------------------------------------
Because then the model only learns to copy an if-statement we wrote. Accuracy
would be high and meaningless. Ground truth must come from real student
outcomes, not from our own recommendation logic.

Reference: Codely_Decision_LabelingRule.md
"""

from __future__ import annotations

import pandas as pd

from .config import (
    DIFFICULTY_ORDER,
    MAX_GAP_DAYS,
    MIN_PROBLEMS_PER_STUDENT,
    STRUGGLE_ATTEMPTS_MIN,
    STRUGGLE_SCORE_MAX,
    WELL_ATTEMPTS_MAX,
    WELL_SCORE_MIN,
)

# Bidirectional maps between difficulty names and their ordinal positions.
DIFF_TO_ORD = {d: i for i, d in enumerate(DIFFICULTY_ORDER)}
ORD_TO_DIFF = {i: d for d, i in DIFF_TO_ORD.items()}
_MAX_ORD = len(DIFFICULTY_ORDER) - 1


def classify_outcome(score: float | None, attempts: int | None) -> str:
    """
    Classify a single problem outcome as WELL / STRUGGLED / APPROPRIATE.

    WELL      score >= 80  AND  attempts <= 2
    STRUGGLED score <  50  OR   attempts >= 5
    APPROPRIATE  everything else

    The AND/OR asymmetry is deliberate. WELL requires both because a high score
    reached after many attempts is not mastery — it is convergence by trial and
    error. STRUGGLED requires either because each signal alone is sufficient
    evidence of difficulty: a student who reaches 100% on the ninth attempt has
    demonstrated persistence, not readiness.

    WELL is evaluated first. A row satisfying neither is APPROPRIATE.
    """
    if score is None or attempts is None or pd.isna(score) or pd.isna(attempts):
        return "APPROPRIATE"

    if score >= WELL_SCORE_MIN and attempts <= WELL_ATTEMPTS_MAX:
        return "WELL"

    if score < STRUGGLE_SCORE_MAX or attempts >= STRUGGLE_ATTEMPTS_MIN:
        return "STRUGGLED"

    return "APPROPRIATE"


def step_difficulty(difficulty: str, direction: int) -> str:
    """
    Move one step up (+1) or down (-1) the difficulty scale, clamped at the ends.

    Clamping is a known source of distortion: a student performing well on hard
    problems is labelled hard repeatedly because nothing higher exists, and the
    same happens at the easy end. Both boundary classes end up slightly
    over-represented. This is why config.RF_PARAMS sets class_weight="balanced",
    and why the effect is stated as a limitation in the paper.
    """
    current = DIFF_TO_ORD[difficulty]
    stepped = max(0, min(_MAX_ORD, current + direction))
    return ORD_TO_DIFF[stepped]


def label_from_next(next_difficulty: str, next_score, next_attempts) -> str:
    """Derive one row's label from the outcome of the problem that followed it."""
    outcome = classify_outcome(next_score, next_attempts)

    if outcome == "WELL":
        return step_difficulty(next_difficulty, +1)
    if outcome == "STRUGGLED":
        return step_difficulty(next_difficulty, -1)
    return next_difficulty


def generate_labels(df: pd.DataFrame, verbose: bool = True) -> pd.DataFrame:
    """
    Label a dataframe of problem attempts.

    Expects one row per problem attempt with at least:
        student_id, problem_id, difficulty, correctness_rate, attempts,
        attempted_at

    Returns only labelled rows, with `label`, `prev_difficulty`, and
    `prev_difficulty_ord` added.

    Sequence position is by TIME, not by session — a student's learning
    trajectory continues across sessions, so multiple sessions are concatenated
    chronologically.

    Rows are dropped when:
      - the row is last in a student's sequence (nothing to label from)
      - the student completed fewer than MIN_PROBLEMS_PER_STUDENT problems
      - the gap to the next problem exceeds MAX_GAP_DAYS
    """
    if df.empty:
        return df.assign(label=pd.Series(dtype="object"))

    df = df.copy()
    df["attempted_at"] = pd.to_datetime(df["attempted_at"], utc=True)
    df = df.sort_values(["student_id", "attempted_at"]).reset_index(drop=True)

    stats = {
        "input_rows": len(df),
        "input_students": df["student_id"].nunique(),
        "dropped_short_sequence": 0,
        "dropped_last_in_sequence": 0,
        "dropped_gap_too_large": 0,
    }

    # Drop students with too few problems to produce any usable row.
    counts = df.groupby("student_id").size()
    too_short = counts[counts < MIN_PROBLEMS_PER_STUDENT].index
    if len(too_short) > 0:
        stats["dropped_short_sequence"] = int(counts[too_short].sum())
        df = df[~df["student_id"].isin(too_short)].reset_index(drop=True)

    if df.empty:
        _report(stats, 0, verbose)
        return df.assign(label=pd.Series(dtype="object"))

    # Look ahead one row within each student.
    g = df.groupby("student_id")
    df["next_difficulty"] = g["difficulty"].shift(-1)
    df["next_score"] = g["correctness_rate"].shift(-1)
    df["next_attempts"] = g["attempts"].shift(-1)
    df["next_at"] = g["attempted_at"].shift(-1)

    # Previous difficulty is feature 5. NaN on a student's first problem.
    df["prev_difficulty"] = g["difficulty"].shift(1)

    # Drop rows with no successor.
    no_next = df["next_difficulty"].isna()
    stats["dropped_last_in_sequence"] = int(no_next.sum())
    df = df[~no_next].copy()

    # Drop rows where the successor came too late to be evidence.
    gap_days = (df["next_at"] - df["attempted_at"]).dt.total_seconds() / 86400.0
    too_far = gap_days > MAX_GAP_DAYS
    stats["dropped_gap_too_large"] = int(too_far.sum())
    df = df[~too_far].copy()

    if df.empty:
        _report(stats, 0, verbose)
        return df.assign(label=pd.Series(dtype="object"))

    df["label"] = df.apply(
        lambda r: label_from_next(
            r["next_difficulty"], r["next_score"], r["next_attempts"]
        ),
        axis=1,
    )

    # Feature 5 as an ordinal. A student's first problem has no predecessor;
    # -1 is used as an explicit "no prior context" sentinel rather than an
    # imputed value, so the tree can split on it directly.
    df["prev_difficulty_ord"] = (
        df["prev_difficulty"].map(DIFF_TO_ORD).fillna(-1).astype(int)
    )

    df = df.drop(columns=["next_difficulty", "next_score", "next_attempts", "next_at"])

    _report(stats, len(df), verbose)
    return df.reset_index(drop=True)


def _report(stats: dict, output_rows: int, verbose: bool) -> None:
    if not verbose:
        return
    print("\n--- Labelling ---")
    print(f"  input rows                : {stats['input_rows']}")
    print(f"  input students            : {stats['input_students']}")
    print(f"  dropped (short sequence)  : {stats['dropped_short_sequence']}")
    print(f"  dropped (last in sequence): {stats['dropped_last_in_sequence']}")
    print(f"  dropped (gap > {MAX_GAP_DAYS}d)      : {stats['dropped_gap_too_large']}")
    print(f"  labelled rows out         : {output_rows}")
