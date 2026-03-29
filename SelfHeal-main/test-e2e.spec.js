import { healClick } from './src/sdk/healClick.js';

export default async function run(page) {
    console.log("    --> Navigating to intentionally broken test page...");
    
    // Create a local page with a known DOM structure
    const html = `
        <html>
            <body>
                <div class="header">End to End Test</div>
                <!-- This button is the target, but its class is completely different. -->
                <button class="new-purchase-btn" aria-label="confirm">Buy Now</button>
            </body>
        </html>
    `;
    
    // Load the HTML directly into Playwright
    await page.goto(`data:text/html,${encodeURIComponent(html)}`);

    console.log("    --> Clicking intentionally broken selector: '.broken-buy-button'");
    
    // This action will fail because the selector does not exist.
    // The Heal Engine will catch it, scan the DOM, invoke Gemini if necessary, 
    // and replace exactly this string pattern right in this file!
    await healClick(page, '.broken-buy-button', { intent: "Click the Buy Now purchase button" });
    
    console.log("    --> Test Complete! We clicked the button and survived a broken selector!");
}
