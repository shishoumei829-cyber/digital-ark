'use strict';

/**
 * 试聊校准 · 偏差类型 → 可展示的系统反馈
 */
const DEVIATION_CATALOG = {
  tone: {
    label: '语气不像',
    avoid: ['语气过于正式或客套', '回复过长时要更简短'],
    prefer: ['保持嘴硬心软、句尾省略'],
    message: '已记录：后续会减少客套开场，更贴近你的日常语气'
  },
  ai_like: {
    label: '说得太像 AI',
    avoid: ['不要像AI客服', '不要打破角色'],
    message: '已降低 AI 腔，强调第一人称自然表达'
  },
  opinion: {
    label: '观点不对',
    avoid: [],
    prefer: [],
    message: '已记录：类似话题会优先参考你的价值判断与立场'
  },
  too_soft: {
    label: '太温柔',
    avoid: ['过度安慰、先说没关系'],
    prefer: ['更直接、先确认事实再给建议'],
    message: '已降低共情开场权重，倾向更直接的回应'
  },
  too_cold: {
    label: '太冷淡',
    avoid: ['过于简短、缺少情绪回应'],
    prefer: ['适当主动关心、先确认对方状态'],
    message: '已提高主动关心与情绪确认的频率'
  },
  proactive_wrong: {
    label: '不会这样主动关心',
    avoid: ['未经上下文就主动追问私密话题'],
    message: '已收紧主动问候方式，减少不符合你习惯的关心'
  },
  boundary: {
    label: '关系边界不对',
    avoid: [],
    message: '已更新关系边界：对当前对象会采用更克制的距离感'
  }
};

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map(t => String(t).trim()).filter(id => DEVIATION_CATALOG[id]))];
}

function applyDeviations(store, tagIds) {
  const changes = [];
  if (!store?.data?.style_hints) return changes;
  const hints = store.data.style_hints;
  for (const id of tagIds) {
    const d = DEVIATION_CATALOG[id];
    if (!d) continue;
    changes.push(d.message);
    for (const a of d.avoid || []) {
      if (!hints.avoid.includes(a)) hints.avoid.push(a);
    }
    for (const p of d.prefer || []) {
      if (!hints.prefer.includes(p)) hints.prefer.push(p);
    }
  }
  if (hints.avoid.length > 12) hints.avoid = hints.avoid.slice(-12);
  if (hints.prefer.length > 12) hints.prefer = hints.prefer.slice(-12);
  if (typeof store._save === 'function') store._save();
  return changes;
}

function labelsFor(tags) {
  return normalizeTags(tags).map(id => DEVIATION_CATALOG[id].label);
}

module.exports = {
  DEVIATION_CATALOG,
  normalizeTags,
  applyDeviations,
  labelsFor
};
