#!/bin/bash
echo "Stopping PentestManager Pro..."
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

docker-compose down
echo "Application stopped."
