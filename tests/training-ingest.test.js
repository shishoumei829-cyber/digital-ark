'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { extractCognitionUpdates } = require('../lib/cognition-extractor');
const { TrainingIngestor } = require('../lib/training-ingest');
const { CorePersonaLayer } = require('../lib/core-persona');

describe('cognition-extractor', () => {
  it('maps value choice to value_priority', () => {
    const extractions = extractCognitionUpdates({
      question: '朋友借钱不还，你会？',
      choice: '先讲道理，再给一次机会',
      options: ['直接绝交', '先讲道理，再给一次机会', '装作不知道']
    });
    const vp = extractions.find(e => e.dimension === 'value_priority');
    assert.ok(vp);
    assert.ok(vp.updates.ranked_values.includes('真理') || vp.updates.ranked_values.includes('责任'));
  });

  it('extracts moral principles from boundary language', () => {
    const extractions = extractCognitionUpdates({
      question: '同事越界打听隐私',
      choice: '明确说不能接受',
      options: []
    });
    const moral = extractions.find(e => e.dimension === 'moral_judgment');
    const boundary = extractions.find(e => e.dimension === 'boundary_pattern');
    assert.ok(moral || boundary);
  });
});

describe('training-ingest', () => {
  it('writes cognition into core-persona dimensions', () => {
    const dir = path.join(os.tmpdir(), 'da_ingest_' + Date.now());
    fs.mkdirSync(dir, { recursive: true });
    const core = new CorePersonaLayer(dir);
    const ingestor = new TrainingIngestor({
      corePersona: core,
      dataDir: dir,
      finetunePersonaId: 'user'
    });

    ingestor.ingestCognition({
      task: { task_id: 'cog_1', question: '朋友借钱不还，你会？', options: ['绝交', '讲道理再给机会'] },
      choice: '讲道理再给机会',
      valuesRanking: ['责任', '真理'],
      conflictChoices: [{ choice: '讲道理再给机会' }]
    });

    const state = core.getState();
    assert.ok(state.dimensions.value_priority.ranked_values.length >= 1);
    assert.ok(fs.existsSync(path.join(dir, 'finetune', 'user.jsonl')));
  });
});
