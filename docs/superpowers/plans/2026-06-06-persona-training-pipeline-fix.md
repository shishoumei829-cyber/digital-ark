# 数字分身训练闭环修复 · 全面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通「答题采集 → 核心层结构化 → LoRA 语料 → 权重微调 → Ollama 对话切换」全链路，修复进度虚高与核心层空转，使分身从「prompt 扮演」升级为「数据驱动 + 可选权重内化」。

**Architecture:** 在现有五层架构上不推翻重做。新增 `training-ingest` 桥接层，把五模块提交同步写入 `core-persona`、增量 LoRA 语料与 RAG；进度公式改为「模块完成度」与「层质量」双轨；微调子系统用 job 状态机管理 export → train → merge → ollama create → 切换 `active_chat_model.json`。

**Tech Stack:** Node.js (Express)、Ollama API、Python (transformers/peft/trl)、现有 `core-persona.js` / `persona-progress.js` / `export-lora-corpus.js`

**预估工期:** 3 个阶段约 5–8 个工作日（含 GPU 环境联调）

---

## 问题清单 → 任务映射

| # | 问题 | 计划任务 |
|---|------|----------|
| 1 | 题库训练不改 Ollama 权重 | Phase 3：LoRA + merge + 自动切换模型 |
| 2 | 认知题不写入核心层 | Phase 1：Task 1–2 |
| 3 | 情绪/关系/记忆未结构化进核心层 | Phase 1：Task 3–4 |
| 4 | 进度条虚高（模块 100% / 核心 20%） | Phase 2：Task 5–6 |
| 5 | LoRA 语料缺认知/实时增量 | Phase 3：Task 7–8 |
| 6 | LoRA adapter 未挂接 Ollama | Phase 3：Task 9–11 |
| 7 | `/fine-tune/run` 缺失 | Phase 3：Task 10–12 |
| 8 | RAG 仅 5 条、无分层 | Phase 4：Task 13 |
| 9 | 全量训练无试聊验收 | Phase 5：Task 14–15 |
| 10 | 文档与产品状态过时 | Phase 5：Task 16 |

---

## 文件结构（新增/修改一览）

| 文件 | 职责 |
|------|------|
| `lib/training-ingest.js` | **新建** — 五模块提交 → core-persona / corpus / changelog 统一入口 |
| `lib/cognition-extractor.js` | **新建** — 认知题选项 → value_priority / moral_judgment 等维度映射 |
| `lib/finetune-corpus.js` | **新建** — 增量 append JSONL、去重、计数 |
| `lib/finetune-runner.js` | **新建** — 微调 job 状态机、子进程调度 |
| `lib/persona-progress.js` | 修改 — 双轨进度、核心层门槛 |
| `lib/training.js` | 修改 — 降速/封顶 module progress，回调 ingest |
| `lib/rag.js` | 修改 — 可配置 topK、分层检索 |
| `server.js` | 修改 — 训练 API 接 ingest；`/fine-tune/run`；动态 chat model |
| `scripts/merge-lora-ollama.py` | **新建** — merge adapter + 导出 GGUF 或生成 Ollama 可用包 |
| `scripts/create-ollama-model.js` | 修改 — 读取 merge manifest、支持 merged 权重 |
| `scripts/export-lora-corpus.js` | 修改 — 含 cognition 会话、core 摘要 |
| `scripts/alisa-user-full-training.js` | 修改 — 训练后自动跑试聊探针 |
| `tests/training-ingest.test.js` | **新建** |
| `tests/finetune-runner.test.js` | **新建** |
| `docs/FINETUNE_PIPELINE.md` | **新建** — 用户操作指南 |
| `docs/HOME_TRAINING_PLAN.md` | 更新 P3 状态 |

---

## Phase 1 · 训练数据 → 核心层（P0，必须先做）

> 核心层权重 35%，当前 dimensions_covered=0 是最大瓶颈。

### Task 1: 认知选项 → 核心层映射器

