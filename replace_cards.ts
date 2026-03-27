import fs from 'fs';
import path from 'path';

function walk(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.tsx')) {
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

    // We want to replace the standard card container classes with the new ones.
    // The new classes: bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl
    
    // Pattern 1: bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700
    content = content.replace(/bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700/g, 'bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl');
    
    // Pattern 2: bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700
    content = content.replace(/bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700/g, 'bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl');

    // Pattern 3: bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm
    content = content.replace(/bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm/g, 'bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl');

    // Pattern 4: bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm
    content = content.replace(/bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm/g, 'bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl');

    // Pattern 5: bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700
    content = content.replace(/bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/g, 'bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl');

    // Pattern 6: bg-white dark:bg-slate-800 overflow-hidden rounded-xl shadow-sm border border-slate-200 dark:border-slate-700
    content = content.replace(/bg-white dark:bg-slate-800 overflow-hidden rounded-xl shadow-sm border border-slate-200 dark:border-slate-700/g, 'bg-white dark:bg-slate-800 overflow-hidden shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl');

    if (original !== content) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Updated ' + file);
    }
});
