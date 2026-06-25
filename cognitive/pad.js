'use strict';

/**
 * PAD情感状态管理器
 * 管理 Pleasure-Arousal-Dominance-Social 情感状态
 */

const fs = require('fs');
const path = require('path');

const PAD_BASE = { P: -0.1, A: 0.2, D: 0.6, S: 0.0 };
const PAD_DECAY_LAMBDA = 0.0001;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

class PADManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'pad_state.json');
  }

  /**
   * 加载PAD状态，应用时间衰减
   */
  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        const lastOnline = raw.lastOnline || 0;
        const dt = (Date.now() - lastOnline) / 1000;
        const decay = Math.exp(-PAD_DECAY_LAMBDA * dt);
        return {
          P: PAD_BASE.P + ((raw.P || PAD_BASE.P) - PAD_BASE.P) * decay,
          A: PAD_BASE.A + ((raw.A || PAD_BASE.A) - PAD_BASE.A) * decay,
          D: PAD_BASE.D + ((raw.D || PAD_BASE.D) - PAD_BASE.D) * decay,
          S: Math.min(1, (raw.S || PAD_BASE.S) + 0.001),
        };
      }
    } catch {}
    return { ...PAD_BASE };
  }

  /**
   * 保存PAD状态
   */
  save(pad) {
    fs.writeFile(this.filePath, JSON.stringify({ ...pad, lastOnline: Date.now() }, null, 2), (err) => {
      if (err) console.error('[pad] Save error:', err.message);
    });
  }

  /**
   * 非线性PAD更新
   */
  update(pad, delta, eventImportance = 0.5) {
    const alpha = 0.86;
    const beta = clamp(0.2 + eventImportance * 0.6, 0.2, 0.8);
    const gamma = 0.18;
    const noise = 0.015;
    const S = pad.S;
    const negDamp = 1 - S * 0.5;

    const next = (key) => {
      const current = pad[key] || 0;
      const stimulus = delta[key] || 0;
      const dampedStim = stimulus < 0 ? stimulus * negDamp : stimulus;
      const epsilon = (Math.random() * 2 - 1) * noise;
      return clamp(Math.tanh(
        alpha * current + beta * dampedStim + gamma * PAD_BASE[key] + epsilon
      ), -1, 1);
    };

    return {
      P: next('P'),
      A: next('A'),
      D: next('D'),
      S: clamp(pad.S + (delta.S || 0), 0, 1),
    };
  }

  /**
   * 从用户输入推断情感变化
   */
  inferEmotion(text) {
    const t = String(text || '').trim();
    const delta = { P: 0, A: 0, D: 0, S: 0 };

    // 积极情感
    if (/谢谢|感谢|开心|高兴|喜欢|爱|棒|好/.test(t)) {
      delta.P += 0.15;
      delta.A += 0.1;
      delta.S += 0.01;
    }

    // 消极情感
    if (/难过|伤心|痛苦|烦|累|讨厌|不好/.test(t)) {
      delta.P -= 0.2;
      delta.A += 0.15;
      delta.S += 0.02;
    }

    // 好奇/兴奋
    if (/真的吗|为什么|怎么|什么|告诉我/.test(t)) {
      delta.A += 0.2;
      delta.D += 0.05;
    }

    // 亲密表达
    if (/想你|陪你|在乎|关心|在乎你/.test(t)) {
      delta.P += 0.1;
      delta.A -= 0.1;
      delta.S += 0.03;
    }

    // 冲突/粗鲁
    if (/闭嘴|滚|讨厌你|烦死|笨蛋/.test(t)) {
      delta.P -= 0.25;
      delta.A += 0.2;
      delta.S -= 0.01;
    }

    return delta;
  }

  /**
   * 将PAD状态转换为自然语言描述
   */
  toNaturalLanguage(pad) {
    const parts = [];
    
    // 愉悦度
    if (pad.P > 0.3) parts.push('心情愉悦');
    else if (pad.P > 0) parts.push('心情平静');
    else if (pad.P > -0.3) parts.push('心情略低');
    else parts.push('心情低落');

    // 唤醒度
    if (pad.A > 0.5) parts.push('精神兴奋');
    else if (pad.A > 0.2) parts.push('精神正常');
    else parts.push('精神放松');

    // 支配度
    if (pad.D > 0.5) parts.push('自信主动');
    else if (pad.D > 0.2) parts.push('状态平衡');
    else parts.push('略显被动');

    // 关系强度
    if (pad.S > 0.7) parts.push('关系亲密');
    else if (pad.S > 0.4) parts.push('关系熟悉');
    else if (pad.S > 0.1) parts.push('关系初建');
    else parts.push('关系陌生');

    return parts.join('，');
  }

  /**
   * 描述当前情感状态
   */
  describeEmotion(pad) {
    let primary = '平静';
    let secondary = '放松';
    let intensity = 0.5;

    if (pad.P > 0.3 && pad.A > 0.4) {
      primary = '开心';
      secondary = '兴奋';
      intensity = 0.7;
    } else if (pad.P > 0.3 && pad.A <= 0.4) {
      primary = '满足';
      secondary = '放松';
      intensity = 0.6;
    } else if (pad.P < -0.3 && pad.A > 0.4) {
      primary = '焦虑';
      secondary = '不安';
      intensity = 0.7;
    } else if (pad.P < -0.3 && pad.A <= 0.4) {
      primary = '低落';
      secondary = '疲惫';
      intensity = 0.6;
    } else if (pad.P > 0 && pad.S > 0.5) {
      primary = '关心';
      secondary = '温暖';
      intensity = 0.65;
    }

    return { primary, secondary, intensity };
  }
}

module.exports = { PADManager, PAD_BASE };
