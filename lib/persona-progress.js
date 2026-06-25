'use strict';

/**
 * 五层人格拟合度（统一总进度）
 * PRD：核心 35% + 情绪 15% + 记忆 20% + 关系 15% + 表达 15%
 * 各层分数 = 实测数据 + 对应训练模块进度（旧五模块作采集代理）
 */

const {
  MODULE_PROGRESS_CAP,
  LAYER_WEIGHTS,
  STAGES,
  BLIND_TEST_MILESTONES,
  BLIND_TEST_PASS_SCORE,
  CHECKLIST_TARGETS
} = require('./design-spec');

const LAYER_META = {
  core: {
    label: '核心层',
    short: '价值、边界、道德与 CAPS 签名',
    training_module: 'cognition'
  },
  emotion: {
    label: '情绪层',
    short: '真实情绪节奏与压力反应',
    training_module: 'emotion'
  },
  memory: {
    label: '记忆层',
    short: '活态经历与沉淀规则',
    training_module: 'memory'
  },
  relationship: {
    label: '关系层',
    short: '亲密、信任与关系人',
    training_module: 'relationship'
  },
  expression: {
    label: '表达层',
    short: '音色、口癖与场景区分',
    training_module: 'voice'
  }
};

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function countCoreDimensions(dimensions) {
  let n = 0;
  for (const [key, dim] of Object.entries(dimensions || {})) {
    let ok = false;
    switch (key) {
      case 'value_priority':
        ok = dim.ranked_values?.length > 0;
        break;
      case 'self_regulation':
        ok = dim.standards?.length > 0;
        break;
      case 'boundary_pattern':
        ok = dim.triggers?.length > 0;
        break;
      case 'interpersonal_style':
        ok = dim.core_traits?.length > 0;
        break;
      case 'perspective':
        ok = !!dim.worldview || dim.focus_preferences?.length > 0;
        break;
      case 'inner_activity':
        ok = !!dim.inner_monologue_style;
        break;
      case 'moral_judgment':
        ok = dim.principles?.length > 0;
        break;
      case 'quality_traits':
        ok = dim.traits?.length > 0;
        break;
      default:
        break;
    }
    if (ok) n++;
  }
  return n;
}

function computeLayerScores(ctx) {
  const tp = ctx.trainingProgress || {};
  const sessions = ctx.sessions || [];

  const coreState = ctx.corePersona?.getState?.() || { metadata: {}, dimensions: {} };
  const meta = coreState.metadata || {};
  const caps = ctx.corePersona?.getCapsState?.() || { signatures: [] };
  const sigCount = caps.signatures?.length || 0;
  const dimCovered = countCoreDimensions(coreState.dimensions);

  const cognitionModuleCap = Math.min(MODULE_PROGRESS_CAP * 0.33, (tp.cognition || 0) * 0.12);
  const core = clamp(
    (meta.completeness || 0) * 0.45 +
    (meta.confidence || 0) * 0.15 +
    (meta.card_game_completed ? 0.15 : 0) +
    Math.min(0.15, dimCovered / 8 * 0.15) +
    Math.min(0.05, sigCount * 0.01) +
    cognitionModuleCap
  );

  const emotionSessions = sessions.filter(s => s.type === 'emotion').length;
  const emotionModuleCap = Math.min(MODULE_PROGRESS_CAP * 0.4, (tp.emotion || 0) * 0.35);
  const emotion = clamp(
    emotionModuleCap +
    Math.min(0.3, emotionSessions / 6 * 0.3) +
    Math.min(0.2, (ctx.positiveFeedbackCount || 0) / 10 * 0.2) +
    Math.min(0.1, dimCovered >= 2 ? 0.1 : 0)
  );

  const pmTotal = ctx.personalMemoryTotal || 0;
  const pmQuality = ctx.personalMemoryQuality || 0;
  const sedimentCount = ctx.sedimentCount || 0;
  const eventCount = ctx.eventCount || 0;

  const memoryModuleCap = Math.min(MODULE_PROGRESS_CAP * 0.35, (tp.memory || 0) * 0.25);
  const memory = clamp(
    memoryModuleCap +
    Math.min(0.38, pmTotal / 80 * 0.38) +
    pmQuality * 0.15 +
    Math.min(0.08, sedimentCount / 5 * 0.08) +
    Math.min(0.07, eventCount / 50 * 0.07)
  );

  const peopleCount = ctx.peopleCount || 0;
  const scenariosDone = ctx.scenariosCompleted || 0;

  const relModuleCap = Math.min(MODULE_PROGRESS_CAP * 0.4, (tp.relationship || 0) * 0.3);
  const relationship = clamp(
    relModuleCap +
    Math.min(0.4, peopleCount / 5 * 0.4) +
    Math.min(0.2, scenariosDone / 12 * 0.2)
  );

  const voiceProgress = tp.voice || 0;
  const speechPatterns = (ctx.speechPatternCount || 0) + (ctx.verbalTicsCount || 0);
  const voiceMinutes = ctx.voiceMinutes || 0;
  const voiceSimRaw = ctx.voiceSimilarity || 0;
  const voiceSim = voiceMinutes >= 5 ? voiceSimRaw : Math.min(voiceSimRaw, 0.5);
  const voiceModuleCap = Math.min(MODULE_PROGRESS_CAP * 0.4, voiceProgress * 0.3);

  const expression = clamp(
    voiceModuleCap +
    voiceSim * 0.27 +
    Math.min(0.25, speechPatterns / 8 * 0.25) +
    (voiceMinutes >= 5 ? Math.min(0.08, voiceMinutes / 30 * 0.08) : 0)
  );

  return {
    core,
    emotion,
    memory,
    relationship,
    expression
  };
}

