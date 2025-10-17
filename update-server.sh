#!/bin/bash

# Update and restart the proxy server

set -e

echo "Updating proxy server..."

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="/opt/roproxy"

# Copy updated files to server directory
echo "Copying updated files..."
sudo cp "$SCRIPT_DIR/server.js" "$PROJECT_DIR/"
sudo cp "$SCRIPT_DIR/package.json" "$PROJECT_DIR/"

# Install dependencies if package.json changed
echo "Installing dependencies..."
cd "$PROJECT_DIR"
sudo npm install --production

# Restart the service
echo "Restarting service..."
sudo systemctl restart roproxy

# Check status
sleep 2
if sudo systemctl is-active --quiet roproxy; then
    echo "✓ Service restarted successfully"
    echo ""
    echo "View logs with: sudo journalctl -u roproxy -f"
else
    echo "✗ Service failed to start"
    echo "Check logs: sudo journalctl -u roproxy -n 50"
    exit 1
fi

