# 艾莉莎 Persona 训练数据说明

人物：**艾莉莎·米哈伊罗夫纳·九条**（《不时轻声地以俄语遮羞的邻座艾莉同学》）

## 数据来源

基于公开设定（萌娘百科、维基、Anibase 等）整理为数字方舟五维训练格式，**非官方授权语料**，仅供本地数字分身实验与审查。

## 文件位置

| 用途 | 路径 |
|------|------|
| 原始 Persona 包 | `config/personas/alisa-kujo.json` |
| 导入后审查副本 | `%USERPROFILE%/digital_ark_data/persona/review/alisa-kujo.json` |
| 审查 Web 页 | http://127.0.0.1:3000/apps/persona-review.html |
| LoRA 语料 | `%USERPROFILE%/digital_ark_data/finetune/alisa-kujo.jsonl` |
| LoRA 权重 | `%USERPROFILE%/digital_ark_data/finetune/adapters/alisa-kujo/` |

## 五维内容概要

- **音色**：文本口癖、俄语/日语切换模式（音频待你上传）
- **记忆**：15 条分层记忆（核心/关系/日常/情感/共同/愿望）
- **关系**：政近、有希、绫乃、玛莎、一般同学 5 组场景回应
- **情感**：压力反应、安慰风格、3 个情绪场景
- **认知**：价值观排序 + 冲突决策倾向
- **对话样本**：15 条用于 LoRA 的 user/assistant 对

## 自动训练与效果评估（作品语料）

训练脚本**不再使用随意编写的伪台词**，而是读取：

`config/personas/alisa-kujo/dialogue-corpus.json`

其中每条日语/俄语台词尽量标注出处（动画第 N 话、漫画卷页、轻小说卷等），并映射到演示课表 `curriculum-7day.json` 的 `task_id`。

```bash
# 【推荐】艾莉莎作为真实用户：走完 题库.txt 全量 + 五模块（几百道题，音色仅文字）
npm run train:alisa

# 保留数据目录便于排查
set SIM_KEEP=1 && npm run train:alisa

# 仅 26 题演示课表（旧，不推荐当全量测试）
npm run simulate:alisa

# 26 题 + 试聊评分
npm run train:eval:alisa
```

`train:alisa` 使用 **本人自训** + `题库.txt`，不是 `setup/demo` 的 26 题课表。

语料参考：萌娘百科、animemanga33 台词整理、京都产业大学《ロシデレ》俄语解说、animan-labo 分卷俄语对照等（见 corpus 内 `references`）。

## 命令

```bash
# 重新导入到记忆库 + RAG
curl -X POST http://127.0.0.1:3000/persona/ingest -H "Content-Type: application/json" -d "{\"force\":true}"

# 导出 LoRA 语料
npm run train

# Ollama 人格 Modelfile（无需 GPU）
npm run ollama:persona

# LoRA 微调（需 GPU + pip install -r requirements-finetune.txt）
npm run train:lora
```

## 对话模型

在 `.env` 中设置：

```
PERSONA_ID=alisa-kujo
PERSONA_MODEL=digital-ark-alisa-kujo
```

未设置 `PERSONA_MODEL` 时使用 `CHAT_MODEL`；无论哪个模型，**每次对话都会注入 Persona + RAG + 反馈学习**。
