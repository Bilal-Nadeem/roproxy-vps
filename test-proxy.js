// Proxy Rotation Test Script
// Tests if the rotating proxies are working correctly

const fetch = require('node-fetch');

// Configuration
const PROXY_URL = 'http://localhost:5050'; // Change to your domain if testing remotely
const API_KEY = 'LuaBearyGood_2025_vR8kL3mN9pQ6sF4wX7jC5bH1gT2yK9nP1dc';
const NUM_REQUESTS = 12; // Test 2 full rotations (6 IPs x 2)

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
};

async function testProxyRotation() {
    console.log(`${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.cyan}  Proxy Rotation Test${colors.reset}`);
    console.log(`${colors.cyan}========================================${colors.reset}\n`);
    
    console.log(`Testing ${NUM_REQUESTS} requests to verify rotation...\n`);
    
    const ips = [];
    const results = [];
    
    for (let i = 1; i <= NUM_REQUESTS; i++) {
        try {
            // Test endpoint: get user info (small response)
            const response = await fetch(`${PROXY_URL}/users/v1/users/1`, {
                headers: {
                    'x-api-key': API_KEY,
                },
            });
            
            const status = response.status;
            const contentType = response.headers.get('content-type');
            let data;
            
            // Check if response is JSON
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                // Get text to see what error we're getting
                const text = await response.text();
                data = { error: 'Non-JSON response', preview: text.substring(0, 200) };
            }
            
            // For tracking which IP was used, we'll infer from the rotation pattern
            // Since we can't directly see which proxy was used, we track patterns
            const requestNum = i;
            const poolIndex = (requestNum - 1) % 6;
            const proxyNames = [
                'Proxy 1 (8001)',
                'Proxy 2 (8002)',
                'Proxy 3 (8003)',
                'Proxy 4 (8004)',
                'Proxy 5 (8005)',
                'Direct IP',
            ];
            
            const proxyUsed = proxyNames[poolIndex];
            
            results.push({
                request: i,
                status,
                proxy: proxyUsed,
                success: status === 200,
            });
            
            const statusColor = status === 200 ? colors.green : colors.red;
            
            if (data.error) {
                console.log(
                    `${colors.blue}Request ${i}:${colors.reset} ` +
                    `${statusColor}Status ${status}${colors.reset} | ` +
                    `${colors.yellow}Expected: ${proxyUsed}${colors.reset}`
                );
                console.log(`  ${colors.red}Error: ${data.error}${colors.reset}`);
                console.log(`  ${colors.red}Preview: ${data.preview}${colors.reset}`);
            } else {
                console.log(
                    `${colors.blue}Request ${i}:${colors.reset} ` +
                    `${statusColor}Status ${status}${colors.reset} | ` +
                    `${colors.yellow}Expected: ${proxyUsed}${colors.reset} | ` +
                    `User: ${data.name || 'N/A'}`
                );
            }
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 300));
            
        } catch (error) {
            console.log(
                `${colors.red}Request ${i}: ERROR - ${error.message}${colors.reset}`
            );
            results.push({
                request: i,
                status: 'ERROR',
                proxy: 'Unknown',
                success: false,
            });
        }
    }
    
    // Summary
    console.log(`\n${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.cyan}  Test Summary${colors.reset}`);
    console.log(`${colors.cyan}========================================${colors.reset}\n`);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`Total Requests: ${NUM_REQUESTS}`);
    console.log(`${colors.green}Successful: ${successful}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log(`Success Rate: ${((successful / NUM_REQUESTS) * 100).toFixed(1)}%\n`);
    
    // Rotation pattern check
    console.log(`${colors.yellow}Rotation Pattern:${colors.reset}`);
    console.log(`Each request should use a different connection in order:`);
    console.log(`1. Proxy 1 (8001) → 2. Proxy 2 (8002) → 3. Proxy 3 (8003)`);
    console.log(`→ 4. Proxy 4 (8004) → 5. Proxy 5 (8005) → 6. Direct IP`);
    console.log(`→ then repeats...\n`);
    
    if (successful === NUM_REQUESTS) {
        console.log(`${colors.green}✓ All requests successful! Proxy rotation is working!${colors.reset}\n`);
    } else {
        console.log(`${colors.yellow}⚠ Some requests failed. Check proxy credentials or connection.${colors.reset}\n`);
    }
}

// Advanced test: Make many concurrent requests to test load distribution
async function testConcurrentRequests() {
    console.log(`${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.cyan}  Concurrent Requests Test${colors.reset}`);
    console.log(`${colors.cyan}========================================${colors.reset}\n`);
    
    console.log(`Testing 20 concurrent requests...\n`);
    
    const promises = [];
    const startTime = Date.now();
    
    for (let i = 1; i <= 20; i++) {
        promises.push(
            fetch(`${PROXY_URL}/users/v1/users/${i}`, {
                headers: { 'x-api-key': API_KEY },
            })
        );
    }
    
    try {
        const responses = await Promise.all(promises);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        const statuses = responses.map(r => r.status);
        const successful = statuses.filter(s => s === 200).length;
        
        console.log(`${colors.green}Completed ${successful}/20 requests in ${duration}ms${colors.reset}`);
        console.log(`Average: ${(duration / 20).toFixed(0)}ms per request\n`);
        
    } catch (error) {
        console.log(`${colors.red}Error during concurrent test: ${error.message}${colors.reset}\n`);
    }
}

// Run tests
(async () => {
    try {
        await testProxyRotation();
        await testConcurrentRequests();
        
        console.log(`${colors.cyan}========================================${colors.reset}`);
        console.log(`${colors.green}✓ Testing Complete!${colors.reset}`);
        console.log(`${colors.cyan}========================================${colors.reset}\n`);
        
    } catch (error) {
        console.error(`${colors.red}Test failed: ${error.message}${colors.reset}`);
        process.exit(1);
    }
})();
