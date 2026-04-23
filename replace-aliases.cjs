const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, 'src');

function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (let file of list) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFiles(filePath, files);
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      files.push(filePath);
    }
  }
  return files;
}

const allFiles = getFiles(srcDir);

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content.replace(/from\s+['"]((?:\.\.\/)+)([^'"]+)['"]/g, (match, prefix, rest) => {
    // Determine the absolute path of the import
    const fileDir = path.dirname(file);
    const resolvedPath = path.resolve(fileDir, prefix + rest);
    
    // Check if it's inside src
    if (resolvedPath.startsWith(srcDir)) {
      // It's a cross-folder import, mapping to @
      const aliasPath = '@/' + path.relative(srcDir, resolvedPath).replace(/\\/g, '/');
      if (prefix.length >= 6) { // '../../' is length 6, meaning 2 levels up
        return `from '${aliasPath}'`;
      }
    }
    return match;
  });
  
  // Also handle dynamic imports import(...)
  newContent = newContent.replace(/import\(['"]((?:\.\.\/)+)([^'"]+)['"]\)/g, (match, prefix, rest) => {
    const fileDir = path.dirname(file);
    const resolvedPath = path.resolve(fileDir, prefix + rest);
    if (resolvedPath.startsWith(srcDir)) {
      const aliasPath = '@/' + path.relative(srcDir, resolvedPath).replace(/\\/g, '/');
      if (prefix.length >= 6) {
        return `import('${aliasPath}')`;
      }
    }
    return match;
  });

  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
}
