import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, spawn } from 'child_process';
import { generateOnce } from './aiService';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'selfheal.agentView';
    private _view?: vscode.WebviewView;
    private _termProcess: ChildProcess | null = null;

    constructor(
        private readonly _extensionUri: vscode.Uri
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'saveConfig': {
                    if (data.apiKey) {
                        await vscode.workspace.getConfiguration('selfheal').update('geminiApiKey', data.apiKey, true);
                    }
                    vscode.window.showInformationMessage('SelfHeal: Config saved.');
                    break;
                }
                case 'openFile': {
                    if (data.path) {
                        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
                        const fullPath = path.isAbsolute(data.path) ? data.path : path.join(wsRoot, data.path);
                        if (fs.existsSync(fullPath)) {
                            const doc = await vscode.workspace.openTextDocument(fullPath);
                            await vscode.window.showTextDocument(doc);
                        }
                    }
                    break;
                }
                case 'diagnoseError': {
                    await this._diagnoseError(data.error);
                    break;
                }
                case 'runTerminalCommand': {
                    this._runCommand(data.command);
                    break;
                }
                case 'killTerminalCommand': {
                    this._killCommand();
                    break;
                }
            }
        });
    }

    private async _diagnoseError(error: any) {
        try {
            const diagnosis = await generateOnce('debug',
                `Command \`${error.command || 'unknown'}\` failed (exit ${error.exitCode}).\n\nError:\n\`\`\`\n${(error.stderr || error.errorMsg || '').slice(0, 2500)}\n\`\`\`\n\nExplain root cause, affected files, and exact fix command.\nReply ONLY as JSON: {"explanation":"...","fix":"exact command","files":["path"]}`
            );
            const jsonMatch = diagnosis.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                error.explanation = parsed.explanation || diagnosis;
                error.fix = parsed.fix || '';
                error.files = parsed.files || [];
            } else {
                error.explanation = diagnosis;
            }
            this.postMessage({ type: 'capturedError', error });
        } catch (err: any) {
            vscode.window.showErrorMessage('SelfHeal: AI diagnosis failed — ' + err.message);
        }
    }

    private _runCommand(command: string) {
        if (this._termProcess) {
            this.postMessage({ type: 'terminalOutput', text: 'A process is already running. Stop it first.', stream: 'stderr' });
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

        // Parse the command
        const parts = command.split(/\s+/);
        const cmd = parts[0] || 'npm';
        const args = parts.slice(1);

        let stderrBuffer = '';

        this.postMessage({ type: 'cmdStarted', command });

        this._termProcess = spawn(cmd, args, {
            cwd: workspaceRoot || process.cwd(),
            shell: true,
            env: { ...process.env },
        });

        this._termProcess.stdout?.on('data', (data: Buffer) => {
            for (const line of data.toString().split('\n')) {
                if (line.trim()) {
                    this.postMessage({ type: 'terminalOutput', text: line.trimEnd(), stream: 'stdout' });
                }
            }
        });

        this._termProcess.stderr?.on('data', (data: Buffer) => {
            const text = data.toString();
            stderrBuffer += text;
            for (const line of text.split('\n')) {
                if (line.trim()) {
                    this.postMessage({ type: 'terminalOutput', text: line.trimEnd(), stream: 'stderr' });
                }
            }
        });

        this._termProcess.on('close', async (code: number | null) => {
            this._termProcess = null;
            this.postMessage({ type: 'terminalDone', code: code ?? 1, _command: command });

            // On failure — diagnose with AI and send as error card
            if (code !== 0 && stderrBuffer.trim()) {
                const errorMsg = stderrBuffer.trim().split('\n').slice(-5).join('\n');
                const time = new Date().toLocaleTimeString('en', { hour12: false });

                let explanation = '';
                let fix = '';
                let files: string[] = [];

                try {
                    const result = await generateOnce('fix',
                        `Command \`${command}\` failed (exit ${code}).\n\nError:\n\`\`\`\n${stderrBuffer.slice(0, 2000)}\n\`\`\`\n\nReply ONLY as JSON: {"explanation":"2-3 sentences","fix":"exact command","files":["relative/path"]}`
                    );
                    const jsonMatch = result.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        explanation = parsed.explanation || '';
                        fix = parsed.fix || '';
                        files = parsed.files || [];
                    }
                } catch {}

                this.postMessage({
                    type: 'capturedError',
                    error: { command, errorMsg, stderr: stderrBuffer.slice(0, 3000), exitCode: code, time, explanation, fix, files },
                });
            }
        });

        this._termProcess.on('error', (err: Error) => {
            this.postMessage({ type: 'terminalOutput', text: 'Failed to start: ' + err.message, stream: 'stderr' });
            this.postMessage({ type: 'terminalDone', code: 1, _command: command });
            this._termProcess = null;
        });
    }

    private _killCommand() {
        if (this._termProcess) {
            try {
                // On Windows, need to kill the process tree
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', String(this._termProcess.pid), '/f', '/t'], { shell: true });
                } else {
                    this._termProcess.kill('SIGINT');
                }
            } catch {}
            this._termProcess = null;
            this.postMessage({ type: 'terminalOutput', text: 'Process killed by user.', stream: 'info' });
            this.postMessage({ type: 'terminalDone', code: 130, _command: '' });
        }
    }

    public postMessage(message: any) {
        this._view?.webview.postMessage(message);
    }

    public sendPortToWebview(port: number) {
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.postMessage({ type: 'PORT_ALLOCATED', port });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const htmlPath = path.join(this._extensionUri.fsPath, 'webview', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf-8');

        ['ui.js', 'ws-client.js', 'chat.js', 'terminal.js'].forEach(file => {
            const uri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', file));
            html = html.replace(`<script src="${file}"></script>`, `<script src="${uri}"></script>`);
        });

        html = html.replace('</head>', `<script>const vscode = acquireVsCodeApi();</script>\n</head>`);
        return html;
    }
}
