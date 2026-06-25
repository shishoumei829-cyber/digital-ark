'use strict';

const fs = require('fs');
const path = require('path');

const LOW_ENERGY_MESSAGES = [
  '今天不太想多说，但想到你了。',
  '这会儿有点累，不过你在就好。',
  '今天状态一般，随便聊两句吧。'
];

class EmotionalVarianceEngine {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'emotional_variance.json');
    this.state = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {}
    return { date: null, energy: 'normal', skip_proactive: false };
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.state, null, 2));
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  /** 每日 roll 能量状态 */
  ensureDailyRoll() {
    const t = this._today();
    if (this.state.date === t) return this.state;
    const roll = Math.random();
    let energy = 'normal';
    let skip_proactive = false;
    if (roll < 0.08) {
      energy = 'low';
      skip_proactive = Math.random() < 0.5;
    } else if (roll < 0.12) {
      energy = 'quiet';
      skip_proactive = true;
    }
    this.state = { date: t, energy, skip_proactive };
    this._save();
    return this.state;
  }

  getReplyStyle() {
    const s = this.ensureDailyRoll();
    if (s.energy === 'low') {
      return {
        energy: 'low',
        max_sentences: 2,
        delay_ms: 800 + Math.floor(Math.random() * 1200),
        hint: '今天能量偏低，回复更短、更慢，允许不完整。',
        prefix: LOW_ENERGY_MESSAGES[Math.floor(Math.random() * LOW_ENERGY_MESSAGES.length)]
      };
    }
    if (s.energy === 'quiet') {
      return {
        energy: 'quiet',
        max_sentences: 1,
        delay_ms: 1500 + Math.floor(Math.random() * 2000),
        hint: '今天较 quiet，可能只说一两句或表示不想多聊。',
        prefix: null
      };
    }
    const occasionalDelay = Math.random() < 0.15;
    return {
      energy: 'normal',
      max_sentences: 3,
      delay_ms: occasionalDelay ? 500 + Math.floor(Math.random() * 1500) : 0,
      hint: null,
      prefix: null
    };
  }

  shouldSkipProactive() {
    return this.ensureDailyRoll().skip_proactive;
  }

  getLowEnergyGreeting() {
    if (this.state.energy === 'normal') return null;
    return LOW_ENERGY_MESSAGES[Math.floor(Math.random() * LOW_ENERGY_MESSAGES.length)];
  }

  applyToReply(reply, style) {
    if (!reply) return reply;
    let text = reply.trim();
    if (style.max_sentences) {
      const parts = text.split(/[。！？!?]/).filter(Boolean);
      if (parts.length > style.max_sentences) {
        text = parts.slice(0, style.max_sentences).join('。') + '。';
      }
    }
    if (style.prefix && style.energy !== 'normal' && !text.includes(style.prefix.slice(0, 4))) {
      text = style.prefix + ' ' + text;
    }
    return text;
  }
}

module.exports = { EmotionalVarianceEngine, LOW_ENERGY_MESSAGES };
