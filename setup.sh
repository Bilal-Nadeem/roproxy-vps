#!/bin/bash

# RoProxy VPS Auto-Setup Script
# This script automates the installation and configuration of the Roblox proxy server
# with Nginx reverse proxy and SSL certificates

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}   RoProxy VPS Automated Setup Script${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Get configuration from user
echo -e "${YELLOW}Please provide the following information:${NC}"
echo ""

read -p "Enter your domain name (e.g., proxy.example.com): " DOMAIN
read -p "Enter your email for SSL certificate: " EMAIL
read -p "Enter the port for the Node.js server (default: 3000): " NODE_PORT
NODE_PORT=${NODE_PORT:-3000}

# Auto-detect wildcard DNS configuration
echo ""
echo -e "${YELLOW}Checking DNS configuration...${NC}"

# Extract base domain
if [[ $DOMAIN == *.*.* ]]; then
    BASE_DOMAIN=$(echo "$DOMAIN" | awk -F. '{print $(NF-1)"."$NF}')
else
    BASE_DOMAIN=$DOMAIN
fi

# Check if wildcard DNS exists
WILDCARD_IP=$(dig +short "wildcard-test-$(date +%s).$BASE_DOMAIN" @8.8.8.8 | head -n1)
SERVER_IP=$(curl -s ifconfig.me)

USE_WILDCARD="n"
if [ -n "$WILDCARD_IP" ] && [ "$WILDCARD_IP" = "$SERVER_IP" ]; then
    echo -e "${GREEN}✓ Wildcard DNS detected: *.$BASE_DOMAIN → $WILDCARD_IP${NC}"
    echo -e "${GREEN}✓ Matches server IP: $SERVER_IP${NC}"
    USE_WILDCARD="y"
    SSL_DOMAINS="-d $BASE_DOMAIN -d *.$BASE_DOMAIN"
    echo -e "${GREEN}Will obtain wildcard certificate for: $BASE_DOMAIN and *.$BASE_DOMAIN${NC}"
else
    echo -e "${YELLOW}⚠ No wildcard DNS detected${NC}"
    read -p "Do you want wildcard SSL anyway? (requires DNS validation) (y/n): " MANUAL_WILDCARD
    if [ "$MANUAL_WILDCARD" = "y" ] || [ "$MANUAL_WILDCARD" = "Y" ]; then
        USE_WILDCARD="y"
        SSL_DOMAINS="-d $BASE_DOMAIN -d *.$BASE_DOMAIN"
        echo -e "${YELLOW}Will obtain wildcard certificate for: $BASE_DOMAIN and *.$BASE_DOMAIN${NC}"
    else
        SSL_DOMAINS="-d $DOMAIN"
        echo -e "${YELLOW}Will obtain certificate for: $DOMAIN only${NC}"
    fi
fi

echo ""
echo -e "${GREEN}Configuration Summary:${NC}"
echo "Domain: $DOMAIN"
echo "Base Domain: $BASE_DOMAIN"
echo "SSL Configuration: $SSL_DOMAINS"
echo "Email: $EMAIL"
echo "Node.js Port: $NODE_PORT"
echo "Server IP: $SERVER_IP"
echo ""
read -p "Is this correct? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo -e "${RED}Setup cancelled.${NC}"
    exit 1
fi

# Clean up previous installation if exists
echo ""
echo -e "${YELLOW}Checking for previous installation...${NC}"

if systemctl is-active --quiet roproxy; then
    echo "Stopping existing roproxy service..."
    systemctl stop roproxy
fi

if systemctl is-enabled --quiet roproxy 2>/dev/null; then
    echo "Disabling existing roproxy service..."
    systemctl disable roproxy
fi

if [ -f /etc/systemd/system/roproxy.service ]; then
    echo "Removing old service file..."
    rm -f /etc/systemd/system/roproxy.service
    systemctl daemon-reload
fi

if [ -f /etc/nginx/sites-enabled/roproxy ]; then
    echo "Removing old Nginx configuration..."
    rm -f /etc/nginx/sites-enabled/roproxy
fi

if [ -f /etc/nginx/sites-available/roproxy ]; then
    rm -f /etc/nginx/sites-available/roproxy
fi

echo -e "${GREEN}✓ Cleanup complete${NC}"

# Update system
echo ""
echo -e "${GREEN}[1/8] Updating system packages...${NC}"
apt update && apt upgrade -y

# Install Node.js
echo ""
echo -e "${GREEN}[2/8] Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# Install Nginx
echo ""
echo -e "${GREEN}[3/8] Installing Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
fi
echo "Nginx version: $(nginx -v 2>&1)"

# Install Certbot for SSL
echo ""
echo -e "${GREEN}[4/8] Installing Certbot...${NC}"
if ! command -v certbot &> /dev/null; then
    apt install -y certbot python3-certbot-nginx
fi

# Create project directory
echo ""
echo -e "${GREEN}[5/8] Setting up project directory...${NC}"
PROJECT_DIR="/opt/roproxy"
mkdir -p $PROJECT_DIR
cp -r "$(dirname "$0")"/* $PROJECT_DIR/
cd $PROJECT_DIR

# Install dependencies
echo ""
echo -e "${GREEN}[6/8] Installing Node.js dependencies...${NC}"
npm install

# Configure Nginx
echo ""
echo -e "${GREEN}[7/8] Configuring Nginx...${NC}"

# Create Nginx configuration
cat > /etc/nginx/sites-available/roproxy <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # Allow large file uploads
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:$NODE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/roproxy /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t

# Restart Nginx
systemctl restart nginx
systemctl enable nginx

# Create systemd service for Node.js app
echo ""
echo -e "${GREEN}[8/8] Creating systemd service...${NC}"

cat > /etc/systemd/system/roproxy.service <<EOF
[Unit]
Description=RoProxy Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
Environment=PORT=$NODE_PORT
ExecStart=/usr/bin/node $PROJECT_DIR/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=roproxy

[Install]
WantedBy=multi-user.target
EOF

# Start the service
systemctl daemon-reload
systemctl enable roproxy
systemctl start roproxy

# Wait for the service to start
sleep 3

# Check if service is running
if systemctl is-active --quiet roproxy; then
    echo -e "${GREEN}✓ RoProxy service started successfully${NC}"
else
    echo -e "${RED}✗ Failed to start RoProxy service${NC}"
    echo "Check logs with: journalctl -u roproxy -f"
    exit 1
fi

# Obtain SSL certificate
echo ""
echo -e "${GREEN}Obtaining SSL certificate...${NC}"
echo -e "${YELLOW}Note: Make sure your domain DNS is pointing to this server's IP address${NC}"

if [ "$USE_WILDCARD" = "y" ] || [ "$USE_WILDCARD" = "Y" ]; then
    echo -e "${YELLOW}Wildcard certificates require DNS validation (not HTTP validation)${NC}"
    echo -e "${YELLOW}You will need to add a TXT record to your DNS${NC}"
fi

read -p "Press Enter to continue with SSL setup or Ctrl+C to cancel..."

# Try to obtain certificate
if [ "$USE_WILDCARD" = "y" ] || [ "$USE_WILDCARD" = "Y" ]; then
    # Wildcard requires DNS challenge
    certbot --nginx $SSL_DOMAINS --non-interactive --agree-tos --email $EMAIL --redirect --preferred-challenges dns || {
        echo -e "${RED}Automated wildcard SSL setup failed.${NC}"
        echo -e "${YELLOW}Please run manually: sudo certbot --nginx $SSL_DOMAINS${NC}"
        echo -e "${YELLOW}You'll need to add DNS TXT records as prompted.${NC}"
    }
else
    # Standard domain uses HTTP challenge
    certbot --nginx $SSL_DOMAINS --non-interactive --agree-tos --email $EMAIL --redirect
fi

echo ""
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}   Setup Complete! 🎉${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""
echo -e "${GREEN}Your Roblox proxy is now running at:${NC}"
echo -e "${GREEN}  https://$DOMAIN${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  Check service status:  systemctl status roproxy"
echo "  View logs:             journalctl -u roproxy -f"
echo "  Restart service:       systemctl restart roproxy"
echo "  Stop service:          systemctl stop roproxy"
echo "  Restart Nginx:         systemctl restart nginx"
echo ""
echo -e "${YELLOW}SSL Certificate:${NC}"
echo "  Certificates auto-renew via certbot"
echo "  Test renewal:          certbot renew --dry-run"
echo ""
echo -e "${GREEN}Test your proxy:${NC}"
echo "  curl https://$DOMAIN/health"
echo ""
