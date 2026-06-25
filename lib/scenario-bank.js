'use strict';

const { CONFLICT_SCENARIOS, DAILY_MEMORY_PROMPTS } = require('./design-spec');
const {
  buildRelationshipScene,
  buildMemoryPrompt,
  buildEmotionScenario
} = require('./guide-coach');

/** 关系情境扩展（同一关系人可多道不同场景题） */
const REL_SCENE_KEYS = ['default', 'conflict', 'daily', 'support', 'boundary'];

function relSceneExtra(ctx, person, key) {
  const s = ctx.subject_name;
  const p = person.name;
  const tr = ctx.trainer_name;
  const extras = {
    conflict: {
      scene: `${p}和${s}因为一件小事争执，气氛僵住了`,
      detail: `${tr}，${s}会先道歉、讲道理，还是冷处理？写下${s}会说的原话。`,
      choices: [
        { type: 'emotional', label: '先缓和', text: `……先别激动。我们先把话说清楚。` },
        { type: 'logical', label: '先冷静', text: `我们都冷静一下，晚点再说。` }
      ]
    },
    daily: {
      scene: `${p}随口问${s}：「晚上吃什么 / 周末干嘛」——很日常的一刻`,
      detail: `日常对话最能看出语气。${s}会怎么回？要口语、要具体。`,
      choices: [
        { type: 'emotional', label: '轻松', text: `都行，你定吧，我跟着。` },
        { type: 'logical', label: '具体', text: `我想吃清淡点的，你看着办。` }
      ]
    },
    support: {
      scene: `${p}身体不适或情绪低落，${s}得知后第一反应是什么？`,
      detail: `${s}会立刻出现、打电话，还是给空间？写下第一句话。`,
      choices: [
        { type: 'emotional', label: '陪伴', text: `你别一个人扛，我过来。` },
        { type: 'logical', label: '务实', text: `你先休息，需要什么跟我说。` }
      ]
    },
    boundary: {
      scene: `${p}向${s}提出一个让${s}为难的要求（时间/金钱/立场）`,
      detail: `${s}怎么拒绝或折中？写真实口吻，不要「好先生」模板。`,
      choices: [
        { type: 'logical', label: '设界', text: `这件事我做不到全部，但可以……` },
        { type: 'emotional', label: '缓和', text: `我理解你，但这次我真的有困难。` }
      ]
    }
  };
  if (key && key !== 'default' && extras[key]) return extras[key];
  return buildRelationshipScene(ctx, person);
}

function memTask(id, ctx, kind, person, tier, tags) {
  const m = person ? buildMemoryPrompt(ctx, kind, person) : buildMemoryPrompt(ctx, kind);
  return {
    id,
    module: 'memory',
    tier: tier || 'core',
    prompt: m.prompt,
    hint: m.hint,
    example: m.example,
    suggested_tags: tags || []
  };
}

function relTask(id, ctx, person, category, sceneKey) {
  const scene = relSceneExtra(ctx, person, sceneKey);
  return {
    id,
    module: 'relationship',
    category: category || 'daily',
    person_id: person.id,
    person_name: person.name,
    scene: scene.scene,
    scene_detail: scene.detail,
    choices: scene.choices
  };
}

function emoTask(id, ctx, person, variant) {
  const e = buildEmotionScenario(ctx, person, variant);
  return {
    id,
    module: 'emotion',
    scenario: e.scenario,
    hint: e.hint,
    purpose: e.purpose,
    stress_reaction: 'contextual',
    comfort_style: 'accompany_first'
  };
}

function cogTask(id, ctx, conflict, index) {
  return {
    id,
    module: 'cognition',
    conflict_id: conflict.id,
    question: `${ctx.subject_name}若遇到：${conflict.text}`,
    options: [
      `${ctx.subject_name}会先顾关系与感受`,
      `${ctx.subject_name}会先顾原则与事实`,
      `${ctx.subject_name}会看对象是谁再决定`
    ]
  };
}

function voiceTask(id, ctx, literary_text, hint) {
  return {
    id,
    module: 'voice',
    title: '声音样本',
    literary_text,
    hint: hint || (ctx.is_self ? '用平常语气朗读。' : `想象${ctx.subject_name}的口吻。`)
  };
}

