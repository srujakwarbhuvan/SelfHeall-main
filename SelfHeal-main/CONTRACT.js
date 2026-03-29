/**
 * CONTRACT.js
 * ============================================================
 * THIS FILE IS THE HANDSHAKE BETWEEN THE RUNNER AND THE HEAL ENGINE.
 *
 * Dev 1 (Runner)   → sends a  failureBundle  to the heal engine.
 * Dev 2 (Heal Engine) → replies with a  healResult.
 *
 * ⚠️  NEITHER DEVELOPER CHANGES THE SHAPE OF THESE OBJECTS
 *     WITHOUT NOTIFYING THE OTHER AND BUMPING CONTRACT VERSION.
 * ============================================================
 */

export const CONTRACT_VERSION = "1.0.0";

// ─────────────────────────────────────────────────────────────
// FAILURE BUNDLE
// Shape of the object the runner sends to the heal engine when
// a Playwright test step fails.
// ─────────────────────────────────────────────────────────────
/**
 * @typedef {Object} FailureBundle
 *
 * @property {string}   testFile       - Absolute path to the test file.
 * @property {string}   testName       - Human-readable name of the failing test.
 * @property {string}   stepCode       - The exact source code of the failing step.
 * @property {string}   errorMessage   - The raw error / stack trace string.
 * @property {string}   htmlSnapshot   - Full page HTML captured at the moment of failure.
 * @property {string}   screenshotPath - Absolute path to the failure screenshot (PNG).
 * @property {string}   selector       - The CSS / XPath selector that failed (empty string if N/A).
 * @property {number}   attemptNumber  - Which retry attempt this is (1-based).
 * @property {string}   timestamp      - ISO-8601 timestamp of the failure.
 * @property {Object}   [meta]         - Optional bag for any extra runner metadata.
 */
export const failureBundleShape = {
  testFile: "",        // string  — "/abs/path/to/test.spec.js"
  testName: "",        // string  — "Login page › should log in successfully"
  stepCode: "",        // string  — "await page.click('#login-btn')"
  errorMessage: "",    // string  — "TimeoutError: waiting for selector..."
  htmlSnapshot: "",    // string  — full outer HTML of page.content()
  screenshotPath: "",  // string  — "/abs/path/to/screenshot.png"
  selector: "",        // string  — "#login-btn"  (may be empty)
  attemptNumber: 1,    // number  — 1-based retry counter
  timestamp: "",       // string  — new Date().toISOString()
  meta: {},            // object  — extensible metadata bag (optional)
};

// ─────────────────────────────────────────────────────────────
// HEAL RESULT
// Shape of the object the heal engine returns to the runner
// after analysing a failureBundle.
// ─────────────────────────────────────────────────────────────
/**
 * @typedef {Object} HealResult
 *
 * @property {boolean}  healed           - true if a fix was found.
 * @property {string}   newSelector      - Replacement selector (empty string if not applicable).
 * @property {string}   newStepCode      - Full replacement step code (empty string if not applicable).
 * @property {number}   confidence       - Float 0–1; how confident the model is in the fix.
 * @property {string}   reasoning        - Human-readable explanation from the model.
 * @property {string}   strategy         - Which heal strategy was used (e.g. "gemini-vision").
 * @property {string[]} warnings         - Non-fatal notes the runner should log.
 * @property {string}   timestamp        - ISO-8601 timestamp of when the heal was produced.
 * @property {Object}   [meta]           - Optional bag for any extra engine metadata.
 */
export const healResultShape = {
  healed: false,       // boolean — did we find a usable fix?
  newSelector: "",     // string  — "button[data-testid='login']"
  newStepCode: "",     // string  — "await page.click(\"button[data-testid='login']\")"
  confidence: 0,       // number  — 0.0 … 1.0
  reasoning: "",       // string  — model explanation
  strategy: "",        // string  — "gemini-vision" | "dom-heuristic" | "none"
  warnings: [],        // string[] — advisory messages
  timestamp: "",       // string  — new Date().toISOString()
  meta: {},            // object  — extensible metadata bag (optional)
};

// ─────────────────────────────────────────────────────────────
// ALLOWED STRATEGY VALUES  (kept here to avoid magic strings)
// ─────────────────────────────────────────────────────────────
export const HEAL_STRATEGIES = Object.freeze({
  GEMINI_VISION: "gemini-vision",   // Screenshot + HTML sent to Gemini multimodal
  DOM_HEURISTIC: "dom-heuristic",   // Pure DOM similarity heuristic, no LLM
  NONE: "none",                     // No viable fix found
});

// ─────────────────────────────────────────────────────────────
// QUICK FACTORY HELPERS  (keep both sides in sync easily)
// ─────────────────────────────────────────────────────────────

/** Returns a fresh, default-valued failureBundle. Caller fills in real data. */
export function makeFailureBundle(overrides = {}) {
  return { ...failureBundleShape, timestamp: new Date().toISOString(), ...overrides };
}

/** Returns a fresh, default-valued healResult. Engine fills in real data. */
export function makeHealResult(overrides = {}) {
  return { ...healResultShape, timestamp: new Date().toISOString(), ...overrides };
}
