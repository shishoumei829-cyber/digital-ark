'use strict';

window.DA = (function () {
  const API = window.location.origin;
  const APPS = {
    sanctuary: '/apps/sanctuary.html',
    training: '/apps/training.html',
    companion: '/apps/companion.html'
  };

  let chatHistory = [];
  let lastCapsSnapshot = null;
  let lastMsgId = null;
  let lastInteraction = Date.now();
  let companionMode = 'normal';
  let ttsEnabled = true;
  let voiceAudioB64 = null;
  let voiceAudioFeatures = null;
  let voiceRecorder = null;
  let voiceChunks = [];
  let isRecording = false;
  let cogChoices = [];
  let guideTask = null;
  let companionUserId = null;
  let trainingSetupComplete = false;

  try {
    companionUserId = localStorage.getItem('da_companion_user_id');
  } catch {}

  function setGuideTask(t) { guideTask = t || null; }
  function getGuideTask() { return guideTask; }

  async function fetchGuideOverview() {
    return api('GET', '/training/guide?_=' + Date.now(), undefined, { timeout: 15000 });
  }

  async function fetchModuleGuide(module) {
    const r = await api('GET', '/training/guide/' + module + '?_=' + Date.now());
    if (r.success && r.data) setGuideTask(r.data);
    return r;
  }

  function applyGuideAdvanceFromResponse(data, module) {
    if (!data) return null;
    const mg = data.module_guide;
    const home = data.next || data.home;
    if (mg?.task_id) {
      setGuideTask(mg);
      return mg;
    }
    if (home?.task_id) {
      setGuideTask(home);
      return home;
    }
    if (module && home && !home.task_id) setGuideTask(home);
    return home || mg || null;
  }

  /** 提交/跳过后强制同步主页与专项引导题（专项页以 module 为准，避免被主页题覆盖） */
  async function refreshGuideState(module) {
    let latest = null;
    if (module) {
      const mg = await api('GET', '/training/guide/' + module + '?_=' + Date.now());
      if (mg.success && mg.data) {
        setGuideTask(mg.data);
        latest = mg.data;
      }
    }
    const home = await api('GET', '/training/home?_=' + Date.now());
    if (home.success && home.data) {
      if (!module || !latest?.task_id) {
        if (home.data.task_id) setGuideTask(home.data);
        latest = home.data.task_id ? home.data : latest;
      }
    }
    return latest;
  }

  function setCompanionUserId(id) {
    companionUserId = id;
    if (id) localStorage.setItem('da_companion_user_id', id);
    else localStorage.removeItem('da_companion_user_id');
  }

  function getCompanionUserId() {
    return companionUserId;
  }

  function toast(msg, type) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast on ' + (type || '');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('on'), 2800);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function api(method, path, body, opts = {}) {
    const timeoutMs = opts.timeout ?? 20000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && !json.error) json.error = json.message || '请求失败';
      json._status = res.status;
      if (json.success === undefined) json.success = res.ok;
      return json;
    } catch (err) {
      const timedOut = err && err.name === 'AbortError';
      return {
        success: false,
        error: timedOut
          ? '连接超时：请确认电脑已开机、数字方舟在运行、Tailscale 已连接'
          : (err?.message || '网络错误')
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function openApp(name) {
    if (APPS[name]) location.href = APPS[name];
  }

  function toggleAppMenu() {
    document.getElementById('daAppMenu')?.classList.toggle('on');
  }

  function injectAppMenu(title) {
    if (document.getElementById('daAppMenu')) return;
    const menu = document.createElement('div');
    menu.id = 'daAppMenu';
    menu.className = 'da-app-menu';
    menu.innerHTML = `
      <button type="button" data-go="sanctuary">主应用</button>
      <button type="button" data-go="training">训练端</button>
      <button type="button" data-go="companion">陪护端</button>`;
    menu.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => { openApp(b.dataset.go); menu.classList.remove('on'); };
    });
    document.body.appendChild(menu);
    document.querySelectorAll('.topbar .mi').forEach(icon => {
      if (icon.textContent.trim() === 'settings' || icon.textContent.trim() === 'apps') {
        icon.textContent = 'apps';
        icon.style.cursor = 'pointer';
        icon.onclick = (e) => { e.stopPropagation(); toggleAppMenu(); };
      }
    });
    document.addEventListener('click', () => menu.classList.remove('on'));
  }

  function renderCapsPanel(caps, mountEl) {
    if (!mountEl) return;
    if (!caps) {
      mountEl.innerHTML = '';
      mountEl.style.display = 'none';
      return;
    }
    lastCapsSnapshot = caps;
    const path = (caps.propagation_labels || caps.propagation_path || []).join(' → ');
    const sig = caps.behavior_signature;
    const prec = caps.precedent;
    mountEl.style.display = 'block';
    mountEl.innerHTML = `
      <div class="da-caps-panel">
        <div class="da-caps-title"><span class="mi">psychology</span> CAPS 本轮加工</div>
        ${caps.situation_tags?.length ? `<div class="da-caps-row"><span class="da-caps-k">情境</span><span class="da-caps-v">${esc(caps.situation_tags.join(' · '))}</span></div>` : ''}
        ${caps.encoding_hint ? `<div class="da-caps-row"><span class="da-caps-k">解读</span><span class="da-caps-v">${esc(caps.encoding_hint)}</span></div>` : ''}
        ${path ? `<div class="da-caps-row"><span class="da-caps-k">路径</span><span class="da-caps-v">${esc(path)}</span></div>` : ''}
        ${sig?.if_then ? `<div class="da-caps-row"><span class="da-caps-k">签名</span><span class="da-caps-v">${esc(sig.if_then)}</span></div>` : ''}
        ${prec ? `<div class="da-caps-row da-caps-pre"><span class="da-caps-k">先例</span><span class="da-caps-v">${esc(prec.content)}（${esc(prec.source)}·${prec.outcome === 'positive' ? '积极' : prec.outcome === 'negative' ? '消极' : '中性'}）</span></div>` : ''}
        ${caps.sediment_new > 0 ? `<div class="da-caps-badge">新沉淀 ${caps.sediment_new} 条行为签名</div>` : ''}
        ${(caps.sediment_suggestions || []).length ? `<div class="da-caps-hint">${esc(caps.sediment_suggestions[0].hint || '')}</div>` : ''}
      </div>`;
  }

  function renderChat(boxEl, withFeedback, opts = {}) {
    if (!boxEl) return;
    const useCards = opts.messageCards || boxEl.classList.contains('da-msg-cards');
    const avatarAi = opts.avatarAi || twinAvatarSrc() || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCFH_lF4HwOYfS98wthpleQfHkcwXD5jCj6VQCj006Mba1WsAQ81R3bKHvwxvYe0SKnFgkaVp4_es4aEAX505X4trOUr1xw9gZrDeX7ZdvrLcm8v3fOoTfKh_hfhYGu-TeTjlpBUYFxEqH-NghOXfx4Sde_lq93QLQ7cBZFAulgbU0fYgVHrJ1PM7TvJeXN0ZEWxoSLLxX6Hf_2mA2uvs_t0Rwd1X5TjHR60K7pgrrXV8f_PW9e7yEFycjt4l07E4WF5LfhnxszQwAL';
    const aiName = opts.aiName || '数字分身';
    const useStick = !opts.avatarAi && !!twinAvatarSrc();

    boxEl.innerHTML = chatHistory.map(m => {
      let fb = '';
      if (withFeedback && m.role === 'assistant' && m.showFeedback) {
        fb = `<div class="da-calibration-row" data-msg-id="${m.id}">
          <button type="button" class="da-cal-btn da-cal-no" data-tier="no" data-id="${m.id}">不像我</button>
          <button type="button" class="da-cal-btn da-cal-partial" data-tier="partial" data-id="${m.id}">有点像</button>
          <button type="button" class="da-cal-btn da-cal-yes" data-tier="yes" data-id="${m.id}">很像我</button>
        </div>`;
      }
      if (useCards) {
        const isMe = m.role === 'user';
        const layerHtml = !isMe && m.layerExplanation && window.DALayerExplain
          ? window.DALayerExplain.renderExplanation(m.layerExplanation, { collapsed: true })
          : '';
        return `<div class="msg-card ${isMe ? 'me' : ''}" data-msg-id="${m.id}">
          ${isMe ? '' : (useStick ? twinAvatarHtml() : `<img class="msg-avatar" src="${avatarAi}" alt=""/>`)}
          <div class="msg-body">
            <div class="msg-name">${isMe ? '我' : aiName}</div>
            <div class="msg-text" data-archive="${m.content}">${esc(m.content)}</div>
            ${layerHtml}
            ${fb}
          </div>
        </div>`;
      }
      const cls = m.role === 'user' ? 'me' : 'ai';
      return `<div class="chat-bubble ${cls}">${esc(m.content)}</div>${fb}`;
    }).join('');

    if (useStick) {
      boxEl.querySelectorAll('.msg-avatar.da-stick-avatar').forEach(img => {
        window.DAAvatar?.applyImg(img, twinAvatarPresetId());
      });
    }

    boxEl.querySelectorAll('.da-calibration-row .da-cal-btn').forEach(btn => {
      btn.onclick = () => {
        const tier = btn.dataset.tier;
        const id = btn.dataset.id;
        if (tier === 'yes') sendFeedback(true, id);
        else openCalibrationSheet(id, tier);
      };
    });

    window.DALayerExplain?.wireExplainToggles(boxEl);

    if (opts.onArchive) {
      boxEl.querySelectorAll('.msg-text[data-archive]').forEach(el => {
        el.addEventListener('contextmenu', e => {
          e.preventDefault();
          opts.onArchive(el.dataset.archive);
        });
      });
    }
    boxEl.scrollTop = boxEl.scrollHeight;
  }

  let twinSetupCache = null;

  async function refreshTrainingSetupState() {
    const r = await api('GET', '/training/setup');
    if (r.success) {
      trainingSetupComplete = !!r.data?.setup_complete;
      twinSetupCache = r.data;
    }
    return r;
  }

  function twinAvatarSrc() {
    return window.DAAvatar?.SOURCE || '';
  }

  function twinAvatarPresetId() {
    return window.DAAvatar?.resolveId(twinSetupCache) || 'm';
  }

  function twinAvatarHtml(extraClass = '') {
    const src = twinAvatarSrc();
    const id = twinAvatarPresetId();
    if (!src) return '';
    const cls = ['msg-avatar', 'da-stick-avatar', `da-stick-avatar--${id}`, extraClass].filter(Boolean).join(' ');
    return `<img class="${cls}" src="${src}" alt=""/>`;
  }

  function isTrainingSetupComplete() {
    return trainingSetupComplete;
  }

  async function sendChat(inputEl, boxEl, opts = {}) {
    const message = inputEl.value.trim();
    if (!message) return;

    const useCompanion = opts.companion || companionMode !== 'normal';
    if (!useCompanion && !trainingSetupComplete) {
      toast('请先填写您的称呼，再开始试聊', 'error');
      opts.onSetupRequired?.();
      return;
    }

    inputEl.value = '';
    lastInteraction = Date.now();

    chatHistory.push({ role: 'user', content: message, id: 'u' + Date.now() });
    renderChat(boxEl, opts.feedback, opts);

    const loadingId = 'l' + Date.now();
    chatHistory.push({ role: 'assistant', content: '…', id: loadingId, pending: true });
    renderChat(boxEl, opts.feedback, opts);

    const apiMessages = chatHistory.filter(m => !m.pending).map(({ role, content }) => ({ role, content }));
    const path = useCompanion ? '/companion/chat' : '/chat';
    const body = useCompanion
      ? { messages: apiMessages, companion_mode: companionMode, companion_user_id: companionUserId, stream: true }
      : { messages: apiMessages, stream: true };

    try {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        chatHistory = chatHistory.filter(m => m.id !== loadingId);
        if (res.status === 403) {
          if (errJson.reason === 'setup_required') {
            toast(errJson.error || '请先完成训练身份设定', 'error');
            opts.onSetupRequired?.();
            return;
          }
          if (useCompanion) {
            toast(errJson.error || '请先完成知情同意', 'error');
            if (errJson.reason === 'consent_required' || errJson.reason === 'not_authorized') {
              opts.onAccessDenied?.(errJson);
            }
            return;
          }
        }
        toast(errJson.error || '请求失败', 'error');
        return;
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = chatHistory.find(m => m.id === loadingId);
      assistantMsg.content = '';
      assistantMsg.pending = false;
      let finalData = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') break;
            if (!raw) continue;
            try {
              const obj = JSON.parse(raw);
              if (obj.token) {
                assistantMsg.content += obj.token;
                renderChat(boxEl, opts.feedback, opts);
              }
              if (obj.done) {
                finalData = obj;
              }
            } catch (e) {}
          }
        }
      }
      
      const data = finalData;
      assistantMsg.id = 'a' + Date.now();
      assistantMsg.showFeedback = opts.feedback && !useCompanion;
      assistantMsg.layerExplanation = data.layer_explanation || data.caps?.layer_explanation || null;
      lastMsgId = assistantMsg.id;
      renderChat(boxEl, opts.feedback, opts);
      
      if (opts.onPad && data.pad_state) opts.onPad(data.pad_state, data.strategy);
      if (opts.onCaps && data.caps) opts.onCaps(data.caps);
      if (opts.onLayerExplain && assistantMsg.layerExplanation) {
        opts.onLayerExplain(assistantMsg.layerExplanation);
      }
      if (data.safety_alert && useCompanion) showSafetyAlert(data.safety_alert);
      if (!opts.noTts && data.reply) speakReply(data.reply);
      
    } catch {
      chatHistory = chatHistory.filter(m => m.id !== loadingId);
      toast('无法连接本地服务', 'error');
    }
  }

  const CALIBRATION_DEVIATIONS = [
    { id: 'tone', label: '语气不像' },
    { id: 'ai_like', label: '说得太像 AI' },
    { id: 'opinion', label: '观点不对' },
    { id: 'too_soft', label: '太温柔' },
    { id: 'too_cold', label: '太冷淡' },
    { id: 'proactive_wrong', label: '不会这样主动关心' },
    { id: 'boundary', label: '关系边界不对' }
  ];

  function showTwinChangeCard(changes, version) {
    if (!changes?.length) return;
    const host = document.querySelector('.da-home-shell') || document.querySelector('#p0');
    if (!host) return;
    let el = host.querySelector('.da-twin-change-card');
    if (!el) {
      el = document.createElement('div');
      el.className = 'da-twin-change-card';
      const anchor = host.querySelector('.da-segment');
      if (anchor) anchor.before(el);
      else host.prepend(el);
    }
    el.className = 'da-twin-change-card on';
    el.innerHTML = `
      <div class="da-twin-change-inner">
        <span class="mi" aria-hidden="true">auto_awesome</span>
        <div class="da-twin-change-body">
          <strong>数字人已更新${version ? ' · ' + esc(version) : ''}</strong>
          <ul>${changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
        </div>
        <button type="button" class="da-twin-change-close" aria-label="关闭">×</button>
      </div>`;
    el.querySelector('.da-twin-change-close')?.addEventListener('click', () => el.classList.remove('on'));
  }

  async function sendFeedback(like, msgId, opts = {}) {
    const lastUser = [...chatHistory].reverse().find(m => m.role === 'user');
    const lastAsst = [...chatHistory].reverse().find(m => m.role === 'assistant' && !m.pending);
    const partial = !!opts.partial && !like;
    const r = await api('POST', '/chat/feedback', {
      like: !!like,
      partial,
      message_id: msgId,
      comment: opts.comment || (like ? '很像我' : (partial ? '部分相似' : '不像我')),
      user_text: lastUser?.content,
      reply_text: lastAsst?.content,
      correction: opts.correction || undefined,
      preferred_reply: opts.correction || undefined,
      deviation_tags: opts.deviation_tags || []
    });
    if (r.success) {
      const allChanges = [...(r.changes || []), ...(r.layer_updates || [])];
      if (allChanges.length) showTwinChangeCard(allChanges, r.twin_version);
      toast(r.message || (like ? '已记录：很像你' : '已记录校准'));
    } else {
      toast(r.error || '反馈失败', 'error');
    }
    const m = chatHistory.find(x => x.id === msgId);
    if (m) m.showFeedback = false;
    const row = document.querySelector(`.da-calibration-row[data-msg-id="${msgId}"]`);
    if (row) row.remove();
    return r;
  }

  /** 不像我 / 有点像：哪里不像 + 我会怎么说 */
  function openCalibrationSheet(msgId, tier) {
    const partial = tier === 'partial';
    const lastAsst = [...chatHistory].reverse().find(m => m.role === 'assistant' && !m.pending);
    let overlay = document.getElementById('daFeedbackOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'daFeedbackOverlay';
      overlay.className = 'da-feedback-overlay';
      document.body.appendChild(overlay);
    }
    const chips = CALIBRATION_DEVIATIONS.map(d =>
      `<button type="button" class="da-dev-chip" data-dev="${d.id}">${d.label}</button>`
    ).join('');
    overlay.innerHTML = `
      <div class="da-feedback-sheet">
        <h3>${partial ? '哪里像、哪里不像？' : '哪里不像？'}</h3>
        <p class="t-body-sm">点选偏差类型（可多选），并写下你会怎么说。校准会立刻影响下次试聊。</p>
        ${lastAsst ? `<div class="da-feedback-preview">当前回复：${esc(lastAsst.content.slice(0, 160))}${lastAsst.content.length > 160 ? '…' : ''}</div>` : ''}
        <p class="da-setup-label" style="margin-top:12px;">哪里不像</p>
        <div class="da-dev-chips">${chips}</div>
        <p class="da-setup-label">我会怎么说 <span class="opt">选填</span></p>
        <textarea id="daFeedbackCorrection" rows="3" placeholder="例：我会更直接，先说「别急，我们看看哪里卡住了」"></textarea>
        <div class="da-feedback-actions">
          <button type="button" id="daFbSkip" class="da-feedback-skip">跳过</button>
          <button type="button" id="daFbSave" class="da-feedback-save">保存校准</button>
        </div>
      </div>`;
    overlay.style.display = 'flex';
    const selected = new Set();
    overlay.querySelectorAll('.da-dev-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.dev;
        if (selected.has(id)) { selected.delete(id); chip.classList.remove('on'); }
        else { selected.add(id); chip.classList.add('on'); }
      });
    });
    overlay.onclick = e => { if (e.target === overlay) overlay.style.display = 'none'; };
    overlay.querySelector('.da-feedback-sheet')?.addEventListener('click', e => e.stopPropagation());
    overlay.querySelector('#daFbSkip').onclick = () => {
      overlay.style.display = 'none';
      sendFeedback(false, msgId, { partial, deviation_tags: [...selected] });
    };
    overlay.querySelector('#daFbSave').onclick = () => {
      const fix = overlay.querySelector('#daFeedbackCorrection')?.value?.trim();
      overlay.style.display = 'none';
      sendFeedback(false, msgId, {
        partial,
        deviation_tags: [...selected],
        correction: fix || undefined
      });
    };
  }

  function promptFeedbackCorrection(like, msgId, partial) {
    openCalibrationSheet(msgId, partial ? 'partial' : 'no');
  }

  async function fetchHomeTraining() {
    return api('GET', '/training/home?_=' + Date.now(), undefined, { timeout: 15000 });
  }

  async function submitHomeTraining(payload) {
    const r = await api('POST', '/training/home/submit', payload);
    if (r.success) applyGuideAdvanceFromResponse(r.data, payload.module);
    return r;
  }

  function skipAdvanceResult(module, prevId, data, message) {
    const next = applyGuideAdvanceFromResponse(data, module);
    const nextId = next?.task_id || null;
    const advanced = !!(nextId && nextId !== prevId);
    if (nextId && nextId === prevId) {
      toast('已跳过，但题库暂无新题（可能本题库较小）', 'error');
    } else if (!next?.all_done) {
      toast(message || data?.feedback || (nextId ? '已跳过，进入下一题' : '已跳过'));
    } else {
      toast(message || data?.feedback || '本模块题目已完成');
    }
    return { ok: true, module, next, advanced, prevId };
  }

  /** 没印象 / 想不起：跳过当前引导题并进入下一题 */
  async function skipGuideTask(opts = {}) {
    const module = opts.module || getGuideTask()?.module;
    if (!module) {
      toast('当前没有可跳过的题目，请刷新页面', 'error');
      return { ok: false };
    }
    let task_id = opts.task_id;
    if (!task_id) {
      const gr = await fetchModuleGuide(module);
      task_id = gr.data?.task_id || getGuideTask()?.task_id;
    }
    if (!task_id) {
      toast('当前没有可跳过的题目，请刷新页面', 'error');
      return { ok: false };
    }
    const prevId = task_id;
    const gt = getGuideTask();
    const payload = {
      module,
      task_id,
      skipped: true,
      skip_reason: opts.reason || 'no_impression'
    };

    let r = await api('POST', '/training/home/submit', payload);
    if (r.success) {
      return skipAdvanceResult(module, prevId, r.data, r.message);
    }

    const modulePaths = {
      memory: '/training/memory',
      relationship: '/training/relationship',
      emotion: '/training/emotion',
      cognition: '/training/cognition',
      voice: '/training/voice'
    };
    const path = modulePaths[module];
    if (path) {
      const body = { skipped: true, task_id, skip_reason: payload.skip_reason };
      if (module === 'relationship') {
        body.scenario = gt?.category || gt?.scene || 'daily';
        body.response_type = 'skipped';
        body.scene = gt?.scene || '关系场景';
      }
      if (module === 'emotion') {
        body.scenario = gt?.scenario || '情绪场景';
        body.response = '';
      }
      r = await api('POST', path, body);
      if (r.success) {
        return skipAdvanceResult(module, prevId, r.data, r.message);
      }
    }

    toast(r.error || '跳过失败，请刷新后重试', 'error');
    return { ok: false };
  }

  async function ingestChatTraining(userText, assistantText, saveAs) {
    return api('POST', '/training/home/ingest-chat', {
      user_text: userText,
      assistant_text: assistantText,
      save_as: saveAs || 'note'
    });
  }

  async function sendPartialFeedback(msgId) {
    promptFeedbackCorrection(false, msgId, true);
  }

  async function loadProgress() {
    const { success, data } = await api('GET', '/training/progress');
    return success ? data : null;
  }

  function applyProgress(data, root) {
    if (!data) return;
    const pct = n => Math.round((data.modules?.[n]?.progress ?? 0) * 100);
    const layerPct = k => Math.round((data.layers?.[k]?.progress ?? 0) * 100);
    const overall = Math.round((data.personality_fit ?? data.overall_progress ?? 0) * 100);
    const shortLabels = {
      voice: '表达层 · 声音、语速、口癖',
      memory: '记忆层 · 经历与沉淀',
      relationship: '关系层 · 亲密与信任',
      emotion: '情绪层 · 真实情绪节奏',
      cognition: '核心层 · 价值、边界与 CAPS'
    };
    const layerChipLabels = {
      core: '核心层',
      emotion: '情绪层',
      memory: '记忆层',
      relationship: '关系层',
      expression: '表达层'
    };

    root.querySelectorAll('.hero-pct, .da-overall-progress .hero-pct').forEach(el => {
      el.textContent = overall + '%';
      el.classList.remove('da-pct-pending');
    });
    root.querySelectorAll('.da-overall-progress .pbar-fill, .hero-progress .pbar-fill').forEach(el => {
      el.style.width = overall + '%';
    });
    root.querySelectorAll('.da-stage-name').forEach(el => {
      if (data.stage?.name) el.textContent = data.stage.name;
    });

    const rows = root.querySelectorAll('.module-row small');
    const keys = ['voice', 'memory', 'relationship', 'emotion', 'cognition'];
    rows.forEach((el, i) => {
      if (keys[i]) el.textContent = shortLabels[keys[i]];
    });

    root.querySelectorAll('.da-module-list .module-row[data-module], .da-hub-mod-list .module-row[data-module]').forEach(row => {
      const k = row.dataset.module;
      const p = pct(k);
      row.style.setProperty('--mod-pct', p);
      const pctEl = row.querySelector('.da-mod-pct');
      if (pctEl) {
        pctEl.textContent = p + '%';
        pctEl.classList.remove('da-pct-pending');
      }
      const bar = row.querySelector('.da-mod-bar i');
      if (bar) bar.style.width = p + '%';
    });

    ['voice', 'memory', 'relationship', 'emotion', 'cognition'].forEach((k, i) => {
      root.querySelectorAll(`#p${i + 2} .pbar-fill, #p${i + 3} .pbar-fill`).forEach(b => {
        b.style.width = pct(k) + '%';
      });
      const page = root.querySelector(`#p${i + 2}`) || root.querySelector(`#p${i + 3}`);
      page?.querySelectorAll('.t-pct').forEach(el => {
        el.textContent = pct(k) + '%';
        el.classList.remove('da-pct-pending');
      });
    });

    const fit = root.querySelector('.card-w .t-label + span[style*="Noto"]');
    if (fit) fit.textContent = overall + '%';
    root.querySelectorAll('.card-w .pbar-fill').forEach((b, i) => {
      if (i === 0) b.style.width = overall + '%';
    });

    root.querySelectorAll('.da-layer-chip[data-layer]').forEach(chip => {
      const k = chip.dataset.layer;
      const p = layerPct(k);
      chip.textContent = (layerChipLabels[k] || k) + ' ' + p + '%';
      chip.classList.toggle('chip-g', p >= 70);
      chip.classList.toggle('chip-o', p < 70);
    });

    root.querySelectorAll('.da-home-tagline').forEach(tag => {
      const cur = (tag.textContent || '').trim();
      if (/训练进行中|内心平静|心情愉悦|心情略低|静心沉思/.test(cur)) {
        tag.textContent = overall > 0 ? `拟合 ${overall}%` : '随手记一句话，最快让分身像你';
      } else if (overall > 0 && !cur.includes('拟合')) {
        tag.textContent = `拟合 ${overall}% · ${cur}`;
      }
    });
    root.querySelectorAll('.da-home-hero-ring').forEach(ring => {
      ring.style.setProperty('--pct', overall);
    });
  }

  async function archiveMessage(message, archiveType = 'memory') {
    const { success } = await api('POST', '/companion/archive', {
      message, role: 'user', archive_type: archiveType
    });
    if (success) toast('已归档，可在训练端确认');
    else toast('归档失败', 'error');
  }

  async function analyzeAudioBlob(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const ch = audioBuffer.getChannelData(0);
      let sumSq = 0, zcr = 0;
      for (let i = 0; i < ch.length; i++) {
        sumSq += ch[i] * ch[i];
        if (i > 0 && (ch[i] >= 0) !== (ch[i - 1] >= 0)) zcr++;
      }
      return {
        duration: audioBuffer.duration,
        rms: Math.min(1, Math.sqrt(sumSq / ch.length) * 8),
        zcr: zcr / ch.length,
        pitchMean: 150
      };
    } catch {
      return { duration: 3, rms: 0.3, zcr: 0.05, pitchMean: 150 };
    }
  }

  async function toggleRecord(btn) {
    if (isRecording && voiceRecorder) {
      voiceRecorder.stop();
      voiceRecorder.stream.getTracks().forEach(t => t.stop());
      isRecording = false;
      if (btn) btn.style.opacity = '1';
      toast('录音完成');
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
        voiceAudioB64 = await new Promise(r => {
          const reader = new FileReader();
          reader.onloadend = () => r(reader.result);
          reader.readAsDataURL(blob);
        });
        toast(`录音 ${voiceAudioFeatures.duration?.toFixed(1)}s 已分析`);
      };
      voiceRecorder.start();
      isRecording = true;
      if (btn) btn.style.opacity = '0.6';
      toast('录音中…');
    } catch { toast('无法访问麦克风', 'error'); }
  }

  async function submitVoice(transcript) {
    if (!transcript) {
      toast(getGuideTask()?.task_id ? '想不起可以点「没印象，跳过」' : '请先朗读或填写文字', 'error');
      return;
    }
    const gt = getGuideTask();
    const { success, data, error } = await api('POST', '/training/voice', {
      audio: voiceAudioB64 || 'web_placeholder',
      transcript,
      audio_features: voiceAudioFeatures || {},
      task_id: gt?.module === 'voice' ? gt.task_id : undefined
    });
    if (success) {
      applyGuideAdvanceFromResponse(data, 'voice');
      toast(data.feedback || `已记录 · 相似度 ${Math.round(data.similarity_score * 100)}%`);
      voiceAudioB64 = null;
      voiceAudioFeatures = null;
      await refreshGuideState('voice');
      return true;
    }
    toast(error || '提交失败', 'error');
    return false;
  }

  function showSafetyAlert(alert) {
    if (!alert || document.getElementById('daSafetyBanner')) return;
    const el = document.createElement('div');
    el.id = 'daSafetyBanner';
    el.className = 'da-safety-banner';
    el.innerHTML = `<p><strong>温馨提醒</strong></p><p>${(alert.resources || []).join(' ')}</p>
      <button type="button" class="da-safety-dismiss">我知道了</button>`;
    document.body.appendChild(el);
    el.querySelector('.da-safety-dismiss')?.addEventListener('click', async () => {
      await api('POST', '/ethics/dependency/dismiss', { alert_id: alert.id });
      el.remove();
    });
  }

  async function ensureDeepUnlock(moduleKey) {
    const st = await api('GET', '/training/session-status');
    if (st.data?.deep_unlocked?.[moduleKey]) return true;
    const ok = window.confirm('这个练习可能触及较深的内容。你准备好了吗？');
    if (!ok) return false;
    const r = await api('POST', '/training/deep-unlock', { module: moduleKey, ready: true });
    return r.success;
  }

  async function submitLightweightNote(content) {
    const { success, data } = await api('POST', '/training/lightweight-note', { content });
    if (success) { toast('随手记已保存'); return data; }
    toast('保存失败', 'error');
    return null;
  }

  async function stopTrainingForToday() {
    const { success, data } = await api('POST', '/training/stop-for-today');
    if (success) toast(data.message || '今天到此为止');
    return success;
  }

  async function apiWithGate(method, path, body, moduleKey) {
    if (moduleKey && !(await ensureDeepUnlock(moduleKey))) return null;
    const res = await api(method, path, body);
    if (res.error && res.gate) {
      toast(res.error, 'error');
      return null;
    }
    if (res.rest_hint) toast(res.rest_hint);
    return res;
  }

  async function ensureModuleGuideTask(module) {
    let gt = getGuideTask();
    if (!gt?.task_id || gt?.module !== module) {
      const gr = await fetchModuleGuide(module);
      gt = gr.data || gt;
    }
    return gt;
  }

  async function submitMemory(content, extra = {}) {
    const gt = await ensureModuleGuideTask('memory');
    if ((extra.tier === 'wish' || extra.tier === 'emotional') && !(await ensureDeepUnlock(extra.tier === 'wish' ? 'wish' : 'emotion'))) {
      return false;
    }
    if (!content?.trim()) {
      toast('写几个字，或点「有印象」「跳过」', 'error');
      return false;
    }
    const { success, data } = await api('POST', '/training/memory', {
      content: content.trim(),
      tags: extra.tags || gt?.suggested_tags || [],
      tier: extra.tier || gt?.tier || 'core',
      time: extra.time,
      place: extra.place,
      people: extra.people,
      emotion: extra.emotion,
      photos: extra.photos,
      save_only: !!extra.save_only,
      task_id: gt?.task_id
    });
    if (success) {
      if (extra.save_only) {
        toast(data.feedback || '已记下');
      } else {
        applyGuideAdvanceFromResponse(data, 'memory');
        toast(data.feedback || '已保存');
        if (data.rest_hint) toast(data.rest_hint);
        await refreshGuideState('memory');
      }
      return true;
    }
    return false;
  }

  async function submitRelationship(type, text, extra = {}) {
    const gt = await ensureModuleGuideTask('relationship');
    if (!text?.trim()) {
      toast(gt?.task_id ? '想不起可以点「没印象，跳过」' : '请写下回应', 'error');
      return false;
    }
    const { success, data } = await api('POST', '/training/relationship', {
      scenario: extra.scenario || gt?.category || 'daily',
      response_type: type,
      response_text: text,
      scene: extra.scene || gt?.scene || '关系场景',
      task_id: gt?.task_id
    });
    if (success) {
      applyGuideAdvanceFromResponse(data, 'relationship');
      toast(data.feedback || '已记录');
      await refreshGuideState('relationship');
      return true;
    }
    return false;
  }

  async function submitEmotion(text) {
    const gt = await ensureModuleGuideTask('emotion');
    if (!text?.trim()) {
      toast(gt?.task_id ? '想不起可以点「没印象，跳过」' : '请写下回应', 'error');
      return false;
    }
    const res = await api('POST', '/training/emotion', {
      scenario: gt?.scenario || '情绪场景',
      response: text.trim(),
      stress_reaction: gt?.stress_reaction || 'rational',
      comfort_style: gt?.comfort_style || 'accompany_first',
      task_id: gt?.task_id
    });
    if (!res.success && res.gate) {
      if (await ensureDeepUnlock(res.gate)) return submitEmotion(text);
      return false;
    }
    const { success, data } = res;
    if (success) {
      applyGuideAdvanceFromResponse(data, 'emotion');
      toast(data.feedback || '已记录');
      await refreshGuideState('emotion');
      return true;
    }
    return false;
  }

  async function submitCognition(values, extra = {}) {
    const gt = await ensureModuleGuideTask('cognition');
    const res = await api('POST', '/training/cognition', {
      values_ranking: values,
      conflict_choices: extra.conflict_choices || cogChoices,
      task_id: gt?.task_id
    });
    if (!res.success && res.gate) {
      if (await ensureDeepUnlock(res.gate)) return submitCognition(values, extra);
      return false;
    }
    const { success, data } = res;
    if (success) {
      applyGuideAdvanceFromResponse(data, 'cognition');
      toast(data.feedback || '已记录');
      cogChoices = [];
      await refreshGuideState('cognition');
      return true;
    }
    return false;
  }

  function pickConflict(choice) {
    cogChoices.push({ choice, ts: Date.now() });
    toast('已记录：' + choice);
  }

  async function loadCompanionStatus() {
    return api('GET', '/companion/status');
  }

  async function saveCompanionSettings(settings) {
    await api('POST', '/companion/settings', settings);
    toast('设置已保存');
  }

  async function speakReply(text) {
    if (!ttsEnabled || !text) return;
    try {
      const { data } = await api('POST', '/tts/synthesize', { text });
      if (data?.mode === 'audio' && data.audio) {
        await new Audio('data:' + (data.mime || 'audio/wav') + ';base64,' + data.audio).play();
        return;
      }
    } catch {}
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      speechSynthesis.speak(u);
    }
  }

  function startVoiceInput(inputEl, boxEl, opts) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('不支持语音识别', 'error'); return; }
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.onresult = e => {
      inputEl.value = e.results[0][0].transcript;
      sendChat(inputEl, boxEl, opts);
    };
    rec.start();
    toast('请说话…');
  }

  function padToChips(pad, chips) {
    if (!chips?.length) return;
    if (pad.P > 0.3) chips[0].textContent = '心情愉悦';
    else if (pad.P > 0) chips[0].textContent = '内心平静';
    else chips[0].textContent = '心情略低';
  }

  async function fetchTrainingSetup() {
    return api('GET', '/training/setup');
  }

  async function fetchTrainingDashboard() {
    return api('GET', '/training/dashboard');
  }

  async function saveTrainingSetup(payload) {
    return api('POST', '/training/setup', payload);
  }

  async function enableDemoSetup() {
    return api('POST', '/training/setup/demo');
  }

  async function fetchFineTuneStatus(personaId = 'user') {
    return api('GET', '/fine-tune/status?persona_id=' + encodeURIComponent(personaId));
  }

  async function exportFineTuneCorpus(personaId = 'user') {
    return api('POST', '/fine-tune/export', { persona_id: personaId });
  }

  async function runFineTune(personaId = 'user') {
    return api('POST', '/fine-tune/run', { persona_id: personaId });
  }

  async function fetchFineTuneJob(jobId) {
    return api('GET', '/fine-tune/job/' + encodeURIComponent(jobId));
  }

  return {
    API, APPS, openApp, toast, api, injectAppMenu, toggleAppMenu,
    chatHistory, get lastMsgId() { return lastMsgId; },
    renderChat, renderCapsPanel, sendChat, sendFeedback, sendPartialFeedback, promptFeedbackCorrection,
    get lastCapsSnapshot() { return lastCapsSnapshot; },
    fetchHomeTraining, submitHomeTraining, skipGuideTask, refreshGuideState, ingestChatTraining,
    loadProgress, applyProgress,
    toggleRecord, submitVoice, submitMemory, submitRelationship,
    submitEmotion, submitCognition, pickConflict,
    setGuideTask, getGuideTask, fetchGuideOverview, fetchModuleGuide,
    fetchTrainingSetup, saveTrainingSetup, enableDemoSetup, fetchTrainingDashboard,
    fetchFineTuneStatus, exportFineTuneCorpus, runFineTune, fetchFineTuneJob,
    refreshTrainingSetupState, isTrainingSetupComplete,
    loadCompanionStatus, saveCompanionSettings, speakReply, startVoiceInput,
    padToChips, archiveMessage, setCompanionUserId, getCompanionUserId,
    submitLightweightNote, stopTrainingForToday, ensureDeepUnlock, showSafetyAlert, set companionMode(v) { companionMode = v; },
    get companionMode() { return companionMode; },
    set ttsEnabled(v) { ttsEnabled = v; },
    get cogChoices() { return cogChoices; }
  };
})();
