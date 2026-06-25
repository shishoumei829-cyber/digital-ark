'use strict';

const API_BASE = window.location.origin;
let currentPage = 0;
let chatHistory = [];
let lastInteraction = Date.now();
let greetingTimer = null;
let companionMode = 'normal';
let ttsEnabled = true;
let voiceRecorder = null;
let voiceChunks = [];
let voiceAudioB64 = null;
let voiceAudioFeatures = null;
let isRecordingTraining = false;

// ── 导航 ──
function go(i) {
  document.getElementById('p' + currentPage).classList.remove('on');
  document.getElementById('n' + currentPage).classList.remove('on');
  currentPage = i;
  document.getElementById('p' + currentPage).classList.add('on');
  document.getElementById('n' + currentPage).classList.add('on');
  if (i === 1) loadTrainingProgress();
  if (i === 2) loadCompanionStatus();
  if (i === 3) refreshStatus();
}

function showTraining(type) {
  document.querySelectorAll('.train-page').forEach(el => el.classList.remove('on'));
  const page = document.getElementById('tp-' + type);
  if (page) {
    page.classList.add('on');
    document.getElementById('trainOverlay').classList.add('on');
    loadTrainingProgress();
  }
}

function closeTraining() {
  document.getElementById('trainOverlay').classList.remove('on');
  document.querySelectorAll('.train-page').forEach(el => el.classList.remove('on'));
}

function showHealth() { go(3); refreshStatus(); }

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast on ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), 2800);
}

// ── 聊天 ──
function renderChat() {
  const box = document.getElementById('chatMessages');
  box.innerHTML = chatHistory.map(m => {
    const cls = m.role === 'user' ? 'me' : 'ai';
    const feedback = m.role === 'assistant' && m.showFeedback ? `
      <div class="feedback-row">
        <button onclick="sendFeedback(true,'${m.id}')">像</button>
        <button onclick="sendFeedback(false,'${m.id}')">不像</button>
      </div>` : '';
    return `<div class="chat-bubble ${cls}" data-id="${m.id}">${escapeHtml(m.content)}</div>${feedback}`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  lastInteraction = Date.now();

  const userMsg = { role: 'user', content: message, id: 'u' + Date.now() };
  chatHistory.push(userMsg);
  renderChat();

  const loadingId = 'l' + Date.now();
  chatHistory.push({ role: 'assistant', content: '…', id: loadingId, pending: true });
  renderChat();

  const apiMessages = chatHistory.filter(m => !m.pending).map(({ role, content }) => ({ role, content }));
  const endpoint = companionMode !== 'normal' ? '/companion/chat' : '/chat';
  const body = companionMode !== 'normal'
    ? { messages: apiMessages, companion_mode: companionMode }
    : { messages: apiMessages, stream: false };

  try {
    const response = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    chatHistory = chatHistory.filter(m => m.id !== loadingId);

    if (data.reply) {
      chatHistory.push({
        role: 'assistant',
        content: data.reply,
        id: 'a' + Date.now(),
        showFeedback: endpoint === '/chat'
      });
      if (data.pad_state) updateMoodDisplay(data.pad_state, data.strategy);
      renderChat();
      speakReply(data.reply);
    } else {
      toast(data.error || '发送失败', 'error');
    }
  } catch (err) {
    chatHistory = chatHistory.filter(m => m.id !== loadingId);
    toast('无法连接服务器，请先运行 启动.bat', 'error');
  }
}

async function sendFeedback(like, msgId) {
  try {
    await fetch(API_BASE + '/chat/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ like, message_id: msgId })
    });
    toast(like ? '已记录：回复很像你' : '已记录：会继续调整');
    const msg = chatHistory.find(m => m.id === msgId);
    if (msg) msg.showFeedback = false;
    renderChat();
  } catch { toast('反馈提交失败', 'error'); }
}

function updateMoodDisplay(pad, strategy) {
  const moodChip = document.getElementById('moodChip');
  if (pad.P > 0.3) moodChip.textContent = '心情愉悦';
  else if (pad.P > 0) moodChip.textContent = '内心平静';
  else if (pad.P > -0.3) moodChip.textContent = '心情略低';
  else moodChip.textContent = '心情低落';

  if (strategy) {
    const names = { OBSERVE: '观察', BUILD_TRUST: '建立信任', MAINTAIN: '维持', DEEP_ENGAGEMENT: '深度投入', WITHDRAW: '退缩' };
    document.getElementById('strategyChip').textContent = names[strategy.strategy] || '建立信任';
  }
}

// ── 主动问候 ──
async function checkGreeting() {
  const idleMs = Date.now() - lastInteraction;
  if (idleMs < 60000 || currentPage !== 0) return;
  try {
    const res = await fetch(API_BASE + '/companion/greeting');
    const data = await res.json();
    if (data.success && data.data?.text) {
      chatHistory.push({ role: 'assistant', content: data.data.text, id: 'g' + Date.now() });
      renderChat();
      lastInteraction = Date.now();
    }
  } catch {}
}

function startGreetingPoll() {
  if (greetingTimer) clearInterval(greetingTimer);
  greetingTimer = setInterval(checkGreeting, 90000);
}

// ── 语音输入 ──
function startVoiceInput() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('当前浏览器不支持语音识别', 'error'); return; }
  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    document.getElementById('chatInput').value = text;
    sendMessage();
  };
  rec.onerror = () => toast('语音识别失败', 'error');
  rec.start();
  toast('请开始说话…');
}

