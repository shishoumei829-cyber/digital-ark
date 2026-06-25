'use strict';

/**
 * 设计说明书 v2.0 常量 — 五层人格架构全面训练题库
 */

/** 训练模块计数对层分数的最大贡献比例（防刷题虚高） */
const MODULE_PROGRESS_CAP = 0.6;

/** 五层人格拟合度权重（总进度条） */
const LAYER_WEIGHTS = {
  core: 0.35,
  emotion: 0.15,
  memory: 0.20,
  relationship: 0.15,
  expression: 0.15
};

/** @deprecated 仅用于文档对照；运行时总进度已改用 LAYER_WEIGHTS */
const MODULE_WEIGHTS = {
  voice: 0.15,
  memory: 0.30,
  relationship: 0.20,
  emotion: 0.20,
  cognition: 0.15
};

const STAGES = [
  { id: 'init', name: '初始化', min: 0, max: 0.20, capabilities: ['基础对话', '简单问答', '固定开场白'] },
  { id: 'awakening', name: '觉醒期', min: 0.20, max: 0.40, capabilities: ['引用基础记忆', '识别常见关系', '主动简单关心'] },
  { id: 'growth', name: '成长期', min: 0.40, max: 0.60, capabilities: ['情绪回应', '引用共同记忆', '主动分享内容'] },
  { id: 'mature', name: '成熟期', min: 0.60, max: 0.80, capabilities: ['深度情感对话', '价值观一致建议', '复杂场景应对'] },
  { id: 'complete', name: '完整体', min: 0.80, max: 1.01, capabilities: ['高度还原', '盲测通过', '全面开放关系人'] }
];

const BLIND_TEST_MILESTONES = [0.40, 0.70, 0.90];
const BLIND_TEST_PASS_SCORE = 7;

const MEMORY_TIERS = {
  core: { label: '核心记忆', desc: '人生关键节点' },
  relationship: { label: '关系记忆', desc: '对重要人物的记忆' },
  daily: { label: '日常记忆', desc: '生活习惯与偏好' },
  emotional: { label: '情绪记忆', desc: '高情感密度事件' },
  shared: { label: '共同记忆', desc: '与特定关系人的共同经历' },
  wish: { label: '未来愿望', desc: '未完成的计划与遗愿' }
};

const RELATIONSHIP_TYPES = {
  spouse: { label: '配偶/伴侣', level: 5 },
  child: { label: '子女', level: 5 },
  parent: { label: '父母', level: 4 },
  old_friend: { label: '老友', level: 4 },
  colleague: { label: '同事', level: 2 },
  friend: { label: '普通朋友', level: 2 }
};

const DEFAULT_INTIMACY = {
  distance: 5,
  initiative: 5,
  emotional_depth: 5,
  humor: 5,
  topics: []
};

// ══════════════════════════════════════════════════════════════════
//  核心层训练题库（v2.0 全面补充）
// ══════════════════════════════════════════════════════════════════

/**
 * 价值优先级 - 价值卡片库（扩充到30+个价值）
 */
const VALUE_CARDS = [
  { value: '家庭', label: '家庭', description: '家人、亲情、归属感', emoji: '🏠' },
  { value: '事业', label: '事业', description: '成就、职业、社会地位', emoji: '💼' },
  { value: '自由', label: '自由', description: '独立、自主、不受约束', emoji: '🕊️' },
  { value: '安全', label: '安全', description: '稳定、保障、确定性', emoji: '🛡️' },
  { value: '成长', label: '成长', description: '学习、进步、自我提升', emoji: '🌱' },
  { value: '关系', label: '关系', description: '朋友、社交、人际连接', emoji: '🤝' },
  { value: '健康', label: '健康', description: '身体、运动、生命质量', emoji: '💪' },
  { value: '创造', label: '创造', description: '创新、艺术、自我表达', emoji: '🎨' },
  { value: '真理', label: '真理', description: '诚实、事实、求真', emoji: '📖' },
  { value: '意义', label: '意义', description: '目的、使命、价值感', emoji: '✨' },
  { value: '快乐', label: '快乐', description: '愉悦、享受、幸福感', emoji: '😊' },
  { value: '责任', label: '责任', description: '担当、义务、可靠性', emoji: '⚖️' },
  { value: '尊严', label: '尊严', description: '自尊、被尊重、人格独立', emoji: '👑' },
  { value: '公平', label: '公平', description: '公正、平等、合理', emoji: '⚖️' },
  { value: '独立', label: '独立', description: '自主决策、不依赖他人', emoji: '🦅' },
  { value: '忠诚', label: '忠诚', description: '信守承诺、不背叛', emoji: '💍' },
  { value: '善良', label: '善良', description: '同情心、帮助他人、不伤害', emoji: '❤️' },
  { value: '智慧', label: '智慧', description: '洞察力、判断力、深度思考', emoji: '🧠' },
  { value: '美', label: '美', description: '审美、和谐、精致', emoji: '🌸' },
  { value: '传统', label: '传统', description: '文化传承、家族记忆、仪式感', emoji: '📜' },
  { value: '冒险', label: '冒险', description: '探索未知、挑战极限、刺激', emoji: '🚀' },
  { value: '平静', label: '平静', description: '内心安宁、不被干扰、淡然', emoji: '🧘' },
  { value: '影响力', label: '影响力', description: '改变他人、领导力、被需要', emoji: '🌟' },
  { value: '真实', label: '真实', description: '不做作、表里如一、坦诚', emoji: '🪞' },
  { value: '感恩', label: '感恩', description: '珍惜所拥有、不忘恩情', emoji: '🙏' },
  { value: '谦逊', label: '谦逊', description: '不自大、尊重他人、低调', emoji: '🌾' },
  { value: '坚韧', label: '坚韧', description: '不放弃、逆境中坚持、毅力', emoji: '⛰️' },
  { value: '好奇心', label: '好奇心', description: '求知欲、探索欲、开放心态', emoji: '🔍' },
  { value: '幽默', label: '幽默', description: '轻松、有趣、不沉重', emoji: '😄' },
  { value: '节制', label: '节制', description: '自律、适度、不过度', emoji: '🎯' }
];

/**
 * 自我规范 - 对自己的要求和标准
 */
