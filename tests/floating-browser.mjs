import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'hiclo-floating-'));
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html lang="en"><head><title>Floating test</title><style>body{background:rgb(240,230,220)}input{color:rgb(10,20,30)}</style></head><body><h1>Document</h1><input id="note" value="Keep me"><button id="count">Count</button><output id="value">0</output><video muted width="320" height="180"></video><script>
    const button=document.querySelector('#count');let count=0;const output=document.querySelector('#value');button.addEventListener('click',()=>output.textContent=++count);
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');setInterval(()=>{ctx.fillStyle='green';ctx.fillRect(0,0,320,180)},50);document.querySelector('video').srcObject=canvas.captureStream(20);
  </script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.STILL_CHROMIUM || chromium.executablePath(), headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run']
  });
  context.setDefaultTimeout(10000);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  const page = await context.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, page.url());
  const popup = await context.newPage();
  await popup.addInitScript(tabId => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = options => options.active ? chrome.tabs.get(tabId).then(tab => [tab]) : query(options);
  }, tabId);
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.waitForFunction(() => document.getElementById('page-status-text').textContent === 'Ready on this page');
  await page.locator('#note').fill('Saved draft');
  await popup.locator('#pop-video').click();
  await page.waitForFunction(() => !!documentPictureInPicture.window);
  assert.equal(await popup.locator('#video-status').textContent(), 'Floating above other windows');
  assert.equal(await popup.locator('#video-controls').isVisible(), false);
  assert.equal(await page.evaluate(() => documentPictureInPicture.window.document.querySelector('#note').value), 'Saved draft');
  assert.equal(await page.evaluate(() => documentPictureInPicture.window.getComputedStyle(documentPictureInPicture.window.document.body).backgroundColor), 'rgb(240, 230, 220)');
  await page.evaluate(() => documentPictureInPicture.window.document.querySelector('#count').click());
  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('pop-video').textContent === 'Return to tab');
  await popup.locator('#pop-video').click();
  await page.waitForFunction(() => !documentPictureInPicture.window && !!document.querySelector('#note'));
  assert.equal(await page.locator('#note').inputValue(), 'Saved draft');
  assert.equal(await page.locator('#value').textContent(), '1');
  // Paused videos use the page path. Master pause closes and restores it.
  await popup.locator('#pop-video').click();
  await page.waitForFunction(() => !!documentPictureInPicture.window);
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, enabled: false } });
  });
  await page.waitForFunction(() => !documentPictureInPicture.window && !!document.querySelector('#note'));
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, enabled: true } });
  });
  // Re-evaluate playback at click time, even if the popup previously chose page.
  await page.evaluate(() => document.querySelector('video').play());
  await page.waitForFunction(() => document.querySelector('video').videoWidth > 0);
  await popup.locator('#pop-video').click();
  await page.waitForFunction(() => !!document.pictureInPictureElement);
  assert.equal(await page.evaluate(() => !!documentPictureInPicture.window), false);
  assert.equal(await popup.locator('#video-controls').isVisible(), true);
  await popup.locator('#video-play').click();
  await page.waitForFunction(() => document.querySelector('video').paused);
  await popup.locator('#pop-video').click();
  await page.waitForFunction(() => !document.pictureInPictureElement);
  // Native close also restores the original nodes and their state.
  await popup.locator('#pop-video').click();
  await page.waitForFunction(() => !!documentPictureInPicture.window);
  await page.evaluate(() => documentPictureInPicture.window.close());
  await page.waitForFunction(() => !!document.querySelector('#note'));
  assert.equal(await page.locator('#note').inputValue(), 'Saved draft');
  console.log('PASS: floating page styles/state, return after popup reload, pause cleanup, native close, and automatic playing-video selection/playback controls.');
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
  const target = resolve(profile);
  if (target.startsWith(resolve(tmpdir()) + '\\') && target.includes('hiclo-floating-')) await rm(target, { recursive: true, force: true, maxRetries: 3 });
}
