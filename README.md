# 🛡️ Hybrid Intrusion Detection System
### XGBoost + Isolation Forest | FastAPI + React | Final Year Major Project

---

## 📋 Table of Contents
1. [Architecture](#architecture)
2. [Project Structure](#project-structure)
3. [Features](#features)
4. [Quick Start](#quick-start)
5. [Manual Setup](#manual-setup)
6. [API Reference](#api-reference)
7. [ML Pipeline](#ml-pipeline)
8. [SHAP Explainability](#shap-explainability)
9. [Demo Credentials](#demo-credentials)

---

## 🏗️ Architecture

```
                        ┌─────────────────────────────────────┐
                        │           React Frontend             │
                        │  Login │ Register │ Dashboard        │
                        │  Charts │ Alerts │ SHAP Explain      │
                        └──────────────┬──────────────────────┘
                                       │  HTTP/REST (JWT)
                        ┌──────────────▼──────────────────────┐
                        │          FastAPI Backend             │
                        │                                      │
                        │  /auth/login    /auth/register       │
                        │  /detect/       /detect/upload-csv   │
                        │  /data/alerts   /data/stats          │
                        │  /explain/{id}                       │
                        └──────────┬──────────────┬───────────┘
                                   │              │
               ┌───────────────────▼──┐   ┌──────▼──────────────┐
               │    ML Inference      │   │    PostgreSQL DB      │
               │                      │   │                      │
               │  ┌────────────────┐  │   │  users               │
               │  │ Isolation      │  │   │  alerts              │
               │  │ Forest         │◄─┤   │  logs                │
               │  │ (anomaly score)│  │   └──────────────────────┘
               │  └────────────────┘  │
               │  ┌────────────────┐  │
               │  │ XGBoost        │  │
               │  │ Classifier     │  │
               │  │ (attack type)  │  │
               │  └────────────────┘  │
               │  ┌────────────────┐  │
               │  │ SHAP           │  │
               │  │ Explainer      │  │
               │  └────────────────┘  │
               └──────────────────────┘
```

### Detection Flow
```
Input Features
     │
     ▼
Preprocessing (StandardScaler)
     │
     ├──────────────────────────────►  Isolation Forest
     │                                      │
     │                               Anomaly Score
     │                               is_anomaly flag
     │
     ├──────────────────────────────►  XGBoost Classifier
     │                                      │
     │                               Attack Type + Probability
     │
     ▼
Risk Score = f(anomaly_score, attack_prob)
     │
     ▼
Severity Label (Low / Medium / High)
     │
     ├── Store in PostgreSQL (alerts table)
     │
     └── SHAP Values → stored in alert.shap_values (JSON)
```

---

## 📁 Project Structure

```
hybrid-ids/
├── backend/                  ← FastAPI application
│   ├── main.py               ← App entry point + CORS
│   ├── database.py           ← SQLAlchemy setup
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── models/
│   │   └── db_models.py      ← User, Alert, Log ORM models
│   ├── schemas/
│   │   └── schemas.py        ← Pydantic request/response schemas
│   ├── routers/
│   │   ├── auth.py           ← /auth/register, /auth/login
│   │   ├── detection.py      ← /detect/, /detect/upload-csv, simulate
│   │   ├── data.py           ← /data/alerts, /data/logs, /data/stats
│   │   └── explain.py        ← /explain/{id}
│   └── services/
│       ├── auth_service.py   ← JWT + bcrypt utilities
│       └── ml_service.py     ← Model loading + inference + SHAP
│
├── frontend/                 ← React application
│   ├── public/index.html
│   ├── package.json
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── App.js
│       ├── index.js
│       ├── context/
│       │   └── AuthContext.js
│       ├── utils/
│       │   └── api.js        ← Axios instance + JWT interceptor
│       └── pages/
│           ├── Login.js
│           ├── Register.js
│           └── Dashboard.js  ← All charts + detection + SHAP
│
├── ml/
│   └── training/
│       └── train_models.py   ← Full ML pipeline
│
├── models/                   ← Saved .pkl files (git-ignored)
│   ├── isolation_forest.pkl
│   ├── xgboost.pkl
│   ├── scaler.pkl
│   ├── label_encoder.pkl
│   ├── shap_explainer.pkl
│   ├── feature_importance.pkl
│   └── feature_cols.pkl
│
├── dataset/                  ← Place cicids2017.csv here (optional)
├── docker-compose.yml
├── setup.sh
└── README.md
```

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔀 Hybrid Detection | Combines Isolation Forest + XGBoost |
| 🔐 JWT Auth | Access + refresh tokens, bcrypt passwords |
| 👥 RBAC | Admin (full access) + Analyst (detect + view) |
| 🚨 Alert Severity | Auto-labelled Low / Medium / High |
| 📤 CSV Upload | Bulk detection from CICIDS-format CSV |
| 💣 Simulation | One-click DoS + Anomaly simulation |
| 🔬 SHAP | Per-alert feature attribution explanations |
| 📈 5 Chart Types | Line, Bar, Pie, Doughnut, Area |
| 🔄 Auto-refresh | Dashboard polls every 15 seconds |

---

## 🚀 Quick Start (Docker)

```bash
git clone <your-repo>
cd hybrid-ids

# Train models first (requires Python)
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cd ml/training && python train_models.py && cd ../..

# Start everything
docker-compose up --build
```

Open **http://localhost:3000**

---

## 🔧 Manual Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 14+

### Step 1 — Database
```sql
-- Run in psql
CREATE DATABASE hybrid_ids;
CREATE USER ids_user WITH PASSWORD 'ids_password';
GRANT ALL PRIVILEGES ON DATABASE hybrid_ids TO ids_user;
```

### Step 2 — Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Set environment variables (optional — defaults work locally)
export DATABASE_URL="postgresql://ids_user:ids_password@localhost:5432/hybrid_ids"
export SECRET_KEY="your-secret-key"

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Step 3 — Train ML Models
```bash
# From project root
source backend/.venv/bin/activate
cd ml/training
python train_models.py
# Models saved to ./models/
```

### Step 4 — Frontend
```bash
cd frontend
npm install
REACT_APP_API_URL=http://localhost:8000 npm start
```

### Step 5 — (Optional) Use CICIDS 2017 Dataset
```bash
# Download from: https://www.unb.ca/cic/datasets/ids-2017.html
# Place any CSV file in ./dataset/cicids2017.csv
# Re-run train_models.py
```

---

## 📡 API Reference

### Authentication
```
POST /auth/register   { username, email, password, role }  → token
POST /auth/login      { username, password }               → token
GET  /auth/me                                              → user info
```

### Detection
```
POST /detect/             { features: {col: val, ...} }  → alert
POST /detect/upload-csv   multipart CSV file             → bulk results
POST /detect/simulate-dos                                → alert
POST /detect/simulate-anomaly                            → alert
```

### Data
```
GET /data/alerts?severity=High&limit=50  → [alerts]
GET /data/logs                           → [logs] (admin)
GET /data/stats                          → stats object
```

### Explainability
```
GET /explain/{alert_id}  → { feature_contributions, top_features, ... }
```

### Interactive Docs
`http://localhost:8000/docs` — Full Swagger UI

---

## 🤖 ML Pipeline

### Isolation Forest
- Unsupervised anomaly detection
- Contamination: 15%
- 200 estimators
- Score < -0.1 → flagged as anomaly

### XGBoost Classifier
- Multi-class classification (15 attack types)
- 300 estimators, max_depth=6
- Features: 20 CICIDS network flow features

### Risk Score Formula
```
risk = 0.45 * norm_anomaly_score + 0.45 * attack_probability + 0.1 * attack_penalty
risk = min(risk * 100, 100)

Severity:  risk ≥ 70 → High | risk ≥ 40 → Medium | else → Low
```

---

## 🔬 SHAP Explainability

```python
# How SHAP works in this system
explainer   = shap.TreeExplainer(xgb_model)
shap_values = explainer.shap_values(X_instance)

# Positive SHAP → pushes prediction toward attack
# Negative SHAP → pushes prediction toward benign

# Stored per-alert in PostgreSQL as JSON
# Returned via GET /explain/{id}
```

The dashboard renders:
- Horizontal bar chart coloured red (attack) / blue (benign)
- Table of top 10 contributing features with direction arrows

---

## 🔑 Demo Credentials

| Username | Password | Role |
|----------|----------|------|
| admin    | admin123 | admin (all access + logs) |
| analyst  | analyst123 | analyst (detect + view) |

*Create these via POST /auth/register or the Register page.*

---

## 🎓 Academic Notes

This project demonstrates:
1. **Ensemble learning** — combining unsupervised (IF) with supervised (XGBoost)
2. **Explainable AI** — SHAP values for model interpretability
3. **Full-stack ML deployment** — FastAPI + React + PostgreSQL
4. **Security engineering** — JWT RBAC, bcrypt, CORS
5. **Data engineering** — CICIDS feature preprocessing pipeline

**References**
- CICIDS 2017: Sharafaldin et al., *Toward Generating a New Intrusion Detection Dataset*, ICISSP 2018
- XGBoost: Chen & Guestrin, *XGBoost: A Scalable Tree Boosting System*, KDD 2016
- Isolation Forest: Liu et al., *Isolation Forest*, ICDM 2008
- SHAP: Lundberg & Lee, *A Unified Approach to Interpreting Model Predictions*, NeurIPS 2017