const SELF_REGULATION_SCENARIOS = [
  {
    id: 'sr_01',
    category: '自律',
    scenario: '你给自己定了一个目标（比如健身、学习），但已经连续三天没执行了，你会？',
    options: [
      { type: 'strict', text: '严厉批评自己，强迫自己执行' },
      { type: 'balanced', text: '分析原因，调整计划，重新开始' },
      { type: 'lenient', text: '算了，可能不适合，放弃也没关系' },
      { type: 'rational', text: '找到问题所在，降低难度继续' }
    ]
  },
  {
    id: 'sr_02',
    category: '完美主义',
    scenario: '你完成了一个作品/任务，但自己觉得只有70分，你会？',
    options: [
      { type: 'perfectionist', text: '不满意就重做，直到满意为止' },
      { type: 'pragmatic', text: '先提交，有反馈再改进' },
      { type: 'satisfied', text: '70分已经不错了，就这样吧' },
      { type: 'anxious', text: '很焦虑，但不知道怎么改进' }
    ]
  },
  {
    id: 'sr_03',
    category: '自我期望',
    scenario: '你对自己的未来有什么样的期望？',
    options: [
      { type: 'high', text: '一定要做出成就，不能平庸' },
      { type: 'moderate', text: '做好本职工作，稳定发展' },
      { type: 'low', text: '过得开心就好，不给自己压力' },
      { type: 'adaptive', text: '看情况，能走到哪算哪' }
    ]
  },
  {
    id: 'sr_04',
    category: '压力应对',
    scenario: '当你感到压力很大时，你通常会？',
    options: [
      { type: 'proactive', text: '主动解决问题，把压力转化为行动' },
      { type: 'rational', text: '冷静分析，找出压力源' },
      { type: 'emotional', text: '找人倾诉，释放情绪' },
      { type: 'avoidant', text: '暂时逃避，等心情好了再处理' }
    ]
  },
  {
    id: 'sr_05',
    category: '自我反思',
    scenario: '你犯了一个错误，你会？',
    options: [
      { type: 'deep_reflect', text: '深入分析原因，确保不再犯' },
      { type: 'quick_fix', text: '赶紧补救，然后继续前进' },
      { type: 'self_forgive', text: '人都会犯错，原谅自己' },
      { type: 'ruminant', text: '反复回想，很难释怀' }
    ]
  },
  {
    id: 'sr_06',
    category: '时间管理',
    scenario: '你有很多事情要做，但时间有限，你会？',
    options: [
      { type: 'priority', text: '列出优先级，先做最重要的' },
      { type: 'deadline', text: '先做最紧急的' },
      { type: 'energy', text: '根据精力状态选择做什么' },
      { type: 'random', text: '想到什么做什么' }
    ]
  },
  {
    id: 'sr_07',
    category: '自我要求',
    scenario: '你对自己说过的最狠的话是什么类型？',
    options: [
      { type: 'capability', text: '你不够聪明/有能力' },
      { type: 'effort', text: '你不够努力' },
      { type: 'worth', text: '你不够好/值得' },
      { type: 'none', text: '我很少对自己说狠话' }
    ]
  },
  {
    id: 'sr_08',
    category: '习惯养成',
    scenario: '你想养成一个新习惯，你会？',
    options: [
      { type: 'systematic', text: '制定详细计划，每天打卡' },
      { type: 'gradual', text: '从小处开始，慢慢增加' },
      { type: 'intensive', text: '全身心投入，快速养成' },
      { type: 'flexible', text: '顺其自然，能坚持就坚持' }
    ]
  },
  {
    id: 'sr_09',
    category: '自我激励',
    scenario: '你完成了一个困难任务，你会怎么奖励自己？',
    options: [
      { type: 'celebrate', text: '好好庆祝，享受成就感' },
      { type: 'quiet', text: '内心满足，不需要特别庆祝' },
      { type: 'next', text: '马上开始下一个目标' },
      { type: 'reflect', text: '回顾过程，总结经验' }
    ]
  },
  {
    id: 'sr_10',
    category: '自我认知',
    scenario: '你认为自己最大的优点是什么？',
    options: [
      { type: 'intelligence', text: '聪明、有洞察力' },
      { type: 'persistence', text: '坚持、不放弃' },
      { type: 'kindness', text: '善良、有同理心' },
      { type: 'adaptability', text: '灵活、能适应变化' }
    ]
  },
  {
    id: 'sr_11',
    category: '自我认知',
    scenario: '你认为自己最大的缺点是什么？',
    options: [
      { type: 'procrastination', text: '拖延、不够自律' },
      { type: 'sensitivity', text: '太敏感、想太多' },
      { type: 'stubbornness', text: '固执、不容易改变' },
      { type: 'avoidance', text: '逃避冲突、不敢直面' }
    ]
  },
  {
    id: 'sr_12',
    category: '自我边界',
    scenario: '你会因为别人的评价而改变自己吗？',
    options: [
      { type: 'independent', text: '很少，我有自己的一套标准' },
      { type: 'selective', text: '会参考亲近的人的意见' },
      { type: 'influenced', text: '比较容易受影响' },
      { type: 'conflicted', text: '内心会挣扎，但不一定改' }
    ]
  }
];

/**
 * 边界模式 - 什么触碰到你有稳定反应
 */
