/**
 * healHistory.js — SQLite Heal Cache (Pure JS, zero native deps)
 * ============================================================
 * Uses sql.js (Emscripten-compiled SQLite) so the project works
 * on any OS/Node version without C++ build tools.
 *
 * ⚠️ RENDER DEPLOYMENT NOTE: 
 * Because Render's filesystem is ephemeral, this SQLite file will be 
 * reset on every deploy/restart.
 *
 * OPTION A (Current): Keep sql.js (Data resets on deploy — fine for demos).
 * OPTION B: Swap to a managed database (e.g., Render PostgreSQL). 
 *           Requires 'pg' package. See src/storage/healHistory.pg.js for reference.
 * OPTION C (Recommended): Use the Firebase sync bridge (integrated in src/db/firebaseClient.js).
 * ============================================================
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'heals.db');

let db = null;
let SQL = null;

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function persist() {
  if (!db) return;
  try {
    ensureDataDir();
    const data = db.export();
    const buffer = Buffer.from(data);
    const tmpPath = `${DB_PATH}.tmp`;
    
    // Atomic write strategy: write to tmp, then rename.
    // This prevents corruption if the process crashes mid-write.
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    console.error(`  ⚠️  [healHistory] Database persist failed: ${err.message}`);
  }
}

export async function initDb() {
  if (db) return db;
  SQL = await initSqlJs();
  ensureDataDir();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS heals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      original_selector TEXT NOT NULL,
      healed_selector   TEXT NOT NULL,
      intent            TEXT,
      test_file         TEXT,
      root_cause        TEXT,
      confidence        REAL,
      method            TEXT DEFAULT 'gemini-ai',
      timestamp         TEXT DEFAULT (datetime('now')),
      script_name       TEXT
    )
  `);
  persist();
  return db;
}

/** Synchronous getter — initializes lazily on first call. */
export function getDb() {
  if (!db) {
    // Synchronous fallback: init inline (for backwards compat)
    // Callers should prefer initDb() at startup
    throw new Error('DB not initialized. Call await initDb() first.');
  }
  return db;
}

export function findCachedHeal(originalSelector, intent = null) {
  if (!db) return null;

  try {
    const query = intent
      ? 'SELECT * FROM heals WHERE original_selector = ? AND intent = ? AND confidence >= 0.8 ORDER BY id DESC LIMIT 1'
      : 'SELECT * FROM heals WHERE original_selector = ? AND confidence >= 0.8 ORDER BY id DESC LIMIT 1';

    const stmt = db.prepare(query);
    const params = intent ? [originalSelector, intent] : [originalSelector];
    stmt.bind(params);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  } catch (e) {
    console.warn('[healHistory] findCachedHeal error:', e.message);
    return null;
  }
}

export function saveHeal(entry) {
  if (!db) return;
  if (process.env.SELFHEAL_DRY_RUN === 'true') {
    return; // Don't log here to avoid cluttering human-in-the-loop flows
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO heals (original_selector, healed_selector, intent, test_file, root_cause, confidence, method, script_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      entry.original_selector,
      entry.healed_selector,
      entry.intent || null,
      entry.test_file || null,
      entry.root_cause || null,
      entry.confidence || 0,
      entry.method || 'gemini-ai',
      entry.script_name || null,
    ]);
    stmt.free();
    persist();
  } catch (e) {
    console.warn('[healHistory] saveHeal error:', e.message);
  }
}

export function getAllHeals() {
  if (!db) return [];

  try {
    const results = [];
    const stmt = db.prepare('SELECT * FROM heals ORDER BY id DESC');
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (e) {
    console.warn('[healHistory] getAllHeals error:', e.message);
    return [];
  }
}

export function closeDb() {
  if (db) {
    persist();
    db.close();
    db = null;
  }
}
