const https = require('https');

https.get('https://polygon-rpc.com', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Headers:', res.headers);
        console.log('Full Body:', data);
    });
}).on('error', (e) => { console.error('Error:', e.message); });
