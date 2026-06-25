'use strict';

/**
 * 数字方舟 - 基础测试
 */

const { PADManager } = require('./cognitive/pad');
const { MotivationSystem } = require('./cognitive/motivation');
const { StrategyLayer } = require('./cognitive/strategy');
const { BehaviorDecision } = require('./cognitive/behavior');
const { MemorySystem } = require('./lib/memory');
const { TrainingSystem } = require('./lib/training');
const { CompanionSystem } = require('./lib/companion');

console.log('══════════════════════════════════════════════════════════');
console.log('  数字方舟 - 模块测试');
console.log('══════════════════════════════════════════════════════════');
console.log('');

// 测试PAD管理器
console.log('测试 PAD 管理器...');
try {
  const padManager = new PADManager('./test_data');
  const pad = padManager.load();
  console.log('✓ PAD 管理器加载成功:', pad);
  
  const emotion = padManager.inferEmotion('今天很开心');
  console.log('✓ 情感推断成功:', emotion);
  
  const desc = padManager.toNaturalLanguage(pad);
  console.log('✓ 自然语言描述:', desc);
} catch (e) {
  console.error('✗ PAD 管理器测试失败:', e.message);
}

console.log('');

// 测试动机系统
console.log('测试 动机系统...');
try {
  const motivationSystem = new MotivationSystem('./test_data');
  const state = motivationSystem.getState();
  console.log('✓ 动机系统加载成功:', state);
} catch (e) {
  console.error('✗ 动机系统测试失败:', e.message);
}

console.log('');

// 测试策略层
console.log('测试 策略层...');
try {
  const strategyLayer = new StrategyLayer('./test_data');
  const strategy = strategyLayer.load();
  console.log('✓ 策略层加载成功:', strategy);
  
  const desc = strategyLayer.describe(strategy);
  console.log('✓ 策略描述:', desc);
} catch (e) {
  console.error('✗ 策略层测试失败:', e.message);
}

console.log('');

// 测试行为决策
console.log('测试 行为决策...');
try {
  const behaviorDecision = new BehaviorDecision();
  const candidates = behaviorDecision.generateCandidates(
    { P: 0.5, A: 0.3, D: 0.6, S: 0.4 },
    { desire_closeness: 0.5, fear_rejection: 0.3, curiosity: 0.6 },
    { getRecentBehaviors: () => [] },
    '今天天气真好'
  );
  console.log('✓ 行为候选生成成功，数量:', candidates.length);
  console.log('  最佳行为:', candidates[0].name);
} catch (e) {
  console.error('✗ 行为决策测试失败:', e.message);
}

console.log('');

// 测试记忆系统
console.log('测试 记忆系统...');
try {
  const memorySystem = new MemorySystem('./test_data');
  console.log('✓ 记忆系统加载成功，事件数:', memorySystem.events.length);
} catch (e) {
  console.error('✗ 记忆系统测试失败:', e.message);
}

console.log('');

// 测试训练系统
console.log('测试 训练系统...');
try {
  const trainingSystem = new TrainingSystem('./test_data');
  const progress = trainingSystem.getProgress();
  console.log('✓ 训练系统加载成功，总进度:', progress.overall_progress);
} catch (e) {
  console.error('✗ 训练系统测试失败:', e.message);
}

console.log('');

// 测试陪护系统
console.log('测试 陪护系统...');
try {
  const companionSystem = new CompanionSystem('./test_data');
  const status = companionSystem.getStatus();
  console.log('✓ 陪护系统加载成功:', status.digital_avatar.name);
} catch (e) {
  console.error('✗ 陪护系统测试失败:', e.message);
}

console.log('');
console.log('══════════════════════════════════════════════════════════');
console.log('  测试完成');
console.log('══════════════════════════════════════════════════════════');
