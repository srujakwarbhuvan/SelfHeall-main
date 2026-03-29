#!/usr/bin/env node
/**
 * SelfHeal CLI — Entry Point (v3)
 * ============================================================
 * FIXED: Explicitly handles terminal input buffer and ensures prompt visibility.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import { runCommandWithHealing } from '../src/runner/execRunner.js';

// PRINT VERSION IMMEDIATELY TO CONFIRM LINK
process.stdout.write(chalk.bold(`\n  SelfHeal — Powered by Gemini AI v3.0\n`));
process.stdout.write(`  ======================================\n`);

// ONE SHARED RL INTERFACE
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

// GLOBAL SIGINT HANDLER
rl.on('SIGINT', () => {
  process.stdout.write('\n  ' + chalk.yellow('Goodbye!\n'));
  process.exit(0);
});

/** Synchronous recursive file search */
function findSpecFiles(dir, allFiles = []) {
  try {
    const skip = ['node_modules', '.git', 'dist', 'coverage', '.vscode', 'release', 'fixtures', 'data'];
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      if (skip.includes(file)) continue;
      
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        findSpecFiles(fullPath, allFiles);
      } else if (file.endsWith('.spec.js') || file.endsWith('.test.js')) {
        allFiles.push(path.relative(process.cwd(), fullPath));
      }
    }
  } catch (err) {}
  return allFiles;
}

/** Promise wrapper for rl.question with explicit prompt */
function ask(query) {
  rl.resume();
  return new Promise(resolve => {
    rl.question(query, (ans) => resolve(ans.trim()));
  });
}

/** Validates and prompts for target URL */
async function askUrl() {
  while (true) {
    const url = await ask(chalk.white('\n  Enter target URL › '));
    
    if (!url) {
      const fallback = 'http://localhost:3000/pages/checkout-page.html';
      process.stdout.write(chalk.dim(`  ✔ Using default: ${fallback}\n`));
      return fallback;
    }

    const isValid = (url.startsWith('http://') || url.startsWith('https://')) && url.includes('.');
    if (isValid) {
      process.stdout.write(chalk.green(`  ✔ URL accepted: ${url}\n`));
      return url;
    }
    process.stdout.write(chalk.red(`  Invalid URL — must start with http:// or https://\n`));
  }
}

/** Synchronous file search and prompt */
async function askFile() {
  process.stdout.write(`\n  Looking for test files in: ${chalk.dim(process.cwd())}\n`);
  const files = findSpecFiles(process.cwd());

  if (files.length > 0) {
    process.stdout.write(chalk.cyan('  Select a test file:\n'));
    files.forEach((f, i) => {
      process.stdout.write(`    ${chalk.dim((i+1)+')')} ${f}\n`);
    });
    process.stdout.write(`    ${chalk.dim('c)')} Custom path...\n`);

    while (true) {
      const choice = (await ask(chalk.white('\n  Choice [1] › '))).toLowerCase();
      if (choice === 'c') return await ask(chalk.white('  Enter path to .spec.js › '));
      if (!choice) return files[0];
      const idx = parseInt(choice) - 1;
      if (idx >= 0 && idx < files.length) return files[idx];
      process.stdout.write(chalk.red('  Invalid selection.\n'));
    }
  } else {
    process.stdout.write(chalk.yellow('  No .spec.js files found in current directory.\n'));
    return await ask(chalk.white('  Enter path to .spec.js › '));
  }
}

/** Ask if user wants to run another test */
async function askRunAgain() {
  const ans = (await ask(chalk.white('\n  Run another test? [y/N] › '))).toLowerCase();
  return ans === 'y' || ans === 'yes';
}

/** Main async run loop */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // FORCE SHOW CURSOR JUST IN CASE
  process.stdout.write('\x1b[?25h');

  // CLEAN INPUT BUFFER
  process.stdin.resume();

  if (command === 'run' || !command) {
    const dashboard = !args.includes('--no-dashboard');
    const dryRun = args.includes('--dry-run');
    if (dryRun) process.env.SELFHEAL_DRY_RUN = 'true';

    let initialFile = command === 'run' ? args[1] : null;

    if (initialFile) {
        // ONE-SHOT MODE
        let targetUrl = args.find(a => a.startsWith('--url='))?.split('=')[1];
        if (!targetUrl) targetUrl = await askUrl();
        
        const { executeCLI } = await import('./cliRunner.js');
        await executeCLI(initialFile, dashboard, targetUrl, dryRun);
        process.stdout.write(chalk.yellow('\n  Run complete. Goodbye!\n'));
        process.exit(0);
    }

    // INTERACTIVE LOOP (if no file provided via CLI)
    while (true) {
      const targetUrl = await askUrl();
      const testFile = await askFile();
      const { executeCLI } = await import('./cliRunner.js');
      await executeCLI(testFile, dashboard, targetUrl, dryRun);
      
      const again = await askRunAgain();
      if (!again) {
        process.stdout.write(chalk.yellow('\n  Goodbye!\n'));
        rl.close();
        process.exit(0);
      }
    }

  } else if (command === 'scan') {
    const testFile = args[1];
    if (!testFile) {
      process.stdout.write(chalk.red('  [ERR] Missing test file.\n'));
      process.exit(1);
    }
    const { scoreFragility } = await import('../src/selector/fragilityScorer.js');
    const scores = scoreFragility(testFile);
    process.stdout.write(chalk.bold(`\n   Fragility scan — ${testFile}\n`));
    scores.forEach(s => {
      const scoreStr = s.fragilityScore.toString().padEnd(5);
      const riskColor = s.risk === 'high' ? chalk.red : (s.risk === 'low' ? chalk.green : chalk.yellow);
      process.stdout.write(`   ${s.selector.padEnd(22)} ${scoreStr} ${riskColor(s.risk.toUpperCase())}\n`);
    });
    process.exit(0);

  } else if (command === '--help' || command === '-h') {
    process.stdout.write(`
  ${chalk.bold('SelfHeal — AI-Powered Test Entry')}
  ======================================
  Usage: selfheal [run <file>] [scan <file>]
  `);
    process.exit(0);

  } else {
    // WRAP ANY COMMAND
    const fullCommand = args.join(' ');
    const exitCode = await runCommandWithHealing(fullCommand);
    process.exit(exitCode);
  }
}

main().catch(err => {
  process.stdout.write(chalk.red(`\n  [CRITICAL] ${err.stack}\n`));
  process.exit(1);
});
