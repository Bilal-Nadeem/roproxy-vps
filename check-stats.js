#!/usr/bin/env node

// Simple script to check RoProxy stats from command line

const fetch = require('node-fetch');

const PROXY_URL = process.env.PROXY_URL || 'http://localhost:5050';
const API_KEY = process.env.API_KEY || 'LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc';

// Colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};

async function getStats() {
    try {
        console.log(`${colors.cyan}Fetching stats from ${PROXY_URL}...${colors.reset}\n`);

        const response = await fetch(`${PROXY_URL}/__stats`, {
            headers: {
                'x-api-key': API_KEY,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        displayStats(data);

    } catch (error) {
        console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
        console.log(`\n${colors.yellow}Usage:${colors.reset}`);
        console.log(`  PROXY_URL=https://your-proxy.com API_KEY=your-key node check-stats.js`);
        process.exit(1);
    }
}

function displayStats(data) {
    console.log(`${colors.bold}${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}  RoProxy Statistics${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}========================================${colors.reset}\n`);

    // Overall Stats
    console.log(`${colors.bold}Overall Performance:${colors.reset}`);
    console.log(`  Uptime:           ${colors.green}${data.uptime}${colors.reset}`);
    console.log(`  Total Requests:   ${colors.blue}${data.overall.totalRequests.toLocaleString()}${colors.reset}`);
    console.log(`  Rate Limit Hits:  ${colors.yellow}${data.overall.rateLimitHits.toLocaleString()}${colors.reset}`);
    console.log(`  Proxy Fallbacks:  ${colors.cyan}${data.overall.proxyFallbacks.toLocaleString()}${colors.reset}`);
    console.log(`  Errors:           ${colors.red}${data.overall.errors.toLocaleString()}${colors.reset}`);
    console.log(`  Success Rate:     ${colors.green}${data.overall.successRate}${colors.reset}`);

    // Configuration
    console.log(`\n${colors.bold}Configuration:${colors.reset}`);
    console.log(`  Max Retries:      ${data.config.maxRetries}`);
    console.log(`  Request Timeout:  ${data.config.requestTimeout}ms`);
    console.log(`  Proxies Enabled:  ${data.config.proxiesEnabled ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}`);
    console.log(`  Proxy Count:      ${data.config.proxyCount}`);

    // Per-IP Stats
    console.log(`\n${colors.bold}Per-IP Performance:${colors.reset}\n`);

    // Sort by requests descending
    const sortedIPs = Object.entries(data.perIP).sort((a, b) => b[1].requests - a[1].requests);

    // Header
    console.log(
        `${'Connection'.padEnd(15)} ${'IP Address'.padEnd(25)} ${'Requests'.padEnd(10)} ${'Rate Limits'.padEnd(13)} ${'Errors'.padEnd(8)} ${'Success Rate'.padEnd(12)}`
    );
    console.log('─'.repeat(95));

    sortedIPs.forEach(([key, stats]) => {
        if (stats.requests === 0) return; // Skip unused IPs

        const displayName = key === 'direct' ? 'Direct' : key;
        const ipAddress = stats.ip || 'Server IP';
        const successRate = parseFloat(stats.successRate);

        // Color code success rate
        let rateColor = colors.green;
        if (successRate < 90) rateColor = colors.yellow;
        if (successRate < 70) rateColor = colors.red;

        console.log(
            `${displayName.padEnd(15)} ${ipAddress.padEnd(25)} ${String(stats.requests).padEnd(10)} ${String(stats.rateLimits).padEnd(13)} ${String(stats.errors).padEnd(8)} ${rateColor}${stats.successRate}${colors.reset}`
        );
    });

    console.log(`\n${colors.cyan}========================================${colors.reset}\n`);
}

// Run
getStats();
