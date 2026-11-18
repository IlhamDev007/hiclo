// Shared by classic content scripts and extension modules. Keep all display
// validation here so saved settings and legacy values use the same ceiling.
(() => {
  const modes = ['natural', 'warm', 'grayscale'];
  function normalize(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const clamp = (number, fallback, min, max) => Number.isFinite(number) ? Math.round(Math.min(max, Math.max(min, number))) : fallback;
    return {
      brightness: clamp(value.brightness, 100, 0, 100),
      mode: modes.includes(value.mode) ? value.mode : 'natural',
      intensity: clamp(value.intensity, 50, 0, 100)
    };
  }
  function siteKey(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname.toLowerCase().replace(/^www\./, '') : null;
    } catch { return null; }
  }
  function normalizeSites(value) {
    const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const [key, preference] of Object.entries(value)) {
      const domain = siteKey(key) || siteKey(`https://${key}`);
      const legacy = /^https?:\/\//.test(key);
      const validHost = /^(?:[a-z\d.-]+|\[[a-f\d:]+\])$/i.test(key);
      if ((!legacy && !validHost) || !domain || !preference || typeof preference !== 'object') continue;
      // Migrate legacy origin keys; prefer an already-migrated domain entry.
      if (Object.hasOwn(result, domain) && key !== domain) continue;
      result[domain] = { ...normalize(preference), active: preference.active !== false };
    }
    return result;
  }
  function resolve(global, sites, url) {
    const key = siteKey(url);
    return normalize(key && Object.hasOwn(sites || {}, key) && sites[key].active !== false ? sites[key] : global);
  }
  globalThis.StillDisplay = Object.freeze({ modes, normalize, siteKey, normalizeSites, resolve });
})();
