import json
import os
import re

ROOT = r'C:\Users\SHIKIMORI\.cursor\projects\e\agent-transcripts'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'css', 'digital-ark-ui.css')

SKIP_WRITE_MARKERS = (
    'Apple 极简按钮 & 全局优化（追加）',
    'Apple 极简设计系统（完整版）',
)

WARM_ROOT = """/* 数字方舟 · 主页 & 引导 UI 增强 */
:root {
  --da-ink: #1c1c18;
  --da-muted: #767872;
  --da-body: #454742;
  --da-sage: #596059;
  --da-sage-light: #dae2d8;
  --da-cream: #fdf9f3;
  --da-sand: #f7f3ed;
  --da-border: rgba(198, 199, 192, 0.35);
  --da-shadow: 0 12px 40px rgba(28, 28, 24, 0.08);
  --da-shadow-lg: 0 20px 50px rgba(28, 28, 24, 0.12);
  --da-radius: 20px;
  --da-radius-sm: 14px;
}"""

WARM_P0 = """#p0.da-home-page {
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(193, 201, 191, 0.35), transparent 60%),
    linear-gradient(180deg, #faf8f4 0%, var(--da-cream) 40%);
  min-height: 0;
}"""

ops = []
for dirpath, _, files in os.walk(ROOT):
    for fn in files:
        if not fn.endswith('.jsonl'):
            continue
        path = os.path.join(dirpath, fn)
        with open(path, encoding='utf-8') as f:
            for line in f:
                if 'digital-ark-ui.css' not in line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                for part in obj.get('message', {}).get('content', []):
                    if part.get('type') != 'tool_use':
                        continue
                    name = part.get('name')
                    inp = part.get('input', {})
                    p = inp.get('path', '').replace('\\', '/').lower()
                    if not p.endswith('digital-ark-ui.css'):
                        continue
                    if name == 'Write':
                        body = inp.get('contents', '')
                        if any(m in body for m in SKIP_WRITE_MARKERS):
                            continue
                        ops.append(('write', body))
                    elif name == 'StrReplace':
                        ops.append(('replace', inp.get('old_string', ''), inp.get('new_string', '')))

content = ''
applied = skipped = 0
for item in ops:
    if item[0] == 'write':
        if len(item[1]) > len(content):
            content = item[1]
            applied += 1
        else:
            skipped += 1
    else:
        old, new = item[1], item[2]
        if old and old in content:
            content = content.replace(old, new, 1)
            applied += 1
        else:
            skipped += 1

if 'Apple 极简设计系统' in content[:800]:
    content = re.sub(r'/\* 数字方舟 · Apple 极简设计系统 \*/.*?\}', WARM_ROOT, content, count=1, flags=re.S)

content = re.sub(r'#p0\.da-home-page \{[^}]+\}', WARM_P0, content, count=1, flags=re.S)
content = re.sub(r'\n/\* Apple 主色覆盖[\s\S]*$', '\n', content)

replacements = [
    ('var(--apple-green)', 'var(--da-sage)'),
    ('var(--apple-red)', '#93000a'),
    ('var(--apple-black)', 'var(--da-ink)'),
    ('var(--apple-gray-1)', 'var(--da-ink)'),
    ('var(--apple-gray-2)', 'var(--da-body)'),
    ('var(--apple-gray-3)', 'var(--da-muted)'),
    ('var(--apple-border)', 'var(--da-border)'),
    ('var(--apple-bg)', 'var(--da-cream)'),
    ('var(--apple-radius)', 'var(--da-radius)'),
    ('var(--apple-radius-sm)', 'var(--da-radius-sm)'),
    ('var(--apple-shadow)', 'var(--da-shadow)'),
    ('var(--apple-shadow-lg)', 'var(--da-shadow-lg)'),
    ('#F2F2F7', 'var(--da-sand)'),
    ('#008C77', '#4a524a'),
    ('background: #fff;\n  border: 1px solid var(--da-border);\n  border-radius: var(--da-radius);\n  box-shadow: none;', 'background: #fff;\n  border-radius: var(--da-radius);\n  box-shadow: var(--da-shadow);\n  border: 1px solid var(--da-border);'),
]
for a, b in replacements:
    content = content.replace(a, b)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(content)

print('lines', content.count('\n') + 1, 'applied', applied, 'skipped', skipped)
print('apple-green', 'apple-green' in content)
print('warm cream', '--da-cream: #fdf9f3' in content)
