#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  Hybrid IDS — One-shot local setup script
#  Run: bash setup.sh
# ─────────────────────────────────────────────────────────────────

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo "  🛡️  Hybrid IDS — Setup Script"
echo "  ================================="
echo ""

# 1. Python virtual env
info "Creating Python virtual environment …"
python3 -m venv .venv || error "Python 3 not found"
source .venv/bin/activate
success "Virtual env active"

# 2. Backend deps
info "Installing backend dependencies …"
pip install -q --upgrade pip
pip install -q -r backend/requirements.txt
success "Backend dependencies installed"

# 3. ML training deps (superset of backend)
info "Training ML models (synthetic data — ~60s) …"
cd ml/training
python train_models.py
cd ../..
success "Models trained and saved to ./models/"

# 4. PostgreSQL check
info "Checking PostgreSQL …"
if command -v psql &>/dev/null; then
  psql -U postgres -c "CREATE DATABASE hybrid_ids;" 2>/dev/null || true
  psql -U postgres -c "CREATE USER ids_user WITH PASSWORD 'ids_password';" 2>/dev/null || true
  psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE hybrid_ids TO ids_user;" 2>/dev/null || true
  success "PostgreSQL configured"
else
  echo -e "${RED}[WARN]${NC}  PostgreSQL not found. Start it manually or use Docker Compose."
fi

# 5. Frontend deps
info "Installing frontend dependencies …"
cd frontend
npm install --silent
cd ..
success "Frontend dependencies installed"

echo ""
echo "  ✅  Setup complete!"
echo ""
echo "  Run the project:"
echo "    Terminal 1: source .venv/bin/activate && cd backend && uvicorn main:app --reload"
echo "    Terminal 2: cd frontend && npm start"
echo ""
echo "  Or with Docker:"
echo "    docker-compose up --build"
echo ""
echo "  API docs: http://localhost:8000/docs"
echo "  Frontend: http://localhost:3000"
echo ""
