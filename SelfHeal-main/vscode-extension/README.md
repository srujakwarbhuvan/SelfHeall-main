# 🛡️ SelfHeal AI — VS Code Extension

**AI-Powered Dev Assistant with Debugging Intelligence — embedded in your editor.**

SelfHeal AI is a VS Code sidebar extension that gives you an intelligent AI assistant that reads your code, understands your diagnostics, and helps you debug, explain, and fix issues — all through simple slash commands.

---

## ✨ Features

### 💬 AI Chat Sidebar
An always-available AI chat panel in your VS Code sidebar. Ask questions about your code, get explanations, or just have a conversation — with full context from your editor.

### ⌨️ CLI-Style Slash Commands

| Command | What It Does |
|---------|-------------|
| `/debug` | 🔍 Deep root-cause analysis — finds error patterns, explains why, suggests a fix |
| `/heal` | 🩹 Analyze broken test selectors/code and suggest a healed version |
| `/fix` | 🔧 Fix the bug at your cursor position |
| `/explain` | 📖 Explain selected code or the entire active file |
| `/analyze` | 📊 Code quality, performance, security, and potential bugs review |
| `/run` | ▶️ Run current test file through the SelfHeal engine |
| `/scan` | 🛡️ Static fragility scan for selector brittleness |
| `/clear` | 🗑️ Clear conversation history |

### 🔍 Code Awareness
- Reads your **active file** automatically
- Understands **selected code** for targeted analysis
- Pulls **diagnostics** (errors/warnings from ESLint, TypeScript, etc.)
- Knows your **cursor position** for precise `/fix` targeting

### 📊 Live Test Dashboard
Built-in real-time dashboard for Playwright test runs:
- Step-by-step execution tracking
- AI heal reasoning (root cause → selector patch → confidence)
- Pre-run fragility scan
- Run summary overlay

### 🧠 Debugging Intelligence (The USP)
Not just another AI chat. SelfHeal AI specializes in **debugging**:
- Finds error patterns in your code
- Identifies the **root cause**, not just symptoms
- Suggests **precise, minimal fixes**
- Streams responses in real-time with formatted code blocks

---

## 🚀 Quick Start

1. **Install** the extension from the VS Code Marketplace (or install the `.vsix` manually)
2. **Set your Gemini API Key** (one of these methods):
   - VS Code Settings → search `selfheal` → paste your key
   - Add `GEMINI_API_KEY=your-key` in your workspace `.env` file
3. **Click the 🧪 beaker icon** in the activity bar
4. **Type `/debug`** to analyze your current file

> 💡 Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com/apikey)

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+H` / `Ctrl+Shift+H` | Run current test |
| `Cmd+Shift+D` / `Ctrl+Shift+D` | Debug current file |
| `Cmd+Shift+A` / `Ctrl+Shift+A` | Open chat panel |

---

## 🔑 API Key Setup

SelfHeal AI uses **Google Gemini 2.0 Flash** for fast, intelligent responses. The API key is resolved from:

1. **VS Code Settings** → `Extensions → SelfHeal AI → Gemini Api Key`
2. **Workspace `.env`** → `GEMINI_API_KEY=your-key`
3. **Environment variable** → `export GEMINI_API_KEY=your-key`

Your API key stays **local and secure** — it's read only by the extension host (Node.js), never exposed to the browser or any third party.

---

## 📦 Manual Installation

If you downloaded the `.vsix` file:

```bash
code --install-extension selfheal-vscode-3.0.0.vsix
```

Or in VS Code: `Cmd+Shift+P` → `Extensions: Install from VSIX...` → select the file.

---

## 🏗️ Architecture

```
User types in Sidebar Chat
    ↓
chat.js (Webview) → postMessage
    ↓
extension.ts (Extension Host) → commandParser
    ↓
codeContext.ts → reads active file, selection, diagnostics
    ↓
aiService.ts → Gemini API (SSE streaming)
    ↓
Streams response chunks back to webview
    ↓
Renders markdown with code blocks
```

---

## 🤝 Contributing

1. Clone the repo
2. `cd vscode-extension && npm install`
3. Open the folder in VS Code
4. Press `F5` to launch Extension Development Host
5. Make changes → test in the dev host

---

## 📄 License

MIT

---

**Built with ❤️ by the SelfHeal team**
