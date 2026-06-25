'use strict';

/**
 * CAPS 认知-情感处理系统（Mischel & Shoda, 1995）
 * 将人格建模为：情境输入 → CAU 网状加工 → 行为签名输出
 *
 * 与五层架构的关系：
 * - 输入：关系层 + 记忆层（先例）+ 用户文本情境
 * - 加工：五大 CAU + 可及性 + 网状传播（核心层 8 维为其可采集投影）
 * - 输出：行为签名 + 维度权重 → 表达层 Prompt
 */

const CAU_TYPES = {
  encodings: { label: '编码策略', role: '对外界事件的分类与解读过滤器' },
  expectancies: { label: '预期与信念', role: '对「若…则…」结果的预测机' },
  affects: { label: '情感与感受', role: '加速或刹车认知加工的情绪状态' },
  goals_values: { label: '目标与价值观', role: '驱动长远行为的内在导航' },
  competencies: { label: '能力与自我调节', role: '行为技能与情绪控制工具箱' }
};

/** 核心层 8 维 → 主要归属 CAU（采集与沉淀时的归类） */
const DIMENSION_TO_CAU = {
  perspective: 'encodings',
  inner_activity: 'encodings',
  boundary_pattern: 'encodings',
  self_regulation: 'expectancies',
  moral_judgment: 'expectancies',
  interpersonal_style: 'expectancies',
  value_priority: 'goals_values',
  quality_traits: 'goals_values'
};

/** 默认网状连接：编码 → 情感 → 预期 → 目标 → 能力（可经校准追加 custom_edges） */
const DEFAULT_EDGES = [
  { from: 'encodings', to: 'affects', weight: 0.85 },
  { from: 'encodings', to: 'expectancies', weight: 0.55 },
  { from: 'affects', to: 'expectancies', weight: 0.72 },
  { from: 'affects', to: 'goals_values', weight: 0.65 },
  { from: 'expectancies', to: 'goals_values', weight: 0.78 },
  { from: 'goals_values', to: 'competencies', weight: 0.82 },
  { from: 'affects', to: 'competencies', weight: 0.5 }
];

const SITUATION_DETECTORS = [
  { tag: 'authority_present', pattern: /老师|领导|老板|长辈|上级|权威/ },
  { tag: 'peer_challenge', pattern: /嘲笑|挑衅|讽刺|看不起|欺负|怼/ },
  { tag: 'boundary_violation', pattern: /越界|过分|隐私|底线|不能接受|太过分/ },
  { tag: 'intimacy_signal', pattern: /想你|爱你|亲密|抱抱|陪伴|在乎你/ },
  { tag: 'criticism', pattern: /批评|指责|不对|错了|你怎么/ },
  { tag: 'praise', pattern: /厉害|很棒|佩服|做得好|优秀/ },
  { tag: 'core_value_conflict', pattern: /两难|纠结|选哪个|牺牲|冲突|怎么办/ },
  { tag: 'stress', pattern: /压力|累|崩溃|受不了|焦虑|烦/ },
  { tag: 'loss_grief', pattern: /去世|离开|再也|失去|怀念/ }
];

class CAPSEngine {
  /**
   * @param {import('./core-persona').CorePersonaLayer} corePersona
   */
  constructor(corePersona) {
    this.core = corePersona;
  }

  /**
   * 从核心层状态推导五类 CAU 的可及性（0-1，越高越易被情境点亮）
   */
  deriveAccessibility(state) {
    const dims = state.dimensions;
    const caps = state.caps || {};
    const stored = caps.accessibility || {};

    const boundary = dims.boundary_pattern.boundary_strength ?? 0.5;
    const innerGap = dims.inner_activity.inner_outer_gap ?? 0.3;
    const moralFlex = dims.moral_judgment.moral_flexibility ?? 0.5;
    const valueCount = dims.value_priority.ranked_values.length;
    const traitCount = dims.quality_traits.traits.length;

    const derived = {
      encodings: clamp(0.35 + innerGap * 0.45 + (dims.perspective.worldview ? 0.15 : 0), 0.2, 0.95),
      expectancies: clamp(0.4 + (dims.self_regulation.standards.length > 0 ? 0.2 : 0) + moralFlex * 0.15, 0.2, 0.95),
      affects: clamp(0.35 + boundary * 0.4 + (dims.boundary_pattern.triggers.length > 0 ? 0.15 : 0), 0.2, 0.95),
      goals_values: clamp(0.35 + Math.min(valueCount, 5) * 0.08 + (dims.moral_judgment.principles.length > 0 ? 0.12 : 0), 0.2, 0.95),
      competencies: clamp(0.4 + (dims.self_regulation.stress_coping !== 'rational' ? 0.12 : 0) + Math.min(traitCount, 4) * 0.06, 0.2, 0.95)
    };

    for (const key of Object.keys(derived)) {
      if (typeof stored[key] === 'number') {
        derived[key] = clamp(stored[key] * 0.4 + derived[key] * 0.6, 0.2, 0.95);
      }
    }
    return derived;
  }

  /**
   * 解析情境输入（关系层 + 文本 + 情绪层 PAD）
   */
  parseSituation(context = {}) {
    const text = String(context.user_text || '');
    const tags = new Set();

    for (const { tag, pattern } of SITUATION_DETECTORS) {
      if (pattern.test(text)) tags.add(tag);
    }

    const depth = context.relationship_depth ?? 0.5;
    if (depth > 0.7) tags.add('high_intimacy');
    else if (depth < 0.3) tags.add('low_intimacy');

    if (context.emotion_valence != null && context.emotion_valence < -0.3) tags.add('negative_affect');
    if (context.emotion_valence != null && context.emotion_valence > 0.3) tags.add('positive_affect');

    if (context.event_nature === 'core_value') tags.add('core_value_conflict');

    if (context.precedent_memory?.tags) {
      for (const t of context.precedent_memory.tags) tags.add(t);
    }

    return {
      tags: [...tags],
      relationship_depth: depth,
      event_nature: context.event_nature || 'mixed',
      encoding_hint: this._inferEncodingHint(text, tags)
    };
  }

  _inferEncodingHint(text, tags) {
    if (tags.has('peer_challenge')) return '更可能解读为对尊严的挑战';
    if (tags.has('boundary_violation')) return '更可能解读为边界被触碰';
    if (tags.has('authority_present')) return '更可能解读为权力不对等情境';
    if (tags.has('praise')) return '更可能解读为关系确认信号';
    if (/意外|不小心|不是故意/.test(text)) return '更可能解读为中性意外';
    return null;
  }

  /**
   * 根据情境标签与可及性，计算各 CAU 初始激活强度
   */
  activateUnits(situation, accessibility) {
    const activation = {
      encodings: accessibility.encodings * 0.35,
      expectancies: accessibility.expectancies * 0.3,
      affects: accessibility.affects * 0.3,
      goals_values: accessibility.goals_values * 0.3,
      competencies: accessibility.competencies * 0.25
    };

    const tagBoost = {
      encodings: ['peer_challenge', 'boundary_violation', 'criticism', 'core_value_conflict'],
      expectancies: ['authority_present', 'core_value_conflict', 'stress'],
      affects: ['boundary_violation', 'peer_challenge', 'negative_affect', 'loss_grief', 'stress'],
      goals_values: ['core_value_conflict', 'intimacy_signal', 'high_intimacy'],
      competencies: ['stress', 'boundary_violation']
    };

    for (const [cau, boostTags] of Object.entries(tagBoost)) {
      for (const tag of situation.tags) {
        if (boostTags.includes(tag)) {
          activation[cau] = clamp(activation[cau] + 0.22 * accessibility[cau], 0, 1);
        }
      }
    }

    if (situation.encoding_hint) {
      activation.encodings = clamp(activation.encodings + 0.15, 0, 1);
    }

    return activation;
  }

  /**
   * 网状传播：沿边将激活扩散（最多 4 轮）
   */
  propagate(activation, customEdges = []) {
    const edges = [...DEFAULT_EDGES, ...customEdges];
    const current = { ...activation };
    const path = [];
    const visitedOrder = [];

    const sorted = Object.entries(current)
      .filter(([, v]) => v >= 0.45)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);

    if (sorted.length) visitedOrder.push(sorted[0]);

    for (let round = 0; round < 4; round++) {
      let changed = false;
      for (const edge of edges) {
        const fromVal = current[edge.from] || 0;
        if (fromVal < 0.35) continue;
        const spill = fromVal * edge.weight * 0.35;
        const next = (current[edge.to] || 0) + spill;
        if (next > (current[edge.to] || 0)) {
          current[edge.to] = clamp(next, 0, 1);
          changed = true;
          if (!visitedOrder.includes(edge.to)) visitedOrder.push(edge.to);
        }
      }
      if (!changed) break;
    }

