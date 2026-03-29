import fs from 'fs';
import path from 'path';
import * as recast from 'recast';

// The set of SDK functions we know how to patch.
const HEAL_FUNCTION_NAMES = new Set(['healClick', 'healFill', 'healNavigate']);

export function patchTestFile(filePath, oldSelector, newSelector) {
  const absPath = path.resolve(filePath);

  if (process.env.SELFHEAL_DRY_RUN === 'true') {
    console.log(`  [Dry Run] Analysis complete. Would patch: "${oldSelector}" → "${newSelector}" in ${path.basename(absPath)}`);
    return { patched: false, file: absPath, replacements: 0 };
  }

  if (!fs.existsSync(absPath)) {
    console.error(`  ⚠️  Patch target not found: ${absPath}`);
    return { patched: false, file: absPath, replacements: 0 };
  }

  try {
    const code = fs.readFileSync(absPath, 'utf-8');
    // The default parser (esprima) should handle modern JS.
    const ast = recast.parse(code);

    let patched = false;
    let replacements = 0;

    recast.visit(ast, {
      visitCallExpression(nodePath) {
        const { node } = nodePath;

        const checkAndPatch = (selectorNode) => {
          if (
            selectorNode &&
            selectorNode.type === 'Literal' &&
            typeof selectorNode.value === 'string' &&
            selectorNode.value === oldSelector
          ) {
            selectorNode.value = newSelector;
            patched = true;
            replacements++;
            return true;
          }
          return false;
        };

        // 1. SDK Functions (e.g. healClick(page, selector, ...))
        if (
          node.callee.type === 'Identifier' &&
          HEAL_FUNCTION_NAMES.has(node.callee.name)
        ) {
          if (node.arguments.length > 1) {
            if (checkAndPatch(node.arguments[1])) return false;
          }
        }

        // 2. Standard Playwright Actions (e.g. page.click(selector))
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          ['click', 'fill', 'goto'].includes(node.callee.property.name)
        ) {
          if (node.arguments.length > 0) {
            if (checkAndPatch(node.arguments[0])) return false;
          }
        }

        this.traverse(nodePath);
      },
    });

    if (patched) {
      // Recast preserves original formatting, but we can enforce a style.
      const output = recast.print(ast, { quote: 'single', tabWidth: 2 });
      fs.writeFileSync(absPath, output.code, 'utf-8');
      console.log(`  ✏️  patchWriter (AST) rewrote: "${oldSelector}" → "${newSelector}"`);
    }

    return { patched, file: absPath, replacements };

  } catch (error) {
    console.error(`  ❌  AST-based patch failed for ${absPath}:`, error);
    // Fallback to original regex method could be an option, but for now, just fail.
    return { patched: false, file: absPath, error: error.message, replacements: 0 };
  }
}