**Files:**
- Create: `lib/cognition-extractor.js`
- Test: `tests/training-ingest.test.js`

- [ ] **Step 1: 写失败测试**

```javascript
// tests/training-ingest.test.js
const { extractCognitionUpdates } = require('../lib/cognition-extractor');

test('maps value choice to value_priority', () => {
  const u = extractCognitionUpdates({
    question: '朋友借钱不还，你会？',
    choice: '先讲道理，再给一次机会',
    options: ['直接绝交', '先讲道理，再给一次机会', '装作不知道']
  });
  expect(u.value_priority?.ranked_values).toContain('诚实');
});
```

- [ ] **Step 2: 运行测试确认 FAIL**

Run: `npm test -- tests/training-ingest.test.js`
Expected: FAIL

- [ ] **Step 3: 实现 `cognition-extractor.js`**

规则：
- 从 `task.question` + `choice` 提取关键词映射到 `VALUE_CARDS`（`design-spec.js`）
- `conflict_choices` 累积 → `value_priority.conflict_resolution`（majority vote）
- 边界类题 → `boundary_pattern.triggers`
- 道德类题 → `moral_judgment.principles`
- 待人风格题 → `interpersonal_style.core_traits`
- 返回 `{ dimensionKey: updates }[]`，不直接写盘

- [ ] **Step 4: 测试 PASS**

- [ ] **Step 5: Commit** `feat: cognition choice → core dimension extractor`

---

### Task 2: 训练提交统一 ingest 桥接

**Files:**
- Create: `lib/training-ingest.js`
- Modify: `server.js`（`/training/cognition`, `/training/home/submit`, `/training/emotion`, `/training/relationship`, `/training/memory`）
- Modify: `lib/training.js` — `processCognitionTraining` 返回 `cognitiveProfile` 供 ingest 使用

- [ ] **Step 1: 定义 `TrainingIngestor` 类**

```javascript
class TrainingIngestor {
  constructor({ corePersona, finetuneCorpus, recordTwinChange }) {}
  ingestCognition({ task, choice, valuesRanking, conflictChoices }) {}
  ingestEmotion({ scenario, response, stressReaction, comfortStyle }) {}
  ingestRelationship({ scene, responseText, responseType }) {}
  ingestMemory({ content, tier, tags }) {}
}
```

`ingestCognition` 流程：
1. `cognition-extractor` 得 updates
2. 对每个 dimension 调用 `corePersona.updateDimension(key, updates, 'training_cognition')`
3. 若 `valuesRanking.length >= 3`，合并进 `value_priority.ranked_values`（去重保序）
4. `recordTwinChange({ source:'training', module:'cognition', ... })`

- [ ] **Step 2: 修改 `server.js` 认知端点**

`/training/cognition` 与 `home/submit cognition` 在 `processCognitionTraining` 后调用 `trainingIngestor.ingestCognition`，传入完整 `task`（从 `findGuideTaskRaw` 取）。

主页认知不再传空 `valuesRanking`；若用户只选选项，从 `task.options[choice_index]` 解析。

- [ ] **Step 3: 写集成测试**

用临时 `DATA_DIR` POST `/training/cognition` ×3，GET `/persona/core` 断言 `dimensions_covered >= 1`。

- [ ] **Step 4: Commit** `feat: wire cognition training into core-persona`

---

### Task 3: 情绪/关系训练 → 核心层

**Files:**
- Modify: `lib/training-ingest.js`
- Modify: `server.js` emotion/relationship 端点

- [ ] **Step 1: `ingestEmotion`**

- `stress_reaction` → `self_regulation.stress_coping`
- `comfort_style` → `interpersonal_style.relationship_modes` 默认模式
- `response` 文本 → 调用已有 `corePersona.extractFromConversation(scenario, response)` 并 `_applyExtractions`

- [ ] **Step 2: `ingestRelationship`**

