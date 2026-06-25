'use strict';

const fs = require('fs');
const path = require('path');
const { CONFLICT_SCENARIOS } = require('./design-spec');
const { countCurriculumTasks } = require('./scenario-bank');

const PLACEHOLDERS = ['subject', 'trainer', 'trainer_role', 'trainer_label', 'p0', 'p1', 'p2'];

function questionBankFingerprint(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 'missing';
    const stat = fs.statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'error';
  }
}

function resolveQuestionBankPath(repoRoot) {
  const root = repoRoot || path.join(__dirname, '..');
  const candidates = [
    process.env.QUESTION_BANK_PATH,
    path.join(root, '..', '题库.txt'),
    path.join(root, 'data', '题库.txt')
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return path.resolve(p);
  }
  return path.resolve(candidates[0] || path.join(root, '..', '题库.txt'));
}

function applyCtx(text, ctx) {
  if (text == null || text === '') return text;
  const people = ctx.key_people || [];
  const map = {
    subject: ctx.subject_name || '',
    trainer: ctx.trainer_name || '',
    trainer_role: ctx.trainer_role || '',
    trainer_label: ctx.trainer_role_label || '',
    p0: people[0]?.name || '重要的人',
    p1: people[1]?.name || '重要的人',
    p2: people[2]?.name || '重要的人'
  };
  let out = String(text);
  for (const key of PLACEHOLDERS) {
    out = out.split(`{${key}}`).join(map[key] ?? '');
  }
  return out;
}

function parseKeyValue(line) {
  const m = line.match(/^([a-z_][a-z0-9_]*)=(.*)$/i);
  if (!m) return null;
  return { key: m[1].toLowerCase(), value: m[2].trim() };
}

function parseListValue(value) {
  if (!value) return [];
  return value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
}

function parseTaskBlock(lines) {
  const meta = {};
  const body = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const kv = parseKeyValue(line);
    if (kv) meta[kv.key] = kv.value;
    else body.push(line.trim());
  }
  if (body.length) meta._body = body.join('\n');
  return meta;
}

function parseQuestionBankFile(content) {
  const sections = [];
  let current = null;
  let taskLines = null;

  const flushTask = () => {
    if (!current || !taskLines?.length) return;
    current.tasks.push(parseTaskBlock(taskLines));
    taskLines = null;
  };

  const flushSection = () => {
    flushTask();
    if (current) sections.push(current);
    current = null;
  };

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const dayMatch = line.match(/^\[day\s*(\d+)\]$/i);
    const rotMatch = line.match(/^\[rotation\s+(\w+)\]$/i);
    if (dayMatch || rotMatch) {
      flushSection();
      current = {
        type: dayMatch ? 'day' : 'rotation',
        day: dayMatch ? Number(dayMatch[1]) : undefined,
        pool: rotMatch ? rotMatch[1].toLowerCase() : undefined,
        title: '',
        summary: '',
        tasks: []
      };
      continue;
    }

    if (!current) continue;

    if (line === '[task]') {
      flushTask();
      taskLines = [];
      continue;
    }

    if (taskLines) {
      taskLines.push(raw);
      continue;
    }

    const kv = parseKeyValue(line);
    if (kv && (kv.key === 'title' || kv.key === 'summary')) {
      current[kv.key] = kv.value;
    }
  }

  flushSection();
  return sections;
}

function conflictById(id) {
  return CONFLICT_SCENARIOS.find(c => c.id === id) || null;
}

