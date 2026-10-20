import { markStartup, getStartupTimings, reportStartupTimings } from './debug/startup-timings.js';
import { WEBGL_RECOVERY_TEXT } from '../../webgl-support.js';

markStartup('js:module-evaluated');
globalThis.__reelAscentStartup = getStartupTimings;

const canvas = document.querySelector('#game-canvas');
const loading = document.querySelector('#loading');
const loadingStatus = document.querySelector('#loading-status');
const errorPanel = document.querySelector('#error-panel');
const errorMessage = document.querySelector('#error-message');

// Vite serves this project at / in development, where ../ would point back here.
if (import.meta.env.DEV) document.querySelectorAll('.site-home-link').forEach((link) => link.setAttribute('href', 'https://thomaslab.me/'));

document.querySelector('#retry-start')?.addEventListener('click', () => location.reload());

async function start() {
  try {
    markStartup('bootstrap:start');
    const { Game } = await import('./game.js');
    await Game.create(canvas, (status) => {
      loadingStatus.textContent = status;
    });
    loading.hidden = true;
    canvas.focus();
    markStartup('bootstrap:loading-hidden');
    reportStartupTimings();
  } catch (error) {
    console.error(error);
    loading.hidden = true;
    errorPanel.hidden = false;
    const message = error instanceof Error ? error.message : String(error);
    const graphicsFailure = error?.name === 'GraphicsUnavailableError' || /webgl|graphics context/i.test(message);
    errorMessage.textContent = graphicsFailure ? WEBGL_RECOVERY_TEXT : message;
    document.querySelector('#graphics-help').hidden = !graphicsFailure;
  }
}

start();
