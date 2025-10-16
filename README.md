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

That's it! Your proxy will be running at `https://yourdomain.com`

---

## 📋 Prerequisites

- **Ubuntu/Debian VPS** (20.04+ recommended)
- **Root or sudo access**
- **Domain name** with DNS pointing to your VPS IP
- **Port 80 and 443** open on your firewall

### DNS Setup (Before Running Setup)
Point your domain to your VPS:
- Add an **A record**: `@` or your subdomain → Your VPS IP address

Example:
```
Type: A
Name: proxy (or @ for root domain)
Value: 123.456.789.0 (your VPS IP)
TTL: 3600
```

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

## 🧪 Testing Your Proxy

### Health Check
```bash
curl https://yourdomain.com/health
```

### Test Roblox API Proxying
```bash
# Get Roblox user info
curl https://yourdomain.com/users/v1/users/1

# Search catalog
curl https://yourdomain.com/catalog/v1/search/items?keyword=hat
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

1. **Stop the service:**
   ```bash
   sudo systemctl stop roproxy
   ```

2. **Pull/upload new code**

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Restart the service:**
   ```bash
   sudo systemctl start roproxy
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
