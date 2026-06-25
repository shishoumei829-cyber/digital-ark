# 主页训练架构与执行计划

## 产品原则

1. **主页（陪伴 Tab）= 主训练入口**：引导一问一答 + 自由聊天，两种形态采集同一套五维数据。
2. **训练 Tab = 专项深化**：音色录音、认知拖拽、长表单等；与主页共享 `training_guide_state` 与 `task_id`。
3. **题目来源**：7 日课程框架由系统设计（`curriculum-builder` + `guide-coach`）；**答案内容 100% 来自用户**。框架按记录者身份 × 关系人类型分支，不是换名模板。
4. **数据用途**：即时 → RAG + prompt 风格提示；中期 → 反馈修正库；可选 → LoRA 语料（本地 export）。

## 数据流

```
用户输入（主页引导 / 主页聊天 / 专项页）
    → training_sessions + personalMemory + feedback_learning
    → training_guide.markComplete(task_id)
    → prompt-builder 注入记忆 + feedbackHints + corrections
    → export-lora-corpus（buildUserPersonaBundle）
    → train:lora（本地可选）
```

## 阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | `home-training.js` + `/training/home` API | 进行中 |
| P0 | 反馈「不像/有点像」+ 用户填写「应该怎么说」 | 进行中 |
| P0 | 主页双模式 UI + 与专项页 task 同步 | 进行中 |
| P1 | `buildUserPersonaBundle` + 个人 LoRA export | 进行中 |
| P2 | 聊天自动捕获 `/training/home/ingest-chat` | 进行中 |
| P3 | 本地微调 job 状态 `/fine-tune/run` | ✅ |
| P4 | 云端夜间上传（可选，单人可跳过） | 未做 |

## 主页提问形态

| 模式 | 界面 | 提问方式 |
|------|------|----------|
| **引导训练** | 教练卡片 + 单题输入 | 口语化 `home_prompt`（「我想更了解 TA…」） |
| **陪伴聊天** | 聊天气泡 | 无固定题；长叙述可「存入训练」；试聊后可反馈+修正 |

专项页仍展示同一题的 `purpose/steps`（教练层），便于深度填写。
