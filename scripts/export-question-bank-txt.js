'use strict';

/**
 * 将当前 scenario-bank 课表导出为 题库.txt（带占位符，供用户编辑）
 * 运行后个人训练仅读该文件，不再合并内置题库。
 */

const fs = require('fs');
const path = require('path');
const { buildExpandedDays, buildRotationPools } = require('../lib/scenario-bank');
const { resolveQuestionBankPath } = require('../lib/question-bank-loader');

const templateCtx = {
  subject_name: '{subject}',
  trainer_name: '{trainer}',
  trainer_role: 'child',
  trainer_role_label: '{trainer_label}',
  is_self: false,
  is_demo: false,
  key_people: [
    { id: 'p0', name: '{p0}', type: 'spouse', type_label: '配偶' },
    { id: 'p1', name: '{p1}', type: 'friend', type_label: '朋友' },
    { id: 'p2', name: '{p2}', type: 'colleague', type_label: '同事' }
  ]
};

function esc(s) {
  return String(s ?? '').replace(/\r?\n/g, ' ').trim();
}

function personIndex(task, people) {
  if (!task.person_id) return null;
  const i = people.findIndex(p => p.id === task.person_id);
  return i >= 0 ? i : null;
}

function serializeTask(task, people) {
  const lines = ['[task]', `module=${task.module}`, `id=${task.id}`];
  const pi = personIndex(task, people);
  if (pi != null) lines.push(`person=${pi}`);

  switch (task.module) {
    case 'voice':
      lines.push(`text=${esc(task.literary_text)}`);
      if (task.hint) lines.push(`hint=${esc(task.hint)}`);
      break;
    case 'memory':
      lines.push(`tier=${task.tier || 'core'}`);
      lines.push(`prompt=${esc(task.prompt)}`);
      if (task.hint) lines.push(`hint=${esc(task.hint)}`);
      if (task.example) lines.push(`example=${esc(task.example)}`);
      if (task.suggested_tags?.length) lines.push(`tags=${task.suggested_tags.join(',')}`);
      break;
    case 'relationship':
      lines.push(`category=${task.category || 'daily'}`);
      lines.push(`scene=${esc(task.scene)}`);
      if (task.scene_detail) lines.push(`detail=${esc(task.scene_detail)}`);
      if (task.choices?.length) {
        lines.push(`choices=${JSON.stringify(task.choices)}`);
      }
      break;
    case 'emotion':
      lines.push(`scenario=${esc(task.scenario)}`);
      if (task.hint) lines.push(`hint=${esc(task.hint)}`);
      if (task.purpose) lines.push(`purpose=${esc(task.purpose)}`);
      break;
    case 'cognition':
      if (task.conflict_id) lines.push(`conflict=${task.conflict_id}`);
      lines.push(`question=${esc(task.question)}`);
      if (task.options?.length) lines.push(`options=${task.options.map(esc).join('|')}`);
      break;
    default:
      return null;
  }
  return lines.join('\n');
}

function serializeDays(days, people) {
  const chunks = [
    '# 数字方舟训练题库',
    '# 个人训练仅使用本文件（替换内置课表，不合并）',
    '# 占位符: {subject} {trainer} {trainer_label} {p0} {p1} {p2}',
    '# 块格式: [day N] / [rotation 模块名] + [task] 字段',
    ''
  ];

  for (const day of days) {
    chunks.push(`[day ${day.day}]`);
    chunks.push(`title=${day.title}`);
    chunks.push(`summary=${day.summary}`);
    chunks.push('');
    for (const t of day.tasks || []) {
      const block = serializeTask(t, people);
      if (block) {
        chunks.push(block);
        chunks.push('');
      }
    }
  }
  return chunks;
}

function serializePools(pools, people) {
  const chunks = [];
  const order = ['memory', 'relationship', 'emotion', 'cognition', 'voice'];
  for (const key of order) {
    const list = pools[key];
    if (!list?.length) continue;
    chunks.push(`[rotation ${key}]`);
    chunks.push('');
    for (const t of list) {
      const block = serializeTask(t, people);
      if (block) {
        chunks.push(block);
        chunks.push('');
      }
    }
  }
  return chunks;
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const outPath = resolveQuestionBankPath(repoRoot);
  const people = templateCtx.key_people;
  const days = buildExpandedDays(templateCtx, people);
  const pools = buildRotationPools(templateCtx, people);

  const body = [
    ...serializeDays(days, people),
    ...serializePools(pools, people)
  ].join('\n');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, 'utf8');
  const dayCount = days.reduce((n, d) => n + (d.tasks?.length || 0), 0);
  const poolCount = Object.values(pools).reduce((n, a) => n + (a?.length || 0), 0);
  console.log(`已导出: ${outPath}`);
  console.log(`初训 ${dayCount} 题 · 轮播 ${poolCount} 题`);
}

main();
