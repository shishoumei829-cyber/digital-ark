'use strict';

/**
 * 进度阶段与盲测里程碑；总进度由 persona-progress（五层）计算
 */

const {
  LAYER_WEIGHTS,
  STAGES,
  BLIND_TEST_MILESTONES,
  BLIND_TEST_PASS_SCORE,
  CHECKLIST_TARGETS
} = require('./design-spec');

const { buildUnifiedProgressPayload, computePersonalityFit } = require('./persona-progress');

/** @deprecated 使用 buildUnifiedProgressPayload */
function computeOverall(modules) {
  const layers = {
    core: modules.cognition || 0,
    emotion: modules.emotion || 0,
    memory: modules.memory || 0,
    relationship: modules.relationship || 0,
    expression: modules.voice || 0
  };
  return computePersonalityFit(layers);
}

function getStage(overall) {
  const p = Math.min(1, Math.max(0, overall));
  return STAGES.find(s => p >= s.min && p < s.max) || STAGES[STAGES.length - 1];
}

function getNextMilestone(overall, passedMilestones = []) {
  for (const m of BLIND_TEST_MILESTONES) {
    if (overall >= m && !passedMilestones.includes(m)) return m;
  }
  return null;
}

/** @deprecated 请传入 buildUnifiedProgressPayload 的 ctx */
function buildProgressPayload(progress, extras = {}) {
  return buildUnifiedProgressPayload({
    trainingProgress: progress,
    passed_blind_milestones: extras.passed_blind_milestones || [],
    stats: extras.stats || {}
  });
}

module.exports = {
  computeOverall,
  getStage,
  getNextMilestone,
  buildProgressPayload,
  buildUnifiedProgressPayload,
  LAYER_WEIGHTS
};
