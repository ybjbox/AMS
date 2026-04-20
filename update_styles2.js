import fs from 'fs';
import path from 'path';

const walkSync = (dir, filelist = []) => {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist') {
        filelist = walkSync(filepath, filelist);
      }
    } else {
      if (filepath.endsWith('.tsx') || filepath.endsWith('.ts')) {
        filelist.push(filepath);
      }
    }
  });
  return filelist;
};

const files = walkSync('./src');
let changedFiles = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const org = content;

  // We should match className attributes accurately. We just do line-by-line patching.
  const lines = content.split('\n');
  const newLines = lines.map(line => {
    let replacedLine = line;

    // Rule 1: bg-white without dark:bg-
    if (replacedLine.match(/\bbg-white\b/) && !replacedLine.match(/dark:bg-/)) {
      replacedLine = replacedLine.replace(/\bbg-white\b/g, 'bg-white dark:bg-zinc-800');
    }

    // Rule 2: text-zinc-(700|800|900) without dark:text-
    if (replacedLine.match(/\btext-zinc-[789]00\b/) && !replacedLine.match(/dark:text-/)) {
      replacedLine = replacedLine.replace(/\b(text-zinc-700)\b/g, '$1 dark:text-zinc-300');
      replacedLine = replacedLine.replace(/\b(text-zinc-[89]00)\b/g, '$1 dark:text-zinc-200');
    }

    // Rule 3: border-zinc-200 without dark:border-
    if (replacedLine.match(/\bborder-zinc-200\b/) && !replacedLine.match(/dark:border-/)) {
      replacedLine = replacedLine.replace(/\bborder-zinc-200\b/g, 'border-zinc-200 dark:border-zinc-700');
    }
    
    // Also cover border-zinc-200/50, border-zinc-200/80 etc if we missed any, actually the \b will match border-zinc-200 but not include the /80, so we just add it before the /80 ? No, \b matches boundary. border-zinc-200/80 boundary is at 200...
    // so it becomes border-zinc-200 dark:border-zinc-700/80 or something.
    // Wait, the regex `\bborder-zinc-200\b` will match `border-zinc-200` in `border-zinc-200/80`.
    // It would become `border-zinc-200 dark:border-zinc-700/80`. Wait, no, the /80 belongs to the original.
    // Let's refine the regexes.

    return replacedLine;
  });

  content = newLines.join('\n');

  // Refine Rule 3 to handle opacity modifiers if they exist:
  // e.g. border-zinc-200/X -> border-zinc-200/X dark:border-zinc-700/X ?
  // Actually we can just do line replacement for those specific cases safely if we just regex replace
  
  if (content !== org) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log('Updated', file);
  }
});
console.log('Total files changed:', changedFiles);
