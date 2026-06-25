'use strict';

const fs = require('fs');
const path = require('path');

class FinetuneCorpusStore {
  constructor(dataDir, personaId = 'user') {
    this.personaId = personaId;
    this.dir = path.join(dataDir, 'finetune');
    this.corpusPath = path.join(this.dir, `${personaId}.jsonl`);
    this.metaPath = path.join(this.dir, `${personaId}.incremental.meta.json`);
    fs.mkdirSync(this.dir, { recursive: true });
    this.seen = this._loadSeen();
  }

  _loadSeen() {
    const seen = new Set();
    try {
      if (fs.existsSync(this.corpusPath)) {
        const lines = fs.readFileSync(this.corpusPath, 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const row = JSON.parse(line);
            if (row.task_id && row.input) seen.add(`${row.task_id}::${row.input}`);
            else if (row.input && row.output) seen.add(`${row.input}::${row.output}`);
          } catch {}
        }
      }
      if (fs.existsSync(this.metaPath)) {
        const meta = JSON.parse(fs.readFileSync(this.metaPath, 'utf8'));
        (meta.seen_keys || []).forEach(k => seen.add(k));
      }
    } catch {}
    return seen;
  }

  _saveMeta() {
    fs.writeFileSync(this.metaPath, JSON.stringify({
      persona_id: this.personaId,
      rows: this.count(),
      seen_keys: [...this.seen].slice(-2000),
      updated_at: Date.now()
    }, null, 2));
  }

  count() {
    try {
      if (!fs.existsSync(this.corpusPath)) return 0;
      return fs.readFileSync(this.corpusPath, 'utf8').split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  append({ instruction, input, output, source, task_id }) {
    if (!input || !output) return false;
    const key = task_id ? `${task_id}::${input}` : `${input}::${output}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);

    const row = {
      instruction: instruction || '',
      input: String(input).slice(0, 800),
      output: String(output).slice(0, 1200),
      source: source || 'training',
      task_id: task_id || null,
      ts: Date.now()
    };
    fs.appendFileSync(this.corpusPath, JSON.stringify(row) + '\n');
    this._saveMeta();
    return true;
  }
}

module.exports = { FinetuneCorpusStore };
