# 数字方舟 - 五层人格架构映射文档

## 一、架构演进概述

### 旧架构：五个独立训练模块
```
音色训练 / 记忆训练 / 关系训练 / 情感训练 / 认知训练
```

### 新架构：五层递进人格结构 + CAPS 动力系统
```
输入（关系/记忆/情境文本/情绪）
    ↓
核心层 CAPS 加工（五大 CAU 网状单元 → If-Then 行为签名）
    ↓
表达层输出
```

五层仍负责**采集与分工**；**Mischel-Shoda CAPS** 负责**运行时加工机理**（见 `docs/caps-integration.md`、`lib/caps-engine.js`）。

### 映射原则
1. **核心层**：整合认知训练的部分内容，新增价值优先级、自我规范、边界模式等维度
2. **情绪层**：改造情感训练，从"训练情感反应"变为"提取真实情绪模式"
3. **记忆层**：保留记忆系统，新增"沉淀态"概念
4. **关系层**：改造关系训练，新增亲密程度、信任度、历史事件
5. **表达层**：整合音色训练，新增从聊天记录提取表达习惯

---

## 二、各层详细映射

### 2.1 核心层（新增）

**来源模块**：
- 认知训练（价值观排序、冲突决策）
- 情感训练（压力反应、安慰方式）
- 关系训练（待人处事风格）

**新增内容**：
- 价值优先级（冲突时选什么）
- 自我规范（对自己的要求）
- 边界模式（什么触碰到你有稳定反应）
- 眼光视角（你看世界的角度）
- 内心活动模式（外部反应之下真正在想什么）
- 道德判断（你的是非标准）
- 品质特质（你身上稳定的东西）

**数据结构**：
```javascript
{
  dimensions: {
    value_priority: {
      ranked_values: ['家庭', '事业', '自由'],
      conflict_resolution: 'principled'
    },
    self_regulation: {
      standards: ['自律', '上进'],
      stress_coping: 'rational'
    },
    boundary_pattern: {
      triggers: ['隐私边界', '原则底线'],
      reaction_style: 'withdraw',
      boundary_strength: 0.7
    },
    interpersonal_style: {
      core_traits: ['温柔', '直接'],
      relationship_modes: { ... }
    },
    perspective: {
      worldview: 'realistic',
      focus_preferences: ['人际关系', '逻辑系统']
    },
    inner_activity: {
      inner_monologue_style: '自我对话型',
      inner_outer_gap: 0.3
    },
    moral_judgment: {
      principles: ['诚实', '公正'],
      moral_priority: 'fairness'
    },
    quality_traits: {
      traits: ['坚韧', '同理心'],
      trait_intensity: { '坚韧': 0.8, '同理心': 0.7 }
    }
  }
}
```

**权衡算法 + CAPS**：
```javascript
// 1) 情境输入（CAPS 输入层）
situation = parseSituation({ user_text, relationship_depth, emotion_valence, precedent_memory })

// 2) 网状加工（五大 CAU：编码/预期/情感/目标/能力）
{ activation, propagation_path, behavior_signature } = CAPSEngine.process(...)

// 3) 维度权重 = 原权衡 + CAU 激活微调
weights = normalize(computeWeights(context) + cauToDimensionAdjustments(activation))
```

**核心层八维 ↔ CAPS 五类 CAU**（采集投影）：

| CAU | 核心层维度 |
|-----|------------|
| 编码策略 | 眼光视角、内心活动、边界模式 |
| 预期与信念 | 自我规范、道德判断、待人处事 |
| 情感与感受 | 情绪层 PAD + 品质特质 |
| 目标与价值观 | 价值优先级、品质特质 |
| 能力与自我调节 | 自我规范、边界反应、表达层 |

**行为签名**：`caps.signatures[]` 存储 If-Then；对话时 `processCAPS()` 匹配或按维度合成。

---

### 2.2 情绪层（改造）

**来源模块**：
- 情感训练（情绪回应练习）
- PAD情感状态系统

**改造方向**：
- 保留PAD框架（愉悦、唤醒、支配）
- 强调"真实情绪节奏"而非"表演情绪"
- 情绪状态影响核心层权衡和表达方式

**数据结构**：
```javascript
{
  pad_state: {
    P: 0.7,      // 愉悦度 [-1, 1]
    A: 0.5,      // 唤醒度 [0, 1]
    D: 0.6,      // 支配度 [0, 1]
    S: 0.8       // 关系强度 [0, 1]
  },
  emotion_rhythm: {
    baseline: { P: -0.1, A: 0.2, D: 0.6 },  // 基线状态
    volatility: 0.3,                          // 情绪波动性
    recovery_rate: 0.5                        // 情绪恢复速度
  },
  real_patterns: {  // 从真人数据提取的情绪模式
    stress_response: 'rational',
    joy_expression: 'subtle',
    sadness_pattern: 'withdraw'
  }
}
```

