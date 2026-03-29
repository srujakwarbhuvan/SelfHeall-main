/**
 * SelfHeal SDK — Public API
 *
 * Usage:
 *   import { healClick, healFill, healNavigate, healAssert } from 'selfheal/src/sdk/index.js';
 *
 *   await healClick(page, '#login-btn', { intent: 'log the user in' });
 *   await healFill(page, '#email', 'user@test.com', { intent: 'enter email address' });
 *   await healNavigate(page, 'https://app.example.com/checkout', { intent: 'go to checkout' });
 *   await healAssert(page, '#price', 'textContent', '$49.99', { intent: 'verify product price' });
 */

export { healClick } from './healClick.js';
export { healFill } from './healFill.js';
export { healNavigate } from './healNavigate.js';
export { healAssert } from './healAssert.js';
