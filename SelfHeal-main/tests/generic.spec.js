/**
 * generic.spec.js -- SelfHeal Generic Login Flow
 * Run with:
 *   node bin/selfheal.js run tests/generic.spec.js --dashboard
 */

import { healClick, healFill, healNavigate } from '../src/sdk/index.js';

export default async function genericTest(page, { serverUrl, targetUrl } = {}) {
    const url = targetUrl || serverUrl;

    console.log('\n  SelfHeal Generic Login Test');
    console.log('  ----------------------------');
    console.log(`  Target: ${url}\n`);

    // Step 1: Navigate
    console.log('  Step 1/4 - Navigate to website');
    try {
        await healNavigate(page, url, {
            intent: 'Navigate to the target website to begin the login flow',
        });
        console.log('  [OK] Navigated');
    } catch (err) {
        console.log(`  [FAIL] Navigate: ${err.message.split('\n')[0]}`);
    }

    // Step 2: Fill email / username (broken selector)
    console.log('\n  Step 2/4 - Fill email or username');
    try {
        await healFill(page, 'input#email', 'testuser@example.com', {
            intent: 'Fill the login email or username field',
        });
        console.log('  [OK] Username filled');
    } catch (err) {
        console.log(`  [FAIL] Username fill: ${err.message.split('\n')[0]}`);
    }

    // Step 3: Fill password (broken selector)
    console.log('\n  Step 3/4 - Fill password');
    try {
        await healFill(page, 'input#password', 'testpassword123', {
            intent: 'Fill the password field in the login form',
        });
        console.log('  [OK] Password filled');
    } catch (err) {
        console.log(`  [FAIL] Password fill: ${err.message.split('\n')[0]}`);
    }

    // Step 4: Click login / submit (broken selector)
    console.log('\n  Step 4/4 - Click login/submit button');
    try {
        await healClick(page, '#pt-login-2', {
            intent: 'Submit the login form by clicking the login or submit button',
        });
        console.log('  [OK] Submit clicked');
    } catch (err) {
        console.log(`  [FAIL] Submit click: ${err.message.split('\n')[0]}`);
    }

    console.log('\n  ----------------------------');
    console.log('  Generic login flow complete.\n');
}
