'use strict';

/**
 * 用户流程审计（API 级）— 验证训练身份设定 → 引导 → 训练提交 主链路
 * 运行: node scripts/flow-audit.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DIR = path.join(os.tmpdir(), 'digital_ark_flow_' + Date.now());
process.env.DATA_DIR = TEST_DIR;
process.env.PORT = '3098';

const checks = [];

function ok(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail: detail || '' });
  console.log((pass ? '[OK]' : '[FAIL]') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

async function req(method, p, body) {
  const res = await fetch('http://127.0.0.1:3098' + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const { app } = require('../server');
  const server = app.listen(3098);
  await new Promise(r => setTimeout(r, 800));

  try {
    // 1. 未完成设定时 chat 应拒绝
    let r = await req('POST', '/chat', { messages: [{ role: 'user', content: '你好' }] });
    ok('未完成设定时 /chat 返回 403', r.status === 403 && r.json.reason === 'setup_required', r.json.error);

    // 2. guide 应要求设定
    r = await req('GET', '/training/guide');
    ok('未完成设定时 guide 标记 setup_required', r.json.data?.setup_required === true);

    r = await req('GET', '/training/guide/memory');
    ok('未完成设定时 memory guide 标记 setup_required', r.json.data?.setup_required === true);

    // 3. 完成自训设定（仅本人）
    r = await req('POST', '/training/setup', {
      mode: 'self',
      subject_name: '王伯伯',
      trainer_name: '王伯伯',
      trainer_role: 'self',
      key_people: [],
      setup_complete: true
    });
    ok('保存个人设定', r.json.success && r.json.data.setup_complete, r.json.data?.subject_name);

    // 4. 设定后 chat 可用
    r = await req('POST', '/chat', { messages: [{ role: 'user', content: '你好' }] });
    ok('完成设定后 /chat 可用', r.status === 200 && r.json.reply, String(r.json.reply).slice(0, 40));

    // 5. 个性化课程
    r = await req('GET', '/training/guide');
    ok('guide 含 subject_name', r.json.data?.subject_name === '王伯伯');
    ok('guide 非 demo 模式', r.json.data?.curriculum_mode === 'personal');
    ok('guide 含今日清单 intro', !!(r.json.data?.today?.intro), r.json.data?.today?.intro?.slice(0, 40));
    ok('guide 含下一题指引', !!(r.json.data?.today?.next?.module), r.json.data?.today?.next?.module);

    r = await req('GET', '/training/guide/memory');
    ok('memory 题含「你」视角（自训）', (r.json.data?.prompt || '').includes('你'), r.json.data?.prompt);
    ok('memory 题含教练 purpose', !!(r.json.data?.purpose), r.json.data?.purpose?.slice(0, 40));
    ok('memory 题含答题步骤', Array.isArray(r.json.data?.steps) && r.json.data.steps.length >= 2);

    // 子女视角：童年家记忆题语义应区别于配偶视角
    r = await req('POST', '/training/setup', {
      mode: 'personal',
      subject_name: '张妈妈',
      trainer_name: '张小华',
      trainer_role: 'child',
      key_people: [{ name: '老李', type: 'spouse' }],
      setup_complete: true
    });
    r = await req('GET', '/training/guide/memory');
    const childPrompt = r.json.data?.prompt || '';
    await req('POST', '/training/setup', {
      mode: 'personal',
      subject_name: '张妈妈',
      trainer_name: '老李',
      trainer_role: 'spouse',
      key_people: [{ name: '张小华', type: 'child' }],
      setup_complete: true
    });
    r = await req('GET', '/training/guide/memory');
    const spousePrompt = r.json.data?.prompt || '';
    ok('子女与配偶 memory 题语义不同', childPrompt !== spousePrompt && childPrompt.includes('小时候'),
      `child:${childPrompt.slice(0, 30)} | spouse:${spousePrompt.slice(0, 30)}`);

    // 恢复王伯伯设定继续流程
    await req('POST', '/training/setup', {
      mode: 'personal',
      subject_name: '王伯伯',
      trainer_name: '王小明',
      trainer_role: 'child',
      key_people: [{ name: '李阿姨', type: 'spouse' }, { name: '王强', type: 'friend' }],
      setup_complete: true
    });

    r = await req('GET', '/training/guide/relationship');
    const rel = r.json.data || {};
    ok('relationship 按天解锁或含关系人', rel.locked || (rel.scene || '').includes('李阿姨') || (rel.scene_detail || '').includes('李阿姨'),
      rel.locked ? rel.message : rel.scene);

    // 6. 提交带 task_id 推进
    const taskId = r.json.data?.task_id || (await req('GET', '/training/guide/memory')).json.data?.task_id;
    r = await req('POST', '/training/memory', {
      content: '测试记忆内容足够长用于保存',
      tier: 'core',
      task_id: taskId
    });
    ok('记忆训练提交', r.json.success);

    r = await req('GET', '/training/guide/memory');
    ok('提交后 memory 换题', r.json.data?.task_id !== taskId, r.json.data?.prompt);

    // 6b. 没印象跳过应推进到下一题
    const mem2 = await req('GET', '/training/guide/memory');
    const tid2 = mem2.json.data?.task_id;
    r = await req('POST', '/training/home/submit', {
      module: 'memory',
      task_id: tid2,
      skipped: true,
      skip_reason: 'no_memory'
    });
    ok('主页跳过含情境文案', r.json.success && /没印象|跳过|下一道/.test(r.json.message || ''), r.json.message);
    ok('跳过带下一题预览', !!(r.json.data?.next_scene || r.json.data?.next?.task_id), r.json.data?.next_scene);

    const cp = await req('GET', '/persona/core/card-pairs');
    ok('价值卡片至少 8 组', cp.json.success && (cp.json.data?.pairs?.length || 0) >= 8, String(cp.json.data?.pairs?.length));
    ok('跳过响应含下一题 home', !!(r.json.data?.next?.task_id || r.json.data?.home?.task_id),
      r.json.data?.next?.task_id || r.json.data?.home?.task_id || 'none');
    r = await req('GET', '/training/guide/memory');
    ok('跳过后 memory 换题', r.json.data?.task_id !== tid2, r.json.data?.task_id);

    r = await req('POST', '/training/memory', { skipped: true, task_id: r.json.data?.task_id });
    ok('专项 API 跳过 memory', r.json.success && r.json.data?.skipped, r.json.data?.feedback);

    const emo = await req('GET', '/training/guide/emotion');
    const etid = emo.json.data?.task_id;
    if (etid) {
      r = await req('POST', '/training/emotion', { skipped: true, task_id: etid, scenario: emo.json.data?.scenario || '测试' });
      ok('专项 API 跳过 emotion', r.json.success, r.json.data?.feedback);
    }

    // 7. demo 模式
    await req('POST', '/training/setup/reset');
    r = await req('POST', '/training/setup/demo');
    ok('demo 设定', r.json.data?.mode === 'demo');
    r = await req('GET', '/training/guide/memory');
    ok('demo 使用艾莉莎题', (r.json.data?.prompt || '').length > 5, r.json.data?.prompt?.slice(0, 30));

    // 8. 主页训练 API
    await req('POST', '/training/setup', {
      mode: 'self',
      subject_name: '测试人',
      trainer_name: '测试人',
      trainer_role: 'self',
      key_people: [],
      setup_complete: true
    });
    r = await req('GET', '/training/home');
    ok('主页训练含 task', !!(r.json.data?.task_id || r.json.data?.message), r.json.data?.module);
    r = await req('POST', '/chat/feedback', {
      like: false,
      user_text: '你好',
      reply_text: '您好有什么可以帮您',
      correction: '嗨，怎么了？'
    });
    ok('反馈含修正', r.json.success && r.json.message.includes('修正'));

  } finally {
    server.close();
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  }

  const failed = checks.filter(c => !c.pass);
  console.log('\n---');
  console.log(`流程审计: ${checks.length - failed.length}/${checks.length} 通过`);
  if (failed.length) {
    failed.forEach(f => console.log('  FAIL:', f.name, f.detail));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
