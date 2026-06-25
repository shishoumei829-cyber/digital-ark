'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const TEST_DIR = path.join(os.tmpdir(), 'digital_ark_test_' + Date.now());
process.env.DATA_DIR = TEST_DIR;
process.env.PORT = '3099';

let server;
let baseUrl;

before(async () => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const { app } = require('../server');
  await new Promise(resolve => {
    server = app.listen(3099, resolve);
  });
  baseUrl = 'http://127.0.0.1:3099';
  await req('POST', '/training/setup/demo');
});

after(async () => {
  if (server) await new Promise(r => server.close(r));
  try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
});

async function req(method, path, body) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

describe('数字方舟 API', () => {
  it('GET /health 返回系统状态', async () => {
    const { status, json } = await req('GET', '/health');
    assert.equal(status, 200);
    assert.ok(json.services);
    assert.ok(['healthy', 'degraded'].includes(json.status));
  });

  it('GET /pad-state 返回 PAD 数值', async () => {
    const { status, json } = await req('GET', '/pad-state');
    assert.equal(status, 200);
    assert.ok(typeof json.P === 'number');
    assert.ok(typeof json.A === 'number');
  });

  it('POST /chat 不崩溃且返回回复', async () => {
    const { status, json } = await req('POST', '/chat', {
      messages: [{ role: 'user', content: '你好，今天很开心' }],
      stream: false
    });
    assert.equal(status, 200);
    assert.ok(json.reply);
    assert.ok(json.pad_state);
    assert.ok(typeof json.pad_state.P === 'number');
  });

  it('POST /training/memory 保存记忆并更新进度', async () => {
    const { status, json } = await req('POST', '/training/memory', {
      content: '那是一个安静的午后，阳光洒在窗台上',
      tags: ['童年', '温暖']
    });
    assert.equal(status, 200);
    assert.equal(json.success, true);
    assert.ok(json.data.memory_id);
  });

  it('GET /training/progress 反映训练进度与阶段', async () => {
    const { status, json } = await req('GET', '/training/progress');
    assert.equal(status, 200);
    assert.ok(json.data.overall_progress >= 0);
    assert.ok(json.data.progress_model === 'five_layer_v2');
    assert.ok(json.data.layers?.core?.progress >= 0);
    assert.ok(json.data.modules.memory.sessions_count >= 1);
    assert.ok(json.data.stage?.name);
    assert.ok(json.data.weights.core === 0.35);
    assert.ok(json.data.weights.memory === 0.20);
  });

  it('POST /training/memory 支持分层记忆', async () => {
    const { status, json } = await req('POST', '/training/memory', {
      content: '2008年和谁第一次去云南',
      tier: 'shared',
      time: '2008',
      place: '云南',
      people: ['老王'],
      emotion: '怀念'
    });
    assert.equal(status, 200);
    assert.ok(json.data.personal_memory?.tier === 'shared');
  });

  it('GET /training/memories 返回分层列表', async () => {
    const { status, json } = await req('GET', '/training/memories?tier=shared');
    assert.equal(status, 200);
    assert.ok(json.data.total >= 1);
  });

  it('POST /training/relationships 关系人建档', async () => {
    const { status, json } = await req('POST', '/training/relationships', {
      name: '测试老友', type: 'old_friend'
    });
    assert.equal(status, 200);
    assert.ok(json.data.id);
  });

  it('GET /training/cognition/scenarios 返回冲突场景', async () => {
    const { status, json } = await req('GET', '/training/cognition/scenarios');
    assert.equal(status, 200);
    assert.ok(json.data.length >= 20);
  });

  it('POST /training/cognition 写入核心层', async () => {
    await req('POST', '/training/deep-unlock', { module: 'cognition_conflict', ready: true });
    const { status, json } = await req('POST', '/training/cognition', {
      values_ranking: ['责任', '真理', '家庭'],
      conflict_choices: [{ choice: '先讲道理，再给一次机会', ts: Date.now() }]
    });
    assert.equal(status, 200);
    assert.ok(json.data.ingest?.applied?.length >= 1);
    const core = await req('GET', '/persona/core');
    assert.ok(core.json.data?.dimensions?.value_priority?.ranked_values?.length >= 1);
  });

  it('盲测流程 start + submit', async () => {
    const start = await req('POST', '/training/blind-tests/start', { milestone: 0.40, tester_name: '测试' });
    assert.equal(start.status, 200);
    const sub = await req('POST', '/training/blind-tests/submit', {
      session_id: start.json.data.id, score: 8
    });
    assert.equal(sub.status, 200);
    assert.equal(sub.json.data.passed, true);
  });

  it('POST /companion/archive 对话归档', async () => {
    const { status, json } = await req('POST', '/companion/archive', {
      message: '记得我们去过云南', archive_type: 'memory'
    });
    assert.equal(status, 200);
    assert.ok(json.data.id);
  });

  it('GET /companion/greeting 返回问候语', async () => {
    const { status, json } = await req('GET', '/companion/greeting');
    assert.equal(status, 200);
    assert.ok(json.data.text);
    assert.equal(json.is_digital_avatar, true);
  });

  it('伦理：授权、知情同意与访问控制', async () => {
    const auth = await req('POST', '/ethics/authorization', {
      name: '测试家人', relationship: '子女', trainee_display_name: '林先生'
    });
    assert.equal(auth.status, 200);
    const userId = auth.json.data.id;

    const id = await req('POST', '/companion/identify', { name: '测试家人' });
    assert.equal(id.status, 200);

    const cons = await req('POST', '/companion/consent', {
      user_id: userId, user_name: '测试家人', accepted: true
    });
    assert.equal(cons.status, 200);

    const access = await req('GET', '/companion/access?user_id=' + userId);
    assert.equal(access.status, 200);
    assert.equal(access.json.data.allowed, true);

    const chat = await req('POST', '/companion/chat', {
      companion_user_id: userId,
      messages: [{ role: 'user', content: '你好' }]
    });
    assert.equal(chat.status, 200);
    assert.ok(chat.json.reply);
    assert.equal(chat.json.is_digital_avatar, true);
  });

  it('伦理：深度模块门禁', async () => {
    await req('POST', '/training/resume-today');
    const locked = await req('POST', '/training/emotion', { scenario: '朋友难过', response: '我在听' });
    assert.equal(locked.status, 428);
    const unlock = await req('POST', '/training/deep-unlock', { module: 'emotion', ready: true });
    assert.equal(unlock.status, 200);
    const emo = await req('POST', '/training/emotion', {
      scenario: '朋友难过', response: '我在听'
    });
    assert.equal(emo.status, 200);
  });

  it('伦理：训练随手记与今日停止', async () => {
    const note = await req('POST', '/training/lightweight-note', { content: '今天阳光不错' });
    assert.equal(note.status, 200);
    const stop = await req('POST', '/training/stop-for-today');
    assert.equal(stop.status, 200);
    assert.ok(stop.json.data.stopped_for_today);
  });

  it('GET /ethics/grief-mode 返回淡出配置', async () => {
    const { status, json } = await req('GET', '/ethics/grief-mode');
    assert.equal(status, 200);
    assert.ok(json.data.config);
    assert.ok(json.data.current_phase);
  });

  it('POST /chat/feedback 接受相似度反馈', async () => {
    const { status, json } = await req('POST', '/chat/feedback', { like: true });
    assert.equal(status, 200);
    assert.equal(json.success, true);
  });

  it('GET /rag/search 返回检索结果', async () => {
    await req('POST', '/training/memory', { content: '我小时候住在南方小城', tags: ['童年'] });
    const { status, json } = await req('GET', '/rag/search?q=童年');
    assert.equal(status, 200);
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
  });

  it('GET /tts/status 返回 TTS 状态', async () => {
    const { status, json } = await req('GET', '/tts/status');
    assert.equal(status, 200);
    assert.ok(json.data.status);
  });

  it('POST /backup/export 创建备份', async () => {
    const { status, json } = await req('POST', '/backup/export');
    assert.equal(status, 200);
    assert.ok(json.data.download_base64);
  });
});

describe('VoiceAnalyzer', () => {
  it('基于特征向量计算相似度', () => {
    const { VoiceAnalyzer } = require('../lib/voice');
    const v = new VoiceAnalyzer(TEST_DIR);
    const f = { duration: 5, rms: 0.4, zcr: 0.08, pitchMean: 180 };
    const r1 = v.analyze('世界上有两样东西值得敬畏', f);
    assert.ok(r1.similarity_score > 0);
    const r2 = v.analyze('世界上有两样东西值得敬畏啊', f);
    assert.ok(r2.similarity_score > 0.5);
  });
});

describe('PAD 管理器', () => {
  it('update 需要 pad 和 delta 两个参数', () => {
    const { PADManager } = require('../cognitive/pad');
    const p = new PADManager(TEST_DIR);
    const pad = p.load();
    const delta = p.inferEmotion('谢谢你好开心');
    const next = p.update(pad, delta);
    assert.ok(typeof next.P === 'number');
    assert.notEqual(next.S, undefined);
  });
});
