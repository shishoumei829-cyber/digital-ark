'use strict';

/**
 * 数字分身生命周期状态（产品向，非技术状态机）
 */
const STATUS = {
  draft: { id: 'draft', label: '草稿', desc: '尚未完成基本信息' },
  training: { id: 'training', label: '训练中', desc: '正在积累人格样本' },
  ready: { id: 'ready', label: '可试聊', desc: '可校准，尚未授权陪护' },
  published: { id: 'published', label: '可陪护', desc: '已授权对象可进入陪护端' }
};

function resolveTwinStatus({ setupComplete, personalityFit = 0, authorizedCount = 0, minFitForReady = 0.25 }) {
  if (!setupComplete) return { ...STATUS.draft, fit_pct: 0 };
  const fit = personalityFit || 0;
  const fitPct = Math.round(fit * 100);
  if (authorizedCount > 0 && fit >= minFitForReady) {
    return { ...STATUS.published, fit_pct: fitPct };
  }
  if (fit >= minFitForReady) {
    return { ...STATUS.ready, fit_pct: fitPct };
  }
  return { ...STATUS.training, fit_pct: fitPct };
}

module.exports = { STATUS, resolveTwinStatus };