const VOICE_SNIPPETS_SELF = [
  '世界上有两样东西，我越是思考，越是觉得它们充满新的且日益增长的惊赞和敬畏：我头顶的星空和我内心的道德准则。',
  '今天天气不错，我们慢慢来，先把眼前这件事说清楚。',
  '我没生气，只是在想怎么把这件事处理好。'
];

const VOICE_SNIPPETS_PROXY = (name) => [
  `请录入${name}常说的一句话，或 TA 朗读时会用的文字。`,
  `（${name}口吻）行了，别纠结了，咱们先看看能做什么。`,
  `（${name}口吻）我不是不想帮，是这次真的得按我的方式来。`
];

const MEMORY_KINDS_ROTATION = [
  'home', 'identity', 'person_memory', 'person_quote', 'shared'
];

const EMOTION_VARIANTS = ['distress', 'check_in', 'joy'];

/**
 * 7 日初训：目标约 45～55 道情境题（对齐 CHECKLIST 的量级方向）
 */
function buildExpandedDays(ctx, people) {
  const p0 = people[0];
  const p1 = people[1];
  const p2 = people[2];
  const voicePool = ctx.is_self ? VOICE_SNIPPETS_SELF : VOICE_SNIPPETS_PROXY(ctx.subject_name);

  const day1Tasks = [
    voiceTask('u_d1_voice_1', ctx, voicePool[0]),
    memTask('u_d1_memory_1', ctx, 'home', null, 'core', ['童年', '家庭']),
    memTask('u_d1_memory_2', ctx, 'identity', null, 'core', ['性格']),
    memTask('u_d1_memory_3', ctx, 'identity', null, 'core', ['自我'])
  ];
  if (DAILY_MEMORY_PROMPTS[0]) {
    day1Tasks.push({
      id: 'u_d1_memory_4',
      module: 'memory',
      tier: 'core',
      prompt: ctx.is_self ? DAILY_MEMORY_PROMPTS[0] : `${ctx.trainer_name}，${ctx.subject_name}${DAILY_MEMORY_PROMPTS[0].replace(/^你/, '曾')}`,
      hint: '具体画面优于形容词。',
      suggested_tags: ['幸福', '日常']
    });
  }

  const day2Tasks = [];
  [p0, p1, p2].filter(Boolean).forEach((p, i) => {
    day2Tasks.push(memTask(`u_d2_memory_${i}_a`, ctx, 'person_memory', p, 'relationship', [p.name]));
    day2Tasks.push(relTask(`u_d2_rel_${i}_a`, ctx, p, p.type === 'colleague' ? 'daily' : 'family', 'default'));
    if (i < 2) day2Tasks.push(memTask(`u_d2_memory_${i}_b`, ctx, 'person_quote', p, 'relationship', [p.name]));
  });
  if (!day2Tasks.length) {
    day2Tasks.push(memTask('u_d2_memory_0', ctx, 'identity', null, 'relationship', ['关系']));
    day2Tasks.push(relTask('u_d2_rel_0', ctx, { id: 'generic', name: '重要的人', type: 'friend', type_label: '朋友' }, 'friend', 'default'));
  }

  const day3Tasks = [];
  if (p0) {
    day3Tasks.push(relTask('u_d3_rel_0a', ctx, p0, 'friend', 'default'));
    day3Tasks.push(relTask('u_d3_rel_0b', ctx, p0, 'family', 'conflict'));
    day3Tasks.push(relTask('u_d3_rel_0c', ctx, p0, 'daily', 'daily'));
    day3Tasks.push(memTask('u_d3_mem_0', ctx, 'shared', p0, 'shared', [p0.name]));
  }
  if (p1) {
    day3Tasks.push(relTask('u_d3_rel_1a', ctx, p1, 'family', 'support'));
    day3Tasks.push(relTask('u_d3_rel_1b', ctx, p1, 'daily', 'boundary'));
  }
  if (!day3Tasks.length) day3Tasks.push(memTask('u_d3_mem_f', ctx, 'home', null, 'shared', ['共同记忆']));

  const day4Tasks = [
    memTask('u_d4_memory_1', ctx, 'identity', null, 'daily', ['习惯']),
    {
      id: 'u_d4_memory_2',
      module: 'memory',
      tier: 'daily',
      prompt: ctx.is_self
        ? '你的固定日常节奏是什么？哪个时段最像「真正的你」？'
        : `${ctx.subject_name}一天里有哪些固定习惯？（${ctx.trainer_name} 观察到的）`,
      hint: '作息、饮食、独处、睡前习惯均可。',
      suggested_tags: ['习惯']
    }
  ];
  DAILY_MEMORY_PROMPTS.slice(1, 4).forEach((prompt, i) => {
    day4Tasks.push({
      id: `u_d4_memory_rot_${i}`,
      module: 'memory',
      tier: 'daily',
      prompt: ctx.is_self ? prompt : `${ctx.trainer_name}转述：${ctx.subject_name}——${prompt}`,
      hint: '写观察到的细节。',
      suggested_tags: ['日常']
    });
  });
  if (p0) day4Tasks.push(relTask('u_d4_rel_0', ctx, p0, 'daily', 'daily'));

  const day5Tasks = [
    memTask('u_d5_memory_1', ctx, 'identity', null, 'emotional', ['挫折']),
    {
      id: 'u_d5_memory_2',
      module: 'memory',
      tier: 'emotional',
      prompt: `哪一次挫折，改变了${ctx.subject_name}后来的处事方式？`,
      hint: '事件、当时反应、事后是否改变习惯。',
      suggested_tags: ['情绪']
    }
  ];
  [p0, p1].filter(Boolean).forEach((p, i) => {
    EMOTION_VARIANTS.forEach((v, j) => {
      day5Tasks.push(emoTask(`u_d5_emo_${i}_${j}`, ctx, p, v));
    });
  });
  if (!people.length) {
    day5Tasks.push(emoTask('u_d5_emo_g0', ctx, null, 'distress'));
    day5Tasks.push(emoTask('u_d5_emo_g1', ctx, null, 'check_in'));
  }

  const day6Tasks = CONFLICT_SCENARIOS.slice(0, 10).map((c, i) => cogTask(`u_d6_cog_${i + 1}`, ctx, c, i));
  day6Tasks.push(
    memTask('u_d6_memory_1', ctx, 'identity', null, 'emotional', ['应对']),
    {
      id: 'u_d6_memory_2',
      module: 'memory',
      tier: 'emotional',
      prompt: `${ctx.subject_name}独自低谷时，通常会做什么？`,
      hint: '独处时的真实行为。',
      suggested_tags: ['应对']
    }
  );

  const day7Tasks = [
    memTask('u_d7_memory_1', ctx, 'identity', null, 'wish', ['愿望']),
    {
      id: 'u_d7_memory_2',
      module: 'memory',
      tier: 'wish',
      prompt: `${ctx.subject_name}若能对重要的人认真说一句话（不必当面），${ctx.trainer_name}想记录什么？`,
      hint: '可以写 TA 说不出口的那句。',
      suggested_tags: ['愿望']
    }
  ];
  if (p0) {
    day7Tasks.push(relTask('u_d7_rel_0', ctx, p0, 'family', 'support'));
    day7Tasks.push(emoTask('u_d7_emo_0', ctx, p0, 'joy'));
  }
  day7Tasks.push(cogTask('u_d7_cog_cap', ctx, CONFLICT_SCENARIOS[10] || CONFLICT_SCENARIOS[0], 0));
  if (voicePool[1]) day7Tasks.push(voiceTask('u_d7_voice_1', ctx, voicePool[1], '再录一段，巩固口吻'));

  return [
    {
      day: 1,
      title: ctx.is_self ? '认识你是谁' : '认识 TA 是谁',
      summary: ctx.is_self
        ? '声音 + 多段扎根情境（家、性格、日常幸福）。'
        : `声音 + 多段关于${ctx.subject_name}的扎根情境。`,
      tasks: day1Tasks
    },
    {
      day: 2,
      title: '重要的人',
      summary: p0
        ? `围绕「${p0.name}」等关系人：记忆画面 + 互动原话。`
        : `录入${ctx.subject_name}生命中最关键的关系。`,
      tasks: day2Tasks
    },
    {
      day: 3,
      title: '关系场景',
      summary: '冲突、日常、支持、边界——多种关系情境下的原话。',
      tasks: day3Tasks
    },
    {
      day: 4,
      title: '日常习惯',
      summary: '作息、仪式、重复的小动作，让分身有「日常感」。',
      tasks: day4Tasks
    },
    {
      day: 5,
      title: '情绪与脆弱',
      summary: '崩溃、被关心、喜悦——情绪情境下的第一反应。',
      tasks: day5Tasks
    },
    {
      day: 6,
      title: '价值与选择',
      summary: '10 道两难选择 + 低谷应对，校准底层决策逻辑。',
      tasks: day6Tasks
    },
    {
      day: 7,
      title: '愿望与整合',
      summary: '愿望、重要关系、再录声音、压轴价值选择。',
      tasks: day7Tasks
    }
  ];
}

