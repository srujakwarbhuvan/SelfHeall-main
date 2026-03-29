/**
 * healFill.js — SDK wrapper for self-healing page.fill()
 *
 * Same pattern as healClick but wraps page.fill(selector, value).
 * The value is preserved through the retry so the healed field gets populated.
 */

import { watchFailure } from '../watcher/failureWatcher.js';
import { findCachedHeal } from '../storage/healHistory.js';
import { getRunnerContext, emitEvent, getStepHistory } from '../runner/playwrightRunner.js';
import { patchTestFile } from '../patcher/patchWriter.js';
import config from '../../selfheal.config.js';

export async function healFill(page, selector, value, { intent = null } = {}) {
    const { io, testFile } = getRunnerContext();
    const threshold = config.healer?.confidenceThreshold ?? 0.8;

    emitEvent(io, 'step:start', { action: 'fill', selector, intent, testFile });

    // ── 1. SQLite Cache ──────────────────────────────────────────────
    const cachedFix = findCachedHeal(selector, intent);
    if (cachedFix && cachedFix.healed_selector) {
        console.log(`  [healFill] Cache hit: "${selector}" → "${cachedFix.healed_selector}"`);
        try {
            await page.fill(cachedFix.healed_selector, value, { timeout: 5000 });
            emitEvent(io, 'step:pass', { action: 'fill (cached)', selector: cachedFix.healed_selector });
            return;
        } catch (_cacheErr) {
            console.log(`  [healFill] Cached selector stale, re-healing...`);
        }
    }

    // ── 2. Try original selector ─────────────────────────────────────
    try {
        await page.fill(selector, value, { timeout: 5000 });
        getStepHistory().push({ action: 'fill', selector, status: 'pass' });
        emitEvent(io, 'step:pass', { action: 'fill', selector });
        return;
    } catch (err) {
        console.log(`\n  [healFill] Failed: page.fill("${selector}", "${value}")`);
        getStepHistory().push({ action: 'fill', selector, status: 'fail' });
        emitEvent(io, 'step:fail', { action: 'fill', selector, error: err.message });

        // ── 3. Heal pipeline ─────────────────────────────────────────
        emitEvent(io, 'heal:start', { action: 'fill', selector, intent });
        const healResult = await watchFailure(page, err, selector, intent, getStepHistory());
        emitEvent(io, 'heal:result', healResult);

        if (!healResult.newSelector) {
            throw err;
        }

        // ── 4. Confidence gate ───────────────────────────────────────
        if (healResult.confidence >= threshold) {
            console.log(`  [healFill] Healed: "${selector}" → "${healResult.newSelector}" (${Math.round(healResult.confidence * 100)}%)`);

            await page.fill(healResult.newSelector, value, { timeout: 5000 });

            const lastStep = getStepHistory()[getStepHistory().length - 1];
            if (lastStep) lastStep.status = 'healed';

            emitEvent(io, 'step:healed', {
                action: 'fill',
                selector: healResult.newSelector,
                extra: { rootCause: healResult.rootCause, confidence: healResult.confidence },
            });

            if (testFile) patchTestFile(testFile, selector, healResult.newSelector);

        } else {
            emitEvent(io, 'heal:confirm', {
                action: 'fill',
                brokenSelector: selector,
                suggestedSelector: healResult.newSelector,
                confidence: healResult.confidence,
                rootCause: healResult.rootCause,
                intent,
            });

            throw new Error(
                `[healFill] Confidence too low (${healResult.confidence}) for "${selector}". ` +
                `Suggested: "${healResult.newSelector}". Needs manual approval.`
            );
        }
    }
}
