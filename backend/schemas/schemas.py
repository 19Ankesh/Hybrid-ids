"""Pydantic request/response schemas"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class RoleEnum(str, Enum):
    admin   = "admin"
    analyst = "analyst"


# ── Auth ───────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email:    EmailStr
    password: str = Field(..., min_length=6)
    role:     RoleEnum = RoleEnum.analyst

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str
    username:     str


# ── Detection ─────────────────────────────────────────────────────────────────
class DetectRequest(BaseModel):
    features: Dict[str, float] = Field(..., description="Feature name → value map")

class DetectResponse(BaseModel):
    alert_id:      int
    anomaly_score: float
    attack_type:   str
    risk_score:    float
    severity:      str
    is_anomaly:    bool
    timestamp:     datetime


# ── Alert ─────────────────────────────────────────────────────────────────────
class AlertOut(BaseModel):
    id:            int
    anomaly_score: float
    attack_type:   str
    risk_score:    float
    severity:      str
    timestamp:     datetime

    class Config:
        from_attributes = True


# ── Log ───────────────────────────────────────────────────────────────────────
class LogOut(BaseModel):
    id:        int
    user_id:   Optional[int]
    action:    str
    detail:    Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True


# ── Stats ─────────────────────────────────────────────────────────────────────
class StatsResponse(BaseModel):
    total_alerts:       int
    total_anomalies:    int
    attack_distribution: Dict[str, int]
    severity_counts:    Dict[str, int]
    hourly_timeline:    List[Dict[str, Any]]
    feature_importance: Dict[str, float]
    anomaly_scores:     List[float]
    risk_scores:        List[float]


# ── SHAP ──────────────────────────────────────────────────────────────────────
class ExplainResponse(BaseModel):
    alert_id:            int
    attack_type:         str
    anomaly_score:       float
    feature_contributions: Dict[str, float]
    top_features:        List[Dict[str, Any]]
