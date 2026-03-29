/**
 * healAgent.js — Unified Gemini AI Heal Agent
 * ============================================================
 * Single source of truth for all AI-powered selector healing.
 * Features:
 *   - Multi-key API rotation with automatic failover
 *   - Exponential backoff on rate limits (429)
 *   - Intent-aware prompting (critical for high-confidence heals)
 *   - Screenshot context for visual grounding
 *   - SQLite cache integration (skip AI on repeat failures)
 *   - CONTRACT.js compliance for structured I/O
 * ============================================================
 */

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { findCachedHeal, saveHeal } from '../storage/healHistory.js';
import { makeHealResult, HEAL_STRATEGIES } from '../../CONTRACT.js';

dotenv.config();

// ── API Key Management ───────────────────────────────────────
function getApiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEYS) {
    keys.push(...process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean));
  } else if (process.env.GEMINI_API_KEY) {
    keys.push(process.env.GEMINI_API_KEY.trim());
  }
  return keys;
}

const apiKeys = getApiKeys();
let currentKeyIndex = 0;

/** Round-robin to the next available key */
function rotateKey() {
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
}

// ── Backoff Helper ───────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Prompt Builder ───────────────────────────────────────────
function buildPrompt({ selector, intent, error, domSnapshot, lastSteps, screenshotBase64 }) {
  const truncatedDom = (domSnapshot || '').slice(0, 12000);

  const intentBlock = intent
    ? `\nCRITICAL INTENT LAYER:
The human intent for this element was: "${intent}"
You MUST find the element that achieves this exact human goal, even if the entire page layout changed.
Do not just find a similar-looking selector — find the element that fulfills the intent.`
    : `\nYou must find the element that visually and structurally matches what the broken selector used to target.`;

  const stepsContext = lastSteps && lastSteps.length > 0
    ? `\nRECENT STEPS: ${lastSteps.map(s => `${s.action}(${s.selector}) → ${s.status}`).join(' | ')}`
    : '';

  const screenshotNote = screenshotBase64
    ? '\nA screenshot of the page at the moment of failure is also provided for visual context.'
    : '';

  return `You are a Playwright test self-healing agent. A test step failed because a CSS selector no longer matches any element in the DOM.

ERROR MESSAGE: ${error || 'Element not found'}
BROKEN SELECTOR: ${selector}
${stepsContext}
${intentBlock}
${screenshotNote}

CURRENT DOM (Truncated to 12KB):
${truncatedDom}

IMPORTANT RULES:
1. Return ONLY a valid JSON object — no markdown fences, no explanation text.
2. The "new_selector" must be a valid CSS selector or Playwright selector that exists in the DOM above.
3. If you cannot find a suitable replacement, set confidence to 0 and new_selector to null.
4. Prefer stable selectors: [data-testid], [aria-label], #id over fragile class/nth-child selectors.

Reply with ONLY this JSON:
{ "root_cause": "brief explanation of why the selector broke", "new_selector": "the exact CSS selector", "confidence": 0.95 }`;
}

// ── Main Heal Function ───────────────────────────────────────
/**
 * Ask the Gemini AI agent to heal a broken selector.
 *
 * @param {Object} failureBundle - Context about the failure
 * @param {string} failureBundle.selector - The broken selector
 * @param {string} failureBundle.error - Error message
 * @param {string} failureBundle.intent - Human intent string
 * @param {string} failureBundle.domSnapshot - Page HTML
 * @param {Array}  failureBundle.recentSteps - Recent step history
 * @param {string} failureBundle.screenshotBase64 - Base64 screenshot
 * @returns {Object} CONTRACT.js HealResult-compatible object
 */
