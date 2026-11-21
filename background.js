import { DEFAULTS, normalize, normalizeDisplay, normalizeSites, siteKey } from './shared/settings.js';
import { configureJoy } from './features/joy/joy-store.js';

let configurationQueue = Promise.resolve();
async function configure(message) {
  // Read the latest state inside a single writer queue. Popups in different
  // windows must not overwrite one another with stale full-storage snapshots.
  const stored = await chrome.storage.local.get(['settings', 'siteSettings']);
  let value = normalize(stored.settings);
  let sites = normalizeSites(stored.siteSettings);
  const domain = siteKey(message.url);
  if (message.operation === 'site') {
    if (!domain) throw new Error('Open a normal website to save a site configuration.');
    sites[domain] = { ...normalizeDisplay(message.display), active: true };
    await chrome.storage.local.set({ siteSettings: sites });
  } else if (message.operation === 'global') {
    value = normalize({ ...value, ...normalizeDisplay(message.display) });
    for (const preference of Object.values(sites)) preference.active = false;
    await chrome.storage.local.set({ settings: value, siteSettings: sites });
  } else if (message.operation === 'remove') {
    if (!domain) throw new Error('No website configuration selected.');
    delete sites[domain];
    await chrome.storage.local.set({ siteSettings: sites });
  } else if (message.operation === 'settings') {
    value = normalize({ ...value, ...message.patch });
    await chrome.storage.local.set({ settings: value });
  } else if (message.operation === 'reset') {
    const fields = { display: ['brightness', 'mode', 'intensity'], privacy: ['hideTitle', 'hideIcon', 'tabTitle', 'tabIcon'], window: ['rememberSize', 'width', 'height'] }[message.component];
    if (!fields) throw new Error('Select the component to reset.');
    for (const field of fields) value[field] = DEFAULTS[field];
    const patch = { settings: value };
    if (message.component === 'display') { sites = {}; patch.siteSettings = sites; }
    await chrome.storage.local.set(patch);
  } else throw new Error('Unknown configuration action.');
  return { ok: true, settings: value, siteSettings: sites };
}

async function settings() {
  return normalize((await chrome.storage.local.get('settings')).settings);
}
async function resize(id, value) {
  const win = await chrome.windows.get(id);
  if (win.type !== 'normal') return null;
  // Chromium requires a separate state update before setting normal bounds.
  if (win.state !== 'normal') await chrome.windows.update(id, { state: 'normal' });
  await chrome.windows.update(id, { width: value.width, height: value.height });
  const actual = await chrome.windows.get(id);
  return { width: actual.width, height: actual.height };
}
async function applySaved(win) {
  const value = await settings();
  if (value.enabled && value.rememberSize && win.type === 'normal') await resize(win.id, value);
}
chrome.windows.onCreated.addListener(win => { applySaved(win).catch(console.warn); });
chrome.runtime.onStartup.addListener(() => {
  chrome.windows.getAll({ windowTypes: ['normal'] }).then(wins => Promise.all(wins.map(applySaved))).catch(console.warn);
});
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['settings', 'siteSettings']);
  await chrome.storage.local.set({ settings: normalize(stored.settings || DEFAULTS), siteSettings: normalizeSites(stored.siteSettings) });
  await configureJoy({ operation: 'migrate' });
  // Also activate on pages that were open when the extension was installed/reloaded.
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['features/display/display.js', 'features/display/content.js', 'features/joy/joy-core.js', 'features/joy/joy-art.js', 'features/joy/joy-content.js'] })));
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === 'joy' && sender.id === chrome.runtime.id && (sender.url === chrome.runtime.getURL('popup/popup.html') || (sender.tab && message.operation === 'position'))) {
    const request = sender.url === chrome.runtime.getURL('popup/popup.html') ? message : { ...message, url: sender.url };
    configurationQueue = configurationQueue.catch(() => {}).then(() => configureJoy(request));
    configurationQueue.then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup/popup.html')) return;
  if (message.type === 'configure') {
    configurationQueue = configurationQueue.catch(() => {}).then(() => configure(message));
    configurationQueue.then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'resize') {
    (async () => {
      if (!Number.isInteger(message.windowId)) throw new Error('No browser window selected.');
      if (!(await settings()).enabled) throw new Error('Resume the extension before applying a window size.');
      const value = normalize(message);
      return { ok: true, actual: await resize(message.windowId, value) };
    })().then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || changes.settings?.newValue?.enabled !== false) return;
  // Close only PiP windows opened by this extension, including embedded players.
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).then(tabs => Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: async () => {
      globalThis.__hicloFloatingPage?.window.close();
      if (globalThis.__stillPip && document.pictureInPictureElement) await document.exitPictureInPicture().catch(() => {});
      globalThis.__stillPip = false;
    }
  })))).catch(console.warn);
});
