'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = path.join(os.tmpdir(), `da_progress_${Date.now()}`);
fs.mkdirSync(TMP, { recursive: true });

const { CorePersonaLayer } = require('../lib/core-persona');
const { TrainingSystem } = require('../lib/training');
const { PersonalMemoryStore } = require('../lib/personal-memory');
const { MemorySystem } = require('../lib/memory');
const { MemoryInfluenceResolver } = require('../lib/memory-influence');
const { LAYER_WEIGHTS } = require('../lib/design-spec');

let ok = 0;
let fail = 0;
function assert(name, cond) {
  if (cond) { ok++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name); }
}

const core = new CorePersonaLayer(TMP);
core.updateDimension('value_priority', { ranked_values: ['家庭', '自由'] });
core.completeCardGame();

const training = new TrainingSystem(TMP);
training.progress.cognition = 0.4;
training.progress.emotion = 0.3;
training.progress.memory = 0.5;
training.progress.relationship = 0.2;
training.progress.voice = 0.6;

const personal = new PersonalMemoryStore(TMP);
personal.add({ tier: 'core', content: '测试记忆', tags: ['童年'] });

const memory = new MemorySystem(TMP);
memory.addEvent('conversation', '测试', 0.5);

const influence = new MemoryInfluenceResolver(memory, personal, TMP);

const payload = training.getProgress(
  { core_memories: 1, relationship_people: 2, passed_blind_milestones: [] },
  {
    corePersona: core,
    personalMemoryTotal: 1,
    personalMemoryQuality: 0.5,
    sedimentCount: 0,
    eventCount: 1,
    peopleCount: 2,
    scenariosCompleted: 3,
    positiveFeedbackCount: 2
  }
);

assert('progress_model 为 five_layer', payload.progress_model === 'five_layer');
assert('含五层 layers', payload.layers?.core && payload.layers?.expression);
assert('总进度为五层加权和', Math.abs(
  payload.overall_progress -
  (payload.layers.core.progress * LAYER_WEIGHTS.core +
    payload.layers.emotion.progress * LAYER_WEIGHTS.emotion +
    payload.layers.memory.progress * LAYER_WEIGHTS.memory +
    payload.layers.relationship.progress * LAYER_WEIGHTS.relationship +
    payload.layers.expression.progress * LAYER_WEIGHTS.expression)
) < 0.001);
assert('modules.voice 对齐表达层', payload.modules.voice.progress === payload.layers.expression.progress);
assert('modules.cognition 对齐核心层', payload.modules.cognition.progress === payload.layers.core.progress);
assert('weights.core === 0.35', payload.weights.core === 0.35);

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
console.log(`\n${ok} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