- `response_type` + `response_text` → `interpersonal_style.core_traits`（模式词表：嘴硬/温柔/直接…）
- 高亲密场景 → `boundary_pattern.reaction_style` 微调

- [ ] **Step 3: 测试** — 提交 emotion + relationship 后 `boundary_pattern.triggers` 或 `interpersonal_style.core_traits` 非空

- [ ] **Step 4: Commit** `feat: emotion and relationship feed core-persona`

---

### Task 4: 记忆沉淀 → 核心规则（CAPS sediment 激活）

**Files:**
- Modify: `lib/training-ingest.js`
- Modify: `lib/memory-influence.js` 或 `server.js` memory 端点

- [ ] **Step 1: 记忆 tier=core 或 tags 含「价值观/原则」时**

调用 `corePersona.updateDimension` 相应字段；并 `capsSediment.checkAndSediment` 与记忆关联。

- [ ] **Step 2: 重复记忆（相似度>0.85）触发 `quality_traits.traits` 追加**

- [ ] **Step 3: 测试** — 写入 3 条带「原则」标签的记忆后 `moral_judgment.principles.length >= 1`

- [ ] **Step 4: Commit** `feat: core-tier memories sediment into core-persona`

---

### Task 5: 价值卡片游戏与训练引导联动

**Files:**
- Modify: `lib/training-dashboard.js`
- Modify: `public/js/apps-bridge.js` 或 `profile-center.js`
- Modify: `lib/training-guide.js` — 核心层 <30% 时插入「价值卡片」引导任务

- [ ] **Step 1: dashboard 增加 `core_layer_blocked: true` 当 `dimensions_covered < 2 && !card_game_completed`**

- [ ] **Step 2: 主页/训练 Tab 显示强制引导卡片：「完成价值排序游戏以解锁核心层」**

- [ ] **Step 3: 完成 `POST /persona/core/complete-card-game` 后刷新进度，核心层应 ≥35%**

- [ ] **Step 4: Commit** `feat: surface value card game when core layer empty`

---

## Phase 2 · 进度公式诚实化（P0）

### Task 6: 双轨进度模型

**Files:**
- Modify: `lib/persona-progress.js`
- Modify: `lib/design-spec.js` — 新增 `MODULE_PROGRESS_CAP = 0.6`（模块计数最多贡献层分数 60%）

- [ ] **Step 1: 修改 `computeLayerScores` 中各层公式**

示例（核心层）：
```javascript
const moduleProxy = (tp.cognition || 0) * 0.2; // 原 0.2 保留但封顶
const moduleCapped = Math.min(MODULE_PROGRESS_CAP * 0.33, moduleProxy);
const core = clamp(
  (meta.completeness || 0) * 0.45 +  // 提高 completeness 权重
  (meta.confidence || 0) * 0.15 +
  (meta.card_game_completed ? 0.15 : 0) +
  Math.min(0.15, dimCovered / 8 * 0.15) +
  Math.min(0.05, sigCount * 0.01) +
  moduleCapped
);
```

表达层：
```javascript
// voice_similarity 无真实录音时最高 0.5
const voiceSimCapped = ctx.voiceMinutes >= 5 ? voiceSim : Math.min(voiceSim, 0.5);
```

- [ ] **Step 2: 返回新字段 `progress_model: 'five_layer_v2'`，`module_completion` 与 `layer_quality` 分开展示**

- [ ] **Step 3: 更新 `scripts/verify-persona-progress.js` 断言**

- [ ] **Step 4: 更新 UI `apps-bridge.js` dashboard — 显示「题库完成 X% · 层质量 Y%」**

- [ ] **Step 5: Commit** `fix: honest dual-track personality fit scoring`

---

### Task 7: 模块进度增速降级

**Files:**
- Modify: `lib/training.js`

- [ ] **Step 1: 每次提交增量改为 `0.01`，且当 `training_progress[module] >= 0.6` 后改为 `0.005`**

