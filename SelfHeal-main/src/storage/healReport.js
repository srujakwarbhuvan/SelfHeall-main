/**
 * healReport.js — Rich Report Generation with Stability Trending
 * ============================================================
 * Generates comprehensive heal reports with:
 *   - Per-step breakdown with timing and confidence
 *   - Stability score trending across runs
 *   - Fragility → heal correlation analysis
 *   - JSON + optional CSV export
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllHeals } from './healHistory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_PATH = path.join(__dirname, '..', '..', 'heal-report.json');
const HISTORY_PATH = path.join(__dirname, '..', '..', 'data', 'run-history.json');

/**
 * Load historical run data for trending.
 */
function loadRunHistory() {
    try {
        if (fs.existsSync(HISTORY_PATH)) {
            return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
        }
    } catch {}
    return [];
}

function saveRunHistory(history) {
    const dir = path.dirname(HISTORY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Keep last 100 runs
    const trimmed = history.slice(-100);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');
}

/**
 * Calculate a stability score (0–100) based on how many steps pass without healing.
 */
function calculateStabilityScore(steps) {
    if (steps.length === 0) return 100;
    const passed = steps.filter(s => s.status === 'pass').length;
    return Math.round((passed / steps.length) * 100);
}

/**
 * Write a comprehensive heal report.
 */
export function writeReport(testFile, stepsHistory) {
    const totalSteps = stepsHistory.length;
    let healsApplied = 0;
    let failedSteps = 0;
    let passedSteps = 0;
    const healDetails = [];

    stepsHistory.forEach(s => {
        if (s.status === 'healed') {
            healsApplied++;
            healDetails.push({
                action: s.action,
                originalSelector: s.selector,
                status: 'healed',
            });
        } else if (s.status === 'fail') {
            failedSteps++;
        } else if (s.status === 'pass') {
            passedSteps++;
        }
    });

    const stabilityScore = calculateStabilityScore(stepsHistory);
    const healRate = totalSteps > 0 ? Math.round((healsApplied / totalSteps) * 100) : 0;
    const passRate = totalSteps > 0 ? Math.round(((passedSteps + healsApplied) / totalSteps) * 100) : 0;

    // Fetch all heals from DB for the "most healed selectors" analysis
    let topSelectors = [];
    try {
        const allHeals = getAllHeals();
        const selectorCounts = {};
        allHeals.forEach(h => {
            selectorCounts[h.original_selector] = (selectorCounts[h.original_selector] || 0) + 1;
        });
        topSelectors = Object.entries(selectorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([selector, count]) => ({ selector, healCount: count }));
    } catch {}

    const report = {
        testFile: path.basename(testFile),
        testFilePath: testFile,
        timestamp: new Date().toISOString(),
        summary: {
            totalSteps,
            passed: passedSteps,
            healed: healsApplied,
            failed: failedSteps,
            stabilityScore,
            healRate: `${healRate}%`,
            passRate: `${passRate}%`,
        },
        steps: stepsHistory,
        healDetails,
        topHealedSelectors: topSelectors,
    };

    // ── Write current report ─────────────────────────────────
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n  [Report] Written to: heal-report.json`);

    // ── Append to run history for stability trending ─────────
    const history = loadRunHistory();
    history.push({
        testFile: path.basename(testFile),
        timestamp: report.timestamp,
        totalSteps,
        passed: passedSteps,
        healed: healsApplied,
        failed: failedSteps,
        stabilityScore,
        healRate,
        passRate,
    });
    saveRunHistory(history);

    // ── Print trending if we have history ─────────────────────
    if (history.length > 1) {
        const recent = history.slice(-5);
        const avgStability = Math.round(recent.reduce((a, r) => a + r.stabilityScore, 0) / recent.length);
        const trend = history.length >= 3
            ? (recent[recent.length - 1].stabilityScore > recent[0].stabilityScore ? 'improving' : 'declining')
            : 'stable';

        console.log(`  [Report] Stability: ${stabilityScore}/100 | Trend: ${trend} (avg last ${recent.length} runs: ${avgStability}/100)`);
    }
}
