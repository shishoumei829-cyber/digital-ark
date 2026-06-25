'use strict';

const { LAYER_META } = require('./persona-progress');
const { CAU_TYPES } = require('./caps-engine');

const LAYER_ORDER = ['core', 'emotion', 'memory', 'relationship', 'expression'];

const DIMENSION_LABELS = {
  perspective: '眼光视角',
  inner_activity: '内心活动',
  boundary_pattern: '边界模式',
  self_regulation: '自我规范',
  moral_judgment: '道德判断',
  interpersonal_style: '待人风格',
  value_priority: '价值排序',
  quality_traits: '品质特征'
};

const DEVIATION_LAYER_MAP = {
  tone: ['expression'],
  ai_like: ['expression'],
  opinion: ['core'],
  too_soft: ['emotion', 'expression'],
  too_cold: ['emotion', 'expression'],
  proactive_wrong: ['relationship', 'emotion'],
  boundary: ['relationship', 'core']
};

function padEmotionLabel(pad) {
  if (!pad) return '情绪节奏中性';
  const p = pad.P ?? 0;
  const a = pad.A ?? 0;
  if (p < -0.25 && a > 0.2) return '判断为低落 + 压力偏高，降低说教、先陪伴';
  if (p < -0.25) return '判断为低落，语气更轻、少评判';
  if (p > 0.2 && a > 0.2) return '判断为积极高唤醒，可更热情但仍需像你';
  if (p > 0.15) return '判断为偏积极，保持自然';
  if (a > 0.25) return '判断为紧张/焦虑，先稳住情绪再谈建议';
  return '情绪节奏平稳，按一贯风格回应';
}

function relationshipLabel(depth) {
  const d = depth ?? 0.5;
  if (d >= 0.75) return '对当前对象亲密度高，允许更直接关心与玩笑';
  if (d >= 0.45) return '关系距离适中，保持礼貌但不疏远';
  return '关系距离较远，语气克制、少过度介入';
}

function topDimensions(dimension_weights, n = 2) {
  return Object.entries(dimension_weights || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, w]) => `${DIMENSION_LABELS[k] || k}（${Math.round(w * 100)}%）`);
}

function buildCoreSummary(capsResult, state) {
  const sig = capsResult.behavior_signature;
  const dims = state?.dimensions || {};
  const tags = capsResult.situation?.tags || [];
  const parts = [];

  if (tags.includes('core_value_conflict') && dims.value_priority?.ranked_values?.length) {
    const top = dims.value_priority.ranked_values.slice(0, 2).join('、');
    parts.push(`类似冲突中更重视「${top}」，会注意措辞与时机`);
  } else if (dims.value_priority?.ranked_values?.length) {
    parts.push(`价值排序已记录：${dims.value_priority.ranked_values.slice(0, 3).join(' > ')}`);
  }

  if (sig?.source === 'value_priority') {
    parts.push(sig.output_hint || '按你的价值优先级取舍');
  } else if (sig?.source === 'boundary_pattern') {
    parts.push(`边界反应：${dims.boundary_pattern?.reaction_style || '按你习惯的距离感'}`);
  } else if (sig?.source === 'moral_judgment' || dims.moral_judgment?.principles?.length) {
    parts.push('道德与原则来自认知训练中的判断习惯');
  } else {
    const top = topDimensions(capsResult.dimension_weights, 2);
    if (top.length) parts.push(`本轮侧重 ${top.join('、')}`);
    else parts.push('核心层提供稳定的价值与边界底色');
  }

  return parts.join('；') || '核心层参与一般对话加工';
}

function buildEmotionSummary(capsResult, pad) {
  const tags = capsResult.situation?.tags || [];
  const act = capsResult.activation?.affects ?? 0;
  const lines = [padEmotionLabel(pad)];
  if (tags.includes('stress')) lines.push('情境含压力信号');
  if (tags.includes('loss_grief')) lines.push('情境含失落/怀念，避免轻浮');
  if (tags.includes('negative_affect')) lines.push('负面情感单元被点亮');
  if (act >= 0.55) lines.push(`情感加工强度 ${Math.round(act * 100)}%`);
  return lines.join('；');
}

function buildMemorySummary(precedent, capsResult) {
  if (precedent?.found) {
    const outcome =
      precedent.outcome === 'positive' ? '当时偏积极' : precedent.outcome === 'negative' ? '当时偏消极' : '中性';
    const hint = precedent.success === false ? '，本轮避免重复同样失误' : '';
    return `参考先例：${String(precedent.content || '').slice(0, 72)}${precedent.content?.length > 72 ? '…' : ''}（${outcome}${hint}）`;
  }
  const tags = capsResult.situation?.tags || [];
  if (tags.length) {
    return '未命中高度相似先例，主要依据当前情境标签与训练沉淀';
  }
  return '记忆层样本仍较少，回复更多依赖当下对话与核心习惯';
}

function buildRelationshipSummary(capsResult, relationshipDepth) {
  const tags = capsResult.situation?.tags || [];
  const lines = [relationshipLabel(relationshipDepth)];
  if (tags.includes('high_intimacy')) lines.push('情境标记为高亲密');
  if (tags.includes('low_intimacy')) lines.push('情境标记为保持距离');
  if (tags.includes('intimacy_signal')) lines.push('检测到亲密/在乎信号');
  return lines.join('；');
}

