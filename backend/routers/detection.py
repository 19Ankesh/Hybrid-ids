"""Detection router — single + bulk CSV"""
import io, csv
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db
from backend.models.db_models import Alert, Log
from backend.schemas.schemas import DetectRequest, DetectResponse
from backend.services.auth_service import get_current_user
from backend.services.ml_service import predict, DEMO_FEATURE_COLS

router = APIRouter()


def _store_alert(db, features, anomaly_score, attack_type, risk_score, severity, shap_vals):
    alert = Alert(
        anomaly_score=anomaly_score,
        attack_type=attack_type,
        risk_score=risk_score,
        severity=severity,
        raw_features=features,
        shap_values=shap_vals,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@router.post("/", response_model=DetectResponse)
def detect_single(
    req: DetectRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    anomaly_score, attack_type, risk_score, severity, is_anomaly, shap_vals = predict(req.features)
    alert = _store_alert(db, req.features, anomaly_score, attack_type, risk_score, severity, shap_vals)

    db.add(Log(
        user_id=current_user.get("id"),
        action="DETECT",
        detail=f"attack={attack_type} risk={risk_score:.1f}",
    ))
    db.commit()

    return DetectResponse(
        alert_id=alert.id,
        anomaly_score=float(anomaly_score),
        attack_type=attack_type,
        risk_score=float(risk_score),
        severity=severity,
        is_anomaly=bool(is_anomaly),
        timestamp=alert.timestamp,
    )


@router.post("/upload-csv")
async def detect_bulk(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted")

    content = await file.read()
    reader  = csv.DictReader(io.StringIO(content.decode("utf-8")))
    results = []

    for row in reader:
        try:
            features = {k.strip(): float(v) for k, v in row.items() if k.strip() in DEMO_FEATURE_COLS}
            if not features:
                continue
            anomaly_score, attack_type, risk_score, severity, is_anomaly, shap_vals = predict(features)
            alert = _store_alert(db, features, anomaly_score, attack_type, risk_score, severity, shap_vals)
            results.append({
                "alert_id": alert.id, "attack_type": attack_type,
                "risk_score": risk_score, "severity": severity, "is_anomaly": is_anomaly,
            })
        except Exception as e:
            results.append({"error": str(e), "row": dict(row)})

    db.add(Log(
        user_id=current_user.get("id"),
        action="BULK_UPLOAD",
        detail=f"Processed {len(results)} rows from {file.filename}",
    ))
    db.commit()

    return {"processed": len(results), "results": results}


# ── Simulation endpoints ───────────────────────────────────────────────────────
DOS_FEATURES = {
    "Destination Port": 80, "Flow Duration": 9999999,
    "Total Fwd Packets": 9000, "Total Backward Packets": 10,
    "Total Length of Fwd Packets": 9000000, "Total Length of Bwd Packets": 1000,
    "Fwd Packet Length Max": 1500, "Fwd Packet Length Min": 0,
    "Fwd Packet Length Mean": 1000, "Fwd Packet Length Std": 200,
    "Bwd Packet Length Max": 500, "Bwd Packet Length Min": 0,
    "Bwd Packet Length Mean": 250, "Flow Bytes/s": 9000000,
    "Flow Packets/s": 90000, "Flow IAT Mean": 100,
    "Flow IAT Std": 50, "Flow IAT Max": 500,
    "Flow IAT Min": 10, "Fwd IAT Total": 500000,
}

ANOMALY_FEATURES = {
    "Destination Port": 4444, "Flow Duration": 1,
    "Total Fwd Packets": 1, "Total Backward Packets": 0,
    "Total Length of Fwd Packets": 40, "Total Length of Bwd Packets": 0,
    "Fwd Packet Length Max": 40, "Fwd Packet Length Min": 40,
    "Fwd Packet Length Mean": 40, "Fwd Packet Length Std": 0,
    "Bwd Packet Length Max": 0, "Bwd Packet Length Min": 0,
    "Bwd Packet Length Mean": 0, "Flow Bytes/s": 40000000,
    "Flow Packets/s": 1000000, "Flow IAT Mean": 1,
    "Flow IAT Std": 0, "Flow IAT Max": 1,
    "Flow IAT Min": 1, "Fwd IAT Total": 0,
}


@router.post("/simulate-dos", response_model=DetectResponse)
def simulate_dos(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    anomaly_score, attack_type, risk_score, severity, is_anomaly, shap_vals = predict(DOS_FEATURES)
    alert = _store_alert(db, DOS_FEATURES, anomaly_score, attack_type, risk_score, severity, shap_vals)
    db.add(Log(user_id=current_user.get("id"), action="SIMULATE_DOS", detail="DoS simulation triggered"))
    db.commit()
    return DetectResponse(
        alert_id=alert.id, anomaly_score=float(anomaly_score),
        attack_type=attack_type, risk_score=float(risk_score),
        severity=severity, is_anomaly=bool(is_anomaly), timestamp=alert.timestamp,
    )


@router.post("/simulate-anomaly", response_model=DetectResponse)
def simulate_anomaly(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    anomaly_score, attack_type, risk_score, severity, is_anomaly, shap_vals = predict(ANOMALY_FEATURES)
    alert = _store_alert(db, ANOMALY_FEATURES, anomaly_score, attack_type, risk_score, severity, shap_vals)
    db.add(Log(user_id=current_user.get("id"), action="SIMULATE_ANOMALY", detail="Anomaly simulation triggered"))
    db.commit()
    return DetectResponse(
        alert_id=alert.id, anomaly_score=float(anomaly_score),
        attack_type=attack_type, risk_score=float(risk_score),
        severity=severity, is_anomaly=bool(is_anomaly), timestamp=alert.timestamp,
    )
