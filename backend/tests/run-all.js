// Runs every *.test.js file and prints a summary.   Usage: npm test
// Save the output for the report:  npm test | tee ../docs/test-results.txt
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
const rows = [];

for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
  const lines = (result.stdout || '').split('\n');
  const passed = lines.filter((l) => l.startsWith('PASS ')).length;
  const failed = lines.filter((l) => l.startsWith('FAIL ')).length;
  console.log(`\n=== ${file} ===`);
  console.log(lines.filter((l) => l.startsWith('PASS ') || l.startsWith('FAIL ') || l.startsWith('   ')).join('\n'));
  if (result.status !== 0 && failed === 0) {
    console.log('FAIL (test crashed)\n' + (result.stderr || '').split('\n').slice(0, 15).join('\n'));
  }
  rows.push({ file, passed, failed: result.status === 0 ? failed : Math.max(failed, 1) });
}

console.log('\n=== Summary ===');
for (const r of rows) console.log(`${r.failed ? 'FAIL' : 'ok  '}  ${r.file.padEnd(28)} ${r.passed} passed, ${r.failed} failed`);
const totalPassed = rows.reduce((a, r) => a + r.passed, 0);
const totalFailed = rows.reduce((a, r) => a + r.failed, 0);
console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed across ${rows.length} files`);
process.exit(totalFailed ? 1 : 0);
