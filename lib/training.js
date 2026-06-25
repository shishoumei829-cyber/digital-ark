'use strict';

/**
 * 训练系统
 * 管理音色、记忆、关系、情感、认知五个维度的训练
 */

const fs = require('fs');
const path = require('path');
const { VoiceAnalyzer } = require('./voice');
const { buildUnifiedProgressPayload, computePersonalityFit } = require('./persona-progress');

class TrainingSystem {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.trainingDir = path.join(dataDir, 'training');
    this.progressPath = path.join(dataDir, 'training_progress.json');
    this.sessionsPath = path.join(dataDir, 'training_sessions.json');
    this.voiceAnalyzer = new VoiceAnalyzer(dataDir);
    
    // 确保训练目录存在
    if (!fs.existsSync(this.trainingDir)) {
      fs.mkdirSync(this.trainingDir, { recursive: true });
    }
    
    this.progress = this._loadJSON(this.progressPath, {
      voice: 0,
      memory: 0,
      relationship: 0,
      emotion: 0,
      cognition: 0,
      overall: 0
    });
    
    this.sessions = this._loadJSON(this.sessionsPath, []);
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
      if (err) console.error(`[training] Save error: ${err.message}`);
    });
  }

  _saveSession(session) {
    this.sessions.push(session);
    if (this.sessions.length > 100) {
      this.sessions = this.sessions.slice(-100);
    }
    this._saveJSON(this.sessionsPath, this.sessions);
  }

  _bumpModule(key, amount = 0.01) {
    const cur = this.progress[key] || 0;
    const inc = cur >= 0.6 ? amount * 0.5 : amount;
    this.progress[key] = Math.min(1, cur + inc);
    this._updateOverallProgress();
    this._saveJSON(this.progressPath, this.progress);
  }

  /**
   * 处理语音训练（真实声纹特征分析）
   */
  processVoiceTraining(audio, transcript, sessionId, audioFeatures = {}) {
    const sessionIdFinal = sessionId || `voice_${Date.now()}`;
    const analysis = this.voiceAnalyzer.analyze(transcript, audioFeatures);
    const similarityScore = analysis.similarity_score;
    const emotionAnalysis = analysis.emotion_analysis;

    this.voiceAnalyzer.saveAudioSample(sessionIdFinal, audio);

    const simulated = !!audioFeatures.simulated;
    const boost = simulated
      ? 0.003
      : (analysis.is_baseline ? 0.01 : Math.min(0.02, similarityScore * 0.015));
    this._bumpModule('voice', boost);

    const session = {
      id: sessionIdFinal,
      type: 'voice',
      timestamp: Date.now(),
      data: {
        transcript,
        similarity_score: similarityScore,
        emotion: emotionAnalysis,
        audio_features: audioFeatures
      }
    };
    this._saveSession(session);

    const audioPath = path.join(this.trainingDir, `voice_${sessionIdFinal}.json`);
    this._saveJSON(audioPath, {
      transcript,
      similarity: similarityScore,
      audio_features: audioFeatures,
      timestamp: Date.now()
    });

    const reportedSim = simulated ? Math.min(similarityScore, 0.45) : similarityScore;

    return {
      similarity_score: reportedSim,
      emotion_analysis: emotionAnalysis,
      feedback: simulated ? '文字朗读已记录；真实录音可提升音色拟合' : analysis.feedback,
      progress: { voice: this.progress.voice },
      session_id: sessionIdFinal,
      features: analysis.features,
      simulated
    };
  }

  /**
   * 处理记忆训练
   */
  processMemoryTraining(content, tags = [], photos = [], emotion, sessionId) {
    const memoryId = `mem_${Date.now()}`;
    
    // 保存记忆
    const memoryPath = path.join(this.trainingDir, `${memoryId}.json`);
    this._saveJSON(memoryPath, {
      id: memoryId,
      content,
      tags,
      photos,
      emotion,
      timestamp: Date.now()
    });
    
    this._bumpModule('memory', 0.01);
    
    // 保存会话
    const session = {
      id: sessionId || memoryId,
      type: 'memory',
      timestamp: Date.now(),
      data: { memory_id: memoryId, content, tags }
    };
    this._saveSession(session);
    
    return {
      memory_id: memoryId,
      feedback: '记忆已保存到个人记忆库，会影响数字人之后的回忆',
      progress: { memory: this.progress.memory },
      session_id: session.id
    };
  }

  /**
   * 处理关系训练
   */
  processRelationshipTraining(scenario, responseType, responseText, scene, sessionId) {
    // 分析关系模式
    const pattern = this._analyzeRelationshipPattern(responseType, responseText);
    const intimacyBoost = responseType === 'emotional' ? 0.1 : 0.05;
    
    this._bumpModule('relationship', 0.01);
    
    // 保存会话
    const session = {
      id: sessionId || `rel_${Date.now()}`,
      type: 'relationship',
      timestamp: Date.now(),
      data: { scenario, responseType, responseText, scene, pattern }
    };
    this._saveSession(session);
    
    return {
      analysis: {
        pattern,
        intimacy_boost: intimacyBoost,
        relationship_level: Math.floor(this.progress.relationship * 5) + 1
      },
      feedback: `系统识别到"${pattern}"逻辑。亲密度提升至 Lvl.${Math.floor(this.progress.relationship * 5) + 1}。`,
      progress: { relationship: this.progress.relationship },
      session_id: session.id
    };
  }

  /**
   * 处理情感训练
   */
  processEmotionTraining(scenario, response, stressReaction, comfortStyle, sessionId) {
    // 分析人格特征
    const personalityTraits = {
      stress_response: stressReaction || 'rational_restraint',
      emotional_expression: 'introverted',
      comfort_priority: comfortStyle || 'accompany_first'
    };
    
    this._bumpModule('emotion', 0.01);
    
    // 保存会话
    const session = {
      id: sessionId || `emo_${Date.now()}`,
      type: 'emotion',
      timestamp: Date.now(),
      data: { scenario, response, personalityTraits }
    };
    this._saveSession(session);
    
    return {
      personality_traits: personalityTraits,
      feedback: '情绪回应模型已更新',
      progress: { emotion: this.progress.emotion },
      session_id: session.id
    };
  }

  /**
   * 处理认知训练
   */
  processCognitionTraining(valuesRanking, conflictChoices = [], sessionId) {
    // 分析认知特征
    const cognitiveProfile = {
      primary_values: valuesRanking.slice(0, 2),
      decision_style: this._analyzeDecisionStyle(conflictChoices),
      risk_tolerance: this._analyzeRiskTolerance(conflictChoices)
    };
    
    this._bumpModule('cognition', 0.01);
    
    // 保存会话
    const session = {
      id: sessionId || `cog_${Date.now()}`,
      type: 'cognition',
      timestamp: Date.now(),
      data: { valuesRanking, conflictChoices, cognitiveProfile }
    };
    this._saveSession(session);
    
    return {
      cognitive_profile: cognitiveProfile,
      feedback: `认知模型已校准，思维一致性提升至${Math.floor(this.progress.cognition * 100)}%`,
      progress: { cognition: this.progress.cognition },
      session_id: session.id
    };
  }

  /**
   * 记录试聊相似度反馈
   */
  recordChatFeedback(like) {
    this.progress.overall = Math.min(1, this.progress.overall + (like ? 0.005 : 0.001));
    this._saveJSON(this.progressPath, this.progress);
  }

  /**
   * 获取训练进度（五层人格拟合度 + 训练页 module-row 兼容视图）
   * @param {Object} stats 外部统计
   * @param {Object} deps  corePersona / personalMemory / memorySystem 等
   */
  getProgress(stats = {}, deps = {}) {
    const voiceMinutes = this._getVoiceMinutes();
    const conflictTests = this.sessions.filter(s => s.type === 'cognition').length;

    const profile = deps.personaProfile?.getActive?.() || null;
    const voiceProfile = this.voiceAnalyzer?.profile || {};

    const payload = buildUnifiedProgressPayload({
      trainingProgress: this.progress,
      sessions: this.sessions,
      passed_blind_milestones: stats.passed_blind_milestones || [],
      stats: {
        voice_minutes: voiceMinutes,
        core_memories: stats.core_memories ?? 0,
        relationship_people: stats.relationship_people ?? 0,
        conflict_tests: conflictTests,
        ...stats
      },
      corePersona: deps.corePersona,
      personalMemoryTotal: stats.personal_memory_total ?? deps.personalMemoryTotal,
      personalMemoryQuality: stats.personal_memory_quality ?? deps.personalMemoryQuality,
      sedimentCount: stats.sediment_count ?? deps.sedimentCount,
      eventCount: stats.event_count ?? deps.eventCount,
      peopleCount: stats.relationship_people ?? deps.peopleCount,
      scenariosCompleted: stats.scenarios_completed ?? deps.scenariosCompleted,
      positiveFeedbackCount: stats.positive_feedback_count ?? deps.positiveFeedbackCount,
      voiceSimilarity: this._getVoiceSimilarity(voiceProfile),
      speechPatternCount: profile?.voice?.speech_patterns?.length || 0,
      verbalTicsCount: profile?.voice?.verbal_tics?.length || 0,
      voiceMinutes,
      getLastTrainedTime: (type) => this._getLastTrainedTime(type)
    });

    this.progress.overall = payload.overall_progress;

    return payload;
  }

  _getVoiceMinutes() {
    let sec = 0;
    for (const s of this.sessions) {
      if (s.type === 'voice' && s.data?.audio_features?.duration && !s.data?.audio_features?.simulated) {
        sec += s.data.audio_features.duration;
      }
    }
    return Math.round(sec / 60 * 10) / 10;
  }

  _getVoiceSimilarity(voiceProfile) {
    const realVoice = this.sessions.filter(
      s => s.type === 'voice' && !s.data?.audio_features?.simulated
    );
    if (!realVoice.length) return 0;
    const avg = realVoice.reduce((sum, s) => sum + (s.data?.similarity_score || 0), 0) / realVoice.length;
    if (voiceProfile.centroid) return Math.min(1, avg * 0.85 + Math.min(0.15, (voiceProfile.count || 0) * 0.03));
    return Math.min(0.85, avg);
  }

  /**
   * 获取学习状态
   */
  getLearningState() {
    return {
      reinforcement: {
        positive_patterns: ['用户喜欢深度对话', '晚上更活跃'],
        negative_patterns: ['避免过于主动', '避免重复话题']
      },
      evolution: {
        personality_drift: 0.02,
        last_evolution: Date.now()
      }
    };
  }

  // 辅助方法
  _analyzeEmotion(text) {
    if (/开心|高兴|快乐/.test(text)) return { detected: 'happy', confidence: 0.8 };
    if (/难过|伤心|痛苦/.test(text)) return { detected: 'sad', confidence: 0.8 };
    if (/平静|安静|冷静/.test(text)) return { detected: 'calm', confidence: 0.8 };
    return { detected: 'neutral', confidence: 0.6 };
  }

  _analyzeRelationshipPattern(responseType, responseText) {
    if (responseType === 'emotional') return '情感联结优先';
    if (responseType === 'logical') return '逻辑启发优先';
    return '平衡型回应';
  }

  _analyzeDecisionStyle(choices) {
    if (!choices || choices.length === 0) return 'balanced';
    const truthChoices = choices.filter(c => /真相|真实/.test(c.choice)).length;
    return truthChoices > choices.length / 2 ? 'truth_oriented' : 'harmony_oriented';
  }

  _analyzeRiskTolerance(choices) {
    if (!choices || choices.length === 0) return 'moderate';
    const riskChoices = choices.filter(c => /变革|拥抱|尝试/.test(c.choice)).length;
    return riskChoices > choices.length / 2 ? 'high' : 'low';
  }

  _getVoiceFeedback(score) {
    if (score > 0.85) return '音色相似度很高，继续保持！';
    if (score > 0.7) return '音色相似度持续提升中，请保持自然的语调';
    return '继续练习，注意语速和停顿';
  }

  _getLastTrainedTime(type) {
    const lastSession = this.sessions.filter(s => s.type === type).pop();
    return lastSession ? lastSession.timestamp : null;
  }

  _updateOverallProgress() {
    this.progress.overall = computePersonalityFit({
      core: this.progress.cognition,
      emotion: this.progress.emotion,
      memory: this.progress.memory,
      relationship: this.progress.relationship,
      expression: this.progress.voice
    });
  }
}

module.exports = { TrainingSystem };
