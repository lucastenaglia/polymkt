import axios from 'axios';

async function testResolution() {
    const user = '0x1979ae6B7E6534dE9c4539D0c205E582cA637C9D';
    const url = `https://data-api.polymarket.com/positions?user=${user}`;

    try {
        const res = await axios.get(url);
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
            const first = res.data[0];
            console.log('Available keys:', Object.keys(first).join(', '));
            console.log('Sample data:');
            console.log('asset:', first.asset);
            console.log('market:', first.market);
            console.log('marketSlug:', first.marketSlug);
            console.log('outcome:', first.outcome);
            console.log('conditionId:', first.conditionId);
        }
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

testResolution();
