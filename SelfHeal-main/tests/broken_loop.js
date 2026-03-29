import { healClick, healNavigate } from '../src/sdk/index.js';

export default async function run(page) {
    // 1. Navigate to our test fixture
    await healNavigate(page, 'http://localhost:3000/fixtures/shop.html');

    // 2. Click a button that HAS BEEN CHANGED (trying an ID that doesn't exist)
    // The actual ID on the page is `#purchase-btn`
    console.log('  🎯 Attempting to click #buy-now (Should Fail and Heal)');
    await healClick(page, '#buy-now', { 
        intent: 'Click the button to purchase the item' 
    });

    console.log('  🎉 [Test] Script successfully continued after heal!');
}
