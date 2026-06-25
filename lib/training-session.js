'use strict';

const fs = require('fs');
const path = require('path');

const DEEP_MODULES = ['emotion', 'wish', 'cognition_conflict', 'voice_emotion'];
const SESSION_LIMIT_MINUTES = 15;
const REST_MESSAGE = '今天到这里就好，不必一次做完。休息一下吧。';

class TrainingSessionManager {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'training_session.json');
    this.notesPath = path.join(dataDir, 'lightweight_notes.json');
    this.state = this._load(this.path, {});
    this.notes = this._load(this.notesPath, []);
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

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  _ensureToday() {
    const t = this._today();
    if (this.state.date !== t) {
      this.state = {
        date: t,
        minutes: 0,
        stopped_for_today: false,
        deep_unlocked: {},
        started_at: Date.now()
      };
      this._save(this.path, this.state);
    }
    return this.state;
  }

  getStatus() {
    const s = this._ensureToday();
    return {
      date: s.date,
      minutes: s.minutes || 0,
      stopped_for_today: !!s.stopped_for_today,
      session_limit_minutes: SESSION_LIMIT_MINUTES,
      rest_message: REST_MESSAGE,
      deep_modules: DEEP_MODULES,
      deep_unlocked: s.deep_unlocked || {},
      lightweight_notes_count: this.notes.filter(n => n.date === s.date).length,
      can_train: !s.stopped_for_today
    };
  }

  addMinutes(n = 1) {
    const s = this._ensureToday();
    if (s.stopped_for_today) return s;
    s.minutes = (s.minutes || 0) + n;
    this._save(this.path, s);
    return s;
  }

  stopForToday() {
    const s = this._ensureToday();
    s.stopped_for_today = true;
    s.stopped_at = Date.now();
    this._save(this.path, s);
    return { ...s, message: '已记录：今天到此为止。明天再继续也没关系。' };
  }

  resumeToday() {
    const s = this._ensureToday();
    s.stopped_for_today = false;
    delete s.stopped_at;
    this._save(this.path, s);
    return s;
  }

  unlockDeepModule(moduleKey) {
    if (!DEEP_MODULES.includes(moduleKey)) throw new Error('未知深度模块');
    const s = this._ensureToday();
    if (s.stopped_for_today) throw new Error('今日已停止训练');
    s.deep_unlocked = s.deep_unlocked || {};
    s.deep_unlocked[moduleKey] = Date.now();
    this._save(this.path, s);
    return { unlocked: true, module: moduleKey };
  }

  canAccessDeep(moduleKey) {
    const s = this._ensureToday();
    if (s.stopped_for_today) return { ok: false, reason: 'stopped_for_today' };
    if (s.deep_unlocked?.[moduleKey]) return { ok: true };
    return { ok: false, reason: 'gate_required', prompt: '这个练习可能触及较深的内容。你准备好了吗？' };
  }

  addLightweightNote(content) {
    if (!content?.trim()) throw new Error('内容不能为空');
    const note = {
      id: `ln_${Date.now()}`,
      content: content.trim().slice(0, 500),
      date: this._today(),
      timestamp: Date.now()
    };
    this.notes.push(note);
    if (this.notes.length > 500) this.notes = this.notes.slice(-500);
    this._save(this.notesPath, this.notes);
    this.addMinutes(0.5);
    return note;
  }

  listNotes(limit = 20) {
    return this.notes.slice(-limit).reverse();
  }

  shouldShowRestAfter(moduleType) {
    return ['emotion', 'memory', 'cognition'].includes(moduleType);
  }
}

module.exports = { TrainingSessionManager, DEEP_MODULES, REST_MESSAGE };
