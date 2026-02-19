const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, './bot.db');
const db = new Database(dbPath);

console.log('Force migrating database...');

try {
    const tableInfo = db.prepare("PRAGMA table_info(positions)").all();
    const hasAssetId = tableInfo.some(col => col.name === 'asset_id');
    if (!hasAssetId) {
        console.log('Adding asset_id column...');
        db.exec('ALTER TABLE positions ADD COLUMN asset_id TEXT');
        console.log('Done.');
    } else {
        console.log('asset_id column already exists.');
    }

    const hasSlug = tableInfo.some(col => col.name === 'slug');
    if (!hasSlug) {
        console.log('Adding slug column...');
        db.exec('ALTER TABLE positions ADD COLUMN slug TEXT');
        console.log('Done.');
    }

    console.log('Removing duplicates...');
    db.exec(`
        DELETE FROM positions 
        WHERE id NOT IN (
          SELECT MAX(id) 
          FROM positions 
          WHERE status = 'OPEN' 
          GROUP BY market_id, outcome
        ) AND status = 'OPEN'
    `);
    console.log('Done.');

    console.log('Creating unique index...');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_unique_market ON positions(market_id, outcome, status) WHERE status = "OPEN"');
    console.log('Done.');

    console.log('Final check:');
    const openCount = db.prepare('SELECT count(*) as c FROM positions WHERE status = "OPEN"').get().c;
    console.log(`TOTAL OPEN POSITIONS: ${openCount}`);

} catch (e) {
    console.error('MIGRATION ERROR:', e.message);
}
