/**
 * codeContext.ts
 * ================================================================
 * Gathers contextual information from the VS Code workspace to
 * provide the AI with relevant code, diagnostics, and structure.
 * ================================================================
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface DiagnosticInfo {
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
    line: number;
    source: string;
}

export interface CodeContext {
    /** Absolute file path */
    filePath: string;
    /** Basename of the file */
    fileName: string;
    /** Language ID (javascript, typescript, python, etc.) */
    language: string;
    /** Full file content */
    fullContent: string;
    /** Currently selected text, or null */
    selectedText: string | null;
    /** 1-indexed line number of cursor */
    cursorLine: number;
    /** Diagnostics (errors/warnings) on this file */
    diagnostics: DiagnosticInfo[];
    /** Top-level workspace file listing (max 50) */
    workspaceFiles: string[];
}

/**
 * Map VS Code DiagnosticSeverity to a human-readable string.
 */
function severityLabel(s: vscode.DiagnosticSeverity): DiagnosticInfo['severity'] {
    switch (s) {
        case vscode.DiagnosticSeverity.Error:       return 'error';
        case vscode.DiagnosticSeverity.Warning:     return 'warning';
        case vscode.DiagnosticSeverity.Information: return 'info';
        case vscode.DiagnosticSeverity.Hint:        return 'hint';
        default:                                     return 'info';
    }
}

/**
 * Gather context from the currently active editor.
 * Returns null if no editor is open.
 */
export async function gatherContext(): Promise<CodeContext | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return null; }

    const doc = editor.document;
    const selection = editor.selection;

    // Diagnostics from all sources (ESLint, TSC, Pylance, etc.)
    const rawDiags = vscode.languages.getDiagnostics(doc.uri);
    const diagnostics: DiagnosticInfo[] = rawDiags.map(d => ({
        message:  d.message,
        severity: severityLabel(d.severity),
        line:     d.range.start.line + 1,
        source:   d.source ?? 'unknown',
    }));

    // Workspace files (shallow listing, max 50)
    let workspaceFiles: string[] = [];
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (wsFolder) {
        try {
            const pattern = new vscode.RelativePattern(wsFolder, '*');
            const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 50);
            workspaceFiles = uris.map(u => path.relative(wsFolder.uri.fsPath, u.fsPath));
        } catch {
            // silently ignore
        }
    }

    // Selected text
    const selectedText = selection.isEmpty
        ? null
        : doc.getText(selection);

    return {
        filePath:       doc.uri.fsPath,
        fileName:       path.basename(doc.uri.fsPath),
        language:       doc.languageId,
        fullContent:    doc.getText(),
        selectedText,
        cursorLine:     selection.active.line + 1,
        diagnostics,
        workspaceFiles,
    };
}

/**
 * Build a concise summary string of the code context for AI prompts.
 * Limits code to ~4000 chars to keep prompt sizes reasonable.
 */
export function contextToPromptBlock(ctx: CodeContext): string {
    const MAX_CODE = 4000;
    const code = ctx.fullContent.length > MAX_CODE
        ? ctx.fullContent.slice(0, MAX_CODE) + '\n... [truncated]'
        : ctx.fullContent;

    let block = `File: ${ctx.fileName} (${ctx.language})\n`;
    block += `Cursor at line: ${ctx.cursorLine}\n`;

    if (ctx.selectedText) {
        block += `\nSelected code:\n\`\`\`${ctx.language}\n${ctx.selectedText}\n\`\`\`\n`;
    }

    block += `\nFull file content:\n\`\`\`${ctx.language}\n${code}\n\`\`\`\n`;

    if (ctx.diagnostics.length > 0) {
        block += `\nDiagnostics (${ctx.diagnostics.length}):\n`;
        ctx.diagnostics.forEach(d => {
            block += `  [${d.severity.toUpperCase()}] Line ${d.line}: ${d.message} (${d.source})\n`;
        });
    }

    return block;
}
