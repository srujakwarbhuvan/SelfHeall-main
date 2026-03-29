/**
 * healHistory.pg.js — PostgreSQL Implementation for Persistent Storage
 * ======================================================================
 * Use this as a drop-in replacement for healHistory.js if you want
 * long-term persistence on hosting platforms like Render.
 * 
 * SETUP:
 * 1. npm install pg
 * 2. Set DATABASE_URL in your .env
 * 3. Update all imports from './healHistory.js' to './healHistory.pg.js'
 * ======================================================================
 */

import pg from 'pg';
const { Pool } = pg;

// Use the environment-provided connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for Render Postgres
});

export async function initDb() {
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS heals (
        id              SERIAL PRIMARY KEY,
        original_selector TEXT NOT NULL,
        healed_selector   TEXT NOT NULL,
        intent            TEXT,
        test_file         TEXT,
        root_cause        TEXT,
        confidence        REAL,
        method            TEXT DEFAULT 'gemini-ai',
        timestamp         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        script_name       TEXT
      )
    `);
    console.log('  [DB] PostgreSQL initialized.');
    client.release();
  } catch (err) {
    console.error('  [DB] PostgreSQL init error:', err.message);
  }
}

export async function findCachedHeal(originalSelector, intent = null) {
  try {
    const query = intent
      ? 'SELECT * FROM heals WHERE original_selector = $1 AND intent = $2 AND confidence >= 0.8 ORDER BY id DESC LIMIT 1'
      : 'SELECT * FROM heals WHERE original_selector = $1 AND confidence >= 0.8 ORDER BY id DESC LIMIT 1';
    
    const params = intent ? [originalSelector, intent] : [originalSelector];
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
  } catch (err) {
    console.warn('  [DB] PostgreSQL findCachedHeal error:', err.message);
    return null;
  }
}

export async function saveHeal(entry) {
  if (process.env.SELFHEAL_DRY_RUN === 'true') return;

  try {
    const query = `
      INSERT INTO heals (original_selector, healed_selector, intent, test_file, root_cause, confidence, method, script_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    const params = [
      entry.original_selector,
      entry.healed_selector,
      entry.intent || null,
      entry.test_file || null,
      entry.root_cause || null,
      entry.confidence || 0,
      entry.method || 'gemini-ai',
      entry.script_name || null,
    ];
    
    await pool.query(query, params);
  } catch (err) {
    console.warn('  [DB] PostgreSQL saveHeal error:', err.message);
  }
}

export async function getAllHeals() {
  try {
    const { rows } = await pool.query('SELECT * FROM heals ORDER BY id DESC');
    return rows;
  } catch (err) {
    console.warn('  [DB] PostgreSQL getAllHeals error:', err.message);
    return [];
  }
}

export async function closeDb() {
  await pool.end();
}
