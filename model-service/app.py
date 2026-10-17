import os
from collections import defaultdict
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_PATH = os.path.join(os.path.dirname(__file__), "loan_default_xgboost_model.pkl")

app = FastAPI(title="Loan Default Model Service", version="1.0.0")
model = None

NUMERIC_FIELDS = [
    "amount_usd", "annual_rate_pct", "term_months", "num_dependents",
    "months_at_employer", "monthly_income_usd", "existing_obligations",
    "age_at_approval",
]
CATEGORICAL_FIELDS = [
    "product_code", "payment_frequency", "loan_purpose", "client_gender",
    "marital_status", "employment_sector", "collateral_type",
    "disbursement_channel", "province",
]
ALL_FIELDS = NUMERIC_FIELDS + CATEGORICAL_FIELDS


@app.on_event("startup")
def _load_model():
    global model
    model = joblib.load(MODEL_PATH)
    print(f"[model] loaded {MODEL_PATH}")


@app.get("/health")
def health():
    return {"ok": True, "model_loaded": model is not None, "version": app.version}


class PredictInput(BaseModel):
    amount_usd: Optional[float] = None
    annual_rate_pct: Optional[float] = None
    term_months: Optional[float] = None
    payment_frequency: Optional[str] = None
    product_code: Optional[int] = None
    loan_purpose: Optional[str] = None
    client_gender: Optional[str] = None
    marital_status: Optional[str] = None
    num_dependents: Optional[float] = None
    employment_sector: Optional[str] = None
    months_at_employer: Optional[float] = None
    monthly_income_usd: Optional[float] = None
    existing_obligations: Optional[float] = None
    collateral_type: Optional[str] = None
    disbursement_channel: Optional[str] = None
    province: Optional[str] = None
    age_at_approval: Optional[float] = None


@app.post("/predict")
def predict(payload: PredictInput):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    try:
        df = pd.DataFrame([payload.model_dump()])
        proba = float(model.predict_proba(df)[0, 1])
        return {"ok": True, "probability": proba, "is_default": proba >= 0.5}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


def _norm_category(c):
    if isinstance(c, np.integer):
        return int(c)
    if isinstance(c, np.floating):
        return float(c)
    if isinstance(c, (int, float)):
        return c
    return str(c)


@app.get("/schema")
def schema():
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    preprocessor = model.named_steps["preprocessor"]
    out = {}
    for name, transformer, columns in preprocessor.transformers_:
        if name == "remainder" or transformer == "drop":
            continue
        encoder = transformer
        # If the transformer is a Pipeline, find the OneHotEncoder inside
        if hasattr(transformer, "steps"):
            encoder = None
            for _, step in transformer.steps:
                if hasattr(step, "categories_"):
                    encoder = step
                    break
        if encoder is not None and hasattr(encoder, "categories_"):
            for col, cats in zip(columns, encoder.categories_):
                out[str(col)] = [_norm_category(c) for c in cats]
    return {"ok": True, "categories": out, "numeric_fields": NUMERIC_FIELDS}

@app.get("/feature-importance")
def feature_importance():
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    preprocessor = model.named_steps["preprocessor"]
    classifier = model.named_steps["classifier"]
    try:
        names = list(preprocessor.get_feature_names_out())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"get_feature_names_out failed: {e}")
    importances = np.asarray(classifier.feature_importances_, dtype=float)
    if len(names) != len(importances):
        raise HTTPException(
            status_code=500,
            detail=f"length mismatch: names={len(names)} importances={len(importances)}",
        )
    total_by_field = defaultdict(float)
    for name, imp in zip(names, importances):
        matched = None
        if name.startswith("num__"):
            candidate = name[len("num__"):]
            if candidate in NUMERIC_FIELDS:
                matched = candidate
        elif name.startswith("cat__"):
            rest = name[len("cat__"):]
            for field in CATEGORICAL_FIELDS:
                if rest.startswith(field + "_"):
                    matched = field
                    break
        if matched:
            total_by_field[matched] += float(imp)
    data = [
        {"field": field, "importance": round(total_by_field.get(field, 0.0), 6)}
        for field in ALL_FIELDS
    ]
    data.sort(key=lambda x: -x["importance"])
    return {"ok": True, "feature_importance": data}