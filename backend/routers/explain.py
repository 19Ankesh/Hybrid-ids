"""Explainability router — SHAP values for individual alerts"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db_models import Alert
from backend.schemas.schemas import ExplainResponse
from backend.services.auth_service import get_current_user

router = APIRouter()


@router.get("/{alert_id}", response_model=ExplainResponse)
def explain_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    shap_vals = alert.shap_values or {}

    # Sort by absolute value for top features
    top_features = sorted(
        [{"feature": k, "shap": v, "abs": abs(v)} for k, v in shap_vals.items()],
        key=lambda x: x["abs"],
        reverse=True,
    )[:10]

    return ExplainResponse(
        alert_id=alert.id,
        attack_type=alert.attack_type,
        anomaly_score=alert.anomaly_score,
        feature_contributions=shap_vals,
        top_features=top_features,
    )
