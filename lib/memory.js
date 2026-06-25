'use strict';

/**
 * 记忆系统
 * 管理事件、时间线、观察和模式
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DECAY = 0.005;
const MAX_EVENTS = 500;

class MemorySystem {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.eventLogPath = path.join(dataDir, 'event_log.json');
    this.timelinePath = path.join(dataDir, 'timeline.json');
    this.observationsPath = path.join(dataDir, 'observations.json');
    this.patternsPath = path.join(dataDir, 'patterns.json');
    this.userProfilePath = path.join(dataDir, 'user_profile.json');
    
    this.events = this._loadJSON(this.eventLogPath, []);
    this.timeline = this._loadJSON(this.timelinePath, []);
    this.observations = this._loadJSON(this.observationsPath, {});
    this.patterns = this._loadJSON(this.patternsPath, []);
    this.userProfile = this._loadJSON(this.userProfilePath, {
      confirmed_habits: [],
      tentative_observations: []
    });
    this.recentBehaviors = this._loadJSON(path.join(dataDir, 'recent_behaviors.json'), []);
  }

  _loadJSON(filePath, defaultValue) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch {}
    return defaultValue;
  }

  _saveJSON(filePath, data) {
    fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
      if (err) console.error(`[memory] Save error: ${err.message}`);
    });
  }

  /**
   * 添加事件
   */
  addEvent(type, content, importance = 0.5, padDelta = {}) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      content: String(content).substring(0, 500),
      importance,
      timestamp: Date.now(),
      padDelta,
      weight: importance
    };

    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }

    this._saveJSON(this.eventLogPath, this.events);
    
    // 添加到时间线
    this.addTimeline({
      type,
      summary: content.substring(0, 100),
      importance
    });

    return event;
  }

  /**
   * 添加时间线条目
   */
  addTimeline(entry) {
    const item = {
      time: new Date().toLocaleString('zh'),
      hour: new Date().getHours(),
      ...entry
    };
    this.timeline.push(item);
    if (this.timeline.length > 200) {
      this.timeline = this.timeline.slice(-200);
    }
    this._saveJSON(this.timelinePath, this.timeline);
    return item;
  }

  /**
   * 添加观察
   */
  addObservation(keyword, detail = '') {
    if (!keyword || keyword.length < 2) return null;
    const k = keyword.trim();
    
    if (!this.observations[k]) {
      this.observations[k] = {
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        details: []
      };
    }
    
    const obs = this.observations[k];
    obs.count++;
    obs.lastSeen = Date.now();
    
    if (detail && !obs.details.includes(detail)) {
      obs.details.push(detail.substring(0, 60));
      if (obs.details.length > 10) obs.details.shift();
    }
    
    this._saveJSON(this.observationsPath, this.observations);
    return obs;
  }

  /**
   * 记录行为选择（供行为决策新颖性评分）
   */
  recordBehavior(behaviorId) {
    if (!behaviorId) return;
    this.recentBehaviors.push({ id: behaviorId, timestamp: Date.now() });
    if (this.recentBehaviors.length > 20) {
      this.recentBehaviors = this.recentBehaviors.slice(-20);
    }
    this._saveJSON(path.join(this.dataDir, 'recent_behaviors.json'), this.recentBehaviors);
  }

  getRecentBehaviors() {
    return this.recentBehaviors.slice(-5).map(b => b.id);
  }

  getRecentContext(count = 5) {
    const recent = this.events.slice(-count);
    if (recent.length === 0) return '暂无对话记录';
    return recent.map(e => `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.content}`).join('\n');
  }

  /**
   * 获取长期情感偏置
   */
  getLongTermPadBias() {
    const recent = this.events.slice(-20);
    const bias = { P: 0, A: 0, D: 0, S: 0 };
    
    for (const event of recent) {
      if (event.padDelta) {
        const weight = event.weight || 0.1;
        bias.P += (event.padDelta.P || 0) * weight;
        bias.A += (event.padDelta.A || 0) * weight;
        bias.D += (event.padDelta.D || 0) * weight;
        bias.S += (event.padDelta.S || 0) * weight;
      }
    }
    
    return bias;
  }

  /**
   * 获取关系分数
   */
  getRelationshipScore() {
    const intimateEvents = this.events.filter(e => 
      e.type === 'intimate' || e.type === 'positive'
    ).length;
    const negativeEvents = this.events.filter(e => 
      e.type === 'negative' || e.type === 'conflict'
    ).length;
    
    const total = this.events.length || 1;
    return Math.min(1, Math.max(0, (intimateEvents - negativeEvents) / total + 0.5));
  }

  /**
   * 获取用户模型
   */
  getUserModel() {
    return {
      preferences: {
        topics: this._extractTopics(),
        communication_style: '直接',
        emotional_expression: '内敛'
      },
      habits: this.userProfile.confirmed_habits || [],
      observations: this.userProfile.tentative_observations || [],
      relationship: {
        intimacy_level: Math.floor(this.getRelationshipScore() * 5),
        trust_score: this.getRelationshipScore(),
        interaction_count: this.events.length
      }
    };
  }

  _extractTopics() {
    const topicKeywords = {
      '科技': ['编程', '代码', '技术', '开发', '软件'],
      '生活': ['吃饭', '睡觉', '休息', '周末', '假期'],
      '情感': ['开心', '难过', '喜欢', '讨厌', '感觉'],
      '工作': ['项目', '任务', '开会', '加班', '老板']
    };
    
    const topics = [];
    const recentContent = this.events.slice(-50).map(e => e.content).join(' ');
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(k => recentContent.includes(k))) {
        topics.push(topic);
      }
    }
    
    return topics.length > 0 ? topics : ['通用'];
  }

  /**
   * 获取记忆数据
   */
  getMemory(type = 'all', limit = 20, offset = 0) {
    switch (type) {
      case 'events':
        return {
          events: this.events.slice(offset, offset + limit),
          total: this.events.length
        };
      case 'timeline':
        return {
          timeline: this.timeline.slice(offset, offset + limit),
          total: this.timeline.length
        };
      case 'observations':
        return {
          observations: Object.entries(this.observations)
            .slice(offset, offset + limit)
            .map(([key, value]) => ({ keyword: key, ...value })),
          total: Object.keys(this.observations).length
        };
      default:
        return {
          events: this.events.slice(-limit),
          timeline: this.timeline.slice(-limit),
          observations: Object.entries(this.observations).slice(0, 10).map(([k, v]) => ({ keyword: k, ...v }))
        };
    }
  }

  /**
   * 衰减处理
   */
  decay() {
    const now = Date.now();
    this.events = this.events.filter(e => {
      const age = (now - e.timestamp) / 1000;
      const decayedWeight = (e.weight || 0.5) * Math.exp(-MEMORY_DECAY * age);
      return decayedWeight > 0.02;
    });
    this._saveJSON(this.eventLogPath, this.events);
  }
}

module.exports = { MemorySystem };
