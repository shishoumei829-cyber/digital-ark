'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'digital_ark_e2e_' + Date.now());
const PORT = Number(process.env.PORT || 3011);

fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = String(PORT);
process.env.PERSONA_ID = 'alisa-kujo';

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1', port: PORT, path: p, method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(b || '{}') }); }
        catch { resolve({ status: res.statusCode, raw: b }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const steps = [];
  const ok = (name, cond, detail) => {
    steps.push({ name, pass: !!cond, detail: detail || '' });
    console.log((cond ? '[OK]' : '[FAIL]') + ' ' + name + (detail ? ' :: ' + detail : ''));
  };

  const { app, ragStore, personalMemory } = require('../server');
  const server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 1200));

  try {
    const ing = await req('POST', '/persona/ingest', { force: true });
    ok('1. 导入 persona', ing.json.success, JSON.stringify(ing.json.data?.stats || ing.json));

    await req('POST', '/training/setup/demo');

    const voice = await req('POST', '/training/voice', {
      transcript: '世界上有两样东西，我越是思考，越是觉得它们充满新的且日益增长的惊赞和敬畏。',
      audio_features: { duration: 4.2 }
    });
    ok('2. 音色训练', voice.json.success, voice.json.data?.feedback);

    const mem = await req('POST', '/training/memory', {
      content: '那是一个特别安静的午后，外婆家的廊下，我第一次听见用俄语念诗。',
      tier: 'core', time: '童年', place: '九条家', people: ['外婆'], emotion: '怀念'
    });
    ok('3. 记忆训练', mem.json.success, mem.json.data?.feedback);

    const rel = await req('POST', '/training/relationship', {
      scenario: 'family', response_type: 'emotional',
      response_text: '没关系的，一次考试不代表什么。过来抱一下。',
      scene: '女儿考试失利'
    });
    ok('4. 关系训练', rel.json.success, rel.json.data?.feedback);

    await req('POST', '/training/deep-unlock', { module: 'emotion', ready: true });
    const emo = await req('POST', '/training/emotion', {
      scenario: '朋友深夜崩溃', response: '……我在。你先慢慢说，不用整理语言。',
      stress_reaction: 'rational', comfort_style: 'accompany_first'
    });
    ok('5. 情感训练', emo.json.success, emo.json.data?.feedback);

    await req('POST', '/training/deep-unlock', { module: 'cognition_conflict', ready: true });
    const cog = await req('POST', '/training/cognition', {
      values_ranking: ['责任', '诚实', '家族', '荣誉', '平和', '自由'],
      conflict_choices: [{ choice: '坚持说出真相' }]
    });
    ok('6. 认知训练', cog.json.success, cog.json.data?.feedback);

    const chat1 = await req('POST', '/chat', { messages: [{ role: 'user', content: '可以叫你艾莉吗？' }] });
    ok('7. 试聊有回复', !!chat1.json.reply, (chat1.json.reply || '').slice(0, 100));
    ok('8. 试聊是数字分身', chat1.json.is_digital_avatar === true, 'persona=' + chat1.json.persona_id);

    await req('POST', '/chat/feedback', { like: true, user_text: '可以叫你艾莉吗？', reply_text: chat1.json.reply });

    const prog = await req('GET', '/training/progress');
    ok('9. 进度>0', prog.json.data?.overall_progress > 0, Math.round((prog.json.data?.overall_progress || 0) * 100) + '%');

    ok('10. RAG索引', ragStore.items.length >= 10, 'items=' + ragStore.items.length);
    ok('11. 记忆入库', personalMemory.memories.length >= 10, 'count=' + personalMemory.memories.length);

    const { exportCorpus } = require('./export-lora-corpus');
    const exp = await exportCorpus({ dataDir: DATA_DIR, repoRoot: path.join(__dirname, '..'), personaId: 'alisa-kujo' });
    ok('12. LoRA语料导出', exp.rows >= 20, exp.rows + ' rows');

    const failed = steps.filter(s => !s.pass);
    console.log('\n=== 结果: ' + (steps.length - failed.length) + '/' + steps.length + ' 通过 ===');
    console.log('DATA_DIR=' + DATA_DIR);
    if (failed.length) {
      console.log('失败项:', failed.map(f => f.name).join(', '));
      process.exitCode = 1;
    } else {
      console.log('用户训练全流程跑通');
    }
  } finally {
    server.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
