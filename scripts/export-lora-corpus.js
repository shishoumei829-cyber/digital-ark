'use strict';

const fs = require('fs');
const path = require('path');
const { buildDigitalTwinPrompt } = require('../lib/prompt-builder');

/**
 * 导出 LoRA / SFT 语料（Alpaca + ShareGPT 混合格式 JSONL）
 */
async function exportCorpus({ dataDir, repoRoot, personaId = 'alisa-kujo', setupStore, personalMemory, relationshipStore, feedbackLearning, trainingSystem }) {
  let bundle;
  const bundlePath = path.join(repoRoot, 'config', 'personas', `${personaId}.json`);
  const reviewPath = path.join(dataDir, 'persona', 'review', `${personaId}.json`);

  if (personaId === 'user' && setupStore && personalMemory) {
    const { buildUserPersonaBundle } = require('../lib/user-persona-bundle');
    bundle = buildUserPersonaBundle({
      dataDir, setupStore, personalMemory, relationshipStore, feedbackLearning, trainingSystem
    });
  } else if (fs.existsSync(reviewPath)) {
    bundle = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  } else if (fs.existsSync(bundlePath)) {
    bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  } else {
    throw new Error('Persona not found: ' + personaId);
  }
  const outDir = path.join(dataDir, 'finetune');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${personaId}.jsonl`);

  const systemBase = buildDigitalTwinPrompt({
    mode: 'training',
    padDesc: '平静',
    personaProfile: {
      display_name: bundle.display_name,
      trainee_label: bundle.trainee_label,
      meta: bundle.meta,
      voice: bundle.voice,
      emotion: bundle.emotion
    },
    traitSummary: {
      core_traits: bundle.meta?.core_traits,
      speech_patterns: bundle.voice?.speech_patterns,
      verbal_tics: bundle.voice?.verbal_tics,
      cognition: bundle.cognition,
      emotion_style: bundle.emotion
    },
    displayName: bundle.display_name,
    traineeName: bundle.trainee_label
  });

  const rows = [];

  for (const sample of bundle.dialogue_samples || []) {
    rows.push({
      instruction: systemBase,
      input: sample.user,
      output: sample.assistant,
      source: 'persona_dialogue'
    });
  }

  for (const mem of bundle.memories || []) {
    rows.push({
      instruction: systemBase,
      input: `请以第一人称回忆：${mem.time || ''} ${mem.place || ''}`.trim(),
      output: mem.content,
      source: 'persona_memory'
    });
  }

  for (const rel of bundle.relationships || []) {
    for (const sc of rel.scenarios || []) {
      rows.push({
        instruction: systemBase,
        input: `【对${rel.name}】${sc.scene}`,
        output: sc.response_text,
        source: 'persona_relationship'
      });
    }
  }

  for (const es of bundle.emotion?.scenarios || []) {
    rows.push({
      instruction: systemBase,
      input: es.scenario,
      output: es.response,
      source: 'persona_emotion'
    });
  }

  const sessionsPath = path.join(dataDir, 'training_sessions.json');
  if (fs.existsSync(sessionsPath)) {
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
    for (const s of sessions.slice(-200)) {
      if (s.type === 'memory' && s.data?.content) {
        rows.push({
          instruction: systemBase,
          input: '分享一段你的记忆',
          output: s.data.content,
          source: 'session_memory'
        });
      }
      if (s.type === 'relationship' && s.data?.responseText) {
        rows.push({
          instruction: systemBase,
          input: s.data.scenario || '关系场景',
          output: s.data.responseText,
          source: 'session_relationship'
        });
      }
      if (s.type === 'emotion' && s.data?.response) {
        rows.push({
          instruction: systemBase,
          input: s.data.scenario || '情绪场景',
          output: s.data.response,
          source: 'session_emotion'
        });
      }
      if (s.type === 'cognition' && s.data?.conflictChoices?.length) {
        const last = s.data.conflictChoices[s.data.conflictChoices.length - 1];
        const choice = last?.choice || last;
        if (choice) {
          rows.push({
            instruction: systemBase,
            input: '面临选择时你会怎么做？',
            output: String(choice),
            source: 'session_cognition'
          });
        }
      }
    }
  }

  const fbPath = path.join(dataDir, 'feedback_learning.json');
  if (fs.existsSync(fbPath)) {
    const fbFile = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
    for (const e of fbFile.positive || []) {
      if (e.user && e.reply && !rows.some(r => r.input === e.user && r.output === e.reply)) {
        rows.push({ instruction: systemBase, input: e.user, output: e.reply, source: 'feedback_positive' });
      }
    }
    for (const e of fbFile.negative || []) {
      const fix = e.correction || e.preferred_reply;
      if (e.user && fix && !rows.some(r => r.input === e.user && r.output === fix)) {
        rows.push({ instruction: systemBase, input: e.user, output: fix, source: 'feedback_correction' });
      }
    }
  }

  if (feedbackLearning?.exportForFineTune) {
    for (const row of feedbackLearning.exportForFineTune()) {
      if (row.user && row.assistant && !row.reject) {
        if (!rows.some(r => r.input === row.user && r.output === row.assistant)) {
          rows.push({ instruction: systemBase, input: row.user, output: row.assistant, source: row.source || 'feedback' });
        }
      }
    }
  }

  const lines = rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  fs.writeFileSync(outPath, lines);

  const metaPath = path.join(outDir, `${personaId}.meta.json`);
  fs.writeFileSync(metaPath, JSON.stringify({
    persona_id: personaId,
    rows: rows.length,
    exported_at: new Date().toISOString(),
    corpus_path: outPath,
    base_model_hint: process.env.LORA_BASE_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
  }, null, 2));

  return { path: outPath, meta_path: metaPath, rows: rows.length };
}

module.exports = { exportCorpus };

if (require.main === module) {
  const dataDir = process.env.DATA_DIR || require('os').homedir() + '/digital_ark_data';
  exportCorpus({ dataDir, repoRoot: path.join(__dirname, '..'), personaId: process.env.PERSONA_ID || 'alisa-kujo' })
    .then(r => { console.log(JSON.stringify(r, null, 2)); })
    .catch(e => { console.error(e); process.exit(1); });
}
