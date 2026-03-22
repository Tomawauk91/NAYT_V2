#!/bin/bash
# NAYT - Toolbox Deployment Script
# This script will install missing dependencies (Docker) and start the environment.

echo "=================================================="
echo "  Deploying NAYT - Toolbox"
echo "=================================================="

# Ensure script is run from project root
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Check Docker Installation
if ! command -v docker &> /dev/null; then
    echo "[*] Docker is not installed. Attempting to install Docker..."
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        rm get-docker.sh
    else
        echo "[!] Automatically installing Docker is only supported on Debian/Ubuntu/Kali based systems."
        echo "Please install Docker manually and rerun this script."
        exit 1
    fi
else
    echo "[+] Docker is already installed."
fi

# Check Docker Compose
DOCKER_COMPOSE_CMD=""
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
else
    echo "[*] Docker Compose not found. Attempting to install..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y docker-compose
        DOCKER_COMPOSE_CMD="docker-compose"
    else
        echo "[!] Please install Docker Compose manually."
        exit 1
    fi
fi

echo "[+] Using $DOCKER_COMPOSE_CMD"

# Optional: Add user to docker group if not there and not root? 
# Skipping to not break active sessions

echo "[*] Cleaning up old containers (if any)..."
$DOCKER_COMPOSE_CMD down 2>/dev/null

echo "[*] Building and Starting NAYT services in detached mode..."
$DOCKER_COMPOSE_CMD up --build -d

echo "=================================================="
echo "[+] NAYT is successfully deployed and running!"
echo "    -> Frontend (UI): http://localhost (or http://127.0.0.1:80)"
echo "    -> Backend API:   http://localhost:8000"
echo "=================================================="
echo "To view logs, run: $DOCKER_COMPOSE_CMD logs -f"
echo "To stop, run: ./scripts/stop.sh"