function buildTaskFromMeta(meta, ctx) {
  const mod = (meta.module || '').toLowerCase();
  const id = meta.id || `bank_${mod}_${Date.now()}`;
  if (!mod) return null;

  if (mod === 'voice') {
    const literary_text = applyCtx(meta.text || meta._body || '', ctx);
    if (!literary_text.trim()) return null;
    return {
      id,
      module: 'voice',
      title: meta.title || '声音样本',
      literary_text,
      hint: applyCtx(meta.hint || '', ctx) || (ctx.is_self ? '用平常语气朗读。' : `想象${ctx.subject_name}的口吻。`)
    };
  }

  if (mod === 'memory') {
    const prompt = applyCtx(meta.prompt || meta._body || '', ctx);
    if (!prompt.trim()) return null;
    return {
      id,
      module: 'memory',
      tier: meta.tier || 'core',
      prompt,
      hint: applyCtx(meta.hint || '', ctx) || undefined,
      example: applyCtx(meta.example || '', ctx) || undefined,
      suggested_tags: parseListValue(meta.tags)
    };
  }

  if (mod === 'relationship') {
    const people = ctx.key_people || [];
    const pi = meta.person != null ? Number(meta.person) : -1;
    const person = pi >= 0 ? people[pi] : null;
    const scene = applyCtx(meta.scene || meta._body || '', ctx);
    if (!scene.trim()) return null;
    let choices;
    if (meta.choices) {
      try {
        choices = JSON.parse(meta.choices);
      } catch {
        choices = parseListValue(meta.choices).map((label, i) => ({
          type: i % 2 ? 'logical' : 'emotional',
          label,
          text: label
        }));
      }
    }
    return {
      id,
      module: 'relationship',
      category: meta.category || 'daily',
      person_id: person?.id,
      person_name: person?.name || applyCtx(meta.person_name || '', ctx) || undefined,
      scene,
      scene_detail: applyCtx(meta.detail || meta.scene_detail || '', ctx) || undefined,
      choices
    };
  }

  if (mod === 'emotion') {
    const scenario = applyCtx(meta.scenario || meta._body || '', ctx);
    if (!scenario.trim()) return null;
    return {
      id,
      module: 'emotion',
      scenario,
      hint: applyCtx(meta.hint || '', ctx) || undefined,
      purpose: applyCtx(meta.purpose || '', ctx) || undefined,
      stress_reaction: meta.stress_reaction || 'contextual',
      comfort_style: meta.comfort_style || 'accompany_first'
    };
  }

  if (mod === 'cognition') {
    const conflict = meta.conflict ? conflictById(meta.conflict) : null;
    const question = applyCtx(
      meta.question || (conflict ? `${ctx.subject_name}若遇到：${conflict.text}` : meta._body || ''),
      ctx
    );
    if (!question.trim()) return null;
    let options;
    if (meta.options) {
      const parts = meta.options.split('|').map(s => s.trim()).filter(Boolean);
      options = parts.map(o => applyCtx(o, ctx));
    } else {
      options = [
        `${ctx.subject_name}会先顾关系与感受`,
        `${ctx.subject_name}会先顾原则与事实`,
        `${ctx.subject_name}会看对象是谁再决定`
      ];
    }
    return {
      id,
      module: 'cognition',
      conflict_id: conflict?.id || meta.conflict_id,
      question,
      options
    };
  }

  return null;
}

function buildCurriculumFromSections(sections, ctx) {
  const days = [];
  const rotation_pools = {
    memory: [],
    relationship: [],
    emotion: [],
    cognition: [],
    voice: []
  };

  for (const sec of sections) {
    const tasks = sec.tasks
      .map(meta => buildTaskFromMeta(meta, ctx))
      .filter(Boolean);

    if (sec.type === 'day') {
      days.push({
        day: sec.day,
        title: applyCtx(sec.title, ctx),
        summary: applyCtx(sec.summary, ctx),
        tasks
      });
    } else if (sec.type === 'rotation' && rotation_pools[sec.pool]) {
      rotation_pools[sec.pool].push(...tasks);
    }
  }

  days.sort((a, b) => a.day - b.day);
  return { days, rotation_pools };
}

function loadQuestionBankFile(filePath) {
  if (!fs.existsSync(filePath)) return { ok: false, error: 'missing', path: filePath };
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) return { ok: false, error: 'empty', path: filePath };
  const sections = parseQuestionBankFile(raw);
  if (!sections.length) return { ok: false, error: 'parse_empty', path: filePath };
  return { ok: true, path: filePath, sections, raw };
}

function buildPersonalCurriculumFromBank(setupCtx, repoRoot) {
  const bankPath = resolveQuestionBankPath(repoRoot);
  const loaded = loadQuestionBankFile(bankPath);
  if (!loaded.ok) {
    return {
      error: loaded.error,
      bank_path: bankPath,
      curriculum: null
    };
  }

  const { days, rotation_pools } = buildCurriculumFromSections(loaded.sections, setupCtx);
  const curriculum = {
    persona_id: 'user',
    title: `${setupCtx.subject_name} · 7日训练引导`,
    design_note:
      '课表来自题库.txt（完全替换内置生成，不与 scenario-bank 合并）。编辑题库后需重新完成身份设定或清空引导进度以重载。',
    source: 'question-bank.txt',
    bank_path: bankPath,
    scale: {},
    generated_from: setupCtx,
    days,
    rotation_pools
  };
  const counts = countCurriculumTasks(curriculum);
  curriculum.scale = {
    initial_7day_tasks: counts.dayTasks,
    rotation_pool_tasks: counts.poolTasks
  };
  return { ok: true, bank_path: bankPath, curriculum };
}

module.exports = {
  questionBankFingerprint,
  resolveQuestionBankPath,
  applyCtx,
  parseQuestionBankFile,
  buildTaskFromMeta,
  buildCurriculumFromSections,
  loadQuestionBankFile,
  buildPersonalCurriculumFromBank,
  PLACEHOLDERS
};
