#!/bin/bash
set -e
service postgresql start
service redis-server start

VENV_DIR="/root/routeos_venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python virtual environment at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
fi

echo "Installing requirements..."
$VENV_DIR/bin/pip install --upgrade pip
$VENV_DIR/bin/pip install -r /mnt/c/Users/victus/Downloads/RoutePilot/backend/requirements.txt

cd /mnt/c/Users/victus/Downloads/RoutePilot/backend
export PYTHONPATH=/mnt/c/Users/victus/Downloads/RoutePilot/backend
export DATABASE_URL="postgresql+asyncpg://routeos:routeos_dev_password@localhost:5432/routeos"
export DATABASE_URL_SYNC="postgresql+psycopg://routeos:routeos_dev_password@localhost:5432/routeos"
export REDIS_URL="redis://localhost:6379/0"
export SECRET_KEY="change-me-in-production-please-use-openssl-rand-hex-32"
export ENVIRONMENT="development"
export LOG_LEVEL="INFO"

echo "Running Alembic migrations..."
$VENV_DIR/bin/alembic upgrade head

echo "Seeding demo data..."
$VENV_DIR/bin/python -m scripts.seed_data || echo "Seed finished/skipped"

echo "Backend setup complete!"