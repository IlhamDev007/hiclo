import './joy-core.js';
import { editJoy, validImage } from './joy-state.js';
export async function configureJoy(message) {
  const stored = await chrome.storage.local.get(['settings', 'joy', 'joySites', 'joyImages']);
  const core = globalThis.StillJoy;
  let joy = core.normalize(stored.joy), sites = core.normalizeSites(stored.joySites);
  const images = { ...stored.joyImages }, domain = core.siteKey(message.url);
  if (message.operation === 'apply-site' || message.operation === 'apply-global') {
    const value = core.normalize(message.joy);
    for (const item of value.charms) if (!core.assets.includes(item.asset)) {
      const data = message.images?.[item.asset] || images[item.asset];
      if (!validImage(data)) throw new Error('A custom image is missing or too large. Upload it again.');
      images[item.asset] = data;
    }
    if (message.operation === 'apply-site') {
      if (!domain) throw new Error('Open a normal website to save a site configuration.');
      sites[domain] = { ...value, active: true };
    } else {
      joy = value;
      for (const site of Object.values(sites)) site.active = false;
    }
  } else if (message.operation === 'remove-site') {
    if (!domain) throw new Error('No website selected.');
    delete sites[domain];
  } else if (message.operation === 'reset') {
    joy = core.normalize(); sites = {};
  } else if (message.operation === 'position') {
    if (stored.settings?.enabled === false) throw new Error('The extension is paused.');
    if (!domain) throw new Error('No website selected.');
    const target = sites[domain]?.active !== false && sites[domain] ? sites[domain] : joy;
    const edited = editJoy(target, images, 'position', message).joy;
    if (target === joy) joy = edited; else sites[domain] = { ...edited, active: true };
  } else if (message.operation !== 'migrate') throw new Error('Unknown Joy action.');
  const used = new Set([joy, ...Object.values(sites)].flatMap(value => value.charms.map(item => item.asset)));
  for (const key of Object.keys(images)) if (!used.has(key)) delete images[key];
  // Site-only saves never include the global Joy key.
  const patch = { joySites: sites, joyImages: images };
  if (['apply-global', 'reset', 'migrate'].includes(message.operation) || (message.operation === 'position' && !sites[domain]?.active)) patch.joy = joy;
  await chrome.storage.local.set(patch);
  return { ok: true, joy, joySites: sites, joyImages: images };
}
