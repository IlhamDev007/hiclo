(() => {
  if (globalThis.__stillJoy) return;
  globalThis.__stillJoy = true;
  const core = globalThis.StillJoy, art = globalThis.StillJoyArt;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const entries = new Map();
  let config = core.normalize(), globalJoy = core.normalize(), sites = {}, storedImages = {}, images = {}, masterEnabled = false;
  let preview = null, previewPort = null, host, shadow, canvas, ctx;
  let width = innerWidth, height = innerHeight, raf = 0, lastTime = 0, accumulator = 0, dragging = null;
  const active = () => masterEnabled && config.enabled;
  const anchorOf = item => ({ x: Math.max(24, Math.min(width - 24, item.x * width)), y: core.hookExit(item.hook) });
  const fittedLength = item => Math.min(item.length, Math.max(30, height - item.size - core.hookExit(item.hook) - 30));
  const canAnimate = () => config.motion && !reduced.matches;
  const hasEffects = item => canAnimate() && config.effects && core.assets.includes(item.asset);
  const source = asset => core.assets.includes(asset) ? chrome.runtime.getURL(`assets/joy/${asset}.png`) : images[asset];
  function resolveState() {
    config = preview ? core.normalize(preview.joy) : core.resolve(globalJoy, sites, location.href);
    images = preview?.images || storedImages;
    rebuild();
  }

  function ensureHost() {
    const parent = (document.fullscreenElement?.tagName !== 'VIDEO' && document.fullscreenElement) || document.documentElement;
    if (host?.parentNode === parent) return;
    if (!host) {
      host = document.createElement('div'); host.id = 'still-joy';
      host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100%!important;height:100%!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;';
      host.addEventListener('click', event => event.stopPropagation());
      shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = 'canvas{position:fixed;inset:0;pointer-events:none}.charm,.anchor{position:absolute;top:0;left:0;border:0;background:transparent;padding:0;pointer-events:auto;touch-action:none;user-select:none}.charm{cursor:grab;transform-origin:50% 0;will-change:transform}.charm:active{cursor:grabbing}.charm:focus-visible,.anchor:focus-visible{outline:2px solid #b9edbd;outline-offset:3px}.charm img{display:block;width:100%;height:100%;object-fit:contain;object-position:top;pointer-events:none;filter:drop-shadow(2px 4px 3px #0005);transform-origin:50% 0}.anchor{width:40px;height:28px;cursor:ew-resize;border-radius:0 0 8px 8px}.anchor:hover{box-shadow:inset 0 0 0 1px #b9edbd80}';
      canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
      shadow.append(style, canvas); ctx = canvas.getContext('2d');
    }
    parent?.append(host); resize();
  }

  function rebuild() {
    if (!active() || !config.charms.length) {
      dragging?.cancel(); stop(); host?.remove();
      for (const entry of entries.values()) { entry.node.remove(); entry.pin.remove(); }
      entries.clear(); return;
    }
    ensureHost();
    const ids = new Set(config.charms.map(item => item.id));
    for (const [id, entry] of entries) if (!ids.has(id)) { entry.node.remove(); entry.pin.remove(); entries.delete(id); }
    for (const item of config.charms) {
      let entry = entries.get(item.id);
      if (!entry) {
        const node = document.createElement('button'); node.className = 'charm'; node.dataset.id = item.id;
        const image = document.createElement('img'); image.draggable = false; node.append(image);
        const pin = document.createElement('button'); pin.className = 'anchor'; pin.dataset.id = item.id;
        const anchor = anchorOf(item);
        entry = { item, node, image, pin, rope: core.createRope(anchor.x, anchor.y, fittedLength(item), 0), actionAt: -Infinity };
        entries.set(item.id, entry); shadow.append(node, pin);
        node.addEventListener('pointerdown', event => startDrag(event, entry, 'charm'));
        pin.addEventListener('pointerdown', event => startDrag(event, entry, 'anchor'));
        node.addEventListener('keydown', event => {
          if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); nudge(entry); }
        });
        pin.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || config.locked) return;
          event.preventDefault(); event.stopPropagation();
          const oldAnchor = anchorOf(entry.item);
          entry.item = core.charm({ ...entry.item, x: entry.item.x + (event.key === 'ArrowLeft' ? -10 : 10) / width });
          core.relocate(entry.rope, oldAnchor, anchorOf(entry.item));
          persistPosition(entry); wake();
        });
      }
      core.relocate(entry.rope, anchorOf(entry.item), anchorOf(item));
      entry.item = item; entry.rope.length = fittedLength(item);
      const url = source(item.asset);
      if (url && entry.image.getAttribute('src') !== url) entry.image.src = url;
      entry.image.alt = item.name;
      entry.node.setAttribute('aria-label', `${item.name}. Pull to stretch and release to swing. Press Enter for its animation.`);
      entry.pin.setAttribute('aria-label', `Move ${item.name} hook along the top edge. Drag or use left and right arrows.`);
      entry.node.disabled = entry.pin.disabled = config.locked;
      entry.node.tabIndex = entry.pin.tabIndex = config.locked ? -1 : 0;
      entry.node.style.pointerEvents = entry.pin.style.pointerEvents = config.locked ? 'none' : 'auto';
      entry.node.style.width = entry.node.style.height = `${item.size}px`;
      entry.node.style.opacity = item.opacity / 100;
      entry.image.style.borderRadius = item.shape === 'circle' ? '50%' : '0';
      entry.node.dataset.asset = item.asset;
      entry.node.dataset.effect = core.assets.includes(item.asset) ? ({ hammer: 'lightning', 'spider-man': 'spider-sense', princess: 'stardust' }[item.asset]) : 'none';
    }
    wake();
  }

  function persistPosition(entry) {
    if (!masterEnabled) return;
    if (preview && previewPort) previewPort.postMessage({ type: 'position', id: entry.item.id, x: entry.item.x });
    else chrome.runtime.sendMessage({ type: 'joy', operation: 'position', id: entry.item.id, patch: { x: entry.item.x, y: 0 } }).catch(() => {});
  }
  function nudge(entry) {
    if (config.locked || !active()) return;
    entry.rope.points.at(-1).px -= 45 / 120;
    entry.actionAt = performance.now(); wake();
  }
  function dragTarget(d) {
    const size = d.entry.item.size;
    return { x: Math.max(size / 2, Math.min(width - size / 2, d.x - d.offsetX)), y: Math.max(28, Math.min(Math.max(28, height - size - 8), d.y - d.offsetY)) };
  }
  function startDrag(event, entry, type) {
    if (config.locked || !active() || event.button !== 0) return;
    dragging?.cancel();
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget, bob = entry.rope.points.at(-1);
    target.setPointerCapture(event.pointerId);
    const gesture = { entry, type, original: { ...entry.item }, x: event.clientX, y: event.clientY, previousX: event.clientX, previousY: event.clientY, offsetX: event.clientX - bob.x, offsetY: event.clientY - bob.y, moved: false, samples: [{ x: event.clientX, y: event.clientY, t: performance.now() }] };
    dragging = gesture;
    const move = event => {
      if (dragging !== gesture) return;
      event.preventDefault(); event.stopPropagation();
      const d = dragging; d.previousX = d.x; d.previousY = d.y; d.x = event.clientX; d.y = event.clientY; d.moved = true;
      d.samples.push({ x: d.x, y: d.y, t: performance.now() });
      d.samples = d.samples.filter(sample => performance.now() - sample.t < 90);
      if (type === 'anchor') {
        const oldAnchor = anchorOf(entry.item);
        entry.item = core.charm({ ...entry.item, x: d.x / width });
        core.relocate(entry.rope, oldAnchor, anchorOf(entry.item));
      }
      wake();
    };
    const finish = event => {
      if (dragging !== gesture) return;
      event.stopPropagation();
      const d = dragging;
      if (event.type === 'pointercancel' || event.type === 'lostpointercapture' || !active()) { gesture.cancel(); return; }
      if (type === 'anchor') persistPosition(entry);
      else {
        // Commit the latest pointer position even when pointerup arrives before
        // the next display frame, preserving fast pull/release gestures.
        if (d.moved) core.step(entry.rope, anchorOf(entry.item), 1 / 120, 0, dragTarget(d));
        const bob = entry.rope.points.at(-1);
        const first = d.samples[0], last = d.samples.at(-1), elapsed = Math.max(1, last.t - first.t) / 1000;
        const moving = performance.now() - last.t < 80 && d.samples.length > 1;
        const vx = moving ? Math.max(-250, Math.min(250, (last.x - first.x) / elapsed)) : 0;
        const vy = moving ? Math.max(-250, Math.min(250, (last.y - first.y) / elapsed)) : 0;
        bob.px = bob.x - vx / 120; bob.py = bob.y - vy / 120;
        entry.actionAt = performance.now();
        if (!d.moved) nudge(entry);
      }
      cleanup();
      wake();
    };
    function cleanup() {
      if (dragging === gesture) dragging = null;
      entry.node.dataset.dragging = 'false';
      for (const [name, callback] of [['pointermove', move], ['pointerup', finish], ['pointercancel', finish], ['lostpointercapture', finish]]) target.removeEventListener(name, callback);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    }
    gesture.cancel = () => {
      if (type === 'anchor') {
        const from = anchorOf(entry.item); entry.item = gesture.original;
        core.relocate(entry.rope, from, anchorOf(entry.item));
      }
      cleanup();
    };
    entry.node.dataset.dragging = 'true';
    target.addEventListener('pointermove', move);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(name, finish);
    wake();
  }

  function resize() {
    const oldWidth = width;
    dragging?.cancel();
    width = innerWidth; height = innerHeight;
    if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const entry of entries.values()) {
      const oldAnchor = { x: Math.max(24, Math.min(oldWidth - 24, entry.item.x * oldWidth)), y: core.hookExit(entry.item.hook) };
      core.fit(entry.rope, oldAnchor, anchorOf(entry.item), fittedLength(entry.item));
    }
    wake();
  }
  function draw(time) {
    host.dataset.motion = canAnimate() ? 'running' : 'paused';
    ctx.clearRect(0, 0, width, height);
    for (const entry of entries.values()) {
      const { item, rope, node, image } = entry;
      const anchor = anchorOf(item), bob = rope.points.at(-1), previous = rope.points.at(-2);
      const angle = Math.max(-80, Math.min(80, -Math.atan2(bob.x - previous.x, bob.y - previous.y) * 180 / Math.PI));
      art.rope(ctx, entry, anchor);
      if (hasEffects(item)) art.effects(ctx, entry, time, angle);
      node.style.transform = `translate3d(${bob.x - item.size / 2}px,${bob.y}px,0) rotate(${angle}deg)`;
      image.style.transform = `scale(${item.flip ? -1 : 1},1)`;
      entry.pin.style.transform = `translateX(${anchor.x - 20}px)`;
      node.dataset.ropeLength = rope.currentLength.toFixed(1);
      node.dataset.anchorY = '0';
      node.dataset.ropeStartY = String(anchor.y);
    }
  }
  function tick(time) {
    raf = 0;
    if (document.hidden || !active() || !host?.isConnected) return;
    const moving = canAnimate();
    accumulator += Math.min((time - (lastTime || time)) / 1000, .05); lastTime = time;
    let energy = 0;
    if (moving || dragging) while (accumulator >= 1 / 120) {
      for (const entry of entries.values()) {
        const anchor = anchorOf(entry.item);
        const target = dragging?.entry === entry && dragging.type === 'charm' ? dragTarget(dragging) : null;
        const wind = Math.sin(time / 2000 + anchor.x) * config.breeze * .25;
        const bob = core.step(entry.rope, anchor, 1 / 120, wind, target);
        const nextX = Math.max(entry.item.size / 2, Math.min(width - entry.item.size / 2, bob.x));
        const nextY = Math.max(anchor.y + 5, Math.min(Math.max(anchor.y + 5, height - entry.item.size - 8), bob.y));
        if (nextX !== bob.x) bob.px = nextX;
        if (nextY !== bob.y) bob.py = nextY;
        bob.x = nextX; bob.y = nextY;
        energy += Math.abs(bob.x - bob.px) + Math.abs(bob.y - bob.py) + Math.abs(entry.rope.currentLength - entry.rope.length);
      }
      accumulator -= 1 / 120;
    }
    else {
      accumulator = 0;
      for (const entry of entries.values()) { const anchor = anchorOf(entry.item); entry.rope = core.createRope(anchor.x, anchor.y, fittedLength(entry.item), 0); }
    }
    draw(time);
    const ambient = config.breeze > 0 || (config.effects && [...entries.values()].some(entry => core.assets.includes(entry.item.asset)));
    if (dragging || (moving && (ambient || energy > .01))) raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf && !document.hidden && active()) { lastTime = 0; accumulator = 1 / 120; raf = requestAnimationFrame(tick); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; lastTime = 0; }
  chrome.storage.local.get(['settings', 'joy', 'joySites', 'joyImages']).then(data => {
    masterEnabled = data.settings?.enabled !== false; globalJoy = core.normalize(data.joy); sites = core.normalizeSites(data.joySites); storedImages = data.joyImages || {}; resolveState();
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes.settings && !changes.joy && !changes.joySites && !changes.joyImages)) return;
    if (changes.settings) masterEnabled = changes.settings.newValue?.enabled !== false;
    if (changes.joy) globalJoy = core.normalize(changes.joy.newValue);
    if (changes.joySites) sites = core.normalizeSites(changes.joySites.newValue);
    if (changes.joyImages) storedImages = changes.joyImages.newValue || {};
    resolveState();
  });
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'still-joy-preview' || port.sender?.url !== chrome.runtime.getURL('popup/popup.html')) return;
    previewPort = port;
    port.onMessage.addListener(message => {
      if (previewPort !== port) return;
      preview = message.joy ? { joy: message.joy, images: message.images || storedImages } : null;
      resolveState();
    });
    port.onDisconnect.addListener(() => {
      if (previewPort !== port) return;
      previewPort = null; preview = null; dragging?.cancel(); resolveState();
    });
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type !== 'joy-play' || sender.id !== chrome.runtime.id) return;
    const entry = entries.get(message.id);
    if (active() && entry && core.assets.includes(entry.item.asset)) { entry.actionAt = performance.now(); if (!config.locked) nudge(entry); else wake(); respond({ ok: true }); }
    else respond({ ok: false });
  });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { dragging?.cancel(); stop(); } else wake(); });
  document.addEventListener('fullscreenchange', () => { if (config.enabled) ensureHost(); });
  reduced.addEventListener('change', wake);
})();
