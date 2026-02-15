const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../bot.db');
const db = new Database(dbPath);

try {
    const tradeCount = db.prepare("SELECT COUNT(*) as count FROM positions").get();
    console.log(`Open/Closed positions in database: ${tradeCount.count}`);

    const activityCount = db.prepare("SELECT COUNT(*) as count FROM processed_activities").get();
    console.log(`Processed activities: ${activityCount.count}`);

    const stats = db.prepare("SELECT * FROM stats").all();
    console.log("\nStats:");
    console.log(JSON.stringify(stats, null, 2));

    const lastPositions = db.prepare("SELECT * FROM positions ORDER BY timestamp DESC LIMIT 10").all();
    console.log("\nLast 10 positions:");
    lastPositions.forEach(p => {
        console.log(`- ${p.status} ${p.outcome} on ${p.market_id}: Entry $${p.entry_price}, Amount $${p.amount}`);
    });

} catch (e) {
    console.error("Error:", e);
} finally {
    db.close();
}
