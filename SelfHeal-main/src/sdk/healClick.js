/**
 * healClick.js — SDK wrapper for self-healing page.click()
 *
 * Flow:
 *   1. Check SQLite cache (instant — no AI)
 *   2. Try original selector
 *   3. On failure → failureWatcher bundles context → selectorEngine tries locally → Gemini fallback
 *   4. Confidence ≥ threshold → auto-apply fix, retry click, persist to DB, patch source
 *   5. Confidence < threshold + safeMode → log warning, emit confirm event for human review
 */

import { watchFailure } from '../watcher/failureWatcher.js';
import { findCachedHeal } from '../storage/healHistory.js';
import { getRunnerContext, emitEvent, getStepHistory } from '../runner/playwrightRunner.js';
import { patchTestFile } from '../patcher/patchWriter.js';
import config from '../../selfheal.config.js';

export async function healClick(page, selector, { intent = null } = {}) {
    const { io, testFile } = getRunnerContext();
    const threshold = config.healer?.confidenceThreshold ?? 0.8;

    emitEvent(io, 'step:start', { action: 'click', selector, intent, testFile });

    // ── 1. SQLite Cache — skip AI entirely on repeat runs ────────────
    const cachedFix = findCachedHeal(selector, intent);
    if (cachedFix && cachedFix.healed_selector) {
        console.log(`  [healClick] Cache hit: "${selector}" → "${cachedFix.healed_selector}"`);
        try {
            await page.click(cachedFix.healed_selector, { timeout: 5000 });
            emitEvent(io, 'step:pass', { action: 'click (cached)', selector: cachedFix.healed_selector });
            return;
        } catch (_cacheErr) {
            console.log(`  [healClick] Cached selector stale, re-healing...`);
        }
    }

    // ── 2. Try the original selector ─────────────────────────────────
    try {
        await page.click(selector, { timeout: 5000 });
        getStepHistory().push({ action: 'click', selector, status: 'pass' });
        emitEvent(io, 'step:pass', { action: 'click', selector });
        return;
    } catch (err) {
        console.log(`\n  [healClick] Failed: page.click("${selector}")`);
        getStepHistory().push({ action: 'click', selector, status: 'fail' });
        emitEvent(io, 'step:fail', { action: 'click', selector, error: err.message });

        // ── 3. Heal pipeline ─────────────────────────────────────────
        emitEvent(io, 'heal:start', { action: 'click', selector, intent });
        const healResult = await watchFailure(page, err, selector, intent, getStepHistory());
        emitEvent(io, 'heal:result', healResult);

        if (!healResult.newSelector) {
            throw err;
        }

        // ── 4. Confidence gate ───────────────────────────────────────
        if (healResult.confidence >= threshold) {
            console.log(`  [healClick] Healed: "${selector}" → "${healResult.newSelector}" (${Math.round(healResult.confidence * 100)}%)`);

            await page.click(healResult.newSelector, { timeout: 5000 });

            const lastStep = getStepHistory()[getStepHistory().length - 1];
            if (lastStep) lastStep.status = 'healed';

            emitEvent(io, 'step:healed', {
                action: 'click',
                selector: healResult.newSelector,
                extra: { rootCause: healResult.rootCause, confidence: healResult.confidence },
            });

            if (testFile) patchTestFile(testFile, selector, healResult.newSelector);
            // Note: saveHeal is already called inside askHealAgent — no double-save

        } else {
            emitEvent(io, 'heal:confirm', {
                action: 'click',
                brokenSelector: selector,
                suggestedSelector: healResult.newSelector,
                confidence: healResult.confidence,
                rootCause: healResult.rootCause,
                intent,
            });

            throw new Error(
                `[healClick] Confidence too low (${healResult.confidence}) for "${selector}". ` +
                `Suggested: "${healResult.newSelector}". Needs manual approval.`
            );
        }
    }
}
