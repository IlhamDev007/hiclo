import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const root = resolve(import.meta.dirname, '..');
const cachedChromium = join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1254', 'chrome-win64', 'chrome.exe');
const executablePath = process.env.STILL_CHROMIUM || (existsSync(cachedChromium) ? cachedChromium : chromium.executablePath());
const profile = await mkdtemp(join(tmpdir(), 'still-test-'));
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html><head><title>Original page</title><link rel="icon" href="/original.svg" type="image/svg+xml"></head><body style="background:#fff;color:#111"><h1>Test workspace</h1><button id="clickable" onclick="this.textContent='Clicked'">Click me</button><div style="position:fixed;bottom:0">Fixed content</div><video id="test-video" muted autoplay controls width="480" height="270"></video><script>
  const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 270;
  const ctx = canvas.getContext('2d'); let count = 0;
  setInterval(() => { ctx.fillStyle = count++ % 2 ? '#287e58' : '#2e8962'; ctx.fillRect(0,0,480,270); ctx.fillStyle = 'white'; ctx.font = '30px sans-serif'; ctx.fillText('Still video test', 100, 140); }, 50);
  document.querySelector('video').srcObject = canvas.captureStream(20);
  </script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let context;
const errors = [];
async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    executablePath, headless: true, viewport: null,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run']
  });
  context.on('weberror', error => errors.push(error.error().message));
  context.setDefaultTimeout(10000);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  return worker;
}
try {
  let worker = await launch();
  const id = new URL(worker.url()).hostname;
  const page = await context.newPage();
  await page.goto(origin);
  const popup = await context.newPage();
  const testTabId = await worker.evaluate(async url => (await chrome.tabs.query({ url: url + '/' }))[0].id, origin);
  // A normal extension popup targets the active web tab. This test opens its
  // document as a tab, so supply that same active-web-tab context explicitly.
  await popup.addInitScript(tabId => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = options => options.active ? chrome.tabs.get(tabId).then(tab => [tab]) : query(options);
  }, testTabId);
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.waitForFunction(() => document.getElementById('save-status').textContent === 'Saved on this device');
  const patch = value => worker.evaluate(async value => {
    const old = (await chrome.storage.local.get('settings')).settings;
    await chrome.storage.local.set({ settings: { ...old, ...value } });
  }, value);
  await popup.locator('#brightness').fill('0');
  await popup.locator('#scope-all').click();
  await popup.waitForFunction(() => document.getElementById('save-status').textContent === 'Saved on this device');
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.brightness), 0);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0)'));
  await patch({ brightness: 75, mode: 'warm', intensity: 60 });
  await page.waitForFunction(() => [...document.querySelectorAll('div')].some(el => el.style.backdropFilter.includes('brightness(0.75)')));
  await page.locator('#clickable').click();
  assert.equal(await page.locator('#clickable').textContent(), 'Clicked');
  for (const [mode, effect] of [['grayscale', 'grayscale(0.6)'], ['natural', 'brightness(0.75)']]) {
    await patch({ mode });
    await page.waitForFunction(effect => [...document.querySelectorAll('div')].some(el => el.style.backdropFilter.includes(effect)), effect);
  }
  // Even legacy or externally written settings cannot brighten a page.
  await patch({ brightness: 150, mode: 'night' });
  await page.waitForFunction(() => !document.querySelector('div[aria-hidden="true"]'));
  await patch({ brightness: 75 });
  await patch({ hideTitle: true, hideIcon: true, tabTitle: 'Workspace', tabIcon: 'dot' });
  await page.waitForFunction(() => document.title === 'Workspace');
  assert.ok((await page.locator('link[rel="icon"]').first().getAttribute('href')).startsWith('data:image/svg+xml,'));
  await page.evaluate(() => {
    document.title = 'Live notification';
    document.querySelector('link[rel="icon"]').setAttribute('href', '/updated.svg');
    const link = document.createElement('link'); link.rel = 'icon'; link.href = '/new.svg'; document.head.append(link);
  });
  await page.waitForFunction(() => document.title === 'Workspace' && [...document.querySelectorAll('link[rel="icon"]')].every(el => el.getAttribute('href').startsWith('data:')));
  await patch({ tabTitle: 'Focus', tabIcon: 'leaf' });
  await page.waitForFunction(() => document.title === 'Focus');
  await patch({ enabled: false });
  await page.waitForFunction(() => document.title === 'Live notification');
  assert.equal(await page.locator('link[rel="icon"]').count(), 2);
  assert.equal(await page.locator('link[rel="icon"]').first().getAttribute('href'), '/updated.svg');
  assert.equal(await page.locator('link[rel="icon"]').nth(1).getAttribute('href'), '/new.svg');
  assert.equal(await page.locator('div[aria-hidden="true"]').count(), 0);
  await patch({ enabled: true });
  await page.waitForFunction(() => document.title === 'Focus');
  await page.reload();
  await page.waitForFunction(() => document.title === 'Focus');
  await patch({ hideTitle: false, hideIcon: false, mode: 'natural', brightness: 100 });
  await page.waitForFunction(() => document.title === 'Original page');

  // Reproduce the reported order: change brightness FIRST, then apply to site.
  const other = await context.newPage();
  const otherOrigin = origin.replace('127.0.0.1', 'localhost');
  await other.goto(otherOrigin);
  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('page-status-text').textContent === 'Ready on this page');
  assert.equal(await popup.locator('[data-mode]').count(), 3);
  assert.equal(await popup.locator('#brightness').getAttribute('max'), '100');
  assert.equal(await popup.locator('#brightness').getAttribute('min'), '0');
  await popup.locator('#brightness').fill('1');
  await popup.locator('#dimmer').click();
  assert.equal(await popup.locator('#brightness').inputValue(), '0');
  assert.equal(await popup.locator('#dimmer').isDisabled(), true);
  assert.equal(await popup.locator('#brightness-value').textContent(), '0%');
  await page.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0)'));
  await popup.locator('#scope-site').click();
  await popup.waitForFunction(() => document.getElementById('save-status').textContent === 'Saved on this device');
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('siteSettings')).siteSettings['127.0.0.1'].brightness), 0);
  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('brightness-value').textContent === '0%');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0)'));
  await popup.locator('#brighter').click();
  assert.equal(await popup.locator('#brightness').inputValue(), '5');
  await popup.locator('#brightness-reset').click();
  assert.equal(await popup.locator('#brightness').inputValue(), '100');
  await popup.locator('#use-global').click();
  await popup.waitForFunction(() => document.getElementById('save-status').textContent === 'Saved on this device');
  await popup.locator('#brightness').fill('45');
  await popup.locator('[data-mode="warm"]').click();
  await page.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.45)'));
  assert.equal(await other.locator('div[aria-hidden="true"]').count(), 0);
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.brightness), 100);
  const freshOther = await context.newPage();
  await freshOther.goto(otherOrigin + '/new-tab-before-save');
  assert.equal(await freshOther.locator('div[aria-hidden="true"]').count(), 0);
  await popup.locator('#scope-site').click();
  await popup.waitForFunction(() => document.getElementById('save-status').textContent === 'Saved on this device');
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.brightness), 100);
  assert.equal(await other.locator('div[aria-hidden="true"]').count(), 0);
  const revisit = await context.newPage();
  await revisit.goto(origin + '/same-domain-new-tab');
  await revisit.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.45)'));
  await freshOther.reload();
  assert.equal(await freshOther.locator('div[aria-hidden="true"]').count(), 0);

  // Further edits automatically update the current site, including its other tabs.
  await popup.locator('#brightness').fill('55');
  await popup.locator('[data-mode="grayscale"]').click();
  await page.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('grayscale(1)'));
  await revisit.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.55)'));
  await popup.locator('#scope-site').click();
  await revisit.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.55)'));
  assert.equal(await other.locator('div[aria-hidden="true"]').count(), 0);

  // Closing/reloading the popup preserves automatically saved edits.
  await popup.locator('#brightness').fill('35');
  await page.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.35)'));
  await popup.reload();
  await page.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.35)'));
  await popup.waitForFunction(() => document.getElementById('brightness').value === '35');

  // Only the explicit All Websites action changes the global baseline.
  await popup.locator('#brightness').fill('80');
  await popup.locator('[data-mode="warm"]').click();
  assert.equal(await other.locator('div[aria-hidden="true"]').count(), 0);
  await popup.locator('#scope-all').click();
  for (const tab of [page, other, freshOther, revisit]) await tab.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.8)'));
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('siteSettings')).siteSettings['127.0.0.1'].active), false);

  // Critical second regression: edit while the previous scope is GLOBAL, then
  // choose SITE. Global settings and unrelated/new tabs must remain at 80%.
  await popup.locator('#brightness').fill('65');
  await popup.locator('[data-mode="grayscale"]').click();
  await page.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.65)'));
  await popup.locator('#scope-site').click();
  await popup.waitForFunction(() => document.getElementById('save-status').textContent === 'Saved on this device');
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.brightness), 80);
  for (const tab of [other, freshOther]) assert.ok((await tab.locator('div[aria-hidden="true"]').getAttribute('style')).includes('brightness(0.8)'));
  await freshOther.goto(otherOrigin + '/new-tab-after-site-save');
  await freshOther.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.8)'));

  await popup.locator('#use-global').click();
  await page.waitForFunction(() => document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.8)'));
  assert.equal(await worker.evaluate(async () => Object.hasOwn((await chrome.storage.local.get('siteSettings')).siteSettings, '127.0.0.1')), false);
  assert.equal(await popup.locator('#use-global').isDisabled(), true);
  await popup.locator('#brightness').fill('65');
  await popup.locator('[data-mode="warm"]').click();
  await popup.locator('#scope-site').click();
  await popup.waitForFunction(() => document.getElementById('save-status').textContent === 'Saved on this device');
  await revisit.close(); await freshOther.close();
  const bar = await popup.locator('#display-apply').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top + scrollY, bottom: rect.bottom + scrollY };
  });
  assert.ok(bar.top > 0 && bar.bottom <= Math.min(600, popup.viewportSize()?.height || 600) + 1, JSON.stringify(bar));

  // Real native PiP, entered via the popup's user gesture, not a stub API.
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('video-status').textContent.includes('Video ready'));
  await popup.locator('#pop-video').click();
  await page.waitForFunction(() => !!document.pictureInPictureElement);
  await popup.locator('#video-play').click();
  await page.waitForFunction(() => document.querySelector('video').paused);
  await popup.locator('#video-play').click();
  await page.waitForFunction(() => !document.querySelector('video').paused);
  await popup.locator('#video-mute').click();
  await page.waitForFunction(() => !document.querySelector('video').muted);
  await other.bringToFront();
  assert.equal(await page.evaluate(() => !!document.pictureInPictureElement), true);
  await popup.locator('#pop-video').click();
  await page.waitForFunction(() => !document.pictureInPictureElement);
  // Live streams cannot seek: surface the real limitation rather than pretend.
  await popup.locator('#pop-video').click();
  await page.waitForFunction(() => !!document.pictureInPictureElement);
  await popup.locator('[data-video="forward"]').click();
  await popup.waitForFunction(() => document.getElementById('video-status').textContent.includes('Seeking is unavailable'));
  await popup.locator('#pop-video').click();
  await page.waitForFunction(() => !document.pictureInPictureElement);
  // Prefer a playing video in a permitted cross-origin frame over a paused one.
  await page.evaluate(url => {
    document.querySelector('video').pause();
    const iframe = document.createElement('iframe');
    iframe.src = url + '/embedded'; iframe.allow = 'picture-in-picture; autoplay'; iframe.id = 'embedded';
    document.body.append(iframe);
  }, otherOrigin);
  const embedded = await page.waitForEvent('framenavigated', { predicate: frame => frame.url().endsWith('/embedded') });
  await embedded.waitForFunction(() => document.querySelector('video').readyState >= 2 && !document.querySelector('video').paused);
  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('video-status').textContent.includes('Video ready'));
  await popup.locator('#pop-video').click();
  await embedded.waitForFunction(() => !!document.pictureInPictureElement);
  assert.equal(await page.evaluate(() => !!document.pictureInPictureElement), false);
  await patch({ enabled: false });
  await embedded.waitForFunction(() => !document.pictureInPictureElement);
  await patch({ enabled: true });
  await popup.locator('#pop-video').click();
  await embedded.waitForFunction(() => !document.pictureInPictureElement);
  await mkdir(join(root, 'test-results'), { recursive: true });
  await popup.locator('main').evaluate(element => { element.scrollTop = 0; });
  await popup.locator('body').screenshot({ path: join(root, 'test-results/display.png') });
  await popup.locator('[data-panel="privacy"]').click();
  await popup.locator('label[for="hideTitle"]').click();
  await popup.locator('#tabTitle').fill('Quiet space');
  await page.waitForFunction(() => document.title === 'Quiet space');
  await popup.locator('body').screenshot({ path: join(root, 'test-results/privacy.png') });
  await popup.locator('[data-panel="window"]').click();
  await popup.locator('#width').fill('1100');
  await popup.locator('#height').fill('700');
  await popup.locator('label[for="rememberSize"]').click();
  await popup.locator('#apply-size').click();
  await popup.waitForFunction(() => document.getElementById('window-message').textContent.includes('Applied 1100'));
  console.log('Window apply:', await popup.locator('#window-message').textContent(), await popup.locator('#toast').textContent());
  await popup.locator('body').screenshot({ path: join(root, 'test-results/window.png') });
  const newBounds = await worker.evaluate(async () => {
    const win = await chrome.windows.create({ url: 'about:blank', width: 800, height: 600 });
    return win.id;
  });
  await new Promise(resolve => setTimeout(resolve, 400));
  const actual = await worker.evaluate(id => chrome.windows.get(id), newBounds);
  assert.equal(actual.width, 1100); assert.equal(actual.height, 700);
  await context.close();
  worker = await launch();
  const stored = await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  assert.equal(stored.brightness, 80); assert.equal(stored.tabTitle, 'Quiet space');
  const storedSites = await worker.evaluate(async () => (await chrome.storage.local.get('siteSettings')).siteSettings);
  assert.equal(storedSites['127.0.0.1'].brightness, 65);
  assert.equal(stored.rememberSize, true); assert.equal(stored.width, 1100);
  const restored = await worker.evaluate(() => chrome.windows.getAll({ windowTypes: ['normal'] }));
  assert.ok(restored.length > 0);
  for (const win of restored) { assert.equal(win.width, 1100); assert.equal(win.height, 700); }
  const restartPage = await context.newPage();
  await restartPage.goto(origin);
  await restartPage.waitForFunction(() => document.title === 'Quiet space');
  await restartPage.waitForFunction(() => document.querySelector('div[aria-hidden="true"]').style.backdropFilter.includes('brightness(0.65)'));
  assert.deepEqual(errors, []);
  console.log('PASS: brightness ceiling, three modes, site/global settings and revisit, native PiP and playback controls, privacy restoration, popup controls, window sizing, and settings after browser restart.');
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
