'use strict';

/**
 * 数字方舟 - 后端服务
 * 整合 Amadeus 认知系统 + 数字方舟训练/陪护系统
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 加载环境变量
function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq < 1) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (process.env[key] == null || process.env[key] === '') process.env[key] = val;
  }
}
loadDotEnv();

// 导入认知层模块
const { PADManager } = require('./cognitive/pad');
const { MotivationSystem } = require('./cognitive/motivation');
const { StrategyLayer } = require('./cognitive/strategy');
const { BehaviorDecision } = require('./cognitive/behavior');
const { MemorySystem } = require('./lib/memory');
const { TrainingSystem } = require('./lib/training');
const { CompanionSystem } = require('./lib/companion');
const { RAGStore } = require('./lib/rag');
const { BackupManager } = require('./lib/backup');
const { TTSService } = require('./lib/tts');
const { encryptSensitive } = require('./lib/crypto');
const { PersonalMemoryStore } = require('./lib/personal-memory');
const { RelationshipStore } = require('./lib/relationship-store');
const { ProactivityEngine } = require('./lib/proactivity');
const { BlindTestManager } = require('./lib/blind-test');
const { DialogArchiveStore } = require('./lib/dialog-archive');
const { AuthorizationStore } = require('./lib/authorization');
const { GriefModeManager } = require('./lib/grief-mode');
const { DependencyMonitor } = require('./lib/dependency-monitor');
const { TrainingSessionManager, REST_MESSAGE } = require('./lib/training-session');
const { EmotionalVarianceEngine } = require('./lib/emotional-variance');
const { CONFLICT_SCENARIOS, MEMORY_TIERS } = require('./lib/design-spec');
const { PersonaBundleManager } = require('./lib/persona-bundle');
const { PersonaProfileStore } = require('./lib/persona-profile');
const { FeedbackLearningStore } = require('./lib/feedback-learning');
const { buildDigitalTwinPrompt } = require('./lib/prompt-builder');
const { TrainingGuideEngine } = require('./lib/training-guide');
const { TrainingSetupStore } = require('./lib/training-setup');
const { HomeTrainingCoach } = require('./lib/home-training');
const { buildUserPersonaBundle, saveUserBundleReview } = require('./lib/user-persona-bundle');
const { CorePersonaLayer } = require('./lib/core-persona');
const { CAPSEngine, CAU_TYPES } = require('./lib/caps-engine');
const { MemoryInfluenceResolver } = require('./lib/memory-influence');
const { CapsSedimentTracker } = require('./lib/caps-sediment');
const { PersonaChangelogStore } = require('./lib/persona-changelog');
const { buildTrainingDashboard } = require('./lib/training-dashboard');
const { normalizeTags, labelsFor } = require('./lib/calibration-feedback');
const { buildLayerExplanation, formatFeedbackLayerUpdates } = require('./lib/layer-explanation');

const REPO_ROOT = __dirname;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 配置
const PORT = process.env.PORT || 3000;
const OLLAMA_BASE = (process.env.OLLAMA_BASE || 'http://127.0.0.1:11434').replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), 'digital_ark_data');
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 初始化系统实例
const padManager = new PADManager(DATA_DIR);
const motivationSystem = new MotivationSystem(DATA_DIR);
const strategyLayer = new StrategyLayer(DATA_DIR);
const behaviorDecision = new BehaviorDecision();
const memorySystem = new MemorySystem(DATA_DIR);
const trainingSystem = new TrainingSystem(DATA_DIR);
const companionSystem = new CompanionSystem(DATA_DIR);
const ragStore = new RAGStore(DATA_DIR, OLLAMA_BASE, EMBED_MODEL);
const ttsService = new TTSService(process.env.SOVITS_URL, process.env.SOVITS_REF);
const backupManager = new BackupManager(DATA_DIR);
const personalMemory = new PersonalMemoryStore(DATA_DIR);
const relationshipStore = new RelationshipStore(DATA_DIR);
const blindTestManager = new BlindTestManager(DATA_DIR);
const dialogArchive = new DialogArchiveStore(DATA_DIR);
const authorizationStore = new AuthorizationStore(DATA_DIR);
const griefModeManager = new GriefModeManager(DATA_DIR);
const dependencyMonitor = new DependencyMonitor(DATA_DIR);
const trainingSessionManager = new TrainingSessionManager(DATA_DIR);
const emotionalVariance = new EmotionalVarianceEngine(DATA_DIR);
const proactivityEngine = new ProactivityEngine(DATA_DIR, companionSystem, memorySystem);
const personaBundleManager = new PersonaBundleManager(DATA_DIR, REPO_ROOT);
const personaProfile = new PersonaProfileStore(DATA_DIR);
const feedbackLearning = new FeedbackLearningStore(DATA_DIR);
const trainingSetup = new TrainingSetupStore(DATA_DIR);
const trainingGuide = new TrainingGuideEngine(DATA_DIR, REPO_ROOT, { setupStore: trainingSetup });
const homeTrainingCoach = new HomeTrainingCoach(trainingGuide, trainingSetup);
const corePersona = new CorePersonaLayer(DATA_DIR);
const memoryInfluence = new MemoryInfluenceResolver(memorySystem, personalMemory, DATA_DIR);
const capsSediment = new CapsSedimentTracker(DATA_DIR, corePersona);
const personaChangelog = new PersonaChangelogStore(DATA_DIR);

let lastChatCaps = null;

function recordTwinChange({ source, module, summary, changes }) {
  try {
    return personaChangelog.append({ source, module, summary, changes });
  } catch (e) {
    console.warn('[changelog]', e.message);
    return null;
  }
}

const { TrainingIngestor } = require('./lib/training-ingest');
const trainingIngestor = new TrainingIngestor({
  corePersona,
  recordTwinChange,
  dataDir: DATA_DIR,
  personaProfile,
  finetunePersonaId: 'user'
});

const PERSONA_ID = process.env.PERSONA_ID || 'user';
const { FinetuneRunner, loadActiveChatModel } = require('./lib/finetune-runner');
let activeChatModelInfo = loadActiveChatModel(DATA_DIR);
let CHAT_MODEL = activeChatModelInfo?.model
  || process.env.PERSONA_MODEL
  || process.env.CHAT_MODEL
  || 'kurisu:latest';
const finetuneRunner = new FinetuneRunner({
  dataDir: DATA_DIR,
  repoRoot: REPO_ROOT,
  deps: {
    setupStore: trainingSetup,
    personalMemory,
    relationshipStore,
    feedbackLearning,
    trainingSystem
  }
});

/** 个人训练用 user，演示用预置 id，避免引导完成状态错乱 */
function activePersonaId(req) {
  const setup = trainingSetup.get();
  if (setup.mode === 'demo') return 'alisa-kujo';
  if (trainingSetup.isComplete()) return 'user';
  return reqPersonaIdFallback(req);
}
function reqPersonaIdFallback(req) {
  const q = req?.query?.persona_id || req?.body?.persona_id;
  if (q) return q;
  return trainingSetup.get()?.mode === 'demo' ? 'alisa-kujo' : 'user';
}

function guideAdvancePayload(module) {
  const pid = activePersonaId();
  const home = homeTrainingCoach.getHomeState(pid);
  const moduleGuide = module ? trainingGuide.peekModuleTask(pid, module) : null;
  return { next: home, home, module_guide: moduleGuide };
}

function attachGuideAdvance(data, module) {
  return { ...data, ...guideAdvancePayload(module) };
}

// 加载初始状态
let currentPAD = padManager.load();
let currentStrategy = strategyLayer.load();

ragStore.checkOllama().then(ok => {
  console.log(`[数字方舟] RAG: ${ok ? 'Ollama embeddings' : '本地向量降级'}`);
});

async function indexToRAG(id, text, metadata = {}) {
  if (!text || text.length < 4) return;
  try {
    await ragStore.add(id, text, metadata);
  } catch (e) {
    console.warn('[rag] index error:', e.message);
  }
}

console.log(`[数字方舟] 数据目录: ${DATA_DIR}`);
console.log(`[数字方舟] PAD状态: P=${currentPAD.P.toFixed(3)} A=${currentPAD.A.toFixed(3)} D=${currentPAD.D.toFixed(3)} S=${currentPAD.S.toFixed(3)}`);

// ══════════════════════════════════════════════════════════════════
//  对话核心链路
// ══════════════════════════════════════════════════════════════════

function runCognitivePipeline(userText) {
  const emotionDelta = padManager.inferEmotion(userText);
  currentPAD = padManager.update(currentPAD, emotionDelta);
  padManager.save(currentPAD);

  const relScore = memorySystem.getRelationshipScore();
  const memBias = memorySystem.getLongTermPadBias();
  motivationSystem.update(currentPAD, memBias, relScore);
  currentStrategy = strategyLayer.evolve(currentStrategy, currentPAD, relScore);

  const motivation = motivationSystem.getState();
  const candidates = behaviorDecision.generateCandidates(
    currentPAD, motivation, memorySystem, userText
  );
  const bestBehavior = behaviorDecision.selectBest(candidates);
  memorySystem.recordBehavior(bestBehavior.id);

  memorySystem.addEvent('conversation', userText, 0.5, emotionDelta);

  return { emotionDelta, bestBehavior, motivation };
}

