#!/bin/bash
echo "Stopping NAYT - Toolbox..."
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

docker-compose down
echo "Application stopped."
