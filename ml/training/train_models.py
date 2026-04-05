"""
Hybrid IDS - ML Training Script
Trains XGBoost (classifier) + Isolation Forest (anomaly detector)
Dataset: CICIDS 2017 (or synthetic fallback for demo)
"""

import os
import pickle
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import xgboost as xgb
import shap
import warnings
warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "..", "..", "models")
DATA_DIR   = os.path.join(BASE_DIR, "..", "..", "dataset")
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(DATA_DIR,   exist_ok=True)

# ── Feature columns (CICIDS 2017 subset) ──────────────────────────────────────
FEATURE_COLS = [
    "Destination Port", "Flow Duration", "Total Fwd Packets",
    "Total Backward Packets", "Total Length of Fwd Packets",
    "Total Length of Bwd Packets", "Fwd Packet Length Max",
    "Fwd Packet Length Min", "Fwd Packet Length Mean", "Fwd Packet Length Std",
    "Bwd Packet Length Max", "Bwd Packet Length Min", "Bwd Packet Length Mean",
    "Flow Bytes/s", "Flow Packets/s", "Flow IAT Mean", "Flow IAT Std",
    "Flow IAT Max", "Flow IAT Min", "Fwd IAT Total",
]

LABEL_COL = "Label"

ATTACK_CLASSES = [
    "BENIGN", "DoS Hulk", "PortScan", "DDoS",
    "DoS GoldenEye", "FTP-Patator", "SSH-Patator",
    "DoS slowloris", "DoS Slowhttptest", "Bot",
    "Web Attack – Brute Force", "Web Attack – XSS",
    "Infiltration", "Web Attack – Sql Injection", "Heartbleed",
]

# ── Synthetic dataset generator (fallback when CICIDS not present) ─────────────
def generate_synthetic_dataset(n_samples: int = 20_000) -> pd.DataFrame:
    """Generate a realistic synthetic network traffic dataset."""
    np.random.seed(42)
    rng = np.random.default_rng(42)

    n_benign  = int(n_samples * 0.65)
    n_attack  = n_samples - n_benign
    attack_types = ["DoS Hulk","PortScan","DDoS","DoS GoldenEye","FTP-Patator"]
    attack_labels = rng.choice(attack_types, size=n_attack)

    def make_traffic(n, is_attack=False):
        scale = 5 if is_attack else 1
        return {
            "Destination Port":           rng.integers(1, 65535, n),
            "Flow Duration":              rng.exponential(1e6 * scale, n),
            "Total Fwd Packets":          rng.integers(1, 500 * scale, n),
            "Total Backward Packets":     rng.integers(0, 300 * scale, n),
            "Total Length of Fwd Packets":rng.exponential(5000 * scale, n),
            "Total Length of Bwd Packets":rng.exponential(3000 * scale, n),
            "Fwd Packet Length Max":      rng.exponential(1500, n),
            "Fwd Packet Length Min":      rng.exponential(50,   n),
            "Fwd Packet Length Mean":     rng.exponential(500,  n),
            "Fwd Packet Length Std":      rng.exponential(200,  n),
            "Bwd Packet Length Max":      rng.exponential(1400, n),
            "Bwd Packet Length Min":      rng.exponential(40,   n),
            "Bwd Packet Length Mean":     rng.exponential(450,  n),
            "Flow Bytes/s":               rng.exponential(1e5 * scale, n),
            "Flow Packets/s":             rng.exponential(500  * scale, n),
            "Flow IAT Mean":              rng.exponential(1e5, n),
            "Flow IAT Std":               rng.exponential(5e4, n),
            "Flow IAT Max":               rng.exponential(5e5, n),
            "Flow IAT Min":               rng.exponential(1e3, n),
            "Fwd IAT Total":              rng.exponential(1e6, n),
        }

    benign_data  = make_traffic(n_benign,  is_attack=False)
    attack_data  = make_traffic(n_attack,  is_attack=True)

    benign_df  = pd.DataFrame(benign_data);  benign_df[LABEL_COL]  = "BENIGN"
    attack_df  = pd.DataFrame(attack_data);  attack_df[LABEL_COL]  = attack_labels

    df = pd.concat([benign_df, attack_df], ignore_index=True)
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    return df


