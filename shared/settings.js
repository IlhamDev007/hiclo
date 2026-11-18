import '../features/display/display.js';
export const { siteKey, normalizeSites, resolve: resolveDisplay } = globalThis.StillDisplay;
export const normalizeDisplay = globalThis.StillDisplay.normalize;
export const DEFAULTS = Object.freeze({
  enabled: true, brightness: 100, mode: 'natural', intensity: 50,
  hideTitle: false, hideIcon: false, tabTitle: 'Private tab',
  tabIcon: 'blank', rememberSize: false, width: 1280, height: 800
});
export const MODES = globalThis.StillDisplay.modes;
export function normalize(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const result = { ...DEFAULTS, ...normalizeDisplay(input) };
  for (const key of ['enabled', 'hideTitle', 'hideIcon', 'rememberSize']) {
    if (typeof input[key] === 'boolean') result[key] = input[key];
  }
  for (const [key, min, max] of [['width', 400, 7680], ['height', 300, 4320]]) {
    if (Number.isFinite(input[key])) result[key] = Math.round(Math.min(max, Math.max(min, input[key])));
  }
  if (MODES.includes(input.mode)) result.mode = input.mode;
  if (typeof input.tabTitle === 'string') result.tabTitle = input.tabTitle.trim().slice(0, 60) || DEFAULTS.tabTitle;
  if (['blank', 'dot', 'leaf'].includes(input.tabIcon)) result.tabIcon = input.tabIcon;
  return result;
}
