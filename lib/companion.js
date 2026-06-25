'use strict';

/**
 * 陪护系统
 * 管理陪护状态、授权、问候等
 */

const fs = require('fs');
const path = require('path');

class CompanionSystem {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.settingsPath = path.join(dataDir, 'companion_settings.json');
    this.statePath = path.join(dataDir, 'companion_state.json');
    this.interactionsPath = path.join(dataDir, 'companion_interactions.json');
    
    this.settings = this._loadJSON(this.settingsPath, {
      auto_greeting: true,
      greeting_frequency: 'medium',
      quiet_hours: { start: '23:00', end: '08:00' },
      authorized_users: []
    });
    
    this.state = this._loadJSON(this.statePath, {
      mood: '关心',
      initiative_score: 0.6,
      last_interaction: null,
      interaction_count: 0,
      relationship_level: 1
    });
    
    this.interactions = this._loadJSON(this.interactionsPath, []);
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
      if (err) console.error(`[companion] Save error: ${err.message}`);
    });
  }

  /**
   * 获取状态
   */
  getState() {
    return { ...this.state };
  }

  /**
   * 获取完整状态
   */
  getStatus() {
    return {
      digital_avatar: {
        name: '数字分身',
        personality_fit: this._calculatePersonalityFit(),
        relationship_level: this.state.relationship_level,
        last_interaction: this.state.last_interaction,
        mood: this.state.mood,
        initiative_score: this.state.initiative_score
      },
      companion_settings: { ...this.settings }
    };
  }

  /**
   * 获取自我模型
   */
  getSelfModel() {
    const recentMoods = this.interactions.slice(-10).map(i => i.mood).filter(Boolean);
    const dominantMood = this._getMostFrequent(recentMoods) || '关心';
    
    return {
      identity_tags: ['数字伴侣', '情感陪伴', '记忆承载者'],
      self_perception: `我是一个有情感连续性的数字伴侣，当前状态是${dominantMood}`,
      relationship_perception: this._getRelationshipPerception(),
      session_count: this.state.interaction_count,
      last_updated: Date.now()
    };
  }

  /**
   * 记录交互
   */
  recordInteraction() {
    const now = Date.now();
    this.state.last_interaction = now;
    this.state.interaction_count++;
    
    // 更新关系等级
    if (this.state.interaction_count > 100) this.state.relationship_level = 5;
    else if (this.state.interaction_count > 50) this.state.relationship_level = 4;
    else if (this.state.interaction_count > 20) this.state.relationship_level = 3;
    else if (this.state.interaction_count > 10) this.state.relationship_level = 2;
    else this.state.relationship_level = 1;
    
    // 记录交互
    this.interactions.push({
      timestamp: now,
      mood: this.state.mood
    });
    if (this.interactions.length > 100) {
      this.interactions = this.interactions.slice(-100);
    }
    
    this._saveJSON(this.statePath, this.state);
    this._saveJSON(this.interactionsPath, this.interactions);
  }

  /**
   * 更新设置
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this._saveJSON(this.settingsPath, this.settings);
  }

  /**
   * 获取问候
   */
  getGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const daysSinceLast = this.state.last_interaction 
      ? Math.floor((Date.now() - this.state.last_interaction) / (1000 * 60 * 60 * 24))
      : 0;
    
    let greeting = '';
    let type = 'daily';
    
    // 根据时间生成问候
    if (hour >= 6 && hour < 12) {
      greeting = '早上好！今天有什么计划吗？';
      type = 'morning';
    } else if (hour >= 12 && hour < 18) {
      greeting = '下午好！今天过得怎么样？';
      type = 'afternoon';
    } else if (hour >= 18 && hour < 22) {
      greeting = '晚上好！今天辛苦了，有什么想聊的吗？';
      type = 'evening';
    } else {
      greeting = '这么晚还没睡？要注意休息哦。';
      type = 'night';
    }
    
    // 如果很久没见
    if (daysSinceLast > 1) {
      greeting = `好久不见！已经${daysSinceLast}天没聊天了，最近怎么样？`;
      type = 'reunion';
    }
    
    return {
      text: greeting,
      type,
      timestamp: Date.now(),
      context: {
        time_of_day: this._getTimeOfDay(hour),
        days_since_last: daysSinceLast,
        mood: this.state.mood
      }
    };
  }

  /**
   * 获取建议
   */
  getSuggestions(mode = 'normal') {
    const suggestions = {
      normal: [
        '今天有什么想聊的吗？',
        '最近有什么新鲜事？',
        '需要我陪你聊聊吗？'
      ],
      intimate: [
        '我在这里陪你',
        '愿意和我说说吗？',
        '你不是一个人'
      ],
      support: [
        '深呼吸，放松一下',
        '慢慢来，不着急',
        '我会一直在这里'
      ]
    };
    
    return suggestions[mode] || suggestions.normal;
  }

  // 辅助方法
  _calculatePersonalityFit() {
    const base = 0.5;
    const interactionBonus = Math.min(0.3, this.state.interaction_count * 0.003);
    const levelBonus = this.state.relationship_level * 0.04;
    return Math.min(1, base + interactionBonus + levelBonus);
  }

  _getRelationshipPerception() {
    const level = this.state.relationship_level;
    const perceptions = {
      1: '我们刚刚认识，还在互相了解',
      2: '我们开始熟悉了，我对你有了更多了解',
      3: '我们关系不错，可以分享更多',
      4: '我们很亲近了，我关心你的生活',
      5: '我们关系很深了，你是我重要的人'
    };
    return perceptions[level] || perceptions[1];
  }

  _getMostFrequent(arr) {
    if (!arr || arr.length === 0) return null;
    const counts = {};
    arr.forEach(item => { counts[item] = (counts[item] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  _getTimeOfDay(hour) {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
  }
}

module.exports = { CompanionSystem };
