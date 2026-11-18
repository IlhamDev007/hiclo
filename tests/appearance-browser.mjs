import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const cached = join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1254/chrome-win64/chrome.exe');
const profile = await mkdtemp(join(tmpdir(), 'hiclo-appearance-'));
const options = { executablePath: process.env.STILL_CHROMIUM || (existsSync(cached) ? cached : chromium.executablePath()), headless: true, viewport: { width: 418, height: 600 }, args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run'] };
let context;
const errors = [];
async function launch() {
  context = await chromium.launchPersistentContext(profile, options);
  context.setDefaultTimeout(10000); context.on('weberror', error => errors.push(error.error().message));
  return context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
}
async function snapshot(worker) {
  return worker.evaluate(() => chrome.storage.local.get(['settings', 'siteSettings', 'joy', 'joySites', 'joyImages']));
}
try {
  let worker = await launch(); const id = new URL(worker.url()).hostname;
  await worker.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      if ((await chrome.storage.local.get('joy')).joy) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Extension installation did not finish');
  });
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.equal(await popup.title(), 'Hiclo — Your little space of comfort');
  assert.equal(await popup.locator('.brand').getAttribute('aria-label'), 'Hiclo home');
  await popup.waitForFunction(() => document.querySelector('.brand img').complete && document.querySelector('.brand img').naturalWidth > 0);
  const original = await snapshot(worker);
  const other = await context.newPage();
  await other.goto(`chrome-extension://${id}/popup/popup.html`);
  await other.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await popup.bringToFront();
  const backgrounds = {};
  await mkdir(join(root, 'test-results'), { recursive: true });
  for (const theme of ['dark', 'light', 'dark', 'light']) {
    await popup.locator('#theme-toggle').click();
    await popup.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    await other.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    await worker.evaluate(async theme => { for (let i = 0; i < 40; i++) { if ((await chrome.storage.local.get('appearance')).appearance?.theme === theme) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error('Theme not saved'); }, theme);
    assert.equal(await popup.locator('#theme-menu').count(), 0);
    assert.equal(await popup.locator('.theme-moon').isVisible(), theme === 'dark');
    assert.equal(await popup.locator('.theme-sun').isVisible(), theme === 'light');
    await popup.waitForFunction(theme => getComputedStyle(document.body).backgroundColor === (theme === 'dark' ? 'rgb(21, 22, 36)' : 'rgb(246, 247, 253)'), theme);
    backgrounds[theme] = await popup.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
    for (const panel of ['display', 'privacy', 'window', 'joy']) {
      await popup.locator(`[data-panel="${panel}"]`).click();
      await popup.locator(`#${panel}`).evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      await popup.locator('main').evaluate(el => { el.scrollTop = 0; });
      await popup.locator('body').screenshot({ path: join(root, `test-results/hiclo-${theme}-${panel}.png`) });
    }
    assert.deepEqual(await snapshot(worker), original, 'Appearance must not rewrite page or Joy preferences');
  }
  assert.notEqual(backgrounds.light, backgrounds.dark);
  await other.locator('#theme-toggle').click();
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await other.reload();
  await other.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await other.locator('#theme-toggle').click();
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await popup.bringToFront();
  await popup.locator('#theme-toggle').focus(); await popup.keyboard.press('Enter');
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await popup.keyboard.press('Space');
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await popup.locator('#theme-toggle').evaluate(button => { for (let i = 0; i < 9; i++) button.click(); });
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await worker.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('appearance')).appearance?.theme === 'dark') { await new Promise(resolve => setTimeout(resolve, 100)); if ((await chrome.storage.local.get('appearance')).appearance?.theme === 'dark') return; } await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error('Theme not saved'); });
  await other.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await popup.reload(); await popup.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await popup.locator('[data-panel="joy"]').click(); await popup.locator('#reset-all').click();
  await popup.waitForFunction(() => document.getElementById('joy-message').textContent.includes('Joy reset'));
  assert.equal(await popup.locator('html').getAttribute('data-theme'), 'dark');
  await context.close(); worker = await launch();
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('appearance'))).appearance.theme, 'dark');
  const restored = await context.newPage(); await restored.goto(`chrome-extension://${id}/popup/popup.html`);
  await restored.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await restored.emulateMedia({ reducedMotion: 'reduce' }); await restored.locator('[data-panel="privacy"]').click();
  assert.equal(await restored.locator('#privacy').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.deepEqual(errors, []);
  console.log('PASS: Hiclo branding, repeated direct theme toggles and icons, keyboard controls, isolated appearance storage, reset isolation, reload/restart persistence, and reduced motion.');
} finally {
  await context?.close(); await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
