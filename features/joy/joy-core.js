(() => {
  const assets = ['spider-man', 'hammer', 'princess'];
  const designs = {
    web: { hook: 'steel', rope: 'silk', color: '#daeaf4', thickness: 2 },
    forged: { hook: 'forged', rope: 'chain', color: '#aebbc7', thickness: 3 },
    royal: { hook: 'royal', rope: 'braid', color: '#d5b773', thickness: 2 },
    eye: { hook: 'eye', rope: 'silk', color: '#bca57d', thickness: 2 }
  };
  const defaults = { enabled: false, locked: false, motion: true, effects: true, breeze: 8, charms: [] };
  const clamp = (value, fallback, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  function charm(value = {}) {
    const design = value.asset === 'hammer' ? designs.forged : value.asset === 'princess' ? designs.royal : designs.web;
    return {
      id: String(value.id || '').replace(/[^a-z0-9-]/gi, '').slice(0, 64),
      asset: assets.includes(value.asset) || /^upload-[a-z0-9-]+$/.test(value.asset || '') ? value.asset : 'spider-man',
      name: typeof value.name === 'string' ? value.name.slice(0, 50) : 'Charm',
      x: clamp(value.x, .8, .02, .98), y: 0,
      size: clamp(value.size, 90, 40, 180), length: clamp(value.length, 170, 50, 420),
      hook: ['steel', 'forged', 'royal', 'eye'].includes(value.hook) ? value.hook : design.hook,
      rope: ['silk', 'braid', 'chain', 'none'].includes(value.rope) ? value.rope : design.rope,
      color: /^#[a-f0-9]{6}$/i.test(value.color || '') ? value.color : design.color,
      thickness: clamp(value.thickness, design.thickness, 1, 6), opacity: clamp(value.opacity, 100, 20, 100),
      flip: value.flip === true, shape: value.shape === 'circle' ? 'circle' : 'natural'
    };
  }
  function normalize(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const seen = new Set();
    const charms = (Array.isArray(value.charms) ? value.charms : []).filter(item => item && typeof item === 'object' && item.asset !== 'princess-gold').map(charm).filter(item => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id); return true;
    }).slice(0, 6);
    return { enabled: value.enabled === true, locked: value.locked === true, motion: value.motion !== false, effects: value.effects !== false, breeze: clamp(value.breeze, 8, 0, 100), charms };
  }
  function siteKey(url) {
    try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? parsed.hostname.toLowerCase().replace(/^www\./, '') : null; } catch { return null; }
  }
  function normalizeSites(value) {
    const result = {};
    for (const [key, config] of Object.entries(value && typeof value === 'object' ? value : {})) {
      if (!/^[a-z\d.\[\]:-]+$/i.test(key) || !config || typeof config !== 'object') continue;
      const domain = siteKey(`https://${key}`);
      if (domain) result[domain] = { ...normalize(config), active: config.active !== false };
    }
    return result;
  }
  function resolve(global, sites, url) {
    const key = siteKey(url);
    return normalize(key && Object.hasOwn(sites || {}, key) && sites[key].active !== false ? sites[key] : global);
  }
  function hookExit(type) { return { steel: 26, forged: 30, royal: 28, eye: 30 }[type] || 26; }
  function relocate(rope, from, to) {
    for (const p of rope.points) { p.x += to.x - from.x; p.px += to.x - from.x; p.y += to.y - from.y; p.py += to.y - from.y; }
  }
  function fit(rope, from, to, length) {
    relocate(rope, from, to);
    const ratio = length / rope.length;
    for (const p of rope.points) {
      p.x = to.x + (p.x - to.x) * ratio; p.px = to.x + (p.px - to.x) * ratio;
      p.y = to.y + (p.y - to.y) * ratio; p.py = to.y + (p.py - to.y) * ratio;
    }
    rope.length = length; rope.currentLength *= ratio; rope.extensionVelocity *= ratio;
  }
  function createRope(x, y, length, angle = .18, count = 14) {
    const points = Array.from({ length: count + 1 }, (_, i) => {
      const px = x + Math.sin(angle) * length * i / count;
      const py = y + Math.cos(angle) * length * i / count;
      return { x: px, y: py, px, py };
    });
    return { points, length, currentLength: length, extensionVelocity: 0, count };
  }
  function step(rope, anchor, dt, wind = 0, drag = null) {
    dt = clamp(dt, 1 / 120, 1 / 240, 1 / 60);
    const points = rope.points;
    if (drag) {
      // The endpoint follows the hand. Stretch segment rest lengths instead of
      // clamping the pointer to the original pendulum radius.
      rope.currentLength = Math.max(rope.length, Math.hypot(drag.x - anchor.x, drag.y - anchor.y));
      rope.extensionVelocity = 0;
    } else {
      const extension = rope.currentLength - rope.length;
      rope.extensionVelocity += (-45 * extension - 14 * rope.extensionVelocity) * dt;
      rope.extensionVelocity = Math.max(-rope.length * 2, Math.min(rope.length * 2, rope.extensionVelocity));
      rope.currentLength += rope.extensionVelocity * dt;
      if (rope.currentLength < rope.length) { rope.currentLength = rope.length; rope.extensionVelocity = 0; }
    }
    for (let i = 1; i < points.length; i++) {
      const p = points[i], damping = Math.pow(.99, dt * 120);
      const maxVelocity = 600 * dt;
      const vx = Math.max(-maxVelocity, Math.min(maxVelocity, p.x - p.px)) * damping;
      const vy = Math.max(-maxVelocity, Math.min(maxVelocity, p.y - p.py)) * damping;
      p.px = p.x; p.py = p.y;
      p.x += vx + wind * dt * dt;
      p.y += vy + 1000 * dt * dt;
    }
    const pin = () => {
      Object.assign(points[0], { x: anchor.x, y: anchor.y, px: anchor.x, py: anchor.y });
      if (drag) Object.assign(points.at(-1), { x: drag.x, y: drag.y });
    };
    const segment = rope.currentLength / rope.count;
    for (let iteration = 0; iteration < 16; iteration++) {
      pin();
      for (let i = 0; i < rope.count; i++) {
        const a = points[i], b = points[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || .001;
        const correction = Math.max(0, distance - segment) / distance;
        const wa = i === 0 ? 0 : 1;
        const wb = i + 1 === rope.count ? (drag ? 0 : .35) : 1;
        const sum = wa + wb;
        if (!sum) continue;
        a.x += dx * correction * wa / sum; a.y += dy * correction * wa / sum;
        b.x -= dx * correction * wb / sum; b.y -= dy * correction * wb / sum;
      }
    }
    pin();
    return points.at(-1);
  }
  globalThis.StillJoy = Object.freeze({ assets, designs, defaults, normalize, normalizeSites, resolve, siteKey, hookExit, relocate, fit, charm, createRope, step });
})();