async function callOllama(messages, stream = false) {
  const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      stream
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama 请求失败 (${response.status})，请确认 Ollama 已启动且模型已下载`);
  }

  return response;
}

function fallbackReply(userText, behavior) {
  const name = behavior?.name || '陪伴';
  if (/你好|嗨|hello/i.test(userText)) return `你好，我在这里。今天想聊点什么？（${name}）`;
  if (/难过|伤心|累/.test(userText)) return `听起来你不太容易。愿意多说一点吗？我会认真听。`;
  if (/开心|高兴/.test(userText)) return `太好了，我也替你高兴。发生了什么好事？`;
  return `我在听。${behavior?.constraints || '你可以继续说说。'}`;
}

function buildProgressSnapshot() {
  try {
    const deps = buildProgressDeps();
    return trainingSystem.getProgress(deps, deps);
  } catch {
    return null;
  }
}

function formatCapsSnapshot(capsResult, precedent, sediment, extra = {}) {
  const relScore = extra.relationship_depth ?? memorySystem.getRelationshipScore();
  const progress = extra.progress || buildProgressSnapshot();
  const layer_explanation = buildLayerExplanation({
    capsResult,
    precedent,
    pad: extra.pad || currentPAD,
    relationshipDepth: relScore,
    feedbackHints: feedbackLearning.getPromptHints(),
    progress,
    feedbackCounts: feedbackLearning.getCounts(),
    coreState: corePersona.getState()
  });

  return {
    situation_tags: capsResult.situation?.tags || [],
    encoding_hint: capsResult.situation?.encoding_hint || null,
    propagation_path: capsResult.propagation_path || [],
    propagation_labels: (capsResult.propagation_path || []).map(p => CAU_TYPES[p]?.label || p),
    behavior_signature: capsResult.behavior_signature,
    dimension_weights: capsResult.dimension_weights,
    precedent: precedent?.found
      ? {
          content: String(precedent.content || '').slice(0, 120),
          source: precedent.source,
          outcome: precedent.outcome,
          success: precedent.success,
          score: precedent.score
        }
      : null,
    sediment_new: sediment?.sedimented?.length || 0,
    sediment_suggestions: sediment?.suggestions || [],
    layer_explanation
  };
}

function runPersonaCapsPipeline(userQuery, options = {}) {
  const relScore = memorySystem.getRelationshipScore();
  const engine = new CAPSEngine(corePersona);
  const situation = engine.parseSituation({
    user_text: userQuery,
    relationship_depth: relScore,
    emotion_valence: currentPAD.P,
    event_nature: options.event_nature || 'mixed'
  });

  const precedent = memoryInfluence.findPrecedent(userQuery, { situation_tags: situation.tags });
  if (precedent.found) {
    currentPAD = memoryInfluence.applyEmotionResidue(currentPAD, precedent);
    padManager.save(currentPAD);
  }

  let eventNature = options.event_nature || 'mixed';
  if (situation.tags.includes('core_value_conflict')) eventNature = 'core_value';
  else if (precedent.found && precedent.success === false) eventNature = 'core_value';

  const capsResult = corePersona.processCAPS({
    user_text: userQuery,
    relationship_depth: relScore,
    emotion_valence: currentPAD.P,
    event_nature: eventNature,
    precedent_memory: precedent.found ? precedent : null
  });

  capsSediment.recordActivation(capsResult, userQuery);
  const sediment = capsSediment.checkAndSediment(memoryInfluence);
  memoryInfluence.reload();

  return { capsResult, precedent, sediment, situation };
}

async function buildFullPrompt(userQuery, options = {}) {
  const {
    companionMode = null,
    emotionalStyle = null,
    avatarLabel = '数字分身',
    traineeName,
    bestBehavior = null
  } = options;

  const padDesc = padManager.toNaturalLanguage(currentPAD);
  const strategyDesc = strategyLayer.describe(currentStrategy);

  const ragTopK = Number(process.env.RAG_TOP_K || 8);
  let ragHits = [];
  if (userQuery) {
    const memHits = await ragStore.search(userQuery, 3, { types: ['memory'] });
    const relHits = await ragStore.search(userQuery, 2, { types: ['relationship', 'emotion'] });
    const cogHits = await ragStore.search(userQuery, 2, { types: ['cognition'] });
    const generalHits = await ragStore.search(userQuery, ragTopK);
    const seen = new Set();
    for (const h of [...memHits, ...relHits, ...cogHits, ...generalHits]) {
      if (!seen.has(h.id)) {
        seen.add(h.id);
        ragHits.push(h);
      }
    }
    ragHits = ragHits.slice(0, ragTopK);
  }
  const ragContext = ragStore.formatContext(ragHits);

  const pmHits = userQuery ? personalMemory.searchContext(userQuery, 5) : personalMemory.memories.slice(-5);
  const personalMemoryContext = pmHits.length
    ? pmHits.map(m => `- [${m.tier}] ${m.content}${m.time ? '（' + m.time + '）' : ''}`).join('\n')
    : '';

  let traitSummary = personaProfile.buildTraitSummary(trainingSystem);
  if (activeChatModelInfo?.weights_personalized) {
    traitSummary = {
      ...traitSummary,
      speech_patterns: (traitSummary.speech_patterns || []).slice(0, 3),
      verbal_tics: (traitSummary.verbal_tics || []).slice(0, 4)
    };
  }
  const feedbackHints = feedbackLearning.getPromptHints();
  const { capsResult, precedent, sediment } = runPersonaCapsPipeline(userQuery, options);
  lastChatCaps = {
    capsResult,
    precedent,
    sediment,
    snapshot: formatCapsSnapshot(capsResult, precedent, sediment, {
      relationship_depth: memorySystem.getRelationshipScore(),
      pad: currentPAD
    })
  };
  const coreSummary = corePersona.generateSummary();
  const active = personaProfile.getActive();
  const setup = trainingSetup.isComplete() ? trainingSetup.get() : null;
  const tn = traineeName || setup?.subject_name || personaProfile.getTraineeName();
  const displayName = setup?.mode === 'personal' && setup?.subject_name
    ? setup.subject_name
    : personaProfile.getDisplayName();

  const capsHint = capsResult.behavior_signature?.output_hint
    ? `CAPS行为签名：${capsResult.behavior_signature.if_then}（表现倾向：${capsResult.behavior_signature.output_hint}）`
    : '';
  const behaviorHint = [
    bestBehavior ? `当前行为倾向：${bestBehavior.name}（${bestBehavior.constraints}）` : '',
    capsHint
  ].filter(Boolean).join('\n');

  return buildDigitalTwinPrompt({
    mode: companionMode ? 'companion' : 'training',
    padDesc,
    strategyDesc,
    behaviorHint,
    memoryContext: memorySystem.getRecentContext(5),
    ragContext,
    personalMemoryContext,
    personaProfile: active,
    traitSummary,
    corePersonaSummary: coreSummary,
    capsContext: capsResult.prompt_block,
    feedbackHints,
    companionState: companionMode ? companionSystem.getState() : null,
    emotionalStyle,
    avatarLabel,
    traineeName: tn,
    displayName
  });
}

async function generateReply(userText, messages, options = {}) {
  const { companionMode = null, emotionalStyle = null, avatarLabel = '数字分身', traineeName = '训练者' } = options;
  const { bestBehavior } = runCognitivePipeline(userText);

  indexToRAG(`conv_${Date.now()}`, userText, { type: 'conversation' });

  const systemPrompt = await buildFullPrompt(userText, {
    companionMode,
    emotionalStyle,
    avatarLabel,
    traineeName,
    bestBehavior
  });

  const ollamaMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  let reply;
  const personaName = personaProfile.getDisplayName();
  try {
    const response = await callOllama(ollamaMessages, false);
    const data = await response.json();
    reply = data.message?.content || fallbackReply(userText, { name: personaName, constraints: '你可以继续说说。' });
  } catch (err) {
    console.warn('[chat] Ollama unavailable, using fallback:', err.message);
    reply = fallbackReply(userText, { name: personaName, constraints: '你可以继续说说。' });
  }

  if (companionMode && emotionalStyle) {
    reply = emotionalVariance.applyToReply(reply, emotionalStyle);
  }
  return reply;
}

function checkDeepGate(moduleKey) {
  const gate = trainingSessionManager.canAccessDeep(moduleKey);
  if (!gate.ok && gate.reason === 'stopped_for_today') {
    return { blocked: true, status: 403, error: '今日已选择休息，明天再继续吧。' };
  }
  if (!gate.ok && gate.reason === 'gate_required') {
    return { blocked: true, status: 428, error: gate.prompt, gate: moduleKey };
  }
  return { blocked: false };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ══════════════════════════════════════════════════════════════════
//  对话接口
// ══════════════════════════════════════════════════════════════════

app.post('/chat', async (req, res) => {
  try {
    if (!trainingSetup.isComplete()) {
      return res.status(403).json({
        error: '请先填写您的称呼，创建数字分身后再试聊',
        reason: 'setup_required'
      });
    }

    const { messages, stream = false } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '消息格式错误' });
    }

    const userMessage = messages[messages.length - 1];
    if (userMessage.role !== 'user' || !userMessage.content) {
      return res.status(400).json({ error: '缺少用户消息' });
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ status: 'thinking', token: '' })}\n\n`);

      const { bestBehavior } = runCognitivePipeline(userMessage.content);
      indexToRAG(`conv_${Date.now()}`, userMessage.content, { type: 'conversation' });
      const systemPrompt = await buildFullPrompt(userMessage.content, { bestBehavior });
      const capsSnapshot = lastChatCaps?.snapshot || null;
      const ollamaMessages = [{ role: 'system', content: systemPrompt }, ...messages];

      try {
        const response = await callOllama(ollamaMessages, true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullReply = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(l => l.trim());
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.message?.content) {
                fullReply += data.message.content;
                res.write(`data: ${JSON.stringify({ token: data.message.content })}\n\n`);
              }
            } catch {}
          }
        }
        if (fullReply) memorySystem.addEvent('assistant_reply', fullReply, 0.3);
        res.write(`data: ${JSON.stringify({
          done: true,
          pad_state: currentPAD,
          strategy: currentStrategy,
          caps: capsSnapshot,
          layer_explanation: capsSnapshot?.layer_explanation || null,
          reply: fullReply
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        const reply = fallbackReply(userMessage.content, bestBehavior);
        memorySystem.addEvent('assistant_reply', reply, 0.3);
        res.write(`data: ${JSON.stringify({ token: reply })}\n\n`);
        res.write(`data: ${JSON.stringify({
          done: true,
          pad_state: currentPAD,
          strategy: currentStrategy,
          caps: capsSnapshot,
          layer_explanation: capsSnapshot?.layer_explanation || null,
          reply: reply
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    }

    const reply = await generateReply(userMessage.content, messages);
    memorySystem.addEvent('assistant_reply', reply, 0.3);
    companionSystem.recordInteraction();

    const snap = lastChatCaps?.snapshot || null;
    res.json({
      reply,
      pad_state: currentPAD,
      strategy: currentStrategy,
      caps: snap,
      layer_explanation: snap?.layer_explanation || null,
      memory_count: memorySystem.events.length,
      emotional_state: padManager.describeEmotion(currentPAD),
      is_digital_avatar: true,
      persona_id: personaProfile.getActive()?.id || null,
      chat_model: CHAT_MODEL
    });
  } catch (error) {
    console.error('[chat] Error:', error);
    res.status(500).json({ error: '对话处理失败: ' + error.message });
  }
});

