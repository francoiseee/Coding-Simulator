"""
train_model.py — Offline Random Forest training for Codely.

    python train_model.py                 full run
    python train_model.py --export-only   build the CSV, do not train
    python train_model.py --dry-run       train, report, do not save

Pipeline:
    1. Export problem attempts from Supabase (one row per student per problem)
    2. Generate labels from observed outcomes (labeling.py)
    3. Split train/test by STUDENT, never by row (data leakage guard)
    4. Train the Random Forest
    5. Report accuracy, per-class precision/recall/F1, confusion matrix
    6. Save model + metadata + dataset CSV

Training happens ONCE, OFFLINE, on a finished dataset. There is no live feedback
loop — nothing teaches the model while students work. The saved .joblib is then
served by the FastAPI inference service.

Environment:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY    (service role — RLS would hide other students)
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import GroupShuffleSplit

from ml import complexity
from ml.config import (
    DIFFICULTY_ORDER,
    EXPERT_REVIEW_NOTE,
    FEATURE_COLUMNS,
    GROUP_COLUMN,
    LABEL_COLUMN,
    RANDOM_STATE,
    REVIEWED_BY_EXPERT,
    RF_PARAMS,
    RULE_VERSION,
    TEST_SIZE,
)
from ml.export import fetch_raw
from ml.labeling import generate_labels

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)


def split_by_student(df: pd.DataFrame):
    """
    Group-aware train/test split.

    THIS IS THE MOST IMPORTANT FUNCTION IN THE FILE.

    Each student contributes multiple rows. A naive random split scatters one
    student's rows across both sides, so the model sees some of their behaviour
    in training and is then evaluated on the rest. Sessions from one student
    share patterns — same skill level, same trajectory — so the model
    effectively previews the test set. F1 comes out inflated and then collapses
    on genuinely unseen students.

    A suspiciously high F1 is itself the symptom. See AIC-2026-01 Point 4.

    GroupShuffleSplit with student_id guarantees every student lands entirely on
    one side. TEST_SIZE is a fraction of STUDENTS, not of rows.
    """
    n_students = df[GROUP_COLUMN].nunique()
    if n_students < 5:
        print(f"\nERROR: only {n_students} students in the dataset.")
        print("  A student-level split needs enough students to be meaningful.")
        print("  Collect more pilot data before training.")
        sys.exit(1)

    gss = GroupShuffleSplit(n_splits=1, test_size=TEST_SIZE, random_state=RANDOM_STATE)
    train_idx, test_idx = next(gss.split(df, df[LABEL_COLUMN], df[GROUP_COLUMN]))

    train_df = df.iloc[train_idx].copy()
    test_df = df.iloc[test_idx].copy()

    # Belt and braces: assert no student appears on both sides.
    overlap = set(train_df[GROUP_COLUMN]) & set(test_df[GROUP_COLUMN])
    if overlap:
        raise AssertionError(f"LEAKAGE: {len(overlap)} students on both sides")

    print("\n--- Split (by student, not by row) ---")
    print(f"  train: {len(train_df):>4} rows / {train_df[GROUP_COLUMN].nunique()} students")
    print(f"  test : {len(test_df):>4} rows / {test_df[GROUP_COLUMN].nunique()} students")
    print("  no student overlap: OK")

    return train_df, test_df


def evaluate(model, X_test, y_test) -> dict:
    """
    Report four metrics per class, plus the confusion matrix.

    Accuracy alone is misleading under class imbalance — and boundary clamping
    in the labelling rule guarantees some imbalance. The confusion matrix is
    where the real finding lives: confusing easy with medium is a minor misstep,
    while confusing easy with hard means handing struggling students problems
    that make them quit. Those two errors are identical in the accuracy figure.
    """
    y_pred = model.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    f1_macro = f1_score(y_test, y_pred, average="macro", zero_division=0)
    labels = [d for d in DIFFICULTY_ORDER if d in set(y_test) | set(y_pred)]

    print("\n--- Results ---")
    print(f"  accuracy : {acc:.4f}")
    print(f"  macro F1 : {f1_macro:.4f}")
    print("\n" + classification_report(y_test, y_pred, labels=labels, zero_division=0))

    cm = confusion_matrix(y_test, y_pred, labels=labels)
    print("Confusion matrix (rows = actual, cols = predicted)")
    print("            " + "".join(f"{l:>10}" for l in labels))
    for name, row in zip(labels, cm):
        print(f"  {name:>9} " + "".join(f"{v:>10}" for v in row))

    print("\n--- Feature importance ---")
    for feat, imp in sorted(
        zip(FEATURE_COLUMNS, model.feature_importances_),
        key=lambda x: -x[1],
    ):
        print(f"  {feat:<22} {imp:.4f}")

    return {
        "accuracy": float(acc),
        "f1_macro": float(f1_macro),
        "labels": labels,
        "confusion_matrix": cm.tolist(),
        "per_class": classification_report(
            y_test, y_pred, labels=labels, zero_division=0, output_dict=True
        ),
        "feature_importance": dict(
            zip(FEATURE_COLUMNS, [float(i) for i in model.feature_importances_])
        ),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--export-only", action="store_true", help="build CSV, skip training")
    ap.add_argument("--dry-run", action="store_true", help="train and report, do not save")
    args = ap.parse_args()

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    print("=" * 62)
    print("Codely RF training")
    print(f"  rule version : {RULE_VERSION}")
    print(f"  seed         : {RANDOM_STATE}")
    print("=" * 62)

    # 1-2. Export and label.
    raw = fetch_raw()
    df = generate_labels(raw)

    if df.empty:
        print("\nERROR: no labelled rows. Sequences are probably too short —")
        print("  each student needs at least 2 problems, since the last one in")
        print("  any sequence has nothing to label from.")
        sys.exit(1)

    # Drop rows where feature 4 has no real value (unparseable source_code —
    # see ml/complexity.py). NOT_IMPLEMENTED_SENTINEL is a "no value" marker,
    # not a genuine bucket 0; leaving it in would hand the classifier a fake
    # outlier level that looks like signal but means "we couldn't tell."
    bad_complexity = df["complexity_score"] == complexity.NOT_IMPLEMENTED_SENTINEL
    if bad_complexity.any():
        print(f"\n  WARNING: dropping {int(bad_complexity.sum())} row(s) where "
              f"complexity could not be estimated (unparseable source)")
        df = df[~bad_complexity].reset_index(drop=True)
        if df.empty:
            print("\nERROR: no rows left after dropping unparseable-source rows.")
            sys.exit(1)

    csv_path = OUT / f"dataset_{stamp}.csv"
    df.to_csv(csv_path, index=False)
    print(f"\nDataset written: {csv_path}")

    print("\n--- Label distribution ---")
    for label, n in df[LABEL_COLUMN].value_counts().items():
        print(f"  {label:<8} {n:>4}  ({n / len(df) * 100:.1f}%)")

    missing_classes = set(DIFFICULTY_ORDER) - set(df[LABEL_COLUMN])
    if missing_classes:
        print(f"\n  WARNING: no rows labelled {sorted(missing_classes)}.")
        print("  The model cannot learn a class absent from training data.")
        print("  Check that the question bank covers all three difficulties and")
        print("  that students actually attempted problems across the range.")

    if args.export_only:
        print("\n--export-only: stopping before training.")
        return

    # Guard: refuse to train on a stub feature.
    if not complexity.IS_IMPLEMENTED:
        print("\n" + "!" * 62)
        print("BLOCKED: feature 4 (time complexity) is not implemented.")
        print("!" * 62)
        print("\ncomplexity.estimate_complexity() returns a constant sentinel, so")
        print("complexity_score carries no information. Training now would produce")
        print("a FOUR-feature model that the paper describes as five.")
        print("\nThe dataset CSV above is still valid and complete for every other")
        print("column — build the estimator, set IS_IMPLEMENTED = True, re-run.")
        sys.exit(2)

    # 3. Split.
    train_df, test_df = split_by_student(df)

    # Record which side each row landed on, so the split is reproducible and
    # auditable rather than implicit in a random seed.
    df["train_test_split"] = "TRAIN"
    df.loc[test_df.index, "train_test_split"] = "TEST"
    df.to_csv(csv_path, index=False)

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df[LABEL_COLUMN]
    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df[LABEL_COLUMN]

    # 4. Train.
    print(f"\nTraining RandomForestClassifier on {len(X_train)} rows ...")
    model = RandomForestClassifier(**RF_PARAMS)
    model.fit(X_train, y_train)

    # 5. Evaluate.
    metrics = evaluate(model, X_test, y_test)

    if args.dry_run:
        print("\n--dry-run: not saving.")
        return

    # Guard: training and printing metrics above is always safe — that is
    # exactly what to bring to the AI expert review conversation (via
    # --dry-run or otherwise). Saving a .joblib is what turns "we tried
    # something" into "our model," so THAT is what gets blocked until the
    # complexity estimation method has been reviewed. IS_IMPLEMENTED (checked
    # earlier) only means the code runs; REVIEWED_BY_EXPERT means a human with
    # relevant expertise has actually looked at the method.
    if not REVIEWED_BY_EXPERT:
        print("\n" + "!" * 62)
        print("NOT SAVED: complexity estimation method lacks AI expert sign-off.")
        print("!" * 62)
        print(f"\n{EXPERT_REVIEW_NOTE}")
        print("\nThe metrics above are valid to look at internally and are exactly")
        print("what to bring to that review. Do not report this run in Chapter 4")
        print("and do not treat it as final until ml/config.py's")
        print("REVIEWED_BY_EXPERT is flipped to True with a date and reviewer")
        print("recorded alongside it.")
        sys.exit(3)

    # 6. Save.
    model_path = OUT / f"model_{stamp}.joblib"
    joblib.dump(model, model_path)

    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "rule_version": RULE_VERSION,
        "random_state": RANDOM_STATE,
        "test_size_students": TEST_SIZE,
        "features": FEATURE_COLUMNS,
        "rf_params": {k: v for k, v in RF_PARAMS.items() if k != "n_jobs"},
        "n_rows_total": int(len(df)),
        "n_rows_train": int(len(train_df)),
        "n_rows_test": int(len(test_df)),
        "n_students": int(df[GROUP_COLUMN].nunique()),
        "label_distribution": df[LABEL_COLUMN].value_counts().to_dict(),
        "metrics": metrics,
        "dataset_csv": csv_path.name,
    }
    meta_path = OUT / f"metadata_{stamp}.json"
    meta_path.write_text(json.dumps(meta, indent=2))

    print(f"\nSaved:\n  {model_path}\n  {meta_path}\n  {csv_path}")
    print("\nReport accuracy, per-class precision/recall/F1, AND the confusion")
    print("matrix in Chapter 4. Accuracy alone is not a finding.")


if __name__ == "__main__":
    main()
