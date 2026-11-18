// This function is serialized by chrome.scripting: it must be self-contained.
// Running in each allowed frame also supports ordinary embedded video players.
export async function videoAction(action = 'inspect') {
  const collect = root => {
    const found = [...root.querySelectorAll('video')];
    for (const node of root.querySelectorAll('*')) if (node.shadowRoot) found.push(...collect(node.shadowRoot));
    return found;
  };
  const videos = collect(document).filter(video => video.readyState >= 1 && video.videoWidth > 0 && !video.ended);
  const score = video => {
    const rect = video.getBoundingClientRect();
    const area = Math.min(rect.width * rect.height, 1e7);
    return (video === document.pictureInPictureElement ? 1e9 : 0) + (!video.paused ? 1e8 : 0) + area;
  };
  videos.sort((a, b) => score(b) - score(a));
  const video = document.pictureInPictureElement || videos[0];
  const supported = !!document.pictureInPictureEnabled && typeof video?.requestPictureInPicture === 'function';
  const state = () => ({ found: !!video, supported, active: !!document.pictureInPictureElement, paused: video?.paused ?? true, muted: video?.muted ?? false, score: video ? score(video) : -1 });
  if (action === 'inspect') return state();
  if (!video) return { ...state(), error: 'Start a video on this page, then try again.' };
  try {
    if (action === 'open') {
      if (!supported) throw new Error('Picture-in-Picture is unavailable or blocked by this website.');
      if (!document.pictureInPictureElement) {
        // Some players hide their own PiP button using this attribute, even
        // though browser-initiated PiP is permitted. Restore it after the call.
        const disabled = video.hasAttribute('disablepictureinpicture');
        video.removeAttribute('disablepictureinpicture');
        try {
          await video.requestPictureInPicture(); globalThis.__stillPip = true;
          if ((await chrome.storage.local.get('settings')).settings?.enabled === false) {
            await document.exitPictureInPicture(); globalThis.__stillPip = false;
            throw new Error('The extension is paused.');
          }
        }
        finally { if (disabled) video.setAttribute('disablepictureinpicture', ''); }
      }
    } else if (action === 'close') {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      globalThis.__stillPip = false;
    } else if (action === 'playPause') {
      if (video.paused) await video.play(); else video.pause();
    } else if (action === 'mute') video.muted = !video.muted;
    else if (action === 'back' || action === 'forward') {
      if (video.seekable.length) {
        const start = video.seekable.start(0), end = video.seekable.end(video.seekable.length - 1);
        video.currentTime = Math.min(end, Math.max(start, video.currentTime + (action === 'back' ? -10 : 10)));
      } else throw new Error('Seeking is unavailable for this video.');
    }
    return state();
  } catch (error) {
    let message = error.message;
    if (error.name === 'NotAllowedError') message = 'The browser blocked the request. Click Pop out again, or use the player’s Picture-in-Picture control.';
    if (error.name === 'SecurityError') message = 'This website or embedded player blocks Picture-in-Picture.';
    if (error.name === 'InvalidStateError') message = 'Wait for the video to start playing, then try again.';
    return { ...state(), error: message };
  }
}
