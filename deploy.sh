#!/bin/bash

# PentestManager Pro - Containerized Deployment Script
# This script installs Docker and deploys the full stack (Frontend, Backend, Worker, DB).

set -e

echo "=========================================="
echo "   PENTEST MANAGER PRO - INSTALLER"
echo "=========================================="

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 1. Check and Install Docker
if command_exists docker; then
    echo "[+] Docker is already installed."
else
    echo "[+] Docker not found. Installing Docker..."
    
    # Generic logic for Kali or Ubuntu/Debian
    sudo apt-get update
    
    if grep -q "Kali" /etc/os-release; then
        echo "[!] Kali Linux detected. Installing docker.io..."
        sudo apt-get install -y docker.io docker-compose
    else
        echo "[+] Installing Docker via official script for convenience..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        rm get-docker.sh
    fi
    
    # Start Docker service
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # Add user to docker group
    sudo usermod -aG docker $USER
    echo "[!] Added user to docker group. You may need to relogin."
fi

# 2. Check Docker Compose
if docker compose version >/dev/null 2>&1; then
     echo "[+] Docker Compose detected."
elif command_exists docker-compose; then
     echo "[+] docker-compose detected."
else
     echo "[!] Docker Compose plugin missing. Trying to install..."
     sudo apt-get install -y docker-compose-plugin || sudo apt-get install -y docker-compose
fi

# 3. Build and Run
echo "[+] Building and Starting Containers..."

# Ensure we are in the script's directory
cd "$(dirname "$0")"

# Handle command difference
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command_exists docker-compose; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "[X] Error: Cannot find 'docker compose' or 'docker-compose'."
    exit 1
fi

# Explicitly specify the file to avoid ambiguity
if [ -f "docker-compose.yml" ]; then
    echo "[+] Found docker-compose.yml"
    sudo $DOCKER_COMPOSE_CMD -f docker-compose.yml up --build -d
else
    echo "[X] Error: docker-compose.yml not found in $(pwd)"
    exit 1
fi

echo "=========================================="
echo "   DEPLOYMENT SUCCESSFUL"
echo "=========================================="
echo "Frontend: http://localhost"
echo "Backend API: http://localhost/api"
echo "API Docs: http://localhost/api/docs"
echo ""
echo "To stop the app: sudo $DOCKER_COMPOSE_CMD down"
