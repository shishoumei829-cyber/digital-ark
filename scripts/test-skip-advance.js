'use strict';

/**
 * 验证：跳过当前题后 GET /training/guide/:module 必须返回不同 task_id
 * 运行: node scripts/test-skip-advance.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DIR = path.join(os.tmpdir(), 'da_skip_test_' + Date.now());
process.env.DATA_DIR = TEST_DIR;
process.env.PORT = '3099';

async function req(method, p, body) {
  const res = await fetch('http://127.0.0.1:3099' + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function skipModule(mod) {
  const g = await req('GET', '/training/guide/' + mod);
  const tid = g.json.data?.task_id;
  if (!tid) return { mod, error: 'no task', data: g.json.data };
  const sk = await req('POST', '/training/home/submit', {
    module: mod, task_id: tid, skipped: true, skip_reason: 'no_impression'
  });
  const g2 = await req('GET', '/training/guide/' + mod + '?_=' + Date.now());
  return {
    mod,
    before: tid,
    after: g2.json.data?.task_id,
    promptBefore: (g.json.data?.prompt || g.json.data?.scene || g.json.data?.scenario || g.json.data?.question || '').slice(0, 40),
    promptAfter: (g2.json.data?.prompt || g2.json.data?.scene || g2.json.data?.scenario || g2.json.data?.question || '').slice(0, 40),
    skipOk: sk.json.success,
    same: g2.json.data?.task_id === tid,
    state: JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'training_guide_state.json'), 'utf8'))
  };
}

async function main() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const { app } = require('../server');
  const server = app.listen(3099);
  await new Promise(r => setTimeout(r, 600));

  await req('POST', '/training/setup', {
    mode: 'self',
    subject_name: '测试',
    trainer_name: '测试',
    trainer_role: 'self',
    key_people: [],
    setup_complete: true
  });

  const mods = ['memory', 'relationship', 'emotion', 'cognition', 'voice'];
  const results = [];
  for (const m of mods) {
    results.push(await skipModule(m));
  }

  // 连续跳过 memory 三次
  const triple = [];
  for (let i = 0; i < 3; i++) {
    triple.push(await skipModule('memory'));
  }

  server.close();
  console.log(JSON.stringify({ results, triple }, null, 2));
  const bad = [...results, ...triple].filter(r => r.before && r.same);
  if (bad.length) {
    console.error('FAIL: skip did not advance:', bad);
    process.exit(1);
  }
  console.log('OK: all skips advanced task_id');
}

main().catch(e => { console.error(e); process.exit(1); });
