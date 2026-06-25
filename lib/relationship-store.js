'use strict';

const fs = require('fs');
const path = require('path');
const { RELATIONSHIP_TYPES, DEFAULT_INTIMACY, SCENARIO_LIBRARY } = require('./design-spec');

class RelationshipStore {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'relationship_profiles.json');
    this.scenariosPath = path.join(dataDir, 'relationship_scenarios_done.json');
    this.people = this._load(this.path, []);
    this.completedScenarios = this._load(this.scenariosPath, []);
  }

  _load(p, def) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    return def;
  }

  _save(p, data) {
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  }

  list() {
    return this.people.map(p => ({ ...p, intimacy: p.intimacy || { ...DEFAULT_INTIMACY } }));
  }

  get(id) {
    return this.people.find(p => p.id === id) || null;
  }

  upsert(data) {
    const type = data.type || 'friend';
    if (!RELATIONSHIP_TYPES[type]) throw new Error('无效关系类型');
    const existing = data.id ? this.people.find(p => p.id === data.id) : null;
    const person = {
      id: existing?.id || `rel_${Date.now()}`,
      name: String(data.name || '未命名').trim(),
      type,
      intimacy: { ...DEFAULT_INTIMACY, ...(existing?.intimacy || {}), ...(data.intimacy || {}) },
      notes: data.notes || '',
      updated: Date.now(),
      created: existing?.created || Date.now()
    };
    if (existing) {
      Object.assign(existing, person);
    } else {
      this.people.push(person);
    }
    this._save(this.path, this.people);
    return person;
  }

  remove(id) {
    this.people = this.people.filter(p => p.id !== id);
    this._save(this.path, this.people);
  }

  completeScenario(personId, category, scenarioText, response) {
    const entry = {
      id: `sc_${Date.now()}`,
      person_id: personId,
      category,
      scenario: scenarioText,
      response,
      timestamp: Date.now()
    };
    this.completedScenarios.push(entry);
    this._save(this.scenariosPath, this.completedScenarios);
    return entry;
  }

  getScenarioLibrary(category) {
    if (category) return { [category]: SCENARIO_LIBRARY[category] || [] };
    return { ...SCENARIO_LIBRARY };
  }

  getStats() {
    const byCategory = { family: 0, friend: 0, daily: 0 };
    for (const s of this.completedScenarios) {
      if (byCategory[s.category] !== undefined) byCategory[s.category]++;
    }
    return {
      people_count: this.people.length,
      scenarios_completed: this.completedScenarios.length,
      by_category: byCategory
    };
  }

  getStyleHint(personId) {
    const p = this.get(personId);
    if (!p) return '';
    const t = RELATIONSHIP_TYPES[p.type];
    const i = p.intimacy || DEFAULT_INTIMACY;
    return `与${p.name}（${t.label}，亲密度Lv.${t.level}）对话：距离感${i.distance}/10，主动性${i.initiative}/10，情绪共享${i.emotional_depth}/10。`;
  }
}

module.exports = { RelationshipStore };
