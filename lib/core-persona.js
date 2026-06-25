'use strict';

/**
 * 核心人格层
 * 管理价值优先级、自我规范、边界模式、待人处事风格、眼光视角、内心活动模式、道德判断、品质特质
 * 
 * 核心设计理念：
 * - 核心层是人格的"操作系统"，驱动情绪、记忆、关系、表达的所有决策
 * - 核心层通过权衡算法动态调整各维度权重，而不是静态配置
 * - 核心层会随时间演化，活态记忆沉淀为核心规则
 */

const fs = require('fs');
const path = require('path');
const { CAPSEngine, DIMENSION_TO_CAU } = require('./caps-engine');

// 核心层维度定义
const CORE_DIMENSIONS = {
  value_priority: {
    label: '价值优先级',
    description: '冲突时你选什么',
    weight: 0.20
  },
  self_regulation: {
    label: '自我规范',
    description: '你对自己的要求',
    weight: 0.15
  },
  boundary_pattern: {
    label: '边界模式',
    description: '什么触碰到你有稳定反应',
    weight: 0.15
  },
  interpersonal_style: {
    label: '待人处事风格',
    description: '温柔、优雅等',
    weight: 0.15
  },
  perspective: {
    label: '眼光视角',
    description: '你看世界的角度',
    weight: 0.10
  },
  inner_activity: {
    label: '内心活动模式',
    description: '外部反应之下真正在想什么',
    weight: 0.05
  },
  moral_judgment: {
    label: '道德判断',
    description: '你的是非标准',
    weight: 0.10
  },
  quality_traits: {
    label: '品质特质',
    description: '你身上稳定的东西',
    weight: 0.10
  }
};

// 权衡上下文变量
const WEIGHING_FACTORS = {
  relationship_depth: { label: '关系深度', range: [0, 1] },
  emotion_valence: { label: '情绪效价', range: [-1, 1] },
  event_nature: { label: '事件性质', values: ['core_value', 'surface_preference', 'mixed'] },
  precedent_success: { label: '先例成功度', range: [0, 1] }
};

class CorePersonaLayer {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.path = path.join(dataDir, 'core_persona.json');
    this.historyPath = path.join(dataDir, 'core_persona_history.json');
    this.cardResponsesPath = path.join(dataDir, 'value_card_responses.json');
    
