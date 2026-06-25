'use strict';

const fs = require('fs');
const path = require('path');
const { BLIND_TEST_MILESTONES, BLIND_TEST_PASS_SCORE } = require('./design-spec');

class BlindTestManager {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'blind_tests.json');
    this.sessions = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {}
    return [];
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.sessions, null, 2));
  }

  start(milestone, testerName = '关系人') {
    const m = Number(milestone);
    if (!BLIND_TEST_MILESTONES.includes(m)) {
      throw new Error(`盲测节点须为 ${BLIND_TEST_MILESTONES.join('/')}`);
    }
    const session = {
      id: `bt_${Date.now()}`,
      milestone: m,
      tester_name: testerName,
      started_at: Date.now(),
      score: null,
      passed: null,
      notes: ''
    };
    this.sessions.push(session);
    this._save();
    return session;
  }

  submit(sessionId, score, notes = '') {
    const s = this.sessions.find(x => x.id === sessionId);
    if (!s) throw new Error('盲测会话不存在');
    const sc = Math.min(10, Math.max(1, Number(score)));
    s.score = sc;
    s.passed = sc >= BLIND_TEST_PASS_SCORE;
    s.notes = notes;
    s.submitted_at = Date.now();
    this._save();
    return s;
  }

  getPassedMilestones() {
    return [...new Set(
      this.sessions.filter(s => s.passed).map(s => s.milestone)
    )];
  }

  list() {
    return this.sessions.slice().reverse();
  }
}

module.exports = { BlindTestManager };