# ── Data loading & cleaning ────────────────────────────────────────────────────
def load_data() -> pd.DataFrame:
    csv_path = os.path.join(DATA_DIR, "cicids2017.csv")
    if os.path.exists(csv_path):
        print(f"[INFO] Loading CICIDS 2017 from {csv_path}")
        df = pd.read_csv(csv_path, low_memory=False)
        df.columns = df.columns.str.strip()
        # Map common CICIDS label variants
        if " Label" in df.columns:
            df.rename(columns={" Label": LABEL_COL}, inplace=True)
    else:
        print("[INFO] CICIDS 2017 not found → generating synthetic dataset …")
        df = generate_synthetic_dataset(20_000)

    # ── Clean ──────────────────────────────────────────────────────────────────
    # Keep only required columns (available ones)
    available_features = [c for c in FEATURE_COLS if c in df.columns]
    df = df[available_features + [LABEL_COL]].copy()

    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df.dropna(inplace=True)

    # Clip extreme outliers
    for col in available_features:
        df[col] = df[col].clip(lower=df[col].quantile(0.001),
                               upper=df[col].quantile(0.999))

    print(f"[INFO] Dataset shape after cleaning: {df.shape}")
    print(f"[INFO] Label distribution:\n{df[LABEL_COL].value_counts()}\n")
    return df, available_features


# ── Preprocessing ──────────────────────────────────────────────────────────────
def preprocess(df: pd.DataFrame, feature_cols: list):
    le = LabelEncoder()
    y  = le.fit_transform(df[LABEL_COL])
    X  = df[feature_cols].astype(float)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"[INFO] Train size: {X_train.shape[0]} | Test size: {X_test.shape[0]}")
    return X_train, X_test, y_train, y_test, scaler, le


# ── Train Isolation Forest ─────────────────────────────────────────────────────
def train_isolation_forest(X_train):
    print("[INFO] Training Isolation Forest …")
    iso = IsolationForest(
        n_estimators=200,
        contamination=0.15,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    iso.fit(X_train)
    print("[INFO] Isolation Forest trained ✓")
    return iso


# ── Train XGBoost ──────────────────────────────────────────────────────────────
def train_xgboost(X_train, X_test, y_train, y_test, n_classes: int):
    print("[INFO] Training XGBoost classifier …")
    params = dict(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric="mlogloss",
        random_state=42,
        n_jobs=-1,
        objective="multi:softprob",
        num_class=n_classes,
    )
    xgb_model = xgb.XGBClassifier(**params)
    xgb_model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )

    y_pred = xgb_model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\n[RESULT] XGBoost Accuracy: {acc:.4f}")
    print("\n[RESULT] Classification Report:")
    print(classification_report(y_test, y_pred))
    return xgb_model


# ── Compute feature importance & SHAP ─────────────────────────────────────────
def compute_shap_explainer(xgb_model, X_train, feature_cols):
    print("[INFO] Computing SHAP explainer (this may take a moment) …")
    explainer   = shap.TreeExplainer(xgb_model)
    # Use a small sample for background
    bg_sample   = X_train[:500]
    shap_values = explainer.shap_values(bg_sample)

    # Mean absolute SHAP per feature — always produce scalar floats
    if isinstance(shap_values, list):
        importance = np.mean([np.abs(sv).mean(axis=0) for sv in shap_values], axis=0)
    elif shap_values.ndim == 3:
        # (n_samples, n_features, n_classes) — mean over samples and classes
        importance = np.abs(shap_values).mean(axis=(0, 2))
    else:
        importance = np.abs(shap_values).mean(axis=0)

    feat_importance = {col: float(v) for col, v in zip(feature_cols, importance.tolist())}
    print("[INFO] SHAP explainer computed ✓")
    return explainer, feat_importance


# ── Save artefacts ─────────────────────────────────────────────────────────────
def save_artifacts(iso, xgb_model, scaler, le, explainer, feat_importance, feature_cols):
    artifacts = {
        "isolation_forest": iso,
        "xgboost":          xgb_model,
        "scaler":           scaler,
        "label_encoder":    le,
        "shap_explainer":   explainer,
        "feature_importance": feat_importance,
        "feature_cols":     feature_cols,
    }
    for name, obj in artifacts.items():
        path = os.path.join(MODELS_DIR, f"{name}.pkl")
        with open(path, "wb") as f:
            pickle.dump(obj, f)
        print(f"[SAVED] {path}")
    print("\n[INFO] All models saved ✓")


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  Hybrid IDS — Model Training Pipeline")
    print("=" * 60)

    df, feature_cols = load_data()
    X_train, X_test, y_train, y_test, scaler, le = preprocess(df, feature_cols)

    iso       = train_isolation_forest(X_train)
    n_classes = len(le.classes_)
    xgb_model = train_xgboost(X_train, X_test, y_train, y_test, n_classes)
    explainer, feat_importance = compute_shap_explainer(xgb_model, X_train, feature_cols)

    save_artifacts(iso, xgb_model, scaler, le, explainer, feat_importance, feature_cols)

    print("\n[DONE] Training complete! Run the FastAPI backend to start the IDS.")


if __name__ == "__main__":
    main()
