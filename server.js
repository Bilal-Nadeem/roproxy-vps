// Starkrblx Proxy - VPS Version (Path Mode) with Rotating Proxies

const express = require('express');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const crypto = require('crypto');

const app = express();

// Configuration
const API_KEY = "LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc";
const MAX_RETRIES = 3;  // Number of retry attempts
const REQUEST_TIMEOUT = 20000;  // Timeout in milliseconds (20 seconds)
const RATE_LIMIT_RETRY_DELAY = 100;  // Delay between 429 retries (ms)
const USE_DIRECT_CONNECTION = false;  // Set to true to try direct first, false for proxy-only

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

// Retry function with load balancing strategy
// Strategy: Load balance across proxies, retry on failure
async function fetchWithRetry(url, options, requestPath) {
    let lastError;
    let lastResponse;
    let agent;
    const startTime = Date.now();
    
    stats.totalRequests++;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        let ipKey;
        
        try {
            // Choose connection based on strategy
            if (!proxyConfig.enabled || (USE_DIRECT_CONNECTION && attempt === 1)) {
                // Use direct connection if proxies disabled or if configured to try direct first
                agent = null;
                ipKey = 'direct';
            } else {
                // Use proxies with round-robin load balancing
                const proxyIndex = currentConnectionIndex;
                agent = getNextConnection();
                ipKey = `proxy-${proxyIndex}`;
                
                if (attempt > 1) {
                    stats.proxyFallbacks++;
                }
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
                const connType = agent === null ? 'Direct' : `Proxy-${(currentConnectionIndex - 1 + connectionPool.length) % connectionPool.length}`;
                
                if (isRateLimited) {
                    stats.rateLimitHits++;
                    if (stats.perIP[ipKey]) {
                        stats.perIP[ipKey].rateLimits++;
                    }
                    console.log(`[RATE LIMIT] ${connType} - 429 on ${requestPath} - Attempt ${attempt}/${MAX_RETRIES}`);
                } else {
                    if (stats.perIP[ipKey]) {
                        stats.perIP[ipKey].errors++;
                    }
                    console.log(`[${connType}] ${response.status} on ${requestPath}, retrying...`);
                }
                
                lastResponse = response;
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY));
                continue; // Try again with next proxy
            }
            
            // Success! (or final attempt)
            const duration = Date.now() - startTime;
            
            if (attempt > 1) {
                stats.successfulRetries++;
                const connType = agent === null ? 'Direct' : `Proxy-${(currentConnectionIndex - 1 + connectionPool.length) % connectionPool.length}`;
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
                // First attempt success - only track in stats
                if (stats.perIP[ipKey]) {
                    stats.perIP[ipKey].successes++;
                }
            }
            
            return response;
            
        } catch (error) {
            lastError = error;
            const connType = agent === null ? 'Direct' : `Proxy-${(currentConnectionIndex - 1 + connectionPool.length) % connectionPool.length}`;
            
            // Track error per IP
            if (stats.perIP[ipKey]) {
                stats.perIP[ipKey].errors++;
            }
            
            console.log(`[✗ ${connType}] ${error.code || error.message.substring(0, 50)} on ${requestPath} - Attempt ${attempt}/${MAX_RETRIES}`);
            
            // Small delay before retrying with next proxy
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY));
            }
        }
    }
    
    // All retries failed
    stats.errors++;
    const duration = Date.now() - startTime;
    console.log(`[✗ ALL FAILED] ${MAX_RETRIES} attempts exhausted (${duration}ms)`);
    
    // Return last response if we have one, otherwise throw error
    if (lastResponse) {
        return lastResponse;
    }
    throw lastError;
}

