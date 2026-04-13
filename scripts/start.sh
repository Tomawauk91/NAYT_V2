#!/bin/bash
echo "Starting NAYT - Toolbox containers..."
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

DOCKER_COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "Docker compose is not installed."
    exit 1
fi

$DOCKER_COMPOSE_CMD start

echo "Application is running!"
echo "Frontend: http://localhost:80"
echo "Backend API: http://localhost:8000"