const BOUNDARY_SCENARIOS = [
  {
    id: 'bd_01',
    category: '隐私边界',
    scenario: '有人问你一个不想回答的私人问题，你会？',
    options: [
      { type: 'direct', text: '直接说"不想回答"' },
      { type: 'evasive', text: '巧妙转移话题' },
      { type: 'polite', text: '礼貌地敷衍过去' },
      { type: 'compliant', text: '虽然不舒服，但还是回答了' }
    ]
  },
  {
    id: 'bd_02',
    category: '时间边界',
    scenario: '朋友深夜打电话给你倾诉，但你很累了，你会？',
    options: [
      { type: 'clear', text: '说明自己状态，约明天再聊' },
      { type: 'sacrifice', text: '强撑着听对方说完' },
      { type: 'partial', text: '听一会儿，然后找借口挂掉' },
      { type: 'guilty', text: '不好意思拒绝，一直听' }
    ]
  },
  {
    id: 'bd_03',
    category: '情感边界',
    scenario: '有人反复向你倾诉同样的问题，但不听建议，你会？',
    options: [
      { type: 'withdraw', text: '逐渐减少回应，保护自己' },
      { type: 'direct_tell', text: '直接告诉对方你的感受' },
      { type: 'continue', text: '继续听，因为对方需要' },
      { type: 'set_limit', text: '设定界限，比如"我们聊20分钟"' }
    ]
  },
  {
    id: 'bd_04',
    category: '物理边界',
    scenario: '有人未经允许碰你的东西，你会？',
    options: [
      { type: 'immediate', text: '立刻制止，明确表达不满' },
      { type: 'indirect', text: '通过暗示让对方知道' },
      { type: 'tolerate', text: '虽然不舒服，但忍了' },
      { type: 'depends', text: '看是谁，亲近的人可以接受' }
    ]
  },
  {
    id: 'bd_05',
    category: '价值观边界',
    scenario: '有人在你面前说一些你强烈反对的观点，你会？',
    options: [
      { type: 'debate', text: '直接反驳，表达自己的立场' },
      { type: 'silent', text: '保持沉默，不参与讨论' },
      { type: 'understand', text: '试图理解对方为什么这样想' },
      { type: 'leave', text: '找借口离开现场' }
    ]
  },
  {
    id: 'bd_06',
    category: '承诺边界',
    scenario: '你答应了别人一件事，但后来发现很难做到，你会？',
    options: [
      { type: 'honor', text: '无论如何都要做到' },
      { type: 'communicate', text: '提前沟通，说明困难' },
      { type: 'excuse', text: '找借口推掉' },
      { type: 'compromise', text: '提出替代方案' }
    ]
  },
  {
    id: 'bd_07',
    category: '情感勒索',
    scenario: '有人用"如果你真的在乎我，你就会..."来要求你，你会？',
    options: [
      { type: 'resist', text: '识别这是情感勒索，拒绝' },
      { type: 'comply', text: '为了关系，妥协' },
      { type: 'negotiate', text: '尝试沟通，寻找中间点' },
      { type: 'guilty', text: '感到内疚，可能答应' }
    ]
  },
  {
    id: 'bd_08',
    category: '批评边界',
    scenario: '有人批评你很在意的事情，你会？',
    options: [
      { type: 'defensive', text: '立刻为自己辩护' },
      { type: 'reflect', text: '先思考批评是否有道理' },
      { type: 'hurt', text: '感到受伤，但不表达' },
      { type: 'dismiss', text: '不在意别人的看法' }
    ]
  },
  {
    id: 'bd_09',
    category: '帮助边界',
    scenario: '有人请求你帮忙，但你已经很忙了，你会？',
    options: [
      { type: 'accept', text: '答应下来，挤时间帮忙' },
      { type: 'decline', text: '诚实说明自己的情况' },
      { type: 'partial', text: '提供部分帮助' },
      { type: 'guilt', text: '感到内疚，勉强答应' }
    ]
  },
  {
    id: 'bd_10',
    category: '关系边界',
    scenario: '你发现朋友在背后说你坏话，你会？',
    options: [
      { type: 'confront', text: '直接找对方面谈' },
      { type: 'distance', text: '逐渐疏远，不解释' },
      { type: 'forgive', text: '假装不知道，继续相处' },
      { type: 'end', text: '直接断绝关系' }
    ]
  },
  {
    id: 'bd_11',
    category: '金钱边界',
    scenario: '朋友向你借钱，但之前借的还没还，你会？',
    options: [
      { type: 'refuse', text: '提醒之前的借款，拒绝' },
      { type: 'lend_again', text: '不好意思拒绝，再借' },
      { type: 'conditional', text: '可以借，但先还之前的' },
      { type: 'partial', text: '借一部分，表示心意' }
    ]
  },
  {
    id: 'bd_12',
    category: '信息边界',
    scenario: '有人追问你不想分享的个人信息，你会？',
    options: [
      { type: 'firm', text: '坚定地说"这是我的隐私"' },
      { type: 'redirect', text: '反问对方为什么想知道' },
      { type: 'partial', text: '说一部分，保留一部分' },
      { type: 'comply', text: '告诉对方，虽然不舒服' }
    ]
  }
];

/**
 * 待人处事风格 - 你与人相处的方式
 */
const INTERPERSONAL_STYLE_SCENARIOS = [
  {
    id: 'is_01',
    category: '初次见面',
    scenario: '你第一次见到一个人，你通常会？',
    options: [
      { type: 'warm', text: '主动微笑，热情打招呼' },
      { type: 'polite', text: '礼貌但保持距离' },
      { type: 'observe', text: '先观察对方，再决定态度' },
      { type: 'reserved', text: '比较安静，等对方先开口' }
    ]
  },
  {
    id: 'is_02',
    category: '对话风格',
    scenario: '你和朋友聊天时，你更倾向于？',
    options: [
      { type: 'listener', text: '多听少说，认真倾听' },
      { type: 'sharer', text: '主动分享自己的想法' },
      { type: 'questioner', text: '问很多问题，了解对方' },
      { type: 'balanced', text: '有来有往，平衡交流' }
    ]
  },
  {
    id: 'is_03',
    category: '表达关心',
    scenario: '你想表达对朋友的关心，你通常会？',
    options: [
      { type: 'verbal', text: '直接说"我关心你"' },
      { type: 'action', text: '通过行动表示，比如帮忙' },
      { type: 'gift', text: '送礼物或请吃饭' },
      { type: '陪伴', text: '默默陪伴，不一定要说什么' }
    ]
  },
  {
    id: 'is_04',
    category: '处理分歧',
    scenario: '你和朋友意见不同，你会？',
    options: [
      { type: 'discuss', text: '平静讨论，寻找共识' },
      { type: 'concede', text: '让步，维持和谐' },
      { type: 'insist', text: '坚持自己的观点' },
      { type: 'avoid', text: '回避冲突，不深入讨论' }
    ]
  },
  {
    id: 'is_05',
    category: '幽默风格',
    scenario: '你的幽默风格是什么样的？',
    options: [
      { type: 'self_deprecating', text: '自嘲型，拿自己开玩笑' },
      { type: 'witty', text: '机智型，善于文字游戏' },
      { type: 'observational', text: '观察型，发现生活中的趣事' },
      { type: 'dry', text: '冷幽默，不笑但有趣' }
    ]
  },
  {
    id: 'is_06',
    category: '社交能量',
    scenario: '参加一个大型聚会后，你会？',
    options: [
      { type: 'energized', text: '很兴奋，还想继续' },
      { type: 'satisfied', text: '满足，可以回家了' },
      { type: 'tired', text: '很累，需要独处充电' },
      { type: 'depends', text: '看情况，遇到有趣的人就不累' }
    ]
  },
  {
    id: 'is_07',
    category: '亲密关系',
    scenario: '你和最亲近的人相处时，你是什么样的？',
    options: [
      { type: 'open', text: '完全放松，展现真实自我' },
      { type: 'caring', text: '很照顾对方，体贴入微' },
      { type: 'playful', text: '爱开玩笑，轻松愉快' },
      { type: 'deep', text: '喜欢深度对话，分享内心' }
    ]
  },
  {
    id: 'is_08',
    category: '帮助他人',
    scenario: '朋友向你求助，你通常会？',
    options: [
      { type: 'immediate', text: '立刻放下手头的事帮忙' },
      { type: 'assess', text: '先评估自己能否帮上' },
      { type: 'emotional', text: '先提供情感支持' },
      { type: 'practical', text: '提供实际的建议或资源' }
    ]
  },
  {
    id: 'is_09',
    category: '拒绝方式',
    scenario: '你需要拒绝别人时，你通常会？',
    options: [
      { type: 'direct', text: '直接说"不好意思，不行"' },
      { type: 'explain', text: '解释原因，让对方理解' },
      { type: 'apologetic', text: '很抱歉，反复道歉' },
      { type: 'indirect', text: '找借口，不直接拒绝' }
    ]
  },
  {
    id: 'is_10',
    category: '赞美方式',
    scenario: '你想赞美别人时，你通常会？',
    options: [
      { type: 'specific', text: '具体说明哪里做得好' },
      { type: 'general', text: '简单说"你真棒"' },
      { type: 'action', text: '用行动表示，比如请客' },
      { type: 'rare', text: '很少主动赞美别人' }
    ]
  },
  {
    id: 'is_11',
    category: '冲突处理',
    scenario: '你和别人发生冲突后，你通常会？',
    options: [
      { type: 'reconcile', text: '主动寻求和解' },
      { type: 'wait', text: '等对方先开口' },
      { type: 'reflect', text: '反思自己的问题' },
      { type: 'distance', text: '保持距离，让时间冲淡' }
    ]
  },
  {
    id: 'is_12',
    category: '社交主动性',
    scenario: '你多久主动联系一次朋友？',
    options: [
      { type: 'frequent', text: '经常，几乎每天' },
      { type: 'regular', text: '定期，每周几次' },
      { type: 'occasional', text: '偶尔，想起来就联系' },
      { type: 'rare', text: '很少，通常是对方先联系' }
    ]
  }
];