export async function askHealAgent(failureBundle) {
  const {
    selector,
    error,
    intent,
    domSnapshot,
    recentSteps = [],
    screenshotBase64 = '',
  } = failureBundle;

  // ── 1. Cache Lookup — skip AI entirely on repeat failures ──
  const cached = findCachedHeal(selector, intent);
  if (cached && cached.healed_selector) {
    console.log(`  💾 [HealAgent] Cache hit: "${selector}" → "${cached.healed_selector}"`);
    return makeHealResult({
      healed: true,
      newSelector: cached.healed_selector,
      confidence: cached.confidence || 0.95,
      reasoning: cached.root_cause || 'Previously healed (cached)',
      strategy: 'cache',
      warnings: [],
    });
  }

  // ── 2. Build the Gemini prompt ─────────────────────────────
  const prompt = buildPrompt({
    selector,
    intent,
    error,
    domSnapshot,
    lastSteps: recentSteps,
    screenshotBase64,
  });

  if (apiKeys.length === 0) {
    console.error('  ❌ [HealAgent] No Gemini API keys found in .env (GEMINI_API_KEYS or GEMINI_API_KEY)');
    return makeHealResult({
      healed: false,
      reasoning: 'No API keys configured',
      strategy: HEAL_STRATEGIES.NONE,
    });
  }

  // ── 3. Try each API key with exponential backoff ───────────
  const maxAttempts = apiKeys.length * 2; // Allow cycling through keys twice
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    const key = apiKeys[currentKeyIndex];
    attempt++;

    try {
      const ai = new GoogleGenAI({ apiKey: key });

      // Build content — only add screenshot if it's a real base64 string (>100 chars)
      const parts = [{ text: prompt }];
      
      if (screenshotBase64 && screenshotBase64.length > 100) {
        // Remove data URL prefix if present
        const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: 'image/png'
          }
        });
      }

      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
      });

      let text = (typeof res.text === 'function' ? res.text() : res.text)
        .trim()
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '')
        .trim();

      const result = JSON.parse(text);

      if (!result.new_selector && !result.newSelector) {
        return makeHealResult({
          healed: false,
          reasoning: result.root_cause || result.rootCause || 'AI could not determine a fix',
          strategy: HEAL_STRATEGIES.NONE,
        });
      }

      const newSelector = result.new_selector || result.newSelector;
      const rootCause = result.root_cause || result.rootCause || 'AI analysis completed';
      const confidence = result.confidence || 0.8;
      const method = intent ? 'gemini-ai-intent' : 'gemini-ai';

      // Persist to SQLite for future cache hits
      saveHeal({
        original_selector: selector,
        healed_selector: newSelector,
        intent,
        root_cause: rootCause,
        confidence,
        method,
      });

      return makeHealResult({
        healed: true,
        newSelector,
        confidence,
        reasoning: rootCause,
        strategy: HEAL_STRATEGIES.GEMINI_VISION,
        warnings: [],
      });

    } catch (err) {
      lastError = err;
      const isRateLimit = err.status === 429 || err.message?.includes('429') || err.message?.includes('quota');
      const isAuthError = err.status === 401 || err.status === 403;

      if (isRateLimit) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.warn(`  ⚠️ [HealAgent] Rate limited (key ${key.substring(0, 8)}...), backing off ${backoffMs}ms`);
        rotateKey();
        await sleep(backoffMs);
      } else if (isAuthError) {
        console.warn(`  ⚠️ [HealAgent] Auth error on key ${key.substring(0, 8)}..., rotating`);
        rotateKey();
      } else {
        console.warn(`  ⚠️ [HealAgent] API error (key ${key.substring(0, 8)}...): ${err.message}`);
        rotateKey();
      }
    }
  }

  console.error('  ❌ [HealAgent] All API keys exhausted after', maxAttempts, 'attempts. Last error:', lastError?.message);
  return makeHealResult({
    healed: false,
    reasoning: `Gemini API failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`,
    strategy: HEAL_STRATEGIES.NONE,
    warnings: ['All API keys exhausted — check key quotas or add more keys to GEMINI_API_KEYS'],
  });
}
