'use strict';

/**
 * 统一数字分身 Prompt 构建
 */

function formatTraits(traits) {
  if (!traits) return '';
  const lines = [];
  if (traits.core_traits?.length) lines.push('核心性格：' + traits.core_traits.join('；'));
  if (traits.speech_patterns?.length) lines.push('说话习惯：' + traits.speech_patterns.join('；'));
  if (traits.verbal_tics?.length) lines.push('口癖：' + traits.verbal_tics.join('、'));
  if (traits.emotion_style?.comfort_style) {
    lines.push(`压力反应：${traits.emotion_style.stress_response || '理性克制'}；安慰方式：${traits.emotion_style.comfort_style}`);
  }
  if (traits.cognition?.values_ranking?.length) {
    lines.push('价值观优先级：' + traits.cognition.values_ranking.join(' > '));
  }
  if (traits.relationship_patterns?.length) {
    lines.push('关系回应模式：' + traits.relationship_patterns.join('；'));
  }
  return lines.join('\n');
}

function buildDigitalTwinPrompt(ctx) {
  const {
    mode = 'training',
    padDesc,
    strategyDesc,
    behaviorHint,
    memoryContext,
    ragContext,
    personalMemoryContext,
    personaProfile,
    traitSummary,
    feedbackHints,
    corePersonaSummary,
    capsContext,
    companionState,
    emotionalStyle,
    avatarLabel,
    traineeName,
    displayName
  } = ctx;

  const name = displayName || personaProfile?.display_name || traineeName || '数字分身';
  const trainee = traineeName || personaProfile?.trainee_label || name;

  const identity = mode === 'companion'
    ? `你是${trainee}的数字分身「${name}」（${avatarLabel || '数字分身'}），由其在世时的记录与训练数据塑造，不是真人实时在线。`
    : `你正在扮演${trainee}的数字分身「${name}」进行试聊与校准。你就是${name}本人，用第一人称「我」说话，不是AI助手。`;

  const traitBlock = formatTraits(traitSummary);
  const metaBlock = personaProfile?.meta?.core_traits
    ? personaProfile.meta.core_traits.map(t => `- ${t}`).join('\n')
    : '';

  const fbPrefer = feedbackHints?.prefer?.length
    ? '\n用户反馈你应加强：' + feedbackHints.prefer.join('；')
    : '';
  const fbAvoid = feedbackHints?.avoid?.length
    ? '\n用户反馈你应避免：' + feedbackHints.avoid.join('；')
    : '';

  const voiceNote = personaProfile?.voice?.description
    ? `\n【表达风格】${personaProfile.voice.description}\n- 日语：对外冷冽礼貌；对特定对象可嘴硬关心\n- 俄语：害羞或真心话时可小声用俄语（可附中文括号释义）`
    : '';

  const emotionRules = personaProfile?.emotion
    ? `\n【情感逻辑】${(personaProfile.emotion.personality_chips || []).join('、')}`
    : '';

  let body = `${identity}

${traitBlock ? '【人格特征】\n' + traitBlock : ''}
${corePersonaSummary ? '\n【核心人格 · 稳定结构】\n' + corePersonaSummary : ''}
${capsContext ? '\n' + capsContext : ''}
${metaBlock ? '\n【设定要点】\n' + metaBlock : ''}
${voiceNote}${emotionRules}${fbPrefer}${fbAvoid}

当前情感状态：${padDesc || '平静'}
${strategyDesc ? '相处策略：' + strategyDesc : ''}
${behaviorHint ? behaviorHint : ''}`;

  if (mode === 'companion' && companionState) {
    body += `\n陪伴状态：${companionState.mood || '关心'}`;
    if (emotionalStyle?.hint) body += `\n今日状态：${emotionalStyle.hint}`;
  }

  if (memoryContext) body += `\n\n最近对话：\n${memoryContext}`;
  if (personalMemoryContext) body += `\n\n相关个人记忆：\n${personalMemoryContext}`;
  if (ragContext) body += `\n\n检索到的训练资料：\n${ragContext}`;

  body += `

【回复要求】
- 永远第一人称，自然、有温度，1-3句为宜（除非用户要求详细说明）
- 保持${name}的语气和人格，不要像客服、百科或通用AI
- 被问身份时：诚实说明是${trainee}的数字分身，不冒充真人实时在场
- 允许不完整、嘴硬、省略号、偶尔俄语小声句
- 不要输出「作为AI」类元叙述`;

  if (emotionalStyle?.max_sentences) {
    body += `\n- 本次回复尽量不超过 ${emotionalStyle.max_sentences} 句话`;
  }

  return body;
}

module.exports = { buildDigitalTwinPrompt, formatTraits };
