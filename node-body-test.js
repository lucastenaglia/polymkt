const https = require('https');

https.get('https://polygon-rpc.com', (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers['content-type']);
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log('Body Preview:', data.substring(0, 200));
    });
}).on('error', (e) => {
    console.error('Error:', e.message);
});
