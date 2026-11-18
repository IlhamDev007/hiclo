// Chrome measures an action popup before assigning its final viewport. Never
// derive that popup's root dimensions from vh/dvh or responsive media queries.
// A popup opened as a normal tab can still adapt to the tab's viewport.
(() => {
  const isActionPopup = chrome.extension.getViews({ type: 'popup' }).includes(window);
  const root = document.documentElement;
  root.dataset.view = isActionPopup ? 'popup' : 'page';
  if (isActionPopup) {
    // Keep the root's intrinsic 600px request fixed. Fit only the inner shell
    // after Chrome supplies the available height (which may be below 600px).
    const fit = () => root.style.setProperty('--popup-body-height', `${Math.min(600, innerHeight)}px`);
    addEventListener('resize', fit);
    requestAnimationFrame(() => requestAnimationFrame(fit));
  }
})();
