#!/bin/bash
echo "Starting NAYT - Toolbox..."
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

docker-compose down 2>/dev/null
docker-compose up --build -d

echo "Application is running!"
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:8000"
