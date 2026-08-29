const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export class AquariumMenu {
  constructor(progression) {
    this.progression = progression;
    this.screen = document.querySelector('#aquarium-menu');
    this.content = document.querySelector('#aquarium-content');
    this.count = document.querySelector('#aquarium-count');
    this.closeButton = document.querySelector('#close-aquarium');
    this.isOpen = false;
    this.renderedRevision = -1;
    this.onKeyDown = (event) => {
      if (event.repeat || ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase?.())) return;
      if (event.code === 'KeyQ' && !document.body.classList.contains('fish-gallery')
        && !document.body.classList.contains('journal-open')
        && !document.body.classList.contains('shop-open')
        && !document.body.classList.contains('inventory-open')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.toggle();
      } else if (event.code === 'Escape' && this.isOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
    };
    this.onCloseClick = () => this.close();
    window.addEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.addEventListener('click', this.onCloseClick);
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }
  open() {
    if (!this.screen) return;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('aquarium-open');
    this.render(true);
    this.closeButton?.focus({ preventScroll: true });
  }
  close() {
    if (!this.screen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('aquarium-open');
  }
  update() { if (this.isOpen && this.renderedRevision !== this.progression.revision) this.render(); }
  render(force = false) {
    if (!this.isOpen || !this.content || (!force && this.renderedRevision === this.progression.revision)) return;
    const specimens = this.progression.getSnapshot().aquarium ?? [];
    this.count.textContent = `${specimens.length} retained`;
    this.content.innerHTML = specimens.length ? [...specimens].reverse().map((specimen) => (
      `<article class="aquarium-card" data-rarity="${escapeHtml(specimen.rarity.toLowerCase())}">
        <div><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)} • ${escapeHtml(specimen.quality)}</small></div>
        <dl><div><dt>LENGTH</dt><dd>${specimen.length.toFixed(1)} in • ${escapeHtml(specimen.lengthCategory)}</dd></div><div><dt>BODY</dt><dd>${specimen.weight.toFixed(2)} lb • ${escapeHtml(specimen.sizeCategory)}</dd></div></dl>
        <small>${escapeHtml(specimen.provenance.locationLabel || 'Unknown water')} • ${new Date(specimen.provenance.caughtAt).toLocaleDateString()}</small>
      </article>`
    )).join('') : '<p class="shop-empty">Send exact specimens here from Inventory.</p>';
    this.renderedRevision = this.progression.revision;
  }
  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('aquarium-open');
  }
}
