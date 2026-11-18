import './joy-core.js';
import { editJoy } from './joy-state.js';
const core = globalThis.StillJoy;
const $ = id => document.getElementById(id);
let joy = core.normalize(), savedGlobal = core.normalize(), sites = {}, images = {}, selected = null, queue = Promise.resolve(), pageTab = null, previewPort = null, dirty = false, masterEnabled = true, revision = 0;
const labels = { 'spider-man': 'Spider-Man', hammer: 'Thor\u2019s Hammer', princess: 'Princess' };
const captions = { 'spider-man': 'Spider sense', hammer: 'Lightning strike', princess: 'Stardust' };
function report(message, error = false) { $('joy-message').textContent = message; $('joy-message').classList.toggle('error', error); }
function imageURL(asset) { return core.assets.includes(asset) ? `../assets/joy/${asset}.png` : images[asset]; }
function preview() {
  if (!pageTab?.id || !core.siteKey(pageTab.url)) return;
  if (!previewPort) {
    const port = chrome.tabs.connect(pageTab.id, { name: 'still-joy-preview', frameId: 0 }); previewPort = port;
    port.onDisconnect.addListener(() => { void chrome.runtime.lastError; if (previewPort === port) previewPort = null; });
    port.onMessage.addListener(message => {
      if (message.type === 'position') change('position', { id: message.id, patch: { x: message.x } }).catch(() => {});
    });
  }
  try { previewPort.postMessage({ joy, images }); } catch { previewPort = null; }
}
async function change(operation, payload = {}) {
  try {
    const edited = editJoy(joy, images, operation, payload);
    joy = edited.joy; images = edited.images; dirty = true; revision++;
    if (operation === 'add' || operation === 'upload') { selected = joy.charms.at(-1)?.id; $('joy-library').open = false; }
    render(); preview(); report(masterEnabled ? 'Preview on this tab only. Choose where to save below.' : 'Extension paused. Settings can be saved; effects stay off.');
  } catch(error) { report(error.message,true); throw error; }
}
async function saveJoy(operation) {
  const snapshot = { joy: structuredClone(joy), images: { ...images }, url: pageTab?.url }, savedRevision = revision;
  queue = queue.catch(() => {}).then(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'joy', operation, ...snapshot });
    if (!response?.ok) throw new Error(response?.error || 'Could not save Joy.');
    savedGlobal = core.normalize(response.joy); sites = core.normalizeSites(response.joySites);
    if (savedRevision === revision || operation === 'reset') {
      joy = core.resolve(savedGlobal, sites, pageTab?.url); images = response.joyImages || {}; dirty = false;
      previewPort?.postMessage({ joy: null });
    }
    render(); report(operation === 'remove-site' ? 'Site configuration removed. This domain uses global Joy.' : operation === 'reset' ? 'Joy reset. Other components were preserved.' : 'Joy configuration saved.');
  });
  queue.catch(error => report(error.message,true)); return queue;
}
function render() {
  const domain = core.siteKey(pageTab?.url);
  $('joy-scope-site').disabled = !domain;
  $('joy-config-remove').disabled = !domain || !Object.hasOwn(sites,domain);
  $('joy-scope-note').textContent = !masterEnabled ? 'Extension paused. Joy stays hidden.' : dirty ? 'Preview here only. Choose where to save.' : sites[domain]?.active ? domain + ' only' : 'Global Joy configuration';
  if (document.querySelector('[data-panel="joy"]').classList.contains('active')) $('save-status').textContent = dirty ? 'Joy preview (not saved)' : 'Saved on this device';
  for (const key of ['enabled', 'locked', 'motion', 'effects']) $(`joy-${key}`).checked = joy[key];
  $('joy-breeze').value = joy.breeze; $('joy-breeze-value').textContent = `${Math.round(joy.breeze)}%`;
  $('joy-count').textContent = `${joy.charms.length}/6`;
  if (!joy.charms.some(item => item.id === selected)) selected = joy.charms[0]?.id || null;
  const select = $('joy-selected'); select.replaceChildren();
  for (const item of joy.charms) {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; select.append(option);
  }
  select.value = selected || '';
  const item = joy.charms.find(item => item.id === selected);
  $('joy-collection').hidden = !item; $('joy-empty').hidden = !!item; $('joy-editor').hidden = !item;
  if (item) {
    for (const key of ['name', 'size', 'length', 'rope', 'color', 'thickness', 'opacity', 'shape']) if (document.activeElement !== $(`joy-${key}`)) $(`joy-${key}`).value = item[key];
    $('joy-flip').checked = item.flip;
    for (const key of ['size', 'length', 'opacity', 'thickness']) $(`joy-${key}-value`).textContent = `${Math.round(item[key])}${key === 'opacity' ? '%' : 'px'}`;
    if (document.activeElement !== $('joy-x')) $('joy-x').value = Math.round(item.x * 100);
    $('joy-x-value').textContent = `${Math.round(item.x * 100)}%`;
    for (const button of document.querySelectorAll('[data-joy-design]')) button.setAttribute('aria-pressed', core.designs[button.dataset.joyDesign].hook === item.hook);
    $('joy-play').disabled = !core.assets.includes(item.asset) || !joy.motion || !joy.effects;
  }
  $('joy-remove').disabled = !item;
  for (const button of document.querySelectorAll('[data-joy-add]')) button.disabled = joy.charms.length >= 6;
}
for (const asset of core.assets) {
  const button = document.createElement('button'); button.className = 'joy-preset'; button.dataset.joyAdd = asset;
  button.setAttribute('aria-label', `Add ${labels[asset]}`);
  const img = document.createElement('img'); img.src = imageURL(asset); img.alt = '';
  const name = document.createElement('span'); name.textContent = labels[asset];
  const caption = document.createElement('small'); caption.textContent = captions[asset];
  button.append(img, name, caption); button.addEventListener('click', () => { change('add', { asset, name: labels[asset] }).catch(() => {}); });
  $('joy-presets').append(button);
}
$('joy-selected').addEventListener('change', () => { selected = $('joy-selected').value; render(); });
for (const key of ['enabled', 'locked', 'motion', 'effects']) $(`joy-${key}`).addEventListener('change', () => change('settings', { patch: { [key]: $(`joy-${key}`).checked } }).catch(() => {}));
$('joy-breeze').addEventListener('change', () => change('settings', { patch: { breeze: Number($('joy-breeze').value) } }).catch(() => {}));
$('joy-breeze').addEventListener('input', () => { $('joy-breeze-value').textContent = `${$('joy-breeze').value}%`; });
for (const button of document.querySelectorAll('[data-joy-design]')) button.addEventListener('click', () => change('update', { id: selected, patch: core.designs[button.dataset.joyDesign] }).catch(() => {}));
for (const key of ['name', 'size', 'length', 'rope', 'color', 'thickness', 'opacity', 'shape', 'flip', 'x']) {
  const control = $(`joy-${key}`);
  control.addEventListener('change', () => {
    let value = control.type === 'checkbox' ? control.checked : ['range', 'number'].includes(control.type) ? Number(control.value) : control.value;
    if (key === 'x') value /= 100;
    change('update', { id: selected, patch: { [key]: value } }).catch(() => {});
  });
  if (control.type === 'range') control.addEventListener('input', () => {
    const output = $(`joy-${key}-value`);
    if (output) output.textContent = `${control.value}${key === 'opacity' || key === 'x' ? '%' : 'px'}`;
  });
}
$('joy-remove').addEventListener('click', () => change('remove', { id: selected }).catch(() => {}));
$('joy-play').addEventListener('click', async () => {
  try {
    if (!pageTab?.id) throw new Error('Open Joy from a normal webpage to play its animation.');
    const response = await chrome.tabs.sendMessage(pageTab.id, { type: 'joy-play', id: selected });
    if (!response?.ok) throw new Error('Enable Joy on this page first. Reload the page if needed.');
    report('Animation triggered on your webpage.');
  } catch (error) { report(error.message, true); }
});
$('joy-upload').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a PNG, JPEG, or WebP under 8 MB.');
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 40000000) { bitmap.close(); throw new Error('Use an image under 40 megapixels.'); }
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    await change('upload', { name: file.name.replace(/\.[^.]+$/, '').slice(0, 50), data: canvas.toDataURL('image/webp', .9) });
  } catch (error) { report(error.message, true); }
  finally { event.target.value = ''; }
});
for (const [id, operation] of [['joy-scope-site','apply-site'],['joy-scope-all','apply-global'],['joy-config-remove','remove-site']]) $(id).addEventListener('click', () => saveJoy(operation).catch(() => {}));
document.addEventListener('reset-joy', () => saveJoy('reset').catch(() => {}));
document.addEventListener('component-changed', event => { if(event.detail === 'joy') render(); });
Promise.all([chrome.storage.local.get(['settings','joy','joySites','joyImages']),chrome.tabs.query({active:true,currentWindow:true})]).then(([data,[tab]]) => {
  pageTab=tab; masterEnabled=data.settings?.enabled!==false; savedGlobal=core.normalize(data.joy); sites=core.normalizeSites(data.joySites);
  joy=core.resolve(savedGlobal,sites,tab?.url); images=data.joyImages||{}; selected=joy.charms[0]?.id; $('joy-library').open=!joy.charms.length; render();
}).catch(error=>report(error.message,true));
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local')return;
  if(changes.settings) masterEnabled=changes.settings.newValue?.enabled!==false;
  if(changes.joy) savedGlobal=core.normalize(changes.joy.newValue);
  if(changes.joySites)sites=core.normalizeSites(changes.joySites.newValue);
  if(!dirty && (changes.joy||changes.joySites||changes.joyImages)) { joy=core.resolve(savedGlobal,sites,pageTab?.url); if(changes.joyImages)images=changes.joyImages.newValue||{}; }
  render();
});
