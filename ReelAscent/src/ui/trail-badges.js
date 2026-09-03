const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export class TrailBadgeMenu {
  constructor(badgeSystem) {
    this.badgeSystem = badgeSystem;
    this.screen = document.querySelector('#trail-badges-menu');
    this.content = document.querySelector('#trail-badges-content');
    this.summary = document.querySelector('#trail-badges-summary');
    this.closeButton = document.querySelector('#close-trail-badges');
    this.isOpen = false;
    this.onOpenRequest = () => this.open();
    this.onClose = () => this.close();
    this.onKeyDown = (event) => {
      if (event.code !== 'Escape' || !this.isOpen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    };
    window.addEventListener('reel-ascent:open-trail-badges', this.onOpenRequest);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.addEventListener('click', this.onClose);
  }

  open() {
    if (!this.screen || this.isOpen) return;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('trail-badges-open');
    this.render();
    this.closeButton?.focus({ preventScroll: true });
  }

  close() {
    if (!this.screen || !this.isOpen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('trail-badges-open');
    document.querySelector('#game-canvas')?.focus({ preventScroll: true });
  }

  render() {
    const badges = this.badgeSystem.getViewModels();
    const unlocked = badges.filter((entry) => entry.unlocked).length;
    if (this.summary) this.summary.textContent = `${unlocked} / ${badges.length} unlocked`;
    if (!this.content) return;
    this.content.innerHTML = badges.map((entry) => `<article class="trail-badge-card ${entry.unlocked ? 'is-unlocked' : 'is-locked'}">
      <div class="trail-badge-medallion" aria-hidden="true">${entry.unlocked ? '✦' : '◇'}</div>
      <div><small>${entry.unlocked ? 'UNLOCKED' : 'LOCKED'}</small><strong>${escapeHtml(entry.name)}</strong><p>${escapeHtml(entry.description)}</p></div>
      <output>${escapeHtml(entry.progressLabel)}</output>
    </article>`).join('');
  }

  destroy() {
    window.removeEventListener('reel-ascent:open-trail-badges', this.onOpenRequest);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.removeEventListener('click', this.onClose);
    document.body.classList.remove('trail-badges-open');
  }
}