**与核心层的关系**：
- 情绪状态作为核心层权衡的输入变量
- 核心层决策影响情绪表达方式

---

### 2.3 记忆层（改造）

**来源模块**：
- 记忆训练
- 记忆系统（MemorySystem）
- 个人记忆（PersonalMemoryStore）

**改造方向**：
- 新增"沉淀态"概念：已内化进核心层的经历
- 保留"活态"概念：以事件形式存在的记忆
- 活态记忆影响判断的三步机制

**数据结构**：
```javascript
{
  // 活态记忆（现有系统）
  active_memories: [
    {
      id: 'mem_001',
      content: '用户分享了童年记忆',
      emotion: 'nostalgic',
      importance: 0.8,
      timestamp: 1777516439948
    }
  ],
  
  // 沉淀态记忆（新增）
  sediment_memories: [
    {
      id: 'sed_001',
      pattern: '被忽视时会感到受伤',
      origin_memories: ['mem_001', 'mem_005'],  // 来源记忆
      core_dimension: 'boundary_pattern',        // 沉淀到的核心层维度
      confidence: 0.8,
      sediment_date: 1777516439948
    }
  ],
  
  // 记忆影响机制
  influence_mechanism: {
    similarity_matching: true,    // 情境结构相似性匹配
    emotion_residue: true,        // 情绪残留注入
    outcome_correction: true      // 根据当时结果修正权衡
  }
}
```

**记忆影响判断的三步**：
1. **情境结构相似性匹配**：不只是关键词，而是结构相似
2. **提取情绪残留**：将那条记忆的情绪注入当前情绪层
3. **结果修正**：根据当时结果好坏，修正这次的权衡方向

---

### 2.4 关系层（改造）

**来源模块**：
- 关系训练
- 关系存储（RelationshipStore）

**改造方向**：
- 记录与对话者的状态：亲密程度、信任度、历史事件
- 作为核心层动态权衡的输入变量

**数据结构**：
```javascript
{
  relationships: {
    'user_001': {
      intimacy_level: 0.7,      // 亲密程度 0-1
      trust_score: 0.8,         // 信任度 0-1
      history_events: [         // 历史事件
        {
          event: '深夜崩溃时陪伴',
          impact: 'positive',
          timestamp: 1777516439948
        }
      ],
      relationship_type: 'intimate',  // stranger/acquaintance/friend/intimate
      interaction_count: 150,
      last_interaction: 1777516439948
    }
  }
}
```

**与核心层的关系**：
- 关系深度作为核心层权衡的输入变量
- 核心层决策影响关系互动方式

---

### 2.5 表达层（改造）

**来源模块**：
- 音色训练
- 语音分析（VoiceAnalyzer）

**改造方向**：
- 保留音色训练
- 新增从聊天记录提取表达习惯

**数据结构**：
```javascript
{
  // 音色特征（现有）
  voice_features: {
    pitch: 0.6,
    speed: 0.5,
    tone: 'warm'
  },
  
  // 表达习惯（新增）
  expression_patterns: {
    sentence_habits: ['喜欢用省略号', '经常反问'],      // 句式习惯
    verbal_tics: ['嗯...', '怎么说呢'],                 // 口头禅
    tone_style: '温和但直接',                           // 语气
    emotion_expression: {                               // 表达情绪的方式
      joy: '微笑',
      sadness: '沉默',
      anger: '冷淡'
    },
    humor_style: '自嘲'                                 // 玩梗方式
  },
  
  // 场景区分
  context_styles: {
    intimate: { tone: '温柔', distance: '近' },
    stranger: { tone: '礼貌', distance: '远' }
  }
}
```

**表达层提取来源**：
1. **导入聊天记录**：用户上传微信/QQ等聊天记录，系统自动提取表达习惯
2. **对话中学习**：在与数字人对话过程中，系统实时学习用户的表达方式

---

## 三、数据流整合

### 3.1 对话请求处理流程

```
用户输入
    ↓
[关系/记忆/文本] 构建情境标签
    ↓
[核心层] processCAPS()：CAU 网状加工 + 行为签名 + 权衡权重
    ↓
[情绪层] 更新PAD状态，注入情绪上下文
    ↓
[记忆层] 检索相关记忆，提取情绪残留
    ↓
[关系层] 获取关系状态，调整互动方式
    ↓
[表达层] 选择表达风格，应用表达习惯
    ↓
构建Prompt
    ↓
调用Ollama生成回复
    ↓
返回回复 + 状态副作用
```

