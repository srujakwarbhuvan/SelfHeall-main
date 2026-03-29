// Dev 1 - Core Engine: failureWatcher.js
// Captures DOM, logs on failure.
export async function captureFailureContext(page, error, selector, intent, stepHistory) {
  let domSnapshot = '';
  try {
    // Advanced DOM serialization: pierces Shadow DOM boundaries and removes noise (svg/script)
    domSnapshot = await page.evaluate(() => {
        function buildTree(node) {
            if (node.nodeType === 3) return node.cloneNode(false); // Map Text nodes
            if (node.nodeType !== 1) return null; // Only Element nodes
            
            // Remove noise to save LLM context window
            if (['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'IFRAME', 'VIDEO'].includes(node.nodeName)) {
                return null;
            }

            let clone = node.cloneNode(false);
            
            // Traverse shadow DOM if it exists, otherwise normal children
            const roots = node.shadowRoot ? [node.shadowRoot, node] : [node];
            
            for (let root of roots) {
                const children = Array.from(root.childNodes);
                for (let child of children) {
                    let childClone = buildTree(child);
                    if (childClone) clone.appendChild(childClone);
                }
            }
            return clone;
        }

        const flattenedRoot = buildTree(document.documentElement);
        return flattenedRoot ? flattenedRoot.outerHTML : '';
    });
  } catch (e) {
    console.error('[Watcher] Failed to flatten Shadow DOM, falling back to outerHTML', e.message);
    domSnapshot = await page.content();
  }

  return {
      brokenSelector: selector,
      intent,
      domSnapshot,
      errorMsg: error.message,
      lastSteps: stepHistory.slice(-5)
  };
}
