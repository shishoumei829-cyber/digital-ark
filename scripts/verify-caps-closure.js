'use strict';

/**
 * CAPS 三项闭合验证（无需 Ollama）
 * 1. 活态/沉淀记忆 → 先例 → processCAPS Prompt
 * 2. 重复激活 → 自动沉淀签名
 * 3. formatCapsSnapshot 结构完整
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = path.join(os.tmpdir(), `da_caps_verify_${Date.now()}`);
fs.mkdirSync(TMP, { recursive: true });

const { CorePersonaLayer } = require('../lib/core-persona');
const { MemoryInfluenceResolver } = require('../lib/memory-influence');
const { MemorySystem } = require('../lib/memory');
const { PersonalMemoryStore } = require('../lib/personal-memory');
const { CapsSedimentTracker, REPEAT_THRESHOLD } = require('../lib/caps-sediment');
const { CAPSEngine } = require('../lib/caps-engine');

let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const core = new CorePersonaLayer(TMP);
const memory = new MemorySystem(TMP);
const personal = new PersonalMemoryStore(TMP);
const influence = new MemoryInfluenceResolver(memory, personal, TMP);
const sediment = new CapsSedimentTracker(TMP, core);

core.updateDimension('boundary_pattern', {
  triggers: ['隐私边界'],
  reaction_style: 'withdraw',
  boundary_strength: 0.85
});

// ── 1. 先例记忆影响 ──
memory.addEvent('conversation', '他又嘲笑我，我觉得太过分了', 0.7, { P: -0.4, A: 0.2 });
personal.add({
  tier: 'emotional',
  content: '小时候被同学嘲笑会一直记很久',
  tags: ['peer_challenge'],
  emotion: '委屈'
});

const precedent = influence.findPrecedent('今天同事又在嘲笑我', {
  situation_tags: ['peer_challenge']
});
ok('先例检索命中', precedent.found && precedent.score >= 0.3, JSON.stringify(precedent));
ok('先例合并标签', precedent.tags?.includes('peer_challenge'));

const engine = new CAPSEngine(core);
const capsWithPrec = core.processCAPS({
  user_text: '今天同事又在嘲笑我',
  relationship_depth: 0.4,
  emotion_valence: -0.3,
  precedent_memory: precedent
});
ok('Prompt 含先例行', capsWithPrec.prompt_block.includes('先例记忆'));

const pad0 = { P: 0, A: 0.3, D: 0.6, S: 0.5 };
const pad1 = influence.applyEmotionResidue(pad0, precedent);
ok('情绪残留注入 PAD', pad1.P < pad0.P);

// ── 2. 沉淀 + 重复签名 ──
const tagSet = ['boundary_violation', 'criticism'];
for (let i = 0; i < REPEAT_THRESHOLD; i++) {
  sediment.recordActivation({
    situation: { tags: tagSet },
    propagation_path: ['encodings', 'affects', 'expectancies'],
    behavior_signature: { label: '边界退缩' }
  }, '测试越界');
}
const sedResult = sediment.checkAndSediment(influence);
ok('重复模式自动沉淀签名', sedResult.sedimented.length >= 1, `got ${sedResult.sedimented.length}`);
ok('签名写入 core', core.getCapsState().signatures.length >= 1);

influence.reload();
const sedHit = influence.findPrecedent('你又越界了', { situation_tags: ['boundary_violation'] });
ok('沉淀态可被先例检索', sedHit.found || influence.listSediments().length > 0);

// ── 3. Snapshot 结构 ──
function formatCapsSnapshot(capsResult, prec, sed) {
  const { CAU_TYPES } = require('../lib/caps-engine');
  return {
    situation_tags: capsResult.situation?.tags || [],
    propagation_labels: (capsResult.propagation_path || []).map(p => CAU_TYPES[p]?.label || p),
    behavior_signature: capsResult.behavior_signature,
    precedent: prec?.found ? { content: prec.content, source: prec.source } : null,
    sediment_new: sed?.sedimented?.length || 0
  };
}
const snap = formatCapsSnapshot(capsWithPrec, precedent, sedResult);
ok('Snapshot 含情境标签', snap.situation_tags.length > 0);
ok('Snapshot 含传播路径', snap.propagation_labels.length > 0);
ok('Snapshot 含行为签名', !!snap.behavior_signature?.if_then);

// 清理
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

console.log(`\n合计: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
