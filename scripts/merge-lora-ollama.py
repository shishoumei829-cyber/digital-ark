#!/usr/bin/env python3
"""Merge LoRA adapter into base weights for local deployment."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Merge Digital Ark LoRA adapter")
    parser.add_argument("--persona", default=os.environ.get("PERSONA_ID", "user"))
    parser.add_argument("--data-dir", default=os.environ.get("DATA_DIR", str(Path.home() / "digital_ark_data")))
    args = parser.parse_args()

    adapter_dir = Path(args.data_dir) / "finetune" / "adapters" / args.persona
    if not adapter_dir.exists():
        print(f"[ERROR] adapter 不存在: {adapter_dir}", file=sys.stderr)
        sys.exit(1)

    manifest_path = adapter_dir / "manifest.json"
    base_model = "Qwen/Qwen2.5-7B-Instruct"
    if manifest_path.exists():
        base_model = json.loads(manifest_path.read_text(encoding="utf-8")).get("base_model", base_model)

    out_dir = Path(args.data_dir) / "finetune" / "merged" / args.persona
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError:
        print("[ERROR] 缺少 transformers/peft", file=sys.stderr)
        sys.exit(1)

    print(f"[1/3] 加载 {base_model} + adapter …")
    tokenizer = AutoTokenizer.from_pretrained(str(adapter_dir), trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        device_map="cpu",
        trust_remote_code=True,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    )
    model = PeftModel.from_pretrained(model, str(adapter_dir))
    model = model.merge_and_unload()

    print(f"[2/3] 保存 merged 到 {out_dir}")
    model.save_pretrained(out_dir)
    tokenizer.save_pretrained(out_dir)

    gguf_path = None
    convert = shutil.which("convert_hf_to_gguf.py")
    if convert:
        gguf_path = out_dir / f"{args.persona}.gguf"
        try:
            subprocess.run([sys.executable, convert, str(out_dir), "--outfile", str(gguf_path)], check=True)
        except Exception as e:
            print(f"[WARN] GGUF 转换失败: {e}")
            gguf_path = None

    merge_manifest = {
        "persona_id": args.persona,
        "base_model": base_model,
        "merged_dir": str(out_dir),
        "gguf_path": str(gguf_path) if gguf_path and gguf_path.exists() else None,
        "weights_personalized": True,
    }
    (out_dir / "merge_manifest.json").write_text(
        json.dumps(merge_manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("[3/3] 完成:", json.dumps(merge_manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
