#!/bin/bash
echo "Deleting PentestManager Pro from the machine..."
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

read -p "Are you sure you want to completely remove PentestManager Pro and all data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "Stopping containers and removing volumes..."
    docker-compose down -v --rmi all
    echo "Wait, if we delete the folder, this script stops executing correctly!"
    # The user might just want docker resources + the folder itself deleted.
    # It's better to just rm -rf the current directory from the parent.
    echo "Removing project directory: $DIR"
    cd ..
    rm -rf "$DIR"
    echo "Deletion complete."
else
    echo "Deletion cancelled."
fi
