'use strict';

/**
 * 艾莉莎人设：自动训练 + 试聊效果评估
 *
 * 运行:
 *   node scripts/train-and-eval-alisa.js
 *   SIM_KEEP=1 node scripts/train-and-eval-alisa.js   # 保留 DATA_DIR
 *   SKIP_TRAIN=1 node scripts/train-and-eval-alisa.js # 仅评估（需已有 DATA_DIR）
 *
 * 依赖: 本地 Ollama（可选；无模型时用服务端 fallback 回复，报告会标注）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  REPO,
  CORPUS,
  loadAlisaCurriculum,
  createHttpClient,
  unlockDeep,
  runAlisaFullTraining,
  setupAlisaDemo
} = require('./lib/alisa-sim-core');

const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'digital_ark_alisa_eval_' + Date.now());
const PORT = Number(process.env.PORT || 3023);
const SKIP_TRAIN = process.env.SKIP_TRAIN === '1';

fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = String(PORT);
process.env.PERSONA_ID = 'alisa-kujo';

const CURRICULUM = loadAlisaCurriculum();
const MODULES = ['voice', 'memory', 'relationship', 'emotion', 'cognition'];

/** 试聊探测：来自 dialogue-corpus.json（动画/百科可追溯） */
const CHAT_PROBES = CORPUS.chat_probe_expectations || [];

function scoreReply(probe, reply) {
  const issues = [];
  if (!reply || reply.trim().length < 4) {
    return { score: 0, hits: [], issues: ['回复过短或为空'], ai_tone: false };
  }
  let score = 40;
  if (reply.length >= 20 && reply.length <= 600) score += 15;
  if (reply.length > 600) score -= 10;

  let aiTone = false;
  for (const f of probe.forbid || []) {
    if (reply.includes(f)) {
      score -= 25;
      issues.push('含禁用腔: ' + f);
      aiTone = true;
    }
  }

  const hits = (probe.signals || []).filter(s => reply.includes(s));
  score += Math.min(35, hits.length * 10);

  const ref = probe.reference_reply || '';
  if (ref) {
    const refHits = (probe.signals || []).filter(s => ref.includes(s) && reply.includes(s));
    if (refHits.length >= 2) score += 10;
  }

  if (/^[「『]/.test(reply.trim()) && !reply.includes('我')) {
    score -= 5;
    issues.push('可能非第一人称');
  }

  if (reply.includes('我') || reply.includes('……')) score += 5;

  score = Math.max(0, Math.min(100, score));
  return { score, hits, issues, ai_tone: aiTone, reference_reply: ref };
}

