import Database from 'better-sqlite3';
import * as path from 'path';
import { Position } from './types';

const dbPath = path.resolve(__dirname, '../bot.db');
console.log(`[DB] Using database at: ${dbPath}`);
const db = new Database(dbPath);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS monitored_users (
    address TEXT PRIMARY KEY,
    name TEXT
  );

  CREATE TABLE IF NOT EXISTS processed_activities (
    id TEXT PRIMARY KEY,
    user_address TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id TEXT,
    outcome TEXT,
    amount REAL,
    status TEXT, -- 'OPEN', 'CLOSED'
    entry_price REAL,
    timestamp INTEGER,
    target_user TEXT
  );

  CREATE TABLE IF NOT EXISTS stats (
    key TEXT PRIMARY KEY,
    value REAL
  );

  CREATE TABLE IF NOT EXISTS ineligible_markets (
    condition_id TEXT PRIMARY KEY,
    reason TEXT,
    timestamp INTEGER
  );
`);

// Migration 1: Check if target_user exists in positions
try {
  db.prepare('SELECT target_user FROM positions LIMIT 1').get();
} catch (e) {
  console.log('Migrating database: Adding target_user column to positions table...');
  db.exec('ALTER TABLE positions ADD COLUMN target_user TEXT');
}

// Migration 2: Check if 'id' exists (Primary Key)
// Older versions might not have 'id' explicit column
try {
  db.prepare('SELECT id FROM positions LIMIT 1').get();
} catch (e) {
  console.log('Migrating database: Recreating positions table with ID primary key...');

  db.transaction(() => {
    // 1. Rename old table
    db.exec('ALTER TABLE positions RENAME TO positions_old');

    // 2. Create new table
    db.exec(`
      CREATE TABLE positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_id TEXT,
        outcome TEXT,
        amount REAL,
        status TEXT,
        entry_price REAL,
        timestamp INTEGER,
        target_user TEXT,
        slug TEXT
      )
    `);

    // 3. Copy data (Mapping columns correctly)
    // Old schema: market_id, outcome, amount, status, entry_price, timestamp, target_user
    // New schema: id (auto), ... same ...
    db.exec(`
      INSERT INTO positions (market_id, outcome, amount, status, entry_price, timestamp, target_user)
      SELECT market_id, outcome, amount, status, entry_price, timestamp, target_user
      FROM positions_old
    `);

    // 4. Drop old table
    db.exec('DROP TABLE positions_old');
  })();
}

// Migration 3: Check if 'slug' exists
try {
  db.prepare('SELECT slug FROM positions LIMIT 1').get();
} catch (e) {
  console.log('Migrating database: Adding slug column to positions table...');
  db.exec('ALTER TABLE positions ADD COLUMN slug TEXT');
}
// Migration 4: Ensure asset_id column exists
const tableInfo = db.prepare("PRAGMA table_info(positions)").all() as any[];
const hasAssetId = tableInfo.some(col => col.name === 'asset_id');
if (!hasAssetId) {
  console.log('Migrating database: Adding asset_id column to positions table...');
  db.exec('ALTER TABLE positions ADD COLUMN asset_id TEXT');
}
// Migration 5: HARD DEDUPLICATION + UNIQUE INDEX
try {
  // 1. Remove duplicates before creating index
  db.exec(`
    DELETE FROM positions 
    WHERE id NOT IN (
      SELECT MAX(id) 
      FROM positions 
      WHERE status = 'OPEN' 
      GROUP BY market_id, outcome
    ) AND status = 'OPEN'
  `);

  // 2. Create the unique index (will fail if duplicates still exist, but we just deleted them)
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_unique_market ON positions(market_id, outcome, status) WHERE status = 'OPEN'");
  console.log('Database: Unique index created/verified on positions table.');
} catch (e: any) {
  console.error('CRITICAL: Failed to deduplicate or create index:', e.message);
}

// Migration 6: Add exit_price and pnl columns
const tableInfo2 = db.prepare("PRAGMA table_info(positions)").all() as any[];
const hasExitPrice = tableInfo2.some(col => col.name === 'exit_price');
if (!hasExitPrice) {
  console.log('Migrating database: Adding exit_price and pnl columns to positions table...');
  db.exec('ALTER TABLE positions ADD COLUMN exit_price REAL');
  db.exec('ALTER TABLE positions ADD COLUMN pnl REAL');
}
// Seed stats if empty
const initStats = db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)');
initStats.run('total_invested', 0);
initStats.run('total_pnl', 0);

export function getOpenPositions(): Position[] {
  return db.prepare('SELECT * FROM positions WHERE status = ? ORDER BY timestamp DESC').all('OPEN') as Position[];
}

export function getPositionByAssetId(assetId: string): Position | undefined {
  return db.prepare('SELECT * FROM positions WHERE asset_id = ? AND status = ?').get(assetId, 'OPEN') as Position | undefined;
}

export function getClosedPositions(limit = 10): Position[] {
  return db.prepare('SELECT * FROM positions WHERE status = ? ORDER BY timestamp DESC LIMIT ?').all('CLOSED', limit) as Position[];
}

export default db;
