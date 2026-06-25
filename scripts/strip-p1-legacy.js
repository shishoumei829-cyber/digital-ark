const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'public', 'apps', 'sanctuary.html');
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('<div id="p1"');
const end = s.indexOf('<!-- PAGE 3', start);
if (start < 0 || end < 0) {
  console.error('markers not found');
  process.exit(1);
}
const repl = `<div id="p1" class="page da-training-page">
  <div class="pc da-training-hub-host" aria-live="polite">
    <div class="da-empty-card da-hub-loading"><span class="mi">hourglass_empty</span><p>加载训练总览…</p></div>
  </div>
</div>

`;
fs.writeFileSync(p, s.slice(0, start) + repl + s.slice(end), 'utf8');
console.log('stripped p1 legacy');
