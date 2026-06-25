'use strict';

const fs = require('fs');
const path = require('path');
const { MEMORY_TIERS, DAILY_MEMORY_PROMPTS } = require('./design-spec');

class PersonalMemoryStore {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'personal_memories.json');
    this.memories = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {}
    return [];
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.memories, null, 2));
  }

  add(entry) {
    const mem = {
      id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tier: entry.tier || 'core',
      content: String(entry.content || '').trim(),
      time: entry.time || null,
      place: entry.place || null,
      people: entry.people || [],
      emotion: entry.emotion || null,
      tags: entry.tags || [],
      related_person_id: entry.related_person_id || null,
      photos: entry.photos || [],
      source: entry.source || 'training',
      timestamp: Date.now()
    };
    if (!mem.content) throw new Error('记忆内容不能为空');
    if (!MEMORY_TIERS[mem.tier]) throw new Error('无效记忆层级');
    this.memories.push(mem);
    this._save();
    return mem;
  }

  list({ tier, limit = 50, offset = 0 } = {}) {
    let list = [...this.memories];
    if (tier) list = list.filter(m => m.tier === tier);
    return {
      items: list.slice(offset, offset + limit),
      total: list.length,
      by_tier: this.countByTier()
    };
  }

  countByTier() {
    const counts = {};
    for (const k of Object.keys(MEMORY_TIERS)) counts[k] = 0;
    for (const m of this.memories) counts[m.tier] = (counts[m.tier] || 0) + 1;
    return counts;
  }

  getStats() {
    const core = this.memories.filter(m => m.tier === 'core').length;
    const withDetail = this.memories.filter(m => {
      let n = 0;
      if (m.time) n++;
      if (m.place) n++;
      if (m.people?.length) n++;
      if (m.emotion) n++;
      return n >= 3;
    }).length;
    return {
      total: this.memories.length,
      core_memories: core,
      detail_quality_ratio: this.memories.length ? withDetail / this.memories.length : 0
    };
  }

  getDailyPrompt() {
    const idx = new Date().getDate() % DAILY_MEMORY_PROMPTS.length;
    return DAILY_MEMORY_PROMPTS[idx];
  }

  searchContext(query, limit = 5) {
    if (!query) return this.memories.slice(-limit);
    const q = query.toLowerCase();
    return this.memories
      .filter(m => m.content.toLowerCase().includes(q) || m.tags.some(t => t.includes(q)))
      .slice(-limit);
  }
}

module.exports = { PersonalMemoryStore };
