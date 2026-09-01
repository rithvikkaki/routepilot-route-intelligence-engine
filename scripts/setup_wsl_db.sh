#!/bin/bash
set -e
service postgresql start
service redis-server start
sudo -u postgres psql -c "CREATE USER routeos WITH PASSWORD 'routeos_dev_password' SUPERUSER;" || true
sudo -u postgres createdb -O routeos routeos || true
sudo -u postgres psql -d routeos -c "CREATE EXTENSION IF NOT EXISTS postgis;"
echo "Database and Redis configured successfully."