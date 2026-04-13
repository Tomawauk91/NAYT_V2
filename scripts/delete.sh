#!/bin/bash
echo "Deleting NAYT - Toolbox from the machine..."
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

read -p "Are you sure you want to completely remove NAYT - Toolbox and all data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "Stopping containers and removing volumes..."
    $DOCKER_COMPOSE_CMD down -v --rmi all
    echo "Removing project directory: $DIR"
    cd ..
    rm -rf "$DIR"
    echo "Deletion complete."
else
    echo "Deletion cancelled."
fi
