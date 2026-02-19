import db from './db';
import { Position } from './types';

async function check() {
    try {
        console.log('--- SCHEMA CHECK ---');
        const schema = db.prepare('PRAGMA table_info(positions)').all();
        console.log(schema);

        console.log('--- STATUS COUNTS ---');
        const counts = db.prepare('SELECT status, count(*) as c FROM positions GROUP BY status').all();
        console.log(counts);

        console.log('--- OPEN POSITIONS (ALL) ---');
        const open = db.prepare("SELECT id, market_id, outcome, status, asset_id FROM positions WHERE status = 'OPEN'").all() as any[];
        console.log(`TOTAL OPEN: ${open.length}`);
        if (open.length > 0) {
            open.forEach(p => console.log(`[POS] ID: ${p.id} | Market: ${p.market_id} | Outcome: ${p.outcome} | Asset: ${p.asset_id}`));
        } else {
            console.log('No open positions.');
        }

        console.log('--- LATEST PROCESSED ACTIVITIES ---');
        console.log('Current Time:', Date.now());
        const activities = db.prepare('SELECT id, user_address, timestamp FROM processed_activities ORDER BY timestamp DESC LIMIT 10').all();
        activities.forEach((a: any) => {
            const date = new Date(a.timestamp).toISOString();
            console.log(`[ACT] User: ${a.user_address} | Time: ${date} (${a.timestamp}) | ID: ${a.id}`);
        });
    } catch (e: any) {
        console.error('ERROR during check:', e.message);
    }
}

check();
