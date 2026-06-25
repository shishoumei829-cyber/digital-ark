'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { buildPersonalCurriculumFromBank, resolveQuestionBankPath } = require('../../lib/question-bank-loader');
const { countCurriculumTasks } = require('../../lib/scenario-bank');

const REPO = path.join(__dirname, '../..');
const CORPUS_PATH = path.join(REPO, 'config/personas/alisa-kujo/dialogue-corpus.json');
const MODULES = ['voice', 'memory', 'relationship', 'emotion', 'cognition'];

const CORPUS = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));
const ALISA_ANSWERS = { ...CORPUS.training_answers };

const ALISA_KEY_PEOPLE = [
  { id: 'kunagi', name: '久世政近', type: 'friend', notes: '邻座·学生会庶务' },
  { id: 'yuki', name: '周防有希', type: 'friend', notes: '政近之妹·学生会宣传' },
  { id: 'masha', name: '玛利亚·米哈伊洛夫纳·九条', type: 'old_friend', notes: '姐姐·玛莎' }
];

function loadDialogueCorpus() {
  return CORPUS;
}

function loadAlisaCurriculum() {
  return JSON.parse(
    fs.readFileSync(path.join(REPO, 'config/personas/alisa-kujo/curriculum-7day.json'), 'utf8')
  );
}

function alisaSetupContext() {
  return {
    mode: 'self',
    subject_name: '艾莉莎·米哈伊罗夫纳·九条',
    subject_brief: '征岭学园高一学生会会计，日俄混血，孤傲的公主',
    trainer_name: '艾莉莎·米哈伊罗夫纳·九条',
    trainer_role: 'self',
    trainer_role_label: '本人',
    key_people: ALISA_KEY_PEOPLE.map(p => ({ ...p, type_label: p.type })),
    is_self: true,
    is_demo: false
  };
}

function countQuestionBankForAlisa() {
  const ctx = alisaSetupContext();
  const result = buildPersonalCurriculumFromBank(ctx, REPO);
  if (!result.ok || !result.curriculum) {
    return { ok: false, error: result.error, bank_path: result.bank_path };
  }
  const c = result.curriculum;
  const counts = countCurriculumTasks(c);
  const byModule = { voice: 0, memory: 0, relationship: 0, emotion: 0, cognition: 0 };
  for (const day of c.days || []) {
    for (const t of day.tasks || []) {
      if (byModule[t.module] != null) byModule[t.module]++;
    }
  }
  for (const [pool, list] of Object.entries(c.rotation_pools || {})) {
    const mod = pool.split('_')[0];
    if (byModule[mod] != null) byModule[mod] += list.length;
  }
  return {
    ok: true,
    bank_path: result.bank_path,
    initial_7day: counts.dayTasks,
    rotation_pool: counts.poolTasks,
    total_situations: counts.totalUnique,
    by_module: byModule,
    curriculum: c
  };
}

