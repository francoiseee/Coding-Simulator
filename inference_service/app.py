"""
app.py — Codely RF inference microservice.

Serves difficulty predictions from the trained Random Forest model
(train_model.py's output) over HTTP so the Next.js app can call it without
needing a Python runtime in its own process.

STARTUP GATE — defense in depth
--------------------------------
train_model.py already refuses to SAVE a model unless
ml/config.py's REVIEWED_BY_EXPERT is True. This service adds a second,
independent check at the OTHER end of that same guarantee: it refuses to
SERVE a model whose saved metadata does not show reviewed_by_expert = true.
This matters because a model file can outlive the reasoning that gated it —
someone could copy an old .joblib into place, or the flag could be flipped
back to False after a model was saved. Checking again at serve time means
the guarantee survives that failure mode too, rather than depending on
train_model.py having been the only path a model could ever take to get here.

WHAT THIS SERVICE DOES NOT CLAIM
---------------------------------
M0 is a two-class model (easy/medium only — see
Codely_Decision_M0_TwoClassLabel.docx). It has never seen a Hard-class label
and cannot predict one. `classes` in /health and /predict's response tells
the caller exactly what this model instance can output — the caller (the
Next.js adaptive picker, once built) is responsible for routing Hard-tier
decisions to the rule-based fallback described in that decision doc. This
service does not and should not silently patch that gap.

RUNNING
-------
    pip install -r requirements.txt
    MODEL_DIR=../ml_out uvicorn app:app --reload --port 8000

Env vars:
    MODEL_DIR   Directory containing model_*.joblib / metadata_*.json pairs.
                Defaults to "../ml_out" (relative to this file), matching
                train_model.py's OUT constant one level up in the repo.
"""

from __future__ import annotations

import glob
import json
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import joblib
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

# The ml/ package lives one level up (repo root), alongside train_model.py.
# Adding it to sys.path lets this service import the EXACT SAME
# estimate_complexity() function train_model.py trains against — deliberately
# not reimplemented here, so training-time and inference-time complexity
# buckets can never silently drift apart from each other.
sys.path.insert(0, str(Path(__file__).parent.parent.resolve()))
from ml.complexity import estimate_complexity, NOT_IMPLEMENTED_SENTINEL  # noqa: E402

# ─── Model loading ──────────────────────────────────────────────────────────

MODEL_DIR = Path(os.environ.get("MODEL_DIR", Path(__file__).parent / ".." / "ml_out")).resolve()

# Populated at startup by load_latest_model(). Left as module-level state
# (not a class) to match FastAPI's simplest recommended pattern for a
# single, process-lifetime model — this service is not meant to hot-swap
# models while running; a new model means a restart.
state: dict = {"model": None, "metadata": None, "classes": None}


def _find_latest_pair(model_dir: Path) -> tuple[Path, Path]:
    """Find the most recent model_*.joblib / metadata_*.json pair by
    timestamp in the filename (train_model.py stamps both with the same
    `stamp`, so matching by stem guarantees they're from the same run —
    picking the newest of each independently could pair mismatched files)."""
    models = sorted(glob.glob(str(model_dir / "model_*.joblib")))
    if not models:
        raise FileNotFoundError(
            f"No model_*.joblib files found in {model_dir}. "
            "Run train_model.py first (see Codely_Model_Training.pdf)."
        )
    latest_model = Path(models[-1])
    stamp = latest_model.stem.replace("model_", "")
    metadata_path = model_dir / f"metadata_{stamp}.json"
    if not metadata_path.exists():
        raise FileNotFoundError(
            f"Found {latest_model.name} but no matching {metadata_path.name}. "
            "A model and its metadata are written together by train_model.py — "
            "this pairing should never be broken. Do not proceed with a model "
            "that has no matching metadata; there would be no way to verify "
            "reviewed_by_expert."
        )
    return latest_model, metadata_path


