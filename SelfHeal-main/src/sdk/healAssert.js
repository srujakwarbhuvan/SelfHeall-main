/**
 * healAssert.js — SDK wrapper for self-healing assertions
 * ============================================================
 * Instead of just healing selectors, healAssert heals broken
 * assertions by analyzing the actual page state vs expected state.
 *
 * Example:
 *   await healAssert(page, '#price', 'textContent', '$49.99', {
 *     intent: 'Verify the product price is displayed correctly',
 *   });
 *
 * If the selector is broken, it heals the selector.
 * If the value doesn't match, it reports the mismatch with context.
 * ============================================================
 */

import { watchFailure } from '../watcher/failureWatcher.js';
import { findCachedHeal, saveHeal } from '../storage/healHistory.js';
import { getRunnerContext, emitEvent, getStepHistory } from '../runner/playwrightRunner.js';
import { patchTestFile } from '../patcher/patchWriter.js';
import config from '../../selfheal.config.js';

/**
 * @param {import('playwright').Page} page
 * @param {string} selector - CSS selector to find the element
 * @param {string} property - Property to check: 'textContent', 'innerText', 'value', 'visible', 'checked', 'count'
 * @param {*} expected - Expected value
 * @param {Object} options
 * @param {string} options.intent - Human intent string
 */
export async function healAssert(page, selector, property, expected, { intent = null } = {}) {
    const { io, testFile } = getRunnerContext();
    const threshold = config.healer?.confidenceThreshold ?? 0.8;

    emitEvent(io, 'step:start', { action: `assert:${property}`, selector, intent, testFile });

    // ── 1. Cache check ───────────────────────────────────────
    const cachedFix = findCachedHeal(selector, intent);
    if (cachedFix && cachedFix.healed_selector) {
        try {
            const result = await checkAssertion(page, cachedFix.healed_selector, property, expected);
            if (result.pass) {
                emitEvent(io, 'step:pass', { action: `assert:${property} (cached)`, selector: cachedFix.healed_selector });
                return;
            }
        } catch (_) {
            // Cached selector stale — fall through
        }
    }

    // ── 2. Try original selector ─────────────────────────────
    try {
        const result = await checkAssertion(page, selector, property, expected);
        if (result.pass) {
            getStepHistory().push({ action: `assert:${property}`, selector, status: 'pass' });
            emitEvent(io, 'step:pass', { action: `assert:${property}`, selector });
            return;
        }

        // Assertion mismatch (selector worked but value is wrong)
        const mismatchMsg = `Assertion failed: expected ${property} to be "${expected}" but got "${result.actual}"`;
        console.log(`\n  ❌ [healAssert] ${mismatchMsg}`);
        getStepHistory().push({ action: `assert:${property}`, selector, status: 'fail' });
        emitEvent(io, 'step:fail', { action: `assert:${property}`, selector, error: mismatchMsg });
        throw new Error(mismatchMsg);

    } catch (err) {
        // Selector not found — heal the selector
        if (err.message.includes('Assertion failed:')) throw err; // Don't heal value mismatches

        console.log(`\n  ❌ [healAssert] Selector "${selector}" not found`);
        getStepHistory().push({ action: `assert:${property}`, selector, status: 'fail' });
        emitEvent(io, 'step:fail', { action: `assert:${property}`, selector, error: err.message });

        // ── 3. Heal pipeline ─────────────────────────────────
        emitEvent(io, 'heal:start', { action: `assert:${property}`, selector, intent });

        const healResult = await watchFailure(page, err, selector, intent, getStepHistory());
        emitEvent(io, 'heal:result', healResult);

        if (!healResult.newSelector) {
            throw err;
        }

        if (healResult.confidence >= threshold) {
            console.log(`  ✅ [healAssert] Healed: "${selector}" → "${healResult.newSelector}"`);

            // Verify the assertion with the healed selector
            const result = await checkAssertion(page, healResult.newSelector, property, expected);
            if (!result.pass) {
                throw new Error(`Healed selector found, but assertion still fails: expected "${expected}" got "${result.actual}"`);
            }

            const lastStep = getStepHistory()[getStepHistory().length - 1];
            if (lastStep) lastStep.status = 'healed';

            emitEvent(io, 'step:healed', {
                action: `assert:${property}`,
                selector: healResult.newSelector,
                extra: { rootCause: healResult.rootCause, confidence: healResult.confidence },
            });

            if (testFile) patchTestFile(testFile, selector, healResult.newSelector);
            saveHeal({
                original_selector: selector,
                healed_selector: healResult.newSelector,
                intent,
                test_file: testFile,
                root_cause: healResult.rootCause,
                confidence: healResult.confidence,
            });
        } else {
            throw new Error(
                `[healAssert] Confidence too low (${healResult.confidence}) for "${selector}". ` +
                `Suggested: "${healResult.newSelector}".`
            );
        }
    }
}

/**
 * Check an assertion against a page element.
 */
async function checkAssertion(page, selector, property, expected) {
    switch (property) {
        case 'textContent': {
            const el = await page.waitForSelector(selector, { timeout: 5000 });
            const actual = (await el.textContent()).trim();
            return { pass: actual === expected, actual };
        }
        case 'innerText': {
            const el = await page.waitForSelector(selector, { timeout: 5000 });
            const actual = (await el.innerText()).trim();
            return { pass: actual === expected, actual };
        }
        case 'value': {
            const actual = await page.inputValue(selector, { timeout: 5000 });
            return { pass: actual === expected, actual };
        }
        case 'visible': {
            const visible = await page.isVisible(selector);
            return { pass: visible === expected, actual: visible };
        }
        case 'checked': {
            const checked = await page.isChecked(selector);
            return { pass: checked === expected, actual: checked };
        }
        case 'count': {
            const elements = await page.$$(selector);
            const actual = elements.length;
            return { pass: actual === expected, actual };
        }
        default:
            throw new Error(`[healAssert] Unknown property: "${property}". Use: textContent, innerText, value, visible, checked, count`);
    }
}
