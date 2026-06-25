# CAPS 动力系统 × 数字方舟五层人格架构

> 理论来源：Mischel & Shoda (1995) 认知-情感处理系统（CAPS）  
> 产品定位：人格不是静态分数，而是「情境 → 网状加工 → 行为签名」的动力系统

---

## 一、总览：三层结构如何落在五层架构上

```
┌─────────────────────────────────────────────────────────────┐
│  输出层：行为签名（If…Then…） + 表达层（怎么说）              │
├─────────────────────────────────────────────────────────────┤
│  加工层：五大 CAU 网状单元 + 可及性 + 传播路径                │
│          （核心层 8 维 = 可采集、可沉淀的投影）               │
├─────────────────────────────────────────────────────────────┤
│  输入层：情境标签 ← 关系层 + 记忆层先例 + 情绪层 PAD + 用户文本 │
└─────────────────────────────────────────────────────────────┘
```

| CAPS 概念 | 数字方舟落点 | 模块 |
|-----------|--------------|------|
| **输入（情境）** | 关系深度、对话文本、事件性质、先例记忆标签 | `relationship-store`、`memory`、`caps-engine.parseSituation` |
| **编码策略** | 眼光视角、内心活动、边界触发解读 | `perspective`、`inner_activity`、`boundary_pattern` |
| **预期与信念** | 自我规范、道德判断、人际预期 | `self_regulation`、`moral_judgment`、`interpersonal_style` |
| **情感与感受** | PAD 实时状态 + 情绪节奏 | `cognitive/pad.js`、情绪层 |
| **目标与价值观** | 价值优先级、品质特质、道德原则 | `value_priority`、`quality_traits` |
| **能力与自我调节** | 压力应对、边界反应方式、表达技能 | `self_regulation`、`boundary_pattern`、表达层 |
| **可及性** | 某 CAU 被点亮的难易度 | `core_persona.json` → `caps.accessibility` |
| **网状连接** | 单元 A 激活 → 单元 B | `caps-engine` 默认边 + `caps.custom_edges` |
| **行为签名** | 稳定的 If-Then 输出 | `caps.signatures` + 维度合成默认 |

---

## 二、五大 CAU 与核心层八维对照

| CAU（加工单元） | 核心层维度（采集投影） | 采集方式示例 |
|----------------|------------------------|--------------|
| 编码策略 | 眼光视角、内心活动、边界模式 | 碎片感受、第一反应、边界卡片 |
| 预期与信念 | 自我规范、道德判断、待人处事 | 冲突场景二选一、道德直觉题 |
| 情感与感受 | （情绪层 PAD）+ 品质特质强度 | 情绪练习、PAD 推断 |
| 目标与价值观 | 价值优先级、品质特质 | 价值卡片游戏 |
| 能力与自我调节 | 自我规范、边界反应、表达层 | 压力场景、音色/话术训练 |

**要点**：八维不是五类 CAU 的替代品，而是**面向用户可填写、可校准**的投影；运行时由 `caps-engine.js` 做网状加工。

---

## 三、动态三特征在工程中的对应

### 1. 网状互动（非孤立分数）

`DEFAULT_EDGES` 定义默认传播，例如：

```
编码策略 → 情感与感受 → 预期与信念 → 目标与价值观 → 能力与自我调节
```

`propagate()` 多轮扩散激活强度；传播路径写入 Prompt 的「激活路径」。

### 2. 可及性（Accessibility）

- 存储：`caps.accessibility`（可手动/API 调整）
- 推导：`deriveAccessibility()` 从边界强度、内外差异、价值条目数等估算
- 效果：同一情境下，高可及「情感」单元的人更快进入愤怒/羞耻链

### 3. If-Then 行为签名

- **学习签名**：`POST /persona/caps/signature` 或校准时带 `if_tags` + `expected_behavior`
- **默认签名**：无记录时由边界模式、待人风格、价值排序合成（解释「同分不同人」）

示例（文档中的张三 vs 李四）在产品中的表达：

```json
{
  "if": { "tags": ["peer_challenge"] },
  "then": {
    "behavior": "必须反击",
    "output_hint": "语气变硬、短句回击",
    "cau_path": ["encodings", "affects", "expectancies", "competencies"]
  }
}
```

```json
{
  "if": { "tags": ["authority_present"] },
  "then": {
    "behavior": "顺从权威",
    "output_hint": "缩短表态、避免对抗"
  }
}
```

两人「攻击性特质分」可相同，但签名库不同 → 输出不同。

---

## 四、与原有「权衡算法」的关系

```
最终维度权重 = normalize(
  computeWeights(关系、情绪、事件、先例)   // 原核心层权衡
  + cauToDimensionAdjustments(CAU激活)      // CAPS 网状加工微调
)
```

- **原算法**：回答「这轮对话更该听哪几个核心维」
- **CAPS**：回答「内部加工路径是什么、稳定行为签名是什么」
- **Prompt**：同时注入 `corePersonaSummary`（稳定结构）+ `capsContext`（本轮动力加工）

---

## 五、五层架构中的数据流（升级后）

```
用户输入
  ├─ 关系层 → relationship_depth
  ├─ 情绪层 → emotion_valence (PAD.P)
  ├─ 记忆层 → precedent_memory.tags（规划）
  └─ 文本   → situation.tags
        ↓
  corePersona.processCAPS()
        ↓
  behavior_signature + dimension_weights + prompt_block
        ↓
  buildDigitalTwinPrompt（+ 认知管线 behaviorHint）
        ↓
  表达层输出
```

---

## 六、API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/persona/caps/process` | 单次情境 CAPS 加工（调试） |
| GET | `/persona/caps` | 可及性、签名列表、维度-CAU 映射 |
| POST | `/persona/caps/signature` | 新增 If-Then 行为签名 |
| POST | `/persona/core/calibrate` | 支持 `if_tags` + `expected_behavior` 沉淀签名 |

---

## 七、工程闭合状态

| 项 | 状态 | 实现 |
|----|------|------|
| 记忆层 → 先例 | ✅ | `lib/memory-influence.js` → `runPersonaCapsPipeline()` |
| 沉淀态 + 重复路径 | ✅ | `lib/caps-sediment.js` + `POST /persona/memory/sediment` |
| 试聊 CAPS 可视化 | ✅ | 响应 `caps` 字段 + `DA.renderCapsPanel()` |
| 五层拟合度纳入 CAPS | ✅ | `lib/persona-progress.js` + `GET /training/progress` |

验证：`node digital-ark/scripts/verify-caps-closure.js`

---

## 八、对外一句话

数字方舟的人格核心 = **CAPS 动力系统（加工机制）** + **五层架构（采集与表达分工）** + **核心层八维（可运行、可校准的个体参数）**。  
我们不问「外向几分」，而记录「若被同伴挑衅则倾向化解，若被权威警告则倾向顺从」——这才是 Mischel 意义上的动力系统。
