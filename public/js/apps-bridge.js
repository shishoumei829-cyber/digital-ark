'use strict';

(function () {
  const DA = window.DA;
  const path = location.pathname;

  if (window.digitalArk?.isDesktop) document.body.classList.add('da-desktop');

  const SUB_PAGES = [2, 3, 4, 5, 6];
  let trainingSetupReady = false;
  let trainingSetupCache = null;
  const SUB_TITLES = {
    2: '音色训练',
    3: '记忆训练',
    4: '关系训练',
    5: '情感训练',
    6: '认知训练'
  };

  function installNavChrome(pageIndex) {
    const nav = document.querySelector('.bottom-nav');
    const topbar = document.querySelector('.topbar');
    const isSub = SUB_PAGES.includes(pageIndex);
    if (nav) nav.style.display = isSub ? 'none' : '';
    if (topbar) topbar.style.display = isSub ? 'none' : '';

    SUB_PAGES.forEach(i => {
      const page = document.getElementById('p' + i);
      if (!page) return;
      let bar = page.querySelector('.da-subhead');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'da-subhead';
        bar.innerHTML = '<button type="button" class="da-back" aria-label="返回训练"><span class="mi">arrow_back</span>返回</button><span class="da-subhead-title"></span>';
        page.insertBefore(bar, page.firstChild);
        bar.querySelector('.da-back').onclick = () => window.go(1);
      }
      const title = bar.querySelector('.da-subhead-title');
      if (title) title.textContent = SUB_TITLES[i] || '训练';
    });
  }

  function wireMemoryTagsAndPhoto(p3, memTa) {
    if (!p3 || p3.dataset.memExtrasWired) return;
    p3.dataset.memExtrasWired = '1';
    const chipHost = p3.querySelector('.da-mem-tags');
    const addChip = chipHost?.querySelector('.chip-add');
    addChip?.addEventListener('click', () => {
      const tag = window.prompt('添加记忆标签');
      if (!tag?.trim()) return;
      const span = document.createElement('span');
      span.className = 'chip chip-g da-mem-tag';
      span.textContent = tag.trim();
      chipHost.insertBefore(span, addChip);
    });
    const uploadBtn = p3.querySelector('.da-mem-upload-btn');
    if (uploadBtn && !p3.querySelector('#daMemPhotoInput')) {
      const fi = document.createElement('input');
      fi.type = 'file';
      fi.id = 'daMemPhotoInput';
      fi.accept = 'image/*';
      fi.hidden = true;
      p3.appendChild(fi);
      uploadBtn.addEventListener('click', () => fi.click());
      fi.addEventListener('change', () => {
        const f = fi.files?.[0];
        if (!f) return;
        if (f.size > 4 * 1024 * 1024) { DA.toast('图片请小于 4MB', 'error'); return; }
        const reader = new FileReader();
        reader.onload = () => {
          p3.dataset.memPhoto = reader.result;
          DA.toast('照片已附加（提交记忆时一并保存）');
        };
        reader.readAsDataURL(f);
      });
    }
    p3._collectMemoryExtras = () => ({
      tags: [...(chipHost?.querySelectorAll('.da-mem-tag') || [])].map(el => el.textContent.trim()),
      photos: p3.dataset.memPhoto ? [p3.dataset.memPhoto] : []
    });
  }

  function wrapGo(origGo, onPage) {
    return function (i) {
      if (SUB_PAGES.includes(i) && !trainingSetupReady) {
        showTrainingSetupWizard();
        return;
      }
      origGo(i);
      installNavChrome(i);
      onPage(i);
    };
  }

  async function refreshTrainingSetupState() {
    const r = await DA.refreshTrainingSetupState();
    if (r.success) {
      trainingSetupCache = r.data;
      trainingSetupReady = !!r.data.setup_complete;
      window.DAAvatar?.applyAll(trainingSetupCache);
      applyHomeHeroAvatar();
    }
    updateTrainingUiGate();
    return r;
  }

  window.daApplyHomeHeroAvatar = function () {
    const img = document.querySelector('.da-home-shell .da-home-hero-orb img');
    if (img && window.DAAvatar) {
      window.DAAvatar.applyImg(img, window.DAAvatar.resolveId(trainingSetupCache));
    }
  };

  function applyHomeHeroAvatar() {
    window.daApplyHomeHeroAvatar();
  }

  function ensureSetupBanner() {
    if (trainingSetupReady) {
      document.getElementById('daSetupBanner')?.remove();
      return;
    }
    let bar = document.getElementById('daSetupBanner');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'daSetupBanner';
      bar.className = 'da-setup-banner';
      bar.innerHTML = '<span>尚未完成身份设定，大部分功能不可用</span><button type="button" class="da-setup-banner-btn">去设定</button>';
      bar.querySelector('.da-setup-banner-btn')?.addEventListener('click', showTrainingSetupWizard);
      document.querySelector('.phone')?.prepend(bar);
    }
  }

  function updateTrainingUiGate() {
    ensureSetupBanner();
    document.querySelectorAll('.da-module-list .module-row, #p1 .module-row').forEach(btn => {
      btn.classList.toggle('da-module-locked', !trainingSetupReady);
      btn.setAttribute('aria-disabled', trainingSetupReady ? 'false' : 'true');
    });
    const chatInput = document.querySelector('#p0 input[type="text"]');
    if (chatInput && (path.includes('training') || path.includes('sanctuary'))) {
      chatInput.placeholder = trainingSetupReady
        ? (chatInput.dataset.phReady || '和数字分身说点什么…')
        : '请先填写您的称呼';
      chatInput.disabled = !trainingSetupReady;
    }
  }

  function wireModuleRowsGate() {
    document.querySelectorAll('#p1 .module-row[onclick]').forEach(btn => {
      const m = btn.getAttribute('onclick')?.match(/go\((\d+)\)/);
      if (!m) return;
      const target = Number(m[1]);
      btn.removeAttribute('onclick');
      btn.addEventListener('click', () => {
        if (SUB_PAGES.includes(target) && !trainingSetupReady) {
          showTrainingSetupWizard();
          return;
        }
        window.go(target);
      });
    });
  }

  function openAvatarPicker() {
    if (!window.DAAvatar) return;
    window.DAAvatar.showPickerSheet({
      selectedId: window.DAAvatar.resolveId(trainingSetupCache),
      onSave: async (id) => {
        const av = window.DAAvatar.presetPayload(id);
        const r = await DA.saveTrainingSetup({
          ...av,
          setup_complete: trainingSetupCache?.setup_complete ?? true
        });
        if (!r.success) {
          DA.toast(r.error || '保存失败', 'error');
          return;
        }
        await refreshTrainingSetupState();
        renderHomeTraining(document.getElementById('p0'));
        DA.toast('分身形象已更新');
      }
    });
  }

  function showTrainingSetupWizard() {
    let overlay = document.getElementById('daSetupOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'daSetupOverlay';
      overlay.className = 'da-setup-overlay';
      document.body.appendChild(overlay);
    }
    overlay.className = 'da-setup-overlay';
    overlay.style.display = 'flex';
    renderSetupForm(overlay);
  }

  function renderSetupForm(overlay) {
    const draft = trainingSetupCache || {};
    const relTypes = trainingSetupCache?.relationship_types || {};
    const keyPeople = [...(draft.key_people || [])];
    const typeOpts = Object.entries(relTypes).map(([k, v]) =>
      `<option value="${k}">${v.label}</option>`
    ).join('');
    const esc = s => String(s || '').replace(/"/g, '&quot;');

    overlay.innerHTML = `
      <div class="da-setup-sheet" role="dialog" aria-labelledby="daSetupTitle">
        <button type="button" class="da-setup-close" aria-label="关闭">×</button>
        <div class="da-setup-hero">
          <div class="da-setup-avatar"><span class="mi">face_3</span></div>
          <h2 id="daSetupTitle">创建您的数字分身</h2>
          <p>您就是训练者本人。填写称呼后，7 日题目会围绕<strong>您的生活与表达习惯</strong>生成。</p>
        </div>
        <div class="da-setup-form">
          <label class="da-setup-label">怎么称呼您 <span class="req">*</span></label>
          <input type="text" class="da-setup-field" id="daSetupName" placeholder="例如：小明、张先生"
            value="${esc(draft.subject_name || draft.trainer_name)}" autocomplete="name"/>
          <label class="da-setup-label">分身形象 <span class="req">*</span></label>
          <div class="da-avatar-pick-row da-setup-avatar-pick">${window.DAAvatar?.pickerMarkup(draft.avatar_preset || (draft.subject_gender === 'female' ? 'f' : draft.subject_gender === 'male' ? 'm' : '')) || ''}</div>
          <label class="da-setup-label">一句话介绍自己 <span class="opt">选填</span></label>
          <textarea class="da-setup-field" id="daSetupBrief" rows="2"
            placeholder="性格、职业或生活状态，帮助分身更像您">${draft.subject_brief || ''}</textarea>
          <details class="da-setup-details">
            <summary>生命里的重要的人 <span class="opt">选填 · 关系题会用上</span></summary>
            <div id="daSetupPeopleList" class="da-setup-people"></div>
            <div class="da-setup-add-row">
              <input type="text" class="da-setup-field" id="daSetupPersonName" placeholder="姓名"/>
              <select class="da-setup-field" id="daSetupPersonType">${typeOpts}</select>
              <button type="button" class="da-setup-add-btn" id="daSetupAddPerson">添加</button>
            </div>
          </details>
          <button type="button" class="da-btn-primary" id="daSetupSubmit">开始 7 日训练</button>
          <button type="button" class="da-setup-demo-link" id="daSetupDemo">先体验演示：艾莉莎（预置角色）</button>
        </div>
      </div>`;

    const sheet = overlay.querySelector('.da-setup-sheet');
    const renderPeople = () => {
      const list = overlay.querySelector('#daSetupPeopleList');
      if (!list) return;
      list.innerHTML = keyPeople.length
        ? keyPeople.map((p, i) => `<span class="da-setup-person-chip">${p.name}（${relTypes[p.type]?.label || p.type}）
          <button type="button" data-i="${i}" class="da-rm-person" aria-label="移除">×</button></span>`).join('')
        : '<p class="da-setup-empty">尚未添加，可跳过</p>';
      list.querySelectorAll('.da-rm-person').forEach(b => {
        b.onclick = () => { keyPeople.splice(Number(b.dataset.i), 1); renderPeople(); };
      });
    };
    renderPeople();

    let setupAvatarPreset = draft.avatar_preset || (draft.subject_gender === 'female' ? 'f' : draft.subject_gender === 'male' ? 'm' : 'm');
    window.DAAvatar?.wirePicker(overlay.querySelector('.da-setup-avatar-pick'), {
      selectedId: setupAvatarPreset,
      onChange: id => { setupAvatarPreset = id; }
    });

    overlay.querySelector('.da-setup-close')?.addEventListener('click', () => {
      if (!trainingSetupReady) {
        DA.toast('请先完成身份设定，或点「先体验演示」', 'error');
        return;
      }
      overlay.style.display = 'none';
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        if (!trainingSetupReady) {
          DA.toast('请填写称呼并开始训练，才能使用其他功能', 'error');
          return;
        }
        overlay.style.display = 'none';
      }
    });
    sheet?.addEventListener('click', e => e.stopPropagation());

    overlay.querySelector('#daSetupAddPerson')?.addEventListener('click', () => {
      const name = overlay.querySelector('#daSetupPersonName')?.value?.trim();
      const type = overlay.querySelector('#daSetupPersonType')?.value || 'friend';
      if (!name) { DA.toast('请填写姓名'); return; }
      keyPeople.push({ name, type });
      overlay.querySelector('#daSetupPersonName').value = '';
      renderPeople();
    });

    overlay.querySelector('#daSetupDemo')?.addEventListener('click', async () => {
      const r = await DA.enableDemoSetup();
      if (r.success) {
        await refreshTrainingSetupState();
        overlay.style.display = 'none';
        renderGuideHub();
        renderHomeTraining(document.getElementById('p0'));
        DA.toast('已进入演示模式');
      }
    });

    overlay.querySelector('#daSetupSubmit')?.addEventListener('click', async () => {
      const name = overlay.querySelector('#daSetupName')?.value?.trim();
      if (!name) { DA.toast('请填写您的称呼', 'error'); overlay.querySelector('#daSetupName')?.focus(); return; }
      if (!setupAvatarPreset) { DA.toast('请选择分身形象', 'error'); return; }
      const av = window.DAAvatar?.presetPayload(setupAvatarPreset) || {};
      trainingSetupCache = {
        mode: 'self',
        subject_name: name,
        trainer_name: name,
        trainer_role: 'self',
        subject_brief: overlay.querySelector('#daSetupBrief')?.value?.trim() || '',
        key_people: keyPeople,
        ...av
      };
      await finishSetup(overlay);
    });

    setTimeout(() => overlay.querySelector('#daSetupName')?.focus(), 80);
  }

  async function finishSetup(overlay) {
    const payload = {
      mode: 'self',
      subject_name: trainingSetupCache.subject_name,
      subject_brief: trainingSetupCache.subject_brief || '',
      trainer_name: trainingSetupCache.trainer_name || trainingSetupCache.subject_name,
      trainer_role: 'self',
      key_people: trainingSetupCache.key_people || [],
      subject_gender: trainingSetupCache.subject_gender || '',
      avatar_preset: trainingSetupCache.avatar_preset || '',
      setup_complete: true
    };
    const btn = overlay?.querySelector('#daSetupSubmit');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    const r = await DA.saveTrainingSetup(payload);
    if (btn) { btn.disabled = false; btn.textContent = '开始 7 日训练'; }
    if (!r.success) { DA.toast(r.error || '保存失败', 'error'); return; }
    if (!r.data?.setup_complete) {
      DA.toast('设定未生效，请确认已填写称呼', 'error');
      return;
    }
    await refreshTrainingSetupState();
    overlay.style.display = 'none';
    await renderGuideHub();
    if (path.includes('sanctuary') || path.includes('training')) renderHomeTraining(document.getElementById('p0'));
    updateTrainingUiGate();
    DA.toast('欢迎，' + (payload.subject_name || '') + '！可以开始情境答题了');
  }

  async function refreshProgress(root) {
    const data = await DA.loadProgress();
    DA.applyProgress(data, root || document);
    return data;
  }

  function ensureGuideBar(page) {
    let bar = page.querySelector('.da-guide-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'da-guide-bar card-w';
      bar.style.cssText = 'margin:0 24px 12px;padding:14px 16px;';
      const anchor = page.querySelector('.da-subhead') || page.querySelector('.pc');
      if (page.querySelector('.da-subhead')) page.querySelector('.da-subhead').after(bar);
      else anchor?.prepend(bar);
    }
    return bar;
  }

  function guideDayLabel(t) {
    if (!t) return '';
    if (t.rotation) return `巩固训练 · 轮播题`;
    return `第 ${t.day} 天 · ${t.day_title || '训练引导'}`;
  }

  const MOD_ICON = {
    voice: { icon: 'settings_voice', cls: 'da-mod-voice' },
    memory: { icon: 'history_edu', cls: 'da-mod-memory' },
    relationship: { icon: 'diversity_3', cls: 'da-mod-relationship' },
    emotion: { icon: 'favorite', cls: 'da-mod-emotion' },
    cognition: { icon: 'bolt', cls: 'da-mod-cognition' }
  };

  function modIconHtml(module) {
    const m = MOD_ICON[module] || MOD_ICON.memory;
    return `<div class="da-guide-module-icon ${m.cls}"><span class="mi">${m.icon}</span></div>`;
  }

  function guideSkipNoteHtml() {
    return `<p class="da-skip-note t-body-sm" style="color:#767872;margin:8px 0 0;">针对<strong>上面这个情境</strong>想不起来？点「没印象，跳过」会换<strong>下一道训练题</strong>（可能是别的场景），进度照常推进，以后可回来补。</p>`;
  }

  function appendGuideSkipBar(bar, module, afterSkip) {
    if (!bar || bar.querySelector('.da-guide-skip-bar')) return;
    const wrap = document.createElement('div');
    wrap.className = 'da-guide-skip-bar';
    wrap.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center;';
    wrap.innerHTML = `<button type="button" class="btn-o da-module-skip">没印象，跳过</button>`;
    bar.appendChild(wrap);
    wrap.querySelector('.da-module-skip')?.addEventListener('click', async () => {
      const btn = wrap.querySelector('.da-module-skip');
      btn.disabled = true;
      btn.textContent = '跳过中…';
      const result = await DA.skipGuideTask({ module });
      btn.disabled = false;
      btn.textContent = '没印象，跳过';
      if (result?.ok && afterSkip) await afterSkip(result);
    });
  }

  /** 教练层：默认隐藏，轮播题不展示 */
  function renderCoachBlock(t) {
    if (t?.rotation || !t?.purpose) return '';
    if (!t?.purpose && !t?.steps?.length) return '';
    let html = '<div class="da-coach">';
    if (t.coach_headline) html += `<p class="t-label" style="margin-bottom:8px;">${t.coach_headline}</p>`;
    if (t.purpose) html += `<p class="da-coach-purpose"><strong>为什么做这题：</strong>${t.purpose}</p>`;
    if (t.steps?.length) {
      html += '<p class="t-label" style="margin-bottom:4px;">怎么答</p><ol class="da-coach-steps">';
      t.steps.forEach(s => { html += `<li>${s}</li>`; });
      html += '</ol>';
    }
    if (t.example) html += `<p class="t-body-sm" style="margin-bottom:6px;"><strong>示例：</strong><em style="color:#596059;">${t.example}</em></p>`;
    if (t.avoid) html += `<p class="t-body-sm" style="color:#7a5c3a;"><span class="mi" style="font-size:14px;vertical-align:middle;">warning</span> 避免：${t.avoid}</p>`;
    if (t.cta) html += `<p class="t-label" style="margin-top:10px;color:#596059;">${t.cta}</p>`;
    html += '</div>';
    return html;
  }

  function moduleDayMeta(t) {
    if (!t) return '';
    if (t.rotation) return '巩固训练';
    return t.day ? `第 ${t.day} 天` : '';
  }

  function fillModuleChoices(container, items, onPick) {
    if (!container) return;
    container.innerHTML = '';
    items.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';
      btn.innerHTML = `<p class="t-body-sm">${typeof item === 'string' ? item : item.text}</p>`;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.choice').forEach(x => x.classList.remove('selected'));
        btn.classList.add('selected');
        onPick(item, i, btn);
      });
      container.appendChild(btn);
    });
  }

  function renderModuleV2Page(module, page, t) {
    page.querySelector('.da-guide-bar')?.remove();
    const meta = page.querySelector('.da-mod-v2-meta');
    const q = page.querySelector('.da-mod-v2-q');
    const input = page.querySelector('.da-mod-v2-input:not(.da-mod-v2-voice-fallback)');
    const actions = page.querySelector('.da-mod-v2-actions');
    if (meta) {
      if (!meta.dataset.label) meta.dataset.label = meta.textContent.trim();
      const day = moduleDayMeta(t);
      meta.textContent = day ? `${day} · ${meta.dataset.label}` : meta.dataset.label;
    }

    if (t.setup_required) {
      if (q) q.textContent = '请先完成身份设定 · 点下方「提交」去填写称呼';
      page.dataset.blocked = 'setup';
      return;
    }
    if (t.all_done || t.locked) {
      if (q) q.textContent = t.message || '本题已完成';
      page.dataset.blocked = 'done';
      return;
    }
    delete page.dataset.blocked;

    if (module === 'voice') {
      const lit = t.literary_text || t.title || '用你平常的语气读一段话';
      const qEl = page.querySelector('.da-voice-text');
      if (qEl) qEl.textContent = lit;
      const fb = page.querySelector('.da-mod-v2-voice-fallback');
      if (fb) { fb.value = ''; fb.placeholder = '没麦克风？把要读的话贴在这里'; }
    }

    if (module === 'memory') {
      if (q) q.textContent = t.prompt || '回忆一帧画面';
      const ta = page.querySelector('.da-mem-input');
      if (ta) ta.value = '';
      page._memQueueCount = 0;
      const queue = page.querySelector('.da-mod-v2-queue');
      const list = page.querySelector('.da-mod-queue-list');
      const n = page.querySelector('.da-mod-queue-n');
      if (queue) queue.hidden = true;
      if (list) list.innerHTML = '';
      if (n) n.textContent = '0';
    }

    if (module === 'relationship') {
      if (q) q.textContent = t.scene || t.scenario || '关系场景';
      const ta = page.querySelector('.da-rel-input');
      if (ta) ta.value = '';
      page.dataset.relType = 'emotional';
      fillModuleChoices(page.querySelector('.da-rel-dynamic-choices'), t.choices || [], (c) => {
        if (ta) ta.value = c.text || '';
        page.dataset.relType = c.type || 'emotional';
        ta.focus();
      });
    }

    if (module === 'emotion') {
      if (q) q.textContent = t.scenario || '情绪场景';
      const ta = page.querySelector('.da-emo-input');
      if (ta) ta.value = '';
    }

    if (module === 'cognition') {
      const qEl = page.querySelector('.da-cog-question');
      const optHost = page.querySelector('.da-cog-options');
      const note = page.querySelector('.da-cog-note');
      const submit = page.querySelector('.da-mod-submit');
      const vague = page.querySelector('.da-mod-vague');
      const rankExtra = page.querySelector('.da-cog-rank-extra');
      if (t.question && t.options?.length) {
        if (qEl) qEl.textContent = t.question;
        fillModuleChoices(optHost, t.options, () => {});
        if (note) note.hidden = true;
        if (submit) { submit.hidden = true; submit.textContent = '提交'; }
        if (vague) vague.hidden = true;
        if (rankExtra) rankExtra.hidden = true;
      } else {
        if (qEl) qEl.textContent = t.question || '你更看重什么？';
        if (optHost) optHost.innerHTML = '';
        if (note) note.hidden = true;
        if (submit) { submit.hidden = false; submit.textContent = '提交排序'; }
        if (vague) vague.hidden = true;
        if (rankExtra) rankExtra.hidden = false;
        wireDragRows(page.querySelector('.da-cog-drag-host'));
      }
    }

    DA.setGuideTask(t);
  }

  async function applyModuleGuide(module) {
    const pageMap = { voice: 'p2', memory: 'p3', relationship: 'p4', emotion: 'p5', cognition: 'p6' };
    const page = document.getElementById(pageMap[module]);
    if (!page) return;
    const r = await DA.fetchModuleGuide(module);
    if (!r.success) {
      const q = page.querySelector('.da-mod-v2-q');
      if (q) q.textContent = r.error || '加载失败，请重试';
      return;
    }
    renderModuleV2Page(module, page, r.data);
  }

  async function afterGuideAction(module, opts = {}) {
    await DA.refreshGuideState(module);
    await refreshProgress();
    if (module && !opts.uiRendered) await applyModuleGuide(module);
    await renderGuideHub();
    if (typeof window.daReloadHomeGuided === 'function') await window.daReloadHomeGuided();
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function renderTrainingDashboard(p1) {
    const host = p1?.querySelector('.da-training-dashboard');
    if (!host) return;
    const r = await DA.fetchTrainingDashboard();
    if (!r.success) return;
    const d = r.data;
    const status = d.twin_status || {};
    const layersRing = (d.layers || []).map(l =>
      `<div class="da-dash-layer" title="${escHtml(l.short)}">
        <span class="da-dash-layer-label">${l.label.replace('层', '')}</span>
        <div class="da-dash-layer-ring" style="--pct:${l.progress_pct}"><span>${l.progress_pct}%</span></div>
      </div>`
    ).join('');
    const mods = (d.modules || []).map(m =>
      `<div class="da-dash-mod">
        <span class="da-dash-mod-label">${m.label}</span>
        <div class="pbar-wrap" style="max-width:none;height:4px;"><div class="pbar-fill" style="width:${m.progress_pct}%"></div></div>
        <span class="da-dash-mod-pct">${m.progress_pct}%</span>
      </div>`
    ).join('');
    const recent = (d.recent_changes || []).map(e =>
      `<li>${escHtml(e.summary || e.changes?.[0] || '已更新')}</li>`
    ).join('') || '<li class="da-dash-empty">完成训练或试聊校准后，这里会显示数字人的变化</li>';
    host.innerHTML = `
      <div class="da-dash-status chip ${status.id === 'published' ? 'chip-s' : 'chip-g'}">${status.label || '训练中'}</div>
      <p class="da-dash-fit"><span class="da-dash-fit-num">${d.personality_fit_pct ?? d.layer_quality_pct ?? 0}%</span> 层质量 · 题库 ${d.module_completion_pct ?? '—'}% · ${d.version || 'v0.1'}</p>
      ${d.core_layer_blocked ? '<p class="t-body-sm" style="color:#b45309;margin:8px 0;">核心层未建立：请先完成价值卡片排序游戏。</p>' : ''}
      <div class="da-dash-layers-ring">${layersRing}</div>
      <p class="t-body-sm da-dash-suggest"><strong>今日建议：</strong>${d.today_suggestion || ''}</p>
      <p class="t-label" style="margin:12px 0 6px;">训练采集进度（为各层供料）</p>
      <div class="da-dash-modules">${mods}</div>
      <p class="t-label" style="margin:14px 0 8px;">最近更新</p>
      <ul class="da-dash-recent">${recent}</ul>
      ${d.next_recommended?.page ? `<button type="button" class="btn-o da-dash-next" style="margin-top:12px;">下一步 · ${d.next_recommended.label}</button>` : ''}`;
    host.querySelector('.da-dash-next')?.addEventListener('click', () => {
      if (d.next_recommended?.page) window.go(d.next_recommended.page);
    });
    const hero = p1.querySelector('.da-overall-progress .hero-pct');
    if (hero) {
      hero.textContent = (d.personality_fit_pct ?? 0) + '%';
      hero.classList.remove('da-pct-pending');
    }
    const bar = p1.querySelector('.da-overall-progress .pbar-fill');
    if (bar) bar.style.width = (d.personality_fit_pct ?? 0) + '%';
    const stage = p1.querySelector('.da-stage-name');
    if (stage) stage.textContent = status.label || '训练中';
  }

  const HUB_MODS = [
    { key: 'voice', page: 2, icon: 'settings_voice', label: '音色' },
    { key: 'memory', page: 3, icon: 'history_edu', label: '记忆' },
    { key: 'relationship', page: 4, icon: 'diversity_3', label: '关系' },
    { key: 'emotion', page: 5, icon: 'favorite', label: '情感' },
    { key: 'cognition', page: 6, icon: 'bolt', label: '认知' }
  ];

  function hubDegradeNote() {
    return '进度同步中，可先点下方模块答题';
  }

  function hubModuleRowsHtml(prog) {
    const modPct = k => Math.round((prog?.modules?.[k]?.progress ?? 0) * 100);
    return HUB_MODS.map(m =>
      `<button type="button" class="module-row da-mod-${m.key}" data-page="${m.page}" data-module="${m.key}">
        <div class="icon-pill"><span class="mi mi-sm">${m.icon}</span></div>
        <div class="da-mod-text"><strong>${m.label}</strong><small>专项训练</small></div>
        <span class="da-mod-pct">${modPct(m.key)}%</span>
        <span class="mi mi-sm da-mod-chevron">chevron_right</span>
      </button>`
    ).join('');
  }

  function wireHubModuleNav(host) {
    host.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => window.go(Number(btn.dataset.page)));
    });
    host.querySelector('.da-retry-hub')?.addEventListener('click', () => renderGuideHub());
  }

  function defaultHubProgress() {
    const modules = {};
    HUB_MODS.forEach(m => { modules[m.key] = { progress: 0 }; });
    return { personality_fit: 0, overall_progress: 0, modules };
  }

  function normalizeHubGuide(guideR) {
    const raw = guideR?.success && guideR.data ? guideR.data : null;
    if (raw?.setup_required) return { g: raw, degraded: false };
    if (raw && !raw.error && !raw.degraded) return { g: raw, degraded: false };
    const g = raw && typeof raw === 'object' ? { ...raw } : {};
    return {
      degraded: true,
      g: {
        setup_required: false,
        subject_name: g.subject_name,
        progress: g.progress || { completed: 0, total: 0, ratio: 0 },
        today: g.today || { day_title: '今日训练', tasks: [], next: null },
        current_day: g.current_day || 1,
        phase: g.phase || 'initial_7day'
      }
    };
  }

  function renderHubShell({ overall, g, p, nextPage, degraded }) {
    const dayLine = g.phase === 'consolidation' ? '巩固期' : `第 ${g.current_day || 1} 天`;
    const syncNote = degraded ? `<p class="da-hub-sync">${hubDegradeNote()}</p>` : '';
    const cta = nextPage
      ? `<button type="button" class="btn-p da-hub-cta" data-page="${nextPage}">继续答题</button>`
      : '';

    return `
      <div class="da-hub-card da-overall-progress">
        ${syncNote}
        <div class="da-hub-progress-head">
          <span class="t-label">分身完成度</span>
          <span class="hero-pct">${overall}%</span>
        </div>
        <div class="pbar-wrap da-hub-pbar"><div class="pbar-fill" style="width:${overall}%"></div></div>
        <p class="da-hub-meta">${dayLine} · 今日 ${g.progress?.completed || 0}/${g.progress?.total || 0}</p>
        ${cta}
        ${degraded ? '<button type="button" class="btn-o da-retry-hub da-hub-refresh">刷新</button>' : ''}
      </div>
      <div class="da-hub-mod-list da-module-list">${hubModuleRowsHtml(p)}</div>`;
  }

  async function renderGuideHub() {
    const host = document.querySelector('.da-training-hub-host');
    if (!host) return;
    host.innerHTML = '<div class="da-empty-card da-hub-loading"><span class="mi">hourglass_empty</span><p>加载训练总览…</p></div>';

    const slowTimer = setTimeout(() => {
      if (!host.querySelector('.da-hub-loading')) return;
      const p = defaultHubProgress();
      host.innerHTML = renderHubShell({
        overall: 0, g: { current_day: 1, progress: { completed: 0, total: 0 } },
        p, nextPage: 3, degraded: true
      });
      wireHubModuleNav(host);
    }, 6000);

    let guideR;
    let prog = null;
    const progPromise = typeof DA.loadProgress === 'function'
      ? DA.loadProgress().catch(() => null)
      : Promise.resolve(null);
    try {
      [guideR, prog] = await Promise.all([DA.fetchGuideOverview(), progPromise]);
    } catch {
      guideR = { success: false };
    }
    clearTimeout(slowTimer);

    const { g, degraded } = normalizeHubGuide(guideR);
    if (g.setup_required) {
      host.innerHTML = `<div class="da-hub-card da-empty-card">
        <span class="mi">face_3</span>
        <p style="font-weight:600;margin:8px 0">先填写称呼</p>
        <p class="t-body-sm">填写后即可开始训练</p>
        <button type="button" class="da-btn-primary" id="daOpenSetup" style="margin-top:14px;width:100%">开始设定</button>
      </div>`;
      host.querySelector('#daOpenSetup')?.addEventListener('click', showTrainingSetupWizard);
      return;
    }

    const p = prog || defaultHubProgress();
    const overall = Math.round((p.personality_fit ?? p.overall_progress ?? g.progress?.ratio ?? 0) * 100);
    const today = g.today || {};
    const m2p = { voice: 2, memory: 3, relationship: 4, emotion: 5, cognition: 6 };
    const nextPage = today.next?.module_page || m2p[today.tasks?.find(t => !t.done)?.module] || 0;
    host.innerHTML = renderHubShell({ overall, g, p, nextPage, degraded });
    wireHubModuleNav(host);
    if (typeof DA.applyProgress === 'function') DA.applyProgress(p, host);
  }

  const MODULE_BY_PAGE = { 2: 'voice', 3: 'memory', 4: 'relationship', 5: 'emotion', 6: 'cognition' };

  function onTrainingPage(i) {
    if (i === 1) renderGuideHub();
    if (MODULE_BY_PAGE[i]) applyModuleGuide(MODULE_BY_PAGE[i]);
  }

  function wireDragRows(container) {
    if (!container || container.dataset.dragWired) return;
    container.dataset.dragWired = '1';
    const rows = [...container.querySelectorAll('.drag-row')];
    rows.forEach(row => {
      row.draggable = true;
      row.addEventListener('dragstart', e => {
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', rows.indexOf(row));
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      row.addEventListener('drop', e => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        const to = rows.indexOf(row);
        if (from === to || from < 0) return;
        const parent = container;
        const dragged = rows[from];
        if (from < to) parent.insertBefore(dragged, rows[to].nextSibling);
        else parent.insertBefore(dragged, rows[to]);
        rows.splice(from, 1);
        rows.splice(to, 0, dragged);
      });
    });
  }

  async function ensureGuideTask(module) {
    let gt = DA.getGuideTask();
    if (!gt?.task_id || gt.module !== module) {
      const gr = await DA.fetchModuleGuide(module);
      gt = gr.data || gt;
    }
    return gt;
  }

  function wireTrainingPages(onProgress) {
    const refresh = () => (onProgress ? onProgress() : refreshProgress());
    const afterSubmit = async (module) => afterGuideAction(module);

    document.querySelectorAll('.da-module-v2').forEach(page => {
      if (page.dataset.v2Wired) return;
      page.dataset.v2Wired = '1';
      const module = page.dataset.module;
      const mic = page.querySelector('.mic-record');
      if (mic) mic.addEventListener('click', () => DA.toggleRecord(mic));

      page.querySelector('.da-mod-skip')?.addEventListener('click', async () => {
        if (page.dataset.blocked === 'setup') { showTrainingSetupWizard(); return; }
        if (page.dataset.blocked === 'done') return;
        const btn = page.querySelector('.da-mod-skip');
        if (btn) { btn.disabled = true; btn.textContent = '跳过中…'; }
        const result = await DA.skipGuideTask({ module });
        if (btn) { btn.disabled = false; btn.textContent = '没印象，跳过'; }
        if (!result?.ok) return;
        if (result.next) renderModuleV2Page(module, page, result.next);
        await afterGuideAction(module, { uiRendered: !!result.next });
      });

      page.querySelector('.da-mod-vague')?.addEventListener('click', async () => {
        if (page.dataset.blocked === 'setup') { showTrainingSetupWizard(); return; }
        if (page.dataset.blocked === 'done') return;
        const gt = await ensureGuideTask(module);
        if (module === 'memory') {
          const ta = page.querySelector('.da-mem-input');
          const { success, data } = await DA.api('POST', '/training/memory', {
            impression_only: true,
            content: ta?.value?.trim() || '',
            task_id: gt?.task_id
          });
          if (success) { DA.applyGuideAdvanceFromResponse?.(data, 'memory'); await afterSubmit('memory'); }
          return;
        }
        if (module === 'relationship') {
          const ta = page.querySelector('.da-rel-input');
          const text = ta?.value?.trim() || '[有印象但说不清]';
          if (await DA.submitRelationship(page.dataset.relType || 'emotional', text)) await afterSubmit('relationship');
          return;
        }
        if (module === 'emotion') {
          const ta = page.querySelector('.da-emo-input');
          const text = ta?.value?.trim() || '[有印象但说不清]';
          if (await DA.submitEmotion(text)) await afterSubmit('emotion');
          return;
        }
        if (module === 'voice') {
          const fb = page.querySelector('.da-mod-v2-voice-fallback');
          const text = fb?.value?.trim() || page.querySelector('.da-voice-text')?.textContent?.trim() || '有印象';
          if (await DA.submitVoice(text)) await afterSubmit('voice');
        }
      });

      page.querySelector('.da-mod-submit')?.addEventListener('click', async () => {
        if (page.dataset.blocked === 'setup') { showTrainingSetupWizard(); return; }
        if (page.dataset.blocked === 'done') return;
        if (module === 'voice') {
          const fb = page.querySelector('.da-mod-v2-voice-fallback')?.value?.trim();
          const text = fb || page.querySelector('.da-voice-text')?.textContent?.trim() || '';
          if (!text) { DA.toast('可贴文字或点「有印象」「跳过」', 'error'); return; }
          if (await DA.submitVoice(text)) await afterSubmit('voice');
          return;
        }
        if (module === 'memory') {
          const ta = page.querySelector('.da-mem-input');
          if (!ta?.value?.trim()) { DA.toast('写几个字，或点「有印象」「跳过」', 'error'); return; }
          const people = document.getElementById('daMemPeople')?.value?.split(/[,，]/).map(s => s.trim()).filter(Boolean);
          const extras = page._collectMemoryExtras?.() || {};
          const text = ta.value.trim();
          if (await DA.submitMemory(text, {
            tier: 'daily',
            save_only: true,
            time: document.getElementById('daMemTime')?.value,
            place: document.getElementById('daMemPlace')?.value,
            people,
            emotion: document.getElementById('daMemEmotion')?.value,
            tags: extras.tags,
            photos: extras.photos
          })) {
            page._memQueueCount = (page._memQueueCount || 0) + 1;
            const queue = page.querySelector('.da-mod-v2-queue');
            const list = page.querySelector('.da-mod-queue-list');
            const n = page.querySelector('.da-mod-queue-n');
            if (queue) queue.hidden = false;
            if (n) n.textContent = String(page._memQueueCount);
            if (list) {
              const li = document.createElement('li');
              li.textContent = text.slice(0, 60) + (text.length > 60 ? '…' : '');
              list.appendChild(li);
            }
            ta.value = '';
            delete page.dataset.memPhoto;
          }
          return;
        }
        if (module === 'relationship') {
          const ta = page.querySelector('.da-rel-input');
          const content = ta?.value?.trim();
          if (!content) { DA.toast('写几句，或点「有印象」「跳过」', 'error'); return; }
          if (await DA.submitRelationship(page.dataset.relType || 'emotional', content)) await afterSubmit('relationship');
          return;
        }
        if (module === 'emotion') {
          const ta = page.querySelector('.da-emo-input');
          if (!ta?.value?.trim()) { DA.toast('写几句，或点「有印象」「跳过」', 'error'); return; }
          if (await DA.submitEmotion(ta.value)) { ta.value = ''; await afterSubmit('emotion'); }
          return;
        }
        if (module === 'cognition') {
          const values = [...page.querySelectorAll('.da-cog-drag-host .drag-row .t-body')].map(el => el.textContent.trim());
          if (await DA.submitCognition(values)) await afterSubmit('cognition');
        }
      });

      page.querySelector('.da-mod-add-another')?.addEventListener('click', () => {
        page.querySelector('.da-mem-input')?.focus();
        DA.toast('写完点「提交」，结束本题点「下一题」');
      });
      page.querySelector('.da-mod-next')?.addEventListener('click', async () => {
        const gt = await ensureGuideTask('memory');
        if (gt?.task_id) {
          await DA.api('POST', '/training/guide/complete', { task_id: gt.task_id, module: 'memory' });
        }
        await afterSubmit('memory');
      });

      if (module === 'cognition') {
        const optHost = page.querySelector('.da-cog-options');
        optHost?.addEventListener('click', async (e) => {
          const btn = e.target.closest('.choice');
          if (!btn) return;
          const gt = await ensureGuideTask('cognition');
          const idx = [...optHost.querySelectorAll('.choice')].indexOf(btn);
          const opt = gt?.options?.[idx];
          if (!gt?.task_id || !opt) return;
          const r2 = await DA.submitHomeTraining({ module: 'cognition', task_id: gt.task_id, content: opt, choice_index: idx });
          if (r2.success) { DA.toast(r2.data?.feedback || '已提交'); await afterSubmit('cognition'); }
        });
        wireDragRows(page.querySelector('.da-cog-drag-host'));
        page.querySelector('.da-cog-rank-submit')?.addEventListener('click', async () => {
          const values = [...page.querySelectorAll('.da-cog-drag-host .drag-row .t-body')].map(el => el.textContent.trim());
          if (await DA.submitCognition(values)) await afterSubmit('cognition');
        });
      }
    });

    const p3 = document.getElementById('p3');
    wireMemoryTagsAndPhoto(p3, p3?.querySelector('.da-mem-input'));

    refreshProgress().then(data => {
      if (!data?.blind_test?.ready) return;
      const host = document.querySelector('.da-overall-progress') || document.getElementById('p1')?.querySelector('.card-w');
      if (!host || host.querySelector('.da-blind-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-o da-blind-btn';
      btn.style.marginTop = '12px';
      btn.textContent = `发起盲测 (${Math.round(data.blind_test.next_milestone * 100)}%)`;
      btn.onclick = async () => {
        const r = await DA.api('POST', '/training/blind-tests/start', {
          milestone: data.blind_test.next_milestone,
          tester_name: '关系人'
        });
        if (r.success) {
          const score = prompt('关系人评分 1-10：', '8');
          if (score) {
            const sub = await DA.api('POST', '/training/blind-tests/submit', {
              session_id: r.data.id, score: Number(score)
            });
            DA.toast(sub.data?.passed ? '盲测通过' : '盲测未通过，请继续训练');
            refresh();
          }
        }
      };
      host.appendChild(btn);
    });
  }

  function wireProfileRows() {
    window.DAProfile?.installProfilePage?.();
    window.DAProfile?.installTopbar?.();
  }

  function wireChatPage(pageEl, opts) {
    const input = pageEl.querySelector('input[type="text"]');
    if (!input) return;
    let box = pageEl.querySelector('.da-chat-msgs');
    if (!box) {
      box = document.createElement('div');
      box.className = 'da-chat-msgs' + (opts.messageCards ? ' da-msg-cards' : '');
      input.closest('div[style*="width:100%"]')?.parentElement?.insertBefore(box, input.closest('div[style*="width:100%"]'));
      if (!box.parentElement) pageEl.querySelector('.pc')?.prepend(box) || pageEl.insertBefore(box, pageEl.firstChild);
    } else if (opts.messageCards) {
      box.classList.add('da-msg-cards');
    }
    const inputWrap = input.closest('div[style*="width:100%"]') || input.parentElement;
    const sendIcon = inputWrap?.querySelector('.mi-f, .mi[style*="send"]');
    sendIcon?.addEventListener('click', () => DA.sendChat(input, box, opts));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') DA.sendChat(input, box, opts);
    });
    pageEl.querySelector('.mic-record, button[style*="70px"]')?.addEventListener('click', () => {
      DA.startVoiceInput(input, box, opts);
    });

    pageEl.querySelectorAll('.btn-o, .btn-p').forEach(btn => {
      const t = btn.textContent.trim();
      if (t === '不像我') btn.onclick = () => lastFeedback(false);
      else if (t === '很像我') btn.onclick = () => lastFeedback(true);
      else if (t === '有点像') btn.onclick = () => lastPartialFeedback();
    });

    function lastPartialFeedback() {
      const last = [...DA.chatHistory].reverse().find(m => m.role === 'assistant' && !m.pending);
      if (last) DA.sendPartialFeedback(last.id);
    }

    function lastFeedback(like) {
      const last = [...DA.chatHistory].reverse().find(m => m.role === 'assistant' && !m.pending);
      if (!last) return;
      if (like) DA.sendFeedback(true, last.id);
      else DA.promptFeedbackCorrection(false, last.id, false);
    }
  }

  function initCompanionConsent() {
    const overlay = document.getElementById('daConsentOverlay');
    if (!overlay) return Promise.resolve(true);

    const uid = DA.getCompanionUserId();
    if (uid) {
      return DA.api('GET', '/companion/access?user_id=' + encodeURIComponent(uid)).then(r => {
        if (r.success && r.data?.allowed) {
          if (r.data.avatar_label) {
            const b = document.getElementById('daAvatarBadge');
            if (b) b.textContent = r.data.avatar_label;
          }
          return true;
        }
        DA.setCompanionUserId(null);
        return showConsentForm();
      }).catch(() => showConsentForm());
    }
    return showConsentForm();

    function showConsentForm() {
      return new Promise(resolve => {
        overlay.style.display = 'flex';
        overlay.classList.add('on');
        DA.api('GET', '/ethics/consent-text').then(r => {
          const c = r.data || {};
          overlay.innerHTML = `<div class="da-consent-card">
            <h2>${c.title || '使用前请知晓'}</h2>
            <p>${c.body || ''}</p>
            <input type="text" id="daConsentName" placeholder="请输入您的姓名（需与训练者授权一致）"/>
            <label><input type="checkbox" id="daConsentCheck"/> ${c.checkbox || '我理解这是数字分身'}</label>
            <button type="button" class="primary" id="daConsentBtn" disabled>进入陪护端</button>
          </div>`;
          const check = overlay.querySelector('#daConsentCheck');
          const btn = overlay.querySelector('#daConsentBtn');
          check?.addEventListener('change', () => { btn.disabled = !check.checked; });
          btn?.addEventListener('click', async () => {
            const name = overlay.querySelector('#daConsentName')?.value?.trim();
            if (!name) { DA.toast('请输入姓名', 'error'); return; }
            const idRes = await DA.api('POST', '/companion/identify', { name });
            if (!idRes.success) { DA.toast(idRes.error || '未授权', 'error'); return; }
            const cons = await DA.api('POST', '/companion/consent', {
              user_id: idRes.data.user_id, user_name: name, accepted: true
            });
            if (!cons.success) { DA.toast(cons.error || '同意失败', 'error'); return; }
            DA.setCompanionUserId(idRes.data.user_id);
            overlay.style.display = 'none';
            overlay.classList.remove('on');
            const b = document.getElementById('daAvatarBadge');
            if (b) b.textContent = c.avatar_label || '数字分身';
            resolve(true);
          });
        });
      });
    }
  }

  function initTrainingEthics() {
    const p1 = document.getElementById('p1');
    if (path.includes('training') && p1 && !p1.querySelector('.da-light-panel')) {
      const panel = document.createElement('div');
      panel.className = 'da-light-panel';
      panel.innerHTML = `
        <p class="t-body" style="font-weight:600;margin-bottom:8px;">随手记</p>
        <p class="t-body-sm" style="margin-bottom:8px;">不必正式，一行字、一段语音的想法都可以。</p>
        <textarea id="daLightNote" placeholder="现在想到的一件事…"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button type="button" class="btn-p" id="daLightSave" style="flex:1;padding:10px;border:none;border-radius:99px;background:#596059;color:#fff;">保存随手记</button>
          <button type="button" class="btn-o" id="daStopToday" style="flex:1;padding:10px;">今天到此为止</button>
        </div>`;
      p1.querySelector('.pc')?.appendChild(panel);
      panel.querySelector('#daLightSave')?.addEventListener('click', async () => {
        const v = document.getElementById('daLightNote')?.value;
        if (await DA.submitLightweightNote(v)) {
          document.getElementById('daLightNote').value = '';
          refreshProgress();
        }
      });
      panel.querySelector('#daStopToday')?.addEventListener('click', () => DA.stopTrainingForToday());
    }

    const p7 = document.getElementById('p7');
    if (p7 && !p7.querySelector('.da-ethics-panel') && path.includes('training')) {
      const ep = document.createElement('div');
      ep.className = 'da-ethics-panel card-w';
      ep.innerHTML = `
        <p class="t-body" style="font-weight:600;">隐私与授权</p>
        <input type="text" id="daTraineeName" placeholder="训练者显示名"/>
        <button type="button" class="btn-o" id="daReSetup" style="margin-bottom:8px;">修改我的基本信息</button>
        <input type="text" id="daAuthName" placeholder="新增授权关系人姓名"/>
        <input type="text" id="daAuthRel" placeholder="关系（如 子女、配偶）"/>
        <button type="button" class="btn-p" id="daAddAuth" style="padding:10px;border:none;border-radius:99px;background:#596059;color:#fff;">添加授权</button>
        <div id="daAuthList" class="t-body-sm"></div>
        <hr style="border:none;border-top:1px solid #ece7e2;margin:8px 0;"/>
        <p class="t-body-sm">哀伤淡出：随时间自动降低主动频率</p>
        <textarea id="daRitualText" rows="3" placeholder="完成仪式告别语（可选）"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn-o" id="daSaveGrief">保存淡出设置</button>
          <button type="button" class="btn-o" id="daSeal">封存数字分身</button>
        </div>`;
      p7.querySelector('.pc')?.appendChild(ep);

      async function refreshAuth() {
        const r = await DA.api('GET', '/ethics/authorization');
        const list = document.getElementById('daAuthList');
        if (list && r.success) {
          list.innerHTML = r.data.length
            ? r.data.map(u => `${u.name}（${u.relationship || '家人'}）${u.authorized ? '' : ' [已撤销]'}
              <button type="button" data-revoke="${u.id}" style="font-size:11px;margin-left:6px;">撤销</button>`).join('<br/>')
            : '暂无授权对象，请先添加';
          list.querySelectorAll('[data-revoke]').forEach(b => {
            b.onclick = async () => {
              await DA.api('DELETE', '/ethics/authorization/' + b.dataset.revoke);
              refreshAuth();
            };
          });
        }
        const g = await DA.api('GET', '/ethics/grief-mode');
        if (g.success) {
          document.getElementById('daRitualText').value = g.data.config?.completion_ritual_text || '';
        }
      }

      document.getElementById('daReSetup')?.addEventListener('click', () => showTrainingSetupWizard());

      document.getElementById('daAddAuth')?.addEventListener('click', async () => {
        const name = document.getElementById('daAuthName')?.value?.trim();
        if (!name) return;
        await DA.api('POST', '/ethics/authorization', {
          name,
          relationship: document.getElementById('daAuthRel')?.value || '家人',
          trainee_display_name: document.getElementById('daTraineeName')?.value
        });
        document.getElementById('daAuthName').value = '';
        refreshAuth();
      });

      document.getElementById('daSaveGrief')?.addEventListener('click', async () => {
        await DA.api('POST', '/ethics/grief-mode', {
          completion_ritual_text: document.getElementById('daRitualText')?.value
        });
        DA.toast('淡出设置已保存');
      });

      document.getElementById('daSeal')?.addEventListener('click', async () => {
        if (!confirm('封存后陪护端将无法对话，确定吗？')) return;
        await DA.api('POST', '/ethics/grief-mode/seal');
        DA.toast('已封存');
      });

      refreshAuth();
    }
  }

  function initTraining() {
    DA.injectAppMenu('训练端');
    initTrainingEthics();
    wireProfileRows();
    window.DAProfile?.installTopbar?.();
    window.DAProfile?.installProfilePage?.();
    const origGo = window.go;
    window.go = wrapGo(origGo, i => {
      if (i === 0 && (path.includes('sanctuary') || path.includes('training'))) {
        renderHomeTraining(document.getElementById('p0'));
      }
      if (i === 1 || i === 7) refreshProgress();
      if (i === 7) window.DAProfile?.refreshProfilePage?.();
      onTrainingPage(i);
    });
    installNavChrome(typeof cur !== 'undefined' ? cur : 0);

    if (path.includes('sanctuary') || path.includes('training')) {
      renderHomeTraining(document.getElementById('p0'));
    } else {
      wireChatPage(document.getElementById('p0'), {
        feedback: true,
        noTts: true,
        onSetupRequired: showTrainingSetupWizard,
        onPad: (pad) => {
          const chips = document.querySelectorAll('#p0 .chip');
          DA.padToChips(pad, chips);
        }
      });
    }

    refreshTrainingSetupState().then(() => {
      wireModuleRowsGate();
      if (!trainingSetupReady) setTimeout(showTrainingSetupWizard, 300);
      refreshProgress().then(() => {
        renderGuideHub();
        if (typeof cur !== 'undefined' && MODULE_BY_PAGE[cur]) applyModuleGuide(MODULE_BY_PAGE[cur]);
      });
      if (trainingSetupReady) {
        DA.api('GET', '/companion/greeting').then(d => {
          if (d.success && d.data?.text) {
            DA.chatHistory.push({ role: 'assistant', content: d.data.text, id: 'g0' });
            const box = document.querySelector('#p0 .da-chat-msgs');
            if (box) DA.renderChat(box, true);
          }
        }).catch(() => {});
      }
    });
    wireTrainingPages(refreshProgress);
    window.daShowSetup = showTrainingSetupWizard;

    const target = sessionStorage.getItem('da_training_page');
    if (target) {
      sessionStorage.removeItem('da_training_page');
      const n = Number(target);
      if (n >= 2 && n <= 6) {
        refreshTrainingSetupState().then(() => {
          if (trainingSetupReady) window.go(n);
          else showTrainingSetupWizard();
        });
      }
    }
  }

  /** 主页：引导训练 + 自由聊天双模式（与专项页共享 task_id） */
  let homeMode = 'ingest';

  async function renderHomeTraining(p0) {
    if (!p0) return;
    p0.removeAttribute('aria-busy');
    let shell = p0.querySelector('.da-home-shell');
    if (!shell) {
      const inner = p0.querySelector('[style*="flex:1"]') || p0;
      shell = document.createElement('div');
      shell.className = 'da-home-shell';
      inner.innerHTML = '';
      inner.appendChild(shell);
      shell.innerHTML = `
        <div class="da-home-hero">
          <div class="da-home-hero-orb">
            <div class="da-home-hero-ring" style="--pct:0"></div>
            <div class="breathing"></div>
            <img class="da-stick-avatar" data-da-stick src="/assets/avatars/stick-duo-source.png" alt="数字分身"/>
          </div>
          <p class="da-home-hero-hint">点击形象可更换</p>
          <p class="da-home-hero-title da-home-subject">数字分身</p>
          <p class="da-home-hero-sub da-home-tagline">随手记一句话，最快让分身像你</p>
        </div>
        <div class="da-segment da-segment--triple" role="tablist" aria-label="主页训练方式">
          <button type="button" class="da-segment-btn da-home-tab-guided" role="tab" aria-selected="false"><span class="mi">playlist_add_check</span><span class="da-segment-label">情境答题</span></button>
          <button type="button" class="da-segment-btn on da-home-tab-ingest" role="tab" aria-selected="true"><span class="mi">sticky_note_2</span><span class="da-segment-label">随手记</span></button>
          <button type="button" class="da-segment-btn da-home-tab-chat" role="tab" aria-selected="false"><span class="mi">forum</span><span class="da-segment-label">试聊</span></button>
        </div>
        <div class="da-home-ingest-wrap">
          <textarea id="daDirectIngestNote" class="da-home-note-input" rows="4" placeholder="写一句习惯或事实…"></textarea>
          <button type="button" class="btn-p" id="daDirectIngestSave" style="width:100%;margin-top:10px">保存</button>
        </div>
        <div class="da-home-guided" style="display:none"></div>
        <div class="da-home-chat-wrap" style="display:none;">
          <div class="da-chat-msgs da-msg-cards"></div>
          <div class="da-caps-mount" style="display:none;"></div>
          <div class="da-chat-input-wrap">
            <input type="text" class="da-home-chat-input" placeholder="说点什么，看分身怎么回…"/>
            <button type="button" class="da-home-send" aria-label="发送"><span class="mi">send</span></button>
          </div>
        </div>`;
      shell.querySelector('.da-home-tab-guided').onclick = () => setHomeMode('guided');
      shell.querySelector('.da-home-tab-chat').onclick = () => setHomeMode('chat');
      const ingestTab = shell.querySelector('.da-home-tab-ingest');
      if (ingestTab) ingestTab.onclick = () => setHomeMode('ingest');
      shell.querySelector('#daDirectIngestSave')?.addEventListener('click', async () => {
        const ta = shell.querySelector('#daDirectIngestNote');
        const v = ta?.value;
        if (!v) { DA.toast('请填写内容'); return; }
        const r = await DA.api('POST', '/training/lightweight-note', { content: v });
        if (r.success) {
          DA.toast('内容已保存，将作为日常习惯记住。');
          ta.value = '';
        } else DA.toast('保存失败', 'error');
      });
      const chatInput = shell.querySelector('.da-home-chat-input');
      const chatBox = shell.querySelector('.da-chat-msgs');
      const capsMount = shell.querySelector('.da-caps-mount');
      const chatOpts = {
        feedback: true, noTts: true, messageCards: true,
        aiName: shell.querySelector('.da-home-subject')?.textContent || '数字分身',
        onSetupRequired: showTrainingSetupWizard,
        onCaps: caps => {
          if (!capsMount) return;
          if (caps?.layer_explanation) {
            capsMount.style.display = 'block';
            capsMount.innerHTML = `<p class="t-body-sm" style="padding:8px 0;color:#596059;">本轮五层加工见<strong>每条回复下方</strong>的「为什么这样回应」。</p>`;
          } else {
            DA.renderCapsPanel(caps, capsMount);
          }
        }
      };
      shell.querySelector('.da-home-send')?.addEventListener('click', () => DA.sendChat(chatInput, chatBox, chatOpts));
      chatInput?.addEventListener('keydown', e => { if (e.key === 'Enter') DA.sendChat(chatInput, chatBox, chatOpts); });
      const heroOrb = shell.querySelector('.da-home-hero-orb');
      if (heroOrb && !heroOrb.dataset.avatarWired) {
        heroOrb.dataset.avatarWired = '1';
        heroOrb.classList.add('da-hero-tappable');
        heroOrb.tabIndex = 0;
        heroOrb.setAttribute('role', 'button');
        heroOrb.setAttribute('aria-label', '更换分身形象');
        heroOrb.addEventListener('click', () => openAvatarPicker());
        heroOrb.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAvatarPicker(); }
        });
      }
    }

    applyHomeHeroAvatar();

    async function refreshHeroMeta(g) {
      const data = await DA.loadProgress();
      const overall = data?.personality_fit ?? data?.overall_progress ?? g?.progress?.ratio ?? 0;
      const pct = Math.round(overall * 100);
      const ring = shell.querySelector('.da-home-hero-ring');
      if (ring) ring.style.setProperty('--pct', pct);
      const subj = shell.querySelector('.da-home-subject');
      if (subj && g?.subject_name) subj.textContent = g.subject_name;
      applyHomeHeroAvatar();
      const tag = shell.querySelector('.da-home-tagline');
      if (tag) {
        const fit = pct > 0 ? `拟合 ${pct}%` : '';
        if (g?.task_id) {
          const task = [fit, g.module_label || '情境答题', g.day ? `第 ${g.day} 天` : ''].filter(Boolean).join(' · ');
          tag.textContent = task;
        } else if (g?.progress?.ratio >= 1) {
          tag.textContent = fit ? `${fit} · 本轮题库已完成` : '本轮题库已完成，可试聊或做五模块专项';
        } else if (g?.message && g.message !== '可继续答题、试聊或随手记') {
          tag.textContent = fit ? `${fit} · ${g.message}` : g.message;
        } else {
          tag.textContent = fit || '随手记一句话，最快让分身像你';
        }
      }
    }

    async function setHomeMode(mode) {
      homeMode = mode;
      const tabGuided = shell.querySelector('.da-home-tab-guided');
      const tabChat = shell.querySelector('.da-home-tab-chat');
      const tabIngest = shell.querySelector('.da-home-tab-ingest');
      tabGuided?.classList.toggle('on', mode === 'guided');
      tabChat?.classList.toggle('on', mode === 'chat');
      tabIngest?.classList.toggle('on', mode === 'ingest');
      tabGuided?.setAttribute('aria-selected', mode === 'guided' ? 'true' : 'false');
      tabChat?.setAttribute('aria-selected', mode === 'chat' ? 'true' : 'false');
      tabIngest?.setAttribute('aria-selected', mode === 'ingest' ? 'true' : 'false');
      const guidedEl = shell.querySelector('.da-home-guided');
      const chatEl = shell.querySelector('.da-home-chat-wrap');
      const iw = shell.querySelector('.da-home-ingest-wrap');
      if (guidedEl) {
        guidedEl.style.display = mode === 'guided' ? 'flex' : 'none';
        guidedEl.classList.toggle('da-home-panel-on', mode === 'guided');
      }
      if (chatEl) {
        chatEl.style.display = mode === 'chat' ? 'flex' : 'none';
        chatEl.classList.toggle('da-home-panel-on', mode === 'chat');
      }
      if (iw) iw.style.display = mode === 'ingest' ? 'block' : 'none';
      if (mode === 'ingest') {
        requestAnimationFrame(() => shell.querySelector('.da-home-note-input')?.focus());
      } else if (mode === 'guided') {
        await loadGuided();
      }
    }

    function renderGuidedError(host, message) {
      host.innerHTML = `<div class="da-empty-card">
        <span class="mi">wifi_off</span>
        <p style="font-weight:600;color:#1c1c18;margin-bottom:8px;">题目加载失败</p>
        <p>${message || '无法连接电脑上的数字方舟服务'}</p>
        <button type="button" class="da-btn-primary da-retry-guided" style="margin-top:14px;">重试</button>
        <button type="button" class="btn-o da-open-setup-retry" style="margin-top:8px;width:100%;">填写基本信息</button>
      </div>`;
      host.querySelector('.da-retry-guided')?.addEventListener('click', () => loadGuided());
      host.querySelector('.da-open-setup-retry')?.addEventListener('click', showTrainingSetupWizard);
    }

    async function loadGuided() {
      const host = shell.querySelector('.da-home-guided');
      if (!host) return;
      host.innerHTML = '<div class="da-empty-card"><span class="mi">hourglass_empty</span><p>加载中…</p></div>';
      const r = await DA.fetchHomeTraining();
      if (!r.success) {
        renderGuidedError(host, r.error || '请检查电脑是否保持 Digital-Ark-Server 窗口打开');
        return;
      }
      const g = r.data;
      refreshHeroMeta(g).catch(() => {});

      if (g.setup_required) {
        host.innerHTML = `<div class="da-empty-card">
          <span class="mi">face_3</span>
          <p style="font-weight:600;color:#1c1c18;margin-bottom:8px;">先填写您的称呼</p>
          <p>${g.message || '创建数字分身后即可开始情境答题与试聊。'}</p>
          <button type="button" class="da-btn-primary da-open-setup" style="margin-top:16px;">填写基本信息</button></div>`;
        host.querySelector('.da-open-setup')?.addEventListener('click', showTrainingSetupWizard);
        return;
      }
      if (!g.task_id) {
        const done = g.progress?.completed ?? 0;
        const reallyDone = done > 0 && String(g.message || '').includes('初训已完成');
        if (reallyDone) {
          host.innerHTML = `<div class="da-empty-card">
            <span class="mi">celebration</span>
            <p>${g.message}</p>
            <p style="margin-top:8px;font-size:13px;">可切到「试聊」感受分身，或打开底部「训练」做巩固题。</p></div>`;
        } else {
          host.innerHTML = `<div class="da-empty-card">
            <span class="mi">edit_note</span>
            <p style="font-weight:600;color:#1c1c18;margin-bottom:8px;">${g.message || '还没有情境题'}</p>
            <p style="margin-top:8px;font-size:13px;color:#767872;">点下面按钮去训练页答题，或刷新重试。</p>
            <button type="button" class="da-btn-primary da-go-training" style="margin-top:14px;">去训练页答题</button>
            <button type="button" class="btn-o da-retry-guided" style="margin-top:8px;width:100%;">刷新题目</button></div>`;
          host.querySelector('.da-go-training')?.addEventListener('click', () => window.go(1));
          host.querySelector('.da-retry-guided')?.addEventListener('click', () => loadGuided());
        }
        return;
      }

      const hp = g.home_prompt || {};
      let choicesHtml = '';
      if (hp.choices?.length) {
        choicesHtml = `<div class="da-guide-choices">${hp.choices.map((c, i) =>
          `<button type="button" class="choice da-home-choice" data-i="${i}" data-type="${c.type}" data-text="${c.text.replace(/"/g, '&quot;')}">
            <p class="t-body-sm" style="color:#1c1c18;">${c.text}</p></button>`).join('')}</div>`;
      }
      if (hp.options?.length) {
        choicesHtml = `<div class="da-guide-choices">${hp.options.map((o, i) =>
          `<button type="button" class="choice da-home-cog" data-i="${i}"><p class="t-body-sm">${o}</p></button>`).join('')}</div>`;
      }

      const showTextSubmit = hp.input_type !== 'voice' && hp.input_type !== 'cognition_choice';
      const inputBlock = showTextSubmit ? `
        <textarea class="da-home-answer" rows="4" placeholder="随便写，碎片也行"></textarea>
        <div class="da-guide-actions-v2">
          <button type="button" class="da-btn-primary da-home-submit">提交</button>
          <button type="button" class="btn-o da-home-vague">有印象</button>
          <button type="button" class="btn-o da-home-skip">跳过</button>
        </div>` : '';
      const cognitionBlock = hp.input_type === 'cognition_choice' ? `
        <div class="da-guide-actions-v2" style="margin-top:10px;">
          <button type="button" class="btn-o da-home-skip" style="grid-column:1/-1;">跳过</button>
        </div>` : '';
      const voiceBlock = hp.input_type === 'voice' ? `
        <div class="da-guide-actions-v2">
          <button type="button" class="da-btn-primary da-home-voice-text">提交文字</button>
          <button type="button" class="btn-o da-home-skip">跳过</button>
          <button type="button" class="btn-o da-go-voice">去录音</button>
        </div>` : '';
      const hintFold = hp.hint ? `<details class="da-guide-hint-fold"><summary>需要提示？</summary><p>${hp.hint}</p></details>` : '';

      host.innerHTML = `
        <article class="da-guide-card-v2">
          <p class="da-guide-meta-v2">第 ${g.day} 天 · ${g.module_label}</p>
          <h2 class="da-guide-q-v2">${hp.ask || hp.headline || g.day_title || '训练'}</h2>
          ${hp.literary_text ? `<blockquote class="da-guide-quote">${hp.literary_text}</blockquote>` : ''}
          ${choicesHtml}
          ${inputBlock}
          ${cognitionBlock}
          ${voiceBlock}
          ${hintFold}
        </article>`;

      let selectedChoice = null;
      host.querySelectorAll('.da-home-choice').forEach(btn => {
        btn.onclick = () => {
          host.querySelectorAll('.da-home-choice').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedChoice = { index: Number(btn.dataset.i), type: btn.dataset.type, text: btn.dataset.text };
          const ta = host.querySelector('.da-home-answer');
          if (ta) ta.value = btn.dataset.text;
        };
      });
      host.querySelectorAll('.da-home-cog').forEach(btn => {
        btn.onclick = async () => {
          host.querySelectorAll('.da-home-cog').forEach(b => { b.disabled = true; });
          const r2 = await DA.submitHomeTraining({
            module: g.module, task_id: g.task_id,
            content: hp.options[Number(btn.dataset.i)], choice_index: Number(btn.dataset.i)
          });
          host.querySelectorAll('.da-home-cog').forEach(b => { b.disabled = false; });
          if (r2.success) {
            DA.toast(r2.data?.feedback || '已提交，进入下一题');
            await afterGuideAction(g.module);
          } else DA.toast(r2.error || '提交失败', 'error');
        };
      });
      host.querySelectorAll('.da-home-skip').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const prev = btn.textContent;
          btn.textContent = '跳过中…';
          const result = await DA.skipGuideTask({ module: g.module, task_id: g.task_id });
          btn.disabled = false;
          btn.textContent = prev;
          if (result?.ok) await afterGuideAction(g.module);
        });
      });

      host.querySelector('.da-home-submit')?.addEventListener('click', async () => {
        const content = host.querySelector('.da-home-answer')?.value?.trim();
        if (!content) { DA.toast('写几个字，或点「有印象」「跳过」', 'error'); return; }
        const btn = host.querySelector('.da-home-submit');
        btn.disabled = true;
        const r2 = await DA.submitHomeTraining({
          module: g.module, task_id: g.task_id, content,
          response_type: selectedChoice?.type, choice_index: selectedChoice?.index
        });
        btn.disabled = false;
        if (r2.success) { DA.toast(r2.data?.feedback || '已提交'); await afterGuideAction(g.module); }
        else DA.toast(r2.error || '提交失败', 'error');
      });
      host.querySelector('.da-home-vague')?.addEventListener('click', async () => {
        const content = host.querySelector('.da-home-answer')?.value?.trim() || '';
        if (g.module === 'memory') {
          const r2 = await DA.api('POST', '/training/memory', { impression_only: true, content, task_id: g.task_id });
          if (r2.success) { DA.toast(r2.data?.feedback || '已记下模糊印象'); await afterGuideAction(g.module); }
          else DA.toast(r2.error || '提交失败', 'error');
          return;
        }
        const r2 = await DA.submitHomeTraining({
          module: g.module, task_id: g.task_id,
          content: content || '[有印象但说不清]', skipped: false
        });
        if (r2.success) await afterGuideAction(g.module);
      });
      host.querySelector('.da-go-voice')?.addEventListener('click', () => {
        sessionStorage.setItem('da_training_page', String(g.module_page || 2));
        window.go(2);
      });
      host.querySelector('.da-home-voice-text')?.addEventListener('click', async () => {
        const text = hp.literary_text?.replace(/^[（(][^）)]*[）)]\s*/, '') || hp.literary_text || '';
        DA.setGuideTask(g);
        const btn = host.querySelector('.da-home-voice-text');
        btn.disabled = true;
        btn.textContent = '提交中…';
        if (await DA.submitVoice(text.replace(/^["「]|["」]$/g, ''))) {
          await afterGuideAction('voice');
        }
        btn.disabled = false;
        btn.innerHTML = '提交朗读文字<span class="da-voice-text-sub">无麦克风可先跳过录音</span>';
      });
      host.querySelector('.da-go-module')?.addEventListener('click', () => {
        sessionStorage.setItem('da_training_page', String(g.module_page || 3));
        window.go(g.module_page || 3);
      });
      DA.setGuideTask(g);
    }

    window.daReloadHomeGuided = loadGuided;
    await setHomeMode(homeMode);
  }

  function hideP1StaticPlaceholders() {
    const p1 = document.getElementById('p1');
    if (!p1) return;
    p1.querySelector('.da-p1-static-hero')?.classList.add('da-p1-static-hidden');
    p1.querySelector('.card[style*="flex-direction:column"]')?.classList.add('da-p1-static-hidden');
    p1.querySelector('.card-w .t-label + span[style*="Noto"]')?.closest('.card-w')?.classList.add('da-p1-static-hidden');
    p1.querySelector('div[style*="grid-template-columns:1fr 1fr 1fr"]')?.classList.add('da-p1-static-hidden');
    p1.querySelector('input[placeholder*="测试数字人"]')?.closest('div')?.classList.add('da-p1-static-hidden');
  }

  function initSanctuary() {
    if (window.matchMedia('(max-width: 640px), (hover: none) and (pointer: coarse)').matches) {
      document.documentElement.classList.add('da-native');
      document.body.classList.add('da-native-mobile');
    }
    DA.injectAppMenu('数字方舟');
    initTrainingEthics();
    wireProfileRows();
    window.DAProfile?.installTopbar?.();
    window.DAProfile?.installProfilePage?.();
    const origGo = window.go;
    window.go = wrapGo(origGo, i => {
      if (i === 0) renderHomeTraining(document.getElementById('p0'));
      if (i === 1 || i === 7) refreshProgress();
      if (i === 7) window.DAProfile?.refreshProfilePage?.();
      onTrainingPage(i);
    });
    installNavChrome(typeof cur !== 'undefined' ? cur : 0);

    renderHomeTraining(document.getElementById('p0'));
    renderGuideHub();

    refreshTrainingSetupState().then(() => {
      wireModuleRowsGate();
      if (!trainingSetupReady) setTimeout(showTrainingSetupWizard, 300);
      refreshProgress().then(() => {
        renderGuideHub();
        if (typeof cur !== 'undefined' && MODULE_BY_PAGE[cur]) applyModuleGuide(MODULE_BY_PAGE[cur]);
      });
    });
    wireTrainingPages(refreshProgress);
    window.daShowSetup = showTrainingSetupWizard;

    DA.api('GET', '/companion/greeting').then(d => {
      if (!trainingSetupReady) return;
      if (d.success) {
        DA.chatHistory.push({ role: 'assistant', content: d.data.text, id: 'g0' });
        const box = document.querySelector('#p0 .da-chat-msgs');
        if (box) DA.renderChat(box, false);
      }
    }).catch(() => {});
  }

  function initCompanion() {
    DA.injectAppMenu('陪护端');
    window.DAProfile?.installTopbar?.();
    DA.companionMode = 'normal';

    initCompanionConsent().then(ok => {
      if (!ok) return;

    wireChatPage(document.getElementById('p0'), {
      companion: true,
      messageCards: true,
      aiName: '数字分身',
      onArchive: (msg) => {
        const type = window.prompt('归档到训练模块：memory / relationship / emotion', 'memory');
        if (type && ['memory', 'relationship', 'emotion'].includes(type)) DA.archiveMessage(msg, type);
      },
      onAccessDenied: () => initCompanionConsent()
    });


    DA.loadCompanionStatus().then(res => {
      if (!res.success) return;
      const av = res.data.digital_avatar;
      const settings = res.data.companion_settings || {};
      const card = p1?.querySelector('.card-w:not(.da-companion-settings)');
      if (card) {
        card.querySelector('.t-body')?.replaceChildren(document.createTextNode('数字分身 · ' + av.name));
        card.querySelector('.t-body-sm').textContent =
          `关系 Lv.${av.relationship_level} · 拟合度 ${Math.round(av.personality_fit * 100)}% · ${av.mood}`;
      }
      const g = document.getElementById('daAutoGreeting');
      const f = document.getElementById('daGreetingFreq');
      const qs = document.getElementById('daQuietStart');
      const qe = document.getElementById('daQuietEnd');
      if (g) g.checked = settings.auto_greeting !== false;
      if (f) f.value = settings.greeting_frequency || 'medium';
      if (qs) qs.value = settings.quiet_hours?.start || '23:00';
      if (qe) qe.value = settings.quiet_hours?.end || '08:00';
    });

    // 主动问候轮询
    setInterval(async () => {
      const uid = DA.getCompanionUserId();
      if (!uid) return;
      const d = await DA.api('GET', '/companion/greeting?companion_user_id=' + encodeURIComponent(uid));
      if (d.success && d.data?.text) {
        const box = document.querySelector('#p0 .da-chat-msgs');
        if (box) {
          DA.chatHistory.push({ role: 'assistant', content: d.data.text, id: 'g' + Date.now() });
          DA.renderChat(box, false, { messageCards: true, aiName: '数字分身', onArchive: (msg) => {
            const type = window.prompt('归档到训练模块：memory / relationship / emotion', 'memory');
            if (type && ['memory', 'relationship', 'emotion'].includes(type)) DA.archiveMessage(msg, type);
          }});
        }
      }
    }, 120000);

    const uid = DA.getCompanionUserId();
    DA.api('GET', '/companion/greeting?companion_user_id=' + encodeURIComponent(uid || '')).then(d => {
      if (d.success) {
        DA.chatHistory.push({ role: 'assistant', content: d.data.text, id: 'g0' });
        const box = document.querySelector('#p0 .da-chat-msgs');
        if (box) DA.renderChat(box, false, { messageCards: true, aiName: '数字分身', onArchive: (msg) => {
          const type = window.prompt('归档到训练模块：memory / relationship / emotion', 'memory');
          if (type && ['memory', 'relationship', 'emotion'].includes(type)) DA.archiveMessage(msg, type);
        }});
      }
    }).catch(() => {});

    }); // initCompanionConsent
  }

  if (path.includes('training')) initTraining();
  else if (path.includes('companion')) initCompanion();
  else if (path.includes('sanctuary')) initSanctuary();
})();
