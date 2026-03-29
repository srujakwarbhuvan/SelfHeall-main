/**
 * stateManager.ts
 * ================================================================
 * Manages conversation history and session state for the AI chat.
 * Keeps messages in memory (per VS Code session).
 * ================================================================
 */

import { AiMessage } from './aiService';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    command?: string;        // e.g. 'debug', 'heal' — null for plain chat
    isStreaming?: boolean;   // true while response is being streamed
}

const MAX_HISTORY = 20;  // keep last N message pairs for context window

export class StateManager {
    private messages: ChatMessage[] = [];
    private _mode: 'chat' | 'dashboard' = 'chat';
    private _idCounter = 0;

    /** Generate a unique message ID. */
    private nextId(): string {
        return `msg_${Date.now()}_${++this._idCounter}`;
    }

    /** Add a user message to the conversation. */
    addUserMessage(content: string, command?: string): ChatMessage {
        const msg: ChatMessage = {
            id: this.nextId(),
            role: 'user',
            content,
            timestamp: Date.now(),
            command,
        };
        this.messages.push(msg);
        this.trim();
        return msg;
    }

    /** Add (or start) an assistant message. Returns the message object. */
    addAssistantMessage(content: string, command?: string): ChatMessage {
        const msg: ChatMessage = {
            id: this.nextId(),
            role: 'assistant',
            content,
            timestamp: Date.now(),
            command,
            isStreaming: true,
        };
        this.messages.push(msg);
        this.trim();
        return msg;
    }

    /** Append streamed text to the latest assistant message. */
    appendToLast(chunk: string): void {
        const last = this.messages[this.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.content += chunk;
        }
    }

    /** Mark the latest assistant message as done streaming. */
    finishLast(): void {
        const last = this.messages[this.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.isStreaming = false;
        }
    }

    /** Get all messages for UI rendering. */
    getAllMessages(): ChatMessage[] {
        return [...this.messages];
    }

    /** Get conversation history formatted for the Gemini API. */
    getApiHistory(): AiMessage[] {
        // Only include completed messages (not currently streaming)
        return this.messages
            .filter(m => !m.isStreaming)
            .map(m => ({
                role: m.role === 'user' ? 'user' as const : 'model' as const,
                parts: [{ text: m.content }],
            }));
    }

    /** Clear all messages. */
    clear(): void {
        this.messages = [];
    }

    /** Keep the conversation within the context window limit. */
    private trim(): void {
        // Keep at most MAX_HISTORY * 2 messages (pairs)
        const max = MAX_HISTORY * 2;
        if (this.messages.length > max) {
            this.messages = this.messages.slice(-max);
        }
    }

    /** Current UI mode */
    get mode(): 'chat' | 'dashboard' { return this._mode; }
    set mode(m: 'chat' | 'dashboard') { this._mode = m; }
}
