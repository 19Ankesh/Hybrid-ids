"""
ML Inference Service
Loads trained models and provides prediction + SHAP explanations.
Falls back to demo mode if models not yet trained.
"""
import os, pickle, math
import numpy as np
from typing import Dict, Any, Tuple, List

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")

_cache: Dict[str, Any] = {}

def _load(name: str):
    if name not in _cache:
        path = os.path.join(MODELS_DIR, f"{name}.pkl")
        if os.path.exists(path):
            with open(path, "rb") as f:
                _cache[name] = pickle.load(f)
        else:
            _cache[name] = None
    return _cache[name]

def _models_available() -> bool:
    return all(
        os.path.exists(os.path.join(MODELS_DIR, f"{n}.pkl"))
        for n in ("isolation_forest", "xgboost", "scaler", "label_encoder", "feature_cols")
    )


# ── Risk score computation ─────────────────────────────────────────────────────
def compute_risk_score(anomaly_score: float, attack_prob: float, is_benign: bool) -> float:
    """
    Combines IF anomaly score and XGBoost attack probability into [0, 100].
    anomaly_score: from IF, negative = anomaly (range roughly -0.5 to 0.5)
    attack_prob:   P(attack class) from XGBoost [0, 1]
    """
    # Normalise anomaly score to [0, 1] (higher = more anomalous)
    norm_anomaly = max(0.0, min(1.0, (-anomaly_score + 0.5) / 1.0))
    benign_penalty = 0.0 if is_benign else 0.3
    risk = (0.45 * norm_anomaly + 0.45 * attack_prob + 0.1 * benign_penalty) * 100
    return round(min(risk, 100.0), 2)


def severity_label(risk_score: float) -> str:
    if risk_score >= 70:  return "High"
    if risk_score >= 40:  return "Medium"
    return "Low"


# ── Demo mode (no trained models) ─────────────────────────────────────────────
DEMO_FEATURE_COLS = [
    "Destination Port", "Flow Duration", "Total Fwd Packets",
    "Total Backward Packets", "Total Length of Fwd Packets",
    "Total Length of Bwd Packets", "Fwd Packet Length Max",
    "Fwd Packet Length Min", "Fwd Packet Length Mean", "Fwd Packet Length Std",
    "Bwd Packet Length Max", "Bwd Packet Length Min", "Bwd Packet Length Mean",
    "Flow Bytes/s", "Flow Packets/s", "Flow IAT Mean", "Flow IAT Std",
    "Flow IAT Max", "Flow IAT Min", "Fwd IAT Total",
]

DEMO_FEATURE_IMPORTANCE = {
    "Flow Bytes/s": 0.21, "Total Fwd Packets": 0.18, "Flow Duration": 0.15,
    "Flow Packets/s": 0.13, "Total Length of Fwd Packets": 0.10,
    "Fwd Packet Length Max": 0.07, "Destination Port": 0.06,
    "Bwd Packet Length Mean": 0.04, "Flow IAT Mean": 0.03,
    "Total Backward Packets": 0.03,
}

DEMO_ATTACK_TYPES = [
    "BENIGN","DoS Hulk","PortScan","DDoS","DoS GoldenEye",
    "FTP-Patator","SSH-Patator","Bot",
]

import random
def _demo_predict(features: Dict[str, float]) -> Tuple[float, str, float, str, bool, Dict]:
    random.seed(sum(features.values()) % 10000)
    anomaly_score  = round(random.uniform(-0.4, 0.3), 4)
    is_anomaly     = anomaly_score < -0.1
    attack_type    = random.choice(DEMO_ATTACK_TYPES) if is_anomaly else "BENIGN"
    attack_prob    = random.uniform(0.6, 0.95) if is_anomaly else random.uniform(0.02, 0.15)
    is_benign      = attack_type == "BENIGN"
    risk_score     = compute_risk_score(anomaly_score, attack_prob, is_benign)
    severity       = severity_label(risk_score)
    shap_vals      = {f: round(random.uniform(-0.5, 0.5), 4) for f in list(features.keys())[:10]}
    return anomaly_score, attack_type, risk_score, severity, is_anomaly, shap_vals


# ── Real prediction ────────────────────────────────────────────────────────────
def predict(features: Dict[str, float]) -> Tuple[float, str, float, str, bool, Dict]:
    if not _models_available():
        return _demo_predict(features)

    feature_cols = _load("feature_cols")
    scaler       = _load("scaler")
    iso          = _load("isolation_forest")
    xgb_model    = _load("xgboost")
    le           = _load("label_encoder")

    # Build feature vector as DataFrame to avoid sklearn feature-name warning
    import pandas as pd
    vec = pd.DataFrame([[features.get(col, 0.0) for col in feature_cols]], columns=feature_cols)
    vec_scaled = scaler.transform(vec)

    # Isolation Forest
    anomaly_score = float(iso.score_samples(vec_scaled)[0])
    is_anomaly    = iso.predict(vec_scaled)[0] == -1

    # XGBoost
    proba       = xgb_model.predict_proba(vec_scaled)[0]
    class_idx   = int(np.argmax(proba))
    attack_type = le.inverse_transform([class_idx])[0]
    attack_prob = float(proba[class_idx])

    is_benign   = attack_type == "BENIGN"
    risk_score  = compute_risk_score(anomaly_score, attack_prob, is_benign)
    severity    = severity_label(risk_score)

    # SHAP
    shap_vals = _compute_shap(vec_scaled, feature_cols, class_idx)

    return float(anomaly_score), str(attack_type), float(risk_score), str(severity), bool(is_anomaly), shap_vals


def _compute_shap(vec_scaled, feature_cols: List[str], class_idx: int) -> Dict[str, float]:
    try:
        explainer = _load("shap_explainer")
        if explainer is None:
            return {}
        sv = explainer.shap_values(vec_scaled)
        # sv shape: (n_samples, n_features, n_classes)  OR list of (n_samples, n_features)
        if isinstance(sv, list):
            # list of arrays, one per class
            vals = sv[class_idx][0]
        elif sv.ndim == 3:
            # (n_samples, n_features, n_classes)
            vals = sv[0, :, class_idx]
        elif sv.ndim == 2:
            # (n_samples, n_features) — single output or already sliced
            vals = sv[0]
        else:
            vals = sv
        return {col: round(float(v), 5) for col, v in zip(feature_cols, vals)}
    except Exception as e:
        print(f"[SHAP error] {e}")
        return {}


def get_feature_importance() -> Dict[str, float]:
    fi = _load("feature_importance")
    if not fi:
        return DEMO_FEATURE_IMPORTANCE
    # Ensure all values are plain Python floats (not numpy arrays/lists)
    result = {}
    for k, v in fi.items():
        if hasattr(v, '__iter__'):
            import numpy as np
            result[k] = float(np.mean(v))
        else:
            result[k] = float(v)
    return result
