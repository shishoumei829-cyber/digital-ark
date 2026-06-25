'use strict';

const path = require('path');
const { buildPersonalCurriculum } = require('../lib/curriculum-builder');
const { countCurriculumTasks } = require('../lib/scenario-bank');
const { CONFLICT_SCENARIOS } = require('../lib/design-spec');

const ctx = {
  subject_name: '王伯伯',
  trainer_name: '王小明',
  trainer_role: 'child',
  trainer_role_label: '子女',
  is_self: false,
  is_demo: false,
  key_people: [
    { id: 'p1', name: '李阿姨', type: 'spouse', type_label: '配偶' },
    { id: 'p2', name: '王强', type: 'friend', type_label: '朋友' }
  ]
};

const curriculum = buildPersonalCurriculum(ctx, path.join(__dirname, '..'));
const counts = countCurriculumTasks(curriculum);
const checks = [];

function ok(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail });
  console.log((pass ? '[OK]' : '[FAIL]') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

ok('初训情境题 ≥ 40', counts.dayTasks >= 40, String(counts.dayTasks));
ok('轮播池 ≥ 50', counts.poolTasks >= 50, String(counts.poolTasks));
ok('认知轮播 = 冲突库全长', (curriculum.rotation_pools?.cognition?.length || 0) === CONFLICT_SCENARIOS.length,
  `${curriculum.rotation_pools?.cognition?.length}/${CONFLICT_SCENARIOS.length}`);
ok('第6天认知题 ≥ 8', (curriculum.days.find(d => d.day === 6)?.tasks?.filter(t => t.module === 'cognition').length || 0) >= 8, '');

const failed = checks.filter(c => !c.pass);
console.log('\n---');
console.log(`题库体量: ${checks.length - failed.length}/${checks.length} 通过`);
console.log(`初训 ${counts.dayTasks} 题 · 轮播 ${counts.poolTasks} 题 · 合计情境 ${counts.totalUnique}`);
if (failed.length) process.exit(1);
