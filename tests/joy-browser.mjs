import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const cached = join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1254/chrome-win64/chrome.exe');
const profile = await mkdtemp(join(tmpdir(), 'still-joy-test-'));
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Joy test</title><body style="margin:0;background:#f7f4ed;font-family:Arial"><button style="position:fixed;inset:0;width:100%;height:100%;border:0;background:transparent" onclick="this.dataset.clicked=\'yes\'" id="underlay"></button><h1 style="padding:50px;pointer-events:none">A little everyday joy.</h1>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const launchOptions = { executablePath: process.env.STILL_CHROMIUM || (existsSync(cached) ? cached : chromium.executablePath()), headless: true, viewport: { width: 1200, height: 800 }, args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run'] };
let context;
const errors = [];
async function launch() {
  context = await chromium.launchPersistentContext(profile, launchOptions);
  context.setDefaultTimeout(10000); context.on('weberror', error => errors.push(error.error().message));
  return context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
}
try {
  let worker = await launch();
  const id = new URL(worker.url()).hostname;
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await context.newPage(); await page.goto(origin);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({ url: url + '/' }))[0].id, origin);
  const popup = await context.newPage(); await popup.setViewportSize({ width: 418, height: 600 });
  await popup.addInitScript(id => { const original = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = query => query.active ? chrome.tabs.get(id).then(tab => [tab]) : original(query); }, tabId);
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.locator('[data-panel="joy"]').click();
  assert.equal(await popup.locator('[data-joy-add]').count(), 3);
  assert.equal(await popup.locator('[data-joy-add="princess-gold"]').count(), 0);
  await popup.locator('[data-joy-add="hammer"]').click();
  await popup.waitForFunction(() => document.querySelectorAll('#joy-selected option').length === 1);
  const firstId = await popup.locator('#joy-selected').inputValue();
  await popup.locator('#joy-scope-site').click();
  await popup.waitForFunction(() => document.getElementById('joy-message').textContent.includes('configuration saved')); 
  const charm = page.locator(`#still-joy .charm[data-id="${firstId}"]`);
  await page.bringToFront(); await charm.waitFor();
  await page.waitForFunction(() => document.querySelector('#still-joy').shadowRoot.querySelector('img').naturalWidth > 0);
  const windowBefore = await worker.evaluate(() => chrome.windows.getLastFocused());
  const pin = page.locator(`#still-joy .anchor[data-id="${firstId}"]`);
  assert.equal((await pin.boundingBox()).y, 0);
  assert.equal(await charm.getAttribute('data-anchor-y'), '0');
  const topPixel = await page.evaluate(() => { const canvas = document.querySelector('#still-joy').shadowRoot.querySelector('canvas'); return canvas.getContext('2d').getImageData(Math.floor(innerWidth * .75), 0, 1, 1).data[3]; });
  assert.ok(topPixel > 0, 'Hook must meet the top edge without a transparent gap');

  // Pull substantially farther than the rest length: the bob must follow the
  // hand, stretch the rope, then recoil without moving the fixed top anchor.
  const box = await charm.boundingBox();
  const originalLength = Number(await charm.getAttribute('data-rope-length'));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 260, { steps: 24 });
  await page.waitForFunction(({ id, length }) => Number(document.querySelector('#still-joy').shadowRoot.querySelector(`[data-id="${id}"].charm`).dataset.ropeLength) > length + 160, { id: firstId, length: originalLength });
  const pulled = await charm.boundingBox(); assert.ok(pulled.y > box.y + 150);
  assert.equal((await pin.boundingBox()).y, 0);
  await page.mouse.up();
  await page.waitForFunction(id => Number(document.querySelector('#still-joy').shadowRoot.querySelector(`[data-id="${id}"].charm`).dataset.ropeLength) < 175, firstId);
  const pinBox = await pin.boundingBox();
  await page.mouse.move(pinBox.x + 20, 12); await page.mouse.down();
  await page.mouse.move(420, 130, { steps: 12 }); await page.mouse.up();
  for (let attempt = 0; attempt < 40; attempt++) {
    const item = await worker.evaluate(async () => (await chrome.storage.local.get('joySites')).joySites['127.0.0.1'].charms[0]);
    if (Math.abs(item.x - .35) < .02 && item.y === 0) break;
    if (attempt === 39) assert.fail('Top-only anchor position was not saved');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal((await pin.boundingBox()).y, 0);
  const windowAfter = await worker.evaluate(() => chrome.windows.getLastFocused());
  assert.equal(windowAfter.width, windowBefore.width); assert.equal(windowAfter.height, windowBefore.height);

  await popup.bringToFront();
  await popup.locator('#joy-hanging').evaluate(el => { el.open = true; });
  for (const [design, hook, rope] of [['web', 'steel', 'silk'], ['royal', 'royal', 'braid'], ['forged', 'forged', 'chain'], ['eye', 'eye', 'silk']]) {
    await popup.locator(`[data-joy-design="${design}"]`).click();
    await popup.waitForFunction(rope => document.getElementById('joy-rope').value === rope, rope);
    await popup.locator('#joy-scope-site').click();
    await popup.waitForFunction(() => document.getElementById('joy-message').textContent.includes('configuration saved'));
    const value = await worker.evaluate(async () => (await chrome.storage.local.get('joySites')).joySites['127.0.0.1'].charms[0]);
    assert.equal(value.hook, hook); assert.equal(value.rope, rope);
  }
  await popup.locator('#joy-color').fill('#ffcc44'); await popup.locator('#joy-color').dispatchEvent('change');
  await popup.locator('#joy-size').fill('125'); await popup.locator('#joy-size').dispatchEvent('change');
  await popup.locator('#joy-hanging').evaluate(el => { el.open = false; });
  await popup.locator('#joy-appearance').evaluate(el => { el.open = true; });
  await popup.locator('#joy-scope-site').click();
  await popup.waitForFunction(() => document.getElementById('joy-message').textContent.includes('configuration saved'));
  await popup.locator('#joy-play').click();
  await popup.waitForFunction(() => document.getElementById('joy-message').textContent.includes('Animation triggered'));
  await page.bringToFront();
  // Canvas pixels around the hammer contain live blue lightning, not just a
  // stylesheet class or a static icon. No effect code is applied to uploads.
  await page.waitForFunction(() => { const canvas = document.querySelector('#still-joy').shadowRoot.querySelector('canvas'); const data = canvas.getContext('2d').getImageData(0, 28, canvas.width, canvas.height - 28).data; for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 20 && data[i + 2] > data[i] * 1.4 && data[i + 2] > data[i + 1] * 1.08) return true; return false; });
  await popup.bringToFront();
  await popup.locator('label').filter({ has: popup.locator('#joy-locked') }).click();
  await popup.locator('#joy-scope-site').click();
  await page.bringToFront();
  await page.waitForFunction(() => document.querySelector('#still-joy').shadowRoot.querySelector('.charm').disabled);
  const locked = await charm.boundingBox(); await page.mouse.click(locked.x + locked.width / 2, locked.y + locked.height / 2);
  assert.equal(await page.locator('#underlay').getAttribute('data-clicked'), 'yes');
  await page.reload(); await charm.waitFor();
  assert.equal(await charm.evaluate(node => node.style.width), '125px');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('#still-joy').dataset.motion === 'paused');
  const still = await charm.evaluate(node => node.style.transform);
  await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(await charm.evaluate(node => node.style.transform), still);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await popup.bringToFront();
  await popup.locator('#joy-library').evaluate(el => { el.open = true; });
  await popup.locator('#joy-upload').setInputFiles(join(root, 'icons/128.png'));
  await popup.waitForFunction(() => document.querySelectorAll('#joy-selected option').length === 2);
  assert.equal(await popup.locator('#joy-play').isDisabled(), true);
  await popup.locator('#joy-library').evaluate(el => { el.open = true; });
  await popup.locator('[data-joy-add="spider-man"]').click();
  await popup.locator('#joy-library').evaluate(el => { el.open = true; });
  await popup.locator('[data-joy-add="princess"]').click();
  await popup.waitForFunction(() => document.querySelectorAll('#joy-selected option').length === 4);
  await popup.locator('#joy-scope-site').click();
  await page.bringToFront();
  await page.waitForFunction(() => { const images = [...document.querySelector('#still-joy').shadowRoot.querySelectorAll('img')]; return images.length === 4 && images.every(img => img.complete && img.naturalWidth > 0); });
  const upload = page.locator('#still-joy .charm[data-effect="none"]'); assert.equal(await upload.count(), 1);
  assert.equal(await upload.locator('img').evaluate(img => img.style.transform), 'scale(1, 1)');
  for (const hook of await page.locator('#still-joy .anchor').all()) assert.equal((await hook.boundingBox()).y, 0);
  await mkdir(join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: join(root, 'test-results/joy-page.png') });
  await popup.bringToFront();
  await popup.locator('#joy-appearance').evaluate(el => { el.open = false; });
  await popup.locator('main').evaluate(el => { el.scrollTop = 0; });
  const layout = await popup.locator('#joy').evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth, height: document.body.getBoundingClientRect().height, footer: document.querySelector('footer').getBoundingClientRect().bottom }));
  assert.ok(layout.scroll <= layout.width + 1 && layout.height <= 601 && layout.footer <= 601, JSON.stringify(layout));
  await popup.setViewportSize({ width: 360, height: 500 });
  await popup.locator('#joy-hanging').evaluate(el => { el.open = true; });
  const narrow = await popup.locator('#joy').evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth, footer: document.querySelector('footer').getBoundingClientRect().bottom }));
  assert.ok(narrow.scroll <= narrow.width + 1 && narrow.footer <= 501, JSON.stringify(narrow));
  await popup.locator('#joy-hanging').evaluate(el => { el.open = false; });
  await popup.setViewportSize({ width: 418, height: 600 });
  await popup.locator('body').screenshot({ path: join(root, 'test-results/joy-popup.png') });
  await popup.locator('#joy-remove').click(); await popup.waitForFunction(() => document.querySelectorAll('#joy-selected option').length === 3);
  await popup.locator('label').filter({ has: popup.locator('#joy-enabled') }).click();
  await popup.locator('#joy-scope-site').click(); await page.waitForFunction(() => !document.querySelector('#still-joy'));
  await context.close(); worker = await launch();
  const restored = await worker.evaluate(() => chrome.storage.local.get(['joy', 'joySites', 'joyImages']));
  assert.equal(restored.joySites['127.0.0.1'].charms.length, 3); assert.equal(Object.keys(restored.joyImages).length, 1); assert.equal(restored.joySites['127.0.0.1'].enabled, false);
  await worker.evaluate(async () => { const { joySites } = await chrome.storage.local.get('joySites'); joySites['127.0.0.1'].enabled = true; await chrome.storage.local.set({ joySites }); });
  const restoredPage = await context.newPage(); await restoredPage.goto(origin);
  await restoredPage.waitForFunction(() => { const images = document.querySelector('#still-joy')?.shadowRoot.querySelectorAll('img'); return images?.length === 3 && [...images].every(image => image.complete && image.naturalWidth > 0); });
  const resetPopup = await context.newPage(); await resetPopup.goto(`chrome-extension://${id}/popup/popup.html`);
  await resetPopup.waitForFunction(() => !document.getElementById('page-status-text').textContent.includes('Checking'));
  await resetPopup.locator('[data-panel="joy"]').click();
  await resetPopup.locator('#reset-all').click(); await restoredPage.waitForFunction(() => !document.querySelector('#still-joy'));
  const resetState = await worker.evaluate(() => chrome.storage.local.get(['joy', 'joyImages']));
  assert.equal(resetState.joy.charms.length, 0); assert.deepEqual(resetState.joyImages, {}); assert.deepEqual(errors, []);
  console.log('PASS: three presets, compact layout, flush top hooks, elastic pulling/recoil, fixed window bounds, three designs, live lightning, upload isolation, reduced motion, persistence, and reset.');
} finally {
  await context?.close(); await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
