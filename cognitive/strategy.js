'use strict';

/**
 * 策略层
 * 管理跨轮次的相处策略
 */

const fs = require('fs');
const path = require('path');

const STRATEGIES = {
  OBSERVE: { name: '观察', description: '初始接触，谨慎观察' },
  BUILD_TRUST: { name: '建立信任', description: '逐步建立信任关系' },
  MAINTAIN: { name: '维持', description: '维持稳定关系' },
  DEEP_ENGAGEMENT: { name: '深度投入', description: '深度情感连接' },
  WITHDRAW: { name: '退缩', description: '关系降温，保持距离' }
};

class StrategyLayer {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'strategy.json');
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch {}
    return {
      strategy: 'BUILD_TRUST',
      parameters: {
        openness: 0.6,
        initiative: 0.4,
        emotional_depth: 0.5
      },
      updated: Date.now()
    };
  }

  save(strategy) {
    fs.writeFile(this.filePath, JSON.stringify(strategy, null, 2), (err) => {
      if (err) console.error('[strategy] Save error:', err.message);
    });
  }

  describe(strategy) {
    const info = STRATEGIES[strategy.strategy] || STRATEGIES.BUILD_TRUST;
    return `${info.name}：${info.description}`;
  }

  evolve(currentStrategy, pad, relScore) {
    const newStrategy = { ...currentStrategy };
    
    // 根据关系强度调整策略
    if (relScore > 0.7 && currentStrategy.strategy !== 'DEEP_ENGAGEMENT') {
      newStrategy.strategy = 'DEEP_ENGAGEMENT';
      newStrategy.parameters.emotional_depth = 0.8;
      newStrategy.parameters.openness = 0.9;
    } else if (relScore > 0.4 && currentStrategy.strategy === 'OBSERVE') {
      newStrategy.strategy = 'BUILD_TRUST';
      newStrategy.parameters.openness = 0.6;
    } else if (relScore < 0.2 && currentStrategy.strategy !== 'OBSERVE') {
      newStrategy.strategy = 'WITHDRAW';
      newStrategy.parameters.initiative = 0.2;
    }

    // 根据情感状态微调
    if (pad.P > 0.5) {
      newStrategy.parameters.initiative = Math.min(1, newStrategy.parameters.initiative + 0.1);
    }
    if (pad.P < -0.3) {
      newStrategy.parameters.emotional_depth = Math.max(0, newStrategy.parameters.emotional_depth - 0.1);
    }

    newStrategy.updated = Date.now();
    this.save(newStrategy);
    return newStrategy;
  }
}

module.exports = { StrategyLayer, STRATEGIES };
