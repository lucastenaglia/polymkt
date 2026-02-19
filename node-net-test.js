const https = require('https');

https.get('https://polygon-rpc.com', (res) => {
    console.log('Status Code:', res.statusCode);
    res.on('data', (d) => {
        // process.stdout.write(d);
    });
}).on('error', (e) => {
    console.error('Error:', e.message);
    console.error(e);
});
