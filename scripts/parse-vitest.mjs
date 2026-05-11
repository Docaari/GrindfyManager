import fs from 'fs';
const r = JSON.parse(fs.readFileSync('C:/Users/ricar/AppData/Local/Temp/vitest-results.json', 'utf8'));
const failed = r.testResults.filter(t => t.status === 'failed');
console.log('FAILED FILES:', failed.length);
const seen = new Set();
failed.forEach(x => {
  const n = x.name.replace(/^.*grindfy[\\/]/, '').replace(/\\/g, '/');
  if (!seen.has(n)) {
    seen.add(n);
    console.log(' -', n);
  }
});
