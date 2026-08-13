"""
prepare_csedm.py — One-time preparation of the CSEDM dataset for Codely M0 training.

Usage:
    python prepare_csedm.py \\
        --main   path/to/MainTable.csv \\
        --code   path/to/CodeStates/CodeState.csv \\
        --outdir path/to/ml/data/

Outputs:
    csedm_train.csv   — 80% of students (by GroupShuffleSplit on SubjectID)
    csedm_test.csv    — 20% of students (held-out benchmark for M0 evaluation)
    csedm_full.csv    — combined, with train_test_split column

This script runs ONCE before the study begins. The two output CSVs are then
committed to the repo. train_model.py reads csedm_train.csv for M0 training
and csedm_test.csv for M0 evaluation.

D0 IS NEVER MIXED INTO D1/D2/D3. See Codely_Model_Training.pdf Section 6.1.

--- COLUMN MAPPING ---

CSEDM → Codely feature schema:

    SubjectID         → student_id          (grouping key, not a feature)
    ProblemID         → problem_id          (retained for traceability)
    [derived]         → difficulty          (see below — no label in CSEDM)
    [derived]         → correctness_rate    Feature 1
    [imputed]         → runtime_ms          Feature 2 (see RUNTIME NOTE)
    Submit count      → attempts            Feature 3
    AST parse         → complexity_score    Feature 4
    [derived]         → prev_difficulty_ord Feature 5 (via labeling.py)
    [derived]         → label               Target

--- DIFFICULTY DERIVATION ---

CSEDM problems have no difficulty label. We approximate difficulty from the
aggregate correctness rate of all students on each problem:

    bottom third by avg correctness  → hard
    middle third                     → medium
    top third                        → easy

This is a cold-start approximation. It is documented here and must be stated
plainly in the methodology chapter (Section 3 — Dataset Preparation).

Three CSEDM problems have no Correct values at all (treasureHunt,
mostAnagrams, findTheCircle). Submissions for those problems are dropped
before difficulty assignment.

--- RUNTIME NOTE ---

CSEDM does not record execution time. runtime_ms is imputed with the TRAINING
SET median after the split, to avoid test-set leakage. The imputed value is
the same for every row. This is a known limitation and must be stated in the
paper under Feature 2's limitations section:

    "For M0 (cold-start training), runtime_ms was not available in the
     external CSEDM dataset and was imputed with the training-set median.
     This feature carries no signal for M0; its contribution begins with M1,
     once real Codely submission data is available."

--- CORRECTNESS RATE ---

CSEDM's Correct column is per-submission (True/False), not a percentage. We
compute correctness_rate per student per problem as:

    correct_submissions / total_submissions

This is the closest available proxy for Codely's score_percentage (which is
the percentage of test cases passed on the BEST submission). It is not
identical — CSEDM correctness reflects unit-test pass/fail per attempt, not
partial credit across test cases — but it is the most meaningful available
mapping.

--- COMPLEXITY ---

Source code is parsed from CodeState.csv using Codely's existing
ml/complexity.py estimator (the same AST-based loop-nesting + recursion +
sort-detection method used for real student submissions). Only the LAST
submission per student per problem is used for complexity estimation, since
that best represents the student's final approach.

Rows where complexity cannot be estimated (syntax errors, non-Python code,
or the NOT_IMPLEMENTED_SENTINEL) are dropped before training, consistent
with train_model.py's own sentinel-dropping logic.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

# ---------------------------------------------------------------------------
# Allow running from the repo root: add the parent of ml/ to sys.path so
# `from ml.complexity import ...` works the same way train_model.py does.
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from ml.complexity import estimate_complexity, NOT_IMPLEMENTED_SENTINEL  # noqa: E402
from ml.config import (  # noqa: E402
    DIFFICULTY_ORDER,
    RANDOM_STATE,
    TEST_SIZE,
)
from ml.labeling import generate_labels, DIFF_TO_ORD  # noqa: E402

# Problems with no Correct values in CSEDM — excluded entirely.
PROBLEMS_WITHOUT_CORRECT = {"treasureHunt", "mostAnagrams", "findTheCircle"}


# ---------------------------------------------------------------------------
# Difficulty derivation helpers
# ---------------------------------------------------------------------------

def assign_difficulty_by_tertile(df: pd.DataFrame) -> dict[str, str]:
    """
    Assign easy / medium / hard to each problem based on aggregate correctness.

    Returns a dict: {problem_id: difficulty}.
    """
    avg = (
        df[df["EventType"] == "Submit"]
        .groupby("ProblemID")["Correct"]
        .mean()
        .reset_index()
        .rename(columns={"Correct": "avg_correct"})
    )
    avg = avg.sort_values("avg_correct").reset_index(drop=True)
    n = len(avg)
    third = n // 3

    difficulty_map = {}
    for i, row in avg.iterrows():
        if i < third:
            difficulty_map[row["ProblemID"]] = "hard"
        elif i < 2 * third:
            difficulty_map[row["ProblemID"]] = "medium"
        else:
            difficulty_map[row["ProblemID"]] = "easy"

    print("\n--- Difficulty assignment (tertile method) ---")
    for prob, diff in sorted(difficulty_map.items()):
        avg_c = avg.loc[avg["ProblemID"] == prob, "avg_correct"].values[0]
        print(f"  {prob:<30} avg_correct={avg_c:.2f}  → {diff}")

    return difficulty_map


# ---------------------------------------------------------------------------
# Complexity estimation
# ---------------------------------------------------------------------------

def estimate_complexity_for_last_submission(
    submits: pd.DataFrame, code_df: pd.DataFrame
) -> pd.DataFrame:
    """
    For each (SubjectID, ProblemID) pair, take the last submit's code and
    run the complexity estimator on it.

    Returns a DataFrame with columns: SubjectID, ProblemID, complexity_score.
    """
    code_map = dict(zip(code_df["CodeStateID"], code_df["Code"]))

    # Last submission per student per problem (by Order).
    last = (
        submits.sort_values("Order")
        .groupby(["SubjectID", "ProblemID"])
        .last()
        .reset_index()[["SubjectID", "ProblemID", "CodeStateID"]]
    )

    scores = []
    for _, row in last.iterrows():
        code = code_map.get(row["CodeStateID"], "")
        score = estimate_complexity(str(code) if pd.notna(code) else "")
        scores.append({
            "SubjectID": row["SubjectID"],
            "ProblemID": row["ProblemID"],
            "complexity_score": score,
        })

    return pd.DataFrame(scores)


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def build_feature_rows(
    main_df: pd.DataFrame,
    code_df: pd.DataFrame,
    difficulty_map: dict[str, str],
) -> pd.DataFrame:
    """
    Build one row per (student, problem) with all five Codely features.
    """
    submits = main_df[main_df["EventType"] == "Submit"].copy()
    submits["Correct"] = submits["Correct"].astype(str).str.strip().str.lower() == "true"

    # Per-student per-problem aggregates.
    agg = (
        submits.groupby(["SubjectID", "ProblemID"])
        .agg(
            attempts=("EventID", "count"),
            correct_count=("Correct", "sum"),
            first_timestamp=("ServerTimestamp", "min"),
        )
        .reset_index()
    )
    agg["correctness_rate"] = agg["correct_count"] / agg["attempts"]

    # Map difficulty.
    agg["difficulty"] = agg["ProblemID"].map(difficulty_map)

    # Timestamp for ordering (use first submission of each problem).
    agg["attempted_at"] = pd.to_datetime(agg["first_timestamp"], utc=True)

    # Complexity from last submission's code.
    print("\nEstimating procedural complexity from source code …")
    complexity_df = estimate_complexity_for_last_submission(submits, code_df)
    agg = agg.merge(complexity_df, on=["SubjectID", "ProblemID"], how="left")
    agg["complexity_score"] = agg["complexity_score"].fillna(NOT_IMPLEMENTED_SENTINEL)

    # Rename to Codely schema.
    agg = agg.rename(columns={
        "SubjectID": "student_id",
        "ProblemID": "problem_id",
    })

    # runtime_ms: no data in CSEDM — set to sentinel; will be imputed after split.
    agg["runtime_ms"] = float("nan")

    # Keep only what labeling.py needs.
    cols = [
        "student_id", "problem_id", "difficulty",
        "correctness_rate", "runtime_ms", "attempts",
        "complexity_score", "attempted_at",
    ]
    return agg[cols].reset_index(drop=True)


def impute_runtime(train_df: pd.DataFrame, test_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Impute runtime_ms with the training-set median (avoids test-set leakage).
    Every row gets the same value — this feature carries no signal for M0.
    """
    # All values are NaN for CSEDM, so median will be NaN too.
    # Use a fixed domain-reasonable fallback instead.
    FALLBACK_RUNTIME_MS = 250.0  # ~250ms: midpoint of typical Python execution range

    train_median = train_df["runtime_ms"].median()
    if pd.isna(train_median):
        train_median = FALLBACK_RUNTIME_MS

    print(f"\nImputing runtime_ms with training-set median: {train_median:.1f} ms")
    print("  (CSEDM has no execution-time data — see RUNTIME NOTE in script header)")

    train_df = train_df.copy()
    test_df = test_df.copy()
    train_df["runtime_ms"] = train_median
    test_df["runtime_ms"] = train_median
    return train_df, test_df


