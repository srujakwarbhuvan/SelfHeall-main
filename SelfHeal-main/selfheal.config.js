/**
 * selfheal.config.js
 * ============================================================
 * Central configuration for the SelfHeal framework.
 *
 * Resolution order (highest priority first):
 *   1. Environment variables (set in .env or the shell)
 *   2. Hardcoded defaults below
 *
 * Import this module anywhere you need config:
 *   import config from './selfheal.config.js';
 * ============================================================
 */

import "dotenv/config"; // loads .env into process.env

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Parse an env var as an integer, falling back to `defaultValue`. */
function envInt(key, defaultValue) {
  const raw = process.env[key];
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/** Parse an env var as a float, falling back to `defaultValue`. */
function envFloat(key, defaultValue) {
  const raw = process.env[key];
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/** Parse an env var as a boolean ("true"/"1"/"yes" → true), fallback to `defaultValue`. */
function envBool(key, defaultValue) {
  const raw = process.env[key];
  if (raw === undefined || raw === null) return defaultValue;
  return ["true", "1", "yes"].includes(raw.trim().toLowerCase());
}

// ─────────────────────────────────────────────────────────────
// CONFIG OBJECT
// ─────────────────────────────────────────────────────────────

const config = Object.freeze({
  // Test directory to scan
  testDir: './tests',
  
  // High timeout required for AI inference
  timeout: 60000,

  // ── AI / Heal Engine ───────────────────────────────────────
  
  healer: {
    model: 'gemini-2.5-flash',
    confidenceThreshold: 0.80, // Source of truth for confidence
  },

  /** Gemini API key — MUST be set in .env */
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS?.split(',')[0],

  /** Max heal attempts before failure */
  maxRetries: 3,

  /**
   * Safe mode: when true the runner only logs suggested fixes
   * but does NOT rewrite or re-execute the healed code.
   */
  safeMode: false,

  // ── Dashboard / WebSocket ──────────────────────────────────
  
  dashboard: {
    port: 3000,
    openOnStart: true
  },

  /** WebSocket port for live progress events */
  wsPort: 3001,

  // ── Database ───────────────────────────────────────────────

  /** Path for the SQLite heal history DB */
  dbPath: "./data/heals.db"
});

export default config;
