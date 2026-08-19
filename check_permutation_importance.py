"""
check_permutation_importance.py — One-off diagnostic, NOT part of the pipeline.

Purpose: model.feature_importances_ (Mean Decrease in Impurity, MDI) is
sklearn's default and is well documented to be biased toward high-cardinality
continuous features — runtime_ms has far more distinct values than the other
four features, which can inflate its MDI score independent of real signal.

Permutation importance instead measures the actual drop in held-out
predictive performance (macro F1) when a feature's values are shuffled. It
is not cardinality-biased, which makes it the right tool to check whether
runtime_ms's #1 MDI rank (0.3707 in the M2 dry-run) reflects genuine signal
or an artifact.

This reproduces the exact M2 training run — same cohorts, same seed, same
train/test split via train_model.py's own split_by_student() — so the
comparison is against the identical model and test set already reported,
not a new run that could differ by chance.

Run from the project root:
    python check_permutation_importance.py --cohorts G1,G2

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, same as train_model.py.
"""

from __future__ import annotations

import argparse

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance

from ml import complexity
from ml.config import FEATURE_COLUMNS, LABEL_COLUMN, RF_PARAMS, RANDOM_STATE
from ml.export import fetch_raw
from ml.labeling import generate_labels
from train_model import split_by_student


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--cohorts", type=str, required=True,
        help="Comma-separated cohorts, e.g. G1,G2 — should match the run being checked.",
    )
    args = ap.parse_args()

    cohort_list = [c.strip() for c in args.cohorts.split(",") if c.strip()]
    print(f"Cohorts: {cohort_list}")

    raw_parts = []
    for cohort in cohort_list:
        part = fetch_raw(cohort=cohort)
        part["source_cohort"] = cohort
        raw_parts.append(part)
    raw = pd.concat(raw_parts, ignore_index=True)
    df = generate_labels(raw)

    bad = df["complexity_score"] == complexity.NOT_IMPLEMENTED_SENTINEL
    if bad.any():
        df = df[~bad].reset_index(drop=True)

    # Same split function, same seed as train_model.py — reproduces the
    # identical train/test division already reported for this run.
    train_df, test_df = split_by_student(df)

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df[LABEL_COLUMN]
    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df[LABEL_COLUMN]

    print(f"\nTraining RandomForestClassifier on {len(X_train)} rows (same params as train_model.py)...")
    model = RandomForestClassifier(**RF_PARAMS)
    model.fit(X_train, y_train)

    print("\n" + "=" * 60)
    print("MDI (default feature_importances_) — what was reported")
    print("=" * 60)
    mdi = sorted(zip(FEATURE_COLUMNS, model.feature_importances_), key=lambda x: -x[1])
    for feat, imp in mdi:
        print(f"  {feat:<22} {imp:.4f}")

    print("\n" + "=" * 60)
    print("Permutation importance (test set, 30 repeats, scored on macro F1)")
    print("Not cardinality-biased — measures actual held-out predictive contribution")
    print("=" * 60)
    result = permutation_importance(
        model, X_test, y_test,
        n_repeats=30, random_state=RANDOM_STATE, scoring="f1_macro",
    )
    order = result.importances_mean.argsort()[::-1]
    perm_ranked = []
    for i in order:
        feat = FEATURE_COLUMNS[i]
        mean = result.importances_mean[i]
        std = result.importances_std[i]
        perm_ranked.append((feat, mean, std))
        flag = "  <-- near zero or negative: little/no real contribution" if mean <= 0.005 else ""
        print(f"  {feat:<22} {mean:+.4f}  (+/- {std:.4f}){flag}")

    print("\n" + "=" * 60)
    print("Comparison")
    print("=" * 60)
    mdi_rank = {feat: i + 1 for i, (feat, _) in enumerate(mdi)}
    perm_rank = {feat: i + 1 for i, (feat, _, _) in enumerate(perm_ranked)}
    print(f"  {'feature':<22}{'MDI rank':>10}{'perm rank':>12}")
    for feat in FEATURE_COLUMNS:
        marker = "  <-- rank drop" if perm_rank[feat] > mdi_rank[feat] + 1 else ""
        print(f"  {feat:<22}{mdi_rank[feat]:>10}{perm_rank[feat]:>12}{marker}")

    rt_mdi_rank = mdi_rank["runtime_ms"]
    rt_perm_rank = perm_rank["runtime_ms"]
    rt_perm_val = dict((f, m) for f, m, s in perm_ranked)["runtime_ms"]
    print("\nInterpretation:")
    if rt_perm_rank > rt_mdi_rank and rt_perm_val <= 0.01:
        print("  runtime_ms drops significantly under permutation importance and contributes")
        print("  little to actual held-out predictive performance. This supports the MDI")
        print("  cardinality-bias explanation — its #1 MDI rank likely does NOT reflect")
        print("  genuine signal about student performance.")
    elif rt_perm_rank <= 2:
        print("  runtime_ms remains a top contributor under permutation importance too.")
        print("  This is evidence AGAINST the pure cardinality-bias explanation — it appears")
        print("  to carry real predictive signal, not just an MDI artifact.")
    else:
        print("  Mixed signal — runtime_ms's rank shifted but did not collapse. Worth reporting")
        print("  both figures rather than concluding either explanation definitively.")


if __name__ == "__main__":
    main()
