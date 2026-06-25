'use strict';
const fs = require('fs');
const path = require('path');

const transcript = path.join(
  process.env.USERPROFILE || '',
  '.cursor/projects/e/agent-transcripts/821e559b-8d10-46a9-949c-b9380a487f7e/821e559b-8d10-46a9-949c-b9380a487f7e.jsonl'
);
const out = path.join(__dirname, '..', 'data', 'raw-345-source.md');

const lines = fs.readFileSync(transcript, 'utf8').split('\n');
for (const line of lines) {
  if (!line.includes('认知架构题目库')) continue;
  const o = JSON.parse(line);
  const parts = o.message?.content || [];
  const textPart = parts.find(c => c.type === 'text');
  if (!textPart?.text) continue;
  let text = textPart.text;
  text = text.replace(/^<timestamp>[\s\S]*?<\/timestamp>\s*/i, '');
  text = text.replace(/^<user_query>\s*/i, '');
  text = text.replace(/\s*<\/user_query>\s*$/i, '');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text, 'utf8');
  console.log('Wrote', out, 'chars', text.length);
  process.exit(0);
}
console.error('Not found');
process.exit(1);
