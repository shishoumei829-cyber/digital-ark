'use strict';

/**
 * 模拟「艾莉莎本人」作为真实用户：设定 → 主页引导 → 专项训练 → 试聊 → 反馈
 * 运行: node scripts/simulate-alisa-user.js
 * 环境: SIM_KEEP=1 保留 DATA_DIR 便于排查
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  REPO,
  loadAlisaCurriculum,
  createHttpClient,
  buildSubmitters,
  unlockDeep,
  runAlisaFullTraining,
  setupAlisaDemo,
  memoryAnswer
} = require('./lib/alisa-sim-core');

const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'digital_ark_alisa_sim_' + Date.now());
const PORT = Number(process.env.PORT || 3022);
const CURRICULUM = loadAlisaCurriculum();

fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = String(PORT);
process.env.PERSONA_ID = 'alisa-kujo';

const steps = [];
const issues = [];

function ok(name, pass, detail = '') {
  steps.push({ name, pass: !!pass, detail });
  console.log((pass ? '[OK]' : '[FAIL]') + ' ' + name + (detail ? ' :: ' + detail : ''));
  if (!pass) issues.push({ name, detail });
}

function warn(name, detail) {
  console.log('[WARN] ' + name + ' :: ' + detail);
  issues.push({ name, detail, warn: true });
}

// 训练答案来自 config/personas/alisa-kujo/dialogue-corpus.json（动画/作品可追溯台词）

async function main() {
  console.log('=== 艾莉莎用户全流程模拟（作品语料库） ===');
  console.log('DATA_DIR=' + DATA_DIR);

  const req = createHttpClient(PORT);
  const { submitViaHome, submitViaModule } = buildSubmitters(req);

  const { app, ragStore, personalMemory } = require('../server');
  const server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 1000));

  try {
    const setup = await setupAlisaDemo(req);
    ok('0. 演示设定（艾莉莎）', setup?.setup_complete, setup?.subject_name);

    let r = await req('POST', '/persona/ingest', { force: true });
    ok('1. 导入艾莉莎 persona', r.json.success, JSON.stringify(r.json.data?.stats || {}).slice(0, 80));

  r = await req('GET', '/training/setup');
  ok('2. setup_complete', r.json.data?.setup_complete === true);

  r = await req('GET', '/training/guide');
  ok('3. 7日引导就绪', !r.json.data?.setup_required && r.json.data?.current_day === 1,
    'day=' + r.json.data?.current_day);

  await unlockDeep(req);

  const train = await runAlisaFullTraining(req, CURRICULUM);
  ok('4. 自动训练', train.submitted >= train.expected, `${train.submitted}/${train.expected}`);
  if (train.failures.length) warn('训练失败项', JSON.stringify(train.failures.slice(0, 3)));

  // ── 试聊 + 反馈（不像 → 修正） ──
  r = await req('POST', '/chat', { messages: [{ role: 'user', content: '可以叫你艾莉吗？' }] });
  const reply = r.json.reply || '';
  ok('6. 试聊有回复', r.status === 200 && reply.length > 5, reply.slice(0, 60));

  r = await req('POST', '/chat/feedback', {
    like: false,
    user_text: '可以叫你艾莉吗？',
    reply_text: reply,
    correction: '……随便你。只有私下可以这么叫。'
  });
  ok('7. 反馈修正', r.json.success, r.json.message);

  r = await req('POST', '/training/home/ingest-chat', {
    user_text: '政近今天又把笔记借我看了一半。',
    assistant_text: reply,
    save_as: 'memory'
  });
  ok('8. 聊天存入训练', r.json.success, r.json.message);

  r = await req('GET', '/training/progress');
  const pct = Math.round((r.json.data?.overall_progress || 0) * 100);
  ok('9. 总进度', pct > 0, pct + '%');

  r = await req('GET', '/training/guide');
  ok('10. 进入巩固期', r.json.data?.phase === 'consolidation', r.json.data?.phase);

  ok('11. RAG 索引', (ragStore.items?.length || 0) >= 10, 'items=' + (ragStore.items?.length || 0));
  ok('12. 记忆入库', (personalMemory.memories?.length || 0) >= 10,
    'count=' + (personalMemory.memories?.length || 0));

  try {
    const { exportCorpus } = require('./export-lora-corpus');
    const exp = await exportCorpus({ dataDir: DATA_DIR, repoRoot: REPO, personaId: 'alisa-kujo' });
    ok('13. LoRA 语料', exp.rows >= 15, exp.rows + ' rows');
  } catch (e) {
    ok('13. LoRA 语料', false, e.message);
  }

  } finally {
    server.close();
  }

  const failed = steps.filter(s => !s.pass);
  console.log('\n=== 结果: ' + (steps.length - failed.length) + '/' + steps.length + ' 通过 ===');
  if (issues.length) {
    console.log('\n发现的问题:');
    issues.forEach(i => console.log(' - ' + i.name + ': ' + i.detail));
  }
  if (!process.env.SIM_KEEP) {
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  } else {
    console.log('保留 DATA_DIR=' + DATA_DIR);
  }
  if (failed.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
