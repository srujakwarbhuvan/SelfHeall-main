/**
 * selectorEngine.js — Local DOM Heuristic Healing
 * ============================================================
 * Intent-aware, zero-AI selector healing using DOM scanning.
 * Scores candidates by how many intent keywords they match,
 * preferring id > aria-label > visible text.
 * ============================================================
 */

export function scanDomForHeal(failureBundle) {
    const { selector, domSnapshot, intent } = failureBundle;

    if (!domSnapshot || !selector) {
        return { rootCause: 'Missing DOM or selector', newSelector: null, confidence: 0 };
    }

    // Strip noise so commented-out selectors or scripts don't cause false matches
    const cleanDom = domSnapshot
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');

    // ── Intent-Aware Heuristics (highest priority) ───────────
    if (intent && typeof intent === 'string') {
        const intentWords = intent
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3); // skip "the", "a", "in", etc.

        const nonActionableTags = new Set([
            'label', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'li', 'td', 'th',
        ]);

        // ── Phase 1: Collect ALL candidate elements ──────────
        const candidates = [];

        // 1a. Scan all id attributes
        const idRegex = /id="([^"]+)"/gi;
        let idMatch;
        while ((idMatch = idRegex.exec(cleanDom)) !== null) {
            const idValue = idMatch[1];
            const candidate = `#${idValue}`;
            if (candidate === selector) continue; // Skip the broken selector

            const idLower = idValue.toLowerCase();
            const matchedWords = intentWords.filter(w => idLower.includes(w));
            if (matchedWords.length > 0) {
                candidates.push({
                    selector: candidate,
                    type: 'id',
                    matchedWords,
                    matchCount: matchedWords.length,
                    baseConfidence: 0.95,
                    reason: `Intent keywords [${matchedWords.join(', ')}] matched id="${idValue}"`,
                });
            }
        }

        // 1b. Scan all aria-label attributes
        const ariaRegex = /aria-label="([^"]+)"/gi;
        let ariaMatch;
        while ((ariaMatch = ariaRegex.exec(cleanDom)) !== null) {
            const ariaValue = ariaMatch[1];
            const candidate = `[aria-label="${ariaValue}"]`;
            if (candidate === selector) continue;

            const ariaLower = ariaValue.toLowerCase();
            const matchedWords = intentWords.filter(w => ariaLower.includes(w));
            if (matchedWords.length > 0) {
                candidates.push({
                    selector: candidate,
                    type: 'aria-label',
                    matchedWords,
                    matchCount: matchedWords.length,
                    baseConfidence: 0.93,
                    reason: `Intent keywords [${matchedWords.join(', ')}] matched aria-label="${ariaValue}"`,
                });
            }
        }

        // 1c. Scan visible text content in actionable elements
        const textRegex = /<(\w+)([^>]*)>([^<]{1,60})</gi;
        let textMatch;
        while ((textMatch = textRegex.exec(cleanDom)) !== null) {
            const tag = textMatch[1].toLowerCase();
            const visibleText = textMatch[3].trim();
            if (nonActionableTags.has(tag)) continue;
            if (visibleText.length === 0) continue;

            const textLower = visibleText.toLowerCase();
            const matchedWords = intentWords.filter(w => textLower.includes(w));
            if (matchedWords.length > 0) {
                const candidate = `text="${visibleText}"`;
                if (candidate === selector) continue;

                candidates.push({
                    selector: candidate,
                    type: 'text',
                    matchedWords,
                    matchCount: matchedWords.length,
                    baseConfidence: 0.88,
                    reason: `Intent keywords [${matchedWords.join(', ')}] found in <${tag}> text "${visibleText}"`,
                });
            }
        }

        // ── Phase 2: Score and rank candidates ───────────────
        // Sort by: matchCount DESC, then type priority (id > aria > text), then baseConfidence DESC
        const typePriority = { id: 3, 'aria-label': 2, text: 1 };
        candidates.sort((a, b) => {
            if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
            if (typePriority[b.type] !== typePriority[a.type]) return typePriority[b.type] - typePriority[a.type];
            return b.baseConfidence - a.baseConfidence;
        });

        if (candidates.length > 0) {
            const best = candidates[0];
            // Boost confidence based on how many words matched
            const wordBoost = Math.min(best.matchCount * 0.02, 0.04);
            const confidence = Math.min(best.baseConfidence + wordBoost, 0.99);
            return {
                rootCause: best.reason,
                newSelector: best.selector,
                confidence,
            };
        }
    }

    // ── Selector-Keyword Heuristics (fallback) ───────────────
    // Strips punctuation from the selector to find keywords.
    const cleanWord = selector.replace(/[.#>\[\]="']/g, ' ').trim().split(' ')[0] || '';

    if (!cleanWord) return { rootCause: 'Local scanner checked', newSelector: null, confidence: 0 };

    let newSelector = null;
    let confidence = 0;
    let rootCause = 'Local scanner checked';

    // 1. Check for text content fallback
    if (cleanDom.includes(`>${cleanWord}<`)) {
        newSelector = `text="${cleanWord}"`;
        confidence = 0.85;
        rootCause = `Exact text match found for "${cleanWord}"`;
    }
    // 2. Check aria-label
    else if (cleanDom.includes(`aria-label="${cleanWord}"`)) {
        newSelector = `[aria-label="${cleanWord}"]`;
        confidence = 0.92;
        rootCause = `Direct aria-label match found for "${cleanWord}"`;
    }
    // 3. Partial class match
    else if (cleanDom.includes(`class="${cleanWord}`)) {
        newSelector = `.${cleanWord}`;
        confidence = 0.81;
        rootCause = `Found partial semantic class "${cleanWord}"`;
    }

    // Never return the same selector we were given
    if (newSelector === selector) {
        return { rootCause: 'Local engine matched same selector — deferring to AI', newSelector: null, confidence: 0 };
    }

    return { rootCause, newSelector, confidence };
}
