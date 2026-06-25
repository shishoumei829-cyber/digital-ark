'use strict';

const fs = require('fs');
const path = require('path');

class FeedbackLearningStore {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'feedback_learning.json');
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {}
    return {
      positive: [],
      negative: [],
      style_hints: {
        prefer: [],
        avoid: []
      }
    };
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  record({ like, userText, reply, comment, correction, preferred_reply }) {
    const entry = {
      ts: Date.now(),
      user: String(userText || '').slice(0, 500),
      reply: String(reply || '').slice(0, 500),
      comment: comment || null,
      correction: correction ? String(correction).slice(0, 800) : null,
      preferred_reply: preferred_reply ? String(preferred_reply).slice(0, 800) : null
    };
    if (like) {
      this.data.positive.push(entry);
      if (this.data.positive.length > 80) this.data.positive = this.data.positive.slice(-80);
      this._inferPositive(entry);
    } else {
      this.data.negative.push(entry);
      if (this.data.negative.length > 80) this.data.negative = this.data.negative.slice(-80);
      this._inferNegative(entry);
      if (entry.correction || entry.preferred_reply) {
        this._applyCorrection(entry);
      }
    }
    this._save();
    return this.data.style_hints;
  }

  _applyCorrection(entry) {
    const text = entry.correction || entry.preferred_reply;
    if (!text) return;
    const prefer = this.data.style_hints.prefer;
    const snippet = `类似这样说：「${text.slice(0, 120)}${text.length > 120 ? '…' : ''}」`;
    if (!prefer.includes(snippet)) prefer.push(snippet);
    if (prefer.length > 12) this.data.style_hints.prefer = prefer.slice(-12);
  }

  _inferPositive(entry) {
    const hints = this.data.style_hints.prefer;
    if (/俄语|рус/i.test(entry.reply) && !hints.includes('可适当夹杂俄语真心话')) {
      hints.push('可适当夹杂俄语真心话');
    }
    if (/……|哼|别误会/.test(entry.reply) && !hints.includes('保持嘴硬心软、句尾省略')) {
      hints.push('保持嘴硬心软、句尾省略');
    }
    if (hints.length > 12) this.data.style_hints.prefer = hints.slice(-12);
  }

  _inferNegative(entry) {
    const avoid = this.data.style_hints.avoid;
    if (/AI|助手|客服|很高兴为您服务/.test(entry.reply)) {
      if (!avoid.includes('不要像AI客服')) avoid.push('不要像AI客服');
    }
    if (/作为语言模型|我无法/.test(entry.reply)) {
      if (!avoid.includes('不要打破角色')) avoid.push('不要打破角色');
    }
    if (entry.reply.length > 200 && !avoid.includes('回复过长时要更简短')) {
      avoid.push('回复过长时要更简短');
    }
    if (avoid.length > 12) this.data.style_hints.avoid = avoid.slice(-12);
  }

  getPromptHints() {
    const p = this.data.style_hints.prefer.slice(-6);
    const a = this.data.style_hints.avoid.slice(-6);
    return { prefer: p, avoid: a };
  }

  exportForFineTune() {
    const rows = [];
    for (const e of this.data.positive) {
      if (e.user && e.reply) rows.push({ user: e.user, assistant: e.reply, weight: 1.2 });
    }
    for (const e of this.data.negative) {
      const target = e.correction || e.preferred_reply;
      if (e.user && target) {
        rows.push({ user: e.user, assistant: target, weight: 1.5, source: 'correction' });
      } else if (e.user && e.reply) {
        rows.push({ user: e.user, assistant: e.reply, weight: 0.3, reject: true });
      }
    }
    return rows;
  }

  getCorrections(limit = 20) {
    return (this.data.negative || [])
      .filter(e => e.correction || e.preferred_reply)
      .slice(-limit);
  }

  getCounts() {
    return {
      positive: this.data.positive?.length || 0,
      negative: this.data.negative?.length || 0
    };
  }

  /** 试聊校准：偏差标签 → style_hints */
  applyDeviationHints(tagIds) {
    const { applyDeviations } = require('./calibration-feedback');
    return applyDeviations(this, tagIds);
  }
}

module.exports = { FeedbackLearningStore };
