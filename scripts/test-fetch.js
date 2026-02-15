async function run() {
    const user = '0x8dxd';
    const url = `https://data-api.polymarket.com/activity?user=${user}&limit=1`;
    const gammaUrl = `https://gamma-api.polymarket.com/events?limit=1`;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://polymarket.com/',
        'Origin': 'https://polymarket.com'
    };

    console.log('Testing Data API URL:', url);
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
            console.log('Data API Status:', res.status);
            console.log('Data API Body:', await res.text());
        } else {
            console.log('Data API Success');
        }
    } catch (err) {
        console.error('Data API Error:', err.message);
    }

    console.log('Testing Gamma API URL:', gammaUrl);
    try {
        const res = await fetch(gammaUrl, { headers });
        if (!res.ok) {
            console.log('Gamma API Status:', res.status);
            console.log('Gamma API Body:', await res.text());
        } else {
            console.log('Gamma API Success');
        }
    } catch (err) {
        console.error('Gamma API Error:', err.message);
    }
}

run();
