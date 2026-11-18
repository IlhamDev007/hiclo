import test from 'node:test';
import assert from 'node:assert/strict';
import { configureJoy } from '../features/joy/joy-store.js';
import { editJoy } from '../features/joy/joy-state.js';
const core = globalThis.StillJoy;

test('Joy scopes isolate domains, preserve global state, and keep shared uploads until unused', async () => {
  const previous = globalThis.chrome;
  const stored = { settings: { enabled: true }, joy: core.normalize(), joySites: {}, joyImages: {} };
  const writes = [];
  globalThis.chrome = { storage: { local: { get: async () => structuredClone(stored), set: async patch => { writes.push(Object.keys(patch)); Object.assign(stored, structuredClone(patch)); } } } };
  try {
    const draft = editJoy(stored.joy, {}, 'add', { asset: 'hammer' }).joy;
    await configureJoy({ operation: 'apply-site', url: 'https://www.youtube.com/watch', joy: draft });
    assert.equal(stored.joy.enabled, false);
    assert.equal(core.resolve(stored.joy, stored.joySites, 'https://wikipedia.org').enabled, false);
    assert.equal(core.resolve(stored.joy, stored.joySites, 'https://youtube.com').charms[0].asset, 'hammer');
    assert.ok(!writes[0].includes('joy'));
    await configureJoy({ operation: 'position', url: 'https://youtube.com', id: draft.charms[0].id, patch: { x: .3 } });
    assert.equal(stored.joySites['youtube.com'].charms[0].x, .3);
    assert.equal(stored.joy.charms.length, 0);
    await configureJoy({ operation: 'apply-global', joy: draft });
    assert.equal(stored.joySites['youtube.com'].active, false);
    assert.equal(core.resolve(stored.joy, stored.joySites, 'https://wikipedia.org').charms[0].asset, 'hammer');
    const upload = editJoy(core.normalize(), {}, 'upload', { data: 'data:image/png;base64,aGVsbG8=', name: 'Upload' });
    await configureJoy({ operation: 'apply-site', url: 'https://youtube.com', ...upload });
    await configureJoy({ operation: 'apply-site', url: 'https://wikipedia.org', ...upload });
    await configureJoy({ operation: 'remove-site', url: 'https://youtube.com' });
    assert.equal(Object.keys(stored.joyImages).length, 1);
    await configureJoy({ operation: 'remove-site', url: 'https://wikipedia.org' });
    assert.equal(Object.keys(stored.joyImages).length, 0);
    const settings = structuredClone(stored.settings);
    await configureJoy({ operation: 'reset' });
    assert.deepEqual(stored.settings, settings);
    assert.equal(stored.joy.charms.length, 0);
    assert.deepEqual(stored.joySites, {});
  } finally { globalThis.chrome = previous; }
});
