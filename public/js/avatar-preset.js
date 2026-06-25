'use strict';

/**
 * 数字分身 · 预设火柴人形象（简版：男 / 女，同源手绘图左右裁切）
 */
(function () {
  const SOURCE = '/assets/avatars/stick-duo-source.png';

  const PRESETS = {
    m: { id: 'm', label: '男', gender: 'male', position: '22% center', scale: 1.55 },
    f: { id: 'f', label: '女', gender: 'female', position: '78% center', scale: 1.55 }
  };

  const DEFAULT_PRESET = 'm';

  function get(id) {
    return PRESETS[id] || PRESETS[DEFAULT_PRESET];
  }

  function resolve(setup) {
    const id = setup?.avatar_preset || (setup?.subject_gender === 'female' ? 'f' : setup?.subject_gender === 'male' ? 'm' : '');
    return get(id || DEFAULT_PRESET);
  }

  function resolveId(setup) {
    return resolve(setup).id;
  }

  function styleFor(presetId) {
    const p = get(presetId);
    return {
      objectFit: 'cover',
      objectPosition: p.position,
      transform: `scale(${p.scale})`
    };
  }

  function applyImg(img, presetId) {
    if (!img) return;
    const p = get(presetId);
    img.src = SOURCE;
    img.alt = `数字分身 · ${p.label}`;
    img.classList.add('da-stick-avatar');
    img.classList.remove('da-stick-avatar--m', 'da-stick-avatar--f');
    img.classList.add(`da-stick-avatar--${p.id}`);
    const st = styleFor(p.id);
    img.style.objectFit = st.objectFit;
    img.style.objectPosition = st.objectPosition;
    img.style.transform = st.transform;
  }

  function applyAll(setup) {
    const id = resolveId(setup);
    document.querySelectorAll('.da-stick-avatar-slot img, .da-home-hero-orb img, img[data-da-stick]').forEach(img => {
      applyImg(img, id);
    });
  }

  function pickerMarkup(selectedId) {
    const sel = selectedId || DEFAULT_PRESET;
    return Object.values(PRESETS).map(p => `
      <button type="button" class="da-avatar-pick${sel === p.id ? ' on' : ''}" data-preset="${p.id}" aria-pressed="${sel === p.id}">
        <span class="da-avatar-pick-preview da-stick-avatar-slot da-stick-avatar-slot--sm">
          <img class="da-stick-avatar da-stick-avatar--${p.id}" src="${SOURCE}" alt=""/>
        </span>
        <span class="da-avatar-pick-label">${p.label}</span>
      </button>`).join('');
  }

  function wirePicker(root, { selectedId, onChange } = {}) {
    if (!root) return;
    let current = selectedId || DEFAULT_PRESET;
    root.querySelectorAll('.da-avatar-pick').forEach(btn => {
      btn.addEventListener('click', () => {
        current = btn.dataset.preset;
        root.querySelectorAll('.da-avatar-pick').forEach(b => {
          const on = b.dataset.preset === current;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        onChange?.(current);
      });
    });
    root.querySelectorAll('.da-avatar-pick-preview img').forEach(img => {
      applyImg(img, img.closest('.da-avatar-pick')?.dataset.preset || DEFAULT_PRESET);
    });
    return () => current;
  }

  function showPickerSheet({ selectedId, onSave } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'da-sheet-overlay on';
    overlay.innerHTML = `
      <div class="da-sheet" role="dialog" aria-modal="true">
        <div class="da-sheet-head">
          <span class="t-section">选择分身形象</span>
          <button type="button" class="da-sheet-close" aria-label="关闭"><span class="mi">close</span></button>
        </div>
        <div class="da-sheet-body">
          <p class="t-body-sm" style="margin-bottom:14px;color:#767872;">先选男或女，以后可再换。</p>
          <div class="da-avatar-pick-row">${pickerMarkup(selectedId)}</div>
          <button type="button" class="btn-p da-avatar-pick-save" style="width:100%;margin-top:18px;">确定</button>
        </div>
      </div>`;
    const getSelected = wirePicker(overlay, { selectedId });
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('.da-sheet-close')) overlay.remove();
    });
    overlay.querySelector('.da-avatar-pick-save')?.addEventListener('click', async () => {
      const id = getSelected();
      await onSave?.(id, get(id));
      overlay.remove();
    });
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.da-avatar-pick-preview img').forEach(img => {
      applyImg(img, img.closest('.da-avatar-pick')?.dataset.preset);
    });
  }

  window.DAAvatar = {
    SOURCE,
    PRESETS,
    DEFAULT_PRESET,
    get,
    resolve,
    resolveId,
    applyImg,
    applyAll,
    pickerMarkup,
    wirePicker,
    showPickerSheet,
    presetPayload(presetId) {
      const p = get(presetId);
      return { avatar_preset: p.id, subject_gender: p.gender };
    }
  };
})();
