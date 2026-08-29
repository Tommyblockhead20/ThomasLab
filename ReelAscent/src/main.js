import { Game } from './game.js';

const canvas = document.querySelector('#game-canvas');
const loading = document.querySelector('#loading');
const loadingStatus = document.querySelector('#loading-status');
const errorPanel = document.querySelector('#error-panel');
const errorMessage = document.querySelector('#error-message');

async function start() {
  try {
    await Game.create(canvas, (status) => {
      loadingStatus.textContent = status;
    });
    loading.hidden = true;
    canvas.focus();
  } catch (error) {
    console.error(error);
    loading.hidden = true;
    errorPanel.hidden = false;
    errorMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

start();
