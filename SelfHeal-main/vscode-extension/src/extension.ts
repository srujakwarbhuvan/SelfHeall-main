import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { SidebarProvider } from './SidebarProvider';

let outputChannel: vscode.OutputChannel;
let activeRunProcess: ChildProcess | null = null;
let currentSidebarProvider: SidebarProvider | null = null;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('SelfHeal');
    outputChannel.appendLine('SelfHeal AI Agent activated.');

    // ── Sidebar Provider ──
    currentSidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidebarProvider.viewType,
            currentSidebarProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // ── Run Current Test ──
    const runCmd = vscode.commands.registerCommand('selfheal.runCurrentTest', async () => {
        if (activeRunProcess) {
            vscode.window.showWarningMessage('SelfHeal: A run is already in progress.');
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('SelfHeal: Open a test file first.');
            return;
        }

        const filePath = editor.document.fileName;
        if (!filePath.match(/\.(js|ts|mjs)$/)) {
            vscode.window.showWarningMessage('SelfHeal: Not a test file (.js/.ts/.mjs).');
            return;
        }

        await editor.document.save();
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const relPath = path.relative(wsRoot, filePath);

        outputChannel.appendLine(`\nStarting SelfHeal: ${relPath}`);
        vscode.commands.executeCommand('selfheal.agentView.focus');

        activeRunProcess = spawn('npx', ['selfheal', 'run', relPath, '--dashboard'], {
            cwd: wsRoot,
            shell: process.platform === 'win32',
        });

        activeRunProcess.stdout?.on('data', (data) => {
            const text = data.toString();
            outputChannel.append(text);
            const match = text.match(/\[VSCODE_WS_PORT=(\d+)\]/);
            if (match?.[1] && currentSidebarProvider) {
                currentSidebarProvider.sendPortToWebview(parseInt(match[1], 10));
            }
        });

        activeRunProcess.stderr?.on('data', (data) => {
            outputChannel.append(`[ERR] ${data.toString()}`);
        });

        activeRunProcess.on('close', (code) => {
            outputChannel.appendLine(`\nRun ended (code ${code})`);
            activeRunProcess = null;
        });
    });

    // ── Stop Run ──
    const stopCmd = vscode.commands.registerCommand('selfheal.stopRun', () => {
        if (activeRunProcess) {
            activeRunProcess.kill('SIGINT');
            activeRunProcess = null;
            vscode.window.showInformationMessage('SelfHeal: Run stopped.');
        }
    });

    // ── Open Panel ──
    const openCmd = vscode.commands.registerCommand('selfheal.openPanel', () => {
        vscode.commands.executeCommand('selfheal.agentView.focus');
    });

    // ── Help ──
    const helpCmd = vscode.commands.registerCommand('selfheal.help', () => {
        const panel = vscode.window.createWebviewPanel(
            'selfhealHelp', 'SelfHeal — Help', vscode.ViewColumn.One,
            { enableScripts: false }
        );
        panel.webview.html = getHelpHtml();
    });

    context.subscriptions.push(runCmd, stopCmd, openCmd, helpCmd, outputChannel);
}

export function deactivate() {
    if (activeRunProcess) activeRunProcess.kill();
    outputChannel?.dispose();
}

function getHelpHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0e1117; color: #e6edf3; padding: 24px 32px; line-height: 1.7; }
  h1 { font-size: 22px; font-weight: 800; background: linear-gradient(135deg,#3fb950,#58a6ff,#bc8cff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 6px; }
  h2 { font-size: 14px; color: #58a6ff; margin: 22px 0 10px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px; }
  p { color: #8b949e; font-size: 13px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
  th { text-align: left; font-size: 10px; color: #484f58; text-transform: uppercase; letter-spacing: 0.06em; padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  td { padding: 7px 10px; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.04); }
  code { font-family: 'JetBrains Mono', monospace; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 11px; color: #3fb950; }
  .kbd { background: #1c2333; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 2px 8px; font-family: monospace; font-size: 11px; color: #58a6ff; }
  .badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background: rgba(63,185,80,0.12); color: #3fb950; margin-left: 6px; }
</style>
</head>
<body>
<h1>SelfHeal AI — Help</h1>
<p>AI-powered self-healing test runner and CLI error diagnoser.</p>

<h2>Terminal Commands (CLI)</h2>
<p>Run these in any terminal — PowerShell, CMD, bash:</p>
<table>
  <tr><th>Command</th><th>Description</th></tr>
  <tr><td><code>selfheal &lt;command&gt;</code></td><td>Wrap any command with auto error healing<br><em>e.g.</em> <code>selfheal npm run dev</code></td></tr>
  <tr><td><code>selfheal run &lt;file&gt; --dashboard</code></td><td>Run Playwright test with live healing dashboard</td></tr>
  <tr><td><code>selfheal run &lt;file&gt; --ci</code></td><td>Run test in CI mode (JSON output, exit codes)</td></tr>
  <tr><td><code>selfheal scan &lt;file&gt;</code></td><td>Static fragility scan on selectors</td></tr>
  <tr><td><code>selfheal scan &lt;file&gt; --json</code></td><td>Fragility scan with JSON output</td></tr>
  <tr><td><code>selfheal --help</code></td><td>Show CLI help</td></tr>
</table>

<h2>VS Code Extension Commands</h2>
<table>
  <tr><th>Command</th><th>Shortcut</th><th>Description</th></tr>
  <tr><td>SelfHeal: Run Current Test</td><td><span class="kbd">Ctrl+Shift+H</span></td><td>Run the active test file with SelfHeal healing engine</td></tr>
  <tr><td>SelfHeal: Stop Run</td><td>—</td><td>Stop the currently running test</td></tr>
  <tr><td>SelfHeal: Open Panel</td><td><span class="kbd">Ctrl+Shift+A</span></td><td>Open the SelfHeal sidebar panel</td></tr>
  <tr><td>SelfHeal: Help</td><td><span class="kbd">Ctrl+Shift+/</span></td><td>Show this help page</td></tr>
</table>

<h2>Extension Sidebar Tabs</h2>
<table>
  <tr><th>Tab</th><th>What It Does</th></tr>
  <tr><td><strong>Errors</strong> <span class="badge">MAIN</span></td><td>Auto-captured errors from <code>selfheal &lt;cmd&gt;</code>. Each error shows: command, error output, AI diagnosis, suggested fix, affected files. Click for full detail panel.</td></tr>
  <tr><td><strong>Config</strong></td><td>Set Gemini API key, confidence threshold, view quick-reference commands.</td></tr>
</table>

<h2>How Error Healing Works</h2>
<table>
  <tr><th>Step</th><th>What Happens</th></tr>
  <tr><td>1</td><td>You run <code>selfheal npm run build</code> in terminal</td></tr>
  <tr><td>2</td><td>SelfHeal wraps the command and captures all stderr output</td></tr>
  <tr><td>3</td><td>If the command fails (exit code != 0), stderr is sent to Gemini AI</td></tr>
  <tr><td>4</td><td>AI returns: explanation, fix command, and affected files</td></tr>
  <tr><td>5</td><td>Error card appears in Errors tab with <strong>FIX AVAILABLE</strong> badge</td></tr>
  <tr><td>6</td><td>Toast notification pops up: "Error Diagnosed — View Details"</td></tr>
  <tr><td>7</td><td>Click card → detail panel with full error, fix, file paths</td></tr>
</table>

<h2>SDK Functions (for Playwright Tests)</h2>
<table>
  <tr><th>Function</th><th>Description</th></tr>
  <tr><td><code>healClick(page, selector, {intent})</code></td><td>Self-healing page.click() with intent-aware healing</td></tr>
  <tr><td><code>healFill(page, selector, value, {intent})</code></td><td>Self-healing page.fill() preserving value through retry</td></tr>
  <tr><td><code>healNavigate(page, url, {intent})</code></td><td>Self-healing page.goto() with network diagnostics</td></tr>
  <tr><td><code>healAssert(page, selector, property, expected, {intent})</code></td><td>Self-healing assertions (textContent, value, visible, etc.)</td></tr>
</table>

<h2>Heal Pipeline (Test Runner)</h2>
<p><code>Cache (instant)</code> → <code>Local DOM Heuristics</code> → <code>Gemini 2.5 Flash AI</code> → <code>Auto-apply + AST Patch + SQLite Save</code></p>

</body>
</html>`;
}