function createHttpClient(port) {
  return function req(method, p, body) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const r = http.request({
        hostname: '127.0.0.1',
        port,
        path: p,
        method,
        headers: body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {}
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
  };
}

function pickLineByKeyword(text, lines) {
  const t = text || '';
  if (/政近|邻座|久世/.test(t)) {
    return lines.find(l => /政近|邻座|笔记|预习/.test(l.text))?.text;
  }
  if (/玛莎|玛利亚|姐姐/.test(t)) {
    return lines.find(l => /玛莎|姐姐|マーシャ/.test(l.text))?.text;
  }
  if (/有希/.test(t)) {
    return lines.find(l => /有希|友達|竞争对手/.test(l.text))?.text;
  }
  if (/母亲|妈/.test(t)) {
    return ALISA_ANSWERS.d2_rel_1 || lines.find(l => /没事/.test(l.text))?.text;
  }
  if (/文化祭|学园祭/.test(t)) {
    return ALISA_ANSWERS.d3_memory_1;
  }
  if (/完美|失败|发表/.test(t)) {
    return ALISA_ANSWERS.d1_memory_2;
  }
  if (/家|童年/.test(t)) {
    return ALISA_ANSWERS.d1_memory_1;
  }
  return null;
}

function memoryAnswer(task) {
  if (ALISA_ANSWERS[task.id]) return ALISA_ANSWERS[task.id];
  const fromCorpus = pickLineByKeyword(task.prompt, CORPUS.japanese_lines || []);
  if (fromCorpus) return fromCorpus;
  const prompt = (task.prompt || '').slice(0, 48);
  return `关于「${prompt}」——初中转入征岭学园后的事。我会写具体日期、地点和谁在场，不敷衍。（艾莉莎）`;
}

function answerForGuideTask(task) {
  const t = {
    id: task.task_id || task.id,
    module: task.module,
    prompt: task.prompt,
    scene: task.scene,
    scenario: task.scenario,
    question: task.question,
    literary_text: task.literary_text,
    choices: task.choices,
    options: task.options,
    tier: task.tier,
    suggested_tags: task.suggested_tags
  };

  switch (task.module) {
    case 'memory':
      return { content: memoryAnswer(t) };
    case 'relationship': {
      const c = task.choices?.[0] || {};
      return {
        response_type: c.type || 'emotional',
        response_text: ALISA_ANSWERS[t.id] || c.text || '……嗯。我知道了。',
        scene: task.scene || task.category
      };
    }
    case 'emotion':
      return {
        response: ALISA_ANSWERS[t.id] || pickLineByKeyword(task.scenario, CORPUS.japanese_lines) || '……我在。你先慢慢说。'
      };
    case 'cognition':
      return {
        choice: ALISA_ANSWERS[t.id] || task.options?.[0] || '视情况而定',
        choice_index: 0
      };
    case 'voice':
      return {
        transcript: task.literary_text || ALISA_ANSWERS.d1_voice_1 || '（朗读）世界上有两样东西……',
        minimal: true
      };
    default:
      return { content: '……' };
  }
}

function buildSubmitters(req) {
  async function submitGuideTask(task) {
    const id = task.task_id || task.id;
    const mod = task.module;
    const ans = answerForGuideTask(task);

    switch (mod) {
      case 'memory':
        return req('POST', '/training/memory', {
          content: ans.content,
          tier: task.tier || 'core',
          tags: task.suggested_tags || [],
          task_id: id
        });
      case 'relationship':
        return req('POST', '/training/relationship', {
          scenario: task.category || 'daily',
          response_type: ans.response_type,
          response_text: ans.response_text,
          scene: ans.scene || task.scene,
          task_id: id
        });
      case 'emotion':
        return req('POST', '/training/emotion', {
          scenario: task.scenario,
          response: ans.response,
          stress_reaction: task.stress_reaction || 'contextual',
          comfort_style: task.comfort_style || 'accompany_first',
          task_id: id
        });
      case 'cognition':
        return req('POST', '/training/cognition', {
          values_ranking: CORPUS.cognition?.values_ranking || ['责任', '诚实', '家族', '荣誉', '平和', '自由'],
          conflict_choices: [{ choice: ans.choice, ts: Date.now() }],
          task_id: id
        });
      case 'voice':
        return req('POST', '/training/voice', {
          transcript: ans.transcript,
          task_id: id,
          audio: 'alisa_sim_no_mic',
          audio_features: { duration: ans.minimal ? 2 : 4, simulated: true, minimal: true }
        });
      default:
        return { status: 400, json: { error: 'unknown module ' + mod } };
    }
  }

  async function submitViaHome(home) {
    const id = home.task_id;
    const mod = home.module;
    const ans = answerForGuideTask(home);

    switch (mod) {
      case 'memory':
        return req('POST', '/training/home/submit', {
          module: mod,
          task_id: id,
          content: ans.content
        });
      case 'relationship':
        return req('POST', '/training/home/submit', {
          module: mod,
          task_id: id,
          content: ans.response_text,
          response_type: ans.response_type,
          choice_index: 0
        });
      case 'emotion':
        return req('POST', '/training/home/submit', {
          module: mod,
          task_id: id,
          content: ans.response
        });
      case 'cognition':
        return req('POST', '/training/home/submit', {
          module: mod,
          task_id: id,
          content: ans.choice,
          choice_index: ans.choice_index
        });
      case 'voice': {
        const v = await req('POST', '/training/voice', {
          transcript: ans.transcript,
          task_id: id,
          audio: 'alisa_sim_no_mic',
          audio_features: { duration: 2, simulated: true, minimal: true }
        });
        return v;
      }
      default:
        return { status: 400, json: { error: 'unknown module ' + mod } };
    }
  }

  async function submitViaModule(task) {
    return submitGuideTask({ ...task, task_id: task.id || task.task_id });
  }

  return { submitViaHome, submitViaModule, submitGuideTask, answerForGuideTask };
}

async function unlockDeep(req) {
  for (const mod of ['emotion', 'wish', 'cognition_conflict']) {
    await req('POST', '/training/deep-unlock', { module: mod, ready: true });
  }
}

/**
 * 以「艾莉莎本人」身份走完整项目：题库.txt 全课表 + 五模块轮播，真实调用训练 API 写入记忆等。
 * 不是 demo 26 题，而是 self 模式 + 你的几百道题库。
 */
async function runAlisaCompleteUserSession(req, opts = {}) {
  const { submitViaHome, submitViaModule, submitGuideTask } = buildSubmitters(req);
  const bank = countQuestionBankForAlisa();
  if (!bank.ok) throw new Error('题库不可用: ' + bank.error);

  const stats = {
    bank_path: bank.bank_path,
    target_initial: bank.initial_7day,
    target_rotation: bank.rotation_pool,
    target_total: bank.total_situations,
    by_module_target: bank.by_module,
    submitted: 0,
    failed: [],
    by_module_done: Object.fromEntries(MODULES.map(m => [m, 0])),
    phases: []
  };

  const maxStuck = opts.maxStuckPerLoop || 5;

  // ── 阶段1：主页引导（7日课表顺序，与 App 一致）──
  let homeCount = 0;
  let lastId = null;
  let stuck = 0;
  while (homeCount < bank.initial_7day + 5) {
    const r = await req('GET', '/training/home?_=' + Date.now());
    const home = r.json.data || {};
    if (!home.task_id) {
      stats.phases.push({ phase: 'home_done', count: homeCount });
      break;
    }
    homeCount++;
    const sub = await submitViaHome(home);
    if (sub.status === 200 && sub.json.success) {
      stats.submitted++;
      stats.by_module_done[home.module] = (stats.by_module_done[home.module] || 0) + 1;
      stuck = home.task_id === lastId ? stuck + 1 : 0;
      lastId = home.task_id;
    } else {
      stats.failed.push({ phase: 'home', task_id: home.task_id, error: sub.json.error });
      stuck++;
    }
    if (stuck >= maxStuck) {
      const mod = await req('GET', '/training/guide/' + home.module);
      await submitViaModule(mod.json.data || home);
      stuck = 0;
    }
  }

  // ── 阶段2：五模块专项（含巩固轮播，每模块刷到 all_done 或达到轮播池上限）──
  for (const mod of MODULES) {
    const poolLen = bank.curriculum.rotation_pools?.[mod]?.length || 0;
    const poolCap = poolLen + 8;
    let modCount = 0;
    let modStuck = 0;
    let modLast = null;

    while (modCount < poolCap) {
      const g = await req('GET', '/training/guide/' + mod + '?_=' + Date.now());
      const t = g.json.data || {};
      if (t.all_done || t.locked || !t.task_id) {
        stats.phases.push({
          phase: 'module_done',
          module: mod,
          count: modCount,
          all_done: !!t.all_done,
          message: t.message
        });
        break;
      }
      const sub = await submitGuideTask(t);
      if (sub.status === 200 && sub.json.success) {
        stats.submitted++;
        stats.by_module_done[mod] = (stats.by_module_done[mod] || 0) + 1;
        modStuck = t.task_id === modLast ? modStuck + 1 : 0;
        modLast = t.task_id;
      } else {
        stats.failed.push({ phase: 'module', module: mod, task_id: t.task_id, error: sub.json.error });
        modStuck++;
      }
      modCount++;
      if (modStuck >= maxStuck) break;
    }
  }

  const guide = await req('GET', '/training/guide');
  const progress = await req('GET', '/training/progress');
  stats.guide = guide.json.data;
  stats.progress = progress.json.data;
  stats.complete =
    guide.json.data?.phase === 'consolidation' &&
    (guide.json.data?.progress?.completed || 0) >= (guide.json.data?.progress?.total || 1);

  return stats;
}

/** 本人训练模式 + 题库.txt + 导入艾莉莎 persona 记忆包 */
async function setupAlisaSelfTraining(req) {
  await req('POST', '/training/setup/reset');
  const saved = await req('POST', '/training/setup', {
    mode: 'self',
    subject_name: '艾莉莎·米哈伊罗夫纳·九条',
    subject_gender: 'female',
    subject_brief: '征岭学园高一，学生会会计。作品《不时轻声地以俄语遮羞的邻座艾莉同学》女主角。',
    trainer_name: '艾莉莎·米哈伊罗夫纳·九条',
    trainer_role: 'self',
    setup_complete: true,
    key_people: ALISA_KEY_PEOPLE
  });
  if (!saved.json.success) throw new Error('setup failed: ' + saved.json.error);
  await req('POST', '/persona/ingest', { force: true });
  return saved.json.data;
}

/** @deprecated 仅 26 题演示课表，完整训练请用 setupAlisaSelfTraining */
async function setupAlisaDemo(req) {
  await req('POST', '/training/setup/reset');
  const demo = await req('POST', '/training/setup/demo');
  if (!demo.json.success) throw new Error('demo setup failed');
  await req('POST', '/persona/ingest', { force: true });
  return demo.json.data;
}

async function runAlisaFullTraining(req, curriculum) {
  const { submitViaHome, submitViaModule } = buildSubmitters(req);
  const expected = curriculum.days.reduce((n, d) => n + (d.tasks?.length || 0), 0);
  let submitted = 0;
  const failures = [];
  let lastTaskId = null;
  let homeSteps = 0;

  while (homeSteps < expected + 3) {
    const r = await req('GET', '/training/home');
    const home = r.json.data || {};
    if (!home.task_id) break;
    homeSteps++;
    if (home.task_id === lastTaskId) {
      const mod = await req('GET', '/training/guide/' + home.module);
      const fallback = await submitViaModule(mod.json.data || { id: home.task_id, module: home.module });
      if (fallback.status === 200 && fallback.json.success) submitted++;
      else failures.push({ task_id: home.task_id, error: fallback.json.error });
    } else {
      const sub = await submitViaHome(home);
      if (sub.status === 200 && sub.json.success) {
        submitted++;
        lastTaskId = home.task_id;
      } else failures.push({ task_id: home.task_id, error: sub.json.error });
    }
  }
  return { submitted, expected, failures, homeSteps };
}

module.exports = {
  REPO,
  CORPUS_PATH,
  CORPUS,
  ALISA_ANSWERS,
  MODULES,
  ALISA_KEY_PEOPLE,
  loadDialogueCorpus,
  loadAlisaCurriculum,
  alisaSetupContext,
  countQuestionBankForAlisa,
  createHttpClient,
  buildSubmitters,
  unlockDeep,
  runAlisaCompleteUserSession,
  runAlisaFullTraining,
  setupAlisaSelfTraining,
  setupAlisaDemo,
  memoryAnswer,
  answerForGuideTask
};