// Dashboard HTML generator
function getDashboardHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RoProxy Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
            background: #0a0a0a;
            color: #fff;
            padding: 20px;
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .header {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        h1 { font-size: 28px; font-weight: 600; }
        .status { display: flex; align-items: center; gap: 12px; }
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #00ff00;
            box-shadow: 0 0 12px #00ff00;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .card {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 20px;
        }
        h2 {
            font-size: 18px;
            margin-bottom: 16px;
            color: #fff;
            border-bottom: 1px solid #333;
            padding-bottom: 8px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .stat-box {
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 6px;
            padding: 16px;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 4px;
        }
        .stat-label {
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .table-container { overflow-x: auto; }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }
        th {
            background: #0a0a0a;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            border-bottom: 1px solid #333;
            color: #888;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 1px;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid #222;
        }
        tr:hover { background: #0a0a0a; }
        .success { color: #00ff00; }
        .warning { color: #ffaa00; }
        .error { color: #ff4444; }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .badge-success { background: #00ff0020; color: #00ff00; border: 1px solid #00ff00; }
        .badge-warning { background: #ffaa0020; color: #ffaa00; border: 1px solid #ffaa00; }
        .badge-error { background: #ff444420; color: #ff4444; border: 1px solid #ff4444; }
        .refresh-btn {
            padding: 8px 16px;
            background: #fff;
            color: #0a0a0a;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .refresh-btn:hover { background: #e0e0e0; }
        .config-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 12px;
        }
        .config-item {
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 4px;
            padding: 12px;
        }
        .config-label {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        .config-value {
            font-size: 16px;
            font-weight: 600;
        }
        .progress-bar {
            width: 100%;
            height: 6px;
            background: #333;
            border-radius: 3px;
            overflow: hidden;
            margin-top: 8px;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00ff00, #00aa00);
            transition: width 0.3s;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚡ RoProxy Dashboard</h1>
            <div class="status">
                <div class="status-dot"></div>
                <span id="statusText">Online</span>
                <button class="refresh-btn" onclick="loadStats()">↻ Refresh</button>
                <button class="refresh-btn" onclick="logout()" style="background: #ff4444; color: white; margin-left: 8px;">Logout</button>
            </div>
        </div>

        <div class="card">
            <h2>Overall Performance</h2>
            <div class="stats-grid" id="overallStats">
                <div class="stat-box">
                    <div class="stat-value" id="totalRequests">-</div>
                    <div class="stat-label">Total Requests</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value" id="rateLimits">-</div>
                    <div class="stat-label">Rate Limits Hit</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value" id="proxyFallbacks">-</div>
                    <div class="stat-label">Proxy Fallbacks</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value" id="successRate">-</div>
                    <div class="stat-label">Success Rate</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value" id="errors">-</div>
                    <div class="stat-label">Total Errors</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value" id="uptime">-</div>
                    <div class="stat-label">Uptime</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>Configuration</h2>
            <div class="config-grid" id="configGrid"></div>
        </div>

        <div class="card">
            <h2>Proxy Performance</h2>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Connection</th>
                            <th>IP Address</th>
                            <th>Status</th>
                            <th>Requests</th>
                            <th>Rate Limits</th>
                            <th>Errors</th>
                            <th>Successes</th>
                            <th>Success Rate</th>
                            <th>Health</th>
                        </tr>
                    </thead>
                    <tbody id="proxyTableBody">
                        <tr><td colspan="9" style="text-align: center;">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        let autoRefreshInterval;

        function loadStats() {
            fetch('/__stats')
                .then(r => r.json())
                .then(data => displayStats(data))
                .catch(err => console.error('Failed to load stats:', err));
        }

        function displayStats(data) {
            // Overall stats
            document.getElementById('totalRequests').textContent = data.overall.totalRequests.toLocaleString();
            document.getElementById('rateLimits').textContent = data.overall.rateLimitHits.toLocaleString();
            document.getElementById('proxyFallbacks').textContent = data.overall.proxyFallbacks.toLocaleString();
            document.getElementById('errors').textContent = data.overall.errors.toLocaleString();
            document.getElementById('uptime').textContent = data.uptime;
            
            const successRate = parseFloat(data.overall.successRate);
            const successEl = document.getElementById('successRate');
            successEl.textContent = data.overall.successRate;
            successEl.className = 'stat-value ' + (successRate >= 95 ? 'success' : successRate >= 80 ? 'warning' : 'error');

            // Configuration
            const configGrid = document.getElementById('configGrid');
            configGrid.innerHTML = \`
                <div class="config-item">
                    <div class="config-label">Max Retries</div>
                    <div class="config-value">\${data.config.maxRetries}</div>
                </div>
                <div class="config-item">
                    <div class="config-label">Request Timeout</div>
                    <div class="config-value">\${data.config.requestTimeout}ms</div>
                </div>
                <div class="config-item">
                    <div class="config-label">Proxies Enabled</div>
                    <div class="config-value">\${data.config.proxiesEnabled ? '✓ Yes' : '✗ No'}</div>
                </div>
                <div class="config-item">
                    <div class="config-label">Proxy Count</div>
                    <div class="config-value">\${data.config.proxyCount}</div>
                </div>
            \`;

            // Proxy table
            const tbody = document.getElementById('proxyTableBody');
            tbody.innerHTML = '';

            const sorted = Object.entries(data.perIP).sort((a, b) => b[1].requests - a[1].requests);

            sorted.forEach(([key, stats]) => {
                if (stats.requests === 0) return;

                const displayName = key === 'direct' ? 'Direct' : key;
                const ipAddress = stats.ip || 'Server IP';
                const successRate = parseFloat(stats.successRate);
                
                let statusBadge = '';
                let healthBar = '';
                
                if (successRate >= 95) {
                    statusBadge = '<span class="badge badge-success">Healthy</span>';
                    healthBar = \`<div class="progress-bar"><div class="progress-fill" style="width: \${successRate}%; background: linear-gradient(90deg, #00ff00, #00aa00);"></div></div>\`;
                } else if (successRate >= 50) {
                    statusBadge = '<span class="badge badge-warning">Degraded</span>';
                    healthBar = \`<div class="progress-bar"><div class="progress-fill" style="width: \${successRate}%; background: linear-gradient(90deg, #ffaa00, #ff8800);"></div></div>\`;
                } else {
                    statusBadge = '<span class="badge badge-error">Failing</span>';
                    healthBar = \`<div class="progress-bar"><div class="progress-fill" style="width: \${successRate}%; background: linear-gradient(90deg, #ff4444, #cc0000);"></div></div>\`;
                }

                const row = \`
                    <tr>
                        <td><strong>\${displayName}</strong></td>
                        <td><code>\${ipAddress}</code></td>
                        <td>\${statusBadge}</td>
                        <td>\${stats.requests.toLocaleString()}</td>
                        <td class="\${stats.rateLimits > 0 ? 'warning' : ''}">\${stats.rateLimits.toLocaleString()}</td>
                        <td class="\${stats.errors > 0 ? 'error' : ''}">\${stats.errors.toLocaleString()}</td>
                        <td class="success">\${stats.successes.toLocaleString()}</td>
                        <td class="\${successRate >= 95 ? 'success' : successRate >= 50 ? 'warning' : 'error'}">\${stats.successRate}</td>
                        <td>\${healthBar}</td>
                    </tr>
                \`;
                tbody.innerHTML += row;
            });

            if (sorted.length === 0 || sorted.every(([_, s]) => s.requests === 0)) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #888;">No data yet</td></tr>';
            }
        }

        function logout() {
            window.location.href = '/dashboard/logout';
        }

        // Auto-refresh every 5 seconds
        loadStats();
        autoRefreshInterval = setInterval(loadStats, 5000);
    </script>
</body>
</html>`;
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

// Middleware - ORDER MATTERS!
app.use(express.json({ limit: '50gb' }));
app.use(express.urlencoded({ extended: true })); // For form data (dashboard login)

// Stats endpoint (no auth required)
app.get('/__stats', (req, res) => {
    // Enable CORS for dashboard access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
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
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    res.json({ status: 'ok', proxies: connectionPool.length });
});

// Simple session storage (in-memory)
const sessions = new Map();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function isValidSession(token) {
    const session = sessions.get(token);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
        sessions.delete(token);
        return false;
    }
    return true;
}

// Dashboard password
const DASHBOARD_PASSWORD = '@Lua98765';

// Dashboard login endpoint (POST)
app.post('/dashboard/login', (req, res) => {
    const { password } = req.body;
    
    console.log('[Dashboard] Login attempt');
    console.log('[Dashboard] Received password length:', password ? password.length : 0);
    console.log('[Dashboard] Expected password length:', DASHBOARD_PASSWORD.length);
    console.log('[Dashboard] Match:', password === DASHBOARD_PASSWORD);
    
    if (password === DASHBOARD_PASSWORD) {
        // Create session
        const token = generateSessionToken();
        sessions.set(token, {
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_DURATION
        });
        
        // Set secure cookie
        res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DURATION / 1000}; Path=/`);
        res.redirect('/dashboard');
    } else {
        res.redirect('/dashboard?error=1');
    }
});

// Dashboard logout endpoint
app.get('/dashboard/logout', (req, res) => {
    const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
    }, {});
    
    if (cookies?.session) {
        sessions.delete(cookies.session);
    }
    
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
    res.redirect('/dashboard');
});

// Dashboard main endpoint
app.get('/dashboard', (req, res) => {
    // Check for existing session
    const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
    }, {});
    
    const sessionToken = cookies?.session;
    
    // Validate session
    if (!sessionToken || !isValidSession(sessionToken)) {
        // Show login page
        const hasError = req.query.error === '1';
        return res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard Login</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .login-box {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 40px;
            width: 400px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        h1 { margin-bottom: 8px; font-size: 24px; }
        .subtitle { color: #888; margin-bottom: 24px; font-size: 14px; }
        input {
            width: 100%;
            padding: 12px;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 4px;
            color: #fff;
            font-size: 16px;
            margin-bottom: 16px;
        }
        input:focus { outline: none; border-color: #fff; }
        button {
            width: 100%;
            padding: 12px;
            background: #fff;
            color: #0a0a0a;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        button:hover { background: #e0e0e0; }
        .error { 
            color: #ff4444; 
            margin-top: 12px; 
            font-size: 14px;
            padding: 8px;
            background: #ff444420;
            border: 1px solid #ff4444;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="login-box">
        <h1>🔒 Dashboard Login</h1>
        <div class="subtitle">Secure access to RoProxy monitoring</div>
        <form method="POST" action="/dashboard/login">
            <input type="password" name="password" placeholder="Enter Password" autofocus required>
            <button type="submit">Access Dashboard</button>
            ${hasError ? '<div class="error">⚠ Invalid password. Please try again.</div>' : ''}
        </form>
    </div>
</body>
</html>
        `);
    }
    
    // Serve dashboard HTML
    res.send(getDashboardHTML());
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
app.all('*', express.raw({ type: '*/*', limit: '50gb' }), async (req, res) => {
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
    
    if (proxyConfig.enabled) {
        if (USE_DIRECT_CONNECTION) {
            console.log(`Strategy: Direct first, proxy fallback (${MAX_RETRIES} attempts max)`);
            console.log(`Proxy Pool: ${connectionPool.length} proxies available`);
        } else {
            console.log(`Strategy: Round-robin load balancing across ${connectionPool.length} proxies`);
            console.log(`Direct Connection: Disabled (proxy-only mode for rate limit bypass)`);
        }
    } else {
        console.log(`Strategy: Direct connection only (no proxies)`);
    }
});
