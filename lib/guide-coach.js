'use strict';

const MODULE_META = {
  voice: { label: '音色', page: 2, icon: 'settings_voice', verb: '朗读或录制' },
  memory: { label: '记忆', page: 3, icon: 'history_edu', verb: '写下回忆' },
  relationship: { label: '关系', page: 4, icon: 'diversity_3', verb: '选择或写下回应' },
  emotion: { label: '情感', page: 5, icon: 'favorite', verb: '写下情绪回应' },
  cognition: { label: '认知', page: 6, icon: 'bolt', verb: '做出选择' }
};

const TIER_LABEL = {
  core: '核心记忆', relationship: '关系记忆', daily: '日常记忆',
  emotional: '情绪记忆', shared: '共同记忆', wish: '愿望'
};

/** 按「记录者身份 × 关系人类型」生成具体场景，而非套模板 */
function buildRelationshipScene(ctx, person) {
  const s = ctx.subject_name;
  const p = person.name;
  const role = ctx.trainer_role;
  const pt = person.type;

  const byType = {
    spouse: {
      scene: `${p}回家后比平时安静，坐在沙发上一句话不说`,
      detail: `作为${s}最亲近的人，${p}很少这样。${ctx.trainer_name}，${s}会先开口还是先给空间？写下${s}会做的第一件事和第一句话。`,
      choices: [
        { type: 'emotional', label: '先靠近', text: `……怎么回来了也不说话。发生什么事了？` },
        { type: 'logical', label: '先观察', text: `我去热杯茶。你想说的时候再说。` }
      ]
    },
    child: {
      scene: `${p}放学回家，把书包放下后长叹一口气`,
      detail: `${p}看起来在学校遇到了挫折，但还没主动说。${s}作为${ctx.trainer_role_label}，会怎么打开话题？`,
      choices: [
        { type: 'emotional', label: '温柔试探', text: `今天看起来不太轻松。要不要先吃点东西？` },
        { type: 'logical', label: '直接问', text: `成绩出来了？没关系，我们先看看哪里可以补。` }
      ]
    },
    parent: {
      scene: `${p}在电话里说「没什么大事」，但${s}听出声音不对`,
      detail: `长辈往往不愿让孩子担心。${s}会坚持追问，还是尊重边界？写下真实反应。`,
      choices: [
        { type: 'emotional', label: '坚持关心', text: `你别总说没事。我不放心，到底怎么了？` },
        { type: 'logical', label: '留有余地', text: `好，那你说需要我做什么。我随时在。` }
      ]
    },
    friend: {
      scene: `${p}深夜发来消息：「你现在方便吗？有点想聊聊」`,
      detail: `不是紧急求救，但${p} rarely 在这个点找人。${s}的第一条回复会是什么？`,
      choices: [
        { type: 'emotional', label: '立刻回应', text: `在。慢慢说，不用整理语言。` },
        { type: 'logical', label: '确认再深聊', text: `方便。是工作上的事还是别的事？` }
      ]
    },
    old_friend: {
      scene: `${p}突然联系，说「好久没见了，有些往事想确认一下」`,
      detail: `多年未见的老友，语气里带着试探。${s}怎么接这个话头？`,
      choices: [
        { type: 'emotional', label: '怀旧开场', text: `你这一说，我立刻想起我们在……那时候的事。` },
        { type: 'logical', label: '先问清楚', text: `好啊。你想确认的是哪一段？` }
      ]
    },
    colleague: {
      scene: `${p}在工作群里@了${s}，问一个本不该在下班时间处理的问题`,
      detail: `${s}对同事/下属通常有边界。写下会怎么回复（语气、长度、是否帮忙）。`,
      choices: [
        { type: 'logical', label: '设边界', text: `明天上午我优先看这个。今晚不方便展开。` },
        { type: 'emotional', label: '破例帮忙', text: `行，你把要点发我，我今晚看一遍。` }
      ]
    }
  };

  if (byType[pt]) return byType[pt];

  return {
    scene: `${p}向${s}说了一件出乎意料的事`,
    detail: `写下${s}真实的第一反应和后续两三句话。`,
    choices: [
      { type: 'emotional', label: '情感优先', text: `……我先确认你的感受，再谈怎么办。` },
      { type: 'logical', label: '理清事实', text: `我们先把来龙去脉理一遍。` }
    ]
  };
}

