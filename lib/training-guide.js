'use strict';

const fs = require('fs');
const path = require('path');
const { resolveCurriculum } = require('./curriculum-builder');
const { resolveQuestionBankPath, questionBankFingerprint } = require('./question-bank-loader');
const { enrichFormattedTask, buildTodayChecklist, buildCoachForTask } = require('./guide-coach');

class TrainingGuideEngine {
  constructor(dataDir, repoRoot, deps = {}) {
    this.dataDir = dataDir;
    this.repoRoot = repoRoot || path.join(__dirname, '..');
    this.setupStore = deps.setupStore || null;
    this.statePath = path.join(dataDir, 'training_guide_state.json');
    this.state = this._load();
  }

  _setupFingerprint() {
    if (!this.setupStore) return 'static';
    const s = this.setupStore.get();
    return JSON.stringify({
      complete: s.setup_complete,
      mode: s.mode,
      subject: s.subject_name,
      role: s.trainer_role,
      people: (s.key_people || []).map(p => p.name).join(',')
    });
  }

  _bankFingerprint() {
    return questionBankFingerprint(resolveQuestionBankPath(this.repoRoot));
  }

  _syncSetupGeneration() {
    const fp = this._setupFingerprint();
    const bankFp = this._bankFingerprint();
    const setupChanged = this.state.setup_fingerprint && this.state.setup_fingerprint !== fp;
    const bankChanged = this.state.bank_fingerprint && this.state.bank_fingerprint !== bankFp;
    if (setupChanged || bankChanged) {
      this.state.completed = {};
      this.state.rotation_index = { memory: 0, relationship: 0, emotion: 0, voice: 0, cognition: 0 };
      this.state.started_at = null;
      this.state.persona_id = null;
    }
    this.state.setup_fingerprint = fp;
    this.state.bank_fingerprint = bankFp;
    this._save();
  }

  _load() {
    try {
      if (fs.existsSync(this.statePath)) return JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
    } catch {}
    return {
      persona_id: null,
      started_at: null,
      completed: {},
      setup_fingerprint: null,
      rotation_index: { memory: 0, relationship: 0, emotion: 0, voice: 0, cognition: 0 }
    };
  }

