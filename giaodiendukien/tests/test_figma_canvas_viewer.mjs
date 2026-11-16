import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..');
const HTML_FILE_DOCS = path.join(REPO_ROOT, 'Documents', 'figma', 'figma_canvas_viewer.html');
const HTML_FILE_LOCAL = path.join(TEST_DIR, '..', 'figma', 'figma_canvas_viewer.html');
const HTML_FILE = fs.existsSync(HTML_FILE_DOCS) ? HTML_FILE_DOCS : HTML_FILE_LOCAL;
const FILE_URL = 'file:///' + HTML_FILE.replace(/\\/g, '/');
const CHROME_EXECUTABLE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function verifyFigmaViewer() {
  console.log(`Starting headless Chrome verification for: ${FILE_URL}`);
  
  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: true,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(FILE_URL, { waitUntil: 'load' });
  console.log('Page loaded successfully.');

  let passedTotal = 0;

  // 1. Test Hi-Fi Mode
  console.log('\n--- TESTING MODE 1: GIAO DIỆN DỰ KIẾN (HI-FI) ---');
  await page.click('#btnTabHifi');
  await page.waitForTimeout(200);

  let frameItems = await page.$$('.frame-item');
  console.log(`Found ${frameItems.length} Hi-Fi items.`);
  assert.equal(frameItems.length, 17, 'Should have 17 Hi-Fi items');

  for (let i = 0; i < frameItems.length; i++) {
    const item = frameItems[i];
    const itemText = (await item.innerText()).split('\n')[0].trim();
    await item.click();
    await page.waitForTimeout(100);

    const check = await page.evaluate(() => {
      const stage = document.getElementById('artboardStage');
      if (!stage) return { ok: false, error: 'artboardStage missing' };
      const svg = stage.querySelector('svg');
      if (!svg) return { ok: false, error: 'no svg in stage' };
      const bbox = svg.getBoundingClientRect();
      if (bbox.width === 0 || bbox.height === 0) return { ok: false, error: 'zero bbox' };
      return { ok: true, width: Math.round(bbox.width), height: Math.round(bbox.height) };
    });

    if (check.ok) {
      console.log(`  ✅ [${i + 1}/17] PASS: ${itemText} (${check.width}x${check.height})`);
      passedTotal++;
    } else {
      console.error(`  ❌ [${i + 1}/17] FAIL: ${itemText} -> ${check.error}`);
    }
  }

  // 2. Test Wireframe Mode
  console.log('\n--- TESTING MODE 2: PHÁC THẢO KHUNG DÂY (WIREFRAME) ---');
  await page.click('#btnTabWf');
  await page.waitForTimeout(200);

  frameItems = await page.$$('.frame-item');
  console.log(`Found ${frameItems.length} Wireframe items.`);
  assert.equal(frameItems.length, 17, 'Should have 17 Wireframe items');

  for (let i = 0; i < frameItems.length; i++) {
    const item = frameItems[i];
    const itemText = (await item.innerText()).split('\n')[0].trim();
    await item.click();
    await page.waitForTimeout(100);

    const check = await page.evaluate(() => {
      const stage = document.getElementById('artboardStage');
      if (!stage) return { ok: false, error: 'artboardStage missing' };
      const svg = stage.querySelector('svg');
      if (!svg) return { ok: false, error: 'no svg in stage' };
      const bbox = svg.getBoundingClientRect();
      if (bbox.width === 0 || bbox.height === 0) return { ok: false, error: 'zero bbox' };
      return { ok: true, width: Math.round(bbox.width), height: Math.round(bbox.height) };
    });

    if (check.ok) {
      console.log(`  ✅ [${i + 1}/17] PASS: ${itemText} (${check.width}x${check.height})`);
      passedTotal++;
    } else {
      console.error(`  ❌ [${i + 1}/17] FAIL: ${itemText} -> ${check.error}`);
    }
  }

  // 3. Test Clipboard Copy execution
  console.log('\n--- TESTING CLIPBOARD COPY ACTION ---');
  await page.evaluate(() => copySvgToClipboard());
  const toastText = await page.evaluate(() => document.getElementById('toast').innerText);
  console.log('Toast message verified:', toastText);
  assert.ok(toastText.includes('Đã sao chép'), 'Toast should confirm copy');

  await browser.close();

  console.log(`\n========================================`);
  console.log(`RESULT: ${passedTotal}/34 frames (17 Hi-Fi + 17 Wireframe) verified successfully!`);
  console.log(`========================================\n`);

  if (passedTotal === 34) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

verifyFigmaViewer().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
