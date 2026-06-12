#!/bin/bash
set -euo pipefail
# NAYT - Toolbox Deployment Script
# This script will install missing dependencies (Docker) and start the environment.

echo "=================================================="
echo "  Deploying NAYT - Toolbox"
echo "=================================================="

# Détection de l'argument de reconstruction complète
HARD_REBUILD=false
if [ "${1:-}" = "--hard" ]; then
    HARD_REBUILD=true
    echo "[!] Mode reconstruction complète activé (--no-cache)."
fi

# Ensure script is run from project root
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

# Configuration des certificats SSL d'infrastructure
echo "[*] Configuration des certificats SSL d'infrastructure..."
mkdir -p frontend/nginx-certs
if command -v openssl &> /dev/null; then
    if [ ! -f frontend/nginx-certs/nginx.key ]; then
        echo "[*] Génération de nouveaux certificats SSL auto-signés (validité 365 jours)..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout frontend/nginx-certs/nginx.key \
            -out frontend/nginx-certs/nginx.crt \
            -subj "/C=FR/ST=IDF/L=Paris/O=NAYT/OU=Engineering/CN=localhost" 2>/dev/null
        echo "[+] Certificats SSL générés avec succès !"
    else
        echo "[+] Les certificats SSL existent déjà. Étape ignorée."
    fi
else
    echo "[!] Outil 'openssl' non identifié sur la machine hôte."
    if [ ! -f frontend/nginx-certs/nginx.key ]; then
        echo "[*] Création de secours de certificats vides pour que Nginx puisse démarrer..."
        touch frontend/nginx-certs/nginx.key frontend/nginx-certs/nginx.crt
    fi
fi

echo "[*] Full cleanup of running stack (containers + networks + project volumes)..."
$DOCKER_COMPOSE_CMD down --volumes --remove-orphans 2>/dev/null || true
docker rm -f NAYT-redis NAYT-db NAYT-backend NAYT-frontend NAYT-worker NAYT-ollama 2>/dev/null || true

if [ "$HARD_REBUILD" = true ]; then
    echo "[*] Removing previous local build images for a fresh rebuild..."
    docker image rm -f nayt_v2-backend nayt_v2-worker nayt_v2-frontend 2>/dev/null || true
    
    echo "[*] Pulling remote images (db/redis/ollama and any declared image services)..."
    $DOCKER_COMPOSE_CMD pull --ignore-pull-failures

    echo "[*] Rebuilding local services from scratch (no cache + pull latest base layers)..."
    $DOCKER_COMPOSE_CMD build --no-cache --pull
else
    echo "[*] Building local services using build cache (Fast Mode)..."
    $DOCKER_COMPOSE_CMD build
fi

echo "[*] Starting fresh containers (force recreate)..."
$DOCKER_COMPOSE_CMD up -d --force-recreate

echo "=================================================="
echo "[+] NAYT is successfully deployed and running!"
echo "    -> Frontend (UI): https://localhost (or https://127.0.0.1)"
echo "    -> Backend API:   https://localhost/api"
echo "    -> Swagger Docs:  https://localhost/api/docs"
echo "=================================================="
echo "To view logs, run: $DOCKER_COMPOSE_CMD logs -f"
echo "To stop, run: ./scripts/stop.sh"