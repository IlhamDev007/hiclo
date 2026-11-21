import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { pageAction } from '../features/video/page.js';

function run(globals, action) {
  return vm.runInNewContext(`(${pageAction.toString()})(${JSON.stringify(action)})`, globals);
}

test('unsupported browsers and non-HTML documents report a limitation without opening', async () => {
  const unsupported = await run({}, 'open');
  assert.equal(unsupported.active, false);
  assert.match(unsupported.error, /unavailable/);
  const pdf = await run({ document: { body: {}, contentType: 'application/pdf' },
    documentPictureInPicture: { requestWindow() { throw new Error('Must not open'); } } }, 'open');
  assert.match(pdf.error, /unavailable/);
});

test('denied floating-page requests report an actionable error', async () => {
  const result = await run({ document: { body: {}, contentType: 'text/html' }, innerWidth: 1200, innerHeight: 800,
    documentPictureInPicture: { async requestWindow() { throw Object.assign(new Error(), { name: 'NotAllowedError' }); } } }, 'open');
  assert.equal(result.active, false);
  assert.match(result.error, /Click Always on Top again/);
});
