'use strict';

/**
 * 本地 RAG 向量检索
 * 优先 Ollama embeddings，降级为本地哈希向量
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIM = 256;

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

function localEmbed(text) {
  const vec = new Array(DIM).fill(0);
  const t = String(text || '').toLowerCase();
  for (let i = 0; i < t.length - 1; i++) {
    const gram = t.slice(i, i + 2);
    const h = crypto.createHash('md5').update(gram).digest();
    for (let j = 0; j < 4; j++) {
      vec[(h[j] + i) % DIM] += 1;
    }
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

class RAGStore {
  constructor(dataDir, ollamaBase, embedModel) {
    this.indexPath = path.join(dataDir, 'vector_index.json');
    this.ollamaBase = (ollamaBase || '').replace(/\/$/, '');
    this.embedModel = embedModel || process.env.EMBED_MODEL || 'nomic-embed-text';
    this.items = this._load();
    this.ollamaOk = null;
  }

  _load() {
    try {
      if (fs.existsSync(this.indexPath)) {
        return JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      }
    } catch {}
    return [];
  }

  save() {
    fs.writeFile(this.indexPath, JSON.stringify(this.items.slice(-800), null, 2), err => {
      if (err) console.error('[rag] save error:', err.message);
    });
  }

  async checkOllama() {
    try {
      const res = await fetch(`${this.ollamaBase}/api/tags`, { signal: AbortSignal.timeout(2000) });
      this.ollamaOk = res.ok;
      return res.ok;
    } catch {
      this.ollamaOk = false;
      return false;
    }
  }

  async embed(text) {
    const prompt = String(text || '').slice(0, 2000);
    if (!prompt) return localEmbed('empty');

    try {
      const res = await fetch(`${this.ollamaBase}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.embedModel, prompt }),
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.embedding) && data.embedding.length) {
          return data.embedding;
        }
      }
    } catch {}

    return localEmbed(prompt);
  }

  async add(id, text, metadata = {}) {
    const vector = await this.embed(text);
    this.items = this.items.filter(x => x.id !== id);
    this.items.push({
      id,
      text: String(text).slice(0, 800),
      vector,
      metadata,
      ts: Date.now()
    });
    this.save();
    return id;
  }

  async search(query, k = 5, options = {}) {
    if (!this.items.length) return [];
    const minScore = options.minScore ?? 0.25;
    const types = options.types;
    const qv = await this.embed(query);
    let hits = this.items
      .map(item => ({ ...item, score: cosine(qv, item.vector) }))
      .filter(x => x.score >= minScore);
    if (types?.length) {
      hits = hits.filter(x => types.includes(x.metadata?.type));
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }

  getStats() {
    return {
      index_size: this.items.length,
      embed_model: this.embedModel,
      mode: this.ollamaOk === false ? 'local_fallback' : 'ollama_or_hybrid'
    };
  }

  formatContext(hits) {
    if (!hits.length) return '';
    return hits.map(h => `- [相关度 ${(h.score * 100).toFixed(0)}%] ${h.text}`).join('\n');
  }
}

module.exports = { RAGStore, localEmbed, cosine };
