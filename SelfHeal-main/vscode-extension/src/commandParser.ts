/**
 * commandParser.ts
 * ================================================================
 * Parses CLI-style slash commands from the chat input.
 *
 * Supported commands:
 *   /heal [context]    → Analyze diagnostics + suggest fixes
 *   /debug [context]   → Deep root-cause debugging analysis
 *   /fix [context]     → Find + fix bug at cursor / in selection
 *   /explain [context] → Explain selected code or active file
 *   /analyze [context] → Performance & code quality analysis
 *   /run               → Run the current test file via SelfHeal
 *   /scan              → Run fragility scan on current file
 *   /clear             → Clear conversation history
 *
 * Plain text (no leading /) is treated as a free-form chat message.
 * ================================================================
 */

export interface ParsedCommand {
    command: string;           // e.g. 'debug', 'heal', 'fix'
    args: string[];            // any text after the command, split by spaces
    rawArgs: string;           // the full string after the command
    rawInput: string;          // the complete original input
}

export interface CommandDefinition {
    name: string;
    description: string;
    icon: string;
    requiresCode: boolean;     // needs active editor context
}

/** All recognised slash commands. */
export const COMMANDS: CommandDefinition[] = [
    { name: 'debug',    description: 'Deep debugging — find root cause & suggest fix',       icon: '🔍', requiresCode: true  },
    { name: 'heal',     description: 'Analyze errors & heal broken code / selectors',        icon: '🩹', requiresCode: true  },
    { name: 'fix',      description: 'Fix the bug at cursor position or in selection',       icon: '🔧', requiresCode: true  },
    { name: 'explain',  description: 'Explain selected code or the entire active file',      icon: '📖', requiresCode: true  },
    { name: 'analyze',  description: 'Code quality & performance analysis',                  icon: '📊', requiresCode: true  },
    { name: 'refactor', description: 'Refactor code to be cleaner and more scalable',        icon: '♻️',  requiresCode: true  },
    { name: 'generate', description: 'Generate code or a full test script from a prompt',    icon: '✨', requiresCode: false },
    { name: 'run',      description: 'Run current test through the SelfHeal engine',         icon: '▶️',  requiresCode: false },
    { name: 'scan',     description: 'Static fragility scan on selector brittleness',        icon: '🛡️', requiresCode: false },
    { name: 'clear',    description: 'Clear conversation history',                           icon: '🗑️', requiresCode: false },
];

const COMMAND_NAMES = new Set(COMMANDS.map(c => c.name));

/**
 * Parse a user input string into a structured command, or null
 * if the input is a plain chat message.
 */
export function parseCommand(input: string): ParsedCommand | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
        return null; // plain chat
    }

    const parts = trimmed.slice(1).split(/\s+/);
    const command = (parts[0] || '').toLowerCase();

    if (!COMMAND_NAMES.has(command)) {
        return null; // unknown slash — treat as chat
    }

    const args = parts.slice(1);
    const rawArgs = trimmed.slice(1 + command.length).trim();

    return {
        command,
        args,
        rawArgs,
        rawInput: trimmed,
    };
}

/**
 * Return matching command definitions for autocomplete.
 * Filters by partial name typed so far (e.g. "/de" → debug).
 */
export function getCommandSuggestions(partial: string): CommandDefinition[] {
    const query = partial.replace(/^\//, '').toLowerCase();
    if (!query) { return [...COMMANDS]; }
    return COMMANDS.filter(c => c.name.startsWith(query));
}
