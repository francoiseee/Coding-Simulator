# ─── Codely RF inference service (FastAPI) ───────────────────────────────────
# Build context is the REPO ROOT (not inference_service/), because app.py
# imports ml/complexity.py and loads the model from ml_out/.
#   docker build -f inference_service/Dockerfile -t codely-inference .

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY inference_service/requirements.txt inference_service/requirements.txt
RUN pip install --no-cache-dir -r inference_service/requirements.txt

# Same layout as the repo, so app.py's sys.path/MODEL_DIR logic works unchanged.
COPY ml/ ml/
COPY inference_service/app.py inference_service/app.py
# Only the model + metadata pairs — student dataset CSVs stay out of the image.
COPY ml_out/model_*.joblib ml_out/metadata_*.json ml_out/

RUN useradd --create-home appuser
USER appuser
WORKDIR /app/inference_service
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
