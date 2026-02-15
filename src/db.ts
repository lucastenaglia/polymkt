import Database from 'better-sqlite3';
import * as path from 'path';
import { Position } from './types';

const dbPath = path.resolve(__dirname, '../bot.db');
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

// Migration: Check if target_user exists in positions
try {
  db.prepare('SELECT target_user FROM positions LIMIT 1').get();
} catch (e) {
  console.log('Migrating database: Adding target_user column to positions table...');
  db.exec('ALTER TABLE positions ADD COLUMN target_user TEXT');
}

// Seed stats if empty
const initStats = db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)');
initStats.run('total_invested', 0);
initStats.run('total_pnl', 0);

export function getOpenPositions(): Position[] {
  return db.prepare('SELECT * FROM positions WHERE status = ? ORDER BY timestamp DESC').all('OPEN') as Position[];
}

export function getClosedPositions(limit = 10): Position[] {
  return db.prepare('SELECT * FROM positions WHERE status = ? ORDER BY timestamp DESC LIMIT ?').all('CLOSED', limit) as Position[];
}

export default db;
