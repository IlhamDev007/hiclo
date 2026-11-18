import './joy-core.js';
const core = globalThis.StillJoy;
export function validImage(data) {
  return typeof data === 'string' && data.length <= 1400000 && /^data:image\/(png|webp|jpeg);base64,[a-z0-9+/=]+$/i.test(data);
}
export function editJoy(current, currentImages, operation, payload = {}) {
  const joy = core.normalize(current), images = { ...currentImages };
  if (operation === 'position' || operation === 'update') {
    const index = joy.charms.findIndex(item => item.id === payload.id);
    if (index < 0) throw new Error('This figure was removed.');
    const item = joy.charms[index];
    const patch = operation === 'position' ? { x: payload.patch?.x } : payload.patch;
    joy.charms[index] = core.charm({ ...item, ...patch, id: item.id, asset: item.asset });
  } else if (operation === 'add' || operation === 'upload') {
    if (joy.charms.length >= 6) throw new Error('Remove a figure before adding another (maximum six).');
    const id = crypto.randomUUID(); let asset = payload.asset;
    if (operation === 'upload') {
      if (!validImage(payload.data)) throw new Error('Choose a smaller PNG, JPEG, or WebP image.');
      asset = `upload-${id}`; images[asset] = payload.data;
    } else if (!core.assets.includes(asset)) throw new Error('Unknown figure.');
    joy.charms.push(core.charm({ id, asset, name: payload.name || 'My figure', x: .75 - joy.charms.length * .1 }));
    joy.enabled = true;
  } else if (operation === 'remove') joy.charms = joy.charms.filter(item => item.id !== payload.id);
  else if (operation === 'settings') Object.assign(joy, core.normalize({ ...joy, ...payload.patch, charms: joy.charms }));
  else throw new Error('Unknown Joy edit.');
  return { joy, images };
}
