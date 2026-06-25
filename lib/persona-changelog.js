'use strict';

const fs = require('fs');
const path = require('path');

class PersonaChangelogStore {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'persona_changelog.json');
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {}
    return {
      version: 'v0.1',
      version_num: 1,
      entries: []
    };
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  bumpVersion() {
    this.data.version_num = (this.data.version_num || 1) + 1;
    this.data.version = `v0.${this.data.version_num}`;
    this._save();
    return this.data.version;
  }

  append({ source, module, summary, changes = [] }) {
    const entry = {
      id: `chg_${Date.now()}`,
      ts: Date.now(),
      source: source || 'system',
      module: module || null,
      summary: String(summary || '').slice(0, 500),
      changes: (changes || []).map(c => String(c).slice(0, 300)).filter(Boolean)
    };
    if (!entry.summary && !entry.changes.length) return null;
    this.data.entries.push(entry);
    if (this.data.entries.length > 80) this.data.entries = this.data.entries.slice(-80);
    const version = this.bumpVersion();
    this._save();
    return { entry, version };
  }

  getRecent(limit = 5) {
    return {
      version: this.data.version,
      version_num: this.data.version_num,
      entries: [...(this.data.entries || [])].reverse().slice(0, limit)
    };
  }
}

module.exports = { PersonaChangelogStore };
