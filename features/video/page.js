// Serialized by chrome.scripting; keep this function self-contained.
export async function pageAction(action = 'inspect') {
  const current = globalThis.__hicloFloatingPage;
  const active = !!current && !current.window.closed;
  const supported = !!globalThis.documentPictureInPicture?.requestWindow;
  const state = () => ({ kind: 'page', supported, active: !!globalThis.__hicloFloatingPage && !globalThis.__hicloFloatingPage.window.closed });
  if (action === 'inspect') return state();
  if (action === 'close') {
    current?.window.close();
    return state();
  }
  if (active) { current.window.focus(); return state(); }
  if (!supported || !document.body || document.contentType !== 'text/html') {
    return { ...state(), error: 'Floating pages are unavailable on this document or browser.' };
  }
  let floating, restore;
  try {
    floating = await documentPictureInPicture.requestWindow({ width: Math.min(innerWidth, 960), height: Math.min(innerHeight, 720) });
    const body = document.body;
    const placeholder = document.createElement('body');
    const scroll = { x: scrollX, y: scrollY };
    const target = floating.document;
    target.title = document.title;
    for (const attribute of document.documentElement.attributes) target.documentElement.setAttribute(attribute.name, attribute.value);
    const base = target.createElement('base'); base.href = document.baseURI; base.target = '_blank'; target.head.append(base);
    for (const sheet of document.styleSheets) {
      try {
        const style = target.createElement('style');
        style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
        style.media = sheet.media.mediaText;
        target.head.append(style);
      } catch {
        if (sheet.href) {
          const link = target.createElement('link'); link.rel = 'stylesheet'; link.href = sheet.href;
          link.media = sheet.media.mediaText; target.head.append(link);
        }
      }
    }
    for (const sheet of document.adoptedStyleSheets) {
      const style = target.createElement('style');
      style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n'); target.head.append(style);
    }
    const note = document.createElement('p'); note.textContent = 'Floating above other windows';
    const button = document.createElement('button'); button.textContent = 'Return to tab';
    button.addEventListener('click', () => floating.close());
    placeholder.append(note, button);
    let restored = false;
    restore = () => {
      if (restored) return;
      restored = true;
      if (placeholder.isConnected) placeholder.replaceWith(body);
      globalThis.__hicloFloatingPage = null;
      scrollTo(scroll.x, scroll.y);
    };
    floating.addEventListener('pagehide', restore, { once: true });
    globalThis.__hicloFloatingPage = { window: floating };
    body.replaceWith(placeholder);
    target.body.replaceWith(body);
    floating.scrollTo(scroll.x, scroll.y);
    // The user can pause Hiclo while the native window is opening.
    if ((await chrome.storage.local.get('settings')).settings?.enabled === false) {
      floating.close(); restore();
      return { ...state(), error: 'The extension is paused.' };
    }
    return state();
  } catch (error) {
    floating?.close(); restore?.();
    return { ...state(), error: error.name === 'NotAllowedError'
      ? 'The browser blocked the floating page. Click Always on Top again.'
      : 'This page could not open in a floating window.' };
  }
}
