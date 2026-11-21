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
  const gravity = 1400, stiffness = 90, ropeDamping = 6.5, airDrag = 0.7;
  const limit = (value, min, max) => Math.min(max, Math.max(min, value));
  class RopeBody {
    constructor(length = 150) { this.reset(length); }
    reset(length = this.length) {
      this.length = Math.max(20, length);
      this.x = 0; this.y = this.length; this.vx = 0; this.vy = 0;
    }
    step(seconds, bounds, wind = 0) {
      const dt = limit(seconds, 0, 0.04);
      const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
      // Gravity stretches an unloaded rope slightly. Compensate so the size
      // chosen in the popup is the settled hanging distance.
      const unloadedLength = Math.max(1, this.length - gravity / stiffness);
      for (let i = 0; i < steps; i++) {
        const distance = Math.max(0.001, Math.hypot(this.x, this.y));
        const nx = this.x / distance, ny = this.y / distance;
        const stretch = distance - unloadedLength;
        const radialSpeed = this.vx * nx + this.vy * ny;
        // A rope pulls when taut; it never pushes a raised charm downward.
        const tension = stretch > 0 ? Math.max(0, stiffness * stretch + ropeDamping * radialSpeed) : 0;
        this.vx += (wind - tension * nx - airDrag * this.vx) * h;
        this.vy += (gravity - tension * ny - airDrag * this.vy) * h;
        this.x += this.vx * h; this.y += this.vy * h;
        this.constrain(bounds);
      }
      if (this.settled && !wind) this.reset();
    }
    drag(x, y, seconds) {
      const dt = Math.max(seconds, 0.016);
      this.vx = limit((x - this.x) / dt, -1000, 1000);
      this.vy = limit((y - this.y) / dt, -1000, 1000);
      this.x = x; this.y = y;
    }
    constrain(bounds) {
      if (!bounds) return;
      for (const [axis, speed, min, max] of [
        ["x", "vx", bounds.minX, bounds.maxX], ["y", "vy", bounds.minY, bounds.maxY]
      ]) {
        if (this[axis] < min) {
          this[axis] = min; if (this[speed] < 0) this[speed] *= -0.22;
        } else if (this[axis] > max) {
          this[axis] = max; if (this[speed] > 0) this[speed] *= -0.22;
        }
      }
    }
    nudge(horizontal = 1, vertical = 0) {
      this.vx = limit(this.vx + horizontal * 260, -1000, 1000);
      this.vy = limit(this.vy + vertical * 220, -1000, 1000);
    }
    get settled() {
      return Math.abs(this.x) < 0.08 && Math.abs(this.y - this.length) < 0.08
        && Math.abs(this.vx) < 0.8 && Math.abs(this.vy) < 0.8;
    }
  }
  globalThis.StillJoy = Object.freeze({ assets, designs, defaults, normalize, normalizeSites, resolve, siteKey, hookExit, charm, RopeBody });
})();
