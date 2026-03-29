import dotenv from 'dotenv';
import { watchFailure } from './src/watcher/failureWatcher.js';

dotenv.config();

async function runTest() {
    console.log('='?.repeat(50));
    console.log('   🧪 CORE HEALING ENGINE ISOLATED TEST');
    console.log('='?.repeat(50) || '==================================================');

    // 1. Fake inputs based on the shared contract
    const fakeError = new Error("Playwright Timeout: Element '.broken-submit' not found");
    const brokenSelector = ".broken-submit";
    
    // We mock a standard Playwright page object and supply a DOM 
    // where the class changed, but it has 'aria-label="submit"' which 
    // should trigger the selectorEngine heuristic!
    const fakePage = {
        content: async () => `
            <html>
                <body>
                    <div class="checkout-form">
                        <button class="new-submit-btn" aria-label="submit">Place Order</button>
                    </div>
                </body>
            </html>
        `
    };

    const stepHistory = [
        "page.goto('https://checkout.example.com')",
        "page.fill('#username', 'test')",
        "page.click('.broken-submit')" // the failing one
    ];

    const healResult = await watchFailure(fakePage, fakeError, brokenSelector, null, stepHistory);

    console.log("\n--- ✨ FINAL HEAL RESULT ✨ ---");
    console.log(JSON.stringify(healResult, null, 2));
    
    
    // Now test a scenario that bypasses the local scanner forcing the AI fallback
    console.log('\n\n' + '='.repeat(50));
    console.log('   🧠 TESTING AI FALLBACK MECHANISM');
    console.log('='.repeat(50));
    
    const fakePageAI = {
        content: async () => `
            <html>
                <body>
                    <div class="checkout-form-v2-grid">
                        <button id="place-order-v2-final">Confirm Payment</button>
                    </div>
                </body>
            </html>
        `
    };
    
    const aiHealResult = await watchFailure(fakePageAI, fakeError, brokenSelector, stepHistory);

    console.log("\n--- ✨ FINAL HEAL RESULT (AI) ✨ ---");
    console.log(JSON.stringify(aiHealResult, null, 2));

}

runTest().catch(console.error);
