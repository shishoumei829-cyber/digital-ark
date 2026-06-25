'use strict';

/**
 * 从 agent-transcript 中的「五架构题目库」全文解析 345 道主题目，
 * 写入 ../题库.txt（仅 rotation 五模块，不含旧 7 日课表）。
 *
 * 用法: node scripts/build-architecture-question-bank.js [transcript.jsonl]
 */

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT_PATH = path.join(REPO, '..', '题库.txt');
const DEFAULT_TRANSCRIPT = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'e',
  'agent-transcripts',
  '821e559b-8d10-46a9-949c-b9380a487f7e',
  '821e559b-8d10-46a9-949c-b9380a487f7e.jsonl'
);

const COG_OPTIONS =
  '自由回答（写下你真实的想法）|先给结论再补细节|需要想一想再回答';

function loadMarkdownFromTranscript(transcriptPath) {
  const raw = fs.readFileSync(transcriptPath, 'utf8');
  for (const line of raw.split(/\n/)) {
    if (!line.includes('认知架构题目库')) continue;
    const obj = JSON.parse(line);
    const text = obj.message?.content?.find(c => c.type === 'text')?.text || '';
    const m = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
    if (m) return m[1].trim();
    if (text.includes('# 认知架构题目库')) {
      const i = text.indexOf('# 认知架构题目库');
      return text.slice(i).trim();
    }
  }
  throw new Error('未在 transcript 中找到五架构题库全文');
}

function sliceBlock(md, startMarker, endMarker) {
  const start = md.indexOf(startMarker);
  if (start < 0) return '';
  const from = start + startMarker.length;
  const end = endMarker ? md.indexOf(endMarker, from) : md.length;
  return md.slice(start, end >= 0 ? end : md.length);
}

function extractCognitionQuestions(block) {
  const out = [];
  const re = /(?:^|\n)(\d{1,3})\.\s+([^\n]+)/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const n = Number(m[1]);
    if (n < 1 || n > 110) continue;
    const q = m[2].trim().replace(/\s+/g, ' ');
    if (q) out.push({ n, q });
  }
  out.sort((a, b) => a.n - b.n);
  const seen = new Set();
  return out.filter(x => {
    if (seen.has(x.n)) return false;
    seen.add(x.n);
    return true;
  }).map(x => x.q);
}

/** 情感/关系/记忆/音色：**N** 主题目（不含备用A/B） */
function extractBoldMainQuestions(block) {
  const out = [];
  const parts = block.split(/\*\*(\d+)\*\*/);
  for (let i = 1; i < parts.length; i += 2) {
    const num = Number(parts[i]);
    let body = parts[i + 1] || '';
    body = body.split(/\n(?:备用[AB][：:]|---\s*\n|## )/)[0];
    const main = body
      .split(/\n/)
      .map(l => l.trim())
      .filter(l => l && !/^备用/.test(l))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (main) out.push({ num, q: main });
  }
  out.sort((a, b) => a.n - b.n);
  const seen = new Set();
  return out
    .filter(x => {
      if (seen.has(x.num)) return false;
      seen.add(x.num);
      return true;
    })
    .map(x => x.q);
}

function parseArchitectures(md) {
  const cognitionBlock = sliceBlock(md, '# 认知架构题目库', '# 情感架构题目库');
  const emotionBlock = sliceBlock(md, '# 情感架构题目库', '# 关系架构题目库');
  const relationshipBlock = sliceBlock(md, '# 关系架构题目库', '# 记忆架构题目库');
  const memoryBlock = sliceBlock(md, '# 记忆架构题目库', '# 音色架构题目库');
  const voiceBlock = sliceBlock(md, '# 音色架构题目库', null);

  return {
    cognition: extractCognitionQuestions(cognitionBlock),
    emotion: extractBoldMainQuestions(emotionBlock),
    relationship: extractBoldMainQuestions(relationshipBlock),
    memory: extractBoldMainQuestions(memoryBlock),
    voice: extractBoldMainQuestions(voiceBlock)
  };
}

function escLine(s) {
  return String(s).replace(/\r?\n/g, ' ').trim();
}

function writeTask(lines, { module, id, fields }) {
  lines.push('[task]');
  lines.push(`module=${module}`);
  lines.push(`id=${id}`);
  for (const [k, v] of Object.entries(fields)) {
    if (v != null && v !== '') lines.push(`${k}=${escLine(v)}`);
  }
  lines.push('');
}

function buildTxt(arch) {
  const lines = [
    '# 数字方舟训练题库（五架构 345 题 · 仅本文件）',
    '# 个人训练完全替换内置课表，不合并 scenario-bank',
    '# 占位符: {subject} {trainer} {trainer_label} {p0} {p1} {p2}',
    '# 生成: node scripts/build-architecture-question-bank.js',
    ''
  ];

  const modules = [
    ['cognition', 'cog', arch.cognition, q => ({
      question: q,
      options: COG_OPTIONS
    })],
    ['emotion', 'emo', arch.emotion, q => ({ scenario: q })],
    ['relationship', 'rel', arch.relationship, q => ({ scene: q })],
    ['memory', 'mem', arch.memory, q => ({ prompt: q, tier: 'core' })],
    ['voice', 'voi', arch.voice, q => ({ text: q })]
  ];

  for (const [mod, prefix, list, fieldsFn] of modules) {
    lines.push(`[rotation ${mod}]`);
    lines.push('');
    list.forEach((q, i) => {
      const n = String(i + 1).padStart(3, '0');
      writeTask(lines, {
        module: mod,
        id: `${prefix}_${n}`,
        fields: fieldsFn(q)
      });
    });
  }

  return lines.join('\n');
}

function main() {
  const transcriptPath = process.argv[2] || DEFAULT_TRANSCRIPT;
  if (!fs.existsSync(transcriptPath)) {
    console.error('找不到 transcript:', transcriptPath);
    process.exit(1);
  }

  const md = loadMarkdownFromTranscript(transcriptPath);
  const arch = parseArchitectures(md);
  const counts = {
    cognition: arch.cognition.length,
    emotion: arch.emotion.length,
    relationship: arch.relationship.length,
    memory: arch.memory.length,
    voice: arch.voice.length
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  console.log('解析题量:', counts, '合计', total);
  const expected = { cognition: 110, emotion: 50, relationship: 50, memory: 85, voice: 50 };
  for (const [k, n] of Object.entries(expected)) {
    if (counts[k] !== n) {
      console.warn(`警告: ${k} 期望 ${n} 实际 ${counts[k]}`);
    }
  }

  const txt = buildTxt(arch);
  fs.writeFileSync(OUT_PATH, txt, 'utf8');
  console.log('已写入:', OUT_PATH, `(${Buffer.byteLength(txt)} bytes)`);

  const { loadQuestionBankFile, buildCurriculumFromSections, resolveQuestionBankPath } = require('../lib/question-bank-loader');
  const { countCurriculumTasks } = require('../lib/scenario-bank');
  const loaded = loadQuestionBankFile(OUT_PATH);
  const ctx = {
    subject_name: '测试',
    trainer_name: '测试',
    trainer_role_label: '本人',
    is_self: true,
    key_people: []
  };
  const cur = buildCurriculumFromSections(loaded.sections, ctx);
  const n = countCurriculumTasks(cur);
  console.log('loader 验证: day=', n.dayTasks, 'pool=', n.poolTasks, 'total=', n.totalUnique);
}

main();