/**
 * 眼光视角 - 你看世界的角度
 */
const PERSPECTIVE_SCENARIOS = [
  {
    id: 'ps_01',
    category: '世界观',
    scenario: '你认为这个世界总体上是？',
    options: [
      { type: 'optimistic', text: '美好的，值得探索' },
      { type: 'realistic', text: '复杂的，有好有坏' },
      { type: 'pessimistic', text: '困难的，需要谨慎' },
      { type: 'neutral', text: '无所谓好坏，看你怎么看' }
    ]
  },
  {
    id: 'ps_02',
    category: '人性看法',
    scenario: '你对人性的看法是？',
    options: [
      { type: 'good', text: '人本性是善良的' },
      { type: 'mixed', text: '人有善有恶，看环境' },
      { type: 'selfish', text: '人本质上是自私的' },
      { type: 'complex', text: '人性很复杂，不能简单判断' }
    ]
  },
  {
    id: 'ps_03',
    category: '命运观',
    scenario: '你相信命运吗？',
    options: [
      { type: 'fate', text: '相信，很多事情是注定的' },
      { type: 'free_will', text: '不相信，命运掌握在自己手中' },
      { type: 'mixed', text: '有些事注定，有些事可以改变' },
      { type: 'agnostic', text: '不知道，也不重要' }
    ]
  },
  {
    id: 'ps_04',
    category: '变化态度',
    scenario: '你对变化的态度是？',
    options: [
      { type: 'embrace', text: '欢迎变化，这是成长的机会' },
      { type: 'cautious', text: '谨慎对待，评估风险' },
      { type: 'resist', text: '不喜欢变化，喜欢稳定' },
      { type: 'adaptive', text: '看情况，该变就变' }
    ]
  },
  {
    id: 'ps_05',
    category: '失败看法',
    scenario: '你如何看待失败？',
    options: [
      { type: 'learning', text: '是学习的机会' },
      { type: 'inevitable', text: '是人生的一部分' },
      { type: 'unacceptable', text: '是需要避免的' },
      { type: 'redirection', text: '是转向更好方向的信号' }
    ]
  },
  {
    id: 'ps_06',
    category: '时间视角',
    scenario: '你更关注哪个时间维度？',
    options: [
      { type: 'past', text: '过去，珍惜回忆和经验' },
      { type: 'present', text: '现在，活在当下' },
      { type: 'future', text: '未来，为明天做准备' },
      { type: 'balanced', text: '平衡，都重要' }
    ]
  },
  {
    id: 'ps_07',
    category: '物质与精神',
    scenario: '你认为物质和精神哪个更重要？',
    options: [
      { type: 'material', text: '物质基础更重要' },
      { type: 'spiritual', text: '精神追求更重要' },
      { type: 'balanced', text: '两者都重要' },
      { type: 'depends', text: '看人生阶段' }
    ]
  },
  {
    id: 'ps_08',
    category: '个人与集体',
    scenario: '你更看重个人自由还是集体利益？',
    options: [
      { type: 'individual', text: '个人自由优先' },
      { type: 'collective', text: '集体利益优先' },
      { type: 'balanced', text: '看具体情况平衡' },
      { type: 'conflicted', text: '经常为此纠结' }
    ]
  },
  {
    id: 'ps_09',
    category: '竞争与合作',
    scenario: '你更喜欢竞争还是合作？',
    options: [
      { type: 'competitive', text: '喜欢竞争，激发潜力' },
      { type: 'cooperative', text: '喜欢合作，共同进步' },
      { type: 'situational', text: '看情况，该竞争就竞争' },
      { type: 'avoid', text: '都不喜欢，喜欢独立工作' }
    ]
  },
  {
    id: 'ps_10',
    category: '完美与完成',
    scenario: '你更看重完美还是完成？',
    options: [
      { type: 'perfect', text: '宁可不做，要做就做最好' },
      { type: 'complete', text: '先完成，再完善' },
      { type: 'balanced', text: '追求足够好' },
      { type: 'depends', text: '看事情的重要性' }
    ]
  },
  {
    id: 'ps_11',
    category: '深度与广度',
    scenario: '你更喜欢深入一个领域还是广泛涉猎？',
    options: [
      { type: 'depth', text: '深耕一个领域，成为专家' },
      { type: 'breadth', text: '广泛涉猎，见多识广' },
      { type: 't_shape', text: '一专多能，T型人才' },
      { type: 'curiosity', text: '跟随好奇心，没有固定' }
    ]
  },
  {
    id: 'ps_12',
    category: '确定性与不确定性',
    scenario: '你对不确定性的态度是？',
    options: [
      { type: 'comfortable', text: '享受不确定性，充满可能' },
      { type: 'tolerant', text: '可以接受，但需要一定确定性' },
      { type: 'anxious', text: '不确定让我焦虑' },
      { type: 'avoid', text: '尽量避免，追求确定' }
    ]
  }
];

