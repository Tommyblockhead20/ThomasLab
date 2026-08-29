const OTHER_MODAL_OPEN = () => [
  'fish-gallery', 'journal-open', 'inventory-open', 'mountain-map-open', 'emote-menu-open', 'appearance-open'
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
        void this.client.join(this.codeInput?.value);
        return;
      }
      if (event.code === 'KeyM' && !editable) {
        if (!this.isOpen && OTHER_MODAL_OPEN()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.toggle();
        return;
      }
      if (event.code === 'Escape' && this.isOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
    };
    this.onClose = () => this.close();
    this.onHost = () => { void this.client.host(); };
    this.onJoin = () => { void this.client.join(this.codeInput?.value); };
    this.onLeave = () => this.client.leave();
    this.client.addEventListener('statechange', this.onStateChange);
    this.client.addEventListener('roomstate', this.onRoomState);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.addEventListener('click', this.onClose);
    this.hostButton?.addEventListener('click', this.onHost);
    this.joinButton?.addEventListener('click', this.onJoin);
    this.leaveButton?.addEventListener('click', this.onLeave);
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
      const identity = player.id === this.client.playerId ? 'YOU' : 'PLAYER';
      const host = player.host ? ' • HOST' : '';
      const status = player.connected === false ? ' • RECONNECTING' : '';
      item.textContent = `${identity}${host}${status}`;
      item.dataset.connected = player.connected === false ? 'false' : 'true';
      this.roster.appendChild(item);
    }
  }

  render() {
    const state = this.client.getState();
    const unavailable = !state.endpointConfigured;
    const busy = ['connecting', 'joining', 'reconnecting'].includes(state.state);
    if (this.hostButton) this.hostButton.disabled = unavailable || busy || state.state === 'in_room';
    if (this.joinButton) this.joinButton.disabled = unavailable || busy || state.state === 'in_room';
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
    document.body.classList.remove('multiplayer-open');
  }
}
