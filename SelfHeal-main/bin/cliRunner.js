import { chromium } from '@playwright/test';
import { setRunnerContext, getStepHistory, clearStepHistory } from '../src/runner/playwrightRunner.js';
import { writeReport } from '../src/storage/healReport.js';
import { createHttpServer } from '../src/server/httpServer.js';
import { createWsServer } from '../src/server/wsServer.js';
import { initDb, closeDb } from '../src/storage/healHistory.js';
import { scoreFragility } from '../src/intent/fragilityScorer.js';
import open from 'open';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import net from 'net';
import chalk from 'chalk';

function findFreePort(startPort = 3000) {
    return new Promise((resolve) => {
        const tryPort = (port) => {
            const s = net.createServer();
            s.once('error', () => tryPort(port + 1));
            s.once('listening', () => s.close(() => resolve(port)));
            s.listen(port);
        };
        tryPort(startPort);
    });
}

let activeBrowser = null;

async function runTests(absFile, targetUrl, io) {
    const browser = await chromium.launch({ headless: false });
    activeBrowser = browser;
    const context = await browser.newContext();
    const page = await context.newPage();
    clearStepHistory();

    // Broadcast start
    io.emit('run:start', { testFile: absFile, targetUrl });

    console.log(chalk.cyan(`\n  Launching browser...`));
    console.log(chalk.dim(`  -> page.goto("${targetUrl}")`));

    // Subscribe to real-time events for terminal logging
    const handleStepStart = (d) => { /* step:start handling if needed */ };
    const handleStepPass = (d) => {
        const steps = getStepHistory();
        const num = steps.length;
        const action = (d.action || 'click').padEnd(6);
        const selector = (d.selector || '').padEnd(15);
        console.log(`  ${chalk.dim('[step ' + num + ']')} ${action} > ${selector}   ${chalk.green('[OK]')}`);
    };
    const handleStepFail = (d) => {
        const steps = getStepHistory();
        const num = steps.length;
        const action = (d.action || 'click').padEnd(6);
        const selector = (d.selector || '').padEnd(15);
        console.log(`  ${chalk.dim('[step ' + num + ']')} ${action} > ${selector}   ${chalk.red('[FAIL] -> healing...')}`);
    };
    const handleStepHealed = (d) => {
        const steps = getStepHistory();
        const num = steps.length;
        const action = (d.action || 'click').padEnd(6);
        const selector = (d.selector || '').padEnd(15);
        const conf = Math.round((d.extra?.confidence || 0) * 100);
        console.log(`  ${chalk.dim('[step ' + num + ']')} ${action} > ${selector}   ${chalk.yellow('[HEALED]')} ${d.selector} ${chalk.dim('(' + conf + '%)')}`);
    };

    io.on('step:pass', handleStepPass);
    io.on('step:fail', handleStepFail);
    io.on('step:healed', handleStepHealed);

    let status = 'passed';
    try {
        const testScript = await import(pathToFileURL(absFile).href);
        const testFn = testScript.default || testScript.run;
        
        // Final navigation
        await page.goto(targetUrl);
        
        // Execute the actual test function
        await testFn(page, { serverUrl: targetUrl, targetUrl });
        
        console.log(chalk.green(`\n  ✓ All steps complete.`));
    } catch (err) {
        if (err.message?.includes('closed') || err.message?.includes('Target page')) {
            status = 'stopped';
            console.log(chalk.yellow(`\n  ■ Run stopped.`));
        } else {
            status = 'failed';
            console.error(chalk.red(`\n  ✗ Test failure:`), err.message);
        }
    } finally {
        // Cleanup listeners
        io.removeListener('step:pass', handleStepPass);
        io.removeListener('step:fail', handleStepFail);
        io.removeListener('step:healed', handleStepHealed);
        
        activeBrowser = null;
        try { await browser.close(); } catch {}
    }

    await writeReport(absFile, getStepHistory());
    io.emit('run:complete', { status });
    return status;
}

export async function executeCLI(testFile, dashboard, targetUrl, dryRun = false) {
    const absFile = path.resolve(testFile);
    if (!fs.existsSync(absFile)) {
        console.error(chalk.red('  [ERR] File not found:'), absFile);
        process.exit(1);
    }

    await initDb();
    const scores = scoreFragility(absFile);

    // Start local server for dashboard
    const port = await findFreePort(3002);
    const { app, server } = createHttpServer(port);
    const io = createWsServer(server);
    const serverUrl = `http://localhost:${port}`;

    await new Promise(resolve => server.listen(port, resolve));

    console.log(chalk.bold('\n  ╔══════════════════════════════════════╗'));
    console.log(chalk.bold('  ║     SelfHeal — AI Test Runner        ║'));
    console.log(chalk.bold('  ╚══════════════════════════════════════╝\n'));

    // Dashboard socket handlers
    io.on('connection', (socket) => {
        socket.emit('fragility:data', scores);
        socket.emit('run:ready', { testFile: absFile, targetUrl });

        socket.on('run:trigger', async (data) => {
            if (activeBrowser) {
                socket.emit('run:error', { message: 'Already running' });
                return;
            }
            const overrideUrl = data?.targetUrl || targetUrl;
            setRunnerContext({ testFile: absFile, io, dryRun });
            await runTests(absFile, overrideUrl, io);
        });

        socket.on('run:stop', () => {
            if (activeBrowser) {
                activeBrowser.close().catch(() => {});
            }
        });
    });

    if (dashboard) {
        process.stdout.write(`  Dashboard: ${chalk.underline.blue(serverUrl)}\n`);
        try {
            await open(serverUrl).catch(() => {});
        } catch (e) {}
        process.stdout.write(chalk.dim('  Dashboard opened — running test now...\n\n'));
    }

    // Always run immediately in the new CLI flow
    setRunnerContext({ testFile: absFile, io, dryRun });
    const status = await runTests(absFile, targetUrl, io);

    // Summary
    const steps = getStepHistory();
    const passed = steps.filter(s => s.status === 'pass').length;
    const healed = steps.filter(s => s.status === 'healed').length;
    const failedNum = steps.filter(s => s.status === 'fail').length;

    process.stdout.write(`\n  ─── Results ───────────────────────────\n`);
    process.stdout.write(`  Passed: ${chalk.green(passed)}  Healed: ${chalk.yellow(healed)}  Failed: ${chalk.red(failedNum)}\n`);
    if (healed > 0) process.stdout.write(chalk.dim(`  ${healed} selector(s) auto-healed by AI\n`));
    process.stdout.write(`  Report: heal-report.json\n`);
    process.stdout.write(`  ────────────────────────────────────────\n`);

    closeDb();
    
    // Graceful server shutdown before returning
    await new Promise(r => server.close(r));
    return status;
}
