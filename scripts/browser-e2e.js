'use strict';

/**
 * 浏览器自动化走查 — Playwright 驱动真实 UI 流程
 * 运行: npm run browser-e2e
 * 首次: npx playwright install chromium
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const TEST_DIR = path.join(os.tmpdir(), 'da_browser_' + Date.now());
const PORT = 3096;
const BASE = `http://127.0.0.1:${PORT}`;

const checks = [];
function ok(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail: detail || '' });
  console.log((pass ? '[OK]' : '[FAIL]') + ' ' + name + (detail ? ' :: ' + detail.slice(0, 120) : ''));
}

async function waitHealth(maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function runPersonalSetup(page) {
  await page.waitForSelector('#daSetupOverlay', { state: 'visible', timeout: 8000 });
  await page.getByRole('button', { name: '为真实的人训练数字分身' }).click();
  await page.fill('#daSetupSubject', '张奶奶');
  await page.locator('#daSetupNext1').click();
  await page.fill('#daSetupTrainer', '张明');
  await page.selectOption('#daSetupRole', 'child');
  await page.locator('#daSetupNext2').click();
  await page.fill('#daSetupPersonName', '李叔叔');
  await page.selectOption('#daSetupPersonType', 'friend');
  await page.locator('#daSetupAddPerson').click();
  await page.locator('#daSetupNext3').click();
  await page.waitForSelector('#daSetupOverlay', { state: 'hidden', timeout: 8000 });
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('请先安装: npm install -D playwright && npx playwright install chromium');
    process.exit(1);
  }

  fs.mkdirSync(TEST_DIR, { recursive: true });
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: TEST_DIR, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const okHealth = await waitHealth();
  ok('服务启动', okHealth);
  if (!okHealth) {
    server.kill();
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. 打开训练端
    await page.goto(BASE + '/apps/training.html', { waitUntil: 'networkidle' });
    ok('训练页加载', /训练端|数字方舟/.test(await page.title()), await page.title());

    // 2. 未设定时试聊应禁用
    const chatInput0 = page.locator('#p0 input[type="text"]');
    ok('未设定时试聊禁用', await chatInput0.isDisabled());

    // 3. 设定向导
    await runPersonalSetup(page);
    ok('完成身份设定向导', !(await page.locator('#daSetupOverlay').isVisible()));

    // 4. 进入训练总览 tab
    await page.locator('#n1').click();
    await page.waitForSelector('#p1.on', { timeout: 5000 });

    // 4. 引导 hub 显示 subject
    const hub = page.locator('.da-guide-hub');
    await hub.waitFor({ state: 'visible', timeout: 5000 });
    const hubText = await hub.innerText();
    ok('引导 hub 含分身名', hubText.includes('张奶奶'), hubText.slice(0, 80));

    // 5. p0 试聊可用 — 先切回陪伴 tab
    await page.locator('#n0').click();
    const chatInput = page.locator('#p0 input[type="text"]');
    ok('试聊输入已启用', !(await chatInput.isDisabled()));

    // 6. 进入记忆训练
    await page.locator('#n1').click();
    await page.locator('#p1 .module-row').filter({ hasText: '记忆训练' }).click();
    await page.waitForSelector('#p3.on', { timeout: 5000 });
    const prompt = await page.locator('.da-mem-prompt').innerText();
    ok('记忆题个性化', prompt.includes('张奶奶') || prompt.includes('家'), prompt);

    // 7. 提交记忆并换题
    const oldPrompt = prompt;
    await page.locator('#p3 textarea').fill('那是一个冬天，张奶奶在厨房教我做她拿手的汤，蒸汽模糊了眼镜片。');
    await page.locator('#p3 .btn-p').click();
    await page.waitForTimeout(1200);
    const newPrompt = await page.locator('.da-mem-prompt').innerText();
    ok('提交后题目变化', newPrompt !== oldPrompt, newPrompt.slice(0, 60));

    // 8. 审查页个人模式
    await page.goto(BASE + '/apps/persona-review.html');
    await page.waitForSelector('#title', { timeout: 5000 });
    const reviewTitle = await page.locator('#title').innerText();
    ok('审查页显示分身名', reviewTitle.includes('张奶奶'), reviewTitle);

  } catch (e) {
    ok('浏览器走查异常', false, e.message);
    try {
      await page.screenshot({ path: path.join(__dirname, 'browser-e2e-fail.png'), fullPage: true });
      console.log('截图已保存: scripts/browser-e2e-fail.png');
    } catch {}
  } finally {
    await browser.close();
    server.kill();
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  }

  const failed = checks.filter(c => !c.pass);
  console.log('\n---');
  console.log(`浏览器走查: ${checks.length - failed.length}/${checks.length} 通过`);
  if (failed.length) {
    failed.forEach(f => console.log('  FAIL:', f.name, f.detail));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
