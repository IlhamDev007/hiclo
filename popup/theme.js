// Popup appearance is independent from page filters, Joy, and master pause.
(() => {
  const root = document.documentElement;
  const valid = value => value === 'dark' ? 'dark' : 'light';
  const cacheKey = 'hiclo:appearance';
  let current = 'light', writes = Promise.resolve(), userSelected = false, pendingWrites = 0;
  try { current = valid(localStorage.getItem(cacheKey)); } catch { /* Storage cache is optional. */ }
  function apply(value) {
    current = valid(value); root.dataset.theme = current;
    try { localStorage.setItem(cacheKey, current); } catch { /* Persistent source is chrome.storage. */ }
    const trigger = document.getElementById('theme-toggle');
    if (trigger) trigger.setAttribute('aria-label', `Appearance: ${current} mode. Switch to ${current === 'light' ? 'dark' : 'light'} mode`);
  }
  apply(current);
  chrome.storage.local.get('appearance').then(data => {
    if (data.appearance && !userSelected) apply(data.appearance.theme);
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.appearance && !pendingWrites) apply(changes.appearance.newValue?.theme);
  });
  document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.getElementById('theme-toggle');
    trigger.addEventListener('click', () => {
      const theme = current === 'light' ? 'dark' : 'light';
      userSelected = true;
      apply(theme);
      document.getElementById('theme-status').textContent = '';
      pendingWrites++;
      writes = writes.catch(() => {}).then(() => chrome.storage.local.set({ appearance: { theme } })).finally(() => { pendingWrites--; });
      writes.catch(() => { document.getElementById('theme-status').textContent = 'Could not save appearance. Please try again.'; });
    });
    apply(current);
    requestAnimationFrame(() => { root.dataset.themeReady = 'true'; });
  });
})();
