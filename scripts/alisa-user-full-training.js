'use strict';

/**
 * 艾莉莎 · 模拟真实用户完整训练
 *
 * 做什么：
 * - 以「艾莉莎本人」自训身份登录（不是 demo 26 题）
 * - 读取你的 题库.txt（几百道情境题，五模块）
 * - 像 App 一样：主页引导 → 五专项 → 写入记忆/关系/情感/认知（音色仅文字，少录音）
 * - 导入 alisa-kujo persona 语料，作答尽量用作品台词库
 *
 * 运行：
 *   node scripts/alisa-user-full-training.js
 *   set SIM_KEEP=1 && node scripts/alisa-user-full-training.js
 *
 * 环境：
 *   PORT=3024  DATA_DIR=...  QUESTION_BANK_PATH=.../题库.txt
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  REPO,
  MODULES,
  countQuestionBankForAlisa,
  createHttpClient,
  setupAlisaSelfTraining,
  unlockDeep,
  runAlisaCompleteUserSession
} = require('./lib/alisa-sim-core');

const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'digital_ark_alisa_full_' + Date.now());
const PORT = Number(process.env.PORT || 3024);

fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = String(PORT);
process.env.PERSONA_ID = 'alisa-kujo';

function log(msg) {
  console.log(msg);
}

async function main() {
  log('=== 艾莉莎 · 完整用户训练（题库全量 + 五模块） ===');
  log('DATA_DIR=' + DATA_DIR);

  const bankPreview = countQuestionBankForAlisa();
  if (!bankPreview.ok) {
    console.error('题库加载失败:', bankPreview.error, bankPreview.bank_path);
    process.exit(1);
  }
  log(`题库: ${bankPreview.bank_path}`);
  log(`目标题量: 初训 ${bankPreview.initial_7day} + 轮播 ${bankPreview.rotation_pool} = 合计 ${bankPreview.total_situations}`);
  log('五模块题量(初训+轮播): ' + JSON.stringify(bankPreview.by_module));

  const { app, ragStore, personalMemory } = require('../server');
  const server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 1200));

  const req = createHttpClient(PORT);
  const report = {
    started_at: new Date().toISOString(),
    data_dir: DATA_DIR,
    bank: {
      path: bankPreview.bank_path,
      initial_7day: bankPreview.initial_7day,
      rotation_pool: bankPreview.rotation_pool,
      total: bankPreview.total_situations,
      by_module: bankPreview.by_module
    },
    setup: null,
    training: null,
    metrics: {},
    finished_at: null
  };

  try {
    report.setup = await setupAlisaSelfTraining(req);
    log('身份: 本人自训 · ' + report.setup.subject_name);

    await unlockDeep(req);

    log('\n开始逐项提交（主页 + 五模块，音色仅文字）…');
    const t0 = Date.now();
    report.training = await runAlisaCompleteUserSession(req, { maxStuckPerLoop: 6 });
    report.training.elapsed_sec = Math.round((Date.now() - t0) / 1000);

    report.metrics = {
      memories: personalMemory.memories?.length || 0,
      rag_items: ragStore.items?.length || 0,
      progress: report.training.progress,
      guide_phase: report.training.guide?.phase,
      guide_completed: report.training.guide?.progress?.completed,
      guide_total: report.training.guide?.progress?.total
    };

    log('\n=== 训练结束 ===');
    log(`已提交: ${report.training.submitted} 次（目标情境约 ${bankPreview.total_situations}）`);
    log(`失败: ${report.training.failed.length}`);
    log(`各模块提交次数: ${JSON.stringify(report.training.by_module_done)}`);
    log(`记忆入库: ${report.metrics.memories} · RAG: ${report.metrics.rag_items}`);
    log(`引导进度: ${report.metrics.guide_completed}/${report.metrics.guide_total} · 阶段: ${report.metrics.guide_phase}`);
    log(`耗时: ${report.training.elapsed_sec}s`);
    log(`初训完成: ${report.training.complete ? '是' : '否（可查看 failed）'}`);

    const reportsDir = path.join(REPO, 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const out = path.join(reportsDir, `alisa-full-user-${Date.now()}.json`);
    report.finished_at = new Date().toISOString();
    fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
    log('报告: ' + out);

    if (!process.env.SIM_KEEP) {
      try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
    } else {
      log('保留 DATA_DIR=' + DATA_DIR);
    }

    if (report.training.failed.length > 10) process.exit(1);
  } finally {
    server.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
