const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, './bot.db');
const db = new Database(dbPath);

try {
    console.log('--- SCHEMA CHECK ---');
    const schema = db.prepare('PRAGMA table_info(positions)').all();
    console.log(schema);

    console.log('--- STATUS COUNTS ---');
    const counts = db.prepare('SELECT status, count(*) as c FROM positions GROUP BY status').all();
    console.log(counts);

    console.log('--- OPEN POSITIONS (SUMMARY) ---');
    const open = db.prepare('SELECT id, market_id, outcome, status, asset_id FROM positions WHERE status = "OPEN"').all();
    console.log(`TOTAL OPEN: ${open.length}`);
    if (open.length > 0) {
        console.log('First 3:');
        console.log(open.slice(0, 3));
    }
} catch (e) {
    console.error('ERROR:', e.message);
}
