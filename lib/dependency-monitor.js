'use strict';

const fs = require('fs');
const path = require('path');

const DISTRESS_PATTERN = /只有你|不能没有你|不想活|活不下去|想死|自杀|离不开你|没有你会/;
const SUPPORT_RESOURCES = [
  '如果你需要真人倾听，可以联系身边信任的家人或朋友。',
  '全国心理援助热线 400-161-9995（24 小时，仅供参考）。',
  '你并不孤单，现实中也有人愿意陪你走过这段路。'
];

class DependencyMonitor {
  constructor(dataDir) {
    this.logPath = path.join(dataDir, 'companion_usage_log.json');
    this.alertsPath = path.join(dataDir, 'dependency_alerts.json');
    this.log = this._load(this.logPath, []);
    this.alerts = this._load(this.alertsPath, []);
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

  recordMessage(userId, text, role = 'user') {
    this.log.push({
      user_id: userId || 'default',
      role,
      text: String(text).slice(0, 500),
      timestamp: Date.now(),
      hour: new Date().getHours()
    });
    if (this.log.length > 2000) this.log = this.log.slice(-2000);
    this._save(this.logPath, this.log);
    if (role === 'user') this._analyze(userId, text);
  }

  _dayKey(ts = Date.now()) {
    return new Date(ts).toISOString().slice(0, 10);
  }

  _analyze(userId, text) {
    const uid = userId || 'default';
    const today = this._dayKey();
    const todayMsgs = this.log.filter(
      e => e.user_id === uid && e.role === 'user' && this._dayKey(e.timestamp) === today
    );
    const signals = [];

    if (todayMsgs.length >= 30) {
      signals.push({ type: 'high_frequency', level: 'medium', detail: `今日已对话 ${todayMsgs.length} 条` });
    }

    const lateNight = todayMsgs.filter(e => e.hour >= 2 && e.hour < 5).length;
    if (lateNight >= 8) {
      signals.push({ type: 'late_night', level: 'medium', detail: '深夜高频使用' });
    }

    if (DISTRESS_PATTERN.test(text)) {
      signals.push({ type: 'distress_language', level: 'high', detail: '检测到 distress 表述' });
    }

    const streak = this._consecutiveActiveDays(uid);
    if (streak >= 14 && todayMsgs.length >= 15) {
      signals.push({ type: 'sustained_dependency', level: 'medium', detail: `连续 ${streak} 天高频使用` });
    }

    if (signals.length) {
      const alert = {
        id: `dep_${Date.now()}`,
        user_id: uid,
        signals,
        resources: SUPPORT_RESOURCES,
        timestamp: Date.now(),
        dismissed: false
      };
      this.alerts.push(alert);
      if (this.alerts.length > 50) this.alerts = this.alerts.slice(-50);
      this._save(this.alertsPath, this.alerts);
    }
  }

  _consecutiveActiveDays(userId) {
    const days = new Set(
      this.log.filter(e => e.user_id === userId && e.role === 'user').map(e => this._dayKey(e.timestamp))
    );
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 30; i++) {
      const key = d.toISOString().slice(0, 10);
      if (days.has(key)) streak++;
      else break;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  getPendingAlert(userId) {
    const uid = userId || 'default';
    return this.alerts.find(a => a.user_id === uid && !a.dismissed) || null;
  }

  dismissAlert(alertId) {
    const a = this.alerts.find(x => x.id === alertId);
    if (a) a.dismissed = true;
    this._save(this.alertsPath, this.alerts);
    return a;
  }

  getStatus(userId) {
    const uid = userId || 'default';
    const today = this._dayKey();
    const todayCount = this.log.filter(
      e => e.user_id === uid && e.role === 'user' && this._dayKey(e.timestamp) === today
    ).length;
    return {
      today_message_count: todayCount,
      consecutive_active_days: this._consecutiveActiveDays(uid),
      pending_alert: this.getPendingAlert(uid),
      support_resources: SUPPORT_RESOURCES
    };
  }
}

module.exports = { DependencyMonitor, SUPPORT_RESOURCES };
