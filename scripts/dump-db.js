const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../bot.db');
const db = new Database(dbPath);

try {
    const processed = db.prepare("SELECT * FROM processed_activities ORDER BY timestamp DESC").all();
    console.log(`Found ${processed.length} processed activities.`);

    const positions = db.prepare("SELECT * FROM positions").all();
    console.log(`Found ${positions.length} recorded positions.`);

    // Write to file for full analysis
    fs.writeFileSync('db_dump.json', JSON.stringify({ processed, positions }, null, 2));
    console.log("Dumped DB to db_dump.json");

} catch (e) {
    console.error("Error:", e);
} finally {
    db.close();
}
