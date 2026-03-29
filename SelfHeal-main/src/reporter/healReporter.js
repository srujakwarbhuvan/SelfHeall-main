import db from '../storage/db.js';
import fs from 'fs';
import path from 'path';

export function generateReport(runId, outputPath = 'heal-report.json') {
    const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
    if (!run) {
        console.error(`Run ID ${runId} not found in database.`);
        return;
    }

    const steps = db.prepare(`
        SELECT s.*, h.root_cause, h.original_selector, h.healed_selector, h.confidence, h.healed
        FROM steps s
        LEFT JOIN heals h ON s.id = h.step_id
        WHERE s.run_id = ?
        ORDER BY s.step_index ASC
    `).all(runId);

    const report = {
        testFile: run.test_file,
        startTime: run.start_time,
        endTime: run.end_time,
        status: run.status,
        summary: {
            total: steps.length,
            passed: steps.filter(s => s.status === 'pass').length,
            healed: steps.filter(s => s.status === 'healed').length,
            failed: steps.filter(s => s.status === 'fail').length
        },
        steps: steps.map(s => ({
            index: s.step_index,
            name: s.name,
            status: s.status,
            error: s.error || null,
            heal: s.healed ? {
                rootCause: s.root_cause,
                originalSelector: s.original_selector,
                healedSelector: s.healed_selector,
                confidence: s.confidence
            } : null
        }))
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\n  📝 Heal report generated: ${path.resolve(outputPath)}`);
    return report;
}