/**
 * 内心活动模式 - 你在想什么
 */
const INNER_ACTIVITY_SCENARIOS = [
  {
    id: 'ia_01',
    category: '内心独白',
    scenario: '你独处时，你的内心通常在？',
    options: [
      { type: 'planning', text: '计划未来要做的事' },
      { type: 'reflecting', text: '回顾过去发生的事' },
      { type: 'imagining', text: '想象各种可能性' },
      { type: 'quiet', text: '享受安静，什么都不想' }
    ]
  },
  {
    id: 'ia_02',
    category: '思维模式',
    scenario: '你思考问题时，你更倾向于？',
    options: [
      { type: 'analytical', text: '逻辑分析，一步步推理' },
      { type: 'intuitive', text: '直觉感受，跟着感觉走' },
      { type: 'visual', text: '画面想象，脑海中有图像' },
      { type: 'verbal', text: '内心对话，和自己讨论' }
    ]
  },
  {
    id: 'ia_03',
    category: '情绪处理',
    scenario: '当你有强烈情绪时，你会？',
    options: [
      { type: 'analyze', text: '分析情绪从何而来' },
      { type: 'express', text: '找方式表达出来' },
      { type: 'suppress', text: '压下去，不让它影响' },
      { type: 'accept', text: '接受它，让它自然流过' }
    ]
  },
  {
    id: 'ia_04',
    category: '决策过程',
    scenario: '你做重要决定时，你的内心过程是？',
    options: [
      { type: 'pros_cons', text: '列出利弊，理性分析' },
      { type: 'gut', text: '跟着直觉，相信第一感觉' },
      { type: 'consult', text: '咨询他人意见' },
      { type: 'delay', text: '拖延，等更多信息' }
    ]
  },
  {
    id: 'ia_05',
    category: '自我对话',
    scenario: '你和自己说话时，语气通常是？',
    options: [
      { type: 'encouraging', text: '鼓励自己，像教练' },
      { type: 'critical', text: '批评自己，像严厉的老师' },
      { type: 'neutral', text: '客观分析，像旁观者' },
      { type: 'compassionate', text: '温柔对待，像朋友' }
    ]
  },
  {
    id: 'ia_06',
    category: '注意力',
    scenario: '你的注意力更容易被什么吸引？',
    options: [
      { type: 'problems', text: '问题和需要解决的事' },
      { type: 'beauty', text: '美好的事物和瞬间' },
      { type: 'people', text: '人和人际关系' },
      { type: 'ideas', text: '想法和可能性' }
    ]
  },
  {
    id: 'ia_07',
    category: '担忧模式',
    scenario: '你最容易担心什么？',
    options: [
      { type: 'failure', text: '失败和达不到期望' },
      { type: 'rejection', text: '被拒绝和不被接受' },
      { type: 'loss', text: '失去重要的人或东西' },
      { type: 'meaning', text: '人生没有意义' }
    ]
  },
  {
    id: 'ia_08',
    category: '内在动机',
    scenario: '什么最能驱动你行动？',
    options: [
      { type: 'passion', text: '热情和兴趣' },
      { type: 'duty', text: '责任和义务' },
      { type: 'fear', text: '恐惧和焦虑' },
      { type: 'curiosity', text: '好奇心和探索欲' }
    ]
  },
  {
    id: 'ia_09',
    category: '内在冲突',
    scenario: '你最常经历的内在冲突是？',
    options: [
      { type: 'want_should', text: '想做的 vs 应该做的' },
      { type: 'self_other', text: '自己的需求 vs 他人的需求' },
      { type: 'ideal_reality', text: '理想 vs 现实' },
      { type: 'stability_change', text: '稳定 vs 变化' }
    ]
  },
  {
    id: 'ia_10',
    category: '内在声音',
    scenario: '你的内在声音通常在说什么？',
    options: [
      { type: 'achieve', text: '"你还不够好，需要更努力"' },
      { type: 'protect', text: '"小心，保护好自己"' },
      { type: 'explore', text: '"去尝试，去探索"' },
      { type: 'connect', text: '"和他人建立连接"' }
    ]
  },
  {
    id: 'ia_11',
    category: '思维节奏',
    scenario: '你的思维节奏是怎样的？',
    options: [
      { type: 'fast', text: '思维很快，跳跃性强' },
      { type: 'methodical', text: '有条理，一步步来' },
      { type: 'slow_deep', text: '慢但深入，喜欢思考' },
      { type: 'scattered', text: '容易分散，需要专注' }
    ]
  },
  {
    id: 'ia_12',
    category: '内在资源',
    scenario: '当你需要恢复能量时，你会？',
    options: [
      { type: 'alone', text: '独处，和自己待着' },
      { type: 'nature', text: '去大自然中' },
      { type: 'creative', text: '做创造性的事' },
      { type: 'social', text: '和亲近的人在一起' }
    ]
  }
];

/**
 * 道德判断 - 你的是非标准
 */
