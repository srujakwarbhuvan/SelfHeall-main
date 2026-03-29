/**
 * broken-selectors.spec.js -- SelfHeal Live AI Healing Test
 * This test is deliberately broken to showcase the AI healing capabilities.
 * 
 * Instructions:
 * 1. Open this file in your editor.
 * 2. Press Cmd+Shift+H to run it.
 * 3. Watch the AI auto-heal the broken selectors in the SelfHeal Sidebar!
 */

import { healClick, healFill, healNavigate } from '../src/sdk/index.js';

export default async function brokenSelectorsTest(page) {
    console.log('\n  SelfHeal Live AI Healing');
    console.log('  ----------------------------');
    console.log('  Watch the VS Code Dashboard tab to see real-time healing!\n');

    // Step 1: Navigate to example.com
    console.log('  Step 1/3 - Navigate to example.com');
    await healNavigate(page, 'https://example.com', {
        intent: 'Navigate to the target website to begin the test',
    });
    console.log('  [OK] Navigated');

    // Step 2: Intentional Failure — try to fill a search box that doesn't exist
    // The AI will see there is no search box, and explain what happened.
    console.log('\n  Step 2/3 - Attempt to search (Broken Selector!)');
    try {
        await healFill(page, 'input#search-box-v2', 'SelfHeal AI', {
            intent: 'Fill the search box with a query',
        });
        console.log('  [OK] Search filled (Healed!)');
    } catch (err) {
        // We catch it so the test can proceed even if it completely fails
        console.log(`  [FAIL] Search fill failed: ${err.message.split('\n')[0]}`);
    }

    // Step 3: Intentional Failure — try to click a non-existent button
    // The AI will look at the intent, scan the DOM, and find the "More information..." anchor tag instead
    console.log('\n  Step 3/3 - Click checkout button (Broken Selector!)');
    try {
        await healClick(page, 'text="Learn more"', {
            intent: "Click the 'More information...' link to proceed",
        });
        console.log('  [OK] Link clicked (Healed!)');
    } catch (err) {
        console.log(`  [FAIL] Link click failed: ${err.message.split('\n')[0]}`);
    }

    console.log('\n  ----------------------------');
    console.log('  Healing complete. Check the SelfHeal dashboard for stats!\n');
}
