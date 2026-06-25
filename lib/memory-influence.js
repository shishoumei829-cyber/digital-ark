'use strict';

/**
 * 记忆层 → CAPS 先例输入
 * 三步：情境结构相似 → 情绪残留 → 结果修正（供 processCAPS / PAD 使用）
 */

const fs = require('fs');
const path = require('path');
const { SITUATION_DETECTORS } = require('./caps-engine');

const EMOTION_WORDS = {
  negative: { P: -0.25, A: 0.15, words: /难过|伤心|愤怒|烦|焦虑|害怕|崩溃|委屈/ },
  positive: { P: 0.2, A: 0.1, words: /开心|高兴|感动|温暖|幸福|释然/ },
  stress: { P: -0.15, A: 0.25, words: /压力|累|透支|喘不过气/ }
};

function extractTagsFromText(text) {
  const tags = new Set();
  const t = String(text || '');
  for (const { tag, pattern } of SITUATION_DETECTORS) {
    if (pattern.test(t)) tags.add(tag);
  }
  return [...tags];
}

function tokenSet(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
  );
}

function overlapScore(a, b) {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

function tagOverlap(a, b) {
  if (!a?.length || !b?.length) return 0;
  const inter = a.filter(t => b.includes(t)).length;
  return inter / Math.max(a.length, b.length);
}

class MemoryInfluenceResolver {
  constructor(memorySystem, personalMemoryStore, dataDir) {
    this.memory = memorySystem;
    this.personal = personalMemoryStore;
    this.sedimentPath = path.join(dataDir, 'sediment_memories.json');
    this.sediments = this._loadSediments();
  }

  _loadSediments() {
    try {
      if (fs.existsSync(this.sedimentPath)) {
        return JSON.parse(fs.readFileSync(this.sedimentPath, 'utf8'));
      }
    } catch {}
    return [];
  }

  _saveSediments() {
    fs.writeFileSync(this.sedimentPath, JSON.stringify(this.sediments, null, 2));
  }

  reload() {
    this.sediments = this._loadSediments();
  }

  /**
   * 检索与当前情境最相关的先例
   */
  findPrecedent(userText, context = {}) {
    const queryTags = context.situation_tags?.length
      ? context.situation_tags
      : extractTagsFromText(userText);

    const candidates = [];

    for (const sed of this.sediments) {
      const score = tagOverlap(queryTags, sed.tags || []) * 0.6 + overlapScore(userText, sed.pattern || '') * 0.4;
      if (score > 0.2) {
        candidates.push({
          score: score + 0.1,
          source: 'sediment',
          content: sed.pattern,
          tags: sed.tags || [],
          emotion_residue: sed.emotion_residue || { P: 0, A: 0 },
          outcome: sed.outcome || 'neutral',
          success: sed.outcome !== 'negative',
          dimension: sed.core_dimension || null,
          id: sed.id
        });
      }
    }

    for (const m of this.personal.memories || []) {
      const memTags = [...extractTagsFromText(m.content), ...(m.tags || [])];
      const tagSc = tagOverlap(queryTags, memTags);
      let score = tagSc * 0.55 + overlapScore(userText, m.content) * 0.4;
      if (tagSc >= 0.5) score = Math.max(score, 0.36 + tagSc * 0.12);
      if (score > 0.25) {
        candidates.push({
          score,
          source: 'personal',
          content: m.content,
          tags: memTags,
          emotion_residue: this._emotionFromText(m.content + (m.emotion || '')),
          outcome: /开心|高兴|感动|成功/.test(m.content) ? 'positive' : /难过|失败|受伤/.test(m.content) ? 'negative' : 'neutral',
          success: !/难过|失败|受伤|后悔/.test(m.content),
          dimension: m.tier === 'emotional' ? 'boundary_pattern' : null,
          id: m.id
        });
      }
    }

    const events = (this.memory.events || []).slice(-120);
    for (const e of events) {
      if (!e.content || e.type === 'assistant_reply') continue;
      const eTags = extractTagsFromText(e.content);
      const tagSc = tagOverlap(queryTags, eTags);
      let score = tagSc * 0.55 + overlapScore(userText, e.content) * 0.4;
      if (tagSc >= 0.5) score = Math.max(score, 0.38 + tagSc * 0.15);
      if (score > 0.28) {
        const padDelta = e.padDelta || {};
        candidates.push({
          score,
          source: 'event',
          content: e.content,
          tags: eTags,
          emotion_residue: {
            P: padDelta.P || 0,
            A: padDelta.A || 0
          },
          outcome: (padDelta.P || 0) > 0.1 ? 'positive' : (padDelta.P || 0) < -0.1 ? 'negative' : 'neutral',
          success: e.type === 'feedback' ? /很像|修正/.test(e.content) : (padDelta.P || 0) >= 0,
          dimension: e.type === 'feedback' ? 'interpersonal_style' : null,
          id: e.id
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    if (!best || best.score < 0.28) {
      return { found: false, tags: queryTags, score: best?.score || 0 };
    }

    return {
      found: true,
      tags: [...new Set([...queryTags, ...best.tags])],
      content: best.content,
      emotion_residue: best.emotion_residue,
      outcome: best.outcome,
      success: best.success,
      dimension: best.dimension,
      source: best.source,
      source_id: best.id,
      score: best.score
    };
  }

  _emotionFromText(text) {
    const residue = { P: 0, A: 0 };
    for (const cfg of Object.values(EMOTION_WORDS)) {
      if (cfg.words.test(text)) {
        residue.P += cfg.P;
        residue.A += cfg.A;
      }
    }
    return residue;
  }

  /**
   * 情绪残留注入 PAD（小幅，避免覆盖当前推断）
   */
  applyEmotionResidue(pad, precedent) {
    if (!precedent?.found) return pad;
    const r = precedent.emotion_residue || {};
    const blend = 0.22;
    return {
      ...pad,
      P: clamp(pad.P + (r.P || 0) * blend, -1, 1),
      A: clamp(pad.A + (r.A || 0) * blend, 0, 1)
    };
  }

  /**
   * 写入沉淀态记忆
   */
  addSediment(entry) {
    const sed = {
      id: entry.id || `sed_${Date.now()}`,
      pattern: entry.pattern,
      tags: entry.tags || [],
      origin_ids: entry.origin_ids || [],
      core_dimension: entry.core_dimension || null,
      emotion_residue: entry.emotion_residue || { P: 0, A: 0 },
      outcome: entry.outcome || 'neutral',
      cau_path: entry.cau_path || [],
      confidence: entry.confidence ?? 0.75,
      sediment_date: Date.now()
    };
    const dup = this.sediments.find(s =>
      s.pattern === sed.pattern && tagOverlap(s.tags, sed.tags) > 0.8
    );
    if (dup) {
      dup.confidence = Math.min(1, (dup.confidence || 0.7) + 0.08);
      dup.sediment_date = Date.now();
      this._saveSediments();
      return dup;
    }
    this.sediments.push(sed);
    if (this.sediments.length > 100) this.sediments = this.sediments.slice(-100);
    this._saveSediments();
    return sed;
  }

  listSediments() {
    return this.sediments;
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

module.exports = { MemoryInfluenceResolver, extractTagsFromText, tagOverlap };
