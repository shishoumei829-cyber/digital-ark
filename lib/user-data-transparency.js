'use strict';

/**
 * 用户数据透明审查 — 汇总系统内已写入、用于塑造分身的全部信息
 */

function summarizeDimension(dimKey, dim) {
  if (!dim) return null;
  const out = { dimension: dimKey };
  if (dim.ranked_values?.length) out.ranked_values = dim.ranked_values;
  if (dim.standards?.length) out.standards = dim.standards;
  if (dim.conflict_resolution) out.conflict_resolution = dim.conflict_resolution;
  if (dim.primary_style) out.primary_style = dim.primary_style;
  if (dim.attachment_style) out.attachment_style = dim.attachment_style;
  if (dim.moral_foundations) out.moral_foundations = dim.moral_foundations;
  if (dim.big_five) out.big_five = dim.big_five;
  if (dim.completeness != null) out.completeness = dim.completeness;
  if (dim.sources?.length) {
    out.source_count = dim.sources.length;
    out.last_source = dim.sources[dim.sources.length - 1];
  }
  return out;
}

function buildGuideTaskLog(trainingGuide, personaId) {
  if (typeof trainingGuide.listCompletedTasks === 'function') {
    return trainingGuide.listCompletedTasks(personaId);
  }
  return [];
}

function mapSessions(sessions) {
  return (sessions || []).slice(-80).map(s => ({
    id: s.id,
    type: s.type,
    at: s.timestamp || s.ts,
    summary: sessionSummary(s)
  }));
}

function sessionSummary(s) {
  const d = s.data || {};
  switch (s.type) {
    case 'voice':
      return `朗读：${(d.transcript || '').slice(0, 120)}${(d.transcript || '').length > 120 ? '…' : ''}`;
    case 'memory':
      return `记忆：${(d.content || '').slice(0, 120)}`;
    case 'relationship':
      return `关系「${d.scene || '场景'}」→ ${(d.responseText || '').slice(0, 100)}`;
    case 'emotion':
      return `情绪「${d.scenario || ''}」→ ${(d.response || '').slice(0, 100)}`;
    case 'cognition':
      return `认知选择：${(d.choices || []).map(c => c.choice).join(' / ') || '—'}`;
    default:
      return JSON.stringify(d).slice(0, 160);
  }
}

function mapFeedback(feedbackLearning) {
  const data = feedbackLearning?.data || {};
  const mapEntry = (e, kind) => ({
    kind,
    at: e.ts,
    user: e.user,
    reply: e.reply,
    comment: e.comment || null,
    correction: e.correction || null,
    preferred_reply: e.preferred_reply || null
  });
  return {
    counts: feedbackLearning?.getCounts?.() || {
      positive: (data.positive || []).length,
      negative: (data.negative || []).length
    },
    style_hints: feedbackLearning?.getPromptHints?.() || data.style_hints,
    positive: (data.positive || []).slice(-40).map(e => mapEntry(e, 'like')),
    corrections: (feedbackLearning?.getCorrections?.(40) || []).map(e => mapEntry(e, 'correction'))
  };
}

function mapRagItems(ragStore, limit = 40) {
  return (ragStore?.items || []).slice(-limit).map(it => ({
    id: it.id,
    preview: String(it.text || '').slice(0, 200),
    metadata: it.metadata || {},
    created: it.created
  }));
}

function buildTransparencyReport(deps) {
  const {
    trainingSetup,
    trainingGuide,
    trainingSystem,
    personalMemory,
    relationshipStore,
    corePersona,
    memoryInfluence,
    capsSediment,
    feedbackLearning,
    ragStore,
    personaId = 'user'
  } = deps;

  const setup = trainingSetup.get();
  const memories = personalMemory.list({ limit: 500 });
  const relationships = relationshipStore.list();
  const guide = trainingGuide.getOverview(personaId);
  const guide_tasks = buildGuideTaskLog(trainingGuide, personaId);
  const progressDeps = deps.buildProgressDeps?.() || {};
  const progress = deps.trainingSystem.getProgress(progressDeps, progressDeps);

  const coreState = corePersona.getState();
  const dimensions = {};
  for (const [k, v] of Object.entries(coreState.dimensions || {})) {
    dimensions[k] = summarizeDimension(k, v);
  }

  const voiceProfile = trainingSystem.voiceAnalyzer?.profile || {};
  const voiceSamples = (voiceProfile.samples || []).slice(-10).map((s, i) => ({
    index: i,
    recorded_at: s.ts
  }));

  return {
    exported_at: new Date().toISOString(),
    notice:
      '以下内容为数字方舟在本机为您保存、并用于生成回复与训练进度的全部主要数据。您有权随时查看；导出 JSON 可留存备份。',
    identity: {
      setup,
      setup_complete: trainingSetup.isComplete(),
      subject_name: setup.subject_name,
      trainer_name: setup.trainer_name,
      trainer_role: setup.trainer_role,
      mode: setup.mode,
      key_people: setup.key_people || []
    },
    guide: {
      overview: guide,
      completed_tasks: guide_tasks
    },
    layers: {
      progress,
      core: {
        completeness: coreState.completeness,
        updated: coreState.updated,
        dimensions
      },
      caps: corePersona.getCapsState(),
      caps_activation_log: capsSediment?.getActivationLog?.(50) || [],
      memory_sediments: memoryInfluence.listSediments(),
      expression: {
        voice_profile: {
          sample_count: voiceProfile.count || 0,
          has_centroid: !!voiceProfile.centroid,
          samples_meta: voiceSamples
        }
      }
    },
    memories: {
      total: memories.total,
      items: (memories.items || []).map(m => ({
        id: m.id,
        tier: m.tier,
        content: m.content,
        tags: m.tags,
        time: m.time,
        place: m.place,
        people: m.people,
        emotion: m.emotion,
        source: m.source,
        created: m.created
      }))
    },
    relationships: {
      people: relationships,
      completed_scenarios: relationshipStore.completedScenarios || []
    },
    training_sessions: {
      count: (trainingSystem.sessions || []).length,
      items: mapSessions(trainingSystem.sessions)
    },
    chat_feedback: mapFeedback(feedbackLearning),
    knowledge_index: {
      rag_item_count: ragStore?.items?.length || 0,
      recent_items: mapRagItems(ragStore, 30)
    }
  };
}

module.exports = { buildTransparencyReport, buildGuideTaskLog };
