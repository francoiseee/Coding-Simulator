"""
compare_labeling.py — One-off comparison script, NOT part of the pipeline.

Purpose: show the effect of the Option B fix (Codely_ExpertReview_M1Results_
Aug2026.docx Section 7) on the SAME raw D1 attempts, without retraining or
touching production.

  "OLD"  = classify_outcome() judged against `attempts` (submissions + run_count)
           — this is what the pre-17-Aug code effectively did.
  "NEW"  = classify_outcome() judged against `submission_count` (graded
           submissions only) — this is what the code does today.

Run from the project root:
    python compare_labeling.py

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, same as train_model.py.
"""

from ml.export import fetch_raw
from ml.labeling import generate_labels

COHORT = "G1"  # same cohort D1 was drawn from


def main():
    print(f"Fetching raw attempts for cohort={COHORT} ...")
    raw = fetch_raw(cohort=COHORT)

    # NEW: current code path, unmodified. Uses submission_count internally.
    new_labels = generate_labels(raw.copy(), verbose=False)

    # OLD: simulate pre-fix behaviour by overwriting submission_count with
    # attempts before labeling, so classify_outcome() is judged against the
    # inflated (submissions + run_count) figure, exactly like the code did
    # before the Option B fix landed.
    old_raw = raw.copy()
    old_raw["submission_count"] = old_raw["attempts"]
    old_labels = generate_labels(old_raw, verbose=False)

    print("\n" + "=" * 50)
    print(f"{'label':<10}{'OLD (attempts)':>18}{'NEW (submission_count)':>26}")
    print("=" * 50)

    all_labels = sorted(set(old_labels["label"]) | set(new_labels["label"]))
    old_counts = old_labels["label"].value_counts()
    new_counts = new_labels["label"].value_counts()

    for lab in all_labels:
        o = int(old_counts.get(lab, 0))
        n = int(new_counts.get(lab, 0))
        print(f"{lab:<10}{o:>18}{n:>26}")

    print("=" * 50)
    print(f"{'TOTAL':<10}{len(old_labels):>18}{len(new_labels):>26}")

    # Row-level flips: same (student, problem) row, different label.
    merged = old_labels[["student_id", "problem_id", "label"]].merge(
        new_labels[["student_id", "problem_id", "label"]],
        on=["student_id", "problem_id"],
        suffixes=("_old", "_new"),
    )
    flipped = merged[merged["label_old"] != merged["label_new"]]
    print(f"\nRows with a different label under NEW vs OLD: {len(flipped)} / {len(merged)}")
    if len(flipped):
        print(flipped.to_string(index=False))


if __name__ == "__main__":
    main()
