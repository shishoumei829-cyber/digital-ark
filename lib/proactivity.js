'use strict';

const fs = require('fs');
const path = require('path');

class ProactivityEngine {
  constructor(dataDir, companionSystem, memorySystem) {
    this.companion = companionSystem;
    this.memory = memorySystem;
    this.carePath = path.join(dataDir, 'care_topics.json');
    this.lastProactivePath = path.join(dataDir, 'last_proactive.json');
    this.careTopics = this._load(this.carePath, []);
    this.lastProactive = this._load(this.lastProactivePath, { date: null, count: 0 });
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

  _todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  _inQuietHours(settings) {
    const q = settings?.quiet_hours;
    if (!q?.start || !q?.end) return false;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = q.start.split(':').map(Number);
    const [eh, em] = q.end.split(':').map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start <= end) return mins >= start && mins < end;
    return mins >= start || mins < end;
  }

  _canSendToday(settings, griefMult = 1) {
    const key = this._todayKey();
    if (this.lastProactive.date !== key) {
      this.lastProactive = { date: key, count: 0 };
    }
    let max = settings?.greeting_frequency === 'high' ? 2
      : settings?.greeting_frequency === 'low' ? 1 : 2;
    max = Math.max(0, Math.floor(max * griefMult));
    if (max <= 0) return false;
    return this.lastProactive.count < max;
  }

  recordCareTopic(text) {
    const stress = /压力|焦虑|难过|崩溃|失眠|担心|困难|烦|累/.test(text);
    if (!stress) return;
    this.careTopics.push({
      snippet: text.slice(0, 120),
      timestamp: Date.now(),
      followup_sent: false
    });
    if (this.careTopics.length > 20) this.careTopics = this.careTopics.slice(-20);
    this._save(this.carePath, this.careTopics);
  }

  evaluate(settings = {}, opts = {}) {
    const griefMult = opts.griefMult ?? 1;
    const skipProactive = opts.skipProactive ?? false;
    const ritualMessage = opts.ritualMessage ?? null;

    if (ritualMessage) return this._emit('ritual', ritualMessage, 'completion');
    if (settings.auto_greeting === false) return null;
    if (skipProactive || griefMult <= 0) return null;
    if (this._inQuietHours(settings)) return null;
    if (!this._canSendToday(settings, griefMult)) return null;

    const state = this.companion.getState();
    const daysSilent = state.last_interaction
      ? Math.floor((Date.now() - state.last_interaction) / 86400000)
      : 99;

    // 沉默触发
    if (daysSilent >= 3) {
      return this._emit('silence', `好久没说话了，最近怎么样？`);
    }

    // 关心跟进
    const pending = this.careTopics.find(t => !t.followup_sent && Date.now() - t.timestamp > 86400000 * 2);
    if (pending) {
      pending.followup_sent = true;
      this._save(this.carePath, this.careTopics);
      return this._emit('care', `之前你说的那件事，后来怎么样了？`);
    }

    // 时间问候
    const greeting = this.companion.getGreeting();
    return this._emit('time', greeting.text, greeting.type);
  }

  _emit(type, text, subtype) {
    this.lastProactive.count++;
    this.lastProactive.date = this._todayKey();
    this._save(this.lastProactivePath, this.lastProactive);
    return { type, subtype: subtype || type, text, timestamp: Date.now() };
  }
}

module.exports = { ProactivityEngine };
