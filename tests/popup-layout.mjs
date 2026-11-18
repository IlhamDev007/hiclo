import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const cached = join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1254/chrome-win64/chrome.exe');
const profile = await mkdtemp(join(tmpdir(), 'still-popup-'));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.STILL_CHROMIUM || (existsSync(cached) ? cached : chromium.executablePath()), headless: true, viewport: null,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run', '--window-size=1200,900']
  });
  context.setDefaultTimeout(10000);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  await worker.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      if ((await chrome.storage.local.get('joy')).joy) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Extension installation did not finish');
  });
  const original = await worker.evaluate(() => chrome.storage.local.get(['settings', 'siteSettings', 'joy', 'joySites', 'joyImages']));
  await worker.evaluate(() => {
    const setIcon = chrome.action.setIcon.bind(chrome.action);
    globalThis.appearanceIcons = [];
    chrome.action.setIcon = async details => {
      await setIcon(details);
      globalThis.appearanceIcons.push(details);
    };
  });
  const browserCDP = await context.browser().newBrowserCDPSession();
  await worker.evaluate(() => chrome.action.openPopup());
  const targets = (await browserCDP.send('Target.getTargets')).targetInfos;
  const target = targets.find(target => target.url === `chrome-extension://${id}/popup/popup.html`);
  assert.ok(target, 'Chrome must create a real toolbar popup target');
  // Chrome toolbar bubbles are not exposed by Playwright's normal page list.
  // Attach to the actual target to measure its real auto-sized viewport.
  let { sessionId } = await browserCDP.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let nextId = 0;
  const pending = new Map();
  browserCDP.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++nextId;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 10000);
      pending.set(requestId, { resolve, reject, timer });
      browserCDP.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: requestId, method, params }) }).catch(reject);
    });
  }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  let geometry;
  for (let i = 0; i < 60; i++) {
    geometry = await evaluate(`(() => { const main = document.querySelector('main'); if (!main || !document.documentElement.dataset.view) return null; return { view: document.documentElement.dataset.view, rootHeight: innerHeight, bodyHeight: document.body.getBoundingClientRect().height, mainHeight: main.clientHeight, width: document.body.clientWidth, footer: document.querySelector('footer').getBoundingClientRect().bottom }; })()`);
    if (geometry?.view === 'popup' && geometry.bodyHeight === Math.min(600, geometry.rootHeight)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(geometry.view, 'popup', JSON.stringify(geometry));
  assert.equal(geometry.bodyHeight, Math.min(600, geometry.rootHeight), JSON.stringify(geometry));
  assert.equal(geometry.width, 418);
  assert.ok(geometry.mainHeight >= Math.min(350, geometry.rootHeight - 180), JSON.stringify(geometry));
  assert.ok(geometry.footer <= geometry.rootHeight + 1, JSON.stringify(geometry));
  await mkdir(join(root, 'test-results'), { recursive: true });
  await evaluate('document.fonts.ready.then(() => true)');
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'test-results/native-popup.png'), Buffer.from(screenshot.data, 'base64'));
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light', 'Opening must not toggle the default theme');
  await evaluate('document.getElementById("theme-toggle").click()');
  for (let i = 0; i < 50; i++) {
    if (await evaluate('getComputedStyle(document.body).backgroundColor') === 'rgb(21, 22, 36)') break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  assert.equal(await evaluate('document.getElementById("theme-menu")'), null);
  const darkShot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'test-results/hiclo-native-dark.png'), Buffer.from(darkShot.data, 'base64'));
  for (const panel of ['privacy', 'window', 'joy', 'display']) {
    await evaluate(`document.querySelector('[data-panel="${panel}"]').click()`);
    assert.ok(await evaluate('document.querySelector("main").clientHeight') >= Math.min(350, geometry.rootHeight - 180));
    assert.equal(await evaluate('(() => { const main=document.querySelector("main");main.scrollTop=main.scrollHeight;const reachable=main.scrollTop+main.clientHeight>=main.scrollHeight-1;main.scrollTop=0;return reachable; })()'),true);
  }
  await browserCDP.send('Target.closeTarget', { targetId: target.targetId });
  for (const theme of ['dark', 'dark', 'dark']) {
    // Chrome may still be dismissing the previous toolbar bubble.
    await worker.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        try { await chrome.action.openPopup(); return; } catch (error) { if (i === 49) throw error; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    });
    const next = (await browserCDP.send('Target.getTargets')).targetInfos.find(target => target.url === `chrome-extension://${id}/popup/popup.html`);
    assert.ok(next);
    ({ sessionId } = await browserCDP.send('Target.attachToTarget', { targetId: next.targetId, flatten: false }));
    for (let i = 0; i < 100; i++) {
      if (await evaluate('document.documentElement.dataset.theme') === theme && await worker.evaluate(async theme => (await chrome.storage.local.get('appearance')).appearance?.theme === theme, theme)) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(await evaluate('document.documentElement.dataset.theme'), theme);
    assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('appearance')).appearance.theme), theme);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.theme-${theme === 'dark' ? 'moon' : 'sun'}')).display !== 'none'`), true);
    await browserCDP.send('Target.closeTarget', { targetId: next.targetId });
    assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('appearance')).appearance.theme), theme, 'Closing must not toggle');
  }
  const icons = await worker.evaluate(() => globalThis.appearanceIcons);
  assert.equal(icons.length, 0, 'Theme changes must not replace the original toolbar logo');
  assert.deepEqual(await worker.evaluate(() => chrome.runtime.getManifest().action.default_icon), { '16': 'icons/16.png', '32': 'icons/32.png', '48': 'icons/48.png', '128': 'icons/128.png' });
  assert.deepEqual(await worker.evaluate(() => chrome.storage.local.get(['settings', 'siteSettings', 'joy', 'joySites', 'joyImages'])), original);
  // A tiny initial viewport must not feed back into action-popup dimensions.
  const small = await context.newPage(); await small.setViewportSize({ width: 320, height: 200 });
  await small.addInitScript(() => { chrome.extension.getViews = () => [window]; });
  await small.goto(`chrome-extension://${id}/popup/popup.html`);
  assert.equal(await small.locator('html').evaluate(el => el.getBoundingClientRect().height), 600);
  assert.equal(await small.locator('html').evaluate(el => getComputedStyle(el).minHeight), '600px');
  console.log('PASS: repeated toolbar-popup openings preserve the manually selected theme and Hiclo toolbar logo, other preferences stay intact, and the 418 x 600 popup keeps every section scrollable.');
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
