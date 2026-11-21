import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { normalize, normalizeDisplay, normalizeSites } from '../shared/settings.js';
import { editJoy } from '../features/joy/joy-state.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Display dispatches every site edit before earlier saves finish', async () => {
  const messages = [], pending = [];
  const code = source('../popup/popup.js');
  const context = vm.createContext({ normalize, normalizeDisplay, normalizeSites,
    chrome: { runtime: { sendMessage(message) {
      messages.push(message);
      return new Promise(resolve => pending.push(resolve));
    } } },
    render() {}, toast() {}, $: () => ({}),
  });
  vm.runInContext(`let draft = null, draftDirty = false, draftRevision = 0,
    settings = {}, siteSettings = {}, scope = 'all', persistQueue;
    const currentSite = 'example.com', currentTab = { url: 'https://example.com/page' };
    const previewPort = { postMessage() {} };
    function displaySettings() { return draft || normalizeDisplay(); }
    ${code.slice(code.indexOf('function saveDisplay('), code.indexOf('function render()'))}
    saveDisplay({ brightness: 70 });
    saveDisplay({ brightness: 40 });`, context);
  assert.equal(messages.length, 2, 'Both requests must leave the popup immediately');
  assert.deepEqual(messages.map(m => [m.operation, m.url, m.display.brightness]), [
    ['site', 'https://example.com/page', 70], ['site', 'https://example.com/page', 40]
  ]);
  for (const resolve of pending) resolve({ ok: true, settings: {}, siteSettings: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext('draftDirty', context), false);
  assert.equal(vm.runInContext('scope', context), 'site');
});

test('Joy dispatches additions and subsequent edits without waiting for prior saves', async () => {
  const messages = [];
  const code = source('../features/joy/joy-popup.js');
  const context = vm.createContext({ core: globalThis.StillJoy, editJoy, structuredClone,
    chrome: { runtime: { sendMessage(message) {
      messages.push(message);
      return new Promise(() => {});
    } } },
    render() {}, preview() {}, report() {}, $: () => ({}),
  });
  vm.runInContext(`let joy = core.normalize(), images = {}, dirty = false, revision = 0,
    selected = null, queue, savedGlobal, sites, previewPort = null;
    const pageTab = { url: 'https://example.com/page' }, masterEnabled = true;
    ${code.slice(code.indexOf('async function change('), code.indexOf('function render()'))}
    change('add', { asset: 'hammer' });
    change('update', { id: joy.charms[0].id, patch: { size: 120 } });`, context);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map(m => [m.operation, m.url, m.joy.charms[0].size]), [
    ['apply-site', 'https://example.com/page', 90], ['apply-site', 'https://example.com/page', 120]
  ]);
});