- [ ] **Step 2: `getProgress` 中 `voice_minutes` 从 `VoiceAnalyzer` 真实统计读取（非模拟 audio）**

- [ ] **Step 3: 模拟音频 `audio_features.simulated` 不计入 voice similarity**

- [ ] **Step 4: Commit** `fix: slow module progress inflation and ignore simulated voice`

---

## Phase 3 · LoRA 全链路（P1）

### Task 8: 增量 LoRA 语料

**Files:**
- Create: `lib/finetune-corpus.js`
- Modify: `lib/training-ingest.js` — 每次 ingest 后 `appendRow`
- Modify: `scripts/export-lora-corpus.js` — 导出 cognition 行

- [ ] **Step 1: `FinetuneCorpusStore`**

路径：`{DATA_DIR}/finetune/user.jsonl` + `user.meta.json`
方法：`append({ instruction, input, output, source, task_id })`，按 `task_id+input` 去重。

- [ ] **Step 2: 训练 ingest 时为每类生成 Alpaca 行**

| 模块 | input | output |
|------|-------|--------|
| cognition | task.question | choice |
| emotion | scenario | response |
| relationship | scene | response_text |
| memory | 「分享记忆」 | content |
| feedback | user | correction/preferred_reply |

- [ ] **Step 3: `export-lora-corpus.js` 合并 incremental + bundle， cognition sessions 补漏**

- [ ] **Step 4: 测试** — 提交 5 题后 `finetune/user.jsonl` rows >= 5

- [ ] **Step 5: Commit** `feat: incremental finetune corpus on each training submit`

---

### Task 9: LoRA merge → Ollama 可用模型

**Files:**
- Create: `scripts/merge-lora-ollama.py`
- Modify: `scripts/train-lora.py` — manifest 更新 next_step
- Modify: `requirements-finetune.txt` — 添加 `gguf` 相关依赖说明

- [ ] **Step 1: `merge-lora-ollama.py` 实现**

流程：
1. 加载 base model + adapter（`peft`）
2. `merge_and_unload()`
3. 保存 merged HF 到 `{DATA_DIR}/finetune/merged/{persona}/`
4. 尝试调用 `llama.cpp` 的 `convert_hf_to_gguf.py`（若存在）→ `{persona}.gguf`
5. 写 `merge_manifest.json`：`{ merged_dir, gguf_path, base_model, samples }`

降级路径（无 llama.cpp）：仅保存 merged HF，文档说明用 `ollama create` + 外部转换。

- [ ] **Step 2: 修改 `create-ollama-model.js`**

```javascript
// 若 merge_manifest.json 存在且 gguf_path 有效：
// Modelfile: FROM ./relative.gguf
// 否则：FROM ${baseModel} + SYSTEM（现有逻辑）
```

- [ ] **Step 3: 本地手工验证**

```bash
npm run train          # export
npm run train:lora     # 需 GPU
python scripts/merge-lora-ollama.py --persona user
node scripts/create-ollama-model.js --persona user
ollama run digital-ark-user "你好"
```

- [ ] **Step 4: Commit** `feat: merge LoRA adapter for Ollama deployment`

---

### Task 10: 微调 Job 状态机

**Files:**
- Create: `lib/finetune-runner.js`
- Modify: `server.js`

- [ ] **Step 1: Job 数据结构 `{ id, status, steps[], error, started_at, finished_at }`**

状态：`idle | exporting | training | merging | creating_ollama | done | failed`

持久化：`{DATA_DIR}/finetune/jobs/{id}.json`

- [ ] **Step 2: `FinetuneRunner.start(personaId)` 顺序执行**

1. `exportCorpus`
2. `spawn python train-lora.py`（检测 CUDA，无则 `status=failed` + 提示用 Modelfile）
3. `spawn python merge-lora-ollama.py`
4. `spawn node create-ollama-model.js`
5. 写 `{DATA_DIR}/active_chat_model.json`：`{ model: 'digital-ark-user', updated_at, job_id }`

- [ ] **Step 3: API**

