'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 从用户真实训练数据动态组装 Persona 包（供审查与 LoRA 导出）
 */
function buildUserPersonaBundle({
  dataDir,
  setupStore,
  personalMemory,
  relationshipStore,
  feedbackLearning,
  trainingSystem
}) {
  const setup = setupStore.get();
  const subject = setup.subject_name?.trim() || '用户分身';
  const trainer = setup.trainer_name?.trim() || '训练者';

  const memories = (personalMemory.list({ limit: 500 }).items || [])
    .filter(m => !String(m.source || '').startsWith('persona:'));

  const relationships = relationshipStore.list() || [];
  const completedScenarios = relationshipStore.completedScenarios || [];
  const sessions = trainingSystem.sessions || [];

  const dialogue_samples = [];
  const fb = feedbackLearning?.data || { positive: [], negative: [] };

  for (const e of fb.positive || []) {
    if (e.user && e.reply) {
      dialogue_samples.push({ user: e.user, assistant: e.reply, source: 'feedback_positive' });
    }
  }
  for (const e of fb.negative || []) {
    if (e.user && e.correction) {
      dialogue_samples.push({
        user: e.user,
        assistant: e.correction,
        source: 'feedback_correction'
      });
    } else if (e.user && e.preferred_reply) {
      dialogue_samples.push({
        user: e.user,
        assistant: e.preferred_reply,
        source: 'feedback_correction'
      });
    }
  }

  for (const s of sessions.slice(-100)) {
    if (s.type === 'relationship' && s.data?.responseText) {
      dialogue_samples.push({
        user: s.data.scene || '关系场景',
        assistant: s.data.responseText,
        source: 'session_relationship'
      });
    }
    if (s.type === 'emotion' && s.data?.response) {
      dialogue_samples.push({
        user: s.data.scenario || '情绪场景',
        assistant: s.data.response,
        source: 'session_emotion'
      });
    }
  }

  const relBundles = relationships.map(p => ({
    name: p.name,
    type: p.type,
    notes: p.notes,
    intimacy_level: p.intimacy?.level,
    scenarios: completedScenarios
      .filter(sc => sc.person_id === p.id)
      .map(sc => ({
        scene: sc.scenario,
        response_text: sc.response,
        pattern: sc.category
      }))
  }));

  const emotionScenarios = sessions
    .filter(s => s.type === 'emotion' && s.data?.response)
    .slice(-20)
    .map(s => ({
      scenario: s.data.scenario,
      response: s.data.response
    }));

  const capturesPath = path.join(dataDir, 'chat_training_captures.json');
  let chatCaptures = [];
  try {
    if (fs.existsSync(capturesPath)) {
      chatCaptures = JSON.parse(fs.readFileSync(capturesPath, 'utf8')).slice(-50);
    }
  } catch {}

  for (const c of chatCaptures) {
    if (c.user && c.saved_content) {
      dialogue_samples.push({
        user: c.user,
        assistant: c.saved_content,
        source: 'chat_capture'
      });
    }
  }

  return {
    id: 'user',
    version: Date.now(),
    display_name: subject,
    trainee_label: subject,
    meta: {
      core_traits: [],
      trainer_name: trainer,
      trainer_role: setup.trainer_role,
      generated: true,
      memory_count: memories.length,
      relationship_count: relationships.length
    },
    memories: memories.map(m => ({
      tier: m.tier,
      content: m.content,
      time: m.time,
      place: m.place,
      tags: m.tags,
      source: m.source
    })),
    relationships: relBundles,
    emotion: { scenarios: emotionScenarios },
    dialogue_samples,
    voice: { description: '来自用户训练提交与反馈修正' },
    cognition: { values_ranking: [] }
  };
}

function saveUserBundleReview(dataDir, bundle) {
  const dir = path.join(dataDir, 'persona', 'review');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'user.json');
  fs.writeFileSync(p, JSON.stringify(bundle, null, 2));
  return p;
}

module.exports = { buildUserPersonaBundle, saveUserBundleReview };
