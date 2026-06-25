'use strict';

/**
 * 从 data/raw-345-source.md 生成 e:\数字方舟\题库.txt
 * 仅 345 道主题目（不含备用 A/B），五模块分 rotation 池。
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', 'raw-345-source.md');
const OUT = path.join(__dirname, '..', '..', '题库.txt');

const OPTIONS =
  '自由回答（写下你真实的想法）|先给结论再补细节|需要想一想再回答';

function isSkipLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^备用[AB]/.test(t)) return true;
  if (/^#{1,3}\s/.test(t)) return true;
  if (/^---+$/.test(t)) return true;
  if (/^\*/.test(t) && !/^\*\*\d+\*\*$/.test(t)) return true;
  if (/架构完成|质量够吗|五个架构|确认之后|这么多题你怎么/.test(t)) return true;
  if (/^记忆架构按两个维度/.test(t)) return true;
  return false;
}

function detectModule(line) {
  if (/^#\s*认知架构/.test(line)) return 'cognition';
  if (/^#\s*情感架构/.test(line)) return 'emotion';
  if (/^#\s*关系架构/.test(line)) return 'relationship';
  if (/^#\s*记忆架构/.test(line)) return 'memory';
  if (/^#\s*音色架构/.test(line)) return 'voice';
  if (/关系架构题目库/.test(line) && !line.startsWith('#')) return 'relationship';
  if (/记忆架构题目库/.test(line) && !line.startsWith('#')) return 'memory';
  return null;
}

function parseQuestions(md) {
  const buckets = {
    cognition: [],
    emotion: [],
    relationship: [],
    memory: [],
    voice: []
  };
  let module = 'cognition';
  let pendingNum = null;

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const modSwitch = detectModule(line);
    if (modSwitch) {
      module = modSwitch;
      pendingNum = null;
      continue;
    }

    if (module === 'cognition') {
      const m = line.match(/^(\d+)\.\s+(.+)$/);
      if (m) {
        const n = Number(m[1]);
        if (n >= 1 && n <= 110) buckets.cognition.push({ n, text: m[2].trim() });
      }
      continue;
    }

    const star = line.match(/^\*\*(\d+)\*\*$/);
    if (star) {
      pendingNum = Number(star[1]);
      continue;
    }

    if (pendingNum != null && !isSkipLine(line)) {
      buckets[module].push({ n: pendingNum, text: line.trim() });
      pendingNum = null;
    }
  }

  return buckets;
}

function padId(prefix, n, width) {
  return `${prefix}_${String(n).padStart(width, '0')}`;
}

function escapeValue(s) {
  return String(s).replace(/\r?\n/g, ' ').trim();
}

function renderTask(module, id, text) {
  const t = escapeValue(text);
  const lines = ['[task]', `module=${module}`, `id=${id}`];
  switch (module) {
    case 'cognition':
      lines.push(`question=${t}`);
      lines.push(`options=${OPTIONS}`);
      break;
    case 'emotion':
      lines.push(`scenario=${t}`);
      break;
    case 'relationship':
      lines.push(`scene=${t}`);
      break;
    case 'memory':
      lines.push(`prompt=${t}`);
      lines.push('tier=core');
      break;
    case 'voice':
      lines.push(`text=${t}`);
      lines.push('hint=用平常语气描述或朗读。');
      break;
    default:
      throw new Error('unknown module ' + module);
  }
  lines.push('');
  return lines.join('\n');
}

function buildFile(buckets) {
  const header = [
    '# 数字方舟训练题库（345 题 · 仅 rotation 五模块）',
    '# 来源：认知110 + 情感50 + 关系50 + 记忆85 + 音色50（不含备用题）',
    '# 个人训练仅使用本文件（完全替换内置课表，不合并 scenario-bank）',
    '# 占位符: {subject} {trainer} {trainer_label} {p0} {p1} {p2}',
    ''
  ].join('\n');

  const order = [
    ['cognition', 'cognition', 3],
    ['emotion', 'emotion', 3],
    ['relationship', 'relationship', 3],
    ['memory', 'memory', 3],
    ['voice', 'voice', 3]
  ];

  const parts = [header];
  const counts = {};

  for (const [pool, mod, width] of order) {
    const list = buckets[mod];
    counts[mod] = list.length;
    parts.push(`[rotation ${pool}]`);
    parts.push('');
    for (const item of list) {
      parts.push(renderTask(mod, padId(mod.slice(0, 3), item.n, width), item.text));
    }
  }

  return { content: parts.join('\n'), counts };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing source:', SRC);
    process.exit(1);
  }
  const md = fs.readFileSync(SRC, 'utf8');
  const buckets = parseQuestions(md);
  const expected = { cognition: 110, emotion: 50, relationship: 50, memory: 85, voice: 50 };
  let ok = true;
  for (const [mod, want] of Object.entries(expected)) {
    const got = buckets[mod].length;
    if (got !== want) {
      console.error(`COUNT MISMATCH ${mod}: got ${got}, want ${want}`);
      ok = false;
    }
  }
  if (!ok) process.exit(1);

  const { content, counts } = buildFile(buckets);
  fs.writeFileSync(OUT, content.replace(/^\uFEFF/, ''), 'utf8');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log('Wrote', OUT);
  console.log('Counts:', counts, 'total', total);
}

main();
