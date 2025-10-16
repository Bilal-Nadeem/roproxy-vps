#!/bin/bash

# RoProxy Subdomain Setup Script
# This script adds SSL certificates for subdomains to your existing proxy setup

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}   RoProxy Subdomain SSL Setup${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    echo -e "${RED}Certbot is not installed. Please run the main setup.sh first.${NC}"
    exit 1
fi

# Get subdomain from user
echo -e "${YELLOW}Add SSL certificate for a subdomain${NC}"
echo ""
read -p "Enter the subdomain (e.g., api.roblox-proxy.starkrblx.com): " SUBDOMAIN

if [ -z "$SUBDOMAIN" ]; then
    echo -e "${RED}Subdomain cannot be empty${NC}"
    exit 1
fi

# Validate domain format
if [[ ! "$SUBDOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
    echo -e "${RED}Invalid domain format${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Checking DNS configuration...${NC}"

# Get server IP
SERVER_IP=$(curl -s ifconfig.me)
echo "Server IP: $SERVER_IP"

# Check if subdomain points to this server
SUBDOMAIN_IP=$(dig +short "$SUBDOMAIN" @8.8.8.8 | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n1)

if [ -z "$SUBDOMAIN_IP" ]; then
    echo -e "${RED}✗ DNS record not found for $SUBDOMAIN${NC}"
    echo -e "${YELLOW}Please add an A record:${NC}"
    echo "  Name: $(echo $SUBDOMAIN | sed 's/\.[^.]*\.[^.]*$//')"
    echo "  Value: $SERVER_IP"
    read -p "Continue anyway? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        exit 1
    fi
elif [ "$SUBDOMAIN_IP" != "$SERVER_IP" ]; then
    echo -e "${YELLOW}⚠ DNS points to $SUBDOMAIN_IP but server is $SERVER_IP${NC}"
    read -p "Continue anyway? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        exit 1
    fi
else
    echo -e "${GREEN}✓ DNS configured correctly: $SUBDOMAIN → $SUBDOMAIN_IP${NC}"
fi

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "Subdomain: $SUBDOMAIN"
echo ""
read -p "Proceed with SSL setup? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo -e "${RED}Setup cancelled${NC}"
    exit 1
fi

# Get Node.js port from existing config or use default
echo ""
echo -e "${YELLOW}Detecting Node.js port from existing configuration...${NC}"
NODE_PORT=3000
if [ -f "/etc/systemd/system/roproxy.service" ]; then
    DETECTED_PORT=$(grep "Environment=PORT=" /etc/systemd/system/roproxy.service | cut -d= -f3)
    if [ -n "$DETECTED_PORT" ]; then
        NODE_PORT=$DETECTED_PORT
        echo -e "${GREEN}✓ Detected port: $NODE_PORT${NC}"
    fi
else
    echo -e "${YELLOW}Using default port: $NODE_PORT${NC}"
fi

# Create Nginx configuration for subdomain
echo ""
echo -e "${GREEN}Creating Nginx configuration...${NC}"

NGINX_CONFIG="/etc/nginx/sites-available/$SUBDOMAIN"
cat > "$NGINX_CONFIG" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SUBDOMAIN;

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
ln -sf "$NGINX_CONFIG" "/etc/nginx/sites-enabled/$SUBDOMAIN"

# Test and reload Nginx
nginx -t && systemctl reload nginx || {
    echo -e "${RED}Nginx configuration test failed${NC}"
    rm -f "/etc/nginx/sites-enabled/$SUBDOMAIN"
    rm -f "$NGINX_CONFIG"
    exit 1
}

echo -e "${GREEN}✓ Nginx configuration created and enabled${NC}"

# Check if certificate already exists
echo ""
echo -e "${YELLOW}Checking for existing certificates...${NC}"
EXPAND_FLAG=""
if certbot certificates 2>/dev/null | grep -q "$SUBDOMAIN"; then
    echo -e "${YELLOW}Certificate already exists for $SUBDOMAIN - will renew it${NC}"
    EXPAND_FLAG="--force-renewal"
fi

# Obtain SSL certificate
echo ""
echo -e "${GREEN}Obtaining SSL certificate for $SUBDOMAIN...${NC}"

certbot --nginx -d "$SUBDOMAIN" --agree-tos --non-interactive --redirect $EXPAND_FLAG && {
    echo ""
    echo -e "${GREEN}==================================================${NC}"
    echo -e "${GREEN}   SSL Certificate Added Successfully! 🎉${NC}"
    echo -e "${GREEN}==================================================${NC}"
    echo ""
    echo -e "${GREEN}Your subdomain is now secured:${NC}"
    echo -e "${GREEN}  https://$SUBDOMAIN${NC}"
    echo ""
    echo -e "${YELLOW}Configuration:${NC}"
    echo "  Node.js Port: $NODE_PORT"
    echo "  Nginx Config: $NGINX_CONFIG"
    echo "  SSL Cert: /etc/letsencrypt/live/$SUBDOMAIN/"
    echo ""
    echo -e "${YELLOW}Certificate Details:${NC}"
    certbot certificates 2>/dev/null | grep -A 10 "$SUBDOMAIN" || echo "View all: certbot certificates"
    echo ""
    echo -e "${YELLOW}Note:${NC}"
    echo "  - Certificate auto-renews every 90 days"
    echo "  - No manual maintenance needed"
    echo "  - Proxies to localhost:$NODE_PORT"
    echo ""
    echo -e "${GREEN}Test your subdomain:${NC}"
    echo "  curl https://$SUBDOMAIN/health"
    echo ""
} || {
    echo ""
    echo -e "${RED}==================================================${NC}"
    echo -e "${RED}   SSL Certificate Setup Failed${NC}"
    echo -e "${RED}==================================================${NC}"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  1. Verify DNS is pointing to your server:"
    echo "     nslookup $SUBDOMAIN"
    echo ""
    echo "  2. Check if port 80/443 are accessible:"
    echo "     curl http://$SUBDOMAIN"
    echo ""
    echo "  3. Check Nginx logs:"
    echo "     tail -f /var/log/nginx/error.log"
    echo ""
    echo "  4. Verify Nginx config:"
    echo "     nginx -t"
    echo "     cat $NGINX_CONFIG"
    echo ""
    echo "  5. Try manual SSL setup:"
    echo "     certbot --nginx -d $SUBDOMAIN"
    echo ""
    
    # Cleanup on failure
    echo -e "${YELLOW}Cleaning up Nginx configuration...${NC}"
    rm -f "/etc/nginx/sites-enabled/$SUBDOMAIN"
    rm -f "$NGINX_CONFIG"
    systemctl reload nginx
    
    exit 1
}