function stepLog(steps, name, pass, detail = '') {
  steps.push({ name, pass: !!pass, detail });
  console.log((pass ? '[OK]' : '[FAIL]') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

async function runChatProbes(req, label) {
  const results = [];
  for (const probe of CHAT_PROBES) {
    const r = await req('POST', '/chat', { messages: [{ role: 'user', content: probe.user }] });
    const reply = r.json.reply || r.json.error || '';
    const usedFallback = !r.json.chat_model && r.status === 200 && reply.length > 0;
    const scored = scoreReply(probe, reply);
    results.push({
      id: probe.id,
      user: probe.user,
      reply: reply.slice(0, 500),
      status: r.status,
      chat_model: r.json.chat_model || (r.status !== 200 ? 'error' : 'fallback/unknown'),
      persona_id: r.json.persona_id,
      memory_count: r.json.memory_count,
      ...scored
    });
    console.log(
      `  [${label}] ${probe.id} 得分 ${scored.score}` +
        (scored.hits.length ? ` 命中=${scored.hits.join(',')}` : '') +
        (scored.issues.length ? ` ⚠${scored.issues.join(';')}` : '')
    );
    console.log(`    → ${reply.slice(0, 100).replace(/\n/g, ' ')}${reply.length > 100 ? '…' : ''}`);
  }
  const avg = results.length
    ? Math.round(results.reduce((s, x) => s + x.score, 0) / results.length)
    : 0;
  return { label, avg, results };
}

async function verifyModuleGuides(req) {
  const out = {};
  for (const mod of MODULES) {
    const r = await req('GET', '/training/guide/' + mod);
    const d = r.json.data || {};
    out[mod] = {
      task_id: d.task_id || null,
      all_done: !!d.all_done,
      locked: !!d.locked,
      rotation: !!d.rotation,
      phase: d.day ? 'day_' + d.day : d.all_done ? 'done' : 'unknown'
    };
  }
  return out;
}

async function main() {
  const steps = [];
  const report = {
    persona: 'alisa-kujo',
    corpus: CORPUS.meta,
    plot_anchors: CORPUS.plot_anchors,
    data_dir: DATA_DIR,
    port: PORT,
    started_at: new Date().toISOString(),
    training: null,
    chat_before: null,
    chat_after: null,
    modules_after_train: null,
    metrics: {},
    verdict: ''
  };

  console.log('=== 艾莉莎 · 自动训练 + 效果评估 ===');
  console.log('DATA_DIR=' + DATA_DIR);

  const req = createHttpClient(PORT);
  const { app, ragStore, personalMemory } = require('../server');
  const server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 1200));

  try {
    if (!SKIP_TRAIN) {
      const setup = await setupAlisaDemo(req);
      stepLog(steps, '演示设定（艾莉莎）', setup?.setup_complete, setup?.subject_name);

      const guide0 = await req('GET', '/training/guide');
      stepLog(
        steps,
        '课表就绪',
        !guide0.json.data?.setup_required && (guide0.json.data?.curriculum_mode === 'demo' || guide0.json.data?.title?.includes('艾莉莎')),
        'day=' + guide0.json.data?.current_day + ' mode=' + guide0.json.data?.curriculum_mode
      );

      report.chat_before = await runChatProbes(req, '训练前');

      await unlockDeep(req);

      const train = await runAlisaFullTraining(req, CURRICULUM);
      report.training = train;
      stepLog(
        steps,
        '自动训练完成题数',
        train.submitted >= train.expected,
        `${train.submitted}/${train.expected}` + (train.failures.length ? ` 失败${train.failures.length}` : '')
      );

      const guide1 = await req('GET', '/training/guide');
      stepLog(
        steps,
        '进入巩固期',
        guide1.json.data?.phase === 'consolidation',
        guide1.json.data?.phase || ''
      );
    } else {
      stepLog(steps, '跳过训练(SKIP_TRAIN=1)', true, DATA_DIR);
    }

    report.modules_after_train = await verifyModuleGuides(req);
    const modWithTask = Object.values(report.modules_after_train).filter(m => m.task_id || m.rotation || m.all_done).length;
    stepLog(steps, '巩固期各模块状态', modWithTask >= 4, `${modWithTask}/5 模块有反馈`);

    report.chat_after = await runChatProbes(req, '训练后');

    const prog = await req('GET', '/training/progress');
    const guideFinal = await req('GET', '/training/guide');
    const pct = Math.round((prog.json.data?.overall_progress || 0) * 100);
    report.metrics.progress_pct = pct;
    report.metrics.rag_items = ragStore.items?.length || 0;
    report.metrics.memories = personalMemory.memories?.length || 0;
    report.metrics.completed_tasks = guideFinal.json.data?.progress?.completed ?? null;
    report.metrics.guide_phase = guideFinal.json.data?.phase;

    stepLog(steps, '总训练进度', pct >= 15, pct + '%');
    stepLog(steps, 'RAG 索引', report.metrics.rag_items >= 10, String(report.metrics.rag_items));
    stepLog(steps, '记忆入库', report.metrics.memories >= 10, String(report.metrics.memories));

    const delta = (report.chat_after?.avg || 0) - (report.chat_before?.avg || 0);
    report.metrics.chat_avg_before = report.chat_before?.avg ?? null;
    report.metrics.chat_avg_after = report.chat_after?.avg ?? null;
    report.metrics.chat_delta = report.chat_before ? delta : null;

    stepLog(
      steps,
      '试聊均分（训练后）',
      (report.chat_after?.avg || 0) >= 45,
      `after=${report.chat_after?.avg}` + (report.chat_before ? ` before=${report.chat_before.avg} Δ${delta}` : '')
    );

    const aiLeaks = (report.chat_after?.results || []).filter(r => r.ai_tone).length;
    stepLog(steps, '无典型 AI 客服腔', aiLeaks === 0, aiLeaks ? `${aiLeaks} 条命中` : 'ok');

    if (report.chat_before && delta >= 5) {
      stepLog(steps, '训练后试聊提升', true, `+${delta} 分`);
    } else if (!report.chat_before) {
      stepLog(steps, '训练后试聊提升', true, '未测训练前基线');
    } else {
      stepLog(steps, '训练后试聊提升', delta >= 0, `Δ${delta}（模型/回退影响大时可忽略）`);
    }

    const passed = steps.filter(s => s.pass).length;
    const total = steps.length;
    report.finished_at = new Date().toISOString();
    report.steps = steps;
    report.pass_rate = `${passed}/${total}`;

    if (passed === total && (report.chat_after?.avg || 0) >= 55) {
      report.verdict = '效果良好：训练流程完整，试聊人设信号达标';
    } else if (passed >= total - 2) {
      report.verdict = '基本可用：训练完成，试聊部分场景可再人工抽检';
    } else {
      report.verdict = '需改进：训练或对话链路存在失败项';
    }

    const reportsDir = path.join(REPO, 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const outFile = path.join(reportsDir, `alisa-train-eval-${Date.now()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

    console.log('\n=== 评估摘要 ===');
    console.log('判定: ' + report.verdict);
    console.log('训练: ' + (report.training ? `${report.training.submitted}/${report.training.expected} 题` : '跳过'));
    console.log('试聊均分: ' + (report.chat_after?.avg ?? '—') + (report.chat_before ? ` (训练前 ${report.chat_before.avg})` : ''));
    console.log('进度: ' + pct + '% · 记忆 ' + report.metrics.memories + ' · RAG ' + report.metrics.rag_items);
    console.log('报告: ' + outFile);
    console.log(`\n=== 步骤 ${passed}/${total} 通过 ===`);

    if (!process.env.SIM_KEEP) {
      try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
    } else {
      console.log('保留 DATA_DIR=' + DATA_DIR);
    }

    if (passed < total) process.exit(1);
  } finally {
    server.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
