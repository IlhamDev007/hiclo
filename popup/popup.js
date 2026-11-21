import { DEFAULTS, normalize, normalizeDisplay, normalizeSites, siteKey, resolveDisplay } from '../shared/settings.js';
import { videoAction } from '../features/video/video.js';
const $ = id => document.getElementById(id);
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); document.querySelector('[data-panel="display"]').click(); });
let settings = { ...DEFAULTS };
let currentWindow;
let currentTab;
let currentSite;
let siteSettings = {};
let scope = 'all';
let draft = null;
let draftRevision = 0;
let draftDirty = false;
let previewPort = null;
let videoFrame = null;
let videoState = null;
let persistQueue = Promise.resolve();
let toastTimer;
let currentPanel = 'display';
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}
function save(patch) {
  settings = normalize({ ...settings, ...patch });
  return persist('settings', { patch });
}
function displaySettings() {
  return draft || resolveDisplay(settings, siteSettings, currentTab?.url);
}
function saveDisplay(patch) {
  draft = normalizeDisplay({ ...displaySettings(), ...patch });
  draftDirty = true; draftRevision++;
  render();
  $('save-status').textContent = currentSite ? 'Saving…' : 'Preview only · choose where to apply';
  try {
    if (!previewPort) {
      if (!currentSite) return;
      const port = chrome.tabs.connect(currentTab.id, { name: 'still-display-preview', frameId: 0 });
      previewPort = port;
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        if (previewPort === port) previewPort = null;
      });
    }
    previewPort.postMessage({ display: draft });
  } catch { previewPort = null; toast('Reload the page to preview display changes.'); }
  if (currentSite) {
    const revision = draftRevision;
    persist('site', { url: currentTab.url, display: { ...draft } }).then(() => {
      scope = 'site';
      if (revision === draftRevision) {
        draftDirty = false;
        previewPort?.postMessage({ display: null });
      }
      render();
      $('save-status').textContent = draftDirty ? 'Saving…' : 'Saved on this device';
    }).catch(() => {});
  }
}
function persist(operation, payload = {}) {
  render();
  $('save-status').textContent = 'Saving…';
  // Dispatch immediately: the background queue survives popup closure.
  persistQueue = (async () => {
    const response = await chrome.runtime.sendMessage({ type: 'configure', operation, ...payload });
    if (!response?.ok) throw new Error(response?.error || 'Could not save settings.');
    settings = normalize(response.settings);
    siteSettings = normalizeSites(response.siteSettings);
    render();
  })();
  persistQueue.then(() => { $('save-status').textContent = draftDirty ? (currentSite ? 'Saving…' : 'Preview only · choose where to apply') : 'Saved on this device'; }, () => {
    $('save-status').textContent = 'Could not save'; toast('Settings could not be saved. Please try again.');
  });
  return persistQueue;
}
function render() {
  const display = displaySettings();
  for (const key of ['enabled', 'hideTitle', 'hideIcon', 'rememberSize']) $(key).checked = settings[key];
  for (const key of ['tabTitle', 'tabIcon']) {
    if (document.activeElement !== $(key)) $(key).value = settings[key];
  }
  for (const key of ['brightness', 'intensity']) $(key).value = display[key];
  for (const key of ['width', 'height']) if (document.activeElement !== $(key) && !$(key).dataset.dirty) $(key).value = settings[key];
  $('brightness-value').innerHTML = `${display.brightness}<span>%</span>`;
  $('intensity-value').textContent = `${display.intensity}%`;
  for (const key of ['brightness', 'intensity']) {
    const input = $(key);
    input.style.setProperty('--progress', `${(display[key] - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
  }
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', button.dataset.mode === display.mode);
  $('intensity-group').hidden = display.mode === 'natural';
  $('brighter').disabled = display.brightness >= 100;
  $('dimmer').disabled = display.brightness <= 0;
  $('scope-site').disabled = !currentSite;
  $('scope-badge').textContent = draftDirty ? (currentSite ? 'SAVING' : 'PREVIEW') : scope === 'site' ? 'THIS SITE' : 'ALL SITES';
  const custom = currentSite && Object.hasOwn(siteSettings, currentSite);
  $('use-global').disabled = !custom;
  $('scope-description').textContent = draftDirty ? (currentSite ? 'Saving for this website…' : 'Preview on this tab only. Choose where to save.') : scope === 'site'
    ? `${currentSite} · This domain only`
    : 'Global settings · edits save for this website.';
  $('scope-description').title = scope === 'site' ? currentSite : '';
  $('title-field').hidden = !settings.hideTitle;
  $('icon-field').hidden = !settings.hideIcon;
  $('preview-title').textContent = settings.hideTitle ? settings.tabTitle : 'Your current page';
  $('preview-icon').textContent = settings.hideIcon ? ({ blank: ' ', dot: '●', leaf: '❧' }[settings.tabIcon]) : '◉';
  $('power-label').textContent = settings.enabled ? 'Enabled' : 'Paused';
  document.body.classList.toggle('paused', !settings.enabled);
  $('pop-video').disabled = !settings.enabled;
  $('window-preview-size').textContent = `${settings.width} × ${settings.height}`;
}
for (const button of document.querySelectorAll('[data-panel]')) button.addEventListener('click', () => {
  currentPanel = button.dataset.panel;
  for (const tab of document.querySelectorAll('[data-panel]')) { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-selected', tab === button); tab.tabIndex = tab === button ? 0 : -1; }
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== button.dataset.panel;
  $('display-apply').hidden = button.dataset.panel !== 'display';
  $('joy-apply').hidden = button.dataset.panel !== 'joy';
  $('reset-all').textContent = `Reset ${currentPanel === 'joy' ? 'Joy' : currentPanel[0].toUpperCase() + currentPanel.slice(1)}`;
  document.body.classList.toggle('joy-open', button.dataset.panel === 'joy');
  document.dispatchEvent(new CustomEvent('component-changed', { detail: currentPanel }));
});
document.querySelector('nav').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...document.querySelectorAll('[data-panel]')];
  const index = tabs.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].click(); tabs[next].focus();
});
for (const key of ['enabled', 'hideTitle', 'hideIcon', 'rememberSize']) $(key).addEventListener('change', () => save({ [key]: $(key).checked }));
for (const key of ['brightness', 'intensity']) $(key).addEventListener('input', () => saveDisplay({ [key]: Number($(key).value) }));
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => saveDisplay({ mode: button.dataset.mode, intensity: button.dataset.mode === 'grayscale' ? 100 : displaySettings().intensity }));
for (const choice of ['all', 'site']) $(`scope-${choice}`).addEventListener('click', async () => {
  const revision = draftRevision;
  const value = { ...displaySettings() };
  try {
    await persist(choice === 'site' ? 'site' : 'global', { url: currentTab?.url, display: value });
    scope = choice;
    if (revision === draftRevision) {
      draft = resolveDisplay(settings, siteSettings, currentTab?.url); draftDirty = false;
      previewPort?.postMessage({ display: null });
    }
    render();
    $('save-status').textContent = draftDirty ? 'Preview only · choose where to apply' : 'Saved on this device';
  } catch { /* persist reports save failures without discarding the draft. */ }
});
$('use-global').addEventListener('click', async () => {
  try {
    await persist('remove', { url: currentTab?.url });
    draft = resolveDisplay(settings, siteSettings, currentTab?.url); draftDirty = false; draftRevision++; scope = 'all';
    previewPort?.postMessage({ display: null }); render();
    $('save-status').textContent = 'Saved on this device';
    toast('Site configuration removed. This domain now uses global settings.');
  } catch { /* Keep the existing configuration when a save fails. */ }
});
$('tabTitle').addEventListener('input', () => save({ tabTitle: $('tabTitle').value }));
$('tabTitle').addEventListener('blur', render);
$('tabIcon').addEventListener('change', () => save({ tabIcon: $('tabIcon').value }));
$('dimmer').addEventListener('click', () => saveDisplay({ brightness: displaySettings().brightness - 5 }));
$('brighter').addEventListener('click', () => saveDisplay({ brightness: displaySettings().brightness + 5 }));
$('brightness-reset').addEventListener('click', () => saveDisplay({ brightness: 100 }));
for (const key of ['width', 'height']) $(key).addEventListener('input', () => { $(key).dataset.dirty = 'true'; });
$('capture-size').addEventListener('click', async () => {
  try {
    const win = await chrome.windows.get(currentWindow.id);
    delete $('width').dataset.dirty; delete $('height').dataset.dirty;
    await save({ width: win.width, height: win.height });
    $('width').value = settings.width; $('height').value = settings.height;
    $('window-message').textContent = `Saved current size: ${settings.width} × ${settings.height}. Enable “Remember window size” to use it next session.`;
  } catch (error) { toast(error.message); }
});
$('apply-size').addEventListener('click', async () => {
  if (!$('width').reportValidity() || !$('height').reportValidity()) return;
  $('apply-size').disabled = true;
  try {
    delete $('width').dataset.dirty; delete $('height').dataset.dirty;
    await save({ width: Number($('width').value), height: Number($('height').value) });
    const response = await chrome.runtime.sendMessage({ type: 'resize', windowId: currentWindow.id, width: settings.width, height: settings.height });
    if (!response?.ok || !response.actual) throw new Error(response?.error || 'This window cannot be resized.');
    const actual = response.actual;
    $('window-message').textContent = actual.width === settings.width && actual.height === settings.height
      ? `Applied ${actual.width} × ${actual.height}. ${settings.rememberSize ? 'Future windows will use this size.' : 'Enable “Remember window size” to apply automatically.'}`
      : `Requested ${settings.width} × ${settings.height}; browser applied ${actual.width} × ${actual.height} due to screen or browser limits.`;
    toast('Window dimensions saved and applied.');
  } catch (error) { toast(error.message); }
  finally { $('apply-size').disabled = false; }
});
$('reset-all').addEventListener('click', async () => {
  if (currentPanel === 'joy') { document.dispatchEvent(new Event('reset-joy')); return; }
  const component = currentPanel;
  try {
    await persist('reset', { component });
    if (component === 'display') { draft = null; draftDirty = false; draftRevision++; scope = 'all'; previewPort?.postMessage({ display: null }); }
    if (component === 'window') { delete $('width').dataset.dirty; delete $('height').dataset.dirty; }
    render(); $('save-status').textContent = 'Saved on this device'; toast(`Only ${component} settings were reset.`);
  } catch { /* Keep saved values on error. */ }
});
function renderVideo(state) {
  videoState = state;
  $('pop-video').textContent = state?.active ? 'Return ↙' : 'Pop out ↗';
  $('video-controls').hidden = !state?.active;
  $('video-play').textContent = state?.paused ? 'Play' : 'Pause';
  $('video-mute').textContent = state?.muted ? 'Unmute' : 'Mute';
  $('video-status').textContent = state?.error || (state?.active ? 'Floating above your other windows.' : state?.found ? state.supported ? 'Video ready for Picture-in-Picture.' : 'This player blocks Picture-in-Picture.' : 'Start a video, then pop it out.');
}
async function refreshVideo() {
  if (!currentSite) { renderVideo({ error: 'Open a supported video website first.' }); return; }
  const frames = await chrome.scripting.executeScript({ target: { tabId: currentTab.id, allFrames: true }, func: videoAction, args: ['inspect'] });
  const best = frames.filter(frame => frame.result?.found).sort((a, b) => b.result.score - a.result.score)[0];
  videoFrame = best?.frameId ?? null;
  renderVideo(best?.result);
}
async function controlVideo(action) {
  $('pop-video').disabled = true;
  try {
    if (!settings.enabled && action !== 'close') throw new Error('Resume the extension before using video controls.');
    if (videoFrame === null) await refreshVideo();
    if (videoFrame === null) throw new Error('Start a video on this page, then try again.');
    const [response] = await chrome.scripting.executeScript({ target: { tabId: currentTab.id, frameIds: [videoFrame] }, func: videoAction, args: [action] });
    renderVideo(response?.result);
    if (response?.result?.error) toast(response.result.error);
  } catch (error) { renderVideo({ error: error.message }); toast(error.message); videoFrame = null; }
  finally { $('pop-video').disabled = !settings.enabled; }
}
$('pop-video').addEventListener('click', () => controlVideo(videoState?.active ? 'close' : 'open'));
for (const button of document.querySelectorAll('[data-video]')) button.addEventListener('click', () => controlVideo(button.dataset.video));
async function init() {
  try {
    const data = await chrome.storage.local.get(['settings', 'siteSettings']);
    settings = normalize(data.settings);
    siteSettings = normalizeSites(data.siteSettings);
    currentWindow = await chrome.windows.getCurrent();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    currentSite = siteKey(tab?.url);
    scope = currentSite && siteSettings[currentSite]?.active ? 'site' : 'all';
    draft = resolveDisplay(settings, siteSettings, currentTab?.url);
    render();
    refreshVideo().catch(() => renderVideo({ error: 'Video access unavailable on this page.' }));
    try {
      const status = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
      if (!status?.active) throw new Error('Unavailable');
      $('page-status-text').textContent = 'Ready on this page';
    } catch {
      $('page-status').classList.add('limited');
      $('page-status-text').textContent = 'Protected page or reload needed';
    }
  } catch (error) { $('save-status').textContent = 'Unable to load settings'; toast(error.message); }
}
init();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || (!changes.settings && !changes.siteSettings)) return;
  if (changes.settings) settings = normalize(changes.settings.newValue);
  if (changes.siteSettings) siteSettings = normalizeSites(changes.siteSettings.newValue);
  if (!draftDirty) draft = resolveDisplay(settings, siteSettings, currentTab?.url);
  render();
});