// ── 训练 ──
async function loadTrainingProgress() {
  try {
    const res = await fetch(API_BASE + '/training/progress');
    const { success, data } = await res.json();
    if (!success) return;
    const pct = n => Math.round((data.modules?.[n]?.progress ?? data[n] ?? 0) * 100);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('overallProgress', pct('voice') ? Math.round(data.overall_progress * 100) + '%' : Math.round(data.overall_progress * 100) + '%');
    document.getElementById('overallProgress').textContent = Math.round(data.overall_progress * 100) + '%';
    set('voiceProgress', pct('voice') + '% · 声音、语速、停顿和语气');
    set('memoryProgress', pct('memory') + '% · 人生片段、照片、文件和经历');
    set('relationshipProgress', pct('relationship') + '% · 朋友、家人、伴侣的回应方式');
    set('emotionProgress', pct('emotion') + '% · 情绪反应、安慰方式和压力处理');
    set('cognitionProgress', pct('cognition') + '% · 价值排序、冲突选择和决策习惯');
    ['voice','memory','relationship','emotion','cognition'].forEach(t => {
      const bar = document.getElementById('bar-' + t);
      if (bar) bar.style.width = pct(t) + '%';
      const label = document.getElementById('pct-' + t);
      if (label) label.textContent = pct(t) + '%';
    });
  } catch (e) { console.error(e); }
}

async function submitVoiceTraining() {
  const transcript = document.getElementById('voiceTranscript').value.trim();
  if (!transcript) { toast('请先朗读或输入文本', 'error'); return; }
  const res = await fetch(API_BASE + '/training/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio: voiceAudioB64 || 'web_placeholder',
      transcript,
      audio_features: voiceAudioFeatures || {}
    })
  });
  const data = await res.json();
  if (data.success) {
    toast(`音色相似度 ${Math.round(data.data.similarity_score * 100)}% · ${data.data.feedback}`);
    voiceAudioB64 = null;
    voiceAudioFeatures = null;
    loadTrainingProgress();
  } else toast(data.error || '提交失败', 'error');
}

async function analyzeAudioBlob(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    let sumSq = 0, zcr = 0;
    for (let i = 0; i < channel.length; i++) {
      sumSq += channel[i] * channel[i];
      if (i > 0 && (channel[i] >= 0) !== (channel[i - 1] >= 0)) zcr++;
    }
    const rms = Math.sqrt(sumSq / channel.length);
    return {
      duration: audioBuffer.duration,
      rms: Math.min(1, rms * 8),
      zcr: zcr / channel.length,
      pitchMean: 120 + rms * 200
    };
  } catch {
    return { duration: 3, rms: 0.3, zcr: 0.05, pitchMean: 150 };
  }
}

async function toggleVoiceTrainingRecord() {
  const btn = document.getElementById('voiceRecordBtn');
  if (isRecordingTraining && voiceRecorder) {
    voiceRecorder.stop();
    voiceRecorder.stream.getTracks().forEach(t => t.stop());
    isRecordingTraining = false;
    if (btn) btn.textContent = '开始录音';
    toast('录音结束，可提交样本');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceChunks = [];
    voiceRecorder = new MediaRecorder(stream);
    voiceRecorder.ondataavailable = e => { if (e.data.size) voiceChunks.push(e.data); };
    voiceRecorder.onstop = async () => {
      const blob = new Blob(voiceChunks, { type: 'audio/webm' });
      voiceAudioFeatures = await analyzeAudioBlob(blob);
      voiceAudioB64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      const dur = voiceAudioFeatures.duration?.toFixed(1) || '?';
      toast(`已分析录音 ${dur}s，RMS ${(voiceAudioFeatures.rms * 100).toFixed(0)}%`);
    };
    voiceRecorder.start();
    isRecordingTraining = true;
    if (btn) btn.textContent = '停止录音';
    toast('录音中… 朗读上方片段');
  } catch {
    toast('无法访问麦克风', 'error');
  }
}

