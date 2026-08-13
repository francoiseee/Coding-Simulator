"""
config.py — Locked constants for Codely RF training.

Everything in this file is a METHODOLOGICAL commitment, not a tuning knob.

Read this before changing anything here:

    The labelling thresholds and the train/test seed are pre-registered in
    Chapter 3. Changing them after seeing model results and then reporting the
    improved figure is circular reasoning — it fits the labels to the model
    rather than the model to the data. It is also the first thing a panelist
    will probe.

    If a value here genuinely must change, the change must be made BEFORE a
    training run, recorded with a reason, and reflected in Chapter 3. Bump
    RULE_VERSION when that happens so old and new runs are distinguishable.

Reference: Codely_Decision_LabelingRule.md (status: PROPOSED, pending AI expert
review — do not treat these as final until that review lands).
"""

# ─── Versioning ───────────────────────────────────────────────────────────────
# Stamped into every artefact so a saved model can always be traced back to the
# rule that produced its labels.
RULE_VERSION = "v1.0-proposed"

# ─── Difficulty vocabulary ────────────────────────────────────────────────────
# These are PROBLEM difficulties (problems.difficulty), NOT student skill levels
# (profiles.skill_level, which uses beginner/intermediate/advanced).
# The RF predicts what difficulty to serve next, so it uses this vocabulary.
# Order matters: index position defines what "one step up/down" means.
DIFFICULTY_ORDER = ["easy", "medium", "hard"]

# ─── Labelling thresholds ─────────────────────────────────────────────────────
# Justification for each number lives in Codely_Decision_LabelingRule.md and
# must be reproduced in Chapter 3. Summarised:
#
#   WELL_SCORE_MIN    80.0  Conventional mastery threshold in criterion-
#                           referenced assessment; matches the cold-start rule
#                           already used for skill-level assignment.
#   WELL_ATTEMPTS_MAX 2     A working approach existed before submitting. Three
#                           or more suggests convergence by trial and error.
#   STRUGGLE_SCORE_MAX 50.0 Below half the tests passing indicates the approach
#                           itself was wrong, not that it had an edge-case bug.
#   STRUGGLE_ATTEMPTS_MIN 5 Sustained difficulty regardless of final score.
#
# Note the asymmetry, which is deliberate:
#   WELL     requires BOTH conditions (AND) — excludes high-score/many-attempts
#   STRUGGLE requires EITHER condition (OR) — either signal alone is enough
WELL_SCORE_MIN = 80.0
WELL_ATTEMPTS_MAX = 2
STRUGGLE_SCORE_MAX = 50.0
STRUGGLE_ATTEMPTS_MIN = 5

# ─── Edge case rules ──────────────────────────────────────────────────────────
# Maximum time between consecutive problems for the later one to count as
# evidence about the earlier one. Beyond this, too much may have changed.
#
# NOTE: 7 days is a proposed figure, not a principled one. Flagged in the
# decision record for AI expert confirmation.
MAX_GAP_DAYS = 7

# Minimum problems a student must complete to contribute any usable rows.
# The last problem in any sequence is always discarded (no "next" to label
# from), so N problems yields N-1 rows.
MIN_PROBLEMS_PER_STUDENT = 2

# ─── Train/test split ─────────────────────────────────────────────────────────
# Group-aware splitting on student_id. A naive random split scatters one
# student's rows across both sides, letting the model preview the test set
# through shared per-student patterns — inflating F1 in a way that collapses on
# real unseen students. See AIC-2026-01 Point 4.
#
# TEST_SIZE is a fraction of STUDENTS, not of rows.
TEST_SIZE = 0.20
RANDOM_STATE = 42

# ─── Feature set ──────────────────────────────────────────────────────────────
# Locked at five. The paper commits to exactly these; a sixth requires a
# methodology change. See Codely_Decision_Feature4.md.
FEATURE_COLUMNS = [
    "correctness_rate",      # 1. submissions.score_percentage (best attempt)
    "runtime_ms",            # 2. mean runtime across test cases
    "attempts",              # 3. submission count for this problem attempt
    "complexity_score",      # 4. estimated procedural complexity (ml/complexity.py)
    "prev_difficulty_ord",   # 5. difficulty of the preceding problem, ordinal
]

LABEL_COLUMN = "label"
GROUP_COLUMN = "student_id"

# ─── Data cutoff ──────────────────────────────────────────────────────────────
# The /api/practice/run endpoint went live on 2026-08-06. Before that date,
# students could not test code without creating a submission, so attempt counts
# are not comparable across the boundary. Only post-cutoff data is used, so
# feature 3 is measured consistently across every row.
#
# This also excludes the 14 development test submissions (July 14 - Aug 1).
DATA_CUTOFF_ISO = "2026-08-06T00:00:00+00:00"

# ─── Expert sign-off gate ──────────────────────────────────────────────────────
# IS_IMPLEMENTED in complexity.py means "the code runs and returns real
# values." It does NOT mean the AI expert has reviewed the estimation method.
# Those are different questions, and conflating them is exactly how an
# unreviewed model quietly becomes "the" model reported in Chapter 4.
#
# train_model.py trains and prints metrics regardless of this flag — that is
# always safe, and is what to bring TO the review conversation. But it refuses
# to write a .joblib / metadata file while this is False. Flip it only after
# the review happens, and fill in the two lines below when you do — that
# record is what makes "reviewed" checkable later rather than just claimed.
REVIEWED_BY_EXPERT = True
EXPERT_REVIEW_DATE = "2026-08-12"      # M0 two-class sign-off (email). Complexity
                                        # Estimator (F4) itself was signed off 2026-08-08.
EXPERT_REVIEW_NOTE = (
    "Reviewed by Mr. Arnaz De Jesus (Shore360 Agency). Complexity Estimator "
    "(F4) approved as-is 08 Aug 2026 (renamed 'Procedural Complexity Estimator' "
    "per his note). M0 two-class architecture, and F4's 0.093 contribution to "
    "it, approved as-is 12 Aug 2026. Two items were CONDITIONALLY approved and "
    "remain open as separate action items, not blockers on this flag: (1) "
    "labeling rule thresholds (WELL/STRUGGLED) — bounce rates must be actively "
    "monitored during Group 1; (2) M0 metrics as baseline — the Easy-to-Medium "
    "bias must be explicitly documented in Ch. 4/5 before reporting. See "
    "Codely_Decision_ExpertSignOff_Aug2026.docx for full record and action items."
)

# ─── Random Forest hyperparameters ────────────────────────────────────────────
# These ARE tunable — they are model configuration, not methodology. Tuning
# them is normal practice and does not create circularity, because they do not
# affect the labels.
#
# class_weight="balanced" matters here: boundary clamping over-represents easy
# and hard (a student doing well on hard is repeatedly labelled hard, since
# nothing is higher). Without weighting the model may under-predict medium.
RF_PARAMS = {
    "n_estimators": 200,
    "max_depth": None,
    "min_samples_split": 2,
    "min_samples_leaf": 1,
    "class_weight": "balanced",
    "random_state": RANDOM_STATE,
    "n_jobs": -1,
}