    this.state = this._load();
    this.history = this._loadJSON(this.historyPath, []);
    this.cardResponses = this._loadJSON(this.cardResponsesPath, []);
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) {
        return JSON.parse(fs.readFileSync(this.path, 'utf8'));
      }
    } catch {}
    return this._getDefaultState();
  }

  _loadJSON(filePath, defaultValue) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch {}
    return defaultValue;
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.state, null, 2));
  }

  _saveHistory(entry) {
    this.history.push({
      ...entry,
      timestamp: Date.now()
    });
    if (this.history.length > 500) {
      this.history = this.history.slice(-500);
    }
    fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2));
  }

  _getDefaultState() {
    return {
      version: 1,
      created: Date.now(),
      updated: Date.now(),
      
      // 八个核心维度，每个维度包含多个特征
      dimensions: {
        value_priority: {
          // 核心价值观排序（从最重要到最不重要）
          ranked_values: [],
          // 价值冲突时的决策模式
          conflict_resolution: 'balanced', // balanced, principled, pragmatic, empathetic
          // 采集来源
          sources: []
        },
        
        self_regulation: {
          // 对自己的要求
          standards: [],
          // 压力下的自我调节方式
          stress_coping: 'rational', // rational, emotional, avoidant, proactive
          // 自我期望水平
          expectation_level: 'moderate', // low, moderate, high, perfectionist
          sources: []
        },
        
        boundary_pattern: {
          // 触发边界的情境类型
          triggers: [],
          // 边界被触碰时的反应模式
          reaction_style: 'withdraw', // withdraw, confront, passive_aggressive, rationalize
          // 边界强度
          boundary_strength: 0.5, // 0-1
          sources: []
        },
        
        interpersonal_style: {
          // 待人处事的核心特质
          core_traits: [],
          // 对不同关系类型的应对方式
          relationship_modes: {
            stranger: { distance: 7, initiative: 3, emotional_depth: 2 },
            acquaintance: { distance: 5, initiative: 5, emotional_depth: 4 },
            friend: { distance: 3, initiative: 7, emotional_depth: 6 },
            intimate: { distance: 1, initiative: 8, emotional_depth: 9 }
          },
          sources: []
        },
        
        perspective: {
          // 看世界的角度
          worldview: '', // optimistic, pessimistic, realistic, pragmatic
          // 关注点偏好
          focus_preferences: [], // 例如：['人际关系', '逻辑系统', '情感体验', '实际利益']
          // 思维方式
          thinking_style: 'analytical', // analytical, intuitive, practical, creative
          sources: []
        },
        
        inner_activity: {
          // 内心独白模式
          inner_monologue_style: '', // 例如：'自我对话型', '情感分析型', '计划规划型'
          // 内心与外在表现的差异程度
          inner_outer_gap: 0.3, // 0-1，越大表示内外差异越大
          // 内心活动频率
          inner_activity_level: 'moderate', // low, moderate, high
          sources: []
        },
        
        moral_judgment: {
          // 道德判断原则
          principles: [],
          // 道德灵活性
          moral_flexibility: 0.5, // 0-1，越大越灵活
          // 道德冲突时的倾向
          moral_priority: 'fairness', // fairness, care, loyalty, authority, sanctity
          sources: []
        },
        
        quality_traits: {
          // 稳定的品质特质
          traits: [],
          // 特质强度分布
          trait_intensity: {}, // { trait_name: intensity (0-1) }
          sources: []
        }
      },
      
      // CAPS 动力系统（Mischel & Shoda）：可及性、If-Then 行为签名、自定义网状边
      caps: {
        accessibility: {
          encodings: 0.5,
          expectancies: 0.5,
          affects: 0.5,
          goals_values: 0.5,
          competencies: 0.5
        },
        signatures: [],
        custom_edges: []
      },

      // 元数据
      metadata: {
        completeness: 0, // 0-1，核心层完整度
        confidence: 0, // 0-1，核心层置信度
        last_calibration: null,
        calibration_count: 0,
        card_game_completed: false,
        card_game_score: 0
      }
    };
  }

  _ensureCaps() {
    if (!this.state.caps) {
      this.state.caps = this._getDefaultState().caps;
    }
    if (!this.state.caps.signatures) this.state.caps.signatures = [];
    if (!this.state.caps.custom_edges) this.state.caps.custom_edges = [];
  }

  _capsEngine() {
    return new CAPSEngine(this);
  }

  /**
   * CAPS 完整加工：情境 → CAU 网状激活 → 行为签名 + 维度权重
   */
  processCAPS(context = {}) {
    this._ensureCaps();
    return this._capsEngine().process(context);
  }

  /**
   * 添加 If-Then 行为签名（用户校准「像/不像」时可沉淀）
   */
  addBehaviorSignature(signature) {
    this._ensureCaps();
    this.state.caps.signatures.push(signature);
    if (this.state.caps.signatures.length > 80) {
      this.state.caps.signatures = this.state.caps.signatures.slice(-80);
    }
    this.state.updated = Date.now();
    this._save();
    this._saveHistory({ action: 'caps_signature_add', signature });
    return signature;
  }

  /**
   * 更新 CAU 可及性（慢性倾向：如「危险情感单元」极易被点亮）
   */
  updateCapsAccessibility(updates) {
    this._ensureCaps();
    Object.assign(this.state.caps.accessibility, updates);
    this.state.updated = Date.now();
    this._save();
    return this.state.caps.accessibility;
  }

  getCapsState() {
    this._ensureCaps();
    const accessibility = this._capsEngine().deriveAccessibility(this.state);
    return {
      accessibility,
      signatures: this.state.caps.signatures,
      custom_edges: this.state.caps.custom_edges,
      dimension_to_cau: DIMENSION_TO_CAU
    };
  }

  addCustomEdge(from, to, weight = 0.85, source = 'sediment') {
    this._ensureCaps();
    const exists = this.state.caps.custom_edges.some(e => e.from === from && e.to === to);
    if (exists) return null;
    const edge = { from, to, weight, source };
    this.state.caps.custom_edges.push(edge);
    this.state.updated = Date.now();
    this._save();
    return edge;
  }

  /**
   * 获取核心层完整状态
   */
  getState() {
    return this.state;
  }

  /**
   * 获取特定维度
   */
  getDimension(dimensionKey) {
    return this.state.dimensions[dimensionKey] || null;
  }

  /**
   * 更新特定维度
   */
  updateDimension(dimensionKey, updates, source = 'manual') {
    if (!this.state.dimensions[dimensionKey]) {
      throw new Error(`无效的核心层维度: ${dimensionKey}`);
    }
    
    const dimension = this.state.dimensions[dimensionKey];
    
    // 合并更新
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'sources') continue; // sources单独处理
      dimension[key] = value;
    }
    
    // 记录来源
    if (!dimension.sources) dimension.sources = [];
    dimension.sources.push({
      type: source,
      timestamp: Date.now(),
      update_keys: Object.keys(updates)
    });
    
    // 更新元数据
    this.state.updated = Date.now();
    this._updateCompleteness();
    this._save();
    
    // 记录历史
    this._saveHistory({
      action: 'dimension_update',
      dimension: dimensionKey,
      updates,
      source
    });
    
    return dimension;
  }

  /**
   * 计算核心层完整度
   */
  _updateCompleteness() {
    let totalScore = 0;
    let dimensionCount = 0;
    
    for (const [key, dimension] of Object.entries(this.state.dimensions)) {
      dimensionCount++;
      let dimensionScore = 0;
      
      // 根据维度类型计算完整度
      switch (key) {
        case 'value_priority':
          dimensionScore = dimension.ranked_values.length > 0 ? 0.5 : 0;
          dimensionScore += dimension.conflict_resolution !== 'balanced' ? 0.3 : 0;
          dimensionScore += dimension.sources.length > 0 ? 0.2 : 0;
          break;
        case 'self_regulation':
          dimensionScore = dimension.standards.length > 0 ? 0.5 : 0;
          dimensionScore += dimension.stress_coping !== 'rational' ? 0.3 : 0;
          dimensionScore += dimension.sources.length > 0 ? 0.2 : 0;
          break;
        case 'boundary_pattern':
          dimensionScore = dimension.triggers.length > 0 ? 0.5 : 0;
          dimensionScore += dimension.reaction_style !== 'withdraw' ? 0.3 : 0;
          dimensionScore += dimension.sources.length > 0 ? 0.2 : 0;
          break;
        case 'interpersonal_style':
          dimensionScore = dimension.core_traits.length > 0 ? 0.5 : 0;
          dimensionScore += Object.values(dimension.relationship_modes).some(m => m.distance !== 5) ? 0.3 : 0;
          dimensionScore += dimension.sources.length > 0 ? 0.2 : 0;
          break;
        case 'perspective':
          dimensionScore = dimension.worldview ? 0.4 : 0;
          dimensionScore += dimension.focus_preferences.length > 0 ? 0.3 : 0;
          dimensionScore += dimension.sources.length > 0 ? 0.3 : 0;
          break;
        case 'inner_activity':
          dimensionScore = dimension.inner_monologue_style ? 0.5 : 0;
          dimensionScore += dimension.inner_outer_gap !== 0.3 ? 0.3 : 0;
          dimensionScore += dimension.sources.length > 0 ? 0.2 : 0;
          break;
        case 'moral_judgment':
          dimensionScore = dimension.principles.length > 0 ? 0.5 : 0;
          dimensionScore += dimension.moral_priority !== 'fairness' ? 0.3 : 0;
          dimensionScore += dimension.sources.length > 0 ? 0.2 : 0;
          break;
        case 'quality_traits':
          dimensionScore = dimension.traits.length > 0 ? 0.5 : 0;
          dimensionScore += Object.keys(dimension.trait_intensity).length > 0 ? 0.3 : 0;
          dimensionScore += dimension.sources.length > 0 ? 0.2 : 0;
          break;
      }
      
      totalScore += Math.min(1, dimensionScore);
    }
    
    this.state.metadata.completeness = totalScore / dimensionCount;
    this.state.metadata.confidence = this.state.metadata.completeness * 0.8 + 
      (this.state.metadata.calibration_count / 10) * 0.2;
  }

  /**
   * 核心层权衡算法
   * 根据上下文动态调整各维度权重
   */
  computeWeights(context = {}) {
    const {
      relationship_depth = 0.5,    // 0-1，关系深度
      emotion_valence = 0,          // -1到1，情绪效价
      event_nature = 'mixed',       // core_value, surface_preference, mixed
      precedent_memory = null       // 先例记忆
    } = context;
    
    // 基础权重
    const baseWeights = {};
    for (const [key, dim] of Object.entries(CORE_DIMENSIONS)) {
      baseWeights[key] = dim.weight;
    }
    
    // 动态调整
    const adjustments = {};
    
    // 1. 关系深度调整
    // 亲密关系：更重视待人处事和边界
    // 陌生关系：更重视价值优先级和道德判断
    if (relationship_depth > 0.7) {
      adjustments.interpersonal_style = 0.08;
      adjustments.boundary_pattern = 0.05;
      adjustments.value_priority = -0.08;
      adjustments.moral_judgment = -0.05;
    } else if (relationship_depth < 0.3) {
      adjustments.interpersonal_style = -0.05;
      adjustments.boundary_pattern = -0.03;
      adjustments.value_priority = 0.05;
      adjustments.moral_judgment = 0.03;
    }
    
    // 2. 情绪状态调整
    // 负面情绪：更重视自我规范和边界
    // 正面情绪：更重视待人处事和眼光视角
    if (emotion_valence < -0.3) {
      adjustments.self_regulation = 0.08;
      adjustments.boundary_pattern = 0.05;
      adjustments.interpersonal_style = -0.06;
      adjustments.perspective = -0.04;
      adjustments.inner_activity = 0.03;
    } else if (emotion_valence > 0.3) {
      adjustments.self_regulation = -0.05;
      adjustments.boundary_pattern = -0.03;
      adjustments.interpersonal_style = 0.06;
      adjustments.perspective = 0.04;
      adjustments.inner_activity = -0.02;
    }
    
    // 3. 事件性质调整
    // 核心价值事件：价值优先级权重最高
    // 表面偏好事件：待人处事和眼光视角权重提高
    if (event_nature === 'core_value') {
      adjustments.value_priority = (adjustments.value_priority || 0) + 0.12;
      adjustments.moral_judgment = (adjustments.moral_judgment || 0) + 0.08;
      adjustments.interpersonal_style = (adjustments.interpersonal_style || 0) - 0.1;
      adjustments.perspective = (adjustments.perspective || 0) - 0.05;
    } else if (event_nature === 'surface_preference') {
      adjustments.value_priority = (adjustments.value_priority || 0) - 0.08;
      adjustments.moral_judgment = (adjustments.moral_judgment || 0) - 0.05;
      adjustments.interpersonal_style = (adjustments.interpersonal_style || 0) + 0.08;
      adjustments.perspective = (adjustments.perspective || 0) + 0.05;
    }
    
    // 4. 先例记忆调整
    // 如果有成功的先例，增加相关维度的权重
    if (precedent_memory && precedent_memory.success && precedent_memory.dimension) {
      adjustments[precedent_memory.dimension] = 
        (adjustments[precedent_memory.dimension] || 0) + 0.1;
    }
    
    // 应用调整
    const adjustedWeights = {};
    for (const [key, baseWeight] of Object.entries(baseWeights)) {
      adjustedWeights[key] = baseWeight + (adjustments[key] || 0);
    }
    
    // 归一化，确保权重总和为1
    const totalWeight = Object.values(adjustedWeights).reduce((sum, w) => sum + w, 0);
    const normalizedWeights = {};
    for (const [key, weight] of Object.entries(adjustedWeights)) {
      normalizedWeights[key] = weight / totalWeight;
    }
    
    return normalizedWeights;
  }

  /**
   * 处理价值卡片选择（冷启动）
   * 用户在两张价值卡片中选择更认同的一个
   */
  processValueCardChoice(cardA, cardB, chosenCard, reactionTime) {
    const response = {
      id: `vc_${Date.now()}`,
      card_a: cardA,
      card_b: cardB,
      chosen: chosenCard, // 'A' or 'B'
      reaction_time: reactionTime, // 反应时间（毫秒），用于判断选择的确定性
      timestamp: Date.now()
    };
    
    this.cardResponses.push(response);
    
    // 根据选择更新价值优先级
    const chosenValue = chosenCard === 'A' ? cardA.value : cardB.value;
    const rejectedValue = chosenCard === 'A' ? cardB.value : cardA.value;
    
    const currentValues = this.state.dimensions.value_priority.ranked_values;
    
    // 更新排序
    const chosenIndex = currentValues.indexOf(chosenValue);
    const rejectedIndex = currentValues.indexOf(rejectedValue);
    
    if (chosenIndex === -1) {
      currentValues.push(chosenValue);
    }
    if (rejectedIndex === -1) {
      currentValues.push(rejectedValue);
    }
    
    // 确保选中的在拒绝的前面
    const finalChosenIndex = currentValues.indexOf(chosenValue);
    const finalRejectedIndex = currentValues.indexOf(rejectedValue);
    
    if (finalChosenIndex > finalRejectedIndex) {
      // 交换位置
      currentValues.splice(finalRejectedIndex, 1);
      currentValues.splice(finalChosenIndex, 0, rejectedValue);
    }
    
    // 记录来源
    this.state.dimensions.value_priority.sources.push({
      type: 'card_game',
      timestamp: Date.now(),
      chosen: chosenValue,
      rejected: rejectedValue,
      reaction_time: reactionTime
    });
    
    // 更新元数据
    this.state.metadata.card_game_score += reactionTime < 3000 ? 1 : 0.5; // 快速选择权重更高
    
    this._updateCompleteness();
    this._save();
    this._saveHistory({
      action: 'value_card_choice',
      response
    });
    
    return response;
  }

  /**
   * 完成价值卡片游戏
   */
  completeCardGame() {
    this.state.metadata.card_game_completed = true;
    this._updateCompleteness();
    this._save();
    
    return {
      completed: true,
      score: this.state.metadata.card_game_score,
      completeness: this.state.metadata.completeness
    };
  }

  /**
   * 从对话中提取核心层特征
   * 基于用户的行为和表达，推断核心层维度
   */
  extractFromConversation(userText, assistantReply, context = {}) {
    const extractions = [];
    
    // 1. 提取价值优先级
    const valuePatterns = {
      '家庭': /家人|父母|孩子|家庭|亲情/,
      '事业': /工作|事业|职业|成就|成功/,
      '自由': /自由|独立|自主|不受约束/,
      '安全': /安全|稳定|保障|确定性/,
      '成长': /学习|成长|进步|提升/,
      '关系': /朋友|社交|人际关系|连接/,
      '健康': /健康|身体|运动|养生/,
      '创造': /创造|创新|艺术|表达/,
      '真理': /真相|真理|事实|诚实/,
      '意义': /意义|价值|目的|使命/
    };
    
    for (const [value, pattern] of Object.entries(valuePatterns)) {
      if (pattern.test(userText)) {
        extractions.push({
          dimension: 'value_priority',
          type: 'value_mention',
          value,
          confidence: 0.6
        });
      }
    }
    
    // 2. 提取自我规范
    const regulationPatterns = {
      '自律': /自律|坚持|规律|习惯/,
      '完美主义': /完美|最好|不能出错|必须/,
      '宽容': /算了|没关系|不必在意|放过/,
      '上进': /努力|加油|不能落后|要更好/
    };
    
    for (const [standard, pattern] of Object.entries(regulationPatterns)) {
      if (pattern.test(userText)) {
        extractions.push({
          dimension: 'self_regulation',
          type: 'standard_mention',
          value: standard,
          confidence: 0.5
        });
      }
    }
    
    // 3. 提取边界模式
    const boundaryPatterns = {
      '隐私边界': /隐私|私人|不想说|保密/,
      '时间边界': /时间|没空|打扰|休息/,
      '情感边界': /受不了|太过了|过分|越界/,
      '原则底线': /原则|底线|不能接受|绝对不/
    };
    
    for (const [boundary, pattern] of Object.entries(boundaryPatterns)) {
      if (pattern.test(userText)) {
        extractions.push({
          dimension: 'boundary_pattern',
          type: 'boundary_trigger',
          value: boundary,
          confidence: 0.6
        });
      }
    }
    
    // 4. 提取待人处事风格
    const stylePatterns = {
      '温柔': /温柔|体贴|关心|照顾/,
      '直接': /直接|直说|不绕弯|干脆/,
      '幽默': /哈哈|笑死|搞笑|开玩笑/,
      '严肃': /认真|严肃|正经|别闹/,
      '优雅': /优雅|得体|讲究|品味/
    };
    
    for (const [style, pattern] of Object.entries(stylePatterns)) {
      if (pattern.test(userText)) {
        extractions.push({
          dimension: 'interpersonal_style',
          type: 'style_trait',
          value: style,
          confidence: 0.5
        });
      }
    }
    
    // 5. 提取眼光视角
    const perspectivePatterns = {
      '乐观': /希望|会好的|没关系|还有机会/,
      '悲观': /没用|不会好|没希望|算了/,
      '现实': /现实|实际|具体|可行/,
      '批判': /但是|不过|问题是|不对/
    };
    
    for (const [perspective, pattern] of Object.entries(perspectivePatterns)) {
      if (pattern.test(userText)) {
        extractions.push({
          dimension: 'perspective',
          type: 'worldview',
          value: perspective,
          confidence: 0.5
        });
      }
    }
    
    // 应用提取结果
    this._applyExtractions(extractions);
    
    return extractions;
  }

  /**
   * 应用提取结果到核心层
   */
  _applyExtractions(extractions) {
    for (const extraction of extractions) {
      const dimension = this.state.dimensions[extraction.dimension];
      if (!dimension) continue;
      
      switch (extraction.type) {
        case 'value_mention':
          if (!dimension.ranked_values.includes(extraction.value)) {
            dimension.ranked_values.push(extraction.value);
          }
          break;
        case 'standard_mention':
          if (!dimension.standards.includes(extraction.value)) {
            dimension.standards.push(extraction.value);
          }
          break;
        case 'boundary_trigger':
          if (!dimension.triggers.includes(extraction.value)) {
            dimension.triggers.push(extraction.value);
          }
          break;
        case 'style_trait':
          if (!dimension.core_traits.includes(extraction.value)) {
            dimension.core_traits.push(extraction.value);
          }
          break;
        case 'worldview':
          dimension.worldview = extraction.value;
          break;
      }
      
      // 记录来源
      if (!dimension.sources) dimension.sources = [];
      dimension.sources.push({
        type: 'conversation_extraction',
        timestamp: Date.now(),
        extraction
      });
    }
    
    this._updateCompleteness();
    this._save();
  }

  /**
   * 记录校准反馈
   * 用户说"像"或"不像"时调用
   */
  recordCalibration(feedback) {
    const { is_accurate, dimension, correction, context } = feedback;
    
    this.state.metadata.calibration_count++;
    this.state.metadata.last_calibration = Date.now();
    
    if (!is_accurate && dimension && correction) {
      this.updateDimension(dimension, correction, 'calibration');
    }

    if (feedback.if_tags && feedback.expected_behavior) {
      this.addBehaviorSignature(
        CAPSEngine.buildSignaturePayload({
          if_tags: feedback.if_tags,
          behavior: feedback.expected_behavior,
          output_hint: feedback.output_hint,
          cau_path: feedback.cau_path,
          label: feedback.signature_label,
          confidence: is_accurate ? 0.85 : 0.7
        })
      );
    }
    
    this._saveHistory({
      action: 'calibration',
      feedback
    });
    
    return {
      calibration_count: this.state.metadata.calibration_count,
      completeness: this.state.metadata.completeness,
      confidence: this.state.metadata.confidence
    };
  }

  /**
   * 生成核心层摘要（用于Prompt注入）
   */
  generateSummary() {
    const parts = [];
    const dims = this.state.dimensions;
    
    // 价值优先级
    if (dims.value_priority.ranked_values.length > 0) {
      const topValues = dims.value_priority.ranked_values.slice(0, 3);
      parts.push(`核心价值：${topValues.join(' > ')}`);
    }
    
    // 自我规范
    if (dims.self_regulation.standards.length > 0) {
      parts.push(`自我要求：${dims.self_regulation.standards.join('、')}`);
    }
    
    // 边界模式
    if (dims.boundary_pattern.triggers.length > 0) {
      parts.push(`边界触发：${dims.boundary_pattern.triggers.join('、')}`);
    }
    
    // 待人处事风格
    if (dims.interpersonal_style.core_traits.length > 0) {
      parts.push(`处事风格：${dims.interpersonal_style.core_traits.join('、')}`);
    }
    
    // 眼光视角
    if (dims.perspective.worldview) {
      parts.push(`世界观：${dims.perspective.worldview}`);
    }
    
    // 内心活动模式
    if (dims.inner_activity.inner_monologue_style) {
      parts.push(`内心模式：${dims.inner_activity.inner_monologue_style}`);
    }
    
    // 道德判断
    if (dims.moral_judgment.principles.length > 0) {
      parts.push(`道德原则：${dims.moral_judgment.principles.join('、')}`);
    }
    
    // 品质特质
    if (dims.quality_traits.traits.length > 0) {
      parts.push(`稳定特质：${dims.quality_traits.traits.join('、')}`);
    }
    
    return parts.join('\n');
  }

  /**
   * 生成价值卡片对（用于冷启动游戏）
   */
  static generateValueCardPairs() {
    const { VALUE_CARDS } = require('./design-spec');
    
    // 生成所有可能的配对
    const pairs = [];
    for (let i = 0; i < VALUE_CARDS.length; i++) {
      for (let j = i + 1; j < VALUE_CARDS.length; j++) {
        pairs.push({
          A: VALUE_CARDS[i],
          B: VALUE_CARDS[j]
        });
      }
    }
    
    // 随机选择15-20对
    const shuffled = pairs.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(20, shuffled.length));
  }
}

module.exports = {
  CorePersonaLayer,
  CORE_DIMENSIONS,
  WEIGHING_FACTORS,
  DIMENSION_TO_CAU
};
