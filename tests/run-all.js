/**
 * Test runner – executes all test files in the tests/ directory and reports totals.
 * Exit code 0 = all passed, 1 = one or more files failed.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testsDir = __dirname;
const testFiles = fs
    .readdirSync(testsDir)
    .filter(f => f.endsWith('.test.js'))
    .sort();

if (testFiles.length === 0) {
    console.error('No test files found.');
    process.exit(1);
}

let allPassed = true;
const results = [];

for (const file of testFiles) {
    const fullPath = path.join(testsDir, file);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Running: ${file}`);
    console.log('═'.repeat(60));

    const result = spawnSync(process.execPath, [fullPath], {
        stdio: 'inherit',
        env: { ...process.env }
    });

    const ok = result.status === 0;
    results.push({ file, ok });
    if (!ok) allPassed = false;
}

console.log('\n' + '═'.repeat(60));
console.log('Test Suite Summary');
console.log('═'.repeat(60));

for (const { file, ok } of results) {
    console.log(`  ${ok ? '✅' : '❌'} ${file}`);
}

const totalFiles = results.length;
const failedFiles = results.filter(r => !r.ok).length;
console.log(`\n${totalFiles - failedFiles}/${totalFiles} test files passed.\n`);

process.exit(allPassed ? 0 : 1);
