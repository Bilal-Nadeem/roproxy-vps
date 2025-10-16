#!/bin/bash

# RoProxy VPS Update Script
# This script updates your proxy server with the latest code from git

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}   RoProxy Update Script${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Determine project directory
if [ -d "/opt/roproxy" ]; then
    PROJECT_DIR="/opt/roproxy"
else
    PROJECT_DIR="$(dirname "$(readlink -f "$0")")"
fi

echo -e "${YELLOW}Project directory: $PROJECT_DIR${NC}"
cd "$PROJECT_DIR"

# Stop the service
echo ""
echo -e "${YELLOW}[1/5] Stopping roproxy service...${NC}"
if systemctl is-active --quiet roproxy; then
    systemctl stop roproxy
    echo -e "${GREEN}✓ Service stopped${NC}"
else
    echo -e "${YELLOW}Service was not running${NC}"
fi

# Backup current version
echo ""
echo -e "${YELLOW}[2/5] Creating backup...${NC}"
BACKUP_DIR="/opt/roproxy-backup-$(date +%Y%m%d-%H%M%S)"
cp -r "$PROJECT_DIR" "$BACKUP_DIR"
echo -e "${GREEN}✓ Backup created at: $BACKUP_DIR${NC}"

# Pull latest changes
echo ""
echo -e "${YELLOW}[3/5] Pulling latest changes from git...${NC}"
if [ -d ".git" ]; then
    git fetch origin
    git reset --hard origin/$(git rev-parse --abbrev-ref HEAD)
    echo -e "${GREEN}✓ Code updated${NC}"
else
    echo -e "${RED}Not a git repository. Please pull changes manually.${NC}"
    read -p "Have you updated the files manually? (y/n): " MANUAL_UPDATE
    if [ "$MANUAL_UPDATE" != "y" ] && [ "$MANUAL_UPDATE" != "Y" ]; then
        echo -e "${RED}Update cancelled${NC}"
        exit 1
    fi
fi

# Install/update dependencies
echo ""
echo -e "${YELLOW}[4/5] Installing dependencies...${NC}"
npm install --production
echo -e "${GREEN}✓ Dependencies updated${NC}"

# Restart the service
echo ""
echo -e "${YELLOW}[5/5] Starting roproxy service...${NC}"
systemctl start roproxy
sleep 2

# Verify service is running
if systemctl is-active --quiet roproxy; then
    echo -e "${GREEN}✓ Service started successfully${NC}"
else
    echo -e "${RED}✗ Service failed to start${NC}"
    echo -e "${YELLOW}Restoring from backup...${NC}"
    systemctl stop roproxy || true
    rm -rf "$PROJECT_DIR"/*
    cp -r "$BACKUP_DIR"/* "$PROJECT_DIR/"
    systemctl start roproxy
    echo -e "${RED}Update failed. Restored from backup.${NC}"
    echo -e "${YELLOW}Check logs: journalctl -u roproxy -n 50${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}   Update Complete! 🎉${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""
echo -e "${GREEN}Service Status:${NC}"
systemctl status roproxy --no-pager -l
echo ""
echo -e "${YELLOW}Backup kept at: $BACKUP_DIR${NC}"
echo -e "${YELLOW}To remove old backups: rm -rf /opt/roproxy-backup-*${NC}"
echo ""
