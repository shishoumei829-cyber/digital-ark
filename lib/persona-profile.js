'use strict';

const fs = require('fs');
const path = require('path');

class PersonaProfileStore {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'persona', 'active_profile.json');
    this.dir = path.dirname(this.path);
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    this.profile = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {}
    return null;
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.profile, null, 2));
  }

  setActiveBundle(bundle) {
    this.profile = {
      id: bundle.id,
      version: bundle.version,
      display_name: bundle.display_name,
      trainee_label: bundle.trainee_label || bundle.display_name,
      meta: bundle.meta,
      voice: bundle.voice,
      emotion: bundle.emotion,
      cognition: bundle.cognition,
      updated_at: Date.now()
    };
    this._save();
  }

  getActive() {
    return this.profile;
  }

  getTraineeName() {
    return this.profile?.trainee_label || this.profile?.display_name || '训练者';
  }

  getDisplayName() {
    return this.profile?.display_name || '数字分身';
  }

  /**
   * 合并 persona 静态配置 + 训练会话中的动态特征
   */
  buildTraitSummary(trainingSystem) {
    const base = this.profile || {};
    const sessions = trainingSystem?.sessions || [];
    const recentRel = sessions.filter(s => s.type === 'relationship').slice(-5);
    const recentEmo = sessions.filter(s => s.type === 'emotion').slice(-5);
    const recentCog = sessions.filter(s => s.type === 'cognition').slice(-3);

    const relPatterns = [...new Set(recentRel.map(s => s.data?.pattern).filter(Boolean))];
    const emoTraits = recentEmo.map(s => s.data?.personalityTraits).filter(Boolean);
    const cogProfile = recentCog.length ? recentCog[recentCog.length - 1].data?.cognitiveProfile : null;

    return {
      core_traits: base.meta?.core_traits || [],
      speech_patterns: base.voice?.speech_patterns || [],
      verbal_tics: base.voice?.verbal_tics || [],
      emotion_style: base.emotion || {},
      cognition: cogProfile || base.cognition || {},
      relationship_patterns: relPatterns,
      recent_emotion_traits: emoTraits.slice(-2)
    };
  }
}

module.exports = { PersonaProfileStore };
