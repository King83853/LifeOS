// smoke-test.js
// Run after every change: node smoke-test.js
// Catches console errors + broken rendering automatically.
// Screenshots go in ./smoke-screenshots/ for visual review (by you or Claude).
//
// Setup (one-time):
//   npm install --save-dev playwright
//   npx playwright install chromium

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const APP_PATH = path.join(__dirname, 'index.html'); // adjust if your file is named differently
const SCREENSHOT_DIR = path.join(__dirname, 'smoke-screenshots');

async function run() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);

  const browser = await chromium.launch();
  // Mobile viewport since this is a mobile web app
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone-ish
    hasTouch: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  console.log('Loading app...');
  await page.goto('file://' + APP_PATH);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-initial-load.png') });

  // --- Basic presence checks ---
  // Fill these in with your actual key elements/IDs as the app grows.
  // This is intentionally minimal to start — add checks as features solidify.
  const bodyText = await page.textContent('body');
  if (!bodyText || bodyText.trim().length === 0) {
    consoleErrors.push('CRITICAL: page body is empty on load');
  }

  // --- Example: test hamburger menu opens (adjust selector to your actual markup) ---
  try {
    const menuButton = await page.$('.hamburger-menu, [data-testid="menu-button"], #menu-btn');
    if (menuButton) {
      await menuButton.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-menu-open.png') });
    }
  } catch (e) {
    consoleErrors.push('Menu interaction failed: ' + e.message);
  }

  // --- Example: test a swipe gesture (adjust selector + coordinates to your actual UI) ---
  try {
    const swipeTarget = await page.$('.swipe-card, [data-testid="swipe-target"]');
    if (swipeTarget) {
      const box = await swipeTarget.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-after-swipe.png') });
      }
    }
  } catch (e) {
    consoleErrors.push('Swipe interaction failed: ' + e.message);
  }

  await browser.close();

  console.log('\n--- SMOKE TEST RESULTS ---');
  if (consoleErrors.length === 0) {
    console.log('PASS: no console errors detected.');
    console.log('Screenshots saved to ./smoke-screenshots/ — review visually for layout issues.');
    process.exit(0);
  } else {
    console.log('FAIL: errors detected:');
    consoleErrors.forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
}

run();
