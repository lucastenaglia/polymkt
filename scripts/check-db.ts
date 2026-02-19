import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('bot.db');
const db = new Database(dbPath);

try {
    const row = db.prepare("SELECT COUNT(*) as count FROM trades").get();
    console.log(`Total trades in bot.db: ${row.count}`);

    const lastTrades = db.prepare("SELECT * FROM trades ORDER BY timestamp DESC LIMIT 10").all();
    console.log("\nLast 10 trades:");
    console.log(JSON.stringify(lastTrades, null, 2));
} catch (e) {
    console.error("Error querying database:", e);
} finally {
    db.close();
}
