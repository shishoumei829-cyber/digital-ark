'use strict';

const fs = require('fs');
const path = require('path');
const { RELATIONSHIP_TYPES } = require('./design-spec');

const TRAINER_ROLES = {
  self: { label: '本人', desc: '为自己训练未来的数字分身' },
  child: { label: '子女', desc: '为父母/长辈训练' },
  spouse: { label: '配偶/伴侣', desc: '为伴侣训练' },
  parent: { label: '父母', desc: '为子女训练' },
  sibling: { label: '兄弟姐妹', desc: '为手足训练' },
  friend: { label: '亲友', desc: '为朋友训练' },
  caregiver: { label: '照护者/其他', desc: '代为记录与训练' }
};

class TrainingSetupStore {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'training_setup.json');
    this.setup = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {}
    return {
      setup_complete: false,
      mode: null,
      subject_name: '',
      subject_gender: '',
      avatar_preset: '',
      subject_brief: '',
      trainer_name: '',
      trainer_role: '',
      key_people: [],
      updated_at: null
    };
  }

  _save() {
    this.setup.updated_at = Date.now();
    fs.writeFileSync(this.path, JSON.stringify(this.setup, null, 2));
  }

  get() {
    return { ...this.setup, trainer_roles: TRAINER_ROLES, relationship_types: RELATIONSHIP_TYPES };
  }

  isComplete() {
    const s = this.setup;
    if (s.mode === 'demo') return true;
    const name = (s.subject_name?.trim() || s.trainer_name?.trim());
    if (!s.setup_complete || !name) return false;
    if (s.mode === 'self' || s.trainer_role === 'self') return true;
    return !!(s.trainer_name?.trim() && s.trainer_role && s.key_people?.length >= 1);
  }

  /** 自训模式：训练者即本人，subject 与 trainer 统一 */
  _normalizeSelf() {
    if (this.setup.mode === 'demo') return;
    const name = (this.setup.subject_name?.trim() || this.setup.trainer_name?.trim());
    if (!name) return;
    this.setup.mode = 'self';
    this.setup.subject_name = name;
    this.setup.trainer_name = name;
    this.setup.trainer_role = 'self';
  }

  save(partial) {
    const allowed = [
      'mode', 'subject_name', 'subject_gender', 'avatar_preset', 'subject_brief',
      'trainer_name', 'trainer_role', 'key_people', 'setup_complete'
    ];
    for (const k of allowed) {
      if (partial[k] !== undefined) this.setup[k] = partial[k];
    }
    if (partial.mode === 'self' || partial.trainer_role === 'self') {
      this._normalizeSelf();
    }
    if (partial.setup_complete === true) {
      if (this.setup.mode === 'self' || this.setup.trainer_role === 'self') {
        this._normalizeSelf();
      }
      this.setup.setup_complete = this.isComplete() || this.setup.mode === 'demo';
    }
    this._save();
    return this.get();
  }

  /** 演示模式：使用预置 persona 课程，不要求填写关系 */
  enableDemo() {
    this.setup = {
      ...this.setup,
      mode: 'demo',
      setup_complete: true,
      subject_name: '艾莉莎·米哈伊罗夫纳·九条',
      subject_gender: 'female',
      avatar_preset: 'f',
      trainer_name: this.setup.trainer_name || '体验用户',
      trainer_role: 'caregiver',
      key_people: [],
      updated_at: Date.now()
    };
    this._save();
    return this.get();
  }

  reset() {
    this.setup = {
      setup_complete: false,
      mode: null,
      subject_name: '',
      subject_gender: '',
      avatar_preset: '',
      subject_brief: '',
      trainer_name: '',
      trainer_role: '',
      key_people: [],
      updated_at: Date.now()
    };
    this._save();
    return this.get();
  }

  contextForCurriculum() {
    const s = this.setup;
    const subject = s.subject_name?.trim() || 'TA';
    const trainer = s.trainer_name?.trim() || '你';
    const role = TRAINER_ROLES[s.trainer_role]?.label || s.trainer_role || '训练者';
    const people = (s.key_people || []).filter(p => p.name?.trim()).map(p => ({
      ...p,
      type_label: RELATIONSHIP_TYPES[p.type]?.label || p.type || '关系人'
    }));
    return {
      mode: s.mode,
      subject_name: subject,
      subject_brief: s.subject_brief || '',
      trainer_name: trainer,
      trainer_role: s.trainer_role,
      trainer_role_label: role,
      key_people: people,
      is_self: s.trainer_role === 'self',
      is_demo: s.mode === 'demo'
    };
  }
}

module.exports = { TrainingSetupStore, TRAINER_ROLES };
