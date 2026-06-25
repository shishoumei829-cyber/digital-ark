#!/usr/bin/env python3
"""
数字方舟 LoRA 微调脚本
依赖: pip install -r requirements-finetune.txt

用法:
  set DATA_DIR=%USERPROFILE%\\digital_ark_data
  python scripts/train-lora.py --persona alisa-kujo

需要 NVIDIA GPU + 足够显存（7B 模型建议 >= 12GB，可用 4bit 量化）
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def format_alpaca(row: dict) -> str:
    inst = row.get("instruction", "")
    inp = row.get("input", "")
    out = row.get("output", "")
    if inp:
        return f"### Instruction:\n{inst}\n\n### Input:\n{inp}\n\n### Response:\n{out}"
    return f"### Instruction:\n{inst}\n\n### Response:\n{out}"


def main():
    parser = argparse.ArgumentParser(description="Digital Ark LoRA fine-tune")
    parser.add_argument("--persona", default=os.environ.get("PERSONA_ID", "alisa-kujo"))
    parser.add_argument("--data-dir", default=os.environ.get("DATA_DIR", str(Path.home() / "digital_ark_data")))
    parser.add_argument("--base-model", default=os.environ.get("LORA_BASE_MODEL", "Qwen/Qwen2.5-7B-Instruct"))
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--rank", type=int, default=16)
    parser.add_argument("--max-samples", type=int, default=0)
    args = parser.parse_args()

    corpus = Path(args.data_dir) / "finetune" / f"{args.persona}.jsonl"
    if not corpus.exists():
        print(f"[ERROR] 语料不存在: {corpus}", file=sys.stderr)
        print("请先运行: node scripts/export-lora-corpus.js", file=sys.stderr)
        sys.exit(1)

    rows = load_jsonl(corpus)
    if args.max_samples > 0:
        rows = rows[: args.max_samples]
    if len(rows) < 5:
        print(f"[ERROR] 语料过少 ({len(rows)} 条)，至少 5 条", file=sys.stderr)
        sys.exit(1)

    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainingArguments
        from trl import SFTTrainer
    except ImportError:
        print("[ERROR] 缺少依赖。请运行: pip install -r requirements-finetune.txt", file=sys.stderr)
        sys.exit(1)

    if not torch.cuda.is_available():
        print("[WARN] 未检测到 CUDA，CPU 训练极慢。建议使用 GPU 或先用 ollama Modelfile。")

    texts = [format_alpaca(r) for r in rows]
    ds = Dataset.from_dict({"text": texts})

    out_dir = Path(args.data_dir) / "finetune" / "adapters" / args.persona
    out_dir.mkdir(parents=True, exist_ok=True)

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    ) if torch.cuda.is_available() else None

    print(f"[1/4] 加载基座模型 {args.base_model} ...")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb_config,
        device_map="auto" if torch.cuda.is_available() else None,
        trust_remote_code=True,
    )
    if torch.cuda.is_available():
        model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        r=args.rank,
        lora_alpha=args.rank * 2,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_config)

    training_args = TrainingArguments(
        output_dir=str(out_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=args.lr,
        logging_steps=10,
        save_strategy="epoch",
        fp16=torch.cuda.is_available(),
        report_to=[],
        optim="paged_adamw_8bit" if torch.cuda.is_available() else "adamw_torch",
    )

    print(f"[2/4] 开始 LoRA 训练 ({len(rows)} 条) ...")
    trainer = SFTTrainer(
        model=model,
        train_dataset=ds,
        args=training_args,
        processing_class=tokenizer,
    )
    trainer.train()

    print(f"[3/4] 保存 adapter 到 {out_dir}")
    model.save_pretrained(out_dir)
    tokenizer.save_pretrained(out_dir)

    manifest = {
        "persona_id": args.persona,
        "base_model": args.base_model,
        "samples": len(rows),
        "adapter_dir": str(out_dir),
        "next_step": f"node scripts/create-ollama-model.js --persona {args.persona}",
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print("[4/4] 完成:", json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
