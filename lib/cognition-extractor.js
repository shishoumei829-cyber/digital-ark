'use strict';

const { VALUE_CARDS } = require('./design-spec');

/** 选项/题干关键词 → 价值卡片 value */
const CHOICE_VALUE_HINTS = [
  { values: ['真理', '责任'], pattern: /诚实|讲道理|说实话|坦诚|公正|公平|信守|承诺/ },
  { values: ['善良', '关系'], pattern: /再给|原谅|理解|体谅|陪伴|关心|帮助|安慰/ },
  { values: ['尊严', '独立'], pattern: /绝交|断绝|不理|直接拒绝|不接受|底线|原则/ },
  { values: ['安全', '平静'], pattern: /装作|回避|不说|忍|算了|低调|避免冲突/ },
  { values: ['家庭'], pattern: /家人|父母|孩子|家庭|亲情/ },
  { values: ['自由'], pattern: /自由|自主|不受约束|自己决定/ },
  { values: ['成长'], pattern: /学习|进步|提升|成长|努力/ },
  { values: ['忠诚'], pattern: /忠诚|守信|不背叛|站在.*一边/ },
  { values: ['幽默'], pattern: /玩笑|幽默|轻松|调侃/ },
  { values: ['坚韧'], pattern: /坚持|不放弃|扛|硬撑/ }
];

const CONFLICT_RESOLUTION_HINTS = [
  { mode: 'principled', pattern: /原则|底线|绝对不能|必须/ },
  { mode: 'empathetic', pattern: /理解|体谅|感受|陪伴/ },
  { mode: 'pragmatic', pattern: /视情况|灵活|权衡|务实|折中/ },
  { mode: 'balanced', pattern: /讲道理|再给机会|沟通|商量/ }
];

const MORAL_PRINCIPLE_HINTS = [
  { principle: '诚实守信', pattern: /诚实|守信|说实话|不骗/ },
  { principle: '不伤害他人', pattern: /不伤害|体谅|照顾感受/ },
  { principle: '公平对待', pattern: /公平|公正|一视同仁/ },
  { principle: '尊重边界', pattern: /边界|隐私|尊重|不越界/ }
];

const STYLE_TRAIT_HINTS = [
  { trait: '直接', pattern: /直接|直说|干脆|当面/ },
  { trait: '温柔', pattern: /温柔|体贴|轻声|安慰/ },
  { trait: '嘴硬', pattern: /嘴硬|哼|别误会|才不是/ },
  { trait: '理性', pattern: /理性|分析|讲道理|冷静/ },
  { trait: '幽默', pattern: /玩笑|幽默|调侃/ }
];

const BOUNDARY_TRIGGER_HINTS = [
  { trigger: '原则底线', pattern: /底线|原则|不能接受|绝对/ },
  { trigger: '隐私边界', pattern: /隐私|不想说|保密/ },
  { trigger: '情感边界', pattern: /过分|越界|受不了/ },
  { trigger: '信任伤害', pattern: /欺骗|背叛|借钱不还|失信/ }
];

function matchHints(text, hintList, field) {
  const t = String(text || '');
  const out = [];
  for (const h of hintList) {
    if (h.pattern.test(t)) out.push(h[field]);
  }
  return out;
}

function inferValuesFromText(text) {
  const found = new Set();
  const t = String(text || '');
  for (const h of CHOICE_VALUE_HINTS) {
    if (h.pattern.test(t)) h.values.forEach(v => found.add(v));
  }
  for (const card of VALUE_CARDS) {
    if (t.includes(card.label) || t.includes(card.value)) found.add(card.value);
  }
  return [...found];
}

function inferConflictResolution(choice, question) {
  const text = `${question || ''} ${choice || ''}`;
  for (const h of CONFLICT_RESOLUTION_HINTS) {
    if (h.pattern.test(text)) return h.mode;
  }
  return 'balanced';
}

/**
 * 从认知训练题提取核心层更新（不写盘）
 * @returns {{ dimension: string, updates: object }[]}
 */
function extractCognitionUpdates({ question, choice, options, valuesRanking, conflictChoices }) {
  const results = [];
  const q = question || '';
  const c = choice || '';
  const combined = `${q} ${c}`;

  const values = inferValuesFromText(combined);
  if (valuesRanking?.length) {
    valuesRanking.forEach(v => {
      if (v && !values.includes(v)) values.push(v);
    });
  }

  if (values.length) {
    results.push({
      dimension: 'value_priority',
      updates: {
        ranked_values: values.slice(0, 12),
        conflict_resolution: inferConflictResolution(c, q)
      }
    });
  }

  const principles = matchHints(combined, MORAL_PRINCIPLE_HINTS, 'principle');
  if (principles.length) {
    results.push({
      dimension: 'moral_judgment',
      updates: { principles: [...new Set(principles)] }
    });
  }

  const traits = matchHints(combined, STYLE_TRAIT_HINTS, 'trait');
  if (traits.length) {
    results.push({
      dimension: 'interpersonal_style',
      updates: { core_traits: [...new Set(traits)] }
    });
  }

  const triggers = matchHints(combined, BOUNDARY_TRIGGER_HINTS, 'trigger');
  if (triggers.length) {
    results.push({
      dimension: 'boundary_pattern',
      updates: { triggers: [...new Set(triggers)] }
    });
  }

  if (/自律|标准|要求自己|不能放纵/.test(combined)) {
    results.push({
      dimension: 'self_regulation',
      updates: { standards: ['自律'] }
    });
  }

  if (conflictChoices?.length >= 2) {
    const modes = conflictChoices.map(cc =>
      inferConflictResolution(cc.choice || cc, q)
    );
    const counts = {};
    modes.forEach(m => { counts[m] = (counts[m] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) {
      const existing = results.find(r => r.dimension === 'value_priority');
      if (existing) {
        existing.updates.conflict_resolution = top;
      } else {
        results.push({
          dimension: 'value_priority',
          updates: { conflict_resolution: top, ranked_values: values.slice(0, 8) }
        });
      }
    }
  }

  if (!results.length && options?.length && c) {
    const idx = options.indexOf(c);
    if (idx === 0) {
      results.push({
        dimension: 'value_priority',
        updates: { ranked_values: ['尊严', '独立'], conflict_resolution: 'principled' }
      });
    } else if (idx === options.length - 1) {
      results.push({
        dimension: 'value_priority',
        updates: { ranked_values: ['平静', '安全'], conflict_resolution: 'pragmatic' }
      });
    } else {
      results.push({
        dimension: 'value_priority',
        updates: { ranked_values: ['责任', '真理'], conflict_resolution: 'balanced' }
      });
    }
  }

  return results;
}

module.exports = {
  extractCognitionUpdates,
  inferValuesFromText,
  inferConflictResolution
};