function buildRotationPools(ctx, people) {
  const memory = [];
  people.forEach((p, i) => {
    MEMORY_KINDS_ROTATION.forEach(kind => {
      const m = buildMemoryPrompt(ctx, kind, kind.includes('person') ? p : null);
      memory.push({
        tier: i % 2 ? 'relationship' : 'daily',
        prompt: m.prompt,
        hint: m.hint,
        suggested_tags: [p.name]
      });
    });
  });
  DAILY_MEMORY_PROMPTS.forEach((prompt, i) => {
    memory.push({
      tier: 'daily',
      prompt: ctx.is_self ? prompt : `${ctx.trainer_name}观察：${ctx.subject_name}——${prompt}`,
      hint: '写具体画面。',
      suggested_tags: ['轮播', `daily_${i}`]
    });
  });

  const relationship = [];
  people.forEach((p, pi) => {
    REL_SCENE_KEYS.forEach((key, ki) => {
      const scene = relSceneExtra(ctx, p, key);
      relationship.push({
        module: 'relationship',
        category: key === 'default' ? 'family' : key,
        person_name: p.name,
        scene: scene.scene,
        scene_detail: scene.detail,
        choices: scene.choices,
        id: `rot_rel_${pi}_${ki}`
      });
    });
  });

  const emotion = [];
  people.forEach((p, pi) => {
    EMOTION_VARIANTS.forEach((v, vi) => {
      const e = buildEmotionScenario(ctx, p, v);
      emotion.push({
        module: 'emotion',
        scenario: e.scenario,
        hint: e.hint,
        purpose: e.purpose,
        id: `rot_emo_${pi}_${vi}`
      });
    });
  });
  emotion.push({
    module: 'emotion',
    scenario: `有人对${ctx.subject_name}说：「你最近好像很累」`,
    hint: '写下第一反应。',
    id: 'rot_emo_gen_0'
  });

  const cognition = CONFLICT_SCENARIOS.map((c, i) => ({
    module: 'cognition',
    conflict_id: c.id,
    question: `${ctx.subject_name}若遇到：${c.text}`,
    options: [
      `${ctx.subject_name}会先顾关系与感受`,
      `${ctx.subject_name}会先顾原则与事实`,
      `${ctx.subject_name}会看情况`
    ],
    id: `rot_cog_${i}`
  }));

  const voicePool = ctx.is_self ? VOICE_SNIPPETS_SELF : VOICE_SNIPPETS_PROXY(ctx.subject_name);
  const voice = voicePool.map((text, i) => ({
    module: 'voice',
    literary_text: text,
    id: `rot_voice_${i}`
  }));

  return { memory, relationship, emotion, cognition, voice };
}

function countCurriculumTasks(curriculum) {
  const days = curriculum?.days || [];
  const dayTasks = days.reduce((n, d) => n + (d.tasks?.length || 0), 0);
  const pools = curriculum?.rotation_pools || {};
  const poolTasks = Object.values(pools).reduce((n, arr) => n + (arr?.length || 0), 0);
  return { dayTasks, poolTasks, totalUnique: dayTasks + poolTasks };
}

module.exports = {
  buildExpandedDays,
  buildRotationPools,
  countCurriculumTasks,
  REL_SCENE_KEYS
};
