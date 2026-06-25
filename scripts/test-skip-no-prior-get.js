'use strict';

/**
 * 复现：未先 GET 引导就直接 skip 时，ensureStarted 不应清空刚 markComplete 的进度
 * 运行: node scripts/test-skip-no-prior-get.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DIR = path.join(os.tmpdir(), 'da_skip_noprior_' + Date.now());
process.env.DATA_DIR = TEST_DIR;
process.env.PORT = '3098';

async function req(method, p, body) {
  const res = await fetch('http://127.0.0.1:3098' + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const { app } = require('../server');
  const server = app.listen(3098);
  await new Promise(r => setTimeout(r, 600));

  await req('POST', '/training/setup', {
    mode: 'self',
    subject_name: '测试',
    trainer_name: '测试',
    trainer_role: 'self',
    key_people: [],
    setup_complete: true
  });

  const g = await req('GET', '/training/guide/memory');
  const tid = g.json.data?.task_id;
  if (!tid) throw new Error('no initial memory task');

  const sk = await req('POST', '/training/home/submit', {
    module: 'memory',
    task_id: tid,
    skipped: true,
    skip_reason: 'no_impression'
  });
  const after = sk.json.data?.module_guide?.task_id || sk.json.data?.next?.task_id;
  const state = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'training_guide_state.json'), 'utf8'));

  server.close();

  console.log(JSON.stringify({ before: tid, after, skipOk: sk.json.success, completed: Object.keys(state.completed) }, null, 2));

  if (!sk.json.success) {
    console.error('FAIL: skip request failed');
    process.exit(1);
  }
  if (!state.completed[tid]) {
    console.error('FAIL: skipped task not in completed — ensureStarted wiped markComplete');
    process.exit(1);
  }
  if (after === tid) {
    console.error('FAIL: skip response still shows same task_id');
    process.exit(1);
  }
  console.log('OK: skip without prior GET advances correctly');
}

main().catch(e => { console.error(e); process.exit(1); });