function computePersonalityFit(layers) {
  return (
    (layers.core || 0) * LAYER_WEIGHTS.core +
    (layers.emotion || 0) * LAYER_WEIGHTS.emotion +
    (layers.memory || 0) * LAYER_WEIGHTS.memory +
    (layers.relationship || 0) * LAYER_WEIGHTS.relationship +
    (layers.expression || 0) * LAYER_WEIGHTS.expression
  );
}

function getStage(overall, passedBlindMilestones = []) {
  const p = clamp(overall);
  let stage = STAGES.find(s => p >= s.min && p < s.max) || STAGES[STAGES.length - 1];
  if (stage.id === 'complete' && !passedBlindMilestones.includes(0.7)) {
    stage = STAGES.find(s => s.id === 'mature') || stage;
  }
  return stage;
}

function getNextMilestone(overall, passedMilestones = []) {
  for (const m of BLIND_TEST_MILESTONES) {
    if (overall >= m && !passedMilestones.includes(m)) return m;
  }
  return null;
}

function buildLayerDetails(layers, ctx) {
  const tp = ctx.trainingProgress || {};
  const out = {};

  for (const [key, meta] of Object.entries(LAYER_META)) {
    const mod = meta.training_module;
    out[key] = {
      progress: layers[key],
      label: meta.label,
      short: meta.short,
      training_module: mod,
      training_progress: tp[mod] || 0,
      pct: Math.round(layers[key] * 100)
    };
  }

  const coreState = ctx.corePersona?.getState?.();
  if (coreState) {
    out.core.dimensions_covered = countCoreDimensions(coreState.dimensions);
    out.core.completeness = coreState.metadata?.completeness;
    out.core.confidence = coreState.metadata?.confidence;
    out.core.card_game_completed = !!coreState.metadata?.card_game_completed;
    out.core.signatures_count = ctx.corePersona?.getCapsState?.()?.signatures?.length || 0;
  }

  out.memory.active_count = ctx.eventCount || 0;
  out.memory.personal_count = ctx.personalMemoryTotal || 0;
  out.memory.sediment_count = ctx.sedimentCount || 0;

  out.relationship.people_count = ctx.peopleCount || 0;
  out.expression.voice_similarity = ctx.voiceSimilarity || 0;

  return out;
}

