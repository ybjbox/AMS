import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace input borders
  content = content.replace(/border border-slate-300/g, "border border-zinc-200/80");
  
  // Replace focus states
  content = content.replace(/focus:ring-2 focus:ring-blue-500 focus:border-blue-500/g, "focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200");
  content = content.replace(/focus:ring-blue-500 focus:border-blue-500/g, "focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200");
  content = content.replace(/focus:ring-2 focus:ring-blue-500/g, "focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all duration-200");
  
  // Replace primary buttons
  content = content.replace(/bg-blue-600/g, "bg-gradient-to-b from-blue-500 to-blue-600 shadow-inner");
  content = content.replace(/hover:bg-blue-700/g, "hover:from-blue-600 hover:to-blue-700");

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});
