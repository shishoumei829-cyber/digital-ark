'use strict';

/**
 * 行为决策系统
 * 多路径行为候选 + 打分选择
 */

const BEHAVIORS = {
  APPROACH: {
    id: 'APPROACH',
    name: '主动靠近',
    description: '愿意暴露一点真实情感',
    constraints: '表达关心、分享感受、主动询问'
  },
  DEFEND: {
    id: 'DEFEND',
    name: '防御',
    description: '嘴硬，不配合，把情感压回去',
    constraints: '回避问题、转移话题、保持距离'
  },
  DEFLECT: {
    id: 'DEFLECT',
    name: '转移',
    description: '换话题，用反问或刻薄绕开',
    constraints: '反问、开玩笑、轻描淡写'
  },
  ENGAGE: {
    id: 'ENGAGE',
    name: '智识投入',
    description: '进入学术/分析模式',
    constraints: '深入讨论、提供见解、理性分析'
  },
  WITHDRAW: {
    id: 'WITHDRAW',
    name: '收缩',
    description: '简短，不想多说，等对方先动',
    constraints: '简短回复、保持沉默、等待输入'
  }
};

class BehaviorDecision {
  constructor() {
    this.behaviors = BEHAVIORS;
  }

  /**
   * 生成候选行为并打分
   */
  generateCandidates(pad, motivation, memory, userInput) {
    const candidates = [];
    
    for (const [id, behavior] of Object.entries(this.behaviors)) {
      const score = this.scoreBehavior(behavior, pad, motivation, memory, userInput);
      candidates.push({ ...behavior, score });
    }

    // 按分数排序
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  /**
   * 打分函数
   */
  scoreBehavior(behavior, pad, motivation, memory, userInput) {
    let score = 0;
    const weights = {
      emotion: 0.3,
      motivation: 0.25,
      context: 0.25,
      novelty: 0.1,
      safety: 0.1
    };

    // 情感一致性
    score += weights.emotion * this.emotionScore(behavior, pad);
    
    // 动机适配度
    score += weights.motivation * this.motivationScore(behavior, motivation);
    
    // 上下文相关性
    score += weights.context * this.contextScore(behavior, userInput);
    
    // 新颖性
    score += weights.novelty * this.noveltyScore(behavior, memory);
    
    // 安全性
    score += weights.safety * this.safetyScore(behavior);

    return score;
  }

  emotionScore(behavior, pad) {
    // 根据情感状态匹配行为
    if (behavior.id === 'APPROACH' && pad.P > 0.3) return 0.8;
    if (behavior.id === 'DEFEND' && pad.P < -0.2) return 0.7;
    if (behavior.id === 'ENGAGE' && pad.A > 0.5) return 0.75;
    if (behavior.id === 'WITHDRAW' && pad.A < 0.3) return 0.6;
    if (behavior.id === 'DEFLECT') return 0.5;
    return 0.4;
  }

  motivationScore(behavior, motivation) {
    if (behavior.id === 'APPROACH' && motivation.desire_closeness > 0.5) return 0.8;
    if (behavior.id === 'DEFEND' && motivation.fear_rejection > 0.6) return 0.7;
    if (behavior.id === 'ENGAGE' && motivation.curiosity > 0.6) return 0.75;
    if (behavior.id === 'WITHDRAW') return 0.4;
    if (behavior.id === 'DEFLECT') return 0.5;
    return 0.5;
  }

  contextScore(behavior, userInput) {
    const t = String(userInput || '').toLowerCase();
    
    // 问题类型匹配
    if (/什么|为什么|怎么|如何/.test(t) && behavior.id === 'ENGAGE') return 0.8;
    if (/喜欢|爱|想|在乎/.test(t) && behavior.id === 'APPROACH') return 0.8;
    if (/讨厌|烦|恨|闭嘴/.test(t) && behavior.id === 'DEFEND') return 0.7;
    if (/无聊|没事|嗯/.test(t) && behavior.id === 'DEFLECT') return 0.6;
    
    return 0.5;
  }

  noveltyScore(behavior, memory) {
    // 简单的新颖性评分
    const recentBehaviors = memory.getRecentBehaviors?.() || [];
    if (recentBehaviors.includes(behavior.id)) return 0.3;
    return 0.7;
  }

  safetyScore(behavior) {
    // 安全行为得分更高
    if (behavior.id === 'APPROACH') return 0.7;
    if (behavior.id === 'ENGAGE') return 0.8;
    if (behavior.id === 'DEFLECT') return 0.6;
    if (behavior.id === 'DEFEND') return 0.5;
    if (behavior.id === 'WITHDRAW') return 0.6;
    return 0.5;
  }

  /**
   * 选择最佳行为
   */
  selectBest(candidates) {
    if (!candidates || candidates.length === 0) {
      return this.behaviors.ENGAGE;
    }
    return candidates[0];
  }

  /**
   * 将行为转化为执行约束
   */
  toConstraints(behavior) {
    return behavior.constraints || '保持自然对话';
  }
}

module.exports = { BehaviorDecision, BEHAVIORS };