async function submitMemoryTraining() {
  const content = document.getElementById('memoryContent').value.trim();
  if (!content) { toast('请描述一段记忆', 'error'); return; }
  const tags = document.getElementById('memoryTags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const res = await fetch(API_BASE + '/training/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, tags })
  });
  const data = await res.json();
  if (data.success) {
    toast(data.data.feedback);
    document.getElementById('memoryContent').value = '';
    loadTrainingProgress();
  }
}

async function submitRelationshipTraining() {
  const scenario = document.getElementById('relScenario').value;
  const response_type = document.querySelector('input[name="relType"]:checked')?.value || 'emotional';
  const response_text = document.getElementById('relResponse').value.trim();
  const res = await fetch(API_BASE + '/training/relationship', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, response_type, response_text, scene: scenario })
  });
  const data = await res.json();
  if (data.success) {
    toast(data.data.feedback);
    loadTrainingProgress();
  }
}

async function submitEmotionTraining() {
  const scenario = '朋友深夜崩溃';
  const response = document.getElementById('emoResponse').value.trim();
  if (!response) { toast('请写下你的回应', 'error'); return; }
  const res = await fetch(API_BASE + '/training/emotion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, response, stress_reaction: 'rational', comfort_style: 'accompany_first' })
  });
  const data = await res.json();
  if (data.success) {
    toast(data.data.feedback);
    document.getElementById('emoResponse').value = '';
    loadTrainingProgress();
  }
}

async function submitCognitionTraining() {
  const values = [...document.querySelectorAll('#valueList .value-item')].map(el => el.dataset.value);
  const conflict_choices = window._cogChoices || [];
  const res = await fetch(API_BASE + '/training/cognition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values_ranking: values, conflict_choices })
  });
  const data = await res.json();
  if (data.success) {
    toast(data.data.feedback);
    window._cogChoices = [];
    loadTrainingProgress();
  }
}

function pickConflict(choice) {
  window._cogChoices = window._cogChoices || [];
  window._cogChoices.push({ choice, ts: Date.now() });
  toast('已记录选择：' + choice);
}

function moveValue(el, dir) {
  const list = document.getElementById('valueList');
  const items = [...list.children];
  const i = items.indexOf(el);
  const j = i + dir;
  if (j < 0 || j >= items.length) return;
  if (dir < 0) list.insertBefore(el, items[j]);
  else list.insertBefore(items[j], el);
}

// ── 陪护设置 ──
async function loadCompanionStatus() {
  try {
    const res = await fetch(API_BASE + '/companion/status');
    const { success, data } = await res.json();
    if (!success) return;
    const av = data.digital_avatar;
    const settings = data.companion_settings;
    document.getElementById('companionName').textContent = av.name;
    document.getElementById('companionInfo').textContent =
      `关系等级 Lv.${av.relationship_level} · 拟合度 ${Math.round(av.personality_fit * 100)}% · ${av.mood}`;
    document.getElementById('autoGreeting').checked = settings.auto_greeting !== false;
    document.getElementById('greetingFreq').value = settings.greeting_frequency || 'medium';
    document.getElementById('quietStart').value = settings.quiet_hours?.start || '23:00';
    document.getElementById('quietEnd').value = settings.quiet_hours?.end || '08:00';
    const users = settings.authorized_users || [];
    document.getElementById('authList').textContent = users.length
      ? users.map(u => u.name || u).join('、')
      : '仅本人（默认）';
  } catch (e) { console.error(e); }
}

async function saveCompanionSettings() {
  const settings = {
    auto_greeting: document.getElementById('autoGreeting').checked,
    greeting_frequency: document.getElementById('greetingFreq').value,
    quiet_hours: {
      start: document.getElementById('quietStart').value,
      end: document.getElementById('quietEnd').value
    }
  };
  try {
    await fetch(API_BASE + '/companion/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    toast('陪护设置已保存');
  } catch { toast('保存失败', 'error'); }
}

function setCompanionMode(mode) {
  companionMode = mode;
  document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('chip-g'));
  document.getElementById('mode-' + mode)?.classList.add('chip-g');
  const chip = document.getElementById('chatModeChip');
  if (chip) {
    const labels = { normal: '', intimate: '亲密模式', support: '情感支持' };
    if (mode === 'normal') { chip.style.display = 'none'; }
    else { chip.style.display = 'inline-flex'; chip.textContent = labels[mode]; }
  }
}

