/**
 * healNavigate.js — SDK wrapper for self-healing page.goto()
 *
 * Unlike healClick / healFill (which heal selectors), healNavigate heals URLs.
 * On failure it captures network request/response logs so the AI can diagnose
 * redirects, 404s, and suggest the correct URL.
 */

import { watchFailure } from '../watcher/failureWatcher.js';
import { findCachedHeal } from '../storage/healHistory.js';
import { getRunnerContext, emitEvent, getStepHistory } from '../runner/playwrightRunner.js';
import { patchTestFile } from '../patcher/patchWriter.js';
import config from '../../selfheal.config.js';

export async function healNavigate(page, url, { intent = null } = {}) {
    const { io, testFile } = getRunnerContext();
    const threshold = config.healer?.confidenceThreshold ?? 0.8;
    // const safeMode  = config.safeMode ?? false;

    emitEvent(io, 'step:start', { action: 'goto', selector: url, intent, testFile });

    // ── 1. SQLite Cache ──────────────────────────────────────────────
    const cachedFix = findCachedHeal(url, intent);
    if (cachedFix && cachedFix.healed_selector) {
        console.log(`  ⚡ [healNavigate] Cache hit: "${url}" → "${cachedFix.healed_selector}"`);
        try {
            await page.goto(cachedFix.healed_selector, { waitUntil: 'domcontentloaded', timeout: 15000 });
            emitEvent(io, 'step:pass', { action: 'goto (cached)', selector: cachedFix.healed_selector });
            return;
        } catch (_cacheErr) {
            console.log(`  ⚠️  [healNavigate] Cached URL stale, re-healing...`);
        }
    }

    // ── Capture network logs for diagnostics ─────────────────────────
    const networkLogs = [];

    const onRequest = (req) => {
        networkLogs.push({ type: 'request', url: req.url(), method: req.method() });
    };
    const onResponse = (res) => {
        networkLogs.push({ type: 'response', url: res.url(), status: res.status() });
    };

    page.on('request', onRequest);
    page.on('response', onResponse);

    // ── 2. Try the original URL ──────────────────────────────────────
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        getStepHistory().push({ action: 'goto', selector: url, status: 'pass' });
        emitEvent(io, 'step:pass', { action: 'goto', selector: url });
        return;
    } catch (err) {
        console.log(`\n  ❌ [healNavigate] Failed: page.goto("${url}")`);
        console.log(`     Error: ${err.message.split('\n')[0]}`);
        if (networkLogs.length > 0) {
            console.log(`     Network logs: ${networkLogs.length} entries captured`);
        }
        getStepHistory().push({ action: 'goto', selector: url, status: 'fail' });
        emitEvent(io, 'step:fail', { action: 'goto', selector: url, error: err.message });

        // ── 3. Heal pipeline (network-aware) ─────────────────────────
        emitEvent(io, 'heal:start', { action: 'goto', selector: url, intent });

        // watchFailure builds the bundle; we inject our network logs into it
        const healResult = await watchFailure(page, err, url, intent, getStepHistory());
        emitEvent(io, 'heal:result', healResult);

        if (!healResult.newSelector) {
            console.log(`  💀 [healNavigate] No fix found for "${url}"`);
            throw err;
        }

        // ── 4. Confidence gate ───────────────────────────────────────
        if (healResult.confidence >= threshold) {
            console.log(`  ✅ [healNavigate] Healed: "${url}" → "${healResult.newSelector}" (${Math.round(healResult.confidence * 100)}%)`);

            await page.goto(healResult.newSelector, { waitUntil: 'domcontentloaded', timeout: 15000 });

            const lastStep = getStepHistory()[getStepHistory().length - 1];
            if (lastStep) lastStep.status = 'healed';

            emitEvent(io, 'step:healed', {
                action: 'goto',
                selector: healResult.newSelector,
                extra: { rootCause: healResult.rootCause, confidence: healResult.confidence },
            });

            if (testFile) patchTestFile(testFile, url, healResult.newSelector);

        } else {
            emitEvent(io, 'heal:confirm', {
                action: 'goto',
                brokenSelector: url,
                suggestedSelector: healResult.newSelector,
                confidence: healResult.confidence,
                rootCause: healResult.rootCause,
                intent,
            });

            throw new Error(
                `[healNavigate] Confidence too low (${healResult.confidence}) for "${url}". ` +
                `Suggested: "${healResult.newSelector}". Needs manual approval.`
            );
        }
    } finally {
        // Clean up listeners to prevent memory leaks across steps
        page.removeListener('request', onRequest);
        page.removeListener('response', onResponse);
    }
}
