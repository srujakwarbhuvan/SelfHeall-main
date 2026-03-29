/**
 * aiService.ts
 * ================================================================
 * Handles all communication with Google Gemini API.
 * Runs inside the VS Code Extension Host (Node.js), never in the
 * webview — so the API key stays secure.
 * ================================================================
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// We use the REST API directly to avoid heavy SDK dependencies
// in the extension host. This keeps the .vsix small.

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

/** System prompt templates keyed by command name */
const SYSTEM_PROMPTS: Record<string, string> = {
    debug: `You are a senior software debugger embedded in a developer's IDE.
Your job is to analyze the provided code and diagnostics, find error patterns,
identify the ROOT CAUSE, and suggest a precise fix.

Structure your response as:
1. **🔍 Root Cause** — What is actually wrong and why.
2. **📍 Location** — Exact line(s) where the issue lives.
3. **🔧 Fix** — The corrected code in a fenced code block.
4. **💡 Explanation** — Why the fix works.

Be concise. Use markdown formatting. Show code diffs where helpful.`,

    heal: `You are an AI test-repair specialist. The developer has a broken test or selector.
Analyze the code, identify what broke (changed selector, missing element, timing issue),
and provide the healed version.

Structure your response as:
1. **🩹 What Broke** — The specific failure.
2. **🔧 Healed Code** — The fixed code block.
3. **📊 Confidence** — How confident you are (high/medium/low) and why.`,

    fix: `You are a precise bug-fixer embedded in an IDE.
The developer has identified a bug near their cursor position.
Find the bug and provide the minimal fix.

Show ONLY:
1. **🐛 Bug** — One-line description.
2. **🔧 Fix** — The corrected code in a fenced code block.
Keep it short and actionable.`,

    explain: `You are a code explainer embedded in an IDE.
Explain the provided code clearly and concisely.
Use bullet points for complex logic. Mention any potential issues.
If specific code is selected, focus on that selection.
Keep the explanation under 300 words unless the code is very complex.`,

    analyze: `You are a code quality analyzer embedded in an IDE.
Analyze the provided code for:
1. **⚡ Performance** — Any performance issues or optimizations.
2. **🛡️ Security** — Potential vulnerabilities.
3. **📐 Code Quality** — Readability, maintainability, best practices.
4. **🐛 Potential Bugs** — Edge cases or logic errors.

Rate each category: ✅ Good, ⚠️ Needs Attention, ❌ Critical.
Be specific with line numbers and suggestions.`,

    refactor: `You are an expert software architect embedded in an IDE.
Refactor the provided code to be cleaner, more scalable, and adhere to modern best practices.
1. **♻️ Refactored Code** — Provide the full corrected code in a fenced code block.
2. **📈 Improvements** — Briefly list the architectural and readability improvements made.`,

    generate: `You are a generative AI coding assistant embedded in an IDE.
Generate high-quality, production-ready code based on the user's prompt.
If they ask for a test script, use their local framework (e.g. Playwright with SelfHeal if applicable).
Return ONLY the fenced code block and a very brief explanation of how to use it.`,

    chat: `You are SelfHeal AI, a helpful coding assistant embedded in the developer's IDE.
You help with debugging, code explanation, and general programming questions.
You have access to the developer's current file and workspace context.
Be concise, use markdown, and include code blocks when showing code.`
};

/**
 * Resolve the Gemini API key from multiple sources.
 * Priority: VS Code setting → workspace .env → environment variable.
 */
function getApiKey(): string | null {
    // 1. VS Code settings
    const settingsKey = vscode.workspace.getConfiguration('selfheal').get<string>('geminiApiKey');
    if (settingsKey) { return settingsKey; }

    // 2. Workspace .env file
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (wsFolder) {
        const envPath = path.join(wsFolder, '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const match = envContent.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
            if (match?.[1]) { return match[1].trim(); }
        }
    }

    // 3. Process environment
    if (process.env.GEMINI_API_KEY) { return process.env.GEMINI_API_KEY; }

    return null;
}

export interface AiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

export interface AiStreamCallback {
    onChunk: (text: string) => void;
    onDone: (fullText: string) => void;
    onError: (error: string) => void;
}

/**
 * Send a prompt to Gemini and stream the response.
 *
 * @param command   The slash command name (debug, heal, etc.) or 'chat'
 * @param userMsg   The user's message / context block
 * @param history   Previous conversation messages for context
 * @param callback  Streaming callbacks
 */
export async function streamChat(
    command: string,
    userMsg: string,
    history: AiMessage[],
    callback: AiStreamCallback
): Promise<void> {
    const apiKey = getApiKey();
    if (!apiKey) {
        callback.onError(
            '🔑 **Gemini API key not found.**\n\n' +
            'Set it in one of these places:\n' +
            '1. VS Code Settings → `selfheal.geminiApiKey`\n' +
            '2. Workspace `.env` file → `GEMINI_API_KEY=your-key`\n' +
            '3. Environment variable → `GEMINI_API_KEY`'
        );
        return;
    }

    const systemPrompt = SYSTEM_PROMPTS[command] || SYSTEM_PROMPTS.chat;

    // Build the request body for Gemini generateContent (streaming)
    const contents: AiMessage[] = [
        ...history,
        { role: 'user', parts: [{ text: userMsg }] },
    ];

    const body = JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
            temperature: command === 'explain' ? 0.3 : 0.7,
            maxOutputTokens: 2048,
        }
    });

    const url = `${GEMINI_ENDPOINT}/${DEFAULT_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

    try {
        // Use native fetch (available in Node 18+, which VS Code requires)
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        if (!response.ok) {
            const errText = await response.text();
            callback.onError(`❌ Gemini API error (${response.status}):\n\`\`\`\n${errText.slice(0, 500)}\n\`\`\``);
            return;
        }

        // Process the SSE stream
        const reader = response.body?.getReader();
        if (!reader) {
            callback.onError('❌ No response stream available.');
            return;
        }

        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) { break; }

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE events
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // keep incomplete line in buffer

            for (const line of lines) {
                if (!line.startsWith('data: ')) { continue; }
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === '[DONE]') { continue; }

                try {
                    const parsed = JSON.parse(jsonStr);
                    const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        fullText += text;
                        callback.onChunk(text);
                    }
                } catch {
                    // skip malformed chunks
                }
            }
        }

        callback.onDone(fullText);
    } catch (err: any) {
        callback.onError(`❌ Network error: ${err.message || err}`);
    }
}

/**
 * One-shot (non-streaming) call — used for quick tasks like /fix.
 */
export async function generateOnce(
    command: string,
    userMsg: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        let result = '';
        streamChat(command, userMsg, [], {
            onChunk: (t) => { result += t; },
            onDone: () => resolve(result),
            onError: (e) => reject(new Error(e)),
        });
    });
}
