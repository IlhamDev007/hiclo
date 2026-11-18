import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DEFAULTS, normalize, normalizeSites, resolveDisplay, siteKey } from '../shared/settings.js';

test('settings survive missing, invalid, and out-of-range values', () => {
  assert.deepEqual(normalize(), DEFAULTS);
  assert.deepEqual(normalize(null), DEFAULTS);
  assert.deepEqual(normalize('corrupted'), DEFAULTS);
  const value = normalize({ brightness: 500, intensity: -4, width: 120, height: Infinity, enabled: 'false', mode: 'unknown', tabTitle: '  Focus  ', hideIcon: true });
  assert.equal(value.brightness, 100);
  assert.equal(value.intensity, 0);
  assert.equal(value.width, 400);
  assert.equal(value.height, 800);
  assert.equal(value.enabled, true);
  assert.equal(value.mode, 'natural');
  assert.equal(value.tabTitle, 'Focus');
  assert.equal(value.hideIcon, true);
  assert.equal(normalize({ tabTitle: '  ' }).tabTitle, 'Private tab');
  assert.equal(normalize({ tabTitle: 'a'.repeat(100) }).tabTitle.length, 60);
});

test('display migrations cap brightness and remove obsolete modes globally and per site', () => {
  for (const brightness of [0, 1, 29, 30, 100]) assert.equal(normalize({ brightness }).brightness, brightness);
  assert.equal(normalize({ brightness: -5 }).brightness, 0);
  const zeroSites = normalizeSites({ 'example.com': { brightness: 0 } });
  assert.equal(resolveDisplay(DEFAULTS, zeroSites, 'https://example.com').brightness, 0);
  assert.equal(resolveDisplay({ brightness: 0 }, {}, 'https://other.example').brightness, 0);
  for (const mode of ['night', 'contrast', 'unknown']) assert.equal(normalize({ mode, brightness: 150 }).mode, 'natural');
  const sites = normalizeSites({ 'https://example.com': { brightness: 150, mode: 'night' }, 'chrome://settings': {}, '__proto__': {}, '/invalid': {} });
  assert.deepEqual(Object.keys(sites), ['example.com']);
  assert.equal(sites['example.com'].brightness, 100);
  assert.equal(sites['example.com'].mode, 'natural');
});

test('site display settings override global settings without changing other sites', () => {
  const global = { ...DEFAULTS, brightness: 80, mode: 'warm' };
  const sites = normalizeSites({ 'https://example.com': { brightness: 45, mode: 'grayscale', intensity: 100 } });
  assert.equal(siteKey('https://www.example.com/watch?v=1'), 'example.com');
  assert.equal(siteKey('chrome://extensions'), null);
  assert.equal(resolveDisplay(global, sites, 'https://example.com/another-page').brightness, 45);
  assert.equal(resolveDisplay(global, sites, 'https://other.example').brightness, 80);
  assert.equal(resolveDisplay(global, sites, 'http://example.com:8080').mode, 'grayscale');
  sites['example.com'].active = false;
  assert.equal(resolveDisplay(global, sites, 'https://example.com').brightness, 80);
  sites['example.com'].active = true;
  assert.equal(resolveDisplay(global, sites, 'https://example.com').brightness, 45);
  delete sites['example.com'];
  assert.equal(resolveDisplay(global, sites, 'https://example.com').brightness, 80);
});

test('manifest references real packaged assets and has no remote code', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3);
  const files = [manifest.action.default_popup, manifest.background.service_worker, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(entry => entry.js)];
  for (const file of files) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
  assert.deepEqual(manifest.permissions, ['storage', 'scripting']);
});
