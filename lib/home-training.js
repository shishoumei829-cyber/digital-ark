'use strict';

const { MODULE_META } = require('./guide-coach');

const MODULE_ORDER = ['memory', 'voice', 'relationship', 'emotion', 'cognition'];

const SKIP_HINT = '';

/** 题头描述「当前情境」，不按模块贴「记忆层」标签 */
function deriveTaskHeadline(task, ctx) {
  const s = ctx?.subject_name || 'TA';
  const tr = ctx?.trainer_name || '你';

  switch (task.module) {
    case 'memory': {
      if (task.tier === 'daily') {
        return ctx?.is_self ? '情境 · 你的日常节奏' : `情境 · 观察${s}的日常`;
      }
      if (task.tier === 'wish') return `情境 · ${s}想说的话`;
      const tag = task.suggested_tags?.[0];
      if (tag && /人|友|亲|母|父|配偶/.test(tag)) {
        return `情境 · 与「${tag}」相关的画面`;
      }
      return ctx?.is_self ? '情境 · 一段具体回忆' : `情境 · ${tr}眼中的${s}`;
    }
    case 'voice':
      return ctx?.is_self ? '情境 · 用你的口吻读一段' : `情境 · 想象${s}怎么说话`;
    case 'relationship': {
      const bit = (task.scene || '').slice(0, 18);
      return bit ? `情境 · ${bit}${task.scene.length > 18 ? '…' : ''}` : `情境 · ${s}会怎么回应`;
    }
    case 'emotion': {
      const bit = (task.scenario || '').slice(0, 18);
      return bit ? `情境 · ${bit}${task.scenario.length > 18 ? '…' : ''}` : `情境 · ${s}的第一反应`;
    }
    case 'cognition':
      return `情境 · ${s}面临的选择`;
    default:
      return '训练情境';
  }
}

/** 将 guide 任务格式化为「主页」口语化提问 */
function buildHomePrompt(task, ctx) {
  const s = ctx?.subject_name || 'TA';
  const tr = ctx?.trainer_name || '你';
  const headline = deriveTaskHeadline(task, ctx);

  switch (task.module) {
    case 'memory':
      return {
        headline,
        ask: ctx?.is_self ? task.prompt : `${tr}，${task.prompt}`,
        hint: task.hint || '',
        input_type: 'text_long',
        allow_skip: true,
        scene_label: formatSceneFromTask(task)
      };
    case 'voice':
      return {
        headline,
        ask: ctx?.is_self
          ? '请朗读下面这段话，或录入你常说的一句话。'
          : `请想象${s}说话的语气，朗读下面文字（或录入 TA 的原话再读一遍）。`,
        hint: task.hint || '',
        literary_text: task.literary_text,
        input_type: 'voice',
        allow_skip: true,
        scene_label: '朗读样本'
      };
    case 'relationship':
      return {
        headline,
        ask: `假如：${task.scene}`,
        hint: task.scene_detail || '',
        choices: task.choices,
        input_type: 'choice_or_text',
        allow_skip: true,
        scene_label: formatSceneFromTask(task)
      };
    case 'emotion':
      return {
        headline,
        ask: task.scenario,
        hint: task.hint || '',
        input_type: 'text_short',
        allow_skip: true,
        scene_label: formatSceneFromTask(task)
      };
    case 'cognition':
      return {
        headline,
        ask: task.question,
        hint: '',
        options: task.options,
        input_type: 'cognition_choice',
        allow_skip: true,
        scene_label: formatSceneFromTask(task)
      };
    default:
      return {
        headline: '训练情境',
        ask: task.prompt || task.scene || task.question || '请回答',
        input_type: 'text_long',
        scene_label: formatSceneFromTask(task)
      };
  }
}

function formatSceneFromTask(task) {
  const { formatTaskSceneLabel } = require('./guide-skip-meta');
  return formatTaskSceneLabel(task) || '';
}

class HomeTrainingCoach {
  constructor(trainingGuide, setupStore) {
    this.trainingGuide = trainingGuide;
    this.setupStore = setupStore;
  }

  _ctx(curriculum) {
    return curriculum?.generated_from || this.setupStore?.contextForCurriculum?.() || {};
  }

  /** 当前主页应展示的任务（与 guide 引擎同一 task_id） */
  getHomeState(personaId) {
    if (this.trainingGuide.needsSetup()) {
      return {
        setup_required: true,
        message: '请先填写您的称呼，主页才能开始引导训练。',
        modes: ['chat']
      };
    }

    const overview = this.trainingGuide.getOverview(personaId);
    const curriculum = this.trainingGuide.loadCurriculum(personaId);
    const ctx = this._ctx(curriculum);

    const next = this.trainingGuide.getNextIncompleteTask(personaId);
    if (next?.setup_required) {
      return {
        setup_required: true,
        message: next.message || '请先填写您的称呼，主页才能开始引导训练。',
        modes: ['chat']
      };
    }
    const task = next && next.task_id ? next : null;

    if (!task) {
      const done = overview.progress?.completed ?? 0;
      const total = overview.progress?.total ?? 0;
      let message;
      if (done === 0) {
        message = '还没开始答题。请点底部「训练」进入五个模块，或点「重试」刷新题目。';
      } else if (overview.phase === 'consolidation' && (total === 0 || done >= total)) {
        message = '初训已完成。主页可自由聊天；专项页有巩固题。';
      } else {
        message = '今日题目已完成，明天解锁下一天，或去专项页看看。';
      }
      return {
        setup_required: false,
        phase: overview.phase,
        modes: ['chat', 'guided'],
        active_mode: 'chat',
        message,
        today: overview.today,
        progress: overview.progress,
        subject_name: overview.subject_name,
        trainer_name: overview.trainer_name
      };
    }

    const homePrompt = buildHomePrompt(task, ctx);
    const meta = MODULE_META[task.module] || {};

    return {
      setup_required: false,
      phase: overview.phase,
      modes: ['chat', 'guided'],
      active_mode: 'guided',
      task_id: task.task_id,
      module: task.module,
      module_label: meta.label,
      module_page: meta.page,
      day: task.day,
      day_title: task.day_title,
      home_prompt: homePrompt,
      scene_label: homePrompt.scene_label,
      coach: {
        purpose: task.purpose,
        steps: task.steps,
        avoid: task.avoid
      },
      raw: {
        prompt: task.prompt,
        scene: task.scene,
        scenario: task.scenario,
        question: task.question,
        choices: task.choices,
        options: task.options,
        tier: task.tier,
        suggested_tags: task.suggested_tags,
        literary_text: task.literary_text
      },
      today: overview.today,
      progress: overview.progress,
      subject_name: overview.subject_name,
      trainer_name: overview.trainer_name,
      sync_note: ''
    };
  }
}

module.exports = { HomeTrainingCoach, buildHomePrompt, deriveTaskHeadline, MODULE_ORDER };
