// Starkrblx Proxy - VPS Version (Path Mode) with Rotating Proxies

const express = require('express');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');

const app = express();

// Configuration
const API_KEY = "LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc";
const MAX_RETRIES = 5;  // Number of retry attempts (increased for rate limits)
const REQUEST_TIMEOUT = 20000;  // Timeout in milliseconds (20 seconds)
const RATE_LIMIT_RETRY_DELAY = 100;  // Delay between 429 retries (ms)

// Load proxy configuration
const proxyConfig = JSON.parse(fs.readFileSync('./proxies.json', 'utf8'));

// Statistics tracking
let stats = {
    totalRequests: 0,
    rateLimitHits: 0,
    proxyFallbacks: 0,
    successfulRetries: 0,
    errors: 0,
    perIP: {
        direct: { requests: 0, rateLimits: 0, errors: 0, successes: 0 }
    }
};

// Initialize per-IP stats for each proxy
if (proxyConfig.enabled) {
    proxyConfig.proxies.forEach((proxy, index) => {
        stats.perIP[`proxy-${index}`] = { 
            ip: proxy, 
            requests: 0, 
            rateLimits: 0, 
            errors: 0, 
            successes: 0 
        };
    });
}
let connectionPool;
let currentConnectionIndex = 0;

if (proxyConfig.enabled) {
    // Create proxy agents (for fallback only)
    const proxyAgents = proxyConfig.proxies.map(proxy => {
        const proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxy}`;
        return new HttpsProxyAgent(proxyUrl);
    });
    
    connectionPool = proxyAgents;
    console.log(`Loaded ${proxyAgents.length} fallback proxies`);
    console.log(`Strategy: Direct connection first, proxy fallback on failure`);
} else {
    // Proxies disabled - use only direct connection
    connectionPool = [];
    console.log('Proxy fallback disabled - using direct connection only');
}

// Function to get next proxy from pool (used for fallback retries)
function getNextConnection() {
    if (connectionPool.length === 0) {
        return null; // No proxies available, use direct
    }
    const connection = connectionPool[currentConnectionIndex];
    currentConnectionIndex = (currentConnectionIndex + 1) % connectionPool.length;
    return connection;
}

// Retry function with proxy fallback strategy
// Strategy: Try direct connection first, fall back to proxies on failure or rate limits
async function fetchWithRetry(url, options, requestPath) {
    let lastError;
    let lastResponse;
    let agent;
    const startTime = Date.now();
    
    stats.totalRequests++;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        let ipKey;
        
        try {
            // Attempt 1: Always try direct connection first (fastest)
            // Attempts 2+: Use rotating proxies (fallback for rate limits)
            if (attempt === 1) {
                agent = null; // Direct connection
                ipKey = 'direct';
            } else if (proxyConfig.enabled) {
                const proxyIndex = currentConnectionIndex;
                agent = getNextConnection(); // Get next proxy
                ipKey = `proxy-${proxyIndex}`;
                stats.proxyFallbacks++;
            } else {
                agent = null; // No proxies available, retry direct
                ipKey = 'direct';
            }
            
            // Track request per IP
            if (stats.perIP[ipKey]) {
                stats.perIP[ipKey].requests++;
            }
            
            const fetchOptions = {
                ...options,
                agent: agent,
                timeout: REQUEST_TIMEOUT,
            };
            
            const response = await fetch(url, fetchOptions);
            
            // Check if we got rate limited or other retriable error
            const isRateLimited = response.status === 429;
            const shouldRetry = isRateLimited || 
                               response.status === 503 || 
                               response.status === 502;
            
            if (shouldRetry && attempt < MAX_RETRIES) {
                const connType = agent === null ? 'Direct' : `Proxy-${currentConnectionIndex}`;
                
                if (isRateLimited) {
                    stats.rateLimitHits++;
                    if (stats.perIP[ipKey]) {
                        stats.perIP[ipKey].rateLimits++;
                    }
                    console.log(`[RATE LIMIT] ${connType} - ${response.status} on ${requestPath} - Attempt ${attempt}/${MAX_RETRIES}`);
                } else {
                    if (stats.perIP[ipKey]) {
                        stats.perIP[ipKey].errors++;
                    }
                    console.log(`[${connType}] Got ${response.status}, trying proxy fallback...`);
                }
                
                lastResponse = response;
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY));
                continue; // Try again with next proxy
            }
            
            // Success! (or final attempt)
            const duration = Date.now() - startTime;
            
            if (attempt > 1) {
                stats.successfulRetries++;
                const connType = agent === null ? 'Direct' : `Proxy-${currentConnectionIndex}`;
                if (!shouldRetry) {
                    if (stats.perIP[ipKey]) {
                        stats.perIP[ipKey].successes++;
                    }
                    console.log(`[✓ SUCCESS] ${connType} - ${response.status} on ${requestPath} (attempt ${attempt}, ${duration}ms)`);
                } else {
                    // Final attempt but still rate limited
                    stats.errors++;
                    if (stats.perIP[ipKey]) {
                        stats.perIP[ipKey].errors++;
                    }
                    console.log(`[✗ FAILED] All retries exhausted - ${response.status} on ${requestPath} (${duration}ms)`);
                }
            } else if (!shouldRetry && response.status === 200) {
                // First attempt success
                if (stats.perIP[ipKey]) {
                    stats.perIP[ipKey].successes++;
                }
            }
            
            return response;
            
        } catch (error) {
            lastError = error;
            const connType = agent === null ? 'Direct' : `Proxy-${currentConnectionIndex}`;
            
            // Track error per IP
            if (stats.perIP[ipKey]) {
                stats.perIP[ipKey].errors++;
            }
            
            if (attempt === 1) {
                console.log(`[${connType}] Connection failed, trying proxy... (${error.code || 'error'})`);
            } else {
                console.log(`[Attempt ${attempt}/${MAX_RETRIES}] ${connType} failed - ${error.code || error.message.substring(0, 60)}`);
            }
            
            // Small delay before retrying with proxy
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY));
            }
        }
    }
    
    // All retries failed
    stats.errors++;
    const duration = Date.now() - startTime;
    console.log(`[✗ ERROR] All ${MAX_RETRIES} attempts failed for ${requestPath} (${duration}ms)`);
    
    // Return last response if we have one, otherwise throw error
    if (lastResponse) {
        return lastResponse;
    }
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

// Log statistics every 5 minutes
setInterval(() => {
    if (stats.totalRequests > 0) {
        const successRate = ((stats.totalRequests - stats.errors) / stats.totalRequests * 100).toFixed(1);
        console.log(`\n[STATS SUMMARY] ========================================`);
        console.log(`Overall: ${stats.totalRequests} requests | ${stats.rateLimitHits} rate limits | ${successRate}% success`);
        console.log(`Per-IP Performance:`);
        
        // Sort by requests descending
        const sortedIPs = Object.entries(stats.perIP)
            .sort((a, b) => b[1].requests - a[1].requests);
        
        sortedIPs.forEach(([key, ipStats]) => {
            if (ipStats.requests > 0) {
                const ipSuccessRate = ((ipStats.successes / ipStats.requests) * 100).toFixed(1);
                const display = key === 'direct' ? 'Direct' : `${key} (${ipStats.ip})`;
                console.log(`  ${display}: ${ipStats.requests} req | ${ipStats.rateLimits} rate limits | ${ipSuccessRate}% success`);
            }
        });
        console.log(`================================================\n`);
    }
}, 5 * 60 * 1000);

// Middleware
app.use(express.json({ limit: '50gb' }));
app.use(express.raw({ type: '*/*', limit: '50gb' }));

// Stats endpoint (no auth required)
app.get('/__stats', (req, res) => {
    const uptime = process.uptime();
    const successRate = stats.totalRequests > 0 
        ? ((stats.totalRequests - stats.errors) / stats.totalRequests * 100).toFixed(2)
        : 0;
    
    // Calculate per-IP stats with success rates
    const perIPStats = {};
    Object.keys(stats.perIP).forEach(key => {
        const ipStats = stats.perIP[key];
        const ipSuccessRate = ipStats.requests > 0 
            ? ((ipStats.successes / ipStats.requests) * 100).toFixed(2)
            : 0;
        
        perIPStats[key] = {
            ...ipStats,
            successRate: `${ipSuccessRate}%`,
        };
    });
    
    res.json({
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        overall: {
            totalRequests: stats.totalRequests,
            rateLimitHits: stats.rateLimitHits,
            proxyFallbacks: stats.proxyFallbacks,
            successfulRetries: stats.successfulRetries,
            errors: stats.errors,
            successRate: `${successRate}%`,
        },
        perIP: perIPStats,
        config: {
            maxRetries: MAX_RETRIES,
            requestTimeout: REQUEST_TIMEOUT,
            proxiesEnabled: proxyConfig.enabled,
            proxyCount: connectionPool.length,
        }
    });
});

// Health endpoint (no auth required)
app.get('/__health', (req, res) => {
    res.json({ status: 'ok', proxies: connectionPool.length });
});

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
        const requestPath = `/${robloxSubdomain}/${targetPath}${queryString}`;
        const response = await fetchWithRetry(targetUrl, fetchOptions, requestPath);
        
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
    console.log(`Retry Strategy: Direct first, proxy fallback (${MAX_RETRIES} attempts max)`);
    
    if (proxyConfig.enabled) {
        console.log(`Proxy Fallback: Enabled (${connectionPool.length} proxies available)`);
    } else {
        console.log(`Proxy Fallback: Disabled (direct connection only)`);
    }
});
