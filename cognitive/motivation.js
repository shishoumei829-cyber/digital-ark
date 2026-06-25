'use strict';

/**
 * 动机系统
 * 管理固定核心动机和状态驱动的动态动机
 */

const fs = require('fs');
const path = require('path');

class MotivationSystem {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'motivation.json');
    this.state = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch {}
    return {
      core_motivations: ['维持关系', '探索新知', '情感连接'],
      dynamic_motivations: [],
      desire_closeness: 0.25,
      fear_rejection: 0.55,
      curiosity: 0.5
    };
  }

  save() {
    fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), (err) => {
      if (err) console.error('[motivation] Save error:', err.message);
    });
  }

  getState() {
    return { ...this.state };
  }

  update(pad, memBias, relScore) {
    // 根据PAD状态更新动机
    if (pad.P > 0.3) {
      this.state.desire_closeness = Math.min(1, this.state.desire_closeness + 0.05);
    }
    if (pad.A > 0.5) {
      this.state.curiosity = Math.min(1, this.state.curiosity + 0.1);
    }
    if (relScore > 0.5) {
      this.state.fear_rejection = Math.max(0, this.state.fear_rejection - 0.05);
    }

    // 动态动机生成
    this.state.dynamic_motivations = [];
    if (this.state.curiosity > 0.6) {
      this.state.dynamic_motivations.push({
        type: 'curiosity',
        target: '用户兴趣',
        intensity: this.state.curiosity
      });
    }
    if (this.state.desire_closeness > 0.5) {
      this.state.dynamic_motivations.push({
        type: 'closeness',
        target: '情感连接',
        intensity: this.state.desire_closeness
      });
    }

    this.save();
    return this.state;
  }
}

module.exports = { MotivationSystem };
