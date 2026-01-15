// Starkrblx Proxy - VPS Version (Path Mode) with Rotating Proxies

const express = require('express');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');

const app = express();

// Configuration
const API_KEY = "LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc";
const MAX_RETRIES = 3;  // Number of retry attempts
const REQUEST_TIMEOUT = 15000;  // Timeout in milliseconds (15 seconds)

// Load proxy configuration
const proxyConfig = JSON.parse(fs.readFileSync('./proxies.json', 'utf8'));
let connectionPool;
let currentConnectionIndex = 0;

if (proxyConfig.enabled) {
    // Create proxy agents
    const proxyAgents = proxyConfig.proxies.map(proxy => {
        const proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxy}`;
        return new HttpsProxyAgent(proxyUrl);
    });
    
    // Add null for direct connection (server's own IP)
    connectionPool = [...proxyAgents, null];
    console.log(`Loaded ${proxyAgents.length} proxies + 1 direct connection (${connectionPool.length} total)`);
} else {
    // Proxies disabled - use only direct connection
    connectionPool = [null];
    console.log('Proxy rotation disabled - using direct connection only');
}

// Function to get next connection (rotate through proxies + direct)
function getNextConnection() {
    const connection = connectionPool[currentConnectionIndex];
    currentConnectionIndex = (currentConnectionIndex + 1) % connectionPool.length;
    return connection;
}

// Retry function with automatic proxy fallback
async function fetchWithRetry(url, options) {
    let lastError;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Get next proxy in rotation for each attempt
            const agent = getNextConnection();
            const fetchOptions = {
                ...options,
                agent: agent,
                timeout: REQUEST_TIMEOUT,
            };
            
            const response = await fetch(url, fetchOptions);
            
            // Log successful connection after a retry
            if (attempt > 1) {
                console.log(`[Success] Request succeeded on attempt ${attempt}`);
            }
            
            return response; // Success!
            
        } catch (error) {
            lastError = error;
            console.log(`[Attempt ${attempt}/${MAX_RETRIES}] Failed - ${error.code || error.message.substring(0, 80)}`);
            
            // Don't delay on last attempt
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 300)); // Small delay before retry
            }
        }
    }
    
    // All retries failed
    console.log(`[Error] All ${MAX_RETRIES} attempts failed for ${url.substring(0, 100)}`);
    throw lastError;
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
        const fetchOptions = {
            method: req.method,
            headers: headers,
        };

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = req.body;
        }

        // Use retry logic with automatic proxy rotation on failure
        const response = await fetchWithRetry(targetUrl, fetchOptions);
        
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
    
    if (proxyConfig.enabled) {
        console.log(`Proxy Rotation: Enabled (${proxyConfig.proxies.length} proxies + 1 direct connection)`);
        console.log(`Total connection pool size: ${connectionPool.length}`);
    } else {
        console.log(`Proxy Rotation: Disabled (using direct connection only)`);
    }
});
