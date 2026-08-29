const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export class EcologyGuidePanel {
  constructor(fishing) {
    this.fishing = fishing;
    this.root = document.querySelector('#ecology-guide');
    this.title = document.querySelector('#ecology-guide-title');
    this.zone = document.querySelector('#ecology-guide-zone');
    this.list = document.querySelector('#ecology-guide-list');
    this.signature = '';
  }
  update() {
    if (!this.root) return;
    const state = this.fishing.getEcologyGuideState();
    this.root.hidden = !state;
    if (!state) return;
    const signature = JSON.stringify(state);
    if (signature === this.signature) return;
    this.signature = signature;
    this.title.textContent = state.guide;
    this.zone.textContent = state.zone;
    this.list.innerHTML = state.entries.length ? state.entries.map((entry) => (
      `<li data-rarity="${entry.rarity.toLowerCase()}"><span>${escapeHtml(entry.name)}${entry.exclusive ? ' ◆' : ''}<small>${entry.rarity}</small></span><strong>${(entry.probability * 100).toFixed(2)}%</strong></li>`
    )).join('') : '<li><span>No matching creatures</span><strong>—</strong></li>';
  }
}