// ── 状态 ──
async function refreshStatus() {
  try {
    const padRes = await fetch(API_BASE + '/pad-state');
    const pad = await padRes.json();
    document.getElementById('padP').textContent = (pad.P ?? 0).toFixed(2);
    document.getElementById('padA').textContent = (pad.A ?? 0).toFixed(2);
    document.getElementById('padD').textContent = (pad.D ?? 0).toFixed(2);
    document.getElementById('padS').textContent = (pad.S ?? 0).toFixed(2);
    if (pad.emotional_state) {
      document.getElementById('emotionDesc').textContent =
        `${pad.emotional_state.primary} · ${pad.emotional_state.secondary}`;
    }

    const healthRes = await fetch(API_BASE + '/health');
    const health = await healthRes.json();
    document.getElementById('healthStatus').innerHTML = `
      <p class="t-body-sm">系统: <strong>${health.status}</strong></p>
      <p class="t-body-sm">Ollama: ${health.services?.ollama?.status || '未知'}</p>
      <p class="t-body-sm">RAG: ${health.services?.rag?.index_size ?? 0} 条索引</p>
      <p class="t-body-sm">TTS: ${health.services?.tts?.status || '未知'}</p>
      <p class="t-body-sm">备份: ${health.services?.backup?.count ?? 0} 份</p>
      <p class="t-body-sm">内存: ${health.system?.memory_usage || '-'}</p>`;

    const memRes = await fetch(API_BASE + '/memory?limit=5');
    const mem = await memRes.json();
    const events = mem.events || [];
    document.getElementById('memoryPreview').innerHTML = events.length
      ? events.slice(-5).reverse().map(e =>
          `<p class="t-body-sm" style="margin-bottom:6px;">· ${escapeHtml(e.content.substring(0, 60))}</p>`
        ).join('')
      : '<p class="t-body-sm">暂无记忆</p>';
  } catch {
    document.getElementById('healthStatus').innerHTML = '<p class="t-body-sm" style="color:#93000a;">无法连接服务器</p>';
  }
}

// ── TTS 语音播报 ──
function toggleTTS() {
  ttsEnabled = document.getElementById('ttsToggle')?.checked ?? true;
}

async function speakReply(text) {
  if (!ttsEnabled || !text) return;
  try {
    const res = await fetch(API_BASE + '/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const { data } = await res.json();
    if (data?.mode === 'audio' && data.audio) {
      const audio = new Audio('data:' + (data.mime || 'audio/wav') + ';base64,' + data.audio);
      await audio.play();
      return;
    }
  } catch {}
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
}

// ── 备份与加密 ──
async function exportBackup() {
  try {
    const res = await fetch(API_BASE + '/backup/export', { method: 'POST' });
    const { success, data } = await res.json();
    if (!success) throw new Error('导出失败');
    const blob = Uint8Array.from(atob(data.download_base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/gzip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename || 'digital_ark_backup.json.gz';
    a.click();
    URL.revokeObjectURL(url);
    toast(`已导出 ${data.file_count} 个文件`);
  } catch (e) { toast('备份导出失败', 'error'); }
}

async function importBackup(file) {
  if (!file) return;
  try {
    const b64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch(API_BASE + '/backup/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_base64: b64 })
    });
    const { success, data } = await res.json();
    if (success) {
      toast(`已恢复 ${data.imported} 个文件`);
      refreshStatus();
      loadTrainingProgress();
    }
  } catch { toast('备份导入失败', 'error'); }
}

async function encryptData() {
  const pass = document.getElementById('encryptPass')?.value;
  if (!pass || pass.length < 6) { toast('口令至少 6 位', 'error'); return; }
  try {
    const res = await fetch(API_BASE + '/security/encrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase: pass })
    });
    const { success, data } = await res.json();
    if (success) toast(`已加密 ${data.encrypted_files.length} 个文件`);
    else toast('加密失败', 'error');
  } catch { toast('加密失败', 'error'); }
}

// ── 初始化 ──
window.onload = function () {
  refreshStatus();
  loadTrainingProgress();
  startGreetingPoll();
  fetch(API_BASE + '/companion/greeting').then(r => r.json()).then(d => {
    if (d.success && d.data?.text) {
      chatHistory.push({ role: 'assistant', content: d.data.text, id: 'init' });
      renderChat();
    }
  }).catch(() => {});
};

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement?.id === 'chatInput') sendMessage();
});