const MORAL_JUDGMENT_SCENARIOS = [
  {
    id: 'mj_01',
    category: '诚实与善良',
    scenario: '知道一个朋友的秘密，对方配偶问起，你说吗？',
    options: [
      { type: 'honest', text: '说实话，诚实最重要' },
      { type: 'loyal', text: '保护朋友，不说' },
      { type: 'evasive', text: '巧妙回避，不直接回答' },
      { type: 'context', text: '看具体情况决定' }
    ]
  },
  {
    id: 'mj_02',
    category: '规则与人情',
    scenario: '规则不合理，但打破它有代价，你怎么选？',
    options: [
      { type: 'rule', text: '遵守规则，避免麻烦' },
      { type: 'break', text: '打破规则，追求正义' },
      { type: 'workaround', text: '找规则的漏洞' },
      { type: 'change', text: '尝试改变规则' }
    ]
  },
  {
    id: 'mj_03',
    category: '公平与效率',
    scenario: '你更看重公平还是效率？',
    options: [
      { type: 'fairness', text: '公平优先，即使牺牲效率' },
      { type: 'efficiency', text: '效率优先，结果更重要' },
      { type: 'balanced', text: '两者平衡' },
      { type: 'context', text: '看具体情况' }
    ]
  },
  {
    id: 'mj_04',
    category: '善意谎言',
    scenario: '善意的谎言能保护对方，你会说吗？',
    options: [
      { type: 'no_lie', text: '不说，诚实是最好的' },
      { type: 'white_lie', text: '说，保护对方更重要' },
      { type: 'depends', text: '看谎言的大小和后果' },
      { type: 'alternative', text: '找其他方式保护对方' }
    ]
  },
  {
    id: 'mj_05',
    category: '个人与集体',
    scenario: '牺牲自己的重要计划帮一个需要的朋友',
    options: [
      { type: 'self_sacrifice', text: '帮，朋友更重要' },
      { type: 'self_first', text: '不帮，自己的计划重要' },
      { type: 'partial', text: '提供部分帮助' },
      { type: 'negotiate', text: '商量，找两全其美的方案' }
    ]
  },
  {
    id: 'mj_06',
    category: '原谅与边界',
    scenario: '朋友第三次犯同样的错伤害你',
    options: [
      { type: 'forgive', text: '原谅，人都会犯错' },
      { type: 'boundary', text: '设定界限，保护自己' },
      { type: 'end', text: '结束这段关系' },
      { type: 'confront', text: '直接沟通，表达感受' }
    ]
  },
  {
    id: 'mj_07',
    category: '尊重与自主',
    scenario: '长辈给出你不认同的人生建议',
    options: [
      { type: 'respect', text: '尊重长辈，听从建议' },
      { type: 'autonomy', text: '坚持自己的选择' },
      { type: 'diplomatic', text: '礼貌感谢，但不执行' },
      { type: 'discuss', text: '尝试沟通，解释自己的想法' }
    ]
  },
  {
    id: 'mj_08',
    category: '责任与自由',
    scenario: '事业晋升需要长期出差，家人需要你',
    options: [
      { type: 'career', text: '选择事业，为家庭创造更好条件' },
      { type: 'family', text: '选择家庭，陪伴最重要' },
      { type: 'balance', text: '寻找平衡点' },
      { type: 'temporary', text: '暂时牺牲，之后补偿' }
    ]
  },
  {
    id: 'mj_09',
    category: '正义与和谐',
    scenario: '团队成果主要是你做的，领导只表扬了别人',
    options: [
      { type: 'speak_up', text: '主动说明自己的贡献' },
      { type: 'accept', text: '接受，不争功' },
      { type: 'indirect', text: '通过其他方式让领导知道' },
      { type: 'let_go', text: '不在意，做好本职工作' }
    ]
  },
  {
    id: 'mj_10',
    category: '信任与怀疑',
    scenario: '不太熟的朋友借钱，数额不小',
    options: [
      { type: 'trust', text: '借，相信人性本善' },
      { type: 'cautious', text: '不借，保护自己' },
      { type: 'partial', text: '借一部分，试探' },
      { type: 'conditions', text: '借，但设定还款计划' }
    ]
  },
  {
    id: 'mj_11',
    category: '保护与诚实',
    scenario: '看到令人不安的新闻，要不要告诉易焦虑的家人',
    options: [
      { type: 'protect', text: '不告诉，保护他们' },
      { type: 'honest', text: '告诉，他们有权知道' },
      { type: 'gradual', text: '慢慢透露，观察反应' },
      { type: 'support', text: '告诉，但提供支持' }
    ]
  },
  {
    id: 'mj_12',
    category: '承诺与现实',
    scenario: '无法兑现对孩子的承诺',
    options: [
      { type: 'apologize', text: '诚恳道歉，解释原因' },
      { type: 'compensate', text: '找其他方式补偿' },
      { type: 'excuse', text: '找借口，避免失望' },
      { type: 'avoid', text: '回避，希望孩子忘记' }
    ]
  }
];

/**
 * 品质特质 - 你身上稳定的东西
 */
const QUALITY_TRAITS_SCENARIOS = [
  {
    id: 'qt_01',
    category: '坚韧',
    scenario: '遇到重大挫折时，你通常会？',
    options: [
      { type: 'persistent', text: '坚持下去，不放弃' },
      { type: 'adaptive', text: '调整方向，寻找新路' },
      { type: 'recover', text: '休息一下，然后继续' },
      { type: 'quit', text: '可能放弃，换一个目标' }
    ]
  },
  {
    id: 'qt_02',
    category: '同理心',
    scenario: '看到别人痛苦时，你会？',
    options: [
      { type: 'deep', text: '深深共情，感同身受' },
      { type: 'helpful', text: '想办法帮助' },
      { type: 'sympathetic', text: '表示同情，但保持距离' },
      { type: 'uncomfortable', text: '感到不舒服，想回避' }
    ]
  },
  {
    id: 'qt_03',
    category: '诚实',
    scenario: '说实话会带来麻烦时，你会？',
    options: [
      { type: 'always_honest', text: '无论如何说实话' },
      { type: 'strategic', text: '看情况，选择性诚实' },
      { type: 'diplomatic', text: '诚实但注意方式' },
      { type: 'protective', text: '可能说谎保护自己或他人' }
    ]
  },
  {
    id: 'qt_04',
    category: '好奇心',
    scenario: '遇到不了解的事物时，你会？',
    options: [
      { type: 'deep_dive', text: '深入了解，直到搞清楚' },
      { type: 'casual', text: '了解一下，够用就行' },
      { type: 'selective', text: '只对感兴趣的深入了解' },
      { type: 'indifferent', text: '不太在意，不了解也没关系' }
    ]
  },
  {
    id: 'qt_05',
    category: '责任感',
    scenario: '你承诺的事情做不到时，你会？',
    options: [
      { type: 'honor', text: '无论如何做到' },
      { type: 'communicate', text: '提前沟通，说明困难' },
      { type: 'apologize', text: '道歉，尽量补救' },
      { type: 'rationalize', text: '找理由解释' }
    ]
  },
  {
    id: 'qt_06',
    category: '谦逊',
    scenario: '别人夸奖你时，你通常会？',
    options: [
      { type: 'humble', text: '谦虚，说自己还有很多不足' },
      { type: 'grateful', text: '感谢，接受夸奖' },
      { type: 'deflect', text: '转移话题，不太自在' },
      { type: 'internal', text: '内心高兴，但不表现出来' }
    ]
  },
  {
    id: 'qt_07',
    category: '勇敢',
    scenario: '面对恐惧时，你会？',
    options: [
      { type: 'face', text: '直面恐惧，勇敢面对' },
      { type: 'gradual', text: '慢慢克服，一步步来' },
      { type: 'avoid', text: '暂时回避，等准备好再说' },
      { type: 'support', text: '寻求支持，一起面对' }
    ]
  },
  {
    id: 'qt_08',
    category: '慷慨',
    scenario: '你愿意与他人分享你的资源吗？',
    options: [
      { type: 'very', text: '很愿意，分享让我快乐' },
      { type: 'selective', text: '看对象和情况' },
      { type: 'moderate', text: '适度分享，不亏待自己' },
      { type: 'conservative', text: '比较保守，先照顾好自己' }
    ]
  },
  {
    id: 'qt_09',
    category: '耐心',
    scenario: '等待或重复的事情让你感到？',
    options: [
      { type: 'patient', text: '很有耐心，可以等' },
      { type: 'adaptive', text: '看情况，重要的事可以等' },
      { type: 'impatient', text: '不太有耐心，喜欢效率' },
      { type: 'mindful', text: '用等待的时间做其他事' }
    ]
  },
  {
    id: 'qt_10',
    category: '创造力',
    scenario: '遇到问题时，你更倾向于？',
    options: [
      { type: 'creative', text: '想新的、独特的解决方案' },
      { type: 'proven', text: '用已经验证过的方法' },
      { type: 'collaborate', text: '和别人一起头脑风暴' },
      { type: 'research', text: '先研究别人怎么解决的' }
    ]
  },
  {
    id: 'qt_11',
    category: '自律',
    scenario: '没有人监督时，你会？',
    options: [
      { type: 'self_driven', text: '依然按计划执行' },
      { type: 'flexible', text: '适当放松，但不放纵' },
      { type: 'deadline', text: '需要截止日期才能行动' },
      { type: 'struggle', text: '很难自律，容易拖延' }
    ]
  },
  {
    id: 'qt_12',
    category: '真诚',
    scenario: '你和别人交往时，你会？',
    options: [
      { type: 'authentic', text: '完全真实，不伪装' },
      { type: 'selective', text: '看对象，对亲近的人真实' },
      { type: 'diplomatic', text: '注意场合，适当调整' },
      { type: 'protective', text: '保护自己，不完全展露' }
    ]
  }
];

