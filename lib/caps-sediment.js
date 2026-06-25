'use strict';

/**
 * CAPS 沉淀：记录激活路径，重复模式固化为行为签名 / 自定义边
 */

const fs = require('fs');
const path = require('path');
const { CAPSEngine } = require('./caps-engine');

const REPEAT_THRESHOLD = 3;

class CapsSedimentTracker {
  constructor(dataDir, corePersona) {
    this.core = corePersona;
    this.logPath = path.join(dataDir, 'caps_activation_log.json');
    this.log = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.logPath)) return JSON.parse(fs.readFileSync(this.logPath, 'utf8'));
    } catch {}
    return [];
  }

  _save() {
    if (this.log.length > 400) this.log = this.log.slice(-400);
    fs.writeFileSync(this.logPath, JSON.stringify(this.log, null, 2));
  }

  _key(entry) {
    const tags = (entry.tags || []).slice().sort().join('|');
    const path = (entry.cau_path || []).join('>');
    return `${tags}::${path}`;
  }

  recordActivation(capsResult, userText) {
    const entry = {
      timestamp: Date.now(),
      tags: capsResult.situation?.tags || [],
      cau_path: capsResult.propagation_path || [],
      signature: capsResult.behavior_signature?.label,
      user_snippet: String(userText || '').slice(0, 80)
    };
    this.log.push(entry);
    this._save();
    return entry;
  }

  /**
   * 统计重复路径，达到阈值则沉淀为签名；返回本轮新沉淀项
   */
  /** 最近 CAPS 激活记录（供用户审查） */
  getActivationLog(limit = 50) {
    return this.log.slice(-limit).map(e => ({
      at: e.timestamp,
      tags: e.tags,
      cau_path: e.cau_path,
      signature: e.signature,
      user_snippet: e.user_snippet
    }));
  }

  checkAndSediment(memoryInfluence) {
    const counts = new Map();
    const samples = new Map();

    for (const entry of this.log.slice(-80)) {
      const k = this._key(entry);
      counts.set(k, (counts.get(k) || 0) + 1);
      if (!samples.has(k)) samples.set(k, entry);
    }

    const state = this.core.getState();
    const existing = new Set(
      (state.caps?.signatures || []).map(s => (s.if?.tags || []).sort().join('|'))
    );

    const sedimented = [];

    for (const [key, count] of counts.entries()) {
      if (count < REPEAT_THRESHOLD) continue;
      const sample = samples.get(key);
      const tagKey = (sample.tags || []).sort().join('|');
      if (existing.has(tagKey)) continue;

      const sig = CAPSEngine.buildSignaturePayload({
        if_tags: sample.tags,
        behavior: sample.signature || '与过往相似情境时保持一致反应',
        output_hint: sample.signature,
        cau_path: sample.cau_path,
        label: `自动沉淀·${sample.signature || '稳定模式'}`,
        confidence: Math.min(0.9, 0.65 + count * 0.05)
      });

      this.core.addBehaviorSignature(sig);
      existing.add(tagKey);

      if (memoryInfluence && sample.tags?.length) {
        memoryInfluence.addSediment({
          pattern: `反复出现：${sample.tags.join('、')} → ${sample.signature || '稳定反应'}`,
          tags: sample.tags,
          core_dimension: this._inferDimension(sample),
          cau_path: sample.cau_path,
          outcome: 'neutral',
          confidence: sig.confidence,
          origin_ids: []
        });
      }

      const customEdge = this._maybeAddEdge(sample);
      sedimented.push({ signature: sig, custom_edge: customEdge, count, key });
    }

    return { sedimented, suggestions: sedimented.length ? [] : this._pendingSuggestions(counts) };
  }

  _inferDimension(sample) {
    const tags = sample.tags || [];
    if (tags.includes('boundary_violation')) return 'boundary_pattern';
    if (tags.includes('peer_challenge')) return 'interpersonal_style';
    if (tags.includes('core_value_conflict')) return 'value_priority';
    if (tags.includes('authority_present')) return 'self_regulation';
    return 'interpersonal_style';
  }

  _maybeAddEdge(sample) {
    const pathArr = sample.cau_path || [];
    if (pathArr.length < 2) return null;
    return this.core.addCustomEdge(pathArr[0], pathArr[1], 0.9, 'sediment_auto');
  }

  _pendingSuggestions(counts) {
    const out = [];
    for (const [key, count] of counts.entries()) {
      if (count === REPEAT_THRESHOLD - 1) {
        out.push({ key, count, hint: '再出现一次相似情境将自动沉淀为行为签名' });
      }
    }
    return out.slice(0, 3);
  }
}

module.exports = { CapsSedimentTracker, REPEAT_THRESHOLD };
