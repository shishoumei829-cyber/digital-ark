'use strict';

const { extractCognitionUpdates } = require('./cognition-extractor');
const { FinetuneCorpusStore } = require('./finetune-corpus');
const { buildDigitalTwinPrompt } = require('./prompt-builder');

const RELATION_STYLE_MAP = {
  emotional: '温柔',
  rational: '理性',
  humorous: '幽默',
  distant: '直接',
  supportive: '温柔',
  defensive: '嘴硬'
};

function mergeArrayField(existing, incoming) {
  return [...new Set([...(existing || []), ...(incoming || [])])];
}

class TrainingIngestor {
  constructor({ corePersona, recordTwinChange, dataDir, personaProfile, finetunePersonaId = 'user' }) {
    this.corePersona = corePersona;
    this.recordTwinChange = recordTwinChange || (() => null);
    this.corpus = dataDir ? new FinetuneCorpusStore(dataDir, finetunePersonaId) : null;
    this.personaProfile = personaProfile;
    this._instructionCache = null;
  }

  _systemInstruction() {
    if (this._instructionCache) return this._instructionCache;
    const active = this.personaProfile?.getActive?.() || {};
    this._instructionCache = buildDigitalTwinPrompt({
      mode: 'training',
      padDesc: '平静',
      personaProfile: active,
      traitSummary: {
        core_traits: active.meta?.core_traits,
        speech_patterns: active.voice?.speech_patterns,
        verbal_tics: active.voice?.verbal_tics,
        cognition: active.cognition,
        emotion_style: active.emotion
      },
      displayName: active.display_name || '数字分身',
      traineeName: active.trainee_label || active.display_name
    });
    return this._instructionCache;
  }

  _appendCorpus({ input, output, source, task_id }) {
    if (!this.corpus || !input || !output) return;
    try {
      this.corpus.append({
        instruction: this._systemInstruction(),
        input,
        output,
        source,
        task_id
      });
    } catch (e) {
      console.warn('[training-ingest] corpus append:', e.message);
    }
  }

  _applyDimensionUpdates(extractions, source) {
    const applied = [];
    for (const { dimension, updates } of extractions) {
      const dim = this.corePersona.getDimension(dimension);
      if (!dim) continue;
      const merged = { ...updates };
      if (updates.ranked_values) {
        merged.ranked_values = mergeArrayField(dim.ranked_values, updates.ranked_values).slice(0, 12);
      }
      if (updates.principles) {
        merged.principles = mergeArrayField(dim.principles, updates.principles).slice(0, 10);
      }
      if (updates.core_traits) {
        merged.core_traits = mergeArrayField(dim.core_traits, updates.core_traits).slice(0, 10);
      }
      if (updates.triggers) {
        merged.triggers = mergeArrayField(dim.triggers, updates.triggers).slice(0, 10);
      }
      if (updates.standards) {
        merged.standards = mergeArrayField(dim.standards, updates.standards).slice(0, 10);
      }
      if (updates.traits) {
        merged.traits = mergeArrayField(dim.traits, updates.traits).slice(0, 10);
      }
      if (updates.focus_preferences) {
        merged.focus_preferences = mergeArrayField(dim.focus_preferences, updates.focus_preferences).slice(0, 8);
      }
      this.corePersona.updateDimension(dimension, merged, source);
      applied.push({ dimension, keys: Object.keys(merged) });
    }
    return applied;
  }

  ingestCognition({ task, choice, valuesRanking, conflictChoices }) {
    const question = task?.question || task?.prompt || '';
    const options = task?.options || [];
    const extractions = extractCognitionUpdates({
      question,
      choice,
      options,
      valuesRanking,
      conflictChoices
    });
    const applied = this._applyDimensionUpdates(extractions, 'training_cognition');

    if (choice) {
      this._appendCorpus({
        input: question || '认知决策',
        output: choice,
        source: 'training_cognition',
        task_id: task?.task_id || task?.id
      });
    }

    if (applied.length) {
      this.recordTwinChange({
        source: 'training',
        module: 'cognition',
        summary: `认知训练更新了核心层：${applied.map(a => a.dimension).join('、')}`,
        changes: applied
      });
    }
    return { applied, extractions };
  }