/** 旧五模块视图：与训练页 module-row 对齐，进度取对应层分数 */
function buildLegacyModules(layers, ctx) {
  const tp = ctx.trainingProgress || {};
  const sessions = ctx.sessions || [];
  const voiceMinutes = ctx.voiceMinutes || 0;

  const mk = (layerKey, type) => ({
    progress: layers[layerKey],
    layer: layerKey,
    layer_progress: layers[layerKey],
    training_progress: tp[type] || 0,
    last_trained: ctx.getLastTrainedTime?.(type) || null,
    sessions_count: sessions.filter(s => s.type === type).length
  });

  return {
    voice: { ...mk('expression', 'voice'), total_minutes: voiceMinutes },
    memory: mk('memory', 'memory'),
    relationship: mk('relationship', 'relationship'),
    emotion: mk('emotion', 'emotion'),
    cognition: mk('core', 'cognition')
  };
}

function buildChecklist(layers, overall, extras) {
  const stats = extras.stats || {};
  return {
    voice_minutes_ok: (stats.voice_minutes || 0) >= CHECKLIST_TARGETS.voice_minutes,
    core_memories_ok: (stats.core_memories || 0) >= CHECKLIST_TARGETS.core_memories,
    relationship_people_ok: (stats.relationship_people || 0) >= CHECKLIST_TARGETS.relationship_people,
    conflict_tests_ok: (stats.conflict_tests || 0) >= CHECKLIST_TARGETS.conflict_tests,
    overall_ok: overall >= CHECKLIST_TARGETS.overall_progress,
    layers,
    core_layer_ok: layers.core >= 0.5,
    memory_layer_ok: layers.memory >= 0.4
  };
}

/**
 * 统一进度 payload（替代仅按旧 MODULE_WEIGHTS 加权）
 */
function computeModuleCompletion(ctx) {
  const tp = ctx.trainingProgress || {};
  const keys = ['voice', 'memory', 'relationship', 'emotion', 'cognition'];
  const vals = keys.map(k => tp[k] || 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function buildUnifiedProgressPayload(ctx) {
  const layers = computeLayerScores(ctx);
  const overall = computePersonalityFit(layers);
  const passedBlind = ctx.passed_blind_milestones || [];
  const stage = getStage(overall, passedBlind);
  const nextBlindTest = getNextMilestone(overall, passedBlind);
  const moduleCompletion = computeModuleCompletion(ctx);
  const layerQuality = overall;

  const coreState = ctx.corePersona?.getState?.() || { metadata: {}, dimensions: {} };
  const dimCovered = countCoreDimensions(coreState.dimensions);
  const coreLayerBlocked = dimCovered < 2 && !coreState.metadata?.card_game_completed;

  const layerDetails = buildLayerDetails(layers, ctx);
  const modules = buildLegacyModules(layers, ctx);

  return {
    overall_progress: overall,
    personality_fit: overall,
    progress_model: 'five_layer_v2',
    module_completion: moduleCompletion,
    module_completion_pct: Math.round(moduleCompletion * 100),
    layer_quality: layerQuality,
    layer_quality_pct: Math.round(layerQuality * 100),
    core_layer_blocked: coreLayerBlocked,
    core_layer_action: coreLayerBlocked ? 'complete_value_card_game' : null,
    layers: layerDetails,
    modules,
    stage: {
      id: stage.id,
      name: stage.name,
      capabilities: stage.capabilities,
      next_threshold: STAGES[STAGES.indexOf(stage) + 1]?.min ?? 1
    },
    passed_blind_milestones: passedBlind,
    blind_test: {
      milestones: BLIND_TEST_MILESTONES,
      pass_score: BLIND_TEST_PASS_SCORE,
      next_milestone: nextBlindTest,
      ready: nextBlindTest !== null
    },
    weights: LAYER_WEIGHTS,
    checklist: buildChecklist(layers, overall, ctx)
  };
}

module.exports = {
  LAYER_META,
  LAYER_WEIGHTS,
  computeLayerScores,
  computePersonalityFit,
  buildUnifiedProgressPayload,
  getStage,
  getNextMilestone
};