```
POST /fine-tune/run     { persona_id?: 'user' }  → { job_id }
GET  /fine-tune/job/:id → job 状态
GET  /fine-tune/status  → 增强：last_job, active_model, corpus_rows
```

- [ ] **Step 4: `server.js` 启动时读取 `active_chat_model.json` 覆盖 `CHAT_MODEL`**

- [ ] **Step 5: Commit** `feat: fine-tune job runner and active model switching`

---

### Task 11: 训练端 UI — 一键微调入口

**Files:**
- Modify: `public/js/profile-center.js` 或 `apps-bridge.js`
- Modify: `public/js/api-core.js`

- [ ] **Step 1: 「我的」页增加「导出语料 / 开始微调 / 查看任务」**

- [ ] **Step 2: 轮询 `/fine-tune/job/:id` 显示步骤进度条**

- [ ] **Step 3: 完成后 Toast：「分身模型已切换为 digital-ark-user」**

- [ ] **Step 4: Commit** `feat: fine-tune UI in profile center`

---

## Phase 4 · RAG 与对话质量（P1）

### Task 12: 分层检索增强

**Files:**
- Modify: `lib/rag.js`
- Modify: `server.js` `buildFullPrompt`

- [ ] **Step 1: 环境变量 `RAG_TOP_K=8`，`RAG_TOP_K_CORE=3`**

- [ ] **Step 2: `ragStore.search(query, k, { types })` 支持按 metadata.type 过滤**

- [ ] **Step 3: `buildFullPrompt` 分桶检索**

```javascript
const memHits = await ragStore.search(userQuery, 3, { types: ['memory'] });
const relHits = await ragStore.search(userQuery, 2, { types: ['relationship', 'emotion'] });
const cogHits = await ragStore.search(userQuery, 2, { types: ['cognition'] });
```

- [ ] **Step 4: 测试** — 记忆类 query 返回 memory type 占比提高

- [ ] **Step 5: Commit** `feat: tiered RAG retrieval for chat prompt`

---

### Task 13: 对话 prompt 与微调模型协同

**Files:**
- Modify: `server.js` `buildFullPrompt` / `generateReply`

- [ ] **Step 1: 若 `active_chat_model` 来自 LoRA merge（manifest 标记 `weights_personalized: true`）**

缩短 system prompt：省略已在权重内化的 `speech_patterns` / `verbal_tics` 长列表，保留动态 PAD/RAG/记忆。

- [ ] **Step 2: 记录 `reply_meta: { prompt_tokens_estimate, rag_hits, core_dims_used }` 供调试**

- [ ] **Step 3: Commit** `feat: adaptive prompt length when personalized model active`

---

## Phase 5 · 验收与文档（P1）

### Task 14: 自动化验收脚本升级

**Files:**
- Modify: `scripts/alisa-user-full-training.js`
- Modify: `scripts/train-and-eval-alisa.js`
- Create: `scripts/verify-training-pipeline.js`

- [ ] **Step 1: 全量训练后断言**

- `dimensions_covered >= 3`（修 pipeline 后）
- `personality_fit >= 0.45`（新公式下）
- `finetune/user.jsonl rows >= 100`
- 试聊探针均分 >= 45

- [ ] **Step 2: `verify-training-pipeline.js` 独立跑 ingest + core + corpus 不写 Ollama**

- [ ] **Step 3: 加入 `package.json` scripts**

```json
"verify:pipeline": "node scripts/verify-training-pipeline.js",
"train:full:eval": "node scripts/alisa-user-full-training.js && node scripts/verify-training-pipeline.js"
```

- [ ] **Step 4: Commit** `test: end-to-end training pipeline verification`

---

### Task 15: 盲测与试聊强制门禁

**Files:**
- Modify: `lib/persona-progress.js` `getStage`
- Modify: `lib/training-dashboard.js`

- [ ] **Step 1: 阶段「完整体」(>=0.8) 除拟合度外还要求 `passed_blind_milestones.includes(0.7)`**