### 3.2 Prompt构建整合

```javascript
function buildDigitalTwinPrompt(ctx) {
  const {
    corePersona,      // 核心层摘要
    padDesc,          // 情绪层描述
    memoryContext,    // 记忆层上下文
    relationshipHint, // 关系层提示
    expressionStyle,  // 表达层风格
    // ... 其他参数
  } = ctx;
  
  return `
你是${name}的数字分身。

【核心人格】
${corePersona}

【当前情绪状态】
${padDesc}

【相关记忆】
${memoryContext}

【关系状态】
${relationshipHint}

【表达风格】
${expressionStyle}

【回复要求】
- 永远第一人称，自然、有温度
- 保持${name}的语气和人格
- ...
`;
}
```

---

## 四、采集流程设计

### 4.1 冷启动阶段

**价值卡片游戏**：
1. 系统生成10-15对价值卡片
2. 用户在两张卡片中选择更认同的一个
3. 系统根据选择构建初始价值优先级
4. 反应时间用于判断选择的确定性

**导入现有数据**：
1. 用户上传聊天记录（微信/QQ等）
2. 系统自动提取表达层参数
3. 同时提取核心层特征（价值、边界、风格等）

### 4.2 日常积累阶段

**随手记录入口**：
- 随时输入一句感受、一个念头
- 系统在当下追问一两句，加厚质感
- 碎片积累够多，脉络自然浮现

**自然对话中提取**：
- 系统从对话中提取核心层特征
- 自动更新相关维度

### 4.3 校准阶段

**数字人反应 → 用户反馈**：
1. 数字人给出反应
2. 用户说"像"或"不像"
3. 不像的地方解释为什么
4. 纠错记录成为核心层的修正依据

---

## 五、API接口映射

### 5.1 核心层接口

```
GET    /persona/core              # 获取核心层状态
PUT    /persona/core/:dimension   # 更新特定维度
POST   /persona/core/card-game    # 提交价值卡片选择
POST   /persona/core/calibrate    # 提交校准反馈
GET    /persona/core/summary      # 获取核心层摘要
```

### 5.2 情绪层接口

```
GET    /persona/emotion           # 获取情绪状态
POST   /persona/emotion/extract   # 从对话提取情绪模式
```

### 5.3 记忆层接口

```
GET    /persona/memory            # 获取记忆（活态+沉淀态）
POST   /persona/memory/sediment   # 将记忆沉淀为核心层
```

### 5.4 关系层接口

```
GET    /persona/relationship      # 获取关系状态
POST   /persona/relationship      # 更新关系状态
```

### 5.5 表达层接口

```
GET    /persona/expression        # 获取表达习惯
POST   /persona/expression/import # 导入聊天记录提取表达习惯
POST   /persona/expression/learn  # 从对话学习表达习惯
```

---

## 六、进度计算整合

### 6.1 各层进度

```javascript
{
  core: {
    completeness: 0.65,      // 核心层完整度
    confidence: 0.7,         // 核心层置信度
    card_game_completed: true,
    dimensions_covered: 6    // 已覆盖的维度数
  },
  emotion: {
    patterns_extracted: 5,   // 已提取的情绪模式数
    rhythm_stability: 0.8    // 情绪节奏稳定性
  },
  memory: {
    active_count: 150,       // 活态记忆数
    sediment_count: 5,       // 沉淀态记忆数
    detail_quality: 0.7      // 记忆细节质量
  },
  relationship: {
    people_count: 3,         // 关系数
    average_intimacy: 0.6    // 平均亲密程度
  },
  expression: {
    voice_similarity: 0.85,  // 音色相似度
    patterns_extracted: 10,  // 已提取的表达习惯数
    context_styles: 2        // 已区分的场景风格数
  }
}
```

### 6.2 总体人格拟合度（已实现）

实现：`lib/persona-progress.js` → `GET /training/progress`

```javascript
personality_fit = (
  layers.core * 0.35 +
  layers.emotion * 0.15 +
  layers.memory * 0.20 +
  layers.relationship * 0.15 +
  layers.expression * 0.15
)
```

各层分数融合：核心层 metadata/CAPS 签名、情绪/记忆/关系/表达训练进度与实测计数。  
训练页 `module-row` 的百分比显示对应层进度（voice→表达层，cognition→核心层）。
