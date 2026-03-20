#!/bin/bash

# PentestManager Pro - Start Script
# Starts the existing containers without rebuilding or deleting data.

# Ensure we are in the script's directory
cd "$(dirname "$0")"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect Docker Compose command
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command_exists docker-compose; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "[X] Error: Cannot find 'docker compose' or 'docker-compose'."
    exit 1
fi

echo "[+] Starting PentestManager Pro..."

# use 'up -d' which starts containers. 
# It will create them if they don't exist, or start them if they are stopped.
# It will NOT rebuild images unless --build is passed (which we are strictly avoiding here).
sudo $DOCKER_COMPOSE_CMD -f docker-compose.yml up -d

echo ""
echo "=========================================="
echo "   APPLICATION STARTED"
echo "=========================================="
echo "Frontend: http://localhost"
echo "Backend API: http://localhost/api"
echo ""