- [ ] **Step 2: dashboard `next_action` 优先级：核心层空 > 盲测未做 > 微调未跑**

- [ ] **Step 3: Commit** `feat: blind test gate for complete stage`

---

### Task 16: 文档更新

**Files:**
- Create: `docs/FINETUNE_PIPELINE.md`
- Modify: `docs/HOME_TRAINING_PLAN.md`
- Modify: `docs/PERSONA_ALISA.md`
- Modify: `README.md`

- [ ] **Step 1: `FINETUNE_PIPELINE.md` 写清三条路径**

| 路径 | 要求 | 效果 |
|------|------|------|
| A. 仅 prompt+RAG | 无 GPU | 60% 左右 |
| B. Modelfile | 无 GPU | 65%，固化 system |
| C. LoRA 全链路 | GPU ≥12GB | 75%+，权重内化 |

- [ ] **Step 2: 更新 HOME_TRAINING_PLAN P3 为 ✅ 并附 API 说明**

- [ ] **Step 3: Commit** `docs: finetune pipeline and updated training plan`

---

## 实施顺序（依赖图）

```
Phase 1 (Task 1-5) 核心层 ingest     ← 无依赖，最先
    ↓
Phase 2 (Task 6-7)  进度诚实化       ← 依赖 Phase 1 有真实 core 数据
    ↓
Phase 3 (Task 8-11) LoRA 全链路      ← 依赖 Phase 1 语料有质量
    ↓
Phase 4 (Task 12-13) RAG + prompt    ← 可与 Phase 3 并行
    ↓
Phase 5 (Task 14-16) 验收 + 文档
```

**严禁顺序：** 未做 Phase 1 就跑 LoRA（语料缺核心层结构，微调效果差）。

---

## 验收标准（整体 Done Definition）

- [ ] 345 题全完成后：`core.dimensions_covered >= 4`（含价值卡片）
- [ ] `personality_fit` 新公式下 50–70%（非虚高 100%）
- [ ] `finetune/user.jsonl` >= 200 行（真实用户训练后）
- [ ] `POST /fine-tune/run` 在 CUDA 环境端到端 `status=done`
- [ ] 对话使用 `active_chat_model.json` 中的合并模型
- [ ] 试聊探针均分较训练前提升 >= 5（`train:eval:alisa`）
- [ ] 亲近人盲测 >= 7/10（人工，非自动化）

---

## 风险与降级

| 风险 | 降级方案 |
|------|----------|
| 用户无 GPU | `/fine-tune/run` 跳过 train/merge，仅 export + `ollama:persona` Modelfile |
| llama.cpp 未安装 | merge 仅 HF；文档提供手动转换命令 |
| 语料 < 50 条 | 拒绝启动 LoRA，提示继续训练+试聊校准 |
| Ollama 不可用 | 保持现有 fallback，UI 明确标注 |

---

## 不在本计划范围（明确排除）

- 云端夜间上传微调（HOME_TRAINING_PLAN P4）
- GPT-SoVITS 真实音色训练（V-1~V-6 另立计划）
- 「完全模拟本人」100% 目标（产品原则不变）
- 更换基座模型家族（默认保持 Qwen2.5-7B）

---

## 执行命令速查

```bash
# 开发验证
npm test
node scripts/verify-training-pipeline.js

# 全量模拟
npm run train:alisa
npm run train:eval:alisa

# 微调（GPU）
curl -X POST http://127.0.0.1:3000/fine-tune/export -H "Content-Type: application/json" -d "{\"persona_id\":\"user\"}"
curl -X POST http://127.0.0.1:3000/fine-tune/run -H "Content-Type: application/json" -d "{\"persona_id\":\"user\"}"
curl http://127.0.0.1:3000/fine-tune/status
```

---

*计划版本: 2026-06-06 · 基于会话审查：架构正确、默认路径未打通、LoRA-Ollama 断链*
