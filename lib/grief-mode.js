'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PHASES = [
  { months: 3, initiative_mult: 1.0, label: '陪伴期' },
  { months: 3, initiative_mult: 0.7, label: '过渡期' },
  { months: 6, initiative_mult: 0.4, holidays_only: false, label: '留存期' },
  { months: Infinity, initiative_mult: 0, passive_only: true, label: '封存期' }
];

class GriefModeManager {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'grief_mode.json');
    this.config = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {}
    return {
      enabled: true,
      start_date: new Date().toISOString().slice(0, 10),
      phases: DEFAULT_PHASES,
      sealed: false,
      sealed_at: null,
      completion_ritual_text: '我已经把想留给你们的话都留在这里了。接下来，请好好过你们的日子。我会在记忆里陪着你们。',
      ritual_delivered: false,
      ritual_delivered_at: null
    };
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.config, null, 2));
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(partial) {
    this.config = { ...this.config, ...partial };
    if (partial.phases) this.config.phases = partial.phases;
    this._save();
    return this.getConfig();
  }

  seal() {
    this.config.sealed = true;
    this.config.sealed_at = Date.now();
    this._save();
    return this.getConfig();
  }

  unseal() {
    this.config.sealed = false;
    this.config.sealed_at = null;
    this._save();
    return this.getConfig();
  }

  _monthsSinceStart() {
    const start = new Date(this.config.start_date);
    const now = new Date();
    return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  }

  getCurrentPhase() {
    if (!this.config.enabled) {
      return { label: '未启用', initiative_mult: 1, passive_only: false, months_elapsed: 0 };
    }
    if (this.config.sealed) {
      return { label: '已封存', initiative_mult: 0, passive_only: true, sealed: true, months_elapsed: this._monthsSinceStart() };
    }
    let elapsed = this._monthsSinceStart();
    let acc = 0;
    for (const phase of this.config.phases) {
      acc += phase.months === Infinity ? 9999 : phase.months;
      if (elapsed < acc || phase.months === Infinity) {
        return {
          ...phase,
          months_elapsed: elapsed,
          initiative_mult: phase.initiative_mult ?? 1,
          passive_only: !!phase.passive_only
        };
      }
    }
    const last = this.config.phases[this.config.phases.length - 1];
    return { ...last, months_elapsed: elapsed, initiative_mult: last.initiative_mult ?? 0 };
  }

  /** @returns {number} 0–1 主动频率系数 */
  getInitiativeMultiplier() {
    const phase = this.getCurrentPhase();
    if (this.config.sealed || phase.passive_only) return 0;
    return Math.max(0, Math.min(1, phase.initiative_mult ?? 1));
  }

  shouldBlockProactive() {
    if (!this.config.enabled) return false;
    const phase = this.getCurrentPhase();
    return this.config.sealed || phase.passive_only || this.getInitiativeMultiplier() <= 0;
  }

  /** 是否应触发完成仪式（留存期末尾且未发送） */
  shouldDeliverRitual() {
    if (this.config.ritual_delivered || !this.config.completion_ritual_text) return false;
    const m = this._monthsSinceStart();
    return m >= 9 && m < 13;
  }

  markRitualDelivered() {
    this.config.ritual_delivered = true;
    this.config.ritual_delivered_at = Date.now();
    this._save();
  }
}

module.exports = { GriefModeManager, DEFAULT_PHASES };
