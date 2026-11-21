(() => {
  if (globalThis.__stillJoy) return;
  globalThis.__stillJoy = true;
  const previousHost = document.getElementById('still-joy');
  if (previousHost?.shadowRoot?.querySelector('canvas')) previousHost.remove();
  const core = globalThis.StillJoy, art = globalThis.StillJoyArt;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const entries = new Map();
  let painted = [];
  let config = core.normalize(), globalJoy = core.normalize(), sites = {}, storedImages = {}, images = {}, masterEnabled = false;
  let preview = null, previewPort = null, host, shadow, canvas, ctx;
  let width = innerWidth, height = innerHeight, raf = 0, effectTimer = 0, lastTime = 0, dragging = null;
  const active = () => masterEnabled && config.enabled;
  const limit = (value, min, max) => Math.max(min, Math.min(max, value));
  const sizeOf = item => Math.max(1, Math.min(item.size, width / 1.6, (height - core.hookExit(item.hook) - 28) / 1.12));
  const anchorOf = item => {
    const margin = Math.min(width / 2, Math.max(24, sizeOf(item) * .8));
    return { x: limit(item.x * width, margin, width - margin), y: core.hookExit(item.hook) };
  };
  const fittedLength = item => Math.min(item.length, Math.max(20, height - sizeOf(item) * 1.12 - core.hookExit(item.hook) - 8));
  const boundsOf = (item, anchor) => {
    const margin = Math.min(width / 2, sizeOf(item) * .8);
    return { minX: margin - anchor.x, maxX: width - margin - anchor.x,
      minY: 0, maxY: Math.max(20, height - sizeOf(item) * 1.12 - anchor.y - 8) };
  };
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
      style.textContent = `
        canvas{position:fixed;inset:0;pointer-events:none}
        .charm,.anchor{position:absolute;top:0;left:0;border:0;background:transparent;padding:0;pointer-events:auto;touch-action:none;user-select:none}
        .charm{cursor:grab;transform-origin:50% 0;will-change:transform}
        .charm:active{cursor:grabbing}
        button:focus{outline:none}
        button:focus-visible:not([data-pointer-focus]){outline:2px solid #b9edbd;outline-offset:3px}
        .charm img{display:block;width:100%;height:100%;object-fit:contain;object-position:top;pointer-events:none;filter:drop-shadow(2px 4px 3px #0005);transform-origin:50% 0}
        .anchor{width:40px;height:28px;cursor:ew-resize;border-radius:0 0 8px 8px}
        .anchor:hover:not([data-pointer-focus]){box-shadow:inset 0 0 0 1px #b9edbd80}
      `;
      shadow.addEventListener('focusout', event => event.target.removeAttribute('data-pointer-focus'));
      shadow.addEventListener('keydown', event => event.target.removeAttribute('data-pointer-focus'), true);
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
    if (dragging) {
      const original = dragging.entry.item;
      const next = config.charms.find(item => item.id === original.id);
      if (config.locked || !next || next.size !== original.size || next.length !== original.length || next.hook !== original.hook) dragging.cancel();
    }
    for (const [id, entry] of entries) if (!ids.has(id)) { entry.node.remove(); entry.pin.remove(); entries.delete(id); }
    for (const item of config.charms) {
      let entry = entries.get(item.id);
      if (!entry) {
        const node = document.createElement('button'); node.className = 'charm'; node.dataset.id = item.id;
        const image = document.createElement('img'); image.draggable = false; node.append(image);
        const pin = document.createElement('button'); pin.className = 'anchor'; pin.dataset.id = item.id;
        entry = { item, node, image, pin, body: new core.RopeBody(fittedLength(item)), actionAt: -Infinity };
        entries.set(item.id, entry); shadow.append(node, pin);
        node.addEventListener('pointerdown', event => startDrag(event, entry, 'charm'));
        pin.addEventListener('pointerdown', event => startDrag(event, entry, 'anchor'));
        node.addEventListener('keydown', event => {
          const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          const direction = Object.hasOwn(directions, event.key) ? directions[event.key] : null;
          if (!direction && !['Enter', ' ', 'Escape'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          if (event.key === 'Escape') {
            if (dragging?.entry === entry) dragging.cancel();
            entry.body.reset(); wake();
          } else nudge(entry, ...(direction || []));
        });
        pin.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key) || config.locked) return;
          event.preventDefault(); event.stopPropagation();
          if (event.key === 'Escape') { if (dragging?.entry === entry) dragging.cancel(); return; }
          const x = event.key === 'Home' ? .02 : event.key === 'End' ? .98
            : entry.item.x + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .05 : .01);
          entry.item = core.charm({ ...entry.item, x });
          entry.body.reset();
          syncGeometry(entry);
          persistPosition(entry); wake();
        });
      }
      const next = dragging?.entry === entry && dragging.type === 'anchor' ? { ...item, x: entry.item.x } : item;
      if (entry.body.length !== fittedLength(next) || entry.item.hook !== next.hook) entry.body.reset(fittedLength(next));
      entry.item = next;
      entry.body.constrain(boundsOf(next, anchorOf(next)));
      const url = source(item.asset);
      if (url && entry.image.getAttribute('src') !== url) entry.image.src = url;
      else if (!url) entry.image.removeAttribute('src');
      entry.image.alt = item.name;
      entry.node.setAttribute('aria-label', `${item.name}. Pull to stretch and release to swing. Press Enter for its animation.`);
      entry.pin.setAttribute('aria-label', `Move ${item.name} hook along the top edge. Drag or use left and right arrows.`);
      entry.node.disabled = entry.pin.disabled = config.locked;
      entry.node.tabIndex = entry.pin.tabIndex = config.locked ? -1 : 0;
      entry.node.style.pointerEvents = entry.pin.style.pointerEvents = config.locked ? 'none' : 'auto';
      entry.node.style.opacity = item.opacity / 100;
      entry.image.style.borderRadius = item.shape === 'circle' ? '50%' : '0';
      entry.node.dataset.asset = item.asset;
      entry.node.dataset.effect = core.assets.includes(item.asset) ? ({ hammer: 'lightning', 'spider-man': 'spider-sense', princess: 'stardust' }[item.asset]) : 'none';
      entry.image.style.transform = `scale(${item.flip ? -1 : 1},1)`;
      syncGeometry(entry);
    }
    wake();
  }

  function persistPosition(entry) {
    if (!masterEnabled) return;
    if (preview && previewPort) previewPort.postMessage({ type: 'position', id: entry.item.id, x: entry.item.x });
    else chrome.runtime.sendMessage({ type: 'joy', operation: 'position', id: entry.item.id, patch: { x: entry.item.x, y: 0 } }).catch(() => {});
  }
  function nudge(entry, horizontal = anchorOf(entry.item).x >= width / 2 ? -1 : 1, vertical = 0) {
    if (config.locked || !active()) return;
    if (canAnimate()) entry.body.nudge(horizontal, vertical);
    entry.actionAt = performance.now(); wake();
  }
  const tilt = (x, y) => -limit(Math.atan2(x, y) * .22, -.3, .3);
  function syncGeometry(entry) {
    const { item, node, pin } = entry;
    const anchor = anchorOf(item), size = sizeOf(item);
    if (entry.size !== size) node.style.width = node.style.height = `${size}px`;
    if (entry.anchor?.x !== anchor.x) pin.style.transform = `translateX(${anchor.x - 20}px)`;
    if (entry.anchor?.y !== anchor.y) {
      node.dataset.anchorY = '0';
      node.dataset.ropeStartY = String(anchor.y);
    }
    entry.anchor = anchor;
    entry.bounds = boundsOf(item, anchor);
    entry.size = size;
  }
  function startDrag(event, entry, type) {
    if (config.locked || !active() || event.button !== 0 || !event.isPrimary || dragging) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget, { body, anchor } = entry;
    const x = event.clientX - anchor.x, y = event.clientY - anchor.y;
    const angle = tilt(body.x, body.y);
    const ox = (x - body.x) * Math.cos(angle) + (y - body.y) * Math.sin(angle);
    const oy = -(x - body.x) * Math.sin(angle) + (y - body.y) * Math.cos(angle);
    const gesture = { entry, type }, pointerId = event.pointerId;
    const originalX = entry.item.x;
    let lastX = event.clientX, lastY = event.clientY, moved = false, pending = false, draggedAt = performance.now(), sampleTime = draggedAt;
    dragging = gesture;
    if (type === 'charm') body.vx = body.vy = 0;
    target.setAttribute('data-pointer-focus', '');
    target.focus({ preventScroll: true });
    target.setPointerCapture(pointerId);

    function move(event) {
      if (dragging !== gesture || event.pointerId !== pointerId) return;
      if (event.clientX === lastX && event.clientY === lastY) return;
      event.preventDefault(); event.stopPropagation();
      lastX = event.clientX; lastY = event.clientY; moved = pending = true;
      sampleTime = performance.now();
      wake();
    }
    gesture.update = () => {
      if (!pending) return;
      pending = false;
      if (type === 'anchor') {
        entry.item = core.charm({ ...entry.item, x: (lastX - x) / width });
        body.reset();
        syncGeometry(entry);
      } else {
        const { anchor, bounds } = entry;
        let nextX = body.x, nextY = body.y;
        for (let i = 0; i < 6; i++) {
          const angle = tilt(nextX, Math.max(0, nextY));
          nextX = lastX - anchor.x - (ox * Math.cos(angle) - oy * Math.sin(angle));
          nextY = lastY - anchor.y - (ox * Math.sin(angle) + oy * Math.cos(angle));
        }
        body.drag(limit(nextX, bounds.minX, bounds.maxX), limit(nextY, bounds.minY, bounds.maxY), (sampleTime - draggedAt) / 1000);
        draggedAt = sampleTime;
      }
    };
    function finish(event) {
      if (dragging !== gesture || event.pointerId !== pointerId) return;
      event.stopPropagation();
      if (event.type !== 'pointerup' || !active()) { gesture.cancel(); return; }
      move(event);
      gesture.update();
      cleanup();
      if (type === 'anchor') {
        if (entry.item.x !== originalX) persistPosition(entry);
      } else {
        if (!canAnimate()) body.reset();
        else if (performance.now() - draggedAt > 90) body.vx = body.vy = 0;
        if (moved) entry.actionAt = performance.now();
        else nudge(entry);
      }
      wake();
    }
    function cleanup() {
      dragging = null;
      entry.node.dataset.dragging = 'false';
      target.removeEventListener('pointermove', move);
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) target.removeEventListener(name, finish);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    }
    gesture.cancel = () => {
      if (type === 'anchor') { entry.item = { ...entry.item, x: originalX }; body.reset(); syncGeometry(entry); }
      else if (!canAnimate()) body.reset();
      else body.vx = body.vy = 0;
      cleanup();
      wake();
    };
    entry.node.dataset.dragging = 'true';
    target.addEventListener('pointermove', move);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(name, finish);
  }

  function resize() {
    dragging?.cancel();
    width = innerWidth; height = innerHeight;
    if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    painted = [];
    for (const entry of entries.values()) {
      const { item, body } = entry;
      if (body.length !== fittedLength(item)) body.reset(fittedLength(item));
      syncGeometry(entry);
      body.constrain(entry.bounds);
    }
    wake();
  }
  function draw(time) {
    const motion = canAnimate() ? 'running' : 'paused';
    if (host.dataset.motion !== motion) host.dataset.motion = motion;
    // Clear every previous region before drawing so overlapping charms keep their z-order.
    for (const region of painted) ctx.clearRect(...region);
    painted = [];
    for (const entry of entries.values()) {
      const { item, body, node, anchor, size } = entry;
      const bob = { x: anchor.x + body.x, y: anchor.y + body.y };
      const angle = tilt(body.x, body.y);
      const path = art.rope(ctx, item, anchor, bob, body.length, width);
      const effects = hasEffects(item);
      if (effects) art.effects(ctx, entry, path, time, angle, size);
      const padding = effects ? size * 2 + 28 : 10;
      const left = Math.floor(Math.min(anchor.x - 24, bob.x - padding, path.first.x - 10, path.second.x - 10));
      const right = Math.ceil(Math.max(anchor.x + 24, bob.x + padding, path.first.x + 10, path.second.x + 10));
      const top = Math.min(0, Math.floor(bob.y - padding));
      const bottom = Math.ceil(Math.max(38, bob.y + padding, path.first.y + 10, path.second.y + 10));
      painted.push([left, top, right - left, bottom - top]);
      const transform = `translate3d(${bob.x - size / 2}px,${bob.y}px,0) rotate(${angle}rad)`;
      if (entry.transform !== transform) node.style.transform = entry.transform = transform;
      const length = Math.max(body.length, Math.hypot(body.x, body.y)).toFixed(1);
      if (node.dataset.ropeLength !== length) node.dataset.ropeLength = length;
    }
  }
  function tick(time) {
    raf = 0;
    if (document.hidden || !active() || !host?.isConnected) return;
    const moving = canAnimate(), dt = lastTime ? (time - lastTime) / 1000 : 1 / 60;
    lastTime = time;
    dragging?.update();
    let swinging = false, effects = false;
    for (const entry of entries.values()) {
      const { item, body, anchor, bounds } = entry;
      effects ||= hasEffects(item);
      if (dragging?.entry === entry) continue;
      if (!moving) { if (!body.settled) body.reset(); continue; }
      const wind = Math.sin(time / 2000 + anchor.x) * config.breeze * .25;
      if (wind || !body.settled) body.step(dt, bounds, wind);
      swinging ||= !body.settled;
    }
    draw(time);
    if (moving && (swinging || config.breeze > 0)) raf = requestAnimationFrame(tick);
    else {
      lastTime = 0;
      if (effects) effectTimer = setTimeout(wake, 60);
    }
  }
  function wake() {
    clearTimeout(effectTimer); effectTimer = 0;
    if (!raf && !document.hidden && active()) raf = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(raf); clearTimeout(effectTimer);
    raf = effectTimer = lastTime = 0;
  }
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
  document.addEventListener('fullscreenchange', () => { if (active() && entries.size) ensureHost(); });
  reduced.addEventListener('change', wake);
})();
