(() => {
  if (globalThis.__stillActive) return;
  globalThis.__stillActive = true;
  const defaults = { enabled: true, brightness: 100, mode: 'natural', intensity: 50, hideTitle: false, hideIcon: false, tabTitle: 'Private tab', tabIcon: 'blank' };
  let settings = { ...defaults };
  let globalSettings = { ...defaults };
  let siteSettings = {};
  let preview = null;
  let previewPort = null;
  const display = globalThis.StillDisplay;
  function resolveSettings() {
    settings = { ...globalSettings, ...display.resolve(globalSettings, siteSettings, location.href), ...preview };
  }
  let originalTitle = document.title;
  let maskingTitle = false;
  let overlay;
  let icon;
  const originals = new Map();
  const blank = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"></svg>');
  function iconURL() {
    if (settings.tabIcon === 'blank') return blank;
    const shape = settings.tabIcon === 'leaf'
      ? '<path d="M25 6C10 5 5 13 9 22c8 5 17-2 16-16Z" fill="#a591ff"/><path d="m9 24 12-13" stroke="#5543d0" stroke-width="2"/>'
      : '<circle cx="16" cy="16" r="7" fill="#6654e8"/>';
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${shape}</svg>`);
  }
  function saveIcon(node) {
    if (!originals.has(node)) originals.set(node, Object.fromEntries(['href', 'type', 'sizes'].map(attr => [attr, node.getAttribute(attr)])));
  }
  function process(records = []) {
    observer.disconnect();
    try {
      const hideTitle = settings.enabled && settings.hideTitle;
      const hideIcon = settings.enabled && settings.hideIcon;
      if (maskingTitle && document.title !== (settings.tabTitle || 'Private tab')) originalTitle = document.title;
      if (hideTitle) {
        if (!maskingTitle) originalTitle = document.title;
        document.title = settings.tabTitle || 'Private tab';
      } else if (maskingTitle) document.title = originalTitle;
      maskingTitle = hideTitle;
      for (const record of records) {
        if (record.type === 'attributes' && originals.has(record.target)) {
          const attr = record.attributeName;
          if (['href', 'type', 'sizes'].includes(attr)) originals.get(record.target)[attr] = record.target.getAttribute(attr);
        }
      }
      if (hideIcon && document.head) {
        for (const node of document.querySelectorAll('link[rel~="icon"]')) {
          if (node === icon) continue;
          saveIcon(node);
          node.setAttribute('href', iconURL());
          node.setAttribute('type', 'image/svg+xml');
          node.removeAttribute('sizes');
        }
        if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; icon.type = 'image/svg+xml'; }
        icon.href = iconURL();
        if (icon.parentNode !== document.head || document.head.lastChild !== icon) document.head.append(icon);
      } else {
        icon?.remove();
        for (const [node, attributes] of originals) for (const [attr, value] of Object.entries(attributes)) {
          if (value === null) node.removeAttribute(attr); else node.setAttribute(attr, value);
        }
        originals.clear();
      }
      renderDisplay();
    } finally {
      observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'rel', 'type', 'sizes'] });
    }
  }
  function renderDisplay() {
    const strength = settings.intensity / 100;
    let filter = `brightness(${settings.brightness / 100})`;
    if (settings.mode === 'grayscale') filter += ` grayscale(${strength})`;
    if (!settings.enabled || (settings.brightness === 100 && (settings.mode === 'natural' || strength === 0))) { overlay?.remove(); return; }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100%!important;height:100%!important;pointer-events:none!important;z-index:2147483647!important;display:block!important;';
    }
    overlay.style.setProperty('backdrop-filter', filter, 'important');
    overlay.style.setProperty('-webkit-backdrop-filter', filter, 'important');
    // Multiply a warm tint instead of using sepia/saturation, which can boost
    // highlights above their original level. A multiply tint only attenuates.
    overlay.style.setProperty('background', settings.mode === 'warm' ? `rgba(255, 190, 120, ${strength * .4})` : 'transparent', 'important');
    overlay.style.setProperty('mix-blend-mode', settings.mode === 'warm' ? 'multiply' : 'normal', 'important');
    const parent = document.fullscreenElement || document.documentElement;
    if (parent && overlay.parentNode !== parent) parent.append(overlay);
  }
  const observer = new MutationObserver(records => {
    // Ignore ordinary page updates: only tab metadata and a removed display layer matter.
    const metadataChanged = settings.enabled && (settings.hideTitle || settings.hideIcon) && records.some(record => {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return target === document.documentElement || target === document || document.head?.contains(target);
    });
    const needsDisplay = settings.enabled && (settings.brightness !== 100 || (settings.mode !== 'natural' && settings.intensity !== 0));
    if (metadataChanged || (needsDisplay && (!overlay || !overlay.isConnected))) process(records);
  });
  chrome.storage.local.get(['settings', 'siteSettings']).then(data => {
    globalSettings = { ...defaults, ...data.settings };
    siteSettings = display.normalizeSites(data.siteSettings);
    resolveSettings(); process();
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes.settings && !changes.siteSettings)) return;
    // Capture pending page mutations before replacing the mask configuration.
    process(observer.takeRecords());
    const oldMask = settings.tabTitle || 'Private tab';
    if (maskingTitle && document.title === oldMask) document.title = originalTitle;
    maskingTitle = false;
    if (changes.settings) globalSettings = { ...defaults, ...changes.settings.newValue };
    if (changes.siteSettings) siteSettings = display.normalizeSites(changes.siteSettings.newValue);
    resolveSettings();
    process();
  });
  document.addEventListener('fullscreenchange', () => process(observer.takeRecords()));
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'still-display-preview' || port.sender?.url !== chrome.runtime.getURL('popup/popup.html')) return;
    previewPort = port;
    port.onMessage.addListener(message => {
      if (previewPort !== port) return;
      preview = message.display ? display.normalize(message.display) : null;
      resolveSettings(); process(observer.takeRecords());
    });
    port.onDisconnect.addListener(() => {
      if (previewPort !== port) return;
      previewPort = null; preview = null;
      resolveSettings(); process(observer.takeRecords());
    });
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'status') respond({ active: true, title: maskingTitle, icon: !!(settings.enabled && settings.hideIcon) });
  });
})();
