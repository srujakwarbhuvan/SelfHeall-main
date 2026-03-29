/**
 * ciRunner.js — CI/CD Mode Runner
 * ============================================================
 * Runs tests non-interactively with:
 *   - No dashboard, no interactive URL prompt
 *   - JSON output to stdout for pipeline parsing
 *   - Proper exit codes (0 = pass, 1 = failures)
 *   - Target URL from CLI args or env var
 * ============================================================
 */

import { chromium } from '@playwright/test';
import { setRunnerContext, getStepHistory, clearStepHistory } from '../src/runner/playwrightRunner.js';
import { writeReport } from '../src/storage/healReport.js';
import { initDb, closeDb } from '../src/storage/healHistory.js';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export async function executeCI(testFile, fragilityScores = []) {
    const absFile = path.resolve(testFile);
    if (!fs.existsSync(absFile)) {
        const result = { status: 'error', error: `File not found: ${absFile}`, testFile };
        console.log(JSON.stringify(result));
        process.exit(1);
    }

    // Initialize SQLite
    await initDb();

    const targetUrl = process.env.SELFHEAL_TARGET_URL || process.env.TARGET_URL || process.argv.find(a => a.startsWith('--url='))?.split('=')[1];

    if (!targetUrl) {
        const result = {
            status: 'error',
            error: 'CI mode requires TARGET_URL env var or --url=<url> flag',
            testFile,
        };
        console.log(JSON.stringify(result));
        process.exit(1);
    }

    const startTime = Date.now();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    clearStepHistory();

    setRunnerContext({ testFile: absFile, io: null });

    let status = 'passed';
    let errorMessage = null;

    try {
        const testScript = await import(pathToFileURL(absFile).href);
        const testFn = testScript.default || testScript.run;
        await testFn(page, { serverUrl: targetUrl, targetUrl });
    } catch (err) {
        status = 'failed';
        errorMessage = err.message;
    } finally {
        try { await browser.close(); } catch {}
    }

    const steps = getStepHistory();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    const passed = steps.filter(s => s.status === 'pass').length;
    const healed = steps.filter(s => s.status === 'healed').length;
    const failed = steps.filter(s => s.status === 'fail').length;

    await writeReport(absFile, steps);

    const ciResult = {
        status,
        testFile: path.basename(absFile),
        targetUrl,
        duration: `${duration}s`,
        summary: {
            total: steps.length,
            passed,
            healed,
            failed,
        },
        fragilityScores: fragilityScores.map(s => ({
            selector: s.selector,
            score: s.fragilityScore,
            risk: s.risk,
        })),
        steps: steps.map(s => ({
            action: s.action,
            selector: s.selector,
            status: s.status,
        })),
        error: errorMessage,
    };

    // JSON output for pipeline consumption
    console.log(JSON.stringify(ciResult, null, 2));

    closeDb();
    process.exit(status === 'passed' ? 0 : 1);
}
