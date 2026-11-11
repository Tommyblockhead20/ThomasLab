(() => {
  'use strict';
  const audio = document.querySelector('#voice');
  const status = document.querySelector('#status');
  const playback = document.querySelector('.playback');
  const stop = document.querySelector('#stop');
  const volume = document.querySelector('#volume');
  const buttons = [...document.querySelectorAll('[data-audio]')];
  let active = null, request = 0;

  function clear(message = 'Ready when you are') {
    active?.classList.remove('is-speaking');
    active = null;
    playback.classList.remove('is-playing', 'has-error');
    stop.disabled = true;
    status.textContent = message;
  }
  function halt() {
    request++;
    audio.pause();
    clear('Stopped');
  }
  function updateVolume() {
    audio.volume = Number(volume.value) / 100;
    document.querySelector('#volume-value').textContent = `${volume.value}%`;
    try { localStorage.setItem('thomaslab-soundboard-volume', volume.value); } catch { /* Storage is optional. */ }
  }
  try {
    const saved = localStorage.getItem('thomaslab-soundboard-volume');
    if (saved !== null && /^\d{1,3}$/.test(saved) && Number(saved) <= 100) volume.value = saved;
  } catch { /* Private browsing must not prevent playback. */ }
  updateVolume();
  volume.addEventListener('input', updateVolume);
  stop.addEventListener('click', halt);

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const id = ++request;
      audio.pause();
      clear();
      active = button;
      button.classList.add('is-speaking');
      playback.classList.add('is-playing');
      stop.disabled = false;
      status.textContent = `Saying ${button.querySelector('span')?.textContent || button.textContent}…`;
      audio.src = `audio/${encodeURIComponent(button.dataset.audio)}.mp3`;
      // play() stays in the tap handler, including on mobile Safari.
      audio.play().catch(() => {
        if (id !== request) return; // A newer tap or Stop cancelled this request.
        clear('Couldn’t play that clip. Tap to try again.');
        playback.classList.add('has-error');
      });
    });
  }
  audio.addEventListener('ended', () => { if (active) clear(); });
  audio.addEventListener('error', () => {
    if (!active) return;
    clear('Couldn’t load that clip. Tap to try again.');
    playback.classList.add('has-error');
  });
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape' && active) { halt(); event.preventDefault(); }
  });
  addEventListener('pagehide', halt);
})();
