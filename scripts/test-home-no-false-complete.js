'use strict';

/**
 * 未答任何题时，主页不应显示「初训已完成」且应能拿到 task_id
 * 运行: node scripts/test-home-no-false-complete.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DIR = path.join(os.tmpdir(), 'da_home_fresh_' + Date.now());
process.env.DATA_DIR = TEST_DIR;
process.env.PORT = '3097';

async function req(method, p, body) {
  const res = await fetch('http://127.0.0.1:3097' + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const { app } = require('../server');
  const server = app.listen(3097);
  await new Promise(r => setTimeout(r, 600));

  await req('POST', '/training/setup', {
    mode: 'self',
    subject_name: '测试',
    trainer_name: '测试',
    trainer_role: 'self',
    key_people: [],
    setup_complete: true
  });

  const guide = await req('GET', '/training/guide');
  const home = await req('GET', '/training/home');
  const state = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'training_guide_state.json'), 'utf8'));

  server.close();

  const g = guide.json.data || {};
  const h = home.json.data || {};
  const completed = Object.keys(state.completed || {}).length;

  console.log(JSON.stringify({
    completed,
    phase: g.phase,
    home_task_id: h.task_id,
    home_message: h.message,
    guide_progress: g.progress
  }, null, 2));

  if (completed !== 0) {
    console.error('FAIL: expected 0 completed in fresh state');
    process.exit(1);
  }
  if (g.phase === 'consolidation') {
    console.error('FAIL: fresh user should not be consolidation phase');
    process.exit(1);
  }
  if (h.message && h.message.includes('初训已完成')) {
    console.error('FAIL: home message falsely says training complete');
    process.exit(1);
  }
  if (!h.task_id) {
    console.error('FAIL: home should offer a task_id for fresh user, got:', h.message);
    process.exit(1);
  }
  console.log('OK: fresh user gets home task, not false completion');
}

main().catch(e => { console.error(e); process.exit(1); });
