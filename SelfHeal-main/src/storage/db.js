import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(process.cwd(), '.selfheal', 'heals.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_file TEXT,
    total_steps INTEGER,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    status TEXT DEFAULT 'running'
  );

  CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER,
    step_index INTEGER,
    name TEXT,
    status TEXT,
    error TEXT,
    FOREIGN KEY(run_id) REFERENCES runs(id)
  );

  CREATE TABLE IF NOT EXISTS heals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id INTEGER,
    run_id INTEGER,
    original_selector TEXT NOT NULL,
    healed_selector   TEXT NOT NULL,
    intent            TEXT,
    test_file         TEXT,
    root_cause        TEXT,
    confidence        REAL,
    healed            BOOLEAN DEFAULT 1,
    method            TEXT DEFAULT 'gemini-ai',
    timestamp         DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(run_id) REFERENCES runs(id),
    FOREIGN KEY(step_id) REFERENCES steps(id)
  );
`);

export default db;
export function closeDb() {
    db.close();
}
