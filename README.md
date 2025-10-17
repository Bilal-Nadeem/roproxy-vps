# RoProxy - VPS Edition

Simple Roblox API proxy for VPS deployment with API authentication.

## Quick Setup

```bash
# Upload files to your VPS
cd /opt
sudo chmod +x setup.sh
sudo ./setup.sh
```

That's it! The script will:
- Install Node.js, Nginx, and Certbot
- Configure everything automatically
- Set up SSL certificates
- Start your proxy server

## Configuration

**API Key (Required)**
```
LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc
```

**Routing Mode**
- Default: `path` mode (`domain.com/catalog/v1/...`)
- Change in `server.js` if you want `subdomain` mode (`catalog.domain.com/v1/...`)

## Usage

### From curl
```bash
curl -H "x-api-key: LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc" \
  "https://yourdomain.com/catalog/v1/assets/2510233257/bundles?limit=100"
```

### From Roblox
```lua
local HttpService = game:GetService("HttpService")

local response = HttpService:RequestAsync({
    Url = "https://yourdomain.com/catalog/v1/assets/2510233257/bundles?limit=100",
    Method = "GET",
    Headers = {
        ["x-api-key"] = "LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc"
    }
})

if response.Success then
    local data = HttpService:JSONDecode(response.Body)
    print("Success:", data)
end
```

## Authentication

All requests require an API key via:
- `x-api-key` header, or
- `Authorization: Bearer <key>` header

**Missing key → 401 Unauthorized**  
**Invalid key → 403 Forbidden**

## Management

```bash
# View logs
sudo journalctl -u roproxy -f

# Restart service
sudo systemctl restart roproxy

# Check status
sudo systemctl status roproxy

# Restart nginx
sudo systemctl restart nginx
```

## Features

- ✅ API key authentication
- ✅ Path-based routing (default)
- ✅ SSL/HTTPS auto-configured
- ✅ Large response support (up to 2GB)
- ✅ Auto-restart on crash
- ✅ Simple configuration

## Supported Roblox APIs

All standard Roblox API subdomains:
`apis`, `assets`, `assetdelivery`, `avatar`, `badges`, `catalog`, `chat`, `contacts`, `contentstore`, `develop`, `economy`, `friends`, `games`, `groups`, `inventory`, `notifications`, `presence`, `search`, `thumbnails`, `trades`, `users`, etc.

## Examples

```bash
# Get user info
curl -H "x-api-key: YOUR_KEY" https://yourdomain.com/users/v1/users/1

# Search catalog
curl -H "x-api-key: YOUR_KEY" "https://yourdomain.com/catalog/v1/search/items?keyword=hat"

# Get thumbnails
curl -H "x-api-key: YOUR_KEY" "https://yourdomain.com/thumbnails/v1/users/avatar?userIds=1"
```

## Troubleshooting

**502 Bad Gateway**
```bash
sudo systemctl status roproxy
sudo journalctl -u roproxy -n 50
```

**SSL Issues**
```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

**Restart Everything**
```bash
sudo systemctl restart roproxy nginx
```

## License

Educational purposes. Comply with Roblox Terms of Service.
