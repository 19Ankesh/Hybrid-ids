"""Authentication router"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db_models import User, Log
from backend.schemas.schemas import RegisterRequest, LoginRequest, TokenResponse
from backend.services.auth_service import (
    hash_password, verify_password, create_access_token, get_current_user
)

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(
        (User.username == req.username) | (User.email == req.email)
    ).first():
        raise HTTPException(status_code=400, detail="Username or email already exists")

    user = User(
        username=req.username,
        email=req.email,
        password=hash_password(req.password),
        role=req.role.value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(Log(user_id=user.id, action="REGISTER", detail=f"New user: {req.username}"))
    db.commit()

    token = create_access_token({"sub": user.username, "role": user.role, "id": user.id})
    return TokenResponse(access_token=token, role=user.role, username=user.username)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    db.add(Log(user_id=user.id, action="LOGIN", detail=f"User logged in: {req.username}"))
    db.commit()

    token = create_access_token({"sub": user.username, "role": user.role, "id": user.id})
    return TokenResponse(access_token=token, role=user.role, username=user.username)


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user
