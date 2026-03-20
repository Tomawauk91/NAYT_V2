#!/bin/bash

# PentestManager Pro - Stop Script
# Stops the running containers WITHOUT removing them.
# The container state (filesystem changes not in volumes) is preserved.

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

echo "[+] Stopping PentestManager Pro..."

# 'stop' simply halts the running containers.
# It does NOT remove them, change network settings, or delete volumes.
sudo $DOCKER_COMPOSE_CMD -f docker-compose.yml stop

echo ""
echo "=========================================="
echo "   APPLICATION STOPPED"
echo "=========================================="
echo "Containers are paused. Use start.sh to resume."
echo ""
