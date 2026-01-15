// Debug script to test Oxylabs proxy directly

const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');

const proxyConfig = JSON.parse(fs.readFileSync('./proxies.json', 'utf8'));

console.log('Testing each proxy directly...\n');

async function testProxy(proxyHost, index) {
    const proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyHost}`;
    
    console.log(`\n[Proxy ${index + 1}] ${proxyHost}`);
    console.log(`URL format: ${proxyConfig.username}:****@${proxyHost}`);
    
    const agent = new HttpsProxyAgent(proxyUrl);
    
    try {
        const response = await fetch('https://users.roblox.com/v1/users/1', {
            agent: agent,
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36',
            },
        });
        
        const status = response.status;
        const contentType = response.headers.get('content-type');
        
        console.log(`Status: ${status}`);
        console.log(`Content-Type: ${contentType}`);
        
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            console.log(`✓ SUCCESS - User: ${data.name}`);
        } else {
            const text = await response.text();
            console.log(`✗ FAILED - Response (first 300 chars):`);
            console.log(text.substring(0, 300));
        }
    } catch (error) {
        console.log(`✗ ERROR: ${error.message}`);
    }
}

async function testDirect() {
    console.log(`\n[Direct Connection] No proxy`);
    
    try {
        const response = await fetch('https://users.roblox.com/v1/users/1', {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36',
            },
        });
        
        const status = response.status;
        const data = await response.json();
        console.log(`Status: ${status}`);
        console.log(`✓ SUCCESS - User: ${data.name}`);
    } catch (error) {
        console.log(`✗ ERROR: ${error.message}`);
    }
}

(async () => {
    console.log('========================================');
    console.log('  Oxylabs Proxy Debug Test');
    console.log('========================================');
    
    // Test each proxy
    for (let i = 0; i < proxyConfig.proxies.length; i++) {
        await testProxy(proxyConfig.proxies[i], i);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test direct connection
    await testDirect();
    
    console.log('\n========================================');
    console.log('  Test Complete');
    console.log('========================================\n');
})();
