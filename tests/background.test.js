import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DEFAULTS, normalize, normalizeDisplay, normalizeSites, siteKey } from '../shared/settings.js';

test('startup, new windows, and apply restore state before resizing', async () => {
  const listeners = {};
  const updates = [];
  const win = { id: 12, type: 'normal', state: 'maximized', width: 900, height: 600 };
  let value = { ...DEFAULTS, rememberSize: true, width: 1440, height: 900 };
  const event = name => ({ addListener: callback => { listeners[name] = callback; } });
  const chrome = {
    windows: {
      onCreated: event('created'),
      get: async () => ({ ...win }),
      getAll: async () => [win],
      update: async (id, patch) => { updates.push({ id, ...patch }); Object.assign(win, patch); return win; }
    },
    storage: { onChanged: { addListener() {} }, local: { get: async () => ({ settings: value }), set: async data => { value = data.settings; } } },
    runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`, onStartup: event('startup'), onInstalled: event('installed'), onMessage: event('message') },
    tabs: { query: async () => [] }, scripting: { executeScript: async () => {} }
  };
  const source = readFileSync(new URL('../background.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  vm.runInNewContext(source, { chrome, DEFAULTS, normalize, normalizeDisplay, normalizeSites, siteKey, console });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  listeners.created(win); await tick();
  assert.equal(updates[0].state, 'normal');
  assert.equal(updates[1].width, 1440);
  assert.equal(updates[1].height, 900);
  updates.length = 0;
  listeners.startup(); await tick();
  assert.equal(updates[0].width, 1440);
  updates.length = 0;
  value.rememberSize = false;
  listeners.created(win); await tick();
  assert.equal(updates.length, 0);
  value.enabled = false;
  value.rememberSize = true;
  listeners.created(win); await tick();
  assert.equal(updates.length, 0);
  const pausedResize = await new Promise(resolve => listeners.message({ type: 'resize', windowId: 12, width: 1100, height: 700 }, { id: 'test', url: 'chrome-extension://test/popup/popup.html' }, resolve));
  assert.equal(pausedResize.ok, false);
  assert.match(pausedResize.error, /Resume/);
  assert.equal(updates.length, 0);
  value.enabled = true;
  value.rememberSize = true;
  listeners.created({ ...win, type: 'popup' }); await tick();
  assert.equal(updates.length, 0);
  const response = await new Promise(resolve => {
    assert.equal(listeners.message({ type: 'resize', windowId: 12, width: 1100, height: 700 }, { id: 'test', url: 'chrome-extension://test/popup/popup.html' }, resolve), true);
  });
  assert.equal(response.ok, true);
  assert.equal(response.actual.width, 1100);
  assert.equal(response.actual.height, 700);
  assert.equal(listeners.message({ type: 'resize' }, { id: 'test', tab: {} }, () => {}), undefined);
});

test('component resets preserve other settings, Joy, and the master pause state', async () => {
  const groups = { display: ['brightness', 'mode', 'intensity'], privacy: ['hideTitle', 'hideIcon', 'tabTitle', 'tabIcon'], window: ['rememberSize', 'width', 'height'] };
  for (const [component, fields] of Object.entries(groups)) {
    const initial = { ...DEFAULTS, enabled: false, brightness: 65, mode: 'warm', intensity: 80, hideTitle: true, hideIcon: true, tabTitle: 'Focus', tabIcon: 'leaf', rememberSize: true, width: 1100, height: 700 };
    const stored = { settings: initial, siteSettings: { 'youtube.com': { brightness: 45 } }, joy: { enabled: true }, joySites: { 'youtube.com': { enabled: true } }, joyImages: { upload: 'keep' } };
    const original = structuredClone(stored);
    const event = { addListener() {} }; let onMessage;
    const chrome = {
      runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`, onInstalled: event, onStartup: event, onMessage: { addListener(fn) { onMessage = fn; } } },
      windows: { onCreated: event },
      storage: { onChanged: event, local: { get: async () => structuredClone(stored), set: async patch => Object.assign(stored, structuredClone(patch)) } }
    };
    const source = readFileSync(new URL('../background.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
    vm.runInNewContext(source, { chrome, DEFAULTS, normalize, normalizeDisplay, normalizeSites, siteKey, console });
    const response = await new Promise(resolve => onMessage({ type: 'configure', operation: 'reset', component }, { id: 'test', url: 'chrome-extension://test/popup/popup.html' }, resolve));
    assert.equal(response.ok, true);
    for (const key of Object.keys(DEFAULTS)) assert.equal(stored.settings[key], fields.includes(key) ? DEFAULTS[key] : initial[key], `${component}: ${key}`);
    for (const key of ['joy', 'joySites', 'joyImages']) assert.deepEqual(stored[key], original[key]);
    if (component !== 'display') assert.deepEqual(stored.siteSettings, original.siteSettings);
    else assert.deepEqual(stored.siteSettings, {});
  }
});

test('site-only writes cannot change global brightness and concurrent domain writes merge', async () => {
  const initial = { ...DEFAULTS, brightness: 90, mode: 'warm' };
  const stored = { settings: initial, siteSettings: {} };
  const writes = [];
  let onMessage;
  const event = { addListener() {} };
  const chrome = {
    runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`, onInstalled: event, onStartup: event, onMessage: { addListener(fn) { onMessage = fn; } } },
    windows: { onCreated: event },
    storage: { onChanged: { addListener() {} }, local: {
      async get() { return structuredClone(stored); },
      async set(patch) { writes.push(Object.keys(patch)); Object.assign(stored, structuredClone(patch)); }
    } }
  };
  const source = readFileSync(new URL('../background.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  vm.runInNewContext(source, { chrome, DEFAULTS, normalize, normalizeDisplay, normalizeSites, siteKey, console });
  const send = payload => new Promise(resolve => onMessage({ type: 'configure', ...payload }, { id: 'test', url: 'chrome-extension://test/popup/popup.html' }, resolve));
  const responses = await Promise.all([
    send({ operation: 'site', url: 'https://www.youtube.com/watch?v=test', display: { brightness: 40, mode: 'grayscale' } }),
    send({ operation: 'site', url: 'https://en.wikipedia.org/wiki/Test', display: { brightness: 70, mode: 'natural' } })
  ]);
  for (const response of responses) assert.equal(response.ok, true);
  assert.deepEqual(stored.settings, initial);
  assert.equal(stored.siteSettings['youtube.com'].brightness, 40);
  assert.equal(stored.siteSettings['en.wikipedia.org'].brightness, 70);
  assert.deepEqual(writes, [['siteSettings'], ['siteSettings']]);
  await send({ operation: 'global', display: { brightness: 80, mode: 'natural' } });
  assert.equal(stored.settings.brightness, 80);
  assert.equal(stored.siteSettings['youtube.com'].active, false);
  assert.equal(stored.siteSettings['en.wikipedia.org'].active, false);
  await send({ operation: 'remove', url: 'https://www.youtube.com' });
  assert.equal(Object.hasOwn(stored.siteSettings, 'youtube.com'), false);
  assert.equal(stored.siteSettings['en.wikipedia.org'].brightness, 70);
  assert.equal(stored.settings.brightness, 80);
});
