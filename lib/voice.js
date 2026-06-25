'use strict';

/**
 * 音色分析 — 基于音频特征向量 + 文本韵律特征的真实相似度计算
 */

const fs = require('fs');
const path = require('path');

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

function mean(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

class VoiceAnalyzer {
  constructor(dataDir) {
    this.profilePath = path.join(dataDir, 'training', 'voice_profile.json');
    this.samplesDir = path.join(dataDir, 'training', 'voice_samples');
    if (!fs.existsSync(this.samplesDir)) fs.mkdirSync(this.samplesDir, { recursive: true });
    this.profile = this._loadProfile();
  }

  _loadProfile() {
    try {
      if (fs.existsSync(this.profilePath)) {
        return JSON.parse(fs.readFileSync(this.profilePath, 'utf8'));
      }
    } catch {}
    return { samples: [], centroid: null, count: 0 };
  }

  _saveProfile() {
    fs.writeFile(this.profilePath, JSON.stringify(this.profile, null, 2), err => {
      if (err) console.error('[voice] save error:', err.message);
    });
  }

  /**
   * 从客户端 AudioContext 特征 + 文本构建特征向量
   */
  buildFeatureVector(transcript, audioFeatures = {}) {
    const t = String(transcript || '');
    const duration = Math.max(0.1, audioFeatures.duration || 1);
    const chars = t.replace(/\s/g, '').length;
    const words = t.split(/\s+/).filter(Boolean).length || Math.ceil(chars / 2);

    return [
      Math.min(1, duration / 30),
      Math.min(1, audioFeatures.rms || 0),
      Math.min(1, (audioFeatures.zcr || 0) / 0.3),
      Math.min(1, (audioFeatures.pitchMean || 150) / 400),
      Math.min(1, (chars / duration) / 15),
      Math.min(1, words / duration / 5),
      Math.min(1, ((t.match(/[，。！？、；：]/g) || []).length + 1) / 10),
      Math.min(1, ((t.match(/[啊呢吧吗哦嗯]/g) || []).length) / 8)
    ];
  }

  analyze(transcript, audioFeatures = {}) {
    const vector = this.buildFeatureVector(transcript, audioFeatures);
    const emotion = this._analyzeEmotion(transcript);

    if (!this.profile.centroid || this.profile.count === 0) {
      this.profile.samples.push({ vector, ts: Date.now() });
      this.profile.centroid = [...vector];
      this.profile.count = 1;
      this._saveProfile();
      return {
        similarity_score: 0.72,
        emotion_analysis: emotion,
        features: { vector, audio: audioFeatures },
        is_baseline: true,
        feedback: '首次采样已建立声纹基线，请继续录制 2-3 段以提升准确度'
      };
    }

    const simToCentroid = cosine(vector, this.profile.centroid);
    const histSims = this.profile.samples.slice(-5).map(s => cosine(vector, s.vector));
    const simToRecent = histSims.length ? mean(histSims) : simToCentroid;
    const similarity = Math.min(0.98, Math.max(0.35, simToCentroid * 0.6 + simToRecent * 0.4));

    this.profile.samples.push({ vector, ts: Date.now() });
    if (this.profile.samples.length > 30) {
      this.profile.samples = this.profile.samples.slice(-30);
    }
    this.profile.count++;
    this.profile.centroid = this.profile.samples.map(s => s.vector).reduce((acc, v) => {
      return acc.map((x, i) => x + v[i]);
    }, new Array(vector.length).fill(0)).map(x => x / this.profile.samples.length);
    this._saveProfile();

    return {
      similarity_score: similarity,
      emotion_analysis: emotion,
      features: { vector, audio: audioFeatures },
      is_baseline: false,
      feedback: this._feedback(similarity)
    };
  }

  saveAudioSample(sessionId, audioBase64) {
    if (!audioBase64 || audioBase64 === 'web_placeholder') return null;
    try {
      const raw = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      const buf = Buffer.from(raw, 'base64');
      const file = path.join(this.samplesDir, `${sessionId}.webm`);
      fs.writeFileSync(file, buf);
      return file;
    } catch {
      return null;
    }
  }

  _analyzeEmotion(text) {
    if (/开心|高兴|快乐/.test(text)) return { detected: 'happy', confidence: 0.82 };
    if (/难过|伤心|痛苦/.test(text)) return { detected: 'sad', confidence: 0.82 };
    if (/平静|安静|冷静/.test(text)) return { detected: 'calm', confidence: 0.78 };
    return { detected: 'neutral', confidence: 0.65 };
  }

  _feedback(score) {
    if (score > 0.88) return '音色高度一致，声纹拟合优秀';
    if (score > 0.75) return '音色相似度良好，继续保持自然语速';
    if (score > 0.6) return '有一定相似度，建议再录一段日常对话';
    return '与基线差异较大，请用平时说话的语气和语速再试';
  }
}

module.exports = { VoiceAnalyzer };
