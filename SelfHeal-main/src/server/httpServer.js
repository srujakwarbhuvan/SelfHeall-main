import express from 'express';
import { createServer } from 'http';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let activeProcess = null;

export function createHttpServer(port = 3000) {
    const app = express();
    const server = createServer(app);

    app.use(express.json());

    // Serve the dashboard
    const dashboardDir = path.join(__dirname, '..', '..', 'dashboard');
    app.use(express.static(dashboardDir));

    // Serve the web app dashboard
    const websiteDir = path.join(__dirname, '..', '..', 'website');
    app.use('/app.html', express.static(path.join(websiteDir, 'app.html')));

    // Serve test fixture HTML pages
    const testsDir = path.join(__dirname, '..', '..', 'tests');
    app.use('/pages', express.static(testsDir));

    const fixturesDir = path.join(__dirname, '..', '..', 'fixtures');
    app.use('/fixtures', express.static(fixturesDir));

    // ── API: Get heal history ─────────────────────────────────
    app.get('/api/heals', async (req, res) => {
        try {
            const { getAllHeals } = await import('../storage/healHistory.js');
            const heals = getAllHeals();
            res.json({ heals });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── API: Get run history ──────────────────────────────────
    app.get('/api/history', (req, res) => {
        try {
            const historyPath = path.join(__dirname, '..', '..', 'data', 'run-history.json');
            if (fs.existsSync(historyPath)) {
                const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
                res.json({ history: data });
            } else {
                res.json({ history: [] });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── API: Execute a command ─────────────────────────────────
    app.post('/api/exec', (req, res) => {
        const { command } = req.body;
        if (!command) {
            return res.status(400).json({ error: 'Missing command' });
        }

        if (activeProcess) {
            return res.status(409).json({ error: 'A process is already running' });
        }

        const workspaceRoot = path.join(__dirname, '..', '..');
        let stdout = '';
        let stderr = '';

        activeProcess = spawn(command, {
            cwd: workspaceRoot,
            shell: true,
            env: { ...process.env },
        });

        activeProcess.stdout?.on('data', (data) => { stdout += data.toString(); });
        activeProcess.stderr?.on('data', (data) => { stderr += data.toString(); });

        activeProcess.on('close', async (code) => {
            activeProcess = null;

            let explanation = '';
            let fix = '';
            let files = [];

            // On failure, try AI diagnosis
            if (code !== 0 && stderr.trim()) {
                try {
                    const { askCLIHealer } = await import('../agent/cliHealer.js');
                    const result = await askCLIHealer(command, stderr);
                    explanation = result.explanation || '';
                    fix = result.fixed_command || '';
                } catch {}
            }

            res.json({
                exitCode: code,
                stdout: stdout.slice(-5000),
                stderr: stderr.slice(-5000),
                explanation,
                fix,
                files,
            });
        });

        activeProcess.on('error', (err) => {
            activeProcess = null;
            res.status(500).json({ error: err.message, exitCode: 1, stdout: '', stderr: err.message });
        });
    });

    // ── API: Stop running command ──────────────────────────────
    app.post('/api/exec/stop', (req, res) => {
        if (activeProcess) {
            try {
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', String(activeProcess.pid), '/f', '/t'], { shell: true });
                } else {
                    activeProcess.kill('SIGINT');
                }
            } catch {}
            activeProcess = null;
            res.json({ stopped: true });
        } else {
            res.json({ stopped: false, message: 'No process running' });
        }
    });

    return { app, server, port };
}
