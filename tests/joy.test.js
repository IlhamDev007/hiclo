import test from 'node:test';
import assert from 'node:assert/strict';
import '../features/joy/joy-core.js';
const core = globalThis.StillJoy;

test('Joy configuration bounds entries, rejects invalid assets, and preserves custom positions', () => {
  assert.equal(core.normalize(null).enabled, false);
  const value = core.normalize({ charms: Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}`, asset: 'https://tracking.example/image', x: 2, y: -.1, length: 9999 })) });
  assert.equal(value.charms.length, 6);
  assert.equal(value.charms[0].asset, 'spider-man');
  assert.equal(value.charms[0].x, .98);
  assert.equal(value.charms[0].y, 0);
  assert.equal(value.charms[0].length, 420);
  assert.equal(core.charm({ asset: 'upload-abc', x: .4, y: .2 }).asset, 'upload-abc');
  assert.equal(core.normalize({ charms: [{ id: 'a' }, { id: 'a' }] }).charms.length, 1);
  assert.equal(core.assets.length, 3);
  assert.equal(core.normalize({ charms: [{ id: 'emerald', asset: 'princess-gold' }, { id: 'old', y: .6 }] }).charms.length, 1);
  assert.equal(core.charm({ asset: 'hammer' }).hook, 'forged');
  assert.equal(core.charm({ asset: 'princess' }).rope, 'braid');
});

test('a stretched rope follows the drag and recoils past its rest length', () => {
  const body = new core.RopeBody(140);
  body.drag(0, 280, .1);
  assert.equal(body.y, 280);
  assert.equal(body.vy, 1000);
  body.vy = 0;
  body.step(1 / 60);
  assert.ok(body.vy < 0);
  let bounced = false;
  for (let i = 0; i < 5400; i++) {
    body.step(1 / 60);
    bounced ||= body.y < 139;
  }
  assert.ok(bounced);
  assert.ok(body.settled);
  assert.equal(body.y, 140);
});

test('a raised charm falls freely while its rope is slack and then recoils', () => {
  const body = new core.RopeBody(150);
  body.drag(0, 40, .1);
  body.vy = 0;
  body.step(1 / 60);
  assert.equal(body.x, 0);
  assert.ok(body.vy > 20 && body.vy < 25);
  assert.ok(body.y > 40);
  let stretched = false;
  for (let i = 0; i < 5400; i++) {
    body.step(1 / 60);
    stretched ||= body.y > 151;
  }
  assert.ok(stretched);
  assert.ok(body.settled);
});

test('sideways throws cross the hook and settle after the breeze stops', () => {
  const body = new core.RopeBody(180);
  body.nudge(1, 0);
  const positions = [];
  for (let i = 0; i < 300; i++) {
    body.step(1 / 120, undefined, Math.sin(i / 60) * 25);
    positions.push(body.x);
  }
  assert.ok(positions.some(x => x > 10));
  assert.ok(positions.some(x => x < -10));
  for (let i = 0; i < 5400; i++) body.step(1 / 60);
  assert.ok(body.settled);
});

test('long frame gaps and repeated throws stay within viewport bounds', () => {
  const body = new core.RopeBody(100);
  const bounds = { minX: -70, maxX: 70, minY: 0, maxY: 140 };
  for (let i = 0; i < 500; i++) {
    body.nudge(i % 2 ? 1 : -1, 1);
    body.step(10, bounds);
    assert.ok(body.x >= bounds.minX && body.x <= bounds.maxX);
    assert.ok(body.y >= bounds.minY && body.y <= bounds.maxY);
    assert.ok(Number.isFinite(body.vx) && Number.isFinite(body.vy));
  }
  body.reset(55);
  assert.deepEqual([body.x, body.y, body.vx, body.vy], [0, 55, 0, 0]);
});
