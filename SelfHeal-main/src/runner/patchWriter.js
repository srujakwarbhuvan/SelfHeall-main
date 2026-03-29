import fs from 'fs';
import path from 'path';

export function patchTestFile(filePath, oldSelector, newSelector) {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    console.error(`  ⚠️  Patch target not found: ${absPath}`);
    return { patched: false, file: absPath };
  }

  let content = fs.readFileSync(absPath, 'utf-8');
  
  // Escape regex
  const escaped = oldSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'g');
  const matches = content.match(regex);
  const count = matches ? matches.length : 0;

  if (count === 0) {
    return { patched: false, file: absPath };
  }

  // Create backup
  const backupPath = absPath + '.bak';
  if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(absPath, backupPath);
  }


  content = content.replace(regex, newSelector);
  fs.writeFileSync(absPath, content, 'utf-8');

  console.log(`  ✏️  patchWriter rewrote: "${oldSelector}" → "${newSelector}"`);
  console.log(`  💾 Backup created: ${backupPath}`);
  return { patched: true, file: absPath, replacements: count };
}
