import { DISPLAY_NAME_MAX_LENGTH, normalizeDisplayName, normalizeRoomCode, ROOM_CODE_LENGTH } from '../multiplayer/multiplayer-client.js';

const OTHER_MODAL_OPEN = () => [
  'fish-gallery', 'journal-open', 'inventory-open', 'mountain-map-open', 'emote-menu-open', 'appearance-open',
  'trail-badges-open'
]
  .some((className) => document.body.classList.contains(className));

export class MultiplayerMenu {
  constructor(client) {
    this.client = client;
    this.screen = document.querySelector('#multiplayer-menu');
    this.closeButton = document.querySelector('#close-multiplayer');
    this.hostButton = document.querySelector('#multiplayer-host');
    this.joinButton = document.querySelector('#multiplayer-join');
    this.leaveButton = document.querySelector('#multiplayer-leave');
    this.codeInput = document.querySelector('#multiplayer-code');
    this.nameInput = document.querySelector('#multiplayer-name');
    if (!this.nameInput) {
      const actions = this.hostButton?.closest?.('.multiplayer-actions');
      if (actions) {
        const label = document.createElement('label');
        label.className = 'multiplayer-name-field';
        label.append('DISPLAY NAME');
        const input = document.createElement('input');
        input.id = 'multiplayer-name';
        input.type = 'text';
        input.maxLength = DISPLAY_NAME_MAX_LENGTH;
        input.autocomplete = 'nickname';
        input.placeholder = 'Your name';
        label.appendChild(input);
        actions.insertBefore(label, this.hostButton);
        this.nameInput = input;
      }
    }
    if (this.codeInput) {
      this.codeInput.maxLength = ROOM_CODE_LENGTH;
      this.codeInput.inputMode = 'numeric';
      this.codeInput.pattern = `\\d{${ROOM_CODE_LENGTH}}`;
      this.codeInput.autocomplete = 'one-time-code';
      this.codeInput.placeholder = '0000';
      this.codeInput.setAttribute('aria-label', '4-digit room code');
    }
    this.status = document.querySelector('#multiplayer-status');
    this.details = document.querySelector('#multiplayer-details');
    this.roster = document.querySelector('#multiplayer-roster');
    this.isOpen = false;
    this.previousFocus = null;
    this.onStateChange = () => this.render();
    this.onRoomState = () => this.render();
    this.onKeyDown = (event) => {
      const editable = ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase?.()) || event.target?.isContentEditable;
      if (event.repeat || (editable && event.code !== 'Escape' && event.code !== 'Enter')) return;
      if (event.code === 'Enter' && this.isOpen && editable && event.target === this.codeInput) {
        event.preventDefault();
        void this.client.join(this.codeInput?.value, this.nameInput?.value);
        return;
      }
      if (event.code === 'Escape' && this.isOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
    };
    this.onClose = () => this.close();
    this.onHost = () => { void this.client.host(this.nameInput?.value); };
    this.onJoin = () => { void this.client.join(this.codeInput?.value, this.nameInput?.value); };
    this.onLeave = () => this.client.leave();
    this.onNameInput = () => {
      if (!this.nameInput) return;
      const normalized = normalizeDisplayName(this.nameInput.value);
      if (this.nameInput.value.length > DISPLAY_NAME_MAX_LENGTH) this.nameInput.value = normalized;
      this.updateActionAvailability();
    };
    this.onCodeInput = () => {
      if (!this.codeInput) return;
      const normalized = normalizeRoomCode(this.codeInput.value);
      if (this.codeInput.value !== normalized) this.codeInput.value = normalized;
      this.updateActionAvailability();
    };
    this.client.addEventListener('statechange', this.onStateChange);
    this.client.addEventListener('roomstate', this.onRoomState);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.addEventListener('click', this.onClose);
    this.hostButton?.addEventListener('click', this.onHost);
    this.joinButton?.addEventListener('click', this.onJoin);
    this.leaveButton?.addEventListener('click', this.onLeave);
    this.nameInput?.addEventListener('input', this.onNameInput);
    this.codeInput?.addEventListener('input', this.onCodeInput);
    this.render();
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  open() {
    if (!this.screen || this.isOpen || OTHER_MODAL_OPEN()) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('multiplayer-open');
    this.render();
    this.closeButton?.focus({ preventScroll: true });
  }

  close() {
    if (!this.screen || !this.isOpen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('multiplayer-open');
    (this.previousFocus?.isConnected ? this.previousFocus : document.querySelector('#game-canvas'))?.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  renderRoster(players = []) {
    if (!this.roster) return;
    this.roster.replaceChildren();
    for (const player of players) {
      const item = document.createElement('li');
      const fallback = player.id === this.client.playerId ? this.client.displayName || 'You' : 'Player';
      const identity = normalizeDisplayName(player.displayName ?? player.name ?? fallback) || fallback;
      const host = player.host ? ' • HOST' : '';
      const status = player.connected === false ? ' • RECONNECTING' : '';
      item.textContent = `${identity}${player.id === this.client.playerId ? ' • YOU' : ''}${host}${status}`;
      item.dataset.connected = player.connected === false ? 'false' : 'true';
      this.roster.appendChild(item);
    }
  }

  updateActionAvailability(state = this.client.getState()) {
    const busy = ['connecting', 'joining', 'reconnecting'].includes(state.state);
    const hasName = Boolean(normalizeDisplayName(this.nameInput?.value));
    const hasCompleteCode = normalizeRoomCode(this.codeInput?.value).length === ROOM_CODE_LENGTH;
    if (this.hostButton) this.hostButton.disabled = !state.endpointConfigured || busy || state.state === 'in_room' || !hasName;
    if (this.joinButton) this.joinButton.disabled = !state.endpointConfigured || busy || state.state === 'in_room' || !hasName || !hasCompleteCode;
  }

  render() {
    const state = this.client.getState();
    const unavailable = !state.endpointConfigured;
    const busy = ['connecting', 'joining', 'reconnecting'].includes(state.state);
    this.updateActionAvailability(state);
    if (this.nameInput) this.nameInput.disabled = unavailable || state.state === 'in_room';
    if (this.codeInput) this.codeInput.disabled = unavailable || state.state === 'in_room';
    if (this.leaveButton) this.leaveButton.hidden = state.state !== 'in_room' && state.state !== 'reconnecting';

    if (this.status) {
      if (unavailable) this.status.textContent = 'Multiplayer unavailable: this build has no service endpoint configured.';
      else if (state.state === 'reconnecting') this.status.textContent = state.error || 'RECONNECTING…';
      else this.status.textContent = state.error || state.state.replace('_', ' ').toUpperCase();
    }

    if (this.details) {
      if (state.roomCode) {
        this.details.textContent = `Room ${state.roomCode} • seed ${state.runSeed ?? '—'} • ${state.players.length} player${state.players.length === 1 ? '' : 's'}`;
      } else {
        this.details.textContent = state.state === 'error'
          ? 'Multiplayer failed cleanly. Solo play is still active; Host or Join can retry.'
          : 'Solo play remains local and fully available.';
      }
    }
    this.renderRoster(state.players);
  }

  destroy() {
    this.client.removeEventListener('statechange', this.onStateChange);
    this.client.removeEventListener('roomstate', this.onRoomState);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.removeEventListener('click', this.onClose);
    this.hostButton?.removeEventListener('click', this.onHost);
    this.joinButton?.removeEventListener('click', this.onJoin);
    this.leaveButton?.removeEventListener('click', this.onLeave);
    this.nameInput?.removeEventListener('input', this.onNameInput);
    this.codeInput?.removeEventListener('input', this.onCodeInput);
    document.body.classList.remove('multiplayer-open');
  }
}
