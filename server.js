// Starkrblx Proxy - VPS Version (Path Mode) with Rotating Proxies

const express = require('express');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');

const app = express();

// Configuration
const API_KEY = "LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc";

// Load proxy configuration
const proxyConfig = JSON.parse(fs.readFileSync('./proxies.json', 'utf8'));
const proxyAgents = proxyConfig.proxies.map(proxy => {
    const proxyUrl = `http://user-${proxyConfig.username}-country-${proxyConfig.country}:${proxyConfig.password}@${proxy}`;
    return new HttpsProxyAgent(proxyUrl);
});

// Add null for direct connection (server's own IP)
const connectionPool = [...proxyAgents, null];
let currentConnectionIndex = 0;

// Function to get next connection (rotate through proxies + direct)
function getNextConnection() {
    const connection = connectionPool[currentConnectionIndex];
    currentConnectionIndex = (currentConnectionIndex + 1) % connectionPool.length;
    return connection;
}

// List of allowed Roblox domains
const domains = [
    "apis", "assets", "assetdelivery", "avatar", "badges", "catalog",
    "chat", "contacts", "contentstore", "develop", "economy", "economycreatorstats",
    "followings", "friends", "games", "groups", "groupsmoderation", "inventory",
    "itemconfiguration", "locale", "notifications", "points", "presence",
    "privatemessages", "publish", "search", "thumbnails", "trades", "translations", "users"
];

// Middleware
app.use(express.json({ limit: '50gb' }));
app.use(express.raw({ type: '*/*', limit: '50gb' }));

// API Key Authentication
app.use((req, res, next) => {
    const providedKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!providedKey) {
        return res.status(401).json({ 
            message: "API key required. Use 'x-api-key' header or 'Authorization: Bearer <key>'" 
        });
    }
    
    if (providedKey !== API_KEY) {
        return res.status(403).json({ message: "Invalid API key" });
    }
    
    next();
});

// Main proxy handler - Path mode only
app.all('*', async (req, res) => {
    // Path mode: yourdomain.com/catalog/v1/... -> catalog.roblox.com/v1/...
    const pathParts = req.path.split('/').filter(p => p);
    
    if (!pathParts[0]) {
        return res.status(400).json({ 
            message: "Invalid path. Use format: /catalog/v1/..." 
        });
    }
    
    const robloxSubdomain = pathParts[0];
    
    if (!domains.includes(robloxSubdomain)) {
        return res.status(400).json({ 
            message: `Invalid API endpoint '${robloxSubdomain}'. Use: catalog, users, avatar, etc.` 
        });
    }
    
    const targetPath = pathParts.slice(1).join("/");

    // Prepare headers
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['roblox-id'];
    delete headers['user-agent'];
    delete headers['content-length'];
    delete headers['connection'];
    delete headers['x-api-key'];
    delete headers['authorization'];
    delete headers['accept-encoding']; // Let fetch handle compression
    headers['user-agent'] = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const targetUrl = `https://${robloxSubdomain}.roblox.com/${targetPath}${queryString}`;

    try {
        // Get next connection from the pool (rotates through proxies + direct)
        const agent = getNextConnection();
        
        const fetchOptions = {
            method: req.method,
            headers: headers,
            agent: agent, // Will be proxy agent or null (direct connection)
        };

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = req.body;
        }

        const response = await fetch(targetUrl, fetchOptions);
        
        // Only copy content-type header (like Cloudflare)
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.setHeader('content-type', contentType);
        }

        res.status(response.status);
        const body = await response.buffer();
        res.send(body);

    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ message: "Proxy request failed", error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
    console.log(`Mode: Path-based routing (e.g., /catalog/v1/...)`);
    console.log(`Authentication: Enabled`);
    console.log(`Proxy Rotation: Enabled (${proxyConfig.proxies.length} proxies + 1 direct connection)`);
    console.log(`Total connection pool size: ${connectionPool.length}`);
});
