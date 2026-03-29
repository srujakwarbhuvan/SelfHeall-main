import { askHealAgent } from './src/healEngine/healAgent.js';
import { evaluateSelectors } from './src/healEngine/selectorEngine.js';
import { captureFailureContext } from './src/healEngine/failureWatcher.js';

async function testPhase1And2() {
    console.log("--- Phase 1: Verify API Key and Config ---");
    if (!process.env.GEMINI_API_KEY) {
        console.error("❌ GEMINI_API_KEY is not set in environment or .env!");
    } else {
        console.log("✅ Config loaded. GEMINI_API_KEY is present.");
    }

    console.log("\n--- Phase 2: Testing Core Engine with Hardcoded Bundle ---");
    
    // 1. selectorEngine test
    console.log("Testing selectorEngine.js...");
    const engine = evaluateSelectors({ /* mock page */ });
    const fuzzyMatch = engine.tryFuzzy('.broken-buy-button');
    console.log("  Fuzzy match result for '.broken-buy-button':", fuzzyMatch);

    // 2. failureWatcher test
    console.log("\nTesting failureWatcher.js...");
    // Mocking playwright page behavior
    const mockPage = {
        evaluate: async () => '<html><body><button id="new-buy-btn" class="buy-now active">Buy Items</button></body></html>',
        content: async () => '<html><body><button id="new-buy-btn" class="buy-now active">Buy Items</button></body></html>'
    };
    const mockError = new Error("Timeout exceeded while waiting for element .broken-buy-button");
    const mockSteps = [
        { action: "page.goto('https://shop.com')" },
        { action: "page.fill('#username', 'test')" },
        { action: "page.click('.broken-buy-button')" }
    ];

    const context = await captureFailureContext(
        mockPage,
        mockError,
        '.broken-buy-button',
        'Click the buy button to checkout',
        mockSteps
    );
    console.log("  Failure Context Captured:", Object.keys(context));
    
    // 3. healAgent test
    console.log("\nTesting healAgent.js (API key should return a response)...");
    const healResult = await askHealAgent(context);
    console.log("\nHeal Result:");
    console.log(JSON.stringify(healResult, null, 2));
    
    if (healResult.new_selector) {
        console.log("✅ Phase 1 & 2 tests passed! We received a valid heal response from Gemini.");
    } else {
        console.error("❌ Failed to receive a new_selector from Gemini.");
    }
}

testPhase1And2().catch(console.error);