  _save() {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  curriculumPath(personaId) {
    return path.join(this.repoRoot, 'config', 'personas', personaId, 'curriculum-7day.json');
  }

  loadCurriculum(personaId) {
    if (this.setupStore) {
      this._syncSetupGeneration();
      if (!this.setupStore.isComplete()) return null;
      return resolveCurriculum({
        repoRoot: this.repoRoot,
        personaId,
        setupStore: this.setupStore
      });
    }
    const p = this.curriculumPath(personaId);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  needsSetup() {
    return this.setupStore && !this.setupStore.isComplete();
  }

  ensureStarted(personaId) {
    if (!personaId) return;
    const switching = this.state.persona_id != null && this.state.persona_id !== personaId;
    if (switching) {
      this.state.completed = {};
      this.state.rotation_index = { memory: 0, relationship: 0, emotion: 0, voice: 0, cognition: 0 };
      this.state.started_at = Date.now();
      this.state.persona_id = personaId;
      this._save();
      return;
    }
    let dirty = false;
    if (!this.state.persona_id) {
      this.state.persona_id = personaId;
      dirty = true;
    }
    if (!this.state.started_at) {
      this.state.started_at = Date.now();
      dirty = true;
    }
    if (dirty) this._save();
  }

  /** 按完成进度解锁天数（非日历）；全部完成返回 8=巩固期 */
  _hasRotationOnlyCurriculum(curriculum) {
    if (!curriculum) return false;
    const dayTasks = (curriculum.days || []).reduce((n, d) => n + (d.tasks?.length || 0), 0);
    if (dayTasks > 0) return false;
    const pools = curriculum.rotation_pools || {};
    return Object.values(pools).some(p => Array.isArray(p) && p.length > 0);
  }

  _dayTaskCount(curriculum) {
    return (curriculum?.days || []).reduce((n, d) => n + (d.tasks?.length || 0), 0);
  }

  /** 轮播池是否已全部完成（无题可抽） */
  _allRotationTasksDone(curriculum) {
    if (!curriculum) return true;
    for (const mod of ['memory', 'relationship', 'emotion', 'cognition', 'voice']) {
      if (this._pickRotationTask(curriculum, mod)) return false;
    }
    return true;
  }

  _resolvePhase(curriculum, dayIndex) {
    const dayTasks = this._dayTaskCount(curriculum);
    if (dayTasks > 0) {
      return dayIndex >= 8 ? 'consolidation' : 'initial_7day';
    }
    if (this._hasRotationOnlyCurriculum(curriculum)) {
      return this._allRotationTasksDone(curriculum) ? 'consolidation' : 'initial_7day';
    }
    return 'initial_7day';
  }

  getUnlockedDayIndex(personaId) {
    const curriculum = this.loadCurriculum(personaId);
    if (!curriculum?.days?.length) {
      if (this._hasRotationOnlyCurriculum(curriculum)) {
        this.ensureStarted(personaId);
        return this._allRotationTasksDone(curriculum) ? 8 : 4;
      }
      return 1;
    }
    this.ensureStarted(personaId);
    for (let d = 1; d <= 7; d++) {
      const plan = curriculum.days.find(x => x.day === d);
      const tasks = plan?.tasks || [];
      if (!tasks.length) continue;
      const allDone = tasks.every(t => this._isDone(t.id));
      if (!allDone) return d;
    }
    return 8;
  }

  /** @deprecated 保留别名；现以完成度解锁 */
  getCurrentDayIndex(personaId) {
    return this.getUnlockedDayIndex(personaId);
  }

  getDayPlan(personaId, dayIndex) {
    const cur = this.loadCurriculum(personaId);
    if (!cur) return null;
    if (dayIndex >= 1 && dayIndex <= 7) {
      return (cur.days || []).find(d => d.day === dayIndex) || null;
    }
    return { day: 8, title: '巩固训练', summary: '7 日初训已完成，从轮播池抽取新题。', tasks: [] };
  }

  /** 总览加载失败时的安全兜底（进度为 0，仍可进入五模块） */
  _overviewFallback(personaId, message) {
    return {
      persona_id: personaId,
      degraded: true,
      message: message || '总览暂不可用',
      title: '训练引导',
      progress: { completed: 0, total: 0, ratio: 0 },
      days: [],
      today: { intro: '', tasks: [], next: null, day_title: '今日训练' },
      current_day: 1,
      phase: 'initial_7day',
      unlock_mode: 'completion'
    };
  }

  _isDone(taskId) {
    return !!this.state.completed[taskId];
  }

  markComplete(taskId, meta = {}) {
    this.state.completed[taskId] = { at: Date.now(), ...meta };
    const mod = meta.module;
    if (mod && (meta.rotation || String(taskId || '').startsWith('rot_'))) {
      const cur = this.state.rotation_index[mod] || 0;
      this.state.rotation_index[mod] = cur + 1;
    }
    this._save();
  }

  /** 已完成/跳过的引导题清单（用户数据审查） */
  listCompletedTasks(personaId) {
    const curriculum = this.loadCurriculum(personaId);
    const items = [];
    for (const [taskId, meta] of Object.entries(this.state.completed || {})) {
      const raw = this._findRawTask(curriculum, taskId);
      items.push({
        task_id: taskId,
        module: meta.module || raw?.module || null,
        day: raw?.day ?? null,
        skipped: !!meta.skipped,
        skip_reason: meta.skip_reason || null,
        completed_at: meta.at || null,
        summary: raw?.prompt || raw?.scene || raw?.question || raw?.scenario || taskId
      });
    }
    items.sort((a, b) => (b.completed_at || 0) - (a.completed_at || 0));
    return items;
  }

  _tasksForModule(dayPlan, module) {
    return (dayPlan?.tasks || []).filter(t => t.module === module);
  }

  _rotationItemAt(pool, idx, module) {
    const item = pool[idx];
    if (typeof item === 'string') {
      if (module === 'memory') return { id: `rot_mem_${idx}`, module, tier: 'daily', prompt: item, rotation: true };
      if (module === 'emotion') return { id: `rot_emo_${idx}`, module, scenario: item, rotation: true };
      return { id: `rot_${module}_${idx}`, module, scene: item, rotation: true };
    }
    const base = { ...item, module: item.module || module, rotation: true };
    const id = item.id || `rot_${module}_${idx}`;
    if (module === 'memory') {
      return { id, module, tier: item.tier || 'daily', prompt: item.prompt, hint: item.hint, suggested_tags: item.suggested_tags, rotation: true };
    }
    if (module === 'relationship') {
      return {
        id,
        module,
        category: item.category,
        scene: item.scene,
        scene_detail: item.scene_detail,
        choices: item.choices,
        person_name: item.person_name,
        rotation: true
      };
    }
    if (module === 'emotion') {
      return { id, module, scenario: item.scenario, hint: item.hint, purpose: item.purpose, rotation: true };
    }
    if (module === 'cognition') {
      return {
        id,
        module,
        conflict_id: item.conflict_id,
        question: item.question,
        options: item.options,
        rotation: true
      };
    }
    if (module === 'voice') {
      return { id, module, literary_text: item.literary_text, hint: item.hint, title: item.title || '声音样本', rotation: true };
    }
    return { ...base, id };
  }

  _rotationPool(curriculum, module, subKey) {
    const pools = curriculum.rotation_pools || {};
    if (module === 'relationship' && subKey) return pools[`relationship_${subKey}`] || pools[module];
    return pools[module];
  }

  /** 取下一道未完成的轮播题（只读，不推进索引；推进在 markComplete） */
  _pickRotationTask(curriculum, module, subKey) {
    const pool = this._rotationPool(curriculum, module, subKey);
    if (!pool?.length) return null;
    const start = this.state.rotation_index[module] || 0;
    for (let offset = 0; offset < pool.length; offset++) {
      const idx = (start + offset) % pool.length;
      const rot = this._rotationItemAt(pool, idx, module);
      if (rot && !this._isDone(rot.id)) return rot;
    }
    return null;
  }

  _nextRotationTask(curriculum, module, subKey, opts = {}) {
    const advance = opts.advance !== false;
    const pool = this._rotationPool(curriculum, module, subKey);
    if (!pool?.length) return null;
    const idx = (this.state.rotation_index[module] || 0) % pool.length;
    if (advance) {
      this.state.rotation_index[module] = idx + 1;
      this._save();
    }
    return this._rotationItemAt(pool, idx, module);
  }

  /** 预览下一道轮播题，不推进 rotation_index（供提交响应里的 next 展示） */
  peekModuleTask(personaId, module, opts = {}) {
    if (this.needsSetup()) {
      return {
        module,
        setup_required: true,
        message: '请先填写您的称呼，系统才能生成专属题目。'
      };
    }
    const curriculum = this.loadCurriculum(personaId);
    if (!curriculum) {
      return { error: 'no_curriculum', setup_required: true, fallback: true };
    }
    this.ensureStarted(personaId);
    const dayIndex = this.getUnlockedDayIndex(personaId);

    for (let d = 1; d <= Math.min(dayIndex, 7); d++) {
      const plan = this.getDayPlan(personaId, d);
      const tasks = this._tasksForModule(plan, module);
      for (const t of tasks) {
        if (!this._isDone(t.id)) {
          return this._formatTask(t, { day: d, day_title: plan.title, curriculum });
        }
      }
    }

    const rotationOnly = this._hasRotationOnlyCurriculum(curriculum);
    if (dayIndex >= 4 || rotationOnly) {
      const rot = this._pickRotationTask(curriculum, module, opts.relationship_category);
      if (rot) {
        return this._formatTask(rot, { day: Math.min(dayIndex, 7), rotation: true, curriculum });
      }
    }

    const plan = this.getDayPlan(personaId, Math.min(dayIndex, 7));
    return {
      module,
      day: Math.min(dayIndex, 7),
      day_title: plan?.title,
      all_done: true,
      message: '本模块当前周期题目已完成，明天再来看看，或完成其他维度。'
    };
  }

  /**
   * 获取当前模块应展示的训练任务（未完成优先：今日 day → 往日遗漏 → 轮播）
   */
  _setupContext(curriculum) {
    return curriculum?.generated_from || this.setupStore?.contextForCurriculum?.() || {};
  }

  _findRawTask(curriculum, taskId) {
    if (!taskId || !curriculum) return null;
    for (const day of curriculum.days || []) {
      const t = (day.tasks || []).find(x => x.id === taskId);
      if (t) return { ...t, day: day.day };
    }
    for (const [poolKey, pool] of Object.entries(curriculum.rotation_pools || {})) {
      const mod = poolKey.split('_')[0];
      for (const item of pool || []) {
        if (item.id === taskId) {
          return { ...item, module: item.module || mod, rotation: true };
        }
      }
    }
    return null;
  }

  /** 某模块在题库.txt 中的全部题目（7日课表 + 轮播池），供列表/自选入口 */
  listModuleBankTasks(personaId, module) {
    const curriculum = this.loadCurriculum(personaId);
    if (!curriculum) return [];
    const seen = new Set();
    const out = [];

    const push = (task) => {
      if (!task || (task.module || module) !== module) return;
      const id = task.id;
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(this._bankListEntry(task, module));
    };

    for (const day of curriculum.days || []) {
      for (const t of day.tasks || []) push(t);
    }
    const pool = curriculum.rotation_pools?.[module];
    if (Array.isArray(pool)) {
      for (const t of pool) push({ ...t, module: t.module || module });
    }
    return out;
  }

  _bankListEntry(task, module) {
    if (module === 'cognition') {
      const q = task.question || '';
      const short = q.includes('若遇到：') ? q.split('若遇到：').pop() : q;
      return {
        id: task.conflict_id || task.id,
        task_id: task.id,
        text: short,
        question: q,
        options: task.options || [],
        conflict_id: task.conflict_id
      };
    }
    if (module === 'memory') {
      return { id: task.id, task_id: task.id, text: task.prompt, prompt: task.prompt, tier: task.tier, tags: task.suggested_tags };
    }
    if (module === 'relationship') {
      return { id: task.id, task_id: task.id, text: task.scene, scene: task.scene, scene_detail: task.scene_detail, category: task.category };
    }
    if (module === 'emotion') {
      return { id: task.id, task_id: task.id, text: task.scenario, scenario: task.scenario, hint: task.hint };
    }
    if (module === 'voice') {
      return { id: task.id, task_id: task.id, text: task.literary_text, literary_text: task.literary_text };
    }
    return { id: task.id, task_id: task.id, text: task.prompt || task.scene || task.scenario || task.question || task.id };
  }

  /** 五模块顺序取下一道可答题（7 日做完或仅有轮播池时用） */
  _nextIncompleteModuleTask(personaId) {
    for (const mod of ['memory', 'relationship', 'emotion', 'cognition', 'voice']) {
      const t = this.getModuleTask(personaId, mod);
      if (t?.task_id && !t.all_done && !t.locked && !t.setup_required && !t.error) {
        return t;
      }
    }
    return null;
  }

  /** 按课程日顺序取下一道未完成任务（主页引导用） */
  getNextIncompleteTask(personaId) {
    if (this.needsSetup()) {
      return {
        setup_required: true,
        message: '请先填写您的称呼，主页才能开始引导训练。'
      };
    }
    const curriculum = this.loadCurriculum(personaId);
    if (!curriculum) {
      return { error: 'no_curriculum', setup_required: true, fallback: true };
    }
    this.ensureStarted(personaId);
    const dayIndex = this.getUnlockedDayIndex(personaId);

    for (let d = 1; d <= Math.min(dayIndex, 7); d++) {
      const plan = this.getDayPlan(personaId, d);
      for (const t of plan?.tasks || []) {
        if (!this._isDone(t.id)) {
          return this._formatTask(t, { day: d, day_title: plan.title, curriculum });
        }
      }
    }

    const dayTasks = this._dayTaskCount(curriculum);
    const rotationOnly = this._hasRotationOnlyCurriculum(curriculum);
    if (rotationOnly || dayTasks === 0 || dayIndex >= 4) {
      return this._nextIncompleteModuleTask(personaId);
    }

    return null;
  }

  getModuleTask(personaId, module, opts = {}) {
    if (this.needsSetup()) {
      return {
        module,
        setup_required: true,
        message: '请先填写您的称呼，系统才能生成专属题目。'
      };
    }
    const curriculum = this.loadCurriculum(personaId);
    if (!curriculum) {
      return { error: 'no_curriculum', setup_required: true, fallback: true };
    }
    this.ensureStarted(personaId);
    const dayIndex = this.getUnlockedDayIndex(personaId);

    // 1) 今日及之前未完成任务
    for (let d = 1; d <= Math.min(dayIndex, 7); d++) {
      const plan = this.getDayPlan(personaId, d);
      const tasks = this._tasksForModule(plan, module);
      for (const t of tasks) {
        if (!this._isDone(t.id)) {
          return this._formatTask(t, { day: d, day_title: plan.title, curriculum });
        }
      }
    }

    // 2) 后续天数还有本模块题未解锁
    if (dayIndex < 8) {
      for (let d = dayIndex + 1; d <= 7; d++) {
        const plan = this.getDayPlan(personaId, d);
        const modTasks = this._tasksForModule(plan, module);
        if (modTasks.some(t => !this._isDone(t.id))) {
          return {
            module,
            day: dayIndex,
            day_title: this.getDayPlan(personaId, Math.min(dayIndex, 7))?.title,
            locked: true,
            message: `完成第 ${dayIndex} 天全部题目后解锁（${plan.title}）`,
            coach_purpose: '7 日引导按天解锁；完成当前天全部情境题后进入下一天。'
          };
        }
      }
    }

    // 3) 本模块课表题已完成 → 第 4 天起轮播池加练；仅 rotation 题库则直接进入轮播
    const rotationOnly = this._hasRotationOnlyCurriculum(curriculum);
    if (dayIndex >= 4 || rotationOnly) {
      const rot = this._pickRotationTask(curriculum, module, opts.relationship_category);
      if (rot) {
        return this._formatTask(rot, { day: Math.min(dayIndex, 7), rotation: true, curriculum });
      }
    }

    // 4) 全部完成
    const plan = this.getDayPlan(personaId, Math.min(dayIndex, 7));
    return {
      module,
      day: Math.min(dayIndex, 7),
      day_title: plan?.title,
      all_done: true,
      message: '本模块当前周期题目已完成，明天再来看看，或完成其他维度。'
    };
  }

  _formatTask(task, ctx) {
    const base = {
      task_id: task.id,
      module: task.module,
      day: ctx.day,
      day_title: ctx.day_title,
      rotation: !!ctx.rotation,
      curriculum_title: ctx.curriculum?.title
    };
    let formatted;
    switch (task.module) {
      case 'memory':
        formatted = {
          ...base,
          tier: task.tier || 'core',
          prompt: task.prompt,
          hint: task.hint,
          example: task.example,
          suggested_tags: task.suggested_tags || []
        };
        break;
      case 'voice':
        formatted = {
          ...base,
          title: task.title,
          literary_text: task.literary_text,
          hint: task.hint
        };
        break;
      case 'relationship':
        formatted = {
          ...base,
          category: task.category || 'daily',
          person_name: task.person_name,
          scene: task.scene,
          scene_detail: task.scene_detail || task.scene,
          choices: task.choices || []
        };
        break;
      case 'emotion':
        formatted = {
          ...base,
          scenario: task.scenario,
          hint: task.hint,
          purpose: task.purpose,
          stress_reaction: task.stress_reaction,
          comfort_style: task.comfort_style
        };
        break;
      case 'cognition':
        formatted = {
          ...base,
          conflict_id: task.conflict_id,
          question: task.question,
          options: task.options || []
        };
        break;
      default:
        formatted = { ...base, raw: task };
    }
    const setupCtx = this._setupContext(ctx.curriculum);
    return enrichFormattedTask(formatted, task, setupCtx);
  }

  getOverview(personaId) {
    if (this.needsSetup()) {
      return {
        setup_required: true,
        title: '训练身份设定',
        message: '请先确认数字分身与您的关系，再开始 7 日引导。',
        progress: { completed: 0, total: 0, ratio: 0 },
        days: []
      };
    }
    let curriculum;
    try {
      curriculum = this.loadCurriculum(personaId);
    } catch (err) {
      return this._overviewFallback(personaId, err.message);
    }
    if (!curriculum) return { error: 'no_curriculum', setup_required: true };
    this.ensureStarted(personaId);
    const dayIndex = this.getUnlockedDayIndex(personaId);
    const days = [];
    for (let d = 1; d <= 7; d++) {
      const plan = this.getDayPlan(personaId, d);
      const tasks = plan?.tasks || [];
      const done = tasks.filter(t => this._isDone(t.id)).length;
      days.push({
        day: d,
        title: plan?.title,
        summary: plan?.summary,
        total: tasks.length,
        done,
        locked: d > dayIndex,
        current: d === Math.min(dayIndex, 7)
      });
    }
    let totalTasks = this._dayTaskCount(curriculum);
    if (!totalTasks && this._hasRotationOnlyCurriculum(curriculum)) {
      const pools = curriculum.rotation_pools || {};
      totalTasks = Object.values(pools).reduce((s, arr) => s + (arr?.length || 0), 0);
    }
    const completedCount = Object.keys(this.state.completed).length;
    const setupCtx = this._setupContext(curriculum);
    const todayDay = this._dayTaskCount(curriculum) > 0 ? Math.min(dayIndex, 7) : 1;
    const today = buildTodayChecklist(
      curriculum,
      todayDay,
      id => this._isDone(id),
      setupCtx
    );
    return {
      persona_id: personaId,
      title: curriculum.title,
      curriculum_mode: curriculum.generated_from?.is_demo ? 'demo' : 'personal',
      subject_name: curriculum.generated_from?.subject_name || setupCtx.subject_name,
      trainer_name: curriculum.generated_from?.trainer_name || setupCtx.trainer_name,
      current_day: todayDay,
      unlock_mode: 'completion',
      phase: this._resolvePhase(curriculum, dayIndex),
      days,
      today,
      progress: { completed: completedCount, total: totalTasks, ratio: totalTasks ? completedCount / totalTasks : 0 },
      started_at: this.state.started_at
    };
  }
}

module.exports = { TrainingGuideEngine };
