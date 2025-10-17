// Starkrblx Proxy - VPS Version

const express = require('express');
const fetch = require('node-fetch');

const app = express();

// Configuration
const ROUTING_MODE = "path";  // Options: "subdomain" or "path"
const API_KEY = "LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc";

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

// Main proxy handler
app.all('*', async (req, res) => {
    let robloxSubdomain;
    let targetPath;

    if (ROUTING_MODE === "subdomain") {
        // Subdomain mode: catalog.yourdomain.com -> catalog.roblox.com
        const parts = req.hostname.split('.');
        robloxSubdomain = parts[0];
        
        if (!robloxSubdomain || !domains.includes(robloxSubdomain)) {
            return res.status(400).json({ message: "Invalid subdomain" });
        }
        
        targetPath = req.path.substring(1);
    } else {
        // Path mode: yourdomain.com/catalog -> catalog.roblox.com
        const pathParts = req.path.split('/').filter(p => p);
        
        if (!pathParts[0] || !domains.includes(pathParts[0])) {
            return res.status(400).json({ message: "Invalid path. Use: /catalog/v1/..." });
        }
        
        robloxSubdomain = pathParts[0];
        targetPath = pathParts.slice(1).join("/");
    }

    // Prepare headers
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['roblox-id'];
    delete headers['user-agent'];
    delete headers['content-length'];
    delete headers['connection'];
    delete headers['x-api-key'];
    delete headers['authorization'];
    headers['user-agent'] = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const targetUrl = `https://${robloxSubdomain}.roblox.com/${targetPath}${queryString}`;

    try {
        const fetchOptions = {
            method: req.method,
            headers: headers,
        };

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = req.body;
        }

        const response = await fetch(targetUrl, fetchOptions);
        
        // Copy response headers
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        res.status(response.status);
        Object.keys(responseHeaders).forEach(key => {
            res.setHeader(key, responseHeaders[key]);
        });

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
    console.log(`Routing mode: ${ROUTING_MODE}`);
    console.log(`Authentication: Enabled`);
});
