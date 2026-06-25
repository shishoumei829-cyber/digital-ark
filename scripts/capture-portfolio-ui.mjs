import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';

const outDir = process.argv[2] || path.join(process.cwd(), 'portfolio-ui');
const base = 'http://127.0.0.1:3000';

const shots = [
  { url: `${base}/apps/sanctuary.html`, file: 'ui-sanctuary.png' },
  { url: `${base}/apps/training.html`, file: 'ui-training.png' },
  { url: `${base}/apps/companion.html`, file: 'ui-companion.png' },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 });
for (const { url, file } of shots) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('.phone').first().screenshot({ path: path.join(outDir, file) });
  console.log('saved', file);
}
await browser.close();
