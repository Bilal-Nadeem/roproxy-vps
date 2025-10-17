# RoProxy - VPS Setup Guide

## 🚀 Quick Setup (Automated)

**The easiest way to set up your proxy:**

1. **Upload the project files to your VPS**
2. **Make the setup script executable:**
   ```bash
   chmod +x setup.sh
   ```
3. **Run the automated setup:**
   ```bash
   sudo ./setup.sh
   ```

The script will:
- ✅ Install Node.js, Nginx, and Certbot
- ✅ Configure Nginx as a reverse proxy
- ✅ Set up SSL certificates (Let's Encrypt)
- ✅ Create a systemd service for auto-restart
- ✅ Configure firewall rules
- ✅ Start your proxy server

**You'll be prompted for:**
- Your domain name (e.g., proxy.example.com)
- Your email (for SSL certificate)
- Node.js port (default: 3000)

**Features:**
- ✅ **Single domain SSL** - Automatic HTTP validation (no manual steps)
- ✅ **Auto-renews forever** - No maintenance needed every 90 days
- ✅ **Idempotent** - Safe to run multiple times (cleans up old installations)
- ✅ **Executable by default** - No need to `chmod +x` after pulling from git

**Note:** For subdomains, you can set them up separately after the main setup, or use path-based routing instead.

That's it! Your proxy will be running at `https://yourdomain.com`

---

## 🌐 Adding Subdomains (Optional)

If you want to use subdomain-based routing (e.g., `api.roblox-proxy.starkrblx.com`, `cdn.roblox-proxy.starkrblx.com`), use the subdomain setup script:

### 1. Add DNS Record First

In your DNS provider (Cloudflare, etc.), add an A record:
```
Type: A
Name: api (or whatever subdomain you want)
Value: Your VPS IP
TTL: 3600
```

### 2. Run the Subdomain Script

```bash
sudo ./add-subdomain.sh
```

You'll be prompted for:
- The subdomain (e.g., `api.roblox-proxy.starkrblx.com`)

The script will:
- ✅ Verify DNS is configured correctly
- ✅ Obtain SSL certificate automatically
- ✅ Configure Nginx for the subdomain
- ✅ Set up auto-renewal

### 3. Add Multiple Subdomains

Run the script multiple times for different subdomains:
```bash
sudo ./add-subdomain.sh  # Add api.domain.com
sudo ./add-subdomain.sh  # Add cdn.domain.com
sudo ./add-subdomain.sh  # Add another one
```

Each subdomain gets its own SSL certificate that auto-renews!

---

## 📋 Prerequisites

- **Ubuntu/Debian VPS** (20.04+ recommended)
- **Root or sudo access**
- **Domain name** with DNS pointing to your VPS IP
- **Port 80 and 443** open on your firewall

### DNS Setup (Before Running Setup)
Point your domain to your VPS:

```
Type: A
Name: proxy (or @ for root domain)  
Value: 123.456.789.0 (your VPS IP)
TTL: 3600
```

**That's all you need!** Single domain SSL handles everything automatically.

---

## 🛠️ Manual Installation (Advanced)

If you prefer to install manually or customize the setup:

### 1. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

### 2. Install Nginx
```bash
sudo apt update
sudo apt install nginx -y
```

### 3. Install project dependencies
```bash
cd /path/to/roproxy-vps
npm install
```

### 4. Configure Nginx
Edit `/etc/nginx/sites-available/roproxy`:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/roproxy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. Setup SSL with Certbot
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

### 6. Create systemd service
Create `/etc/systemd/system/roproxy.service`:
```ini
[Unit]
Description=RoProxy Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/roproxy-vps
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node /path/to/roproxy-vps/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable roproxy
sudo systemctl start roproxy
```


---

## 🔧 Useful Commands

### Service Management
```bash
# Check service status
sudo systemctl status roproxy

# View live logs
sudo journalctl -u roproxy -f

# Restart the service
sudo systemctl restart roproxy

# Stop the service
sudo systemctl stop roproxy

# Start the service
sudo systemctl start roproxy
```

### Nginx Management
```bash
# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# View Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### SSL Certificate Management
```bash
# Check certificate status
sudo certbot certificates

# Renew certificates (auto-renews via cron)
sudo certbot renew

# Test renewal process
sudo certbot renew --dry-run
```

---

## 🔐 API Authentication

This proxy requires API key authentication. All requests must include a valid API key.

### How to Use the API Key

Include the API key in one of two ways:

**Option 1: Using x-api-key header**
```bash
curl -H "x-api-key: LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc" \
  https://yourdomain.com/users/v1/users/1
```

**Option 2: Using Authorization Bearer token**
```bash
curl -H "Authorization: Bearer LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc" \
  https://yourdomain.com/users/v1/users/1
```

### Error Responses

**Missing API key (401):**
```json
{
  "message": "API key required. Please provide 'x-api-key' header or 'Authorization: Bearer <key>' header."
}
```

**Invalid API key (403):**
```json
{
  "message": "Invalid API key."
}
```

---

## 🧪 Testing Your Proxy

### Routing Mode

The proxy is configured in **path mode** by default, which means:
- ✅ Use format: `https://yourdomain.com/catalog/v1/...`
- ✅ The Roblox API subdomain (catalog, users, etc.) is part of the path

If you prefer **subdomain mode** instead:
- Change `ROUTING_MODE` to `"subdomain"` in `server.js`
- Use format: `https://catalog.yourdomain.com/v1/...`
- Configure DNS A records for each subdomain you want to use

### Test Roblox API Proxying (with authentication)

**Get Roblox user info:**
```bash
curl -H "x-api-key: LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc" \
  https://yourdomain.com/users/v1/users/1
```

**Search catalog:**
```bash
curl -H "x-api-key: LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc" \
  https://yourdomain.com/catalog/v1/search/items?keyword=hat
```

**Get asset bundles:**
```bash
curl -H "x-api-key: LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc" \
  "https://yourdomain.com/catalog/v1/assets/2510233257/bundles?limit=100&sortOrder=Asc"
```

**Using Authorization Bearer:**
```bash
curl -H "Authorization: Bearer LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc" \
  https://yourdomain.com/users/v1/users/1
```

---

## 🐛 Troubleshooting

### Service won't start
```bash
# Check logs for errors
sudo journalctl -u roproxy -n 50

# Check if port is already in use
sudo netstat -tulpn | grep 3000

# Check if Node.js is installed
node -v
```

### SSL certificate issues
```bash
# Make sure your domain DNS is pointing to the server
nslookup yourdomain.com

# Check Nginx configuration
sudo nginx -t

# Try obtaining certificate again
sudo certbot --nginx -d yourdomain.com --force-renewal
```

### Setting up SSL for additional subdomains (optional)
If you need SSL for subdomains later:

**Easy way (recommended):**
```bash
sudo ./add-subdomain.sh
# Follow the prompts
```

**Manual way:**
```bash
# For a specific subdomain
sudo certbot --nginx -d subdomain.yourdomain.com
# This will also auto-renew
```

### Nginx errors
```bash
# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Verify Nginx is running
sudo systemctl status nginx

# Check configuration syntax
sudo nginx -t
```

### Can't connect to proxy
1. **Check firewall:**
   ```bash
   sudo ufw status
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

2. **Check if service is running:**
   ```bash
   sudo systemctl status roproxy
   sudo systemctl status nginx
   ```

3. **Check DNS:**
   ```bash
   nslookup yourdomain.com
   ```

---

## 🔄 Updating Your Proxy

### Automated Update (Recommended)

Simply run the update script:
```bash
sudo ./update.sh
```

The script will:
- ✅ Create a backup of your current installation
- ✅ Pull latest changes from git
- ✅ Update dependencies
- ✅ Restart the service
- ✅ Rollback automatically if update fails

### Manual Update

If you prefer to update manually:

1. **Navigate to project directory:**
   ```bash
   cd /opt/roproxy
   ```

2. **Stop the service:**
   ```bash
   sudo systemctl stop roproxy
   ```

3. **Pull latest changes:**
   ```bash
   git pull origin main
   ```

4. **Install dependencies:**
   ```bash
   npm install --production
   ```

5. **Restart the service:**
   ```bash
   sudo systemctl start roproxy
   ```

### Setup from Git (First Time)

If you want to use git for updates:

```bash
# On your server
cd /opt
git clone https://github.com/yourusername/roproxy.git roproxy
cd roproxy
sudo ./setup.sh
```

Then for updates, just run:
```bash
cd /opt/roproxy
sudo ./update.sh
```

---

## 📊 Monitoring

### View real-time logs
```bash
sudo journalctl -u roproxy -f
```

### Check system resources
```bash
# CPU and memory usage
htop

# Disk usage
df -h
```

### Check network connections
```bash
sudo netstat -tulpn | grep node
```

---

## 🔒 Security Recommendations

1. **Enable firewall:**
   ```bash
   sudo ufw enable
   sudo ufw allow 22/tcp  # SSH
   sudo ufw allow 80/tcp  # HTTP
   sudo ufw allow 443/tcp # HTTPS
   ```

2. **Keep system updated:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

3. **Use strong passwords** for your VPS

4. **Consider using SSH keys** instead of password authentication

5. **Monitor logs regularly** for suspicious activity

---

## 📝 Notes

- SSL certificates auto-renew via certbot's cron job
- The proxy runs as a systemd service and will auto-start on boot
- Logs are managed by systemd/journald
- Node.js version 20.x is recommended for best performance

---

## 🆘 Support

If you encounter issues:
1. Check the logs: `sudo journalctl -u roproxy -f`
2. Verify DNS is pointing to your server
3. Ensure ports 80 and 443 are open
4. Make sure your domain is correctly configured

---

## 📄 License

This proxy is for educational purposes. Ensure compliance with Roblox's Terms of Service.