/** 按记录者身份生成记忆题（不是只换名字） */
function buildMemoryPrompt(ctx, kind, person) {
  const s = ctx.subject_name;
  const tr = ctx.trainer_name;
  const role = ctx.trainer_role;

  if (kind === 'home') {
    const map = {
      self: {
        prompt: '你最早对「家」有清晰记忆的那个瞬间是什么？',
        hint: '写具体画面：光线、气味、谁在场、你当时在做什么。',
        example: '例：七岁那年的腊月，厨房蒸汽模糊了窗玻璃，奶奶在切……'
      },
      child: {
        prompt: `小时候，${s}的家最常出现的「固定画面」是什么？（${tr} 的回忆视角）`,
        hint: `你是${s}的子女。写你小时候亲眼见过的：哪个房间、哪个时段、${s}通常在做什么。`,
        example: `例：晚饭后${s}总在阳台浇花，收音机放着……`
      },
      spouse: {
        prompt: `${s}和你共同生活后，哪个「家的细节」最能代表${s}这个人？`,
        hint: '不是浪漫宣言，是一件小事：摆放习惯、口头禅、某个固定仪式。',
        example: '例：每次出差回来，TA 会先把……'
      },
      parent: {
        prompt: `${s}在成长过程中，哪一刻让你看到 TA「还是个孩子」？`,
        hint: '写具体场景，帮助数字分身保留 TA 柔软的一面。',
        example: '例：高考前夜，TA 在房间门口犹豫很久才敲门……'
      },
      friend: {
        prompt: `你第一次见到${s}时，TA 给你留下的第一个「鲜明印象」是什么？`,
        hint: '动作、穿着、一句话，比形容词更有用。',
        example: '例：聚会里 TA 一直没说话，直到有人提到……'
      },
      caregiver: {
        prompt: `在照护${s}的过程中，哪一幕让你最感到「这就是${s}」？`,
        hint: '可以是生病时的反应、对某句话的坚持、某个小习惯。',
        example: '例：即使很不舒服，TA 仍坚持要……'
      }
    };
    return map[role] || map.friend;
  }

  if (kind === 'identity') {
    const map = {
      self: {
        prompt: '别人通常怎么形容你？你自己认同吗？',
        hint: '各写一条「别人说的」和「你心里认可的」，可以不一致。',
        example: '例：同事说我很冷静，但我觉得自己只是不想让人担心。'
      },
      child: {
        prompt: `${s}的脾气，对家人和对陌生人有什么不同？各举一例。`,
        hint: '数字分身需要知道 TA 的「内外两面」。',
        example: '例：对外人总是客气，但对我会直接说「别犯傻」。'
      },
      spouse: {
        prompt: `${s}压力最大时，外在表现是什么？(${tr} 最清楚)`,
        hint: '不说话？变忙？发脾气？写你观察到的信号。',
        example: '例：开始反复整理桌面，其实是要发泄。'
      },
      parent: {
        prompt: `${s}最骄傲的一件事是什么？TA 自己会不会主动提？`,
        hint: '帮助分身知道 TA 的成就感和羞耻点。',
        example: '例：拿到证书那天，只发了一张照片给……'
      },
      friend: {
        prompt: `${s}身上哪一个缺点，朋友们其实都知道但很少说？`,
        hint: '用温和但诚实的方式写，这会让分身更真实。',
        example: '例：答应太快，后面会自己硬撑。'
      },
      caregiver: {
        prompt: `${s}最近仍反复提起的人或事是什么？`,
        hint: '临终或晚年常念叨的内容，往往是分身核心。',
        example: '例：总提到年轻时常去的那个……'
      }
    };
    return map[role] || map.friend;
  }

  if (kind === 'person_memory' && person) {
    return {
      prompt: `${s}和${person.name}（${person.type_label}）之间，哪件事最能说明他们的关系？`,
      hint: `由${tr}回忆或转述。写冲突、和解、或日常默契均可，要具体。`,
      example: `例：有一次${person.name}……而${s}的反应是……`
    };
  }

  if (kind === 'person_quote' && person) {
    return {
      prompt: `${person.name}对${s}说过哪句话，${s}（或你）至今记得？`,
      hint: '原话最好；若记不清，写大意和当时的语气。',
      example: '例：「你别总一个人扛」——说的时候声音很轻。'
    };
  }

  if (kind === 'shared' && person) {
    return {
      prompt: `${s}和${person.name}之间，有没有只有他们懂的暗号或小习惯？`,
      hint: '一个手势、一句暗语、一个地点都行。',
      example: '例：提到某个地名，两个人就会心照不宣……'
    };
  }

  return { prompt: `写一段关于${s}的真实记忆。`, hint: '至少三句话，包含时间地点。', example: '' };
}

function buildEmotionScenario(ctx, person, variant) {
  const s = ctx.subject_name;
  const p = person?.name || '亲近的人';
  const variants = {
    distress: {
      scenario: `${p}深夜发消息：「撑不住了，感觉所有事都压在身上」`,
      hint: `${s}的第一句话是什么？不要急着给建议，先写会说的原话。`,
      purpose: '训练分身在别人崩溃时的「第一句话」，这往往最像本人。'
    },
    check_in: {
      scenario: `有人看出${s}状态不对，问：「你还好吗？」`,
      hint: `${s}对不同的人会诚实到什么程度？对${p}和对其他人是否不同？`,
      purpose: '分身需要知道 TA 会不会示弱、怎么掩饰。'
    },
    joy: {
      scenario: `${p}分享喜悦：「我通过了很重要的考核」`,
      hint: `${s}怎么祝贺才像本人？写具体，不要「恭喜你」完事。`,
      purpose: '高兴时的表达方式，和难过时同样能区分一个人。'
    }
  };
  return variants[variant] || variants.distress;
}

