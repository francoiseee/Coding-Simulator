# Codely RF Inference Service

Serves difficulty predictions from the trained Random Forest model over HTTP,
so the Next.js app can call it without a Python runtime in-process.

## Setup

Place this folder (`inference_service/`) as a sibling of `train_model.py` and
`ml_out/` in your repo, e.g.:

```
coding-simulator/
├── train_model.py
├── ml_out/
│   ├── model_20260813_114430.joblib
│   └── metadata_20260813_114430.json
├── ml/
└── inference_service/      <- this folder
    ├── app.py
    ├── requirements.txt
    └── README.md
```

```bash
cd inference_service
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

By default it looks for the latest `model_*.joblib` / `metadata_*.json` pair
in `../ml_out` (one level up). Override with `MODEL_DIR=/path/to/ml_out` if your
layout differs.

## The expert-review gate

The service reads `reviewed_by_expert` from the model's own saved metadata
and **refuses to start** if it's not `true` — this is intentional, not a bug
to work around. It mirrors the same gate `train_model.py` already enforces
at save time (`REVIEWED_BY_EXPERT` in `ml/config.py`), so an unreviewed model
can't get served even if it somehow ends up in the `out/` folder (e.g. copied
in by hand, or the flag got flipped back to `False` after saving). If you see
this at startup:

```
[startup] FATAL: Refusing to serve model_X.joblib: its metadata does not
show reviewed_by_expert = true. ...
```

that means exactly what it says — go back to `ml/config.py`, confirm the
flag and re-run `train_model.py`, don't bypass the check.

## Endpoints

### `GET /health`

Reports what's currently loaded — classes the model can predict, whether it's
reviewed, when it was trained, etc. Good first call to sanity-check a fresh
deploy.

### `POST /predict`

```json
{
  "correctness_rate": 92,
  "runtime_ms": 250,
  "attempts": 1,
  "complexity_score": 1,
  "prev_difficulty_ord": -1
}
```

- `complexity_score`: the bucket from `ml/complexity.py` (0-3). The caller
  must supply a real value — a parse failure (`NOT_IMPLEMENTED_SENTINEL`,
  -999) is rejected with a 422, not silently handled here.
- `prev_difficulty_ord`: -1 means no prior problem in this student's
  sequence (their first problem in a session sequence — distinct from "zero
  submissions ever," which the JS-side cold-start rule should intercept
  *before* ever calling this service). 0/1/2 = easy/medium/hard.

Response:

```json
{
  "difficulty": "easy",
  "probabilities": {"easy": 1.0, "medium": 0.0},
  "supported_classes": ["easy", "medium"],
  "model_trained_at": "2026-08-13T11:44:30.399745+00:00",
  "warning": "This model instance cannot predict 'hard' — ..."
}
```

**M0 is a two-class model.** `supported_classes` will be `["easy", "medium"]`
until a model is trained on real Codely data that actually contains Hard
labels (M1+). The `warning` field fires automatically whenever `"hard"` isn't
in the model's classes — the caller is responsible for routing to the
rule-based Hard fallback in that case (see
`Codely_Decision_M0_TwoClassLabel.docx`, Section 3.2). This service will
never invent a Hard prediction.

## Calling it from Next.js

Server-side only (an API route, not client-side fetch) — this service has no
auth and should not be reachable from the browser. Example from within an
API route:

```js
const res = await fetch(`${process.env.RF_SERVICE_URL}/predict`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    correctness_rate, runtime_ms, attempts, complexity_score, prev_difficulty_ord,
  }),
});
if (!res.ok) {
  // handle 422 (bad input) / 503 (model not loaded) distinctly if useful
}
const { difficulty, warning } = await res.json();
```

## Open items — not decided here

- **No auth.** Fine for local dev; before this is reachable from anywhere
  but localhost, it needs at minimum a shared-secret header or network-level
  restriction. Not built, since deployment topology isn't decided yet.
- **Single model, process-lifetime.** A new model means restarting the
  service — there's no hot-reload. Fine for M0; worth revisiting once
  M1/M2/M3 start rotating in during Group 1+.