function buildExpressionSummary(capsResult, feedbackHints) {
  const sig = capsResult.behavior_signature;
  const lines = [];
  if (sig?.output_hint) lines.push(sig.output_hint);
  else if (sig?.if_then) lines.push(sig.if_then.replace(/^若【[^】]+】→\s*/, ''));
  if (feedbackHints?.prefer?.length) {
    lines.push(`试聊校准：${feedbackHints.prefer.slice(-2).join('；')}`);
  }
  if (feedbackHints?.avoid?.length) {
    lines.push(`避免：${feedbackHints.avoid.slice(-2).join('；')}`);
  }
  if (!lines.length) lines.push('短句、自然口吻，避免 AI 客服腔');
  return lines.join('。');
}

function collectLearnedFrom({ precedent, capsResult, progress, feedbackCounts }) {
  const from = [];
  const sig = capsResult.behavior_signature;
  if (precedent?.found) from.push(`记忆层先例（${precedent.source || '沉淀'}）`);
  if (sig?.source === 'learned_signature') from.push('试聊/训练沉淀的行为签名');
  const modLabels = { voice: '音色', memory: '记忆', relationship: '关系', emotion: '情感', cognition: '认知' };
  const mods = progress?.modules || {};
  for (const meta of Object.values(LAYER_META)) {
    const mod = mods[meta.training_module];
    if (mod && (mod.progress || 0) >= 0.15) {
      from.push(`${meta.label} ← ${modLabels[meta.training_module] || meta.training_module}训练`);
    }
  }
  const pos = feedbackCounts?.positive || 0;
  const neg = feedbackCounts?.negative || 0;
  if (pos) from.push(`试聊确认「很像我」${pos} 次`);
  if (neg) from.push(`试聊校准「不像/修正」${neg} 次`);
  return from.slice(0, 6);
}

function layerWeightFromCaps(layerId, capsResult, progress) {
  const layerProg = progress?.layers?.[layerId]?.progress;
  if (typeof layerProg === 'number') return Math.round(layerProg * 100);
  const map = {
    core: capsResult.dimension_weights,
    emotion: capsResult.activation?.affects,
    memory: null,
    relationship: capsResult.situation?.relationship_depth,
    expression: capsResult.behavior_signature?.confidence
  };
  if (layerId === 'emotion' && capsResult.activation?.affects != null) {
    return Math.round(capsResult.activation.affects * 100);
  }
  if (layerId === 'relationship' && capsResult.situation?.relationship_depth != null) {
    return Math.round(capsResult.situation.relationship_depth * 100);
  }
  if (layerId === 'expression' && capsResult.behavior_signature?.confidence != null) {
    return Math.round(capsResult.behavior_signature.confidence * 100);
  }
  if (layerId === 'core' && capsResult.dimension_weights) {
    const top = Object.values(capsResult.dimension_weights).sort((a, b) => b - a)[0];
    return Math.round((top || 0.2) * 100);
  }
  return layerProg != null ? Math.round(layerProg * 100) : null;
}

/**
 * 构建用户可见的五层解释（产品外显）
 */
function buildLayerExplanation(ctx = {}) {
  const {
    capsResult,
    precedent,
    pad,
    relationshipDepth,
    feedbackHints,
    progress,
    feedbackCounts,
    coreState
  } = ctx;

  if (!capsResult) {
    return {
      headline: '为什么这样回应',
      layers: [],
      learned_from: [],
      vs_generic_ai: '完成一次试聊后，这里会显示五层如何共同决定回复。',
      technical_path: null
    };
  }

  const layers = LAYER_ORDER.map(id => {
    const meta = LAYER_META[id];
    const builders = {
      core: () => buildCoreSummary(capsResult, coreState),
      emotion: () => buildEmotionSummary(capsResult, pad),
      memory: () => buildMemorySummary(precedent, capsResult),
      relationship: () => buildRelationshipSummary(capsResult, relationshipDepth),
      expression: () => buildExpressionSummary(capsResult, feedbackHints)
    };
    const summary = builders[id]();
    const influence = layerWeightFromCaps(id, capsResult, progress);
    return {
      id,
      label: meta.label,
      short: meta.short,
      training_module: meta.training_module,
      training_label: progress?.modules?.[meta.training_module]?.label || meta.label.replace('层', '训练'),
      summary,
      influence_pct: influence,
      active: influence == null || influence >= 35 || (id === 'memory' && precedent?.found)
    };
  });

  const pathLabels = (capsResult.propagation_path || [])
    .map(p => CAU_TYPES[p]?.label || p)
    .join(' → ');

  return {
    headline: '为什么这样回应',
    layers,
    learned_from: collectLearnedFrom({ precedent, capsResult, progress, feedbackCounts }),
    vs_generic_ai:
      '不是通用 AI 模板：本轮由你的五层人格数据约束——' +
      layers.filter(l => l.active).map(l => l.label).join('、') +
      '共同塑形；CAPS 只在后台做情境加工。',
    technical_path: pathLabels || null,
    behavior_if_then: capsResult.behavior_signature?.if_then || null
  };
}

function layersAffectedByDeviations(deviationTags) {
  const set = new Set();
  for (const tag of deviationTags || []) {
    for (const lid of DEVIATION_LAYER_MAP[tag] || []) set.add(lid);
  }
  return [...set].map(id => ({
    id,
    label: LAYER_META[id]?.label || id
  }));
}

function formatFeedbackLayerUpdates(deviationTags, correction) {
  const affected = layersAffectedByDeviations(deviationTags);
  const lines = affected.map(a => {
    const meta = LAYER_META[a.id];
    return `已更新${a.label}（来自${meta?.training_module || '校准'}相关习惯）`;
  });
  if (correction) lines.push('表达层已记录你的原话，下次试聊优先参考');
  return lines;
}

module.exports = {
  LAYER_ORDER,
  LAYER_META,
  DEVIATION_LAYER_MAP,
  buildLayerExplanation,
  layersAffectedByDeviations,
  formatFeedbackLayerUpdates
};