    path.push(...visitedOrder);
    return { activation: current, propagation_path: path };
  }

  /**
   * 匹配 If-Then 行为签名；无记录时由核心层维度合成默认签名
   */
  matchBehaviorSignature(situation, state, propagation) {
    const signatures = state.caps?.signatures || [];
    let best = null;
    let bestScore = 0;

    for (const sig of signatures) {
      const ifTags = sig.if?.tags || [];
      if (!ifTags.length) continue;
      const overlap = ifTags.filter(t => situation.tags.includes(t)).length;
      const score = overlap / ifTags.length * (sig.confidence ?? 0.7);
      if (score > bestScore) {
        bestScore = score;
        best = sig;
      }
    }

    if (best && bestScore >= 0.4) {
      return {
        id: best.id,
        label: best.label || best.then?.behavior,
        if_then: `若【${(best.if.tags || []).join('、')}】→ ${best.then?.behavior || ''}`,
        output_hint: best.then?.output_hint || best.then?.behavior,
        cau_path: best.then?.cau_path || propagation.propagation_path,
        source: 'learned_signature',
        confidence: bestScore
      };
    }

    return this._synthesizeSignature(situation, state, propagation);
  }

  _synthesizeSignature(situation, state, propagation) {
    const dims = state.dimensions;
    const tags = situation.tags;

    if (tags.includes('boundary_violation')) {
      const style = dims.boundary_pattern.reaction_style || 'withdraw';
      const behaviorMap = {
        withdraw: '退缩、缩短回复、拉开距离',
        confront: '直接指出越界、语气变硬',
        passive_aggressive: '表面客气、暗含不满',
        rationalize: '讲道理、划清界限'
      };
      return {
        label: '边界被触碰',
        if_then: '若【边界被触碰】→ ' + (behaviorMap[style] || behaviorMap.withdraw),
        output_hint: behaviorMap[style],
        cau_path: propagation.propagation_path,
        source: 'boundary_pattern',
        confidence: 0.65
      };
    }

    if (tags.includes('peer_challenge')) {
      const traits = dims.interpersonal_style.core_traits || [];
      const hint = traits.includes('直接')
        ? '正面回应、不回避冲突'
        : traits.includes('温柔')
          ? '缓和语气、尝试理解对方'
          : '先评估关系再决定反击或化解';
      return {
        label: '同伴挑战',
        if_then: `若【同伴挑衅】→ ${hint}`,
        output_hint: hint,
        cau_path: propagation.propagation_path,
        source: 'interpersonal_style',
        confidence: 0.55
      };
    }

    if (tags.includes('authority_present')) {
      const coping = dims.self_regulation.stress_coping || 'rational';
      const hint = coping === 'avoidant'
        ? '顺从、少表态'
        : coping === 'emotional'
          ? '情绪外露、可能顶撞或委屈'
          : '理性应答、保留立场';
      return {
        label: '权威在场',
        if_then: `若【权威在场】→ ${hint}`,
        output_hint: hint,
        cau_path: propagation.propagation_path,
        source: 'self_regulation',
        confidence: 0.5
      };
    }

    if (tags.includes('core_value_conflict') && dims.value_priority.ranked_values.length) {
      const top = dims.value_priority.ranked_values.slice(0, 2).join(' 优先于 ');
      return {
        label: '价值冲突',
        if_then: `若【价值两难】→ 倾向保护「${top}」相关选择`,
        output_hint: `在冲突中更倾向 ${dims.value_priority.ranked_values[0]}`,
        cau_path: propagation.propagation_path,
        source: 'value_priority',
        confidence: 0.6
      };
    }

    return {
      label: '默认加工',
      if_then: '若【一般对话】→ 保持一贯待人风格与当前情绪节奏',
      output_hint: dims.interpersonal_style.core_traits.slice(0, 2).join('、') || '自然、一致',
      cau_path: propagation.propagation_path,
      source: 'default',
      confidence: 0.35
    };
  }

  /**
   * 将 CAU 激活映射为核心层 8 维的额外权重微调
   */
  cauToDimensionAdjustments(activation) {
    const adj = {};
    const add = (dim, delta) => {
      adj[dim] = (adj[dim] || 0) + delta;
    };

    if (activation.encodings >= 0.55) {
      add('perspective', 0.06);
      add('inner_activity', 0.05);
      add('boundary_pattern', 0.04);
    }
    if (activation.expectancies >= 0.55) {
      add('self_regulation', 0.05);
      add('moral_judgment', 0.05);
      add('interpersonal_style', 0.04);
    }
    if (activation.affects >= 0.55) {
      add('boundary_pattern', 0.05);
      add('inner_activity', 0.04);
    }
    if (activation.goals_values >= 0.55) {
      add('value_priority', 0.08);
      add('moral_judgment', 0.04);
    }
    if (activation.competencies >= 0.55) {
      add('self_regulation', 0.05);
      add('interpersonal_style', 0.05);
      add('quality_traits', 0.03);
    }
    return adj;
  }

  /**
   * 完整 CAPS 加工流水线
   */
  process(context = {}) {
    const state = this.core.getState();
    const accessibility = this.deriveAccessibility(state);
    const situation = this.parseSituation(context);
    const initial = this.activateUnits(situation, accessibility);
    const propagated = this.propagate(initial, state.caps?.custom_edges || []);
    const signature = this.matchBehaviorSignature(situation, state, propagated);

    const baseWeights = this.core.computeWeights({
      relationship_depth: context.relationship_depth,
      emotion_valence: context.emotion_valence,
      event_nature: context.event_nature,
      precedent_memory: context.precedent_memory
    });

    const cauAdj = this.cauToDimensionAdjustments(propagated.activation);
    const merged = { ...baseWeights };
    for (const [dim, delta] of Object.entries(cauAdj)) {
      merged[dim] = (merged[dim] || 0) + delta;
    }
    const total = Object.values(merged).reduce((s, w) => s + w, 0);
    const dimension_weights = {};
    for (const [k, w] of Object.entries(merged)) {
      dimension_weights[k] = w / total;
    }

    const prompt_block = this.buildPromptBlock({
      situation,
      accessibility,
      propagated,
      signature,
      dimension_weights,
      precedent: context.precedent_memory
    });

    return {
      situation,
      accessibility,
      activation: propagated.activation,
      propagation_path: propagated.propagation_path,
      behavior_signature: signature,
      dimension_weights,
      prompt_block
    };
  }

  buildPromptBlock({ situation, accessibility, propagated, signature, dimension_weights, precedent }) {
    const topDims = Object.entries(dimension_weights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, w]) => `${CORE_DIMENSION_LABELS[k] || k}(${(w * 100).toFixed(0)}%)`);

    const pathLabels = propagated.propagation_path
      .map(p => CAU_TYPES[p]?.label || p)
      .join(' → ');

    const accLines = Object.entries(accessibility)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k, v]) => `${CAU_TYPES[k]?.label}可及性${(v * 100).toFixed(0)}%`);

    const precedentLine = precedent?.found
      ? `先例记忆（${precedent.source}）：${String(precedent.content || '').slice(0, 80)}… → 当时${precedent.outcome === 'positive' ? '偏积极' : precedent.outcome === 'negative' ? '偏消极' : '中性'}${precedent.success === false ? '，本轮宜避免重复' : ''}`
      : null;

    return [
      '【CAPS 动力系统 · 本轮加工】',
      precedentLine,
      situation.encoding_hint ? `情境解读：${situation.encoding_hint}` : null,
      situation.tags.length ? `情境标签：${situation.tags.join('、')}` : null,
      pathLabels ? `激活路径：${pathLabels}` : null,
      accLines.length ? `高可及单元：${accLines.join('；')}` : null,
      `行为签名：${signature.if_then}`,
      `本轮侧重：${topDims.join('、')}`
    ].filter(Boolean).join('\n');
  }

  /**
   * 记录一条 If-Then 行为签名（校准 / 训练沉淀）
   */
  static buildSignaturePayload({ if_tags, behavior, output_hint, cau_path, label, confidence }) {
    return {
      id: `sig_${Date.now()}`,
      label: label || behavior,
      if: { tags: if_tags || [] },
      then: {
        behavior,
        output_hint: output_hint || behavior,
        cau_path: cau_path || []
      },
      confidence: confidence ?? 0.75,
      created: Date.now()
    };
  }
}

const CORE_DIMENSION_LABELS = {
  value_priority: '价值优先级',
  self_regulation: '自我规范',
  boundary_pattern: '边界模式',
  interpersonal_style: '待人处事',
  perspective: '眼光视角',
  inner_activity: '内心活动',
  moral_judgment: '道德判断',
  quality_traits: '品质特质'
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

module.exports = {
  CAPSEngine,
  CAU_TYPES,
  DIMENSION_TO_CAU,
  DEFAULT_EDGES,
  SITUATION_DETECTORS,
  CORE_DIMENSION_LABELS
};
