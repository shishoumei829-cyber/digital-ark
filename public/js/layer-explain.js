'use strict';

/**
 * 五层人格 · 产品外显（每条回复旁「为什么这样回应」）
 */
(function () {
  const LAYER_ICONS = {
    core: 'psychology',
    emotion: 'favorite',
    memory: 'history_edu',
    relationship: 'diversity_3',
    expression: 'record_voice_over'
  };

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderLayerBlock(layer) {
    const icon = LAYER_ICONS[layer.id] || 'layers';
    const pct = layer.influence_pct != null ? `<span class="da-layer-pct">${layer.influence_pct}%</span>` : '';
    return `
      <div class="da-layer-row ${layer.active ? 'active' : ''}">
        <span class="mi da-layer-icon" aria-hidden="true">${icon}</span>
        <div class="da-layer-text">
          <div class="da-layer-head"><strong>${esc(layer.label)}</strong>${pct}</div>
          <p class="da-layer-summary">${esc(layer.summary)}</p>
        </div>
      </div>`;
  }

  function renderExplanation(explanation, opts = {}) {
    if (!explanation?.layers?.length) return '';
    const collapsed = opts.collapsed !== false;
    const id = 'daLex_' + Math.random().toString(36).slice(2, 9);
    const learned = (explanation.learned_from || [])
      .map(s => `<li>${esc(s)}</li>`).join('');
    const tech = explanation.technical_path
      ? `<details class="da-layer-tech"><summary>后台加工路径（CAPS）</summary><p>${esc(explanation.technical_path)}</p></details>`
      : '';

    return `
      <div class="da-layer-explain ${collapsed ? 'collapsed' : 'expanded'}" data-explain-id="${id}">
        <button type="button" class="da-layer-explain-toggle" aria-expanded="${collapsed ? 'false' : 'true'}">
          <span class="mi">account_tree</span>
          <span>为什么这样回应</span>
          <span class="mi da-layer-chevron">expand_more</span>
        </button>
        <div class="da-layer-explain-body" ${collapsed ? 'hidden' : ''}>
          <p class="da-layer-vs">${esc(explanation.vs_generic_ai)}</p>
          <div class="da-layer-stack">${explanation.layers.map(renderLayerBlock).join('')}</div>
          ${learned ? `<p class="da-layer-from-title">它从我哪里学来的</p><ul class="da-layer-from">${learned}</ul>` : ''}
          ${tech}
        </div>
      </div>`;
  }

  function wireExplainToggles(root) {
    if (!root) return;
    root.querySelectorAll('.da-layer-explain-toggle').forEach(btn => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', () => {
        const box = btn.closest('.da-layer-explain');
        const body = box?.querySelector('.da-layer-explain-body');
        if (!box || !body) return;
        const willExpand = box.classList.contains('collapsed');
        box.classList.toggle('collapsed', !willExpand);
        body.hidden = !willExpand;
        btn.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
      });
    });
  }

  function renderProductIntro() {
    return `
      <div class="da-five-layers-intro card-w">
        <p class="t-label">数字分身如何成形</p>
        <p class="t-body-sm da-five-lead">
          下面五个<strong>人格层</strong>共同决定每一句话；音色/记忆/关系/情感/认知训练是在为各层<strong>喂数据</strong>，不是五个互不相关的功能。
        </p>
        <div class="da-five-layer-map">
          <div class="da-five-map-item"><span class="mi">psychology</span><span>核心层</span><small>← 认知训练</small></div>
          <div class="da-five-map-item"><span class="mi">favorite</span><span>情绪层</span><small>← 情感训练</small></div>
          <div class="da-five-map-item"><span class="mi">history_edu</span><span>记忆层</span><small>← 记忆训练</small></div>
          <div class="da-five-map-item"><span class="mi">diversity_3</span><span>关系层</span><small>← 关系训练</small></div>
          <div class="da-five-map-item"><span class="mi">record_voice_over</span><span>表达层</span><small>← 音色训练</small></div>
        </div>
        <p class="t-body-sm" style="color:#767872;margin-top:10px;">
          试聊时展开「为什么这样回应」，可看到每一层本轮如何参与；校准后会写明哪一层被更新。
        </p>
      </div>`;
  }

  window.DALayerExplain = {
    renderExplanation,
    wireExplainToggles,
    renderProductIntro
  };
})();
