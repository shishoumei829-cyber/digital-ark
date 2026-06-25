'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONSENT_TEXT = {
  title: '使用前请知晓',
  body: '您即将对话的是训练者在其在世时授权训练的数字分身，不是真人实时在线。' +
    '对话体验可以温暖、自然，但请知悉其本质。若您需要真人支持，请随时联系身边的人或专业机构。',
  checkbox: '我理解这是数字分身，并同意在知情前提下使用',
  trainee_label: '训练者'
};

class AuthorizationStore {
  constructor(dataDir) {
    this.authPath = path.join(dataDir, 'companion_authorization.json');
    this.consentPath = path.join(dataDir, 'consent_records.json');
    this.auth = this._load(this.authPath, {
      trainee_display_name: '训练者',
      avatar_label: '数字分身',
      users: []
    });
    this.consents = this._load(this.consentPath, []);
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

  getConsentText() {
    return {
      ...DEFAULT_CONSENT_TEXT,
      trainee_label: this.auth.trainee_display_name,
      avatar_label: this.auth.avatar_label
    };
  }

  listUsers() {
    return this.auth.users.map(u => ({ ...u, has_consent: this.hasConsent(u.id) }));
  }

  upsertUser({ id, name, relationship, authorized = true }) {
    const uid = id || `user_${Date.now()}`;
    let user = this.auth.users.find(u => u.id === uid);
    if (user) {
      Object.assign(user, { name, relationship, authorized, updated: Date.now() });
    } else {
      user = {
        id: uid,
        name: String(name || '关系人').trim(),
        relationship: relationship || '家人',
        authorized: authorized !== false,
        created: Date.now(),
        updated: Date.now()
      };
      this.auth.users.push(user);
    }
    this._save(this.authPath, this.auth);
    return user;
  }

  revokeUser(id) {
    const user = this.auth.users.find(u => u.id === id);
    if (!user) throw new Error('用户不存在');
    user.authorized = false;
    user.revoked_at = Date.now();
    this._save(this.authPath, this.auth);
    return user;
  }

  updateProfile({ trainee_display_name, avatar_label }) {
    if (trainee_display_name) this.auth.trainee_display_name = trainee_display_name;
    if (avatar_label) this.auth.avatar_label = avatar_label;
    this._save(this.authPath, this.auth);
    return this.auth;
  }

  recordConsent(userId, userName, meta = {}) {
    const rec = {
      user_id: userId,
      user_name: userName,
      accepted_at: Date.now(),
      version: '1.0',
      ...meta
    };
    this.consents = this.consents.filter(c => c.user_id !== userId);
    this.consents.push(rec);
    this._save(this.consentPath, this.consents);
    return rec;
  }

  hasConsent(userId) {
    return this.consents.some(c => c.user_id === userId);
  }

  checkAccess(userId) {
    if (!userId) {
      return { allowed: false, reason: 'missing_user_id', message: '请完成身份确认' };
    }
    const user = this.auth.users.find(u => u.id === userId);
    if (!user || !user.authorized) {
      return { allowed: false, reason: 'not_authorized', message: '您尚未获得训练者授权，请联系训练者开通' };
    }
    if (!this.hasConsent(userId)) {
      return { allowed: false, reason: 'consent_required', message: '请先阅读并完成知情同意' };
    }
    return {
      allowed: true,
      user,
      avatar_label: this.auth.avatar_label,
      trainee_name: this.auth.trainee_display_name
    };
  }
}

module.exports = { AuthorizationStore, DEFAULT_CONSENT_TEXT };
