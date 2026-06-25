# 数字方舟 · 微调与模型切换

## 三条路径

| 路径 | 要求 | 预期效果 |
|------|------|----------|
| A. prompt + RAG | 无 GPU | 熟悉场景 ~60% 像 |
| B. Ollama Modelfile | 无 GPU | 固化 system，~65% |
| C. LoRA 全链路 | GPU ≥12GB | 权重内化，~75%+ |

## 数据流（已实现）

```
训练提交 → training-ingest → core-persona + finetune/user.jsonl
         → export-lora-corpus（全量合并）
         → train-lora.py
         → merge-lora-ollama.py
         → create-ollama-model.js
         → active_chat_model.json → 对话自动切换
```

## API

```bash
# 导出语料
curl -X POST http://127.0.0.1:3000/fine-tune/export -H "Content-Type: application/json" -d "{\"persona_id\":\"user\"}"

# 一键微调（需 GPU + Python 依赖）
curl -X POST http://127.0.0.1:3000/fine-tune/run -H "Content-Type: application/json" -d "{\"persona_id\":\"user\"}"

# 任务状态
curl http://127.0.0.1:3000/fine-tune/job/ft_XXXX

# 总览
curl http://127.0.0.1:3000/fine-tune/status?persona_id=user
```

## CLI

```bash
npm run verify:pipeline   # 验证 ingest + 核心层 + 语料
npm run train             # 导出语料
npm run train:lora        # GPU 微调
python scripts/merge-lora-ollama.py --persona user
npm run ollama:persona
```

## 验收

- 核心层：`GET /persona/core` 中 `dimensions` 非空
- 进度：`progress_model` 为 `five_layer_v2`，`module_completion` 与 `layer_quality` 分列
- 语料：`%USERPROFILE%/digital_ark_data/finetune/user.jsonl` 随训练增长
- 模型：`active_chat_model.json` 存在且 `weights_personalized: true`（LoRA 成功后）
