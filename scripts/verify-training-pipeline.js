'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const TEST_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'da_pipeline_' + Date.now());
const PORT = Number(process.env.PORT || 3041);
process.env.DATA_DIR = TEST_DIR;
process.env.PORT = String(PORT);

fs.mkdirSync(TEST_DIR, { recursive: true });

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: p,
      method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(b || '{}'); } catch { json = { raw: b }; }
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const steps = [];
  const ok = (name, pass, detail = '') => {
    steps.push({ name, pass, detail });
    console.log((pass ? '[OK]' : '[FAIL]') + ' ' + name + (detail ? ' :: ' + detail : ''));
  };

  const { app } = require('../server');
  const server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 800));

  try {
    await req('POST', '/training/setup', {
      mode: 'self',
      subject_name: '测试用户',
      trainer_name: '测试用户',
      trainer_role: 'self',
      subject_brief: 'pipeline verify'
    });

    await req('POST', '/training/deep-unlock', { module: 'cognition_conflict', ready: true });

    const cog = await req('POST', '/training/cognition', {
      values_ranking: ['责任', '真理', '家庭'],
      conflict_choices: [{ choice: '先讲道理，再给一次机会', ts: Date.now() }],
      task_id: 'verify_cog_1'
    });
    ok('认知训练 API', cog.status === 200, cog.json.error || '');

    const core = await req('GET', '/persona/core');
    const dims = core.json.data?.dimensions || {};
    const covered = Object.values(dims).filter(d =>
      (d.ranked_values?.length || d.principles?.length || d.core_traits?.length || d.triggers?.length || d.standards?.length)
    ).length;
    ok('核心层有维度数据', covered >= 1, `covered=${covered}`);

    await req('POST', '/training/memory', {
      content: '我的人生原则是诚实守信，从不欺骗朋友。',
      tags: ['原则', '价值观'],
      tier: 'core'
    });

    const prog = await req('GET', '/training/progress');
    ok('进度模型 v2', prog.json.data?.progress_model === 'five_layer_v2',
      prog.json.data?.progress_model || '');

    const corpusPath = path.join(TEST_DIR, 'finetune', 'user.jsonl');
    const rows = fs.existsSync(corpusPath)
      ? fs.readFileSync(corpusPath, 'utf8').split('\n').filter(Boolean).length
      : 0;
    ok('增量 LoRA 语料', rows >= 1, `${rows} rows`);

    const passed = steps.filter(s => s.pass).length;
    console.log(`\n=== ${passed}/${steps.length} 通过 ===`);
    if (passed < steps.length) process.exit(1);
  } finally {
    server.close();
    if (!process.env.KEEP_PIPELINE_DIR) {
      try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
