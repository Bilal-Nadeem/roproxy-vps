#!/bin/bash

# Simple RoProxy Setup Script

set -e

echo "============================================"
echo "  RoProxy VPS Setup"
echo "============================================"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Get config
read -p "Domain (e.g., proxy.example.com): " DOMAIN
read -p "Email for SSL: " EMAIL
read -p "Node.js port [3000]: " NODE_PORT
NODE_PORT=${NODE_PORT:-3000}

echo ""
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo "Port: $NODE_PORT"
echo ""
read -p "Continue? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
    exit 1
fi

# Install Node.js
echo ""
echo "Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "Node: $(node -v)"

# Install Nginx
echo ""
echo "Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
fi

# Install Certbot
echo ""
echo "Installing Certbot..."
if ! command -v certbot &> /dev/null; then
    apt install -y certbot python3-certbot-nginx
fi

# Setup project
echo ""
echo "Setting up project..."
PROJECT_DIR="/opt/roproxy"
mkdir -p $PROJECT_DIR
cp -r "$(dirname "$0")"/* $PROJECT_DIR/
cd $PROJECT_DIR
npm install

# Configure Nginx
echo ""
echo "Configuring Nginx..."

cat > /etc/nginx/sites-available/roproxy <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 0;

    location / {
        proxy_pass http://localhost:$NODE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        proxy_buffering on;
        proxy_buffer_size 256k;
        proxy_buffers 8 256k;
        proxy_busy_buffers_size 512k;
        proxy_max_temp_file_size 2048m;
    }
}
EOF

ln -sf /etc/nginx/sites-available/roproxy /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

# Create systemd service
echo ""
echo "Creating service..."

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

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable roproxy
systemctl start roproxy

sleep 2

if systemctl is-active --quiet roproxy; then
    echo "✓ Service started"
else
    echo "✗ Service failed"
    echo "Check logs: journalctl -u roproxy -n 50"
    exit 1
fi

# SSL
echo ""
echo "Setting up SSL..."
read -p "Press Enter to continue..."

certbot --nginx -d $DOMAIN --agree-tos --email $EMAIL --redirect --non-interactive || {
    echo "SSL failed. You can retry with: sudo certbot --nginx -d $DOMAIN"
}

echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "Your proxy: https://$DOMAIN"
echo ""
echo "Commands:"
echo "  Status:  systemctl status roproxy"
echo "  Logs:    journalctl -u roproxy -f"
echo "  Restart: systemctl restart roproxy"
echo ""
