const https = require('https');

const data = JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: [],
    id: 1
});

const options = {
    hostname: 'polygon-rpc.com',
    port: 443,
    path: '/',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = https.request(options, (res) => {
    console.log('Status Code:', res.statusCode);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (e) => {
    console.error('Error:', e.message);
});

req.write(data);
req.end();