/**
 * 记忆引导问题库（扩充到30+个）
 */
const DAILY_MEMORY_PROMPTS = [
  // 核心记忆
  '描述一个让你觉得最幸福的普通下午',
  '你童年最清晰的一个画面是什么？',
  '有没有一个人改变了你的人生轨迹？',
  '你坚持了很多年的一个小习惯是什么？',
  '说一件你至今感到骄傲的事',
  '你第一次感到真正独立是什么时候？',
  '有没有一个瞬间让你觉得自己长大了？',
  '你人生中最困难的一段时期是什么？你是怎么走过来的？',
  '你最感谢的一个人是谁？为什么？',
  '你最遗憾的一件事是什么？',
  
  // 关系记忆
  '你和最好的朋友是怎么认识的？',
  '你和家人之间最温暖的一个回忆是什么？',
  '有没有一个老师对你影响很大？',
  '你最难忘的一次告别是什么？',
  '你和某人和解的一个故事',
  
  // 日常记忆
  '你童年最喜欢的一个游戏或玩具是什么？',
  '你小时候的梦想是什么？',
  '你最喜欢的一个地方是哪里？为什么？',
  '你最喜欢的一首歌/一部电影，背后有什么故事？',
  '你养成的一个好习惯是什么？',
  
  // 情绪记忆
  '你最害怕的一件事是什么？',
  '你最愤怒的一次经历是什么？',
  '你最感动的一个瞬间是什么？',
  '你最孤独的一段时期是什么？',
  '你最快乐的一天是怎么过的？',
  
  // 成长记忆
  '你从父母身上学到的最重要的一件事是什么？',
  '你人生中的一个转折点是什么？',
  '你曾经相信但后来改变的一个观念是什么？',
  '你为自己做过的一个勇敢决定是什么？',
  '你希望年轻时就知道的一件事是什么？'
];

/**
 * 情感训练场景库
 */
const EMOTION_SCENARIOS = [
  {
    id: 'emo_01',
    scenario: '朋友深夜崩溃：我真的撑不住了',
    context: '朋友发来消息，情绪很低落',
    ask: '你会怎么回应？'
  },
  {
    id: 'emo_02',
    scenario: '伴侣说：我觉得你不够在乎我',
    context: '伴侣表达了对关系的不满',
    ask: '你会怎么回应？'
  },
  {
    id: 'emo_03',
    scenario: '父母说：我们老了，你不用担心我们',
    context: '父母试图减轻你的负担',
    ask: '你会怎么回应？'
  },
  {
    id: 'emo_04',
    scenario: '同事在会议上公开批评你的方案',
    context: '很多人在场，你觉得不公平',
    ask: '你会怎么回应？'
  },
  {
    id: 'emo_05',
    scenario: '孩子问：为什么人会死？',
    context: '孩子对死亡产生了好奇或恐惧',
    ask: '你会怎么回应？'
  },
  {
    id: 'emo_06',
    scenario: '朋友说：我要离开这个城市了',
    context: '好朋友即将远行',
    ask: '你会怎么回应？'
  },
  {
    id: 'emo_07',
    scenario: '你犯了一个大错误，影响了别人',
    context: '你需要面对自己的失误',
    ask: '你会怎么对自己说？'
  },
  {
    id: 'emo_08',
    scenario: '有人对你说：你变了',
    context: '朋友或家人觉得你和以前不一样了',
    ask: '你会怎么回应？'
  },
  {
    id: 'emo_09',
    scenario: '你收到了一个意想不到的好消息',
    context: '你非常开心，想分享',
    ask: '你会怎么表达？'
  },
  {
    id: 'emo_10',
    scenario: '你感到很疲惫，但还有很多事要做',
    context: '身体和心理都很累',
    ask: '你会怎么对自己说？'
  },
  {
    id: 'emo_11',
    scenario: '有人误解了你的意思',
    context: '你觉得很委屈',
    ask: '你会怎么回应？'
  },
  {
    id: 'emo_12',
    scenario: '你看到一个感人的故事',
    context: '你被深深触动了',
    ask: '你会怎么表达你的感受？'
  }
];