// 试聊相似度反馈
app.post('/chat/feedback', (req, res) => {
  try {
    const {
      like,
      partial,
      message_id,
      comment,
      user_text,
      reply_text,
      correction,
      preferred_reply,
      deviation_tags
    } = req.body;
    const isPositive = !!like;
    const isPartial = !!partial && !isPositive;
    const fix = correction || preferred_reply;
    const devTags = normalizeTags(deviation_tags);

    memorySystem.addEvent(
      'feedback',
      fix || comment || (isPositive ? '回复很像自己' : (isPartial ? '部分相似' : '回复不太像')),
      isPositive ? 0.6 : 0.45
    );
    if (isPositive) trainingSystem.recordChatFeedback(true);

    const snap = lastChatCaps?.snapshot;
    const tags = snap?.situation_tags || [];
    if (!isPositive && fix && tags.length) {
      corePersona.recordCalibration({
        is_accurate: false,
        if_tags: tags,
        expected_behavior: fix,
        output_hint: fix,
        cau_path: snap?.propagation_path,
        signature_label: '试聊校准'
      });
    } else if (isPositive && tags.length && snap?.behavior_signature) {
      corePersona.addBehaviorSignature(
        CAPSEngine.buildSignaturePayload({
          if_tags: tags,
          behavior: snap.behavior_signature.output_hint || snap.behavior_signature.label,
          output_hint: snap.behavior_signature.output_hint,
          cau_path: snap.propagation_path,
          label: '试聊确认·很像',
          confidence: 0.88
        })
      );
    }

    if (user_text) {
      memoryInfluence.addSediment({
        pattern: String(user_text).slice(0, 200),
        tags,
        outcome: isPositive ? 'positive' : 'negative',
        emotion_residue: { P: isPositive ? 0.1 : -0.1, A: 0.05 },
        core_dimension: lastChatCaps?.capsResult?.behavior_signature?.source === 'boundary_pattern'
          ? 'boundary_pattern' : 'interpersonal_style'
      });
    }

    const hints = feedbackLearning.record({
      like: isPositive,
      userText: user_text,
      reply: reply_text,
      comment: comment || (isPartial ? '部分相似' : undefined),
      correction: fix,
      preferred_reply: fix
    });

    const changes = [];
    if (!isPositive && devTags.length) {
      changes.push(...feedbackLearning.applyDeviationHints(devTags));
    }
    if (fix) {
      changes.push('已记录你更倾向的表达方式，下次试聊会参考');
    }
    if (isPositive) {
      changes.push('已强化这条回复风格，数字人会更稳定地保持类似语气');
    }

    const devLabels = labelsFor(devTags);
    const summary = isPositive
      ? '试聊确认：这条回复很像你'
      : (fix
        ? `试聊校准：${devLabels.length ? devLabels.join('、') + '；' : ''}已记录你的原话修正`
        : (isPartial
          ? `试聊校准：部分相似${devLabels.length ? '（' + devLabels.join('、') + '）' : ''}`
          : `试聊校准：不像${devLabels.length ? ' — ' + devLabels.join('、') : ''}`));

    const layerUpdates = formatFeedbackLayerUpdates(devTags, fix);
    if (layerUpdates.length) changes.push(...layerUpdates);

    const log = recordTwinChange({
      source: 'calibration',
      module: 'chat',
      summary,
      changes: changes.length ? changes : [summary]
    });

    const sediment = capsSediment.checkAndSediment(memoryInfluence);
    res.json({
      success: true,
      message: isPositive
        ? '感谢反馈，会继续保持这种风格'
        : (fix ? '已记录你的修正，下次对话会参考' : '已记录，会调整回应风格'),
      style_hints: hints,
      caps_calibration: !!tags.length,
      sediment_new: sediment.sedimented?.length || 0,
      twin_version: log?.version || personaChangelog.data.version,
      changes,
      deviation_applied: devTags,
      layer_updates: layerUpdates
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  训练接口
// ══════════════════════════════════════════════════════════════════

// 语音训练
app.post('/training/voice', (req, res) => {
  try {
    const { audio, transcript, session_id, audio_features } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: '缺少朗读文本' });
    }

    const result = trainingSystem.processVoiceTraining(
      audio || 'web_placeholder', transcript, session_id, audio_features || {}
    );
    if (req.body.skipped && req.body.task_id) {
      return respondGuideSkip(res, 'voice', req.body.task_id, req.body.skip_reason);
    }
    if (req.body.task_id) trainingGuide.markComplete(req.body.task_id, { module: 'voice' });
    res.json({ success: true, data: attachGuideAdvance(result, 'voice') });
  } catch (error) {
    console.error('[training/voice] Error:', error);
    res.status(500).json({ error: '语音训练处理失败: ' + error.message });
  }
});

const { resolveGuideSkip } = require('./lib/guide-skip-meta');

function findGuideTaskRaw(taskId) {
  if (!taskId) return null;
  const curriculum = trainingGuide.loadCurriculum(activePersonaId());
  return curriculum ? trainingGuide._findRawTask(curriculum, taskId) : null;
}

function taskIdFromGuidePayload(payload) {
  if (!payload) return null;
  return payload.task_id || null;
}

function respondGuideSkip(res, module, taskId, skipReason) {
  const personaId = activePersonaId();
  trainingGuide.ensureStarted(personaId);
  const skippedRaw = findGuideTaskRaw(taskId);
  if (taskId) {
    const isRot = String(taskId).startsWith('rot_');
    trainingGuide.markComplete(taskId, { module, skipped: true, skip_reason: 'no_impression', rotation: isRot });
  }
  const advance = guideAdvancePayload(module);
  const nextId = taskIdFromGuidePayload(advance.home) || taskIdFromGuidePayload(advance.module_guide);
  const nextRaw = findGuideTaskRaw(nextId);
  const meta = resolveGuideSkip(skippedRaw, nextRaw, skipReason);
  return res.json({
    success: true,
    message: meta.message,
    data: attachGuideAdvance({
      feedback: meta.feedback,
      skipped: true,
      skip_reason: meta.skip_reason,
      skipped_scene: meta.skipped_scene,
      next_scene: meta.next_scene
    }, module)
  });
}

// 记忆训练（支持六层记忆架构）
app.post('/training/memory', (req, res) => {
  try {
    if (req.body.skipped) {
      return respondGuideSkip(res, 'memory', req.body.task_id, req.body.skip_reason);
    }

    const { content, tags, photos, emotion, session_id, tier, time, place, people, related_person_id } = req.body;

    if (tier === 'wish' || tier === 'emotional') {
      const gate = checkDeepGate(tier === 'wish' ? 'wish' : 'emotion');
      if (gate.blocked) return res.status(gate.status).json({ error: gate.error, gate: gate.gate });
    }
    
    if (req.body.impression_only) {
      const fragment = (content || '').trim() || '有印象但说不清';
      const note = `[有印象] ${fragment}`;
      personalMemory.add({ tier: 'daily', content: note, tags: ['impression'], source: 'memory_vague' });
      if (req.body.task_id) trainingGuide.markComplete(req.body.task_id, { module: 'memory', vague: true });
      return res.json({
        success: true,
        data: attachGuideAdvance({ feedback: '已记下模糊印象', personal_memory: { content: note } }, 'memory')
      });
    }

    if (!content) {
      return res.status(400).json({ error: '缺少记忆内容' });
    }

    trainingSessionManager.addMinutes(2);
    const pm = personalMemory.add({
      tier: tier || 'core',
      content,
      tags,
      photos,
      emotion,
      time,
      place,
      people,
      related_person_id
    });

    const result = trainingSystem.processMemoryTraining(content, tags, photos, emotion, session_id);
    result.personal_memory = pm;

    const rawTask = findGuideTaskRaw(req.body.task_id);
    result.ingest = trainingIngestor.ingestMemory({
      task: rawTask ? { ...rawTask, task_id: req.body.task_id } : { task_id: req.body.task_id },
      content,
      tier: tier || 'core',
      tags
    });

    memorySystem.addEvent('user_memory', content, 0.7, { emotion });
    indexToRAG(pm.id, content, { type: 'memory', tier: pm.tier, tags });
    const saveOnly = !!req.body.save_only;
    if (req.body.task_id && !saveOnly) {
      trainingGuide.markComplete(req.body.task_id, { module: 'memory' });
    }
    
    res.json({
      success: true,
      data: saveOnly
        ? { feedback: '已记下', personal_memory: pm, save_only: true }
        : attachGuideAdvance(result, 'memory')
    });
  } catch (error) {
    console.error('[training/memory] Error:', error);
    res.status(500).json({ error: '记忆训练处理失败: ' + error.message });
  }
});

// 关系训练
app.post('/training/relationship', (req, res) => {
  try {
    if (req.body.skipped) {
      return respondGuideSkip(res, 'relationship', req.body.task_id, req.body.skip_reason);
    }

    const { scenario, response_type, response_text, scene, session_id } = req.body;
    
    if (!scenario || !response_type) {
      return res.status(400).json({ error: '缺少场景或回应类型' });
    }

    const result = trainingSystem.processRelationshipTraining(scenario, response_type, response_text, scene, session_id);
    const rawTask = findGuideTaskRaw(req.body.task_id);
    result.ingest = trainingIngestor.ingestRelationship({
      task: rawTask ? { ...rawTask, task_id: req.body.task_id } : { task_id: req.body.task_id },
      scene: scene || scenario,
      responseText: response_text,
      responseType: response_type
    });
    const ragText = `[关系训练] ${scenario}/${scene || ''} → ${response_text || response_type}`;
    indexToRAG(`rel_train_${Date.now()}`, ragText, { type: 'relationship', response_type });
    if (req.body.task_id) trainingGuide.markComplete(req.body.task_id, { module: 'relationship' });
    res.json({
      success: true,
      data: attachGuideAdvance(result, 'relationship')
    });
  } catch (error) {
    console.error('[training/relationship] Error:', error);
    res.status(500).json({ error: '关系训练处理失败: ' + error.message });
  }
});

// 情感训练
app.post('/training/emotion', (req, res) => {
  try {
    if (req.body.skipped) {
      return respondGuideSkip(res, 'emotion', req.body.task_id, req.body.skip_reason);
    }

    const gate = checkDeepGate('emotion');
    if (gate.blocked) return res.status(gate.status).json({ error: gate.error, gate: gate.gate });

    const { scenario, response, stress_reaction, comfort_style, session_id } = req.body;
    
    if (!scenario || !response) {
      return res.status(400).json({ error: '缺少场景或回应' });
    }

    trainingSessionManager.addMinutes(3);
    const result = trainingSystem.processEmotionTraining(scenario, response, stress_reaction, comfort_style, session_id);
    const rawTask = findGuideTaskRaw(req.body.task_id);
    result.ingest = trainingIngestor.ingestEmotion({
      task: rawTask ? { ...rawTask, task_id: req.body.task_id } : { task_id: req.body.task_id },
      scenario,
      response,
      stressReaction: stress_reaction,
      comfortStyle: comfort_style
    });
    indexToRAG(`emo_train_${Date.now()}`, `[情感训练] ${scenario} → ${response}`, { type: 'emotion' });
    if (req.body.task_id) trainingGuide.markComplete(req.body.task_id, { module: 'emotion' });
    const payload = attachGuideAdvance(result, 'emotion');
    res.json({
      success: true,
      data: payload,
      rest_hint: trainingSessionManager.shouldShowRestAfter('emotion') ? REST_MESSAGE : null
    });
  } catch (error) {
    console.error('[training/emotion] Error:', error);
    res.status(500).json({ error: '情感训练处理失败: ' + error.message });
  }
});

// 认知训练
app.post('/training/cognition', (req, res) => {
  try {
    if (req.body.skipped) {
      return respondGuideSkip(res, 'cognition', req.body.task_id, req.body.skip_reason);
    }

    const gate = checkDeepGate('cognition_conflict');
    if (gate.blocked) return res.status(gate.status).json({ error: gate.error, gate: gate.gate });

    const { values_ranking, conflict_choices, session_id } = req.body;
    
    if (!values_ranking) {
      return res.status(400).json({ error: '缺少价值观排序' });
    }

    const result = trainingSystem.processCognitionTraining(values_ranking, conflict_choices, session_id);
    const rawTask = findGuideTaskRaw(req.body.task_id);
    const lastChoice = conflict_choices?.length
      ? (conflict_choices[conflict_choices.length - 1].choice || conflict_choices[conflict_choices.length - 1])
      : null;
    result.ingest = trainingIngestor.ingestCognition({
      task: rawTask ? { ...rawTask, task_id: req.body.task_id } : { task_id: req.body.task_id },
      choice: lastChoice,
      valuesRanking: values_ranking,
      conflictChoices: conflict_choices
    });
    indexToRAG(`cog_train_${Date.now()}`, `[认知训练] 价值观：${(values_ranking || []).join(' > ')}`, { type: 'cognition' });
    if (req.body.task_id) trainingGuide.markComplete(req.body.task_id, { module: 'cognition' });
    res.json({
      success: true,
      data: attachGuideAdvance(result, 'cognition')
    });
  } catch (error) {
    console.error('[training/cognition] Error:', error);
    res.status(500).json({ error: '认知训练处理失败: ' + error.message });
  }
});

// 获取训练进度
function buildProgressDeps() {
  memoryInfluence.reload();
  const memStats = personalMemory.getStats();
  const relStats = relationshipStore.getStats();
  const fb = feedbackLearning.getCounts();
  return {
    corePersona,
    personaProfile,
    personalMemoryTotal: memStats.total,
    personalMemoryQuality: memStats.detail_quality_ratio,
    sedimentCount: memoryInfluence.listSediments().length,
    eventCount: memorySystem.events.length,
    peopleCount: relStats.people_count,
    scenariosCompleted: relStats.scenarios_completed,
    positiveFeedbackCount: fb.positive,
    passed_blind_milestones: blindTestManager.getPassedMilestones(),
    core_memories: memStats.core_memories,
    relationship_people: relStats.people_count
  };
}

app.get('/training/progress', (req, res) => {
  try {
    const deps = buildProgressDeps();
    const progress = trainingSystem.getProgress(deps, deps);
    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('[training/progress] Error:', error);
    res.status(500).json({ error: '获取训练进度失败: ' + error.message });
  }
});

app.get('/training/dashboard', (req, res) => {
  try {
    const deps = buildProgressDeps();
    const progress = trainingSystem.getProgress(deps, deps);
    const setup = trainingSetup.get();
    const personaId = activePersonaId(req);
    let guideOverview = null;
    try {
      guideOverview = trainingGuide.getOverview(personaId);
    } catch {}
    const changelog = personaChangelog.getRecent(5);
    const data = buildTrainingDashboard({
      progress,
      setup: { ...setup, setup_complete: trainingSetup.isComplete() },
      changelog,
      feedbackCounts: feedbackLearning.getCounts(),
      relationshipCount: relationshipStore.list().length,
      authorizedUsers: authorizationStore.listUsers(),
      guideOverview
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/training/changelog', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30);
  res.json({ success: true, data: personaChangelog.getRecent(limit) });
});

// 分层记忆列表
app.get('/training/memories', (req, res) => {
  try {
    const { tier, limit, offset } = req.query;
    res.json({ success: true, data: personalMemory.list({ tier, limit: parseInt(limit) || 50, offset: parseInt(offset) || 0 }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 每日记忆引导问题
app.get('/training/memory/prompt', (req, res) => {
  const personaId = activePersonaId(req);
  const task = trainingGuide.getModuleTask(personaId, 'memory');
  const prompt = task.prompt || personalMemory.getDailyPrompt();
  res.json({
    success: true,
    data: {
      prompt,
      hint: task.hint,
      tier: task.tier,
      task_id: task.task_id,
      day: task.day,
      day_title: task.day_title,
      suggested_tags: task.suggested_tags,
      tiers: MEMORY_TIERS
    }
  });
});

// ══════════════════════════════════════════════════════════════════
//  训练身份设定（先于引导出题）
// ══════════════════════════════════════════════════════════════════

function syncSetupToRelationships(setup) {
  for (const p of setup.key_people || []) {
    if (!p.name?.trim()) continue;
    try {
      relationshipStore.upsert({
        id: p.id,
        name: p.name.trim(),
        type: p.type || 'friend',
        notes: p.notes || ''
      });
    } catch (e) {
      console.warn('[setup] relationship sync:', e.message);
    }
  }
}

app.get('/training/setup', (req, res) => {
  const data = trainingSetup.get();
  res.json({
    success: true,
    data: {
      ...data,
      setup_complete: trainingSetup.isComplete()
    }
  });
});

app.post('/training/setup', (req, res) => {
  try {
    const body = req.body || {};
    const keyPeople = (body.key_people || []).map((p, i) => ({
      id: p.id || `kp_${Date.now()}_${i}`,
      name: String(p.name || '').trim(),
      type: p.type || 'friend',
      notes: p.notes || ''
    })).filter(p => p.name);

    const isSelf = body.mode === 'self' || body.trainer_role === 'self';
    const displayName = String(body.subject_name || body.trainer_name || '').trim();
    const saved = trainingSetup.save({
      mode: body.mode === 'demo' ? 'demo' : (isSelf ? 'self' : 'personal'),
      subject_name: isSelf ? displayName : body.subject_name,
      subject_gender: body.subject_gender,
      avatar_preset: body.avatar_preset,
      subject_brief: body.subject_brief,
      trainer_name: isSelf ? displayName : body.trainer_name,
      trainer_role: isSelf ? 'self' : body.trainer_role,
      key_people: keyPeople,
      setup_complete: !!body.setup_complete
    });

    if (trainingSetup.isComplete()) {
      syncSetupToRelationships(saved);
    }

    res.json({
      success: true,
      data: { ...saved, setup_complete: trainingSetup.isComplete() }
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/training/setup/demo', (req, res) => {
  const saved = trainingSetup.enableDemo();
  res.json({ success: true, data: { ...saved, setup_complete: true } });
});

app.post('/training/setup/reset', (req, res) => {
  const saved = trainingSetup.reset();
  res.json({ success: true, data: saved });
});

// ══════════════════════════════════════════════════════════════════
//  7 日训练引导
// ══════════════════════════════════════════════════════════════════

app.get('/training/guide', (req, res) => {
  try {
    const personaId = activePersonaId(req);
    res.json({ success: true, data: trainingGuide.getOverview(personaId) });
  } catch (error) {
    console.error('[training/guide] Error:', error);
    res.json({
      success: true,
      data: trainingGuide._overviewFallback(activePersonaId(req), error.message)
    });
  }
});

app.get('/training/guide/:module', (req, res) => {
  const personaId = activePersonaId(req);
  const module = req.params.module;
  const allowed = ['voice', 'memory', 'relationship', 'emotion', 'cognition'];
  if (!allowed.includes(module)) {
    return res.status(400).json({ error: '无效模块' });
  }
  const opts = {};
  if (module === 'relationship') opts.relationship_category = req.query.category;
  res.json({ success: true, data: trainingGuide.getModuleTask(personaId, module, opts) });
});

app.post('/training/guide/complete', (req, res) => {
  const { task_id, module, meta } = req.body;
  if (!task_id) return res.status(400).json({ error: '缺少 task_id' });
  trainingGuide.markComplete(task_id, { module, ...meta });
  res.json({ success: true, data: trainingGuide.getOverview(activePersonaId(req)) });
});

// ══════════════════════════════════════════════════════════════════
//  主页训练（与专项页共享 task_id / guide 状态）
// ══════════════════════════════════════════════════════════════════

app.get('/training/home', (req, res) => {
  const personaId = activePersonaId(req);
  res.json({ success: true, data: homeTrainingCoach.getHomeState(personaId) });
});

app.post('/training/home/submit', async (req, res) => {
  try {
    if (!trainingSetup.isComplete()) {
      return res.status(403).json({ error: '请先完成训练身份设定', reason: 'setup_required' });
    }
    const { module, content, task_id, response_type, choice_index, skipped } = req.body;
    if (!module || !task_id) return res.status(400).json({ error: '缺少 module 或 task_id' });

    if (skipped) {
      const personaId = activePersonaId(req);
      trainingGuide.ensureStarted(personaId);
      const skippedRaw = findGuideTaskRaw(task_id);
      const isRot = String(task_id).startsWith('rot_');
      trainingGuide.markComplete(task_id, { module, skipped: true, skip_reason: 'no_impression', rotation: isRot });
      const advance = guideAdvancePayload(module);
      const nextId = taskIdFromGuidePayload(advance.home) || taskIdFromGuidePayload(advance.module_guide);
      const meta = resolveGuideSkip(skippedRaw, findGuideTaskRaw(nextId), req.body.skip_reason);
      return res.json({
        success: true,
        message: meta.message,
        data: {
          ...advance,
          feedback: meta.feedback,
          skipped_scene: meta.skipped_scene,
          next_scene: meta.next_scene
        }
      });
    }

    const personaId = activePersonaId(req);
    const task = trainingGuide.getModuleTask(personaId, module);
    if (task.task_id !== task_id) {
      return res.status(409).json({ error: '题目已更新，请刷新主页', current_task_id: task.task_id });
    }

    let result;
    switch (module) {
      case 'memory': {
        if (!content?.trim()) return res.status(400).json({ error: '请填写记忆内容' });
        const pm = personalMemory.add({
          content: content.trim(),
          tags: task.suggested_tags || [],
          tier: task.tier || 'core',
          source: 'home_training'
        });
        trainingSystem.processMemoryTraining(content.trim(), task.suggested_tags || []);
        const memIngest = trainingIngestor.ingestMemory({
          task: { ...task, task_id },
          content: content.trim(),
          tier: task.tier || 'core',
          tags: task.suggested_tags || []
        });
        await indexToRAG(pm.id, pm.content, { type: 'memory', tier: pm.tier, source: 'home' });
        trainingGuide.markComplete(task_id, { module: 'memory' });
        result = { feedback: '记忆已保存，主页与专项页进度已同步', memory_id: pm.id, ingest: memIngest };
        break;
      }
      case 'relationship': {
        if (!content?.trim()) return res.status(400).json({ error: '请写下回应' });
        const relType = response_type || task.choices?.[choice_index]?.type || 'emotional';
        trainingSystem.processRelationshipTraining(
          task.scene || '关系场景', relType, content.trim(), task.category || 'daily'
        );
        const relIngest = trainingIngestor.ingestRelationship({
          task: { ...task, task_id },
          scene: task.scene || '关系场景',
          responseText: content.trim(),
          responseType: relType
        });
        trainingGuide.markComplete(task_id, { module: 'relationship' });
        result = { feedback: '关系回应已记录', ingest: relIngest };
        break;
      }
      case 'emotion': {
        if (!content?.trim()) return res.status(400).json({ error: '请写下情绪回应' });
        trainingSystem.processEmotionTraining(
          task.scenario || '情绪场景', content.trim(),
          task.stress_reaction, task.comfort_style
        );
        const emoIngest = trainingIngestor.ingestEmotion({
          task: { ...task, task_id },
          scenario: task.scenario || '情绪场景',
          response: content.trim(),
          stressReaction: task.stress_reaction,
          comfortStyle: task.comfort_style
        });
        trainingGuide.markComplete(task_id, { module: 'emotion' });
        result = { feedback: '情感回应已记录', ingest: emoIngest };
        break;
      }
      case 'cognition': {
        const choice = content || task.options?.[choice_index];
        if (!choice) return res.status(400).json({ error: '请选择一项' });
        const conflictChoices = [{ choice, ts: Date.now() }];
        trainingSystem.processCognitionTraining([], conflictChoices);
        const cogIngest = trainingIngestor.ingestCognition({
          task: { ...task, task_id, question: task.question },
          choice,
          valuesRanking: [],
          conflictChoices
        });
        trainingGuide.markComplete(task_id, { module: 'cognition' });
        result = {
          feedback: '认知选择已记录并写入核心层；完整价值观排序请到专项页',
          ingest: cogIngest
        };
        break;
      }
      case 'voice':
        if (req.body.skipped) {
          trainingGuide.markComplete(task_id, { module: 'voice', skipped: true });
          return res.json({
            success: true,
            message: '已跳过本题，进入下一题',
            data: guideAdvancePayload('voice')
          });
        }
        return res.status(400).json({
          error: '音色请在专项页录音提交，或使用 /training/voice',
          redirect_module_page: 2
        });
      default:
        return res.status(400).json({ error: '未知模块' });
    }

    res.json({
      success: true,
      data: attachGuideAdvance(result, module)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/training/home/ingest-chat', (req, res) => {
  try {
    const { user_text, assistant_text, save_as = 'note' } = req.body;
    if (!user_text?.trim()) return res.status(400).json({ error: '缺少内容' });

    const capturesPath = path.join(DATA_DIR, 'chat_training_captures.json');
    let captures = [];
    try {
      if (fs.existsSync(capturesPath)) captures = JSON.parse(fs.readFileSync(capturesPath, 'utf8'));
    } catch {}

    const entry = {
      ts: Date.now(),
      user: user_text.slice(0, 500),
      assistant: assistant_text?.slice(0, 500) || '',
      saved_content: user_text.trim(),
      save_as
    };
    captures.push(entry);
    if (captures.length > 200) captures = captures.slice(-200);
    fs.writeFileSync(capturesPath, JSON.stringify(captures, null, 2));

    if (save_as === 'memory' && user_text.trim().length >= 20) {
      personalMemory.add({
        tier: 'daily',
        content: user_text.trim(),
        source: 'home_chat'
      });
      trainingSystem.processMemoryTraining(user_text.trim(), ['聊天']);
    } else {
      personalMemory.add({ tier: 'daily', content: user_text.trim(), source: 'home_chat_note' });
    }

    res.json({ success: true, message: save_as === 'memory' ? '已存入记忆层' : '已记入训练随手记' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 关系人建档
app.get('/training/relationships', (req, res) => {
  res.json({ success: true, data: relationshipStore.list() });
});

app.post('/training/relationships', (req, res) => {
  try {
    const person = relationshipStore.upsert(req.body);
    res.json({ success: true, data: person });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/training/relationships/:id', (req, res) => {
  relationshipStore.remove(req.params.id);
  res.json({ success: true });
});

// 场景训练库
app.get('/training/scenarios', (req, res) => {
  const { category } = req.query;
  res.json({ success: true, data: relationshipStore.getScenarioLibrary(category) });
});

app.post('/training/scenarios/complete', (req, res) => {
  try {
    const { person_id, category, scenario, response } = req.body;
    const entry = relationshipStore.completeScenario(person_id, category, scenario, response);
    trainingSystem.processRelationshipTraining(scenario, 'emotional', response, category);
    res.json({ success: true, data: entry });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 认知场景库：个人训练来自 题库.txt，演示/无课表时回退 design-spec
app.get('/training/cognition/scenarios', (req, res) => {
  const personaId = activePersonaId(req);
  try {
    const bank = trainingGuide.listModuleBankTasks(personaId, 'cognition');
    if (bank.length >= 20) {
      return res.json({ success: true, data: bank, source: 'question-bank' });
    }
  } catch (e) {
    console.warn('[cognition/scenarios]', e.message);
  }
  res.json({ success: true, data: CONFLICT_SCENARIOS, source: 'design-spec-fallback' });
});

// 各模块题库列表（与 7 日引导同源，仅展示/自选，进度仍以 guide 为准）
app.get('/training/guide-bank/:module', (req, res) => {
  const module = req.params.module;
  const allowed = ['voice', 'memory', 'relationship', 'emotion', 'cognition'];
  if (!allowed.includes(module)) {
    return res.status(400).json({ error: '无效模块' });
  }
  try {
    const personaId = activePersonaId(req);
    const data = trainingGuide.listModuleBankTasks(personaId, module);
    res.json({
      success: true,
      data,
      source: data.length ? 'question-bank' : 'empty',
      count: data.length
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 盲测
app.get('/training/blind-tests', (req, res) => {
  res.json({ success: true, data: blindTestManager.list() });
});

app.post('/training/blind-tests/start', (req, res) => {
  try {
    const session = blindTestManager.start(req.body.milestone, req.body.tester_name);
    res.json({ success: true, data: session });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/training/blind-tests/submit', (req, res) => {
  try {
    const session = blindTestManager.submit(req.body.session_id, req.body.score, req.body.notes);
    res.json({ success: true, data: session });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 对话归档（陪护端 → 训练素材）
app.get('/training/archives', (req, res) => {
  res.json({ success: true, data: dialogArchive.listPending() });
});

app.post('/training/archives/:id/confirm', (req, res) => {
  try {
    const item = dialogArchive.confirm(req.params.id, req.body.action || 'confirm');
    if (item.status === 'confirmed') {
      if (item.archive_type === 'memory') {
        personalMemory.add({ tier: 'shared', content: item.message, source: 'companion_archive' });
        trainingSystem.processMemoryTraining(item.message, ['陪护归档'], [], null);
      } else if (item.archive_type === 'relationship') {
        trainingSystem.processRelationshipTraining('陪护对话归档', 'emotional', item.message, 'companion');
      } else {
        trainingSystem.processEmotionTraining('陪护对话归档', item.message);
      }
    }
    res.json({ success: true, data: item });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  核心层接口（五层人格架构）
// ══════════════════════════════════════════════════════════════════

// 获取核心层完整状态
app.get('/persona/core', (req, res) => {
  try {
    res.json({ success: true, data: corePersona.getState() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 以下固定路径须在 /persona/core/:dimension 之前注册，否则会被当成维度名
app.get('/persona/core/card-pairs', (req, res) => {
  try {
    const pairs = CorePersonaLayer.generateValueCardPairs();
    res.json({ success: true, data: { pairs, total: pairs.length } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/persona/core/card-game', (req, res) => {
  try {
    const { card_a, card_b, chosen, reaction_time } = req.body;
    if (!card_a || !card_b || !chosen) {
      return res.status(400).json({ error: '缺少卡片数据' });
    }
    const response = corePersona.processValueCardChoice(card_a, card_b, chosen, reaction_time || 0);
    res.json({ success: true, data: response });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/persona/core/complete-card-game', (req, res) => {
  try {
    const result = corePersona.completeCardGame();
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/persona/core/summary', (req, res) => {
  try {
    const summary = corePersona.generateSummary();
    res.json({ success: true, data: { summary } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取核心层特定维度
app.get('/persona/core/:dimension', (req, res) => {
  try {
    const dimension = corePersona.getDimension(req.params.dimension);
    if (!dimension) return res.status(404).json({ error: '无效维度' });
    res.json({ success: true, data: dimension });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 更新核心层特定维度
app.put('/persona/core/:dimension', (req, res) => {
  try {
    const { updates, source } = req.body;
    if (!updates) return res.status(400).json({ error: '缺少updates' });
    const dimension = corePersona.updateDimension(req.params.dimension, updates, source || 'manual');
    res.json({ success: true, data: dimension });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 提交校准反馈
app.post('/persona/core/calibrate', (req, res) => {
  try {
    const feedback = req.body;
    const result = corePersona.recordCalibration(feedback);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// CAPS 动力系统：单次情境加工（调试 / 可视化）
app.post('/persona/caps/process', (req, res) => {
  try {
    const context = req.body || {};
    const result = corePersona.processCAPS(context);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/persona/caps', (req, res) => {
  try {
    res.json({ success: true, data: corePersona.getCapsState() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/persona/caps/signature', (req, res) => {
  try {
    const sig = CAPSEngine.buildSignaturePayload(req.body);
    corePersona.addBehaviorSignature(sig);
    res.json({ success: true, data: sig });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/persona/memory/sediments', (req, res) => {
  try {
    memoryInfluence.reload();
    res.json({ success: true, data: memoryInfluence.listSediments() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/persona/memory/sediment', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.pattern && !body.content) {
      return res.status(400).json({ error: '缺少 pattern 或 content' });
    }
    const sed = memoryInfluence.addSediment({
      pattern: body.pattern || body.content,
      tags: body.tags || [],
      core_dimension: body.core_dimension,
      emotion_residue: body.emotion_residue,
      outcome: body.outcome,
      cau_path: body.cau_path,
      confidence: body.confidence,
      origin_ids: body.origin_ids || []
    });
    if (body.promote_signature && body.tags?.length) {
      corePersona.addBehaviorSignature(
        CAPSEngine.buildSignaturePayload({
          if_tags: body.tags,
          behavior: body.behavior || body.pattern,
          output_hint: body.output_hint,
          cau_path: body.cau_path,
          label: body.label || '手动沉淀',
          confidence: body.confidence
        })
      );
    }
    res.json({ success: true, data: sed });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 从对话中提取核心层特征
app.post('/persona/core/extract', (req, res) => {
  try {
    const { user_text, assistant_reply, context } = req.body;
    if (!user_text) return res.status(400).json({ error: '缺少user_text' });
    const extractions = corePersona.extractFromConversation(user_text, assistant_reply, context);
    res.json({ success: true, data: { extractions } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  伦理与安全
// ══════════════════════════════════════════════════════════════════

app.get('/ethics/consent-text', (req, res) => {
  res.json({ success: true, data: authorizationStore.getConsentText() });
});

app.get('/companion/access', (req, res) => {
  const access = authorizationStore.checkAccess(req.query.user_id);
  const grief = griefModeManager.getCurrentPhase();
  res.json({
    success: true,
    data: {
      ...access,
      grief_phase: grief,
      sealed: griefModeManager.getConfig().sealed
    }
  });
});

app.post('/companion/identify', (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: '请输入您的姓名' });
    const users = authorizationStore.listUsers().filter(u => u.authorized);
    const match = users.find(u => u.name === name) || users.find(u => u.name.includes(name));
    if (!match) {
      return res.status(403).json({
        error: '未找到授权记录，请联系训练者为您开通陪护权限',
        authorized_users_hint: users.map(u => u.name)
      });
    }
    res.json({ success: true, data: { user_id: match.id, name: match.name, relationship: match.relationship } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/companion/consent', (req, res) => {
  try {
    const { user_id, user_name, accepted } = req.body;
    if (!accepted) return res.status(400).json({ error: '需同意知情条款方可使用' });
    const access = authorizationStore.checkAccess(user_id);
    if (!access.allowed && access.reason === 'not_authorized') {
      return res.status(403).json({ error: access.message });
    }
    const rec = authorizationStore.recordConsent(user_id, user_name);
    res.json({ success: true, data: rec });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/ethics/authorization', (req, res) => {
  res.json({ success: true, data: authorizationStore.listUsers() });
});

app.post('/ethics/authorization', (req, res) => {
  try {
    if (req.body.trainee_display_name || req.body.avatar_label) {
      authorizationStore.updateProfile(req.body);
    }
    const user = req.body.name
      ? authorizationStore.upsertUser(req.body)
      : null;
    res.json({ success: true, data: user || authorizationStore.listUsers() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/ethics/authorization/:id', (req, res) => {
  try {
    const user = authorizationStore.revokeUser(req.params.id);
    res.json({ success: true, data: user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/ethics/grief-mode', (req, res) => {
  res.json({
    success: true,
    data: {
      config: griefModeManager.getConfig(),
      current_phase: griefModeManager.getCurrentPhase(),
      initiative_mult: griefModeManager.getInitiativeMultiplier()
    }
  });
});

app.post('/ethics/grief-mode', (req, res) => {
  res.json({ success: true, data: griefModeManager.updateConfig(req.body) });
});

app.post('/ethics/grief-mode/seal', (req, res) => {
  res.json({ success: true, data: griefModeManager.seal() });
});

app.post('/ethics/grief-mode/unseal', (req, res) => {
  res.json({ success: true, data: griefModeManager.unseal() });
});

app.get('/ethics/dependency-status', (req, res) => {
  res.json({ success: true, data: dependencyMonitor.getStatus(req.query.user_id) });
});

app.post('/ethics/dependency/dismiss', (req, res) => {
  const alert = dependencyMonitor.dismissAlert(req.body.alert_id);
  res.json({ success: true, data: alert });
});

app.get('/training/session-status', (req, res) => {
  res.json({ success: true, data: trainingSessionManager.getStatus() });
});

app.post('/training/lightweight-note', (req, res) => {
  try {
    const note = trainingSessionManager.addLightweightNote(req.body.content);
    if (req.body.index_memory !== false) {
      personalMemory.add({ tier: 'daily', content: note.content, source: 'lightweight' });
      trainingSystem.processMemoryTraining(note.content, ['随手记'], [], null);
    }
    res.json({ success: true, data: note });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/training/stop-for-today', (req, res) => {
  res.json({ success: true, data: trainingSessionManager.stopForToday() });
});

app.post('/training/resume-today', (req, res) => {
  res.json({ success: true, data: trainingSessionManager.resumeToday() });
});

app.post('/training/deep-unlock', (req, res) => {
  try {
    if (req.body.ready !== true) {
      return res.status(400).json({ error: '请确认您已准备好再继续' });
    }
    const data = trainingSessionManager.unlockDeepModule(req.body.module);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  陪护接口
// ══════════════════════════════════════════════════════════════════

// 陪护对话
app.post('/companion/chat', async (req, res) => {
  try {
    const { messages, companion_mode = 'normal', companion_user_id } = req.body;

    const access = authorizationStore.checkAccess(companion_user_id);
    if (!access.allowed) {
      return res.status(403).json({ error: access.message, reason: access.reason });
    }

    if (griefModeManager.getConfig().sealed) {
      return res.status(403).json({
        error: '数字分身已封存，仅可查看历史。如需重新开放请联系训练者。',
        sealed: true
      });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '消息格式错误' });
    }

    const userMessage = messages[messages.length - 1];
    if (userMessage.role !== 'user' || !userMessage.content) {
      return res.status(400).json({ error: '缺少用户消息' });
    }

    const griefPhase = griefModeManager.getCurrentPhase();
    if (griefPhase.passive_only) {
      return res.status(200).json({
        reply: '这段时间我想少说一些，但如果你需要，我仍然在这里听你说。',
        passive_mode: true,
        grief_phase: griefPhase.label
      });
    }

    dependencyMonitor.recordMessage(companion_user_id, userMessage.content, 'user');
    proactivityEngine.recordCareTopic(userMessage.content);

    const style = emotionalVariance.getReplyStyle();
    
    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ status: 'thinking', token: '' })}\n\n`);

      if (style.delay_ms > 0) await sleep(Math.min(style.delay_ms, 3000));
      const { bestBehavior } = runCognitivePipeline(userMessage.content);
      indexToRAG(`conv_${Date.now()}`, userMessage.content, { type: 'conversation' });
      const systemPrompt = await buildFullPrompt(userMessage.content, {
        companionMode: companion_mode,
        emotionalStyle: style,
        avatarLabel: access.avatar_label,
        traineeName: access.trainee_name,
        bestBehavior
      });
      const capsSnapshot = lastChatCaps?.snapshot || null;
      const ollamaMessages = [{ role: 'system', content: systemPrompt }, ...messages];

      try {
        const response = await callOllama(ollamaMessages, true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullReply = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(l => l.trim());
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.message?.content) {
                fullReply += data.message.content;
                res.write(`data: ${JSON.stringify({ token: data.message.content })}\n\n`);
              }
            } catch {}
          }
        }
        dependencyMonitor.recordMessage(companion_user_id, fullReply, 'assistant');
        memorySystem.addEvent('assistant_reply', fullReply, 0.3);
        companionSystem.recordInteraction();
        
        const safety = dependencyMonitor.getStatus(companion_user_id);
        res.write(`data: ${JSON.stringify({
          done: true,
          pad_state: currentPAD,
          strategy: currentStrategy,
          caps: capsSnapshot,
          layer_explanation: capsSnapshot?.layer_explanation || null,
          safety_alert: safety.pending_alert,
          reply: fullReply
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        const fallback = fallbackReply(userMessage.content, bestBehavior);
        dependencyMonitor.recordMessage(companion_user_id, fallback, 'assistant');
        memorySystem.addEvent('assistant_reply', fallback, 0.3);
        res.write(`data: ${JSON.stringify({ token: fallback })}\n\n`);
        const fbSnap = lastChatCaps?.snapshot || null;
        res.write(`data: ${JSON.stringify({
          done: true,
          pad_state: currentPAD,
          caps: fbSnap,
          layer_explanation: fbSnap?.layer_explanation || null,
          reply: fallback
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    }

    if (style.delay_ms > 0) await sleep(Math.min(style.delay_ms, 3000));

    const reply = await generateReply(userMessage.content, messages, {
      companionMode: companion_mode,
      emotionalStyle: style,
      avatarLabel: access.avatar_label,
      traineeName: access.trainee_name
    });

    dependencyMonitor.recordMessage(companion_user_id, reply, 'assistant');
    memorySystem.addEvent('assistant_reply', reply, 0.3);
    companionSystem.recordInteraction();

    const safety = dependencyMonitor.getStatus(companion_user_id);

    const snap = lastChatCaps?.snapshot || null;
    res.json({
      reply,
      pad_state: currentPAD,
      companion_state: companionSystem.getState(),
      suggestions: companionSystem.getSuggestions(companion_mode),
      emotional_state: padManager.describeEmotion(currentPAD),
      energy_level: style.energy,
      grief_phase: griefPhase.label,
      safety_alert: safety.pending_alert,
      avatar_label: access.avatar_label,
      is_digital_avatar: true,
      caps: snap,
      layer_explanation: snap?.layer_explanation || null
    });
  } catch (error) {
    console.error('[companion/chat] Error:', error);
    res.status(500).json({ error: '陪护对话处理失败: ' + error.message });
  }
});

// 获取陪护状态
app.get('/companion/status', (req, res) => {
  try {
    const status = companionSystem.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[companion/status] Error:', error);
    res.status(500).json({ error: '获取陪护状态失败: ' + error.message });
  }
});

// 更新陪护设置
app.post('/companion/settings', (req, res) => {
  try {
    const settings = req.body;
    companionSystem.updateSettings(settings);
    res.json({
      success: true,
      message: '陪护设置已更新'
    });
  } catch (error) {
    console.error('[companion/settings] Error:', error);
    res.status(500).json({ error: '更新陪护设置失败: ' + error.message });
  }
});

// 获取主动问候 / proactive 消息
app.get('/companion/greeting', (req, res) => {
  try {
    const userId = req.query.companion_user_id;
    if (userId) {
      const access = authorizationStore.checkAccess(userId);
      if (!access.allowed) {
        return res.status(403).json({ error: access.message, reason: access.reason });
      }
    }

    const settings = companionSystem.getStatus().companion_settings;
    const griefMult = griefModeManager.getInitiativeMultiplier();
    let ritualMessage = null;
    if (griefModeManager.shouldDeliverRitual()) {
      ritualMessage = griefModeManager.getConfig().completion_ritual_text;
      griefModeManager.markRitualDelivered();
    }

    const proactive = proactivityEngine.evaluate(settings, {
      griefMult,
      skipProactive: emotionalVariance.shouldSkipProactive(),
      ritualMessage
    });

    let greeting = proactive;
    if (!greeting) {
      const low = emotionalVariance.getLowEnergyGreeting();
      const base = companionSystem.getGreeting();
      greeting = low ? { ...base, text: low, type: 'low_energy' } : base;
    }

    res.json({
      success: true,
      data: greeting,
      grief_phase: griefModeManager.getCurrentPhase().label,
      is_digital_avatar: true
    });
  } catch (error) {
    console.error('[companion/greeting] Error:', error);
    res.status(500).json({ error: '获取问候失败: ' + error.message });
  }
});

// 陪护对话归档
app.post('/companion/archive', (req, res) => {
  try {
    const { message, role, archive_type, companion_user_id } = req.body;
    const item = dialogArchive.archive({ message, role, archive_type, companion_user_id });
    res.json({ success: true, data: item });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  状态接口
// ══════════════════════════════════════════════════════════════════

// PAD状态
app.get('/pad-state', (req, res) => {
  res.json({
    ...currentPAD,
    lastOnline: Date.now(),
    emotional_state: padManager.describeEmotion(currentPAD)
  });
});

// 完整内部状态
app.get('/internal-state', (req, res) => {
  res.json({
    pad_state: currentPAD,
    motivation: motivationSystem.getState(),
    strategy: currentStrategy,
    self_model: companionSystem.getSelfModel(),
    learning_state: trainingSystem.getLearningState(),
    metacognition: {
      last_reflection: Date.now(),
      value_consistency: 0.85
    }
  });
});

// 用户模型
app.get('/user-model', (req, res) => {
  res.json(memorySystem.getUserModel());
});

// 记忆数据
app.get('/memory', (req, res) => {
  const { type = 'all', limit = 20, offset = 0 } = req.query;
  res.json(memorySystem.getMemory(type, parseInt(limit), parseInt(offset)));
});

// ══════════════════════════════════════════════════════════════════
//  健康检查接口
// ══════════════════════════════════════════════════════════════════

app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: Date.now(),
    services: {},
    system: {
      node_version: process.version,
      memory_usage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      uptime: Math.round(process.uptime())
    }
  };

  // 检查Ollama
  try {
    const ollamaRes = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (ollamaRes.ok) {
      const data = await ollamaRes.json();
      health.services.ollama = {
        status: 'connected',
        url: OLLAMA_BASE,
        models: data.models?.map(m => ({ name: m.name, size: m.size })) || []
      };
    } else {
      health.services.ollama = { status: 'error', message: '无法连接' };
    }
  } catch (e) {
    health.services.ollama = { status: 'disconnected', message: e.message };
  }

  // 检查训练系统
  health.services.training = {
    status: 'ready',
    progress: trainingSystem.getProgress(buildProgressDeps(), buildProgressDeps())
  };

  // 检查陪护系统
  health.services.companion = {
    status: 'ready',
    ...companionSystem.getStatus()
  };

  // RAG
  health.services.rag = { status: 'ready', ...ragStore.getStats() };

  // TTS
  health.services.tts = await ttsService.checkStatus();

  // 备份
  health.services.backup = { status: 'ready', count: backupManager.listBackups().length };

  const allOk = health.services.ollama?.status === 'connected';
  health.status = allOk ? 'healthy' : 'degraded';

  res.json(health);
});

// ══════════════════════════════════════════════════════════════════
//  RAG / TTS / 备份 / 加密
// ══════════════════════════════════════════════════════════════════

app.get('/rag/search', async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    if (!q) return res.status(400).json({ error: '缺少 q 参数' });
    const hits = await ragStore.search(q, parseInt(limit, 10));
    res.json({ success: true, data: hits.map(h => ({ text: h.text, score: h.score, metadata: h.metadata })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/tts/status', async (req, res) => {
  res.json({ success: true, data: await ttsService.checkStatus() });
});

app.post('/tts/synthesize', async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: '缺少 text' });
    const result = await ttsService.synthesize(text, { voice });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/backup/list', (req, res) => {
  res.json({ success: true, data: backupManager.listBackups() });
});

app.post('/backup/export', async (req, res) => {
  try {
    const local = await backupManager.exportBundle();
    const download = await backupManager.exportDownload();
    res.json({
      success: true,
      data: { ...local, download_base64: download.toString('base64') }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/backup/import', async (req, res) => {
  try {
    const { data_base64 } = req.body;
    if (!data_base64) return res.status(400).json({ error: '缺少 data_base64' });
    const result = await backupManager.importBundle(Buffer.from(data_base64, 'base64'));
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/security/encrypt', (req, res) => {
  try {
    const { passphrase } = req.body;
    if (!passphrase || passphrase.length < 6) {
      return res.status(400).json({ error: '口令至少 6 位' });
    }
    const files = encryptSensitive(DATA_DIR, passphrase);
    res.json({ success: true, data: { encrypted_files: files } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Persona 审查与 LoRA 语料
// ══════════════════════════════════════════════════════════════════

app.get('/persona/list', (req, res) => {
  res.json({ success: true, data: personaBundleManager.listPersonas(), active: personaProfile.getActive()?.id });
});

const { buildTransparencyReport } = require('./lib/user-data-transparency');

function transparencyDeps() {
  const deps = buildProgressDeps();
  deps.buildProgressDeps = buildProgressDeps;
  deps.trainingSetup = trainingSetup;
  deps.trainingGuide = trainingGuide;
  deps.trainingSystem = trainingSystem;
  deps.personalMemory = personalMemory;
  deps.relationshipStore = relationshipStore;
  deps.corePersona = corePersona;
  deps.memoryInfluence = memoryInfluence;
  deps.capsSediment = capsSediment;
  deps.feedbackLearning = feedbackLearning;
  deps.ragStore = ragStore;
  deps.personaId = PERSONA_ID;
  return deps;
}

app.get('/training/review', (req, res) => {
  try {
    const report = buildTransparencyReport(transparencyDeps());
    const setup = report.identity.setup;
    res.json({
      success: true,
      data: {
        ...report,
        setup,
        setup_complete: report.identity.setup_complete,
        subject_name: report.identity.subject_name,
        trainer_name: report.identity.trainer_name,
        mode: report.identity.mode,
        guide: report.guide.overview,
        live: {
          memories: report.memories.items,
          all_memory_count: report.memories.total,
          relationships: report.relationships.people,
          progress: report.layers.progress,
          feedback_hints: report.chat_feedback.style_hints,
          sessions_count: report.training_sessions.count
        }
      }
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/persona/review/:id?', (req, res) => {
  try {
    const id = req.params.id || PERSONA_ID;
    const review = personaBundleManager.getReviewData(id);
    const memories = personalMemory.list({ limit: 200 });
    const relationships = relationshipStore.list();
    const deps = buildProgressDeps();
    deps.relationship_people = relationships.length;
    const progress = trainingSystem.getProgress(deps, deps);
    res.json({
      success: true,
      data: {
        ...review,
        live: {
          memories: memories.items.filter(m => String(m.source || '').includes('persona') || m.source === `persona:${id}`),
          all_memory_count: memories.total,
          relationships,
          progress,
          feedback_hints: feedbackLearning.getPromptHints(),
          rag_items: ragStore.items.filter(i => i.metadata?.persona === id).length
        }
      }
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/persona/ingest', async (req, res) => {
  try {
    const id = req.body.persona_id || PERSONA_ID;
    const force = !!req.body.force;
    const bundle = personaBundleManager.loadBundle(id);
    if (!force && personaBundleManager.isIngested(id, bundle.version)) {
      return res.json({ success: true, skipped: true, message: '已导入同版本 persona', persona_id: id });
    }
    const result = await personaBundleManager.ingest(id, {
      personalMemory,
      relationshipStore,
      trainingSystem,
      indexToRAG,
      personaProfile
    });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/fine-tune/export', async (req, res) => {
  try {
    const { exportCorpus } = require('./scripts/export-lora-corpus');
    const personaId = req.body.persona_id || PERSONA_ID;
    if (personaId === 'user' || personaId === 'personal') {
      const bundle = buildUserPersonaBundle({
        dataDir: DATA_DIR,
        setupStore: trainingSetup,
        personalMemory,
        relationshipStore,
        feedbackLearning,
        trainingSystem
      });
      saveUserBundleReview(DATA_DIR, bundle);
    }
    const out = await exportCorpus({
      dataDir: DATA_DIR,
      repoRoot: REPO_ROOT,
      personaId: personaId === 'personal' ? 'user' : personaId,
      setupStore: trainingSetup,
      personalMemory,
      relationshipStore,
      feedbackLearning,
      trainingSystem
    });
    res.json({ success: true, data: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/fine-tune/status', (req, res) => {
  const personaId = req.query.persona_id || PERSONA_ID;
  const corpusPath = path.join(DATA_DIR, 'finetune', `${personaId}.jsonl`);
  const adapterDir = path.join(DATA_DIR, 'finetune', 'adapters', personaId);
  const jobs = finetuneRunner.listJobs().slice(0, 5);
  const lastJob = jobs[0] || null;
  activeChatModelInfo = loadActiveChatModel(DATA_DIR);
  res.json({
    success: true,
    data: {
      persona_id: personaId,
      chat_model: CHAT_MODEL,
      active_model: activeChatModelInfo,
      corpus_exists: fs.existsSync(corpusPath),
      corpus_path: corpusPath,
      corpus_rows: fs.existsSync(corpusPath)
        ? fs.readFileSync(corpusPath, 'utf8').split('\n').filter(Boolean).length
        : 0,
      adapter_exists: fs.existsSync(adapterDir),
      adapter_dir: adapterDir,
      ollama_model_hint: process.env.PERSONA_OLLAMA_MODEL || `digital-ark-${personaId}`,
      last_job: lastJob,
      weights_personalized: !!activeChatModelInfo?.weights_personalized
    }
  });
});

app.post('/fine-tune/run', async (req, res) => {
  try {
    const personaId = req.body.persona_id || 'user';
    const job = await finetuneRunner.start(personaId);
    activeChatModelInfo = loadActiveChatModel(DATA_DIR);
    if (activeChatModelInfo?.model) CHAT_MODEL = activeChatModelInfo.model;
    res.json({ success: true, data: job });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/fine-tune/job/:id', (req, res) => {
  const job = finetuneRunner.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在' });
  res.json({ success: true, data: job });
});

// ══════════════════════════════════════════════════════════════════
//  辅助函数（legacy exports）
// ══════════════════════════════════════════════════════════════════

async function buildSystemPrompt(pad, strategy, memory, behavior, userQuery) {
  return buildFullPrompt(userQuery, { bestBehavior: behavior });
}

async function buildCompanionPrompt(pad, state, mode, behavior, userQuery, emotionalStyle, avatarLabel, traineeName) {
  return buildFullPrompt(userQuery, {
    companionMode: mode,
    emotionalStyle,
    avatarLabel,
    traineeName,
    bestBehavior: behavior
  });
}

// ══════════════════════════════════════════════════════════════════
//  启动服务器
// ══════════════════════════════════════════════════════════════════

if (require.main === module) {
  setInterval(async () => {
    try {
      if (new Date().getHours() === 3) await backupManager.exportBundle();
    } catch {}
  }, 3600000);

  app.listen(PORT, async () => {
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`  数字方舟 - 本地AI伴侣系统`);
    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`  服务地址: http://localhost:${PORT}`);
    console.log(`  数据目录: ${DATA_DIR}`);
    console.log(`  Ollama地址: ${OLLAMA_BASE}`);
    console.log(`  对话模型: ${CHAT_MODEL}`);
    console.log(`  Persona: ${PERSONA_ID}`);
    console.log(`  审查页: http://localhost:${PORT}/apps/persona-review.html`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    try {
      const bootPersona = trainingSetup.get()?.mode === 'demo' ? 'alisa-kujo' : PERSONA_ID;
      if (bootPersona === 'alisa-kujo') {
        const bundle = personaBundleManager.loadBundle('alisa-kujo');
        if (!personaBundleManager.isIngested('alisa-kujo', bundle.version)) {
          const r = await personaBundleManager.ingest('alisa-kujo', {
            personalMemory,
            relationshipStore,
            trainingSystem,
            indexToRAG,
            personaProfile
          });
          console.log(`[persona] 演示模式已导入 alisa-kujo v${bundle.version}:`, r.stats);
        } else {
          personaProfile.setActiveBundle(bundle);
          console.log(`[persona] 演示模式已加载 alisa-kujo v${bundle.version}`);
        }
      } else {
        console.log('[persona] 个人训练模式 · 完成身份设定后开始');
      }
    } catch (e) {
      console.warn('[persona] 导入跳过:', e.message);
    }
  });
}

module.exports = {
  app, padManager, memorySystem, trainingSystem, companionSystem, ragStore, backupManager,
  personalMemory, relationshipStore, blindTestManager, dialogArchive, proactivityEngine,
  authorizationStore, griefModeManager, dependencyMonitor, trainingSessionManager, emotionalVariance,
  personaBundleManager, personaProfile, feedbackLearning, buildFullPrompt
};
