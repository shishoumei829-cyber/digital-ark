'use strict';

const { resolveTwinStatus } = require('./twin-lifecycle');
const { DEVIATION_CATALOG } = require('./calibration-feedback');
const { LAYER_META, LAYER_WEIGHTS } = require('./persona-progress');

const MODULE_META = {
  voice: { label: '音色训练', hint: '声音、语速、停顿和语气' },
  memory: { label: '记忆训练', hint: '人生片段与重要记忆' },
  relationship: { label: '关系训练', hint: '对不同人的回应方式' },
  emotion: { label: '情感训练', hint: '情绪反应与安慰方式' },
  cognition: { label: '认知训练', hint: '价值观与冲突决策' }
};

function pickTodaySuggestion(progress, relationshipCount, feedbackCounts) {
  if (progress?.core_layer_blocked) {
    return '核心层样本不足：请先完成「价值卡片排序」游戏，再刷认知题才有效。';
  }
  if (progress?.blind_test?.ready && !(progress?.passed_blind_milestones || []).length) {
    return '拟合度已达标：建议邀请一位了解你的人做盲测（40% 节点）。';
  }
  const mods = progress?.modules || {};
  const weakest = Object.entries(mods)
    .filter(([k]) => MODULE_META[k])
    .sort((a, b) => (a[1]?.progress || 0) - (b[1]?.progress || 0))[0];
  if (weakest && (weakest[1]?.progress || 0) < 0.4) {
    const meta = MODULE_META[weakest[0]];
    return `你的「${meta.label}」样本不足，建议完成 2 个相关情境训练。`;
  }
  if ((relationshipCount || 0) < 1) {
    return '建议添加至少一位「生命里重要的人」，关系题与陪护边界会更准确。';
  }
  if ((feedbackCounts?.negative || 0) > (feedbackCounts?.positive || 0) + 2) {
    return '试聊「不像我」反馈较多，建议回到对话页补充「哪里不像」并写一句你会怎么说。';
  }
  if ((mods.relationship?.progress || 0) < 0.5) {
    return '你的「主动关心方式」样本不足，建议完成 2 个朋友场景训练。';
  }
  return '今日建议：完成 1 次情境答题，并在试聊里标记一次「很像我」或写下修正。';
}

function buildTrainingDashboard(deps) {
  const {
    progress,
    setup,
    changelog,
    feedbackCounts,
    relationshipCount,
    guideOverview
  } = deps;

  const fit = progress?.personality_fit ?? progress?.overall_progress ?? 0;
  const fitPct = Math.round(fit * 100);
  const authorizedCount = (deps.authorizedUsers || []).filter(u => u.authorized).length;

  const status = resolveTwinStatus({
    setupComplete: !!setup?.setup_complete,
    personalityFit: fit,
    authorizedCount
  });

  const modules = Object.entries(MODULE_META).map(([key, meta]) => ({
    key,
    label: meta.label,
    hint: meta.hint,
    progress: progress?.modules?.[key]?.progress ?? 0,
    progress_pct: Math.round((progress?.modules?.[key]?.progress ?? 0) * 100)
  }));

  const recent = (changelog?.entries || []).slice(0, 3).map(e => ({
    ts: e.ts,
    summary: e.summary,
    changes: e.changes,
    module: e.module,
    source: e.source
  }));

  const nextModule = modules.find(m => m.progress < 0.6)?.key || 'memory';

  const layers = Object.entries(LAYER_META).map(([key, meta]) => ({
    key,
    label: meta.label,
    short: meta.short,
    training_module: meta.training_module,
    progress: progress?.layers?.[key]?.progress ?? 0,
    progress_pct: Math.round((progress?.layers?.[key]?.progress ?? 0) * 100),
    weight_pct: Math.round((LAYER_WEIGHTS[key] || 0) * 100)
  }));

  return {
    twin_status: status,
    personality_fit: fit,
    personality_fit_pct: fitPct,
    module_completion_pct: progress?.module_completion_pct ?? Math.round((progress?.module_completion || 0) * 100),
    layer_quality_pct: progress?.layer_quality_pct ?? fitPct,
    core_layer_blocked: !!progress?.core_layer_blocked,
    core_layer_action: progress?.core_layer_action || null,
    version: changelog?.version || 'v0.1',
    layers,
    modules,
    today_suggestion: pickTodaySuggestion(progress, relationshipCount, feedbackCounts),
    recent_changes: recent,
    next_recommended: {
      module: nextModule,
      label: MODULE_META[nextModule]?.label,
      page: { voice: 2, memory: 3, relationship: 4, emotion: 5, cognition: 6 }[nextModule]
    },
    guide_phase: guideOverview?.phase,
    guide_day: guideOverview?.current_day,
    calibration_options: Object.entries(DEVIATION_CATALOG).map(([id, d]) => ({
      id,
      label: d.label
    })),
    feedback_counts: feedbackCounts
  };
}

module.exports = { buildTrainingDashboard, MODULE_META };
