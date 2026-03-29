# SelfHeal

## What it does
SelfHeal is an AI-powered Playwright test automation layer that detects broken selectors during a test run and dynamically fixes them in real-time. It uses an intent-aware Gemini reasoning engine to understand the human goal of each step, bypassing brittle UI changes and ensuring test pipelines never fail due to structural DOM updates.

## Quick Start
```bash
npm install
npx playwright install chromium
npx selfheal run tests/checkout.spec.js --dashboard --report
```

## Key Features

1. **Intent-Aware SDK** — Pass human meaning (`intent`) to every action so the AI understands the *goal*, not just the selector syntax.
2. **Fragility Scorer** — Pre-test static analysis rates CSS/XPath selectors on a 0–1 brittleness scale before execution begins.
3. **Multi-Layer Healing** — Cache (instant) → Local DOM Heuristics → Gemini 2.5 Flash AI, with confidence gating at every layer.
4. **Live Dashboard** — Real-time Socket.IO monitoring of test steps, failures, heal reasoning, and confidence scores.
5. **Persistent History** — SQLite backend ensures once a selector is healed, it stays healed across all future runs.
6. **Zero-Touch Patching** — AST-based code rewriter (recast) updates your `.spec.js` files automatically, preserving formatting.
7. **Human-in-the-Loop** — Low-confidence heals trigger a dashboard approval prompt instead of auto-applying.
8. **CI/CD Mode** — Run with `--ci` for JSON stdout, proper exit codes, and no interactive prompts.
9. **CLI Command Healing** — `selfheal exec "<cmd>"` diagnoses and fixes failed terminal commands via AI.
10. **VS Code Extension** — Run, debug, and monitor tests directly from your editor.

## How to Run

1. **Install Dependencies**
   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Set API Keys**
   Create a `.env` file (see `.env.example`):
   ```env
   GEMINI_API_KEYS=key1,key2,key3
   ```

3. **Execute the Test**
   ```bash
   npx selfheal run tests/checkout.spec.js --dashboard
   ```

4. **CI/CD Mode**
   ```bash
   npx selfheal run tests/checkout.spec.js --ci
   ```

## Project Structure

- `src/agent/` — Unified Gemini AI heal agent with multi-key rotation and retry logic.
- `src/sdk/` — Developer-facing API: `healClick`, `healFill`, `healNavigate`, `healAssert`.
- `src/selector/` — Local DOM heuristic engine and fragility scorer.
- `src/storage/` — SQLite heal cache and JSON report generation.
- `src/runner/` — Playwright test runner and CLI command runner.
- `src/server/` — Express HTTP server + Socket.IO WebSocket server.
- `src/patcher/` — AST-based test file rewriter (recast).
- `dashboard/` — Premium real-time monitoring interface.
- `vscode-extension/` — VS Code integration.

## What You Will See

When you start the command, the dashboard will immediately display a pre-run fragility scan highlighting our intentionally weak, old selectors. As Playwright executes the script and elements inevitably fail to be found, you will see the self-healing engine activate live in the right panel, analyzing the DOM snapshot against the developer's intent string. It will confidently determine the new selector, log its reasoning, and seamlessly patch the test — continuing the execution until completion, finally producing a comprehensive `heal-report.json` zero-human-intervention artifact.

## Architecture

```
Developer Test (.spec.js)
    │
    ▼
┌─────────────────────────────────────────┐
│  SDK Layer (healClick/healFill/healNav)  │
└────────────┬────────────────────────────┘
             │ on failure
             ▼
┌─────────────────────────────────────────┐
│  1. SQLite Cache Lookup (instant)       │
│  2. Local DOM Heuristics (intent-aware) │
│  3. Gemini 2.5 Flash AI (with retry)   │
└────────────┬────────────────────────────┘
             │ confidence ≥ threshold
             ▼
┌─────────────────────────────────────────┐
│  Auto-apply + AST Patch + SQLite Save   │
│  + Dashboard Event + Report Update      │
└─────────────────────────────────────────┘
```

---
*Built for the 2026 AI Agentic Coding Hackathon.*
