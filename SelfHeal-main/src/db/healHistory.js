import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(process.cwd(), '.selfheal', 'healHistory.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS heals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file TEXT NOT NULL,
    originalSelector TEXT NOT NULL,
    newSelector TEXT NOT NULL,
    confidence REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

/**
 * Saves a successful heal to the database.
 */
export function saveHeal({ file, originalSelector, newSelector, confidence }) {
  const stmt = db.prepare(`
    INSERT INTO heals (file, originalSelector, newSelector, confidence)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(file, originalSelector, newSelector, confidence);
}

/**
 * Retrieves a past heal for a given file and selector.
 */
export function getPastHeal({ file, selector }) {
  const stmt = db.prepare(`
    SELECT newSelector, confidence 
    FROM heals 
    WHERE file = ? AND originalSelector = ? 
    ORDER BY timestamp DESC 
    LIMIT 1
  `);
  return stmt.get(file, selector) || null;
}
