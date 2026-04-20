const fs = require('fs');
const path = require('path');

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

const prefixes = [
  'text', 'bg', 'border', 'ring', 'divide', 'shadow', 'placeholder', 'from', 'to', 'via'
];

const regex = new RegExp('(' + prefixes.join('|') + ')-slate-', 'g');

const files = walkSync('./src');
let changedFiles = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const org = content;
  content = content.replace(regex, '$1-zinc-');
  if (content !== org) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log('Updated', file);
  }
});
console.log('Total files changed:', changedFiles);