const SCENARIO_LIBRARY = {
  family: [
    '子女考试失利，如何安慰而不变成说教',
    '配偶提出一个你不同意的决定，如何表达异议',
    '父母身体不好，如何表达担心而不造成恐慌',
    '家庭聚餐冷场，你通常怎么活跃气氛',
    '孩子问了一个关于死亡的问题，你怎么回答',
    '家人之间有了误会，你会主动澄清吗',
    '你和父母的价值观冲突时，你怎么处理',
    '家人做了一个你不认同的人生选择，你会怎么表达',
    '家庭遇到经济困难，你会怎么和家人沟通',
    '你想对家人说一句一直没说出口的话，会是什么'
  ],
  friend: [
    '老朋友突然失联很久后联系你，你怎么回应',
    '朋友在低谷期向你倾诉，你的典型反应',
    '朋友请你帮一个你不太方便的忙，你怎么处理',
    '多年没见的朋友提起某个共同记忆，你怎么接话',
    '朋友做了一个你认为是错误的决定，你会怎么说',
    '朋友向你借钱，你会怎么处理',
    '朋友之间有了矛盾，你会怎么化解',
    '朋友取得了很大成就，你会怎么表达祝贺',
    '朋友向你道歉，你会怎么接受',
    '你想和一个朋友建立更深的友谊，你会怎么做'
  ],
  daily: [
    '有人向你推销，你怎么拒绝',
    '别人赞美你，你通常怎么反应',
    '你主动发起一个话题，你最常用什么开头',
    '对话陷入沉默，你倾向于打破还是等待',
    '你和陌生人聊天时，你通常会聊什么',
    '你想认识一个新朋友，你会怎么开口',
    '你收到了一个不想参加的邀请，你会怎么拒绝',
    '你想表达感谢，你会怎么说',
    '你想道歉，你会怎么说',
    '你想安慰一个不开心的人，你会怎么做'
  ]
};

const CONFLICT_SCENARIOS = [
  { id: 'truth_kindness', text: '知道一个朋友的秘密，对方配偶问起，你说吗？', dims: ['honesty', 'loyalty'] },
  { id: 'risk_stable', text: '一个机会有30%成功、收益极高，你做吗？', dims: ['risk', 'stability'] },
  { id: 'self_other', text: '牺牲自己的重要计划帮一个需要的朋友', dims: ['altruism'] },
  { id: 'rule_flex', text: '规则不合理，但打破它有代价，你怎么选？', dims: ['rule_compliance'] },
  { id: 'short_long', text: '立刻的快乐 vs 未来的回报，你的自然倾向', dims: ['delay_gratification'] },
  { id: 'emotion_rational', text: '理性上明知对，但情感上做不到', dims: ['emotion_priority'] },
  { id: 'white_lie', text: '善意的谎言能保护对方，你会说吗？', dims: ['honesty', 'kindness'] },
  { id: 'career_family', text: '事业晋升需要长期出差，家人需要你', dims: ['career', 'family'] },
  { id: 'public_private', text: '朋友在公共场合说了让你尴尬的话', dims: ['face', 'honesty'] },
  { id: 'money_lend', text: '不太熟的朋友借钱，数额不小', dims: ['trust', 'boundary'] },
  { id: 'elder_advice', text: '长辈给出你不认同的人生建议', dims: ['respect', 'autonomy'] },
  { id: 'team_credit', text: '团队成果 mainly 是你做的，领导只表扬了别人', dims: ['fairness', 'harmony'] },
  { id: 'health_work', text: '身体已经透支，项目 deadline 在即', dims: ['health', 'duty'] },
  { id: 'forgive_repeat', text: '朋友第三次犯同样的错伤害你', dims: ['forgiveness', 'boundary'] },
  { id: 'child_choice', text: '孩子想选的路和你期望完全不同', dims: ['control', 'support'] },
  { id: 'news_share', text: '看到令人不安的新闻，要不要告诉易焦虑的家人', dims: ['protection', 'honesty'] },
  { id: 'promise_break', text: '无法兑现对孩子的承诺', dims: ['integrity', 'comfort'] },
  { id: 'conflict_mediate', text: '两个亲近的人让你站队', dims: ['neutrality', 'loyalty'] },
  { id: 'charity_priority', text: '捐款有限，陌生求助 vs 亲友困难', dims: ['altruism', 'priority'] },
  { id: 'legacy_wish', text: '训练者设定的遗愿与家人意愿冲突', dims: ['autonomy', 'family'] },
  { id: 'privacy_security', text: '为了安全，是否愿意牺牲一些隐私', dims: ['privacy', 'security'] },
  { id: 'loyalty_truth', text: '好朋友做了一件你认为不对的事，你会说吗', dims: ['loyalty', 'honesty'] },
  { id: 'ambition_contentment', text: '你更追求成就还是满足', dims: ['ambition', 'contentment'] },
  { id: 'tradition_progress', text: '传统价值观和现代观念冲突时，你站哪边', dims: ['tradition', 'progress'] },
  { id: 'individual_collective', text: '个人利益和集体利益冲突时，你选哪个', dims: ['individual', 'collective'] },
  { id: 'forgive_justice', text: '有人伤害了你，你会选择原谅还是追求正义', dims: ['forgiveness', 'justice'] },
  { id: 'hope_realism', text: '你更倾向于保持希望还是面对现实', dims: ['hope', 'realism'] },
  { id: 'stability_growth', text: '你更看重稳定还是成长', dims: ['stability', 'growth'] },
  { id: 'self_care_care_others', text: '照顾自己和照顾他人，你更倾向哪个', dims: ['self_care', 'care_others'] },
  { id: 'depth_breadth', text: '你更喜欢深入一个领域还是广泛涉猎', dims: ['depth', 'breadth'] }
];

const CHECKLIST_TARGETS = {
  voice_minutes: 30,
  core_memories: 80,
  relationship_people: 5,
  scenario_per_category: 5,
  conflict_tests: 20,
  deep_emotion_sessions: 3,
  blind_test_score: 7,
  overall_progress: 0.80
};

module.exports = {
  MODULE_PROGRESS_CAP,
  LAYER_WEIGHTS,
  MODULE_WEIGHTS,
  STAGES,
  BLIND_TEST_MILESTONES,
  BLIND_TEST_PASS_SCORE,
  MEMORY_TIERS,
  RELATIONSHIP_TYPES,
  DEFAULT_INTIMACY,
  SCENARIO_LIBRARY,
  CONFLICT_SCENARIOS,
  DAILY_MEMORY_PROMPTS,
  CHECKLIST_TARGETS,
  // 新增核心层题库
  VALUE_CARDS,
  SELF_REGULATION_SCENARIOS,
  BOUNDARY_SCENARIOS,
  INTERPERSONAL_STYLE_SCENARIOS,
  PERSPECTIVE_SCENARIOS,
  INNER_ACTIVITY_SCENARIOS,
  MORAL_JUDGMENT_SCENARIOS,
  QUALITY_TRAITS_SCENARIOS,
  EMOTION_SCENARIOS
};
