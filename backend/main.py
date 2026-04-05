"""
Hybrid IDS — FastAPI Application Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from backend.database import engine, Base
from backend.routers import auth, detection, data, explain

# ── Create tables on startup ───────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="Hybrid IDS API",
    description="Intrusion Detection System using XGBoost + Isolation Forest",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/auth",    tags=["Authentication"])
app.include_router(detection.router, prefix="/detect",  tags=["Detection"])
app.include_router(data.router,      prefix="/data",    tags=["Data"])
app.include_router(explain.router,   prefix="/explain", tags=["Explainability"])

@app.get("/health")
def health():
    return {"status": "ok", "system": "Hybrid IDS v1.0"}