/** 为任意 task 生成教练层（目的、步骤、示例） */
function buildCoachForTask(task, ctx) {
  const meta = MODULE_META[task.module] || { label: task.module, page: 1, verb: '完成' };
  const subject = ctx?.subject_name || 'TA';
  const trainer = ctx?.trainer_name || '你';
  const roleLabel = ctx?.trainer_role_label || '记录者';

  const base = {
    module_label: meta.label,
    module_page: meta.page,
    coach_headline: `${meta.label}训练 · ${task.title || TIER_LABEL[task.tier] || '本步'}`,
    steps: [],
    purpose: '',
    answer_guide: [],
    example: '',
    avoid: '避免只写「很好」「很温暖」等无法还原个性的抽象词。',
    cta: `写好后点击「提交」，系统会保存并进入下一题。`
  };

  switch (task.module) {
    case 'memory':
      base.purpose = `记忆层是数字分身的「根」。这道题帮助${subject}的 AI 版本理解：${TIER_LABEL[task.tier] || '这段经历'}如何塑造了 TA。`;
      base.steps = [
        `${roleLabel}${trainer}：用您了解的方式回答，可以转述${subject}说过的话`,
        '至少 3 句话，包含时间、地点、人物',
        '尽量有 sensory 细节（声音、气味、光线）'
      ];
      base.answer_guide = task.hint ? [task.hint] : ['写真实发生的事，不必美化'];
      base.example = task.example || buildMemoryPrompt(ctx, 'home').example;
      break;
    case 'voice':
      base.purpose = `音色训练不是表演，而是留下${subject}说话节奏与语气的样本，供后续陪护对话参考。`;
      base.steps = ['按下方文本朗读，或录入' + subject + '常说的一句话', '保持稳定语速，自然停顿', '录完点提交'];
      base.answer_guide = task.hint ? [task.hint] : ['不必模仿播音腔'];
      break;
    case 'relationship':
      base.purpose = `关系训练教分身：${subject}对「${task.person_name || '重要的人'}」这类关系通常怎么回应。`;
      base.steps = [
        '先读场景，想象' + subject + '当时的状态',
        '可选下方示例，或在输入框写更贴近真实的原话',
        '关注语气：冷淡/关心/嘴硬/直接'
      ];
      base.answer_guide = ['写「会说的原话」，不要写「我会安慰他」这种说明'];
      break;
    case 'emotion':
      base.purpose = task.purpose || `情感训练决定分身在别人难过或高兴时，是否会先陪伴还是先分析。`;
      base.steps = ['读场景', '写' + subject + '的第一反应（1–3句）', '提交后可用于试聊校准'];
      base.answer_guide = task.hint ? [task.hint] : ['先接住情绪，再谈道理'];
      break;
    case 'cognition':
      base.purpose = '认知训练记录价值观排序：分身遇到两难时会更像谁的选择。';
      base.steps = ['读题目', '选最接近' + subject + '的做法', '完成价值观排序（拖拽）后提交'];
      base.answer_guide = ['没有标准答案，选 TA 最可能选的'];
      break;
    default:
      base.purpose = '完成本题以推进今日训练。';
  }

  return base;
}

/** 生成今日任务清单（含教练摘要） */
function buildTodayChecklist(curriculum, dayIndex, isDoneFn, ctx) {
  const plan = curriculum.days?.find(d => d.day === dayIndex);
  if (!plan) return { intro: '', tasks: [], next: null };

  const intro = plan.summary
    ? `第 ${dayIndex} 天「${plan.title}」：${plan.summary} 完成下面全部条目后，自动解锁下一天。`
    : '';

  const tasks = (plan.tasks || []).map(t => {
    const coach = buildCoachForTask(t, ctx);
    const meta = MODULE_META[t.module];
    const done = isDoneFn(t.id);
    const short =
      t.prompt?.slice(0, 36) ||
      t.scene?.slice(0, 36) ||
      t.scenario?.slice(0, 36) ||
      t.question?.slice(0, 36) ||
      coach.coach_headline;
    return {
      task_id: t.id,
      module: t.module,
      module_label: meta?.label,
      module_page: meta?.page,
      done,
      short_label: `${meta?.label}：${short}${short.length >= 36 ? '…' : ''}`,
      purpose: coach.purpose,
      coach_headline: coach.coach_headline
    };
  });

  const next = tasks.find(t => !t.done) || null;
  return { intro, tasks, next, day_title: plan.title };
}

function enrichFormattedTask(formatted, rawTask, ctx) {
  const coach = buildCoachForTask(rawTask, ctx);
  return {
    ...formatted,
    ...coach,
    example: rawTask.example || coach.example,
    answer_guide: rawTask.hint
      ? [rawTask.hint, ...(coach.answer_guide || [])]
      : coach.answer_guide
  };
}

module.exports = {
  MODULE_META,
  buildRelationshipScene,
  buildMemoryPrompt,
  buildEmotionScenario,
  buildCoachForTask,
  buildTodayChecklist,
  enrichFormattedTask
};
