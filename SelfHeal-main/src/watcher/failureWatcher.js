/**
 * failureWatcher.js — Failure Context Capture & Heal Orchestration
 * ============================================================
 * Captures full failure context (DOM, screenshot, console errors),
 * then orchestrates the multi-layer healing pipeline:
 *   1. Local DOM heuristics (selectorEngine)
 *   2. Gemini AI agent (healAgent) — only if local confidence < threshold
 *
 * Returns a CONTRACT.js-compatible result with normalized keys.
 * ============================================================
 */

import { askHealAgent } from '../agent/healAgent.js';
import { scanDomForHeal } from '../selector/selectorEngine.js';
import { HEAL_STRATEGIES } from '../../CONTRACT.js';

const LOCAL_CONFIDENCE_THRESHOLD = 0.8;

export async function watchFailure(page, error, selector, intent, stepHistory = []) {
    // ── 1. Capture DOM snapshot (with Shadow DOM flattening) ──
    let domSnapshot = '';
    try {
        domSnapshot = await page.evaluate(() => {
            function buildTree(node) {
                if (node.nodeType === 3) return node.cloneNode(false);
                if (node.nodeType !== 1) return null;
                if (['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'IFRAME', 'VIDEO'].includes(node.nodeName)) {
                    return null;
                }
                let clone = node.cloneNode(false);
                const roots = node.shadowRoot ? [node.shadowRoot, node] : [node];
                for (let root of roots) {
                    for (let child of Array.from(root.childNodes)) {
                        let childClone = buildTree(child);
                        if (childClone) clone.appendChild(childClone);
                    }
                }
                return clone;
            }
            const flattenedRoot = buildTree(document.documentElement);
            return flattenedRoot ? flattenedRoot.outerHTML : '';
        });
    } catch (e) {
        console.warn('[Watcher] Shadow DOM flatten failed, falling back to page.content()');
        try {
            domSnapshot = await page.content();
        } catch (_) {
            domSnapshot = '<html><body>Failed to capture DOM</body></html>';
        }
    }

    // ── 2. Capture screenshot (base64) ───────────────────────
    let screenshotBase64 = '';
    try {
        screenshotBase64 = await page.screenshot({ encoding: 'base64', fullPage: true });
    } catch (e) {
        console.warn('[Watcher] Could not capture screenshot:', e.message);
    }

    const recentSteps = stepHistory.slice(-5);

    const failureBundle = {
        error: error.message,
        selector,
        intent,
        domSnapshot,
        recentSteps,
        screenshotBase64,
    };

    console.log(`\n  [Watcher] Captured failure for selector: '${selector}'`);

    // ── 3. Try local DOM heuristic engine first ──────────────
    console.log('  [Watcher] Running local selectorEngine scan...');
    const localHeal = scanDomForHeal(failureBundle);

    if (localHeal.confidence >= LOCAL_CONFIDENCE_THRESHOLD) {
        console.log(`  [Watcher] Local Engine resolved with confidence ${localHeal.confidence}`);
        return {
            rootCause: localHeal.rootCause,
            newSelector: localHeal.newSelector,
            confidence: localHeal.confidence,
            strategy: HEAL_STRATEGIES.DOM_HEURISTIC,
        };
    }

    // ── 4. Fall back to Gemini AI ────────────────────────────
    console.log(`  [Watcher] Local confidence too low (${localHeal.confidence}). Calling Gemini 2.5 Flash...`);
    const aiResult = await askHealAgent(failureBundle);

    // Normalize the CONTRACT.js HealResult to the shape the runner expects
    return {
        rootCause: aiResult.reasoning,
        newSelector: aiResult.newSelector,
        confidence: aiResult.confidence,
        strategy: aiResult.strategy,
        warnings: aiResult.warnings,
    };
}