def load_latest_model() -> None:
    model_path, metadata_path = _find_latest_pair(MODEL_DIR)

    metadata = json.loads(metadata_path.read_text())

    # THE GATE. See module docstring — this is deliberate and load-bearing,
    # not a leftover check. Do not remove or bypass it.
    if not metadata.get("reviewed_by_expert"):
        raise RuntimeError(
            f"Refusing to serve {model_path.name}: its metadata does not show "
            f"reviewed_by_expert = true. Flip REVIEWED_BY_EXPERT in ml/config.py "
            f"and re-run train_model.py to produce a reviewed artifact before "
            f"starting this service. See Codely_Decision_ExpertSignOff_Aug2026.docx."
        )

    model = joblib.load(model_path)

    state["model"] = model
    state["metadata"] = metadata
    state["model_path"] = str(model_path)
    # model.classes_ are the literal string labels the model was fit on
    # (train_model.py fits directly on the string label column, no
    # LabelEncoder) — sorted alphabetically by sklearn, e.g. ['easy','medium'].
    state["classes"] = list(model.classes_)

    # Feature order MUST match training exactly (X_train = df[FEATURE_COLUMNS]
    # in train_model.py). Read it from the model's own saved metadata rather
    # than hardcoding it here, so a future config change can't silently
    # desync the two sides.
    features = metadata.get("features")
    if not features:
        raise RuntimeError(
            f"{metadata_path.name} has no 'features' list — cannot safely "
            "build a feature vector without knowing the exact training order."
        )
    state["features"] = features

    print(f"[startup] Loaded {model_path.name}")
    print(f"[startup] Classes this model can predict: {state['classes']}")
    print(f"[startup] Feature order: {features}")
    print(
        f"[startup] reviewed_by_expert=True, "
        f"date={metadata.get('expert_review_date')}"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        load_latest_model()
    except (FileNotFoundError, RuntimeError) as exc:
        # Fail LOUD at startup, not on the first request. A service that
        # silently came up without a model would return confusing 500s
        # instead of refusing to exist.
        print(f"[startup] FATAL: {exc}", file=sys.stderr)
        raise
    yield


app = FastAPI(
    title="Codely RF Inference Service",
    description=(
        "Serves difficulty predictions from Codely's trained Random Forest "
        "model. See app.py module docstring for the expert-review gate and "
        "what this service does and does not claim about Hard-class support."
    ),
    lifespan=lifespan,
)


# ─── Shared-secret auth ──────────────────────────────────────────────────────
# The inference service is publicly reachable on Render Starter. A shared
# secret in a request header is the standard lightweight mitigation for an
# internal-only service that can't live behind a VPN. RF_INTERNAL_SECRET must
# be set on both sides (Render env + Vercel env). If it's absent from the
# environment, the service refuses all protected requests rather than running
# open — missing config fails loud, not silent.
_INTERNAL_SECRET = os.environ.get("RF_INTERNAL_SECRET", "")


def _require_auth(x_internal_secret: str = Header(default="")) -> None:
    """FastAPI dependency — raises 401 if the shared secret doesn't match."""
    if not _INTERNAL_SECRET:
        raise HTTPException(
            status_code=500,
            detail="RF_INTERNAL_SECRET is not configured on this service.",
        )
    if x_internal_secret != _INTERNAL_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized.")


# ─── Request / response schemas ─────────────────────────────────────────────

class PredictRequest(BaseModel):
    # Field bounds mirror the ranges these values can actually take in the
    # Codely schema (submissions.score_percentage, problems difficulty
    # buckets, etc.) — not arbitrary API validation for its own sake.
    correctness_rate: float = Field(
        ..., ge=0, le=100, description="submissions.score_percentage of the best attempt"
    )
    runtime_ms: float = Field(..., ge=0, description="Mean runtime across test cases, ms")
    attempts: int = Field(..., ge=1, description="Number of graded submissions for this attempt")
    complexity_score: int = Field(
        ...,
        ge=0,
        le=3,
        description=(
            "Procedural complexity bucket from ml/complexity.py "
            "(0=constant, 1=single loop, 2=nested/single recursion, "
            "3=deep nesting or branching recursion). The caller must supply "
            "a real bucket — NOT_IMPLEMENTED_SENTINEL (-999) is rejected "
            "here; a code-parse failure is a caller-side decision, not "
            "something this service should silently paper over."
        ),
    )
    prev_difficulty_ord: int = Field(
        ...,
        ge=-1,
        le=2,
        description=(
            "Ordinal of the difficulty the student was previously on "
            "(0=easy, 1=medium, 2=hard), or -1 if there is no prior problem "
            "in this student's sequence. -1 is a value the model has "
            "genuinely seen in training (ml/labeling.py), not an edge case "
            "invented for this API — see prev_difficulty_ord handling there."
        ),
    )


class PredictResponse(BaseModel):
    difficulty: str
    probabilities: dict[str, float]
    supported_classes: list[str]
    model_trained_at: Optional[str]
    warning: Optional[str] = None


class ComplexityRequest(BaseModel):
    source_code: str = Field(..., min_length=1, description="Raw Python source of the student's solution")


class ComplexityResponse(BaseModel):
    complexity_score: int
    parsed_ok: bool
    warning: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_path: Optional[str]
    classes: Optional[list[str]]
    reviewed_by_expert: Optional[bool]
    expert_review_date: Optional[str]
    trained_at: Optional[str]
    rule_version: Optional[str]
    n_rows_total: Optional[int]


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
def health():
    meta = state.get("metadata") or {}
    return HealthResponse(
        status="ok" if state.get("model") is not None else "no_model",
        model_loaded=state.get("model") is not None,
        model_path=state.get("model_path"),
        classes=state.get("classes"),
        reviewed_by_expert=meta.get("reviewed_by_expert"),
        expert_review_date=meta.get("expert_review_date"),
        trained_at=meta.get("trained_at"),
        rule_version=meta.get("rule_version"),
        n_rows_total=meta.get("n_rows_total"),
    )


@app.post("/complexity", response_model=ComplexityResponse, dependencies=[Depends(_require_auth)])
def complexity(req: ComplexityRequest):
    """
    Wraps ml.complexity.estimate_complexity() directly — same function,
    same bucket logic, same limitations documented in that module's
    docstring. This endpoint exists ONLY so a non-Python caller (the
    Next.js picker) can get a bucket without reimplementing the AST logic
    and risking it drifting from what train_model.py actually trained on.
    """
    score = estimate_complexity(req.source_code)
    if score == NOT_IMPLEMENTED_SENTINEL:
        # This should be rare in practice — the picker calls this with the
        # source of an already-graded submission, which by definition
        # parsed successfully when it ran on Judge0. Still handled
        # explicitly rather than silently returning a fake bucket: the
        # caller must decide what to do (e.g. skip the RF call and fall
        # back to a rule), not have this service guess on its behalf.
        return ComplexityResponse(
            complexity_score=score,
            parsed_ok=False,
            warning=(
                "Source code could not be parsed. This is the same sentinel "
                "used in training (NOT_IMPLEMENTED_SENTINEL=-999) — the "
                "caller should not feed this value into /predict."
            ),
        )
    return ComplexityResponse(complexity_score=score, parsed_ok=True)


@app.post("/predict", response_model=PredictResponse, dependencies=[Depends(_require_auth)])
def predict(req: PredictRequest):
    model = state.get("model")
    if model is None:
        # Should be unreachable — lifespan raises before the app comes up if
        # loading fails. Kept as a defensive check, not the primary guard.
        raise HTTPException(status_code=503, detail="Model not loaded.")

    features = state["features"]
    row = {
        "correctness_rate": req.correctness_rate,
        "runtime_ms": req.runtime_ms,
        "attempts": req.attempts,
        "complexity_score": req.complexity_score,
        "prev_difficulty_ord": req.prev_difficulty_ord,
    }
    # Build the feature vector in the EXACT order the model was trained on.
    # Using a DataFrame (not a bare list) because that's what the model was
    # fit against (X_train = train_df[FEATURE_COLUMNS], a DataFrame) —
    # matching the input type as well as the column order avoids any sklearn
    # feature-name-mismatch warnings/errors on newer scikit-learn versions.
    X = pd.DataFrame([[row[f] for f in features]], columns=features)

    proba = model.predict_proba(X)[0]
    classes = state["classes"]
    probabilities = {cls: round(float(p), 4) for cls, p in zip(classes, proba)}
    predicted = classes[int(proba.argmax())]

    warning = None
    if "hard" not in classes:
        warning = (
            "This model instance cannot predict 'hard' — it was trained "
            "without any Hard-class labels (see "
            "Codely_Decision_M0_TwoClassLabel.docx). If this student may be "
            "ready for a Hard problem, that decision must come from the "
            "rule-based fallback, not from this prediction."
        )

    return PredictResponse(
        difficulty=predicted,
        probabilities=probabilities,
        supported_classes=classes,
        model_trained_at=(state.get("metadata") or {}).get("trained_at"),
        warning=warning,
    )