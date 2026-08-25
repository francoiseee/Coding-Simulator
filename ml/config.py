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

Reference: Codely_Decision_LabelingRule.md (status: CONFIRMED — reviewed and
approved by Mr. Arnaz De Jesus, AI Engineer, Shore360 Agency, 24 Aug 2026).
"""

# ─── Versioning ───────────────────────────────────────────────────────────────
# Stamped into every artefact so a saved model can always be traced back to the
# rule that produced its labels.
RULE_VERSION = "v1.1"

# ─── Difficulty vocabulary ────────────────────────────────────────────────────
# These are PROBLEM difficulties (problems.difficulty), NOT student skill levels
# (profiles.skill_level, which uses beginner/intermediate/advanced).
# The RF predicts what difficulty to serve next, so it uses this vocabulary.
# Order matters: index position defines what "one step up/down" means.
DIFFICULTY_ORDER = ["easy", "medium", "hard"]

# ─── Labelling thresholds ─────────────────────────────────────────────────────
# Confirmed by Mr. Arnaz De Jesus (Shore360 Agency), 24 Aug 2026: "consider the
# PROPOSED status closed... confirmed using heuristic thresholds based on
# pedagogical interpretability is a standard, convergent practice in
# Educational Data Mining (EDM), supported by precedent in systems like
# ASSISTments." See Codely_Decision_LabelingRule.md for the full record.
# Justification for each number lives in Codely_Decision_LabelingRule.md and
# must be reproduced in Chapter 3. Summarised:
#
#   WELL_SCORE_MIN    80.0  Conventional mastery threshold in criterion-
#                           referenced assessment; matches the cold-start rule
#                           already used for skill-level assignment.
#   WELL_ATTEMPTS_MAX 2     A working approach existed before submitting. Three
#                           or more suggests convergence by trial and error.
#                           Measured against submission_count, not the RF's
#                           attempts feature — the Aug 14 attempts redefinition
#                           (Codely_Decision_AttemptsFeatureDefinition_Aug2026.docx)
#                           folded in ungraded Run Code presses, decoupling the
#                           two. See Codely_ExpertReview_M1Results_Aug2026.docx
#                           Section 7.
#   STRUGGLE_SCORE_MAX 50.0 Below half the tests passing indicates the approach
#                           itself was wrong, not that it had an edge-case bug.
#   STRUGGLE_ATTEMPTS_MIN 5 Sustained difficulty regardless of final score.
#                           Measured against submission_count, not the RF's
#                           attempts feature — same Aug 14 decoupling as above.
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

# ─── Pilot roster exclusions ───────────────────────────────────────────────
# Accounts that are NOT Group 1 pilot participants but have activity inside
# the DATA_CUTOFF_ISO window regardless — dev/test accounts, groupmate
# accounts used for QA, and confirmed duplicate sign-ups. DATA_CUTOFF_ISO
# alone cannot exclude these: it is a methodological boundary (when
# /api/practice/run went live), not a contamination filter, and every one of
# these accounts was active well after that date. Verified against the live
# roster 16 Aug 2026.
#
# Update this list before every export (D1, D2, D3...), not just once — new
# dev/test activity or duplicate sign-ups can appear in any future batch.
EXCLUDED_USER_IDS = [
    "6e63eb41-04be-41ed-b797-53091cd0dd93",  # lance.apostol.019@gmail.com — dev/test
    "5038dc04-772d-492d-a033-8f4513fd6064",  # lanceapostol04@gmail.com — dev/test
    "731cbe00-4dae-43ff-8fd9-28298222644f",  # lanceapostol0991@gmail.com — dev/test
    "949dc8dc-949b-4bfe-8730-e9f2d365c63f",  # lancejezreel04@gmail.com — dev/test
    "59223a8e-9f3c-40bc-8692-1db77c2b3353",  # lancejx19@gmail.com — dev/test
    "e53f97a2-fe28-4beb-8bd8-17045d66b286",  # lancepogi@gmail.com — dev/test
    "bf192b34-b2d6-4c28-9116-a53bf47c13e0",  # thecodelyteam@gmail.com — dev/test
    "27ee8ec9-d01a-476f-b8f4-9fe16506d3e2",  # allein325dane@gmail.com — groupmate (Christine)
    "f26594fb-1055-4f86-8723-31440c7fd2b9",  # maninangadg@gmail.com — groupmate (Dane)
    "a42be419-4ece-42b6-bfc5-9f1f1db0b43c",  # adgmaninang.cscsoc@gmail.com — groupmate (Dane, 2nd account)
    "e3734153-794c-4453-8f47-554063ef5ff6",  # nikkosgameprojects@gmail.com — groupmate (Nikko)
    "4bc26b37-c2c2-4ada-8a0c-fcf46427c9f7",  # reshleygonzales11@gmail.com — excluded this batch (Lance's call, 16 Aug 2026)
    "fb4e1d22-e1e5-4aa6-9635-391a774c1be5",  # gonzalesreshley@gmail.com — excluded this batch (Lance's call, 16 Aug 2026)
    "128fbb1b-0ee9-4d12-973b-57112199346a",  # grant@gmail.com — placeholder account; real participant is quilantanggrant@gmail.com
]

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