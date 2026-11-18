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

test('pulls beyond the rest length follow the hand and recoil without moving the top hook', () => {
  const rope = core.createRope(200, 0, 140);
  const anchor = { x: 200, y: 0 }, target = { x: 360, y: 380 };
  const bob = core.step(rope, anchor, 1 / 120, 0, target);
  assert.equal(bob.x, target.x); assert.equal(bob.y, target.y);
  assert.ok(rope.currentLength > 400);
  assert.equal(rope.length, 140);
  for (let i = 0; i < 480; i++) core.step(rope, anchor, 1 / 120);
  assert.ok(Math.abs(rope.currentLength - 140) < .1);
  assert.equal(rope.points[0].x, 200); assert.equal(rope.points[0].y, 0);
  for (const point of rope.points) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
});

test('rope remains pinned and finite under gravity, wind, and dragging', () => {
  const rope = core.createRope(250, 20, 180);
  const anchor = { x: 250, y: 20 };
  const initial = rope.points.at(-1).x;
  for (let i = 0; i < 1200; i++) core.step(rope, anchor, 1 / 120, Math.sin(i / 60) * 30);
  assert.equal(rope.points[0].x, anchor.x);
  assert.equal(rope.points[0].y, anchor.y);
  const bob = rope.points.at(-1);
  assert.notEqual(bob.x, initial);
  for (const point of rope.points) { assert.ok(Number.isFinite(point.x)); assert.ok(Number.isFinite(point.y)); }
  assert.ok(Math.hypot(bob.x - anchor.x, bob.y - anchor.y) < 220);
  const dragged = core.step(rope, anchor, 1 / 120, 0, { x: 300, y: 180 });
  assert.equal(dragged.x, 300); assert.equal(dragged.y, 180);
  anchor.x = 350;
  for (let i = 0; i < 120; i++) core.step(rope, anchor, 1 / 120);
  assert.equal(rope.points[0].x, 350);
});

test('hook movement and viewport fitting preserve pose and do not inject velocity', () => {
  const rope = core.createRope(200, 30, 180, .25);
  const bob = rope.points.at(-1), oldX = bob.x, oldY = bob.y;
  core.relocate(rope, { x: 200, y: 30 }, { x: 320, y: 30 });
  assert.equal(bob.x, oldX + 120); assert.equal(bob.y, oldY);
  assert.equal(bob.x - bob.px, 0); assert.equal(bob.y - bob.py, 0);
  core.fit(rope, { x: 320, y: 30 }, { x: 180, y: 26 }, 90);
  assert.ok(Math.abs(Math.hypot(bob.x - 180, bob.y - 26) - 90) < .001);
  assert.equal(bob.x - bob.px, 0); assert.equal(bob.y - bob.py, 0);
});
