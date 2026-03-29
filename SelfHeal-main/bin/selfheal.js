#!/usr/bin/env node
/**
 * SelfHeal CLI — Entry Point
 * ============================================================
 * Handles subcommand dispatching and interactive onboarding.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import { runCommandWithHealing } from '../src/runner/execRunner.js';

const args = process.argv.slice(2);
const command = args[0];

// ── UTILITIES ───────────────────────────────────────────────

function ask(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Handle Ctrl+C gracefully
  rl.on('SIGINT', () => {
    console.log(chalk.yellow('\n  Cancelled.'));
    process.exit(0);
  });

  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

/** Validates that input is a proper URL */
async function promptUrl() {
  while (true) {
    const url = await ask(chalk.white('  Enter target URL › '));
    
    // Default fallback if empty (allow user to proceed with demo)
    if (!url) {
      const fallback = 'http://localhost:3000/pages/checkout-page.html';
      console.log(chalk.dim(`  (Using default: ${fallback})`));
      console.log(chalk.green(`  ✔ URL accepted: ${fallback}\n`));
      return fallback;
    }

    const isValid = (url.startsWith('http://') || url.startsWith('https://')) && url.includes('.');
    if (isValid) {
      console.log(chalk.green(`  URL accepted: ${url}\n`));
      return url;
    }
    
    console.log(chalk.red(`  Invalid URL - must start with http:// or https://`));
  }
}

/** Lists files in /tests and asks user to select one */
async function promptTestFile() {
  const testsDir = path.join(process.cwd(), 'tests');
  let files = [];
  if (fs.existsSync(testsDir)) {
    files = fs.readdirSync(testsDir).filter(f => f.endsWith('.spec.js'));
  }

  if (files.length > 0) {
    console.log(chalk.cyan('  Select a test file:'));
    files.forEach((f, i) => {
      console.log(`${chalk.dim('    ' + (i + 1) + ')')} ${f}`);
    });
    console.log(`${chalk.dim('    c)')} Custom path...`);

    const choice = await ask(chalk.white(`  Choice [1]: `));
    
    if (choice.toLowerCase() === 'c') {
      return await ask(chalk.white('  Enter path to .spec.js: '));
    }

    const idx = (parseInt(choice) || 1) - 1;
    const selected = files[idx] || files[0];
    return path.join('tests', selected);
  } else {
    return await ask(chalk.white('  Enter path to .spec.js: '));
  }
}

async function startInteractiveFlow(defaultFile = null, dashboard = true, dryRun = false) {
  const targetUrl = await promptUrl();
  const testFile = defaultFile || await promptTestFile();

  const { executeCLI } = await import('./cliRunner.js');
  await executeCLI(testFile, dashboard, targetUrl, dryRun);
}

// ── MAIN DISPATCHER ──────────────────────────────────────────

async function main() {
  if (command === 'run') {
    const testFile = args[1];
    const dashboard = args.includes('--dashboard');
    const dryRun = args.includes('--dry-run');

    if (dryRun) process.env.SELFHEAL_DRY_RUN = 'true';

    // If file provided via command line, just ask for URL
    if (testFile) {
      const targetUrl = await promptUrl();
      const { executeCLI } = await import('./cliRunner.js');
      await executeCLI(testFile, dashboard, targetUrl, dryRun);
    } else {
      await startInteractiveFlow(null, dashboard, dryRun);
    }

  } else if (command === 'scan') {
    const testFile = args[1];
    if (!testFile) {
      console.error(chalk.red('  [ERR] Missing test file. Usage: selfheal scan <file> [--json]'));
      process.exit(1);
    }

    const { scoreFragility } = await import('../src/selector/fragilityScorer.js');
    const scores = scoreFragility(testFile);
    
    console.log(chalk.bold(`\n   Fragility scan — ${testFile}`));
    console.log('   ----------------------------------------');
    scores.forEach(s => {
      const scoreStr = s.fragilityScore.toString().padEnd(5);
      const riskColor = s.risk === 'high' ? chalk.red : (s.risk === 'low' ? chalk.green : chalk.yellow);
      console.log(`   ${s.selector.padEnd(22)} ${scoreStr} ${riskColor(s.risk.toUpperCase())}`);
    });

    if (args.includes('--json')) {
      console.log(JSON.stringify({ testFile, scores }, null, 2));
    }

  } else if (command === '--help' || command === '-h') {
    console.log(`
  ${chalk.bold('SelfHeal — AI-Powered Test Recovery')}
  ======================================

  ${chalk.cyan('Usage:')}
    selfheal                     ${chalk.dim('Interactive test run')}
    selfheal run <file>          ${chalk.dim('Run specific test with healing')}
    selfheal scan <file>         ${chalk.dim('Static fragility analysis')}
    selfheal <any command>       ${chalk.dim('Wrap any command with healing')}

  ${chalk.cyan('Options:')}
    --dashboard   Live visualization dashboard
    --dry-run     Audit mode (no patches/DB saves)
    `);

  } else if (!command) {
    // NAKED COMMAND: Show interactive flow directly
    await startInteractiveFlow();

  } else {
    // WRAP ANY COMMAND: e.g. "selfheal npm run dev"
    const fullCommand = args.join(' ');
    runCommandWithHealing(fullCommand).then(code => process.exit(code));
  }
}

main().catch(err => {
  console.error(chalk.red(`\n  [CRITICAL] ${err.stack}`));
  process.exit(1);
});
