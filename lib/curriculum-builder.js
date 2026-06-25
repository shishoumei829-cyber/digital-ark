'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildPersonalCurriculumFromBank,
  resolveQuestionBankPath
} = require('./question-bank-loader');

/**
 * 个人 7 日课表：仅来自 题库.txt（完全替换，不与 scenario-bank 合并）
 */
function buildPersonalCurriculum(setupCtx, repoRoot) {
  const result = buildPersonalCurriculumFromBank(setupCtx, repoRoot);
  if (result.ok && result.curriculum) return result.curriculum;

  const bankPath = result.bank_path || resolveQuestionBankPath(repoRoot);
  throw new Error(
    `题库未就绪（${result.error || 'unknown'}）：请编辑并保存 ${bankPath}。` +
      ' 可先运行 node scripts/export-question-bank-txt.js 生成模板。'
  );
}

function loadDemoCurriculum(repoRoot, personaId) {
  const p = path.join(repoRoot, 'config', 'personas', personaId, 'curriculum-7day.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function resolveCurriculum({ repoRoot, personaId, setupStore }) {
  const ctx = setupStore.contextForCurriculum();
  if (ctx.is_demo) {
    return loadDemoCurriculum(repoRoot, personaId) || buildPersonalCurriculum(ctx);
  }
  if (!setupStore.isComplete()) return null;
  return buildPersonalCurriculum(ctx, repoRoot);
}

module.exports = {
  buildPersonalCurriculum,
  loadDemoCurriculum,
  resolveCurriculum
};