def split_by_student(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    80/20 GroupShuffleSplit on student_id. Mirrors train_model.py's logic.
    """
    gss = GroupShuffleSplit(n_splits=1, test_size=TEST_SIZE, random_state=RANDOM_STATE)
    train_idx, test_idx = next(gss.split(df, groups=df["student_id"]))
    return df.iloc[train_idx].reset_index(drop=True), df.iloc[test_idx].reset_index(drop=True)


def main():
    parser = argparse.ArgumentParser(description="Prepare CSEDM dataset for Codely M0 training.")
    parser.add_argument("--main",   required=True, help="Path to MainTable.csv")
    parser.add_argument("--code",   required=True, help="Path to CodeStates/CodeState.csv")
    parser.add_argument("--outdir", required=True, help="Output directory for CSVs")
    args = parser.parse_args()

    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)

    # ---- 1. Load raw files ----
    print("Loading MainTable.csv …")
    main_df = pd.read_csv(args.main)
    print(f"  {len(main_df)} rows, {main_df['SubjectID'].nunique()} students, "
          f"{main_df['ProblemID'].nunique()} problems")

    print("Loading CodeState.csv …")
    code_df = pd.read_csv(args.code)
    print(f"  {len(code_df)} code states")

    # ---- 2. Drop problems with no Correct values ----
    before = main_df["ProblemID"].nunique()
    main_df = main_df[~main_df["ProblemID"].isin(PROBLEMS_WITHOUT_CORRECT)].copy()
    after = main_df["ProblemID"].nunique()
    print(f"\nDropped {before - after} problems with no Correct values "
          f"({', '.join(sorted(PROBLEMS_WITHOUT_CORRECT))})")
    print(f"  Remaining: {after} problems")

    # ---- 3. Assign difficulty by tertile ----
    difficulty_map = assign_difficulty_by_tertile(main_df)

    # ---- 4. Build one row per (student, problem) ----
    print("\nBuilding feature rows …")
    feature_df = build_feature_rows(main_df, code_df, difficulty_map)
    print(f"  {len(feature_df)} rows across {feature_df['student_id'].nunique()} students")

    # ---- 5. Drop sentinel complexity rows ----
    bad = feature_df["complexity_score"] == NOT_IMPLEMENTED_SENTINEL
    if bad.any():
        print(f"\n  Dropping {int(bad.sum())} rows with unparseable source (complexity sentinel)")
        feature_df = feature_df[~bad].reset_index(drop=True)

    # ---- 6. Generate labels via labeling.py ----
    print("\nGenerating outcome-based labels …")
    labelled_df = generate_labels(feature_df, verbose=True)

    if labelled_df.empty:
        print("\nERROR: no labelled rows produced. Check that students attempted multiple problems.")
        sys.exit(1)

    print(f"\n--- Label distribution ---")
    for label, n in labelled_df["label"].value_counts().items():
        print(f"  {label:<8} {n:>4}  ({n / len(labelled_df) * 100:.1f}%)")

    # Convert label to ordinal (matching Codely's training schema).
    labelled_df["label"] = labelled_df["label"].map(DIFF_TO_ORD)

    # ---- 7. Split by student ----
    print(f"\nSplitting {labelled_df['student_id'].nunique()} students "
          f"80/20 by GroupShuffleSplit (seed={RANDOM_STATE}) …")
    train_df, test_df = split_by_student(labelled_df)
    print(f"  Train: {len(train_df)} rows, {train_df['student_id'].nunique()} students")
    print(f"  Test:  {len(test_df)} rows, {test_df['student_id'].nunique()} students")

    # ---- 8. Impute runtime_ms (train median, to avoid test leakage) ----
    train_df, test_df = impute_runtime(train_df, test_df)

    # ---- 9. Add split column and write outputs ----
    train_df["train_test_split"] = "TRAIN"
    test_df["train_test_split"] = "TEST"
    full_df = pd.concat([train_df, test_df], ignore_index=True)

    # Column order matching Codely's dataset schema.
    final_cols = [
        "student_id", "problem_id", "difficulty",
        "correctness_rate", "runtime_ms", "attempts",
        "complexity_score", "prev_difficulty", "prev_difficulty_ord",
        "label", "train_test_split",
    ]
    # Keep only columns that exist (prev_difficulty added by labeling.py).
    final_cols = [c for c in final_cols if c in full_df.columns]

    train_out = out / "csedm_train.csv"
    test_out  = out / "csedm_test.csv"
    full_out  = out / "csedm_full.csv"

    train_df[final_cols].to_csv(train_out, index=False)
    test_df[final_cols].to_csv(test_out, index=False)
    full_df[final_cols].to_csv(full_out, index=False)

    print(f"\nWrote:")
    print(f"  {train_out}")
    print(f"  {test_out}")
    print(f"  {full_out}")

    print("\n--- Next steps ---")
    print("  1. Run: python train_model.py --dry-run")
    print("     (uses csedm_train.csv for M0 — prints metrics without saving .joblib)")
    print("  2. Bring metrics to Mr. de Jesus review.")
    print("  3. After sign-off: flip REVIEWED_BY_EXPERT=True in ml/config.py, re-run without --dry-run.")
    print("\nReminder: csedm_train.csv and csedm_test.csv are D0 only.")
    print("They must NEVER be appended to D1/D2/D3 (real Codely student data).")


if __name__ == "__main__":
    main()