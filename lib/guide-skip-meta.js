'use strict';

/**
 * 引导题跳过 — 用户看到的是「具体情境/场景」，不是五层模块名。
 * 跳过 = 本题暂不记录，进入课程里的下一道训练题（可能是另一场景、另一模块）。
 */

function formatTaskSceneLabel(task) {
  if (!task) return '';
  const text = String(
    task.scene
    || task.scenario
    || task.question
    || task.prompt
    || (task.literary_text ? task.literary_text.replace(/^[（(][^）)]*[）)]\s*/, '') : '')
    || ''
  ).trim();
  if (!text) return '';
  return text.length > 30 ? `${text.slice(0, 30)}…` : text;
}

/**
 * @param {object|null} skippedTask 刚跳过的原始题目
 * @param {object|null} nextTask 下一道原始题目（来自 curriculum）
 */
function resolveGuideSkip(skippedTask, nextTask, skipReason) {
  const skipped_scene = formatTaskSceneLabel(skippedTask);
  const next_scene = formatTaskSceneLabel(nextTask);

  let message;
  if (skipped_scene && next_scene) {
    message = `「没印象」— 已跳过「${skipped_scene}」，下一道：${next_scene}`;
  } else if (skipped_scene) {
    message = `「没印象」— 已跳过「${skipped_scene}」，进入下一道训练题`;
  } else if (next_scene) {
    message = `「没印象」— 本题已跳过，下一道：${next_scene}`;
  } else {
    message = '「没印象」— 本题已跳过，进入下一道训练题';
  }

  return {
    skip_reason: skipReason || 'no_impression',
    skipped_scene: skipped_scene || null,
    next_scene: next_scene || null,
    message,
    feedback: message
  };
}

module.exports = { formatTaskSceneLabel, resolveGuideSkip };
