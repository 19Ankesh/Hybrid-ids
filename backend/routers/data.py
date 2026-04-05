"""Data router — alerts, logs, stats"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime, timedelta
import random

from backend.database import get_db
from backend.models.db_models import Alert, Log
from backend.schemas.schemas import AlertOut, LogOut, StatsResponse
from backend.services.auth_service import get_current_user, require_admin
from backend.services.ml_service import get_feature_importance

router = APIRouter()


@router.get("/alerts", response_model=List[AlertOut])
def get_alerts(
    skip: int = 0,
    limit: int = Query(100, le=500),
    severity: str = None,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    q = db.query(Alert)
    if severity:
        q = q.filter(Alert.severity == severity)
    return q.order_by(Alert.timestamp.desc()).offset(skip).limit(limit).all()


@router.get("/logs", response_model=List[LogOut])
def get_logs(
    skip: int = 0,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return db.query(Log).order_by(Log.timestamp.desc()).offset(skip).limit(limit).all()


@router.get("/stats", response_model=StatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    alerts = db.query(Alert).all()

    if not alerts:
        # Return demo stats when no real data exists
        return _demo_stats()

    total_alerts    = len(alerts)
    total_anomalies = sum(1 for a in alerts if a.anomaly_score < 0)

    attack_dist: dict = {}
    severity_counts = {"Low": 0, "Medium": 0, "High": 0}
    for a in alerts:
        attack_dist[a.attack_type] = attack_dist.get(a.attack_type, 0) + 1
        severity_counts[a.severity] = severity_counts.get(a.severity, 0) + 1

    # Hourly timeline (last 24 hours)
    now = datetime.utcnow()
    hourly: dict = {}
    for i in range(24):
        h = (now - timedelta(hours=23 - i)).strftime("%H:00")
        hourly[h] = 0
    for a in alerts:
        if a.timestamp:
            h = a.timestamp.strftime("%H:00")
            if h in hourly:
                hourly[h] += 1
    hourly_timeline = [{"hour": k, "count": v} for k, v in hourly.items()]

    anomaly_scores = [round(a.anomaly_score, 4) for a in alerts[-200:]]
    risk_scores    = [round(a.risk_score, 2)    for a in alerts[-200:]]

    return StatsResponse(
        total_alerts=total_alerts,
        total_anomalies=total_anomalies,
        attack_distribution=attack_dist,
        severity_counts=severity_counts,
        hourly_timeline=hourly_timeline,
        feature_importance=get_feature_importance(),
        anomaly_scores=anomaly_scores,
        risk_scores=risk_scores,
    )


def _demo_stats() -> StatsResponse:
    """Return realistic-looking demo statistics."""
    random.seed(42)
    attack_dist = {
        "BENIGN": 1240, "DoS Hulk": 312, "PortScan": 198,
        "DDoS": 145, "FTP-Patator": 67, "Bot": 34,
        "DoS GoldenEye": 89, "SSH-Patator": 45,
    }
    severity_counts = {"Low": 1450, "Medium": 512, "High": 168}
    hourly_timeline = [
        {"hour": f"{h:02d}:00", "count": random.randint(10, 120)}
        for h in range(24)
    ]
    anomaly_scores = [round(random.uniform(-0.4, 0.3), 4) for _ in range(100)]
    risk_scores    = [round(random.uniform(5, 95), 2)    for _ in range(100)]

    return StatsResponse(
        total_alerts=2130,
        total_anomalies=680,
        attack_distribution=attack_dist,
        severity_counts=severity_counts,
        hourly_timeline=hourly_timeline,
        feature_importance=get_feature_importance(),
        anomaly_scores=anomaly_scores,
        risk_scores=risk_scores,
    )
