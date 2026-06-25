'use strict';

/**
 * 「我的」个人中心 — 顶栏入口 + p7 页面（QQ 式分组菜单）
 */
(function () {
  const DA = window.DA;
  if (!DA) return;

  const AVATAR_KEY = 'da_profile_avatar';
  let lastSetupForAvatar = null;
  const DEFAULT_AVATAR =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuD9CoAWFz6hMRGOhuFmcuf1GHNeVfSH2zLbrtfNdU4txcJclXi6DkYCaPiabLusTHGedU3EHqjNSzSLKEL7CYSvE--n7Mt2-j-72cPi20p5hgWyEUmPgSTsqL_yxGXTSVHpLeSbTwzdqnfEW_gSoUQEg4hv4m8Z2TnmzBebpctdchgCJdYZ-w_h2AcVbzcHPYnotKWOWnaUIaICREgPnS9Og-kq70jW_pn5KNvZkCMymFge4kmsKNRh_Tj3xpG87Qkbno4Tmguh-I7i';

  function getAvatar() {
    try {
      return localStorage.getItem(AVATAR_KEY) || DEFAULT_AVATAR;
    } catch {
      return DEFAULT_AVATAR;
    }
  }

  function setAvatar(url) {
    try {
      if (url) localStorage.setItem(AVATAR_KEY, url);
      else localStorage.removeItem(AVATAR_KEY);
    } catch { /* ignore */ }
    applyAvatarAll();
  }

  function applyAvatarAll() {
    if (window.DAAvatar && lastSetupForAvatar) {
      document.querySelectorAll('.da-profile-avatar-img').forEach(img => {
        window.DAAvatar.applyImg(img, window.DAAvatar.resolveId(lastSetupForAvatar));
      });
      return;
    }
    const url = getAvatar();
    document.querySelectorAll('.da-profile-avatar-img, .topbar-avatar img, .da-topbar-profile img').forEach(img => {
      img.src = url;
    });
  }

  function openProfilePage() {
    if (typeof window.go !== 'function') return;
    if (document.getElementById('p7')) window.go(7);
    else if (document.getElementById('p1')) window.go(1);
    setTimeout(() => refreshProfilePage(), 80);
  }

  function installTopbar() {
    document.querySelectorAll('.topbar').forEach(bar => {
      if (bar.dataset.profileWired) return;
      bar.dataset.profileWired = '1';

      let btn = bar.querySelector('.da-topbar-profile');
      if (!btn) {
        const avatarBox = bar.querySelector(':scope > .topbar-avatar, :scope > .avatar-sm');
        if (avatarBox && !avatarBox.closest('.da-topbar-profile')) {
          btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'da-topbar-profile';
          btn.setAttribute('aria-label', '我的');
          avatarBox.replaceWith(btn);
          btn.appendChild(avatarBox);
          avatarBox.classList.add('topbar-avatar');
          const label = document.createElement('span');
          label.className = 'da-topbar-me-label';
          label.textContent = '我的';
          btn.appendChild(label);
        }
      }
      btn = bar.querySelector('.da-topbar-profile');
      if (btn && !btn.dataset.profileClickWired) {
        btn.dataset.profileClickWired = '1';
        btn.addEventListener('click', e => {
          e.stopPropagation();
          openProfilePage();
        });
      }

      const apps = bar.querySelector('.topbar-apps, .mi[title*="切换"]');
      if (apps && !apps.dataset.menuWired) {
        apps.dataset.menuWired = '1';
        apps.classList.add('topbar-apps');
      }
    });
    applyAvatarAll();
  }

  function sheetHtml(title, bodyHtml) {
    const el = document.createElement('div');
    el.className = 'da-sheet-overlay on';
    el.innerHTML = `
      <div class="da-sheet" role="dialog" aria-modal="true">
        <div class="da-sheet-head">
          <span class="t-section">${title}</span>
          <button type="button" class="da-sheet-close" aria-label="关闭"><span class="mi">close</span></button>
        </div>
        <div class="da-sheet-body t-body-sm">${bodyHtml}</div>
      </div>`;
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('.da-sheet-close')) el.remove();
    });
    document.body.appendChild(el);
    return el;
  }

  function showAbout() {
    sheetHtml('关于数字方舟', `
      <p><strong>数字方舟</strong> 是本地运行的数字分身训练与陪护应用。数据默认保存在本机，不上传云端。</p>
      <p style="margin-top:12px;">版本：1.1.0<br/>训练题库：345 道情境题（五模块）<br/>模式：本人自训 / 代训</p>
      <p style="margin-top:12px;color:#767872;">训练端负责录入人格数据；陪护端供授权亲友试聊。</p>
    `);
  }

  function showHelp() {
    sheetHtml('使用说明', `
      <p><strong>1. 情境答题</strong> — 按题库回答，写入记忆、关系、情感、认知等模块。</p>
      <p style="margin-top:10px;"><strong>2. 试聊</strong> — 像聊天一样测试分身是否像本人，可点「像 / 不像」校准。</p>
      <p style="margin-top:10px;"><strong>3. 随手记</strong> — 快速补充一条习惯或事实，不必走完整题目。</p>
      <p style="margin-top:10px;"><strong>4. 五模块训练</strong> — 底部「训练」进入音色、记忆、关系、情感、认知专项。</p>
      <p style="margin-top:10px;"><strong>5. 我的</strong> — 改头像、基本信息、授权对象、查看进度与说明。</p>
    `);
  }

  function showAuthManagement() {
    const el = sheetHtml('授权管理', `
      <p style="margin-bottom:12px;">添加可在陪护端对话的授权对象。</p>
      <input type="text" id="daSheetAuthName" placeholder="姓名" style="width:100%;padding:10px 12px;border:1px solid #e6e2dc;border-radius:10px;margin-bottom:8px;font-family:inherit;"/>
      <input type="text" id="daSheetAuthRel" placeholder="关系（如 子女、配偶）" style="width:100%;padding:10px 12px;border:1px solid #e6e2dc;border-radius:10px;margin-bottom:10px;font-family:inherit;"/>
      <button type="button" class="btn-p" id="daSheetAddAuth" style="width:100%;margin-bottom:14px;">添加授权</button>
      <div id="daSheetAuthList" class="t-body-sm" style="line-height:1.6;"></div>
    `);
    async function refreshAuth() {
      const r = await DA.api('GET', '/ethics/authorization');
      const list = el.querySelector('#daSheetAuthList');
      if (!list) return;
      if (r.success && r.data.length) {
        list.innerHTML = r.data.map(u => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #ece7e2;">
            <span>${u.name}（${u.relationship || '家人'}）${u.authorized ? '' : ' [已撤销]'}</span>
            ${u.authorized ? `<button type="button" data-revoke="${u.id}" class="btn-o" style="padding:4px 10px;font-size:12px;">撤销</button>` : ''}
          </div>`).join('');
        list.querySelectorAll('[data-revoke]').forEach(b => {
          b.onclick = async () => {
            await DA.api('DELETE', '/ethics/authorization/' + b.dataset.revoke);
            refreshAuth();
          };
        });
      } else {
        list.textContent = '暂无授权对象';
      }
    }
    el.querySelector('#daSheetAddAuth')?.addEventListener('click', async () => {
      const name = el.querySelector('#daSheetAuthName')?.value?.trim();
      if (!name) { DA.toast('请填写姓名'); return; }
      await DA.api('POST', '/ethics/authorization', {
        name,
        relationship: el.querySelector('#daSheetAuthRel')?.value || '家人'
      });
      el.querySelector('#daSheetAuthName').value = '';
      el.querySelector('#daSheetAuthRel').value = '';
      DA.toast('已添加');
      refreshAuth();
    });
    refreshAuth();
  }

  function showPrivacy() {
    sheetHtml('隐私与数据', `
      <p>训练内容用于构建<strong>你的数字分身</strong>，保存在本机数据目录。</p>
      <p style="margin-top:10px;">授权对象经你添加后，才能在陪护端对话；可随时撤销。</p>
      <p style="margin-top:10px;">哀伤淡出：随时间自动降低主动问候频率。</p>
      <textarea id="daSheetRitualText" rows="3" placeholder="完成仪式告别语（可选）" style="width:100%;margin-top:10px;padding:10px;border:1px solid #e6e2dc;border-radius:10px;font-family:inherit;"></textarea>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button type="button" class="btn-o" id="daSheetSaveGrief" style="flex:1;">保存淡出设置</button>
        <button type="button" class="btn-o" id="daSheetSeal" style="flex:1;">封存数字分身</button>
      </div>
      <p style="margin-top:12px;color:#767872;">请勿在训练中输入他人隐私或敏感证件信息。</p>
    `);
    const overlay = document.querySelector('.da-sheet-overlay.on:last-of-type');
    if (!overlay) return;
    DA.api('GET', '/ethics/grief-mode').then(g => {
      if (g.success) {
        const ta = overlay.querySelector('#daSheetRitualText');
        if (ta) ta.value = g.data.config?.completion_ritual_text || '';
      }
    });
    overlay.querySelector('#daSheetSaveGrief')?.addEventListener('click', async () => {
      await DA.api('POST', '/ethics/grief-mode', {
        completion_ritual_text: overlay.querySelector('#daSheetRitualText')?.value
      });
      DA.toast('淡出设置已保存');
    });
    overlay.querySelector('#daSheetSeal')?.addEventListener('click', async () => {
      if (!confirm('封存后陪护端将无法对话，确定吗？')) return;
      await DA.api('POST', '/ethics/grief-mode/seal');
      DA.toast('已封存');
    });
  }

  function pickAvatar() {
    if (window.DAAvatar) {
      window.DAAvatar.showPickerSheet({
        selectedId: window.DAAvatar.resolveId(lastSetupForAvatar),
        onSave: async (id) => {
          const av = window.DAAvatar.presetPayload(id);
          const r = await DA.saveTrainingSetup({
            ...av,
            setup_complete: lastSetupForAvatar?.setup_complete ?? true
          });
          if (!r.success) {
            DA.toast(r.error || '保存失败', 'error');
            return;
          }
          lastSetupForAvatar = r.data;
          applyAvatarAll();
          window.DAAvatar.applyAll(lastSetupForAvatar);
          if (typeof window.daApplyHomeHeroAvatar === 'function') window.daApplyHomeHeroAvatar();
          DA.toast('分身形象已更新');
          refreshProfilePage();
        }
      });
      return;
    }
    let input = document.getElementById('daProfileAvatarInput');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'daProfileAvatarInput';
      input.accept = 'image/*';
      input.hidden = true;
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const f = input.files?.[0];
        input.value = '';
        if (!f) return;
        if (f.size > 3 * 1024 * 1024) {
          DA.toast('图片请小于 3MB', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setAvatar(reader.result);
          DA.toast('头像已更新');
          refreshProfilePage();
        };
        reader.readAsDataURL(f);
      });
    }
    input.click();
  }

  function menuRow(icon, title, desc, action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'module-row da-profile-row';
    btn.innerHTML = `
      <div class="icon-pill"><span class="mi mi-sm">${icon}</span></div>
      <div class="da-mod-text"><strong>${title}</strong><small>${desc}</small></div>
      <span class="mi mi-sm da-mod-chevron">chevron_right</span>`;
    btn.addEventListener('click', action);
    return btn;
  }

  function sectionTitle(text) {
    const h = document.createElement('p');
    h.className = 'da-profile-section-title';
    h.textContent = text;
    return h;
  }

  async function refreshProfilePage() {
    const host = document.querySelector('#p7 .da-profile-host');
    if (!host) return;

    const [setupR, guideR, progR, dashR] = await Promise.all([
      DA.fetchTrainingSetup(),
      DA.api('GET', '/training/guide'),
      DA.loadProgress(),
      DA.fetchTrainingDashboard?.() || Promise.resolve({ success: false })
    ]);

    const setup = setupR.success ? setupR.data : {};
    const guide = guideR.success ? guideR.data : {};
    const prog = progR || {};
    const pct = Math.round((prog.personality_fit ?? prog.overall_progress ?? guide.progress?.ratio ?? 0) * 100);
    const name = setup.subject_name || setup.trainer_name || '未设置';

    host.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'card-w da-profile-head';
    head.innerHTML = `
      <button type="button" class="da-profile-avatar-btn" aria-label="更换分身形象">
        <img class="da-profile-avatar-img da-stick-avatar-slot" src="" alt=""/>
        <span class="da-profile-avatar-edit"><span class="mi">face_retouching_natural</span></span>
      </button>
      <div class="da-profile-head-text">
        <p class="t-body da-profile-name" style="font-weight:600;"></p>
        <p class="t-body-sm da-profile-meta"></p>
        <button type="button" class="btn-o da-profile-edit-setup" style="margin-top:10px;padding:8px 14px;font-size:13px;">编辑资料</button>
      </div>`;
    if (window.DAAvatar) {
      lastSetupForAvatar = setup;
      window.DAAvatar.applyImg(head.querySelector('.da-profile-avatar-img'), window.DAAvatar.resolveId(setup));
    } else {
      head.querySelector('.da-profile-avatar-img').src = getAvatar();
    }
    head.querySelector('.da-profile-name').textContent = name;
    const twinStatus = dashR.success ? dashR.data?.twin_status : null;
    const ver = dashR.success ? dashR.data?.version : '';
    head.querySelector('.da-profile-meta').textContent =
      setup.setup_complete
        ? `${twinStatus?.label || '可试聊'} · 拟合 ${pct}% · ${ver || 'v0.1'}`
        : '请先完成基本信息设定';
    head.querySelector('.da-profile-avatar-btn').onclick = pickAvatar;
    head.querySelector('.da-profile-edit-setup').onclick = () => {
      if (typeof window.daShowSetup === 'function') window.daShowSetup();
      else DA.toast('请从训练页完成设定');
    };
    host.appendChild(head);

    const g2 = document.createElement('div');
    g2.className = 'da-profile-group';
    g2.appendChild(sectionTitle('账号与安全'));
    g2.appendChild(menuRow('face_retouching_natural', '分身形象', '男 / 女 简笔火柴人', pickAvatar));
    g2.appendChild(menuRow('verified_user', '授权管理', '谁可以在陪护端对话', showAuthManagement));
    g2.appendChild(menuRow('inventory_2', '记忆与资料', '上传照片与文字记忆', () => {
      if (typeof window.go === 'function') window.go(3);
      else DA.toast('请打开训练端 → 记忆训练');
    }));
    host.appendChild(g2);

    const g3 = document.createElement('div');
    g3.className = 'da-profile-group';
    g3.appendChild(sectionTitle('通用'));
    g3.appendChild(menuRow('apps', '切换应用', '主应用 / 训练端 / 陪护端', () => {
      if (typeof DA.toggleAppMenu === 'function') DA.toggleAppMenu();
      else DA.toast('请点右上角应用菜单');
    }));
    g3.appendChild(menuRow('help', '使用说明', '情境答题、试聊、五模块怎么用', showHelp));
    g3.appendChild(menuRow('privacy_tip', '隐私与数据', '本地存储、授权与封存', showPrivacy));
    g3.appendChild(menuRow('info', '关于', '版本与产品说明', showAbout));
    host.appendChild(g3);

    applyAvatarAll();
  }

  function installProfilePage() {
    const p7 = document.getElementById('p7');
    if (!p7) return;
    p7.classList.add('da-profile-page');
    const pc = p7.querySelector('.pc') || p7;
    let host = pc.querySelector('.da-profile-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'da-profile-host';
      pc.insertBefore(host, pc.firstChild);
    }
    if (!p7.dataset.profileShell) {
      p7.dataset.profileShell = '1';
      pc.querySelectorAll(':scope > *:not(.da-profile-host):not(.da-ethics-panel)').forEach(n => n.remove());
    }
    refreshProfilePage();
  }

  window.DAProfile = {
    installTopbar,
    installProfilePage,
    refreshProfilePage,
    openProfilePage,
    getAvatar,
    setAvatar,
    applyAvatarAll
  };

  document.addEventListener('DOMContentLoaded', () => {
    installTopbar();
    installProfilePage();
  });
})();
