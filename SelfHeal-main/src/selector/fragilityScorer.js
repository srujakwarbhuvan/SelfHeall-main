import fs from 'fs';

export function scoreFragility(testFile) {
    if (!fs.existsSync(testFile)) return [];

    const content = fs.readFileSync(testFile, 'utf-8');
    
    // Extract selector arguments from healClick, healFill, healNavigate
    const regex = /heal(?:Click|Fill|Navigate)\(\s*page\s*,\s*[`'"](.*?)[`'"]/g;
    const matches = [...content.matchAll(regex)];

    const results = [];

    matches.forEach(m => {
        const sel = m[1];

        // Skip URLs from healNavigate
        if (sel.startsWith('http') || sel.includes('/')) return;

        let fragilityScore = 0.5;
        let risk = 'medium';

        if (sel.includes('[aria-label=')) {
            fragilityScore = 0.1;
            risk = 'low';
        } else if (sel.includes('[data-') || sel.includes('[data-testid=')) {
            fragilityScore = 0.15;
            risk = 'low';
        } else if (sel.startsWith('text=')) {
            fragilityScore = 0.2;
            risk = 'low';
        } else if (sel.startsWith('.')) {
            fragilityScore = 0.5;
            risk = 'medium';
        } else if (sel.startsWith('#')) {
            // Check for random hash characters (e.g. #btn-3f9a2)
            if (/[a-zA-Z0-9]+-[a-fA-F0-9]{4,}$/.test(sel)) {
                fragilityScore = 0.9;
                risk = 'high';
            } else {
                fragilityScore = 0.6;
                risk = 'medium';
            }
        } else {
            // Default structural fallback
            fragilityScore = 0.7;
            risk = 'high';
        }

        results.push({ selector: sel, fragilityScore, risk });
    });

    return results;
}