  ingestEmotion({ task, scenario, response, stressReaction, comfortStyle }) {
    const scene = scenario || task?.scenario || '情绪场景';
    if (response) {
      this.corePersona.extractFromConversation(scene, response, { module: 'emotion' });
    }
    const extractions = [];
    if (stressReaction) {
      extractions.push({
        dimension: 'self_regulation',
        updates: { stress_coping: stressReaction }
      });
    }
    if (comfortStyle) {
      const style = comfortStyle === 'accompany_first' ? '温柔' : comfortStyle === 'solve_first' ? '理性' : '温柔';
      extractions.push({
        dimension: 'interpersonal_style',
        updates: { core_traits: [style] }
      });
    }
    const applied = this._applyDimensionUpdates(extractions, 'training_emotion');

    if (response) {
      this._appendCorpus({
        input: scene,
        output: response,
        source: 'training_emotion',
        task_id: task?.task_id || task?.id
      });
    }

    if (applied.length || response) {
      this.recordTwinChange({
        source: 'training',
        module: 'emotion',
        summary: '情感训练已沉淀到核心层与语料',
        changes: applied
      });
    }
    return { applied };
  }

  ingestRelationship({ task, scene, responseText, responseType }) {
    const sc = scene || task?.scene || '关系场景';
    const trait = RELATION_STYLE_MAP[responseType] || '温柔';
    const extractions = [{
      dimension: 'interpersonal_style',
      updates: { core_traits: [trait] }
    }];
    if (responseText) {
      this.corePersona.extractFromConversation(sc, responseText, { module: 'relationship' });
    }
    const applied = this._applyDimensionUpdates(extractions, 'training_relationship');

    if (responseText) {
      this._appendCorpus({
        input: `【关系】${sc}`,
        output: responseText,
        source: 'training_relationship',
        task_id: task?.task_id || task?.id
      });
    }

    if (applied.length || responseText) {
      this.recordTwinChange({
        source: 'training',
        module: 'relationship',
        summary: '关系训练已沉淀到核心层与语料',
        changes: applied
      });
    }
    return { applied };
  }

  ingestMemory({ task, content, tier, tags }) {
    const t = tier || task?.tier || 'core';
    const tagList = tags || task?.suggested_tags || [];
    const extractions = [];

    const principleTags = tagList.filter(tag => /原则|价值观|道德|信念/.test(tag));
    const contentText = content || '';
    if (t === 'core' || principleTags.length) {
      const principles = principleTags.length
        ? principleTags
        : (/原则|价值观|信念/.test(contentText) ? ['人生信念'] : []);
      if (principles.length) {
        extractions.push({
          dimension: 'moral_judgment',
          updates: { principles }
        });
      }
      if (contentText.length >= 20) {
        this.corePersona.extractFromConversation('记忆回忆', contentText, { module: 'memory', tier: t });
      }
    }

    if (/日常|习惯|节奏/.test(tagList.join('')) || t === 'daily') {
      extractions.push({
        dimension: 'quality_traits',
        updates: { traits: ['生活规律'] }
      });
    }

    const applied = this._applyDimensionUpdates(extractions, 'training_memory');

    if (content) {
      this._appendCorpus({
        input: '分享一段你的记忆',
        output: content,
        source: 'training_memory',
        task_id: task?.task_id || task?.id
      });
    }

    if (applied.length) {
      this.recordTwinChange({
        source: 'training',
        module: 'memory',
        summary: '记忆训练已沉淀到核心层',
        changes: applied
      });
    }
    return { applied };
  }
}

module.exports = { TrainingIngestor, mergeArrayField };
