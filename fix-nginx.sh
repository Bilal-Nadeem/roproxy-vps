#!/bin/bash

# Fix Nginx Configuration for Large Responses
# This script updates nginx to handle large API responses

set -e

echo "Fixing nginx configuration for large responses..."

# Backup current config
sudo cp /etc/nginx/sites-available/roproxy /etc/nginx/sites-available/roproxy.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ Backup created"

# Get the domain name from existing config
DOMAIN=$(sudo grep -oP '(?<=server_name )[^;]+' /etc/nginx/sites-available/roproxy | head -1 | xargs)
echo "✓ Domain: $DOMAIN"

# Check if SSL is configured
if sudo grep -q "listen 443" /etc/nginx/sites-available/roproxy; then
    HAS_SSL=true
    echo "✓ SSL detected"
else
    HAS_SSL=false
    echo "✓ No SSL detected"
fi

# Create new config
if [ "$HAS_SSL" = true ]; then
    # Config with SSL
    sudo bash -c "cat > /etc/nginx/sites-available/roproxy" <<'EOFNGINX'
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER;
    
    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;

    # SSL certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 0;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
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
EOFNGINX
else
    # Config without SSL
    sudo bash -c "cat > /etc/nginx/sites-available/roproxy" <<'EOFNGINX'
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER;

    client_max_body_size 0;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
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
EOFNGINX
fi

# Replace domain placeholder
sudo sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/roproxy

echo "✓ New config created"

# Test nginx configuration
echo ""
echo "Testing nginx configuration..."
if sudo nginx -t; then
    echo "✓ Nginx config is valid"
    
    # Reload nginx
    echo ""
    echo "Reloading nginx..."
    sudo systemctl reload nginx
    echo "✓ Nginx reloaded"
    
    echo ""
    echo "=========================================="
    echo "✓ Fix applied successfully!"
    echo "=========================================="
    echo ""
    echo "Test your proxy now:"
    echo "curl -H \"x-api-key: LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc\" \"https://$DOMAIN/catalog/v1/assets/2510233257/bundles?limit=100&sortOrder=Asc\""
    echo ""
else
    echo "✗ Nginx config test failed"
    echo "Restoring backup..."
    sudo cp /etc/nginx/sites-available/roproxy.backup.$(date +%Y%m%d)* /etc/nginx/sites-available/roproxy 2>/dev/null || true
    exit 1
fi

