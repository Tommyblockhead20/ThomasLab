const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export const formatGuideOdds = (probability) => `${(Math.max(0, Number(probability) || 0) * 100).toFixed(1)}%`;

export function guideOddsShade(probability, minimum, maximum) {
  const low = Math.max(0, Number(minimum) || 0);
  const high = Math.max(low, Number(maximum) || 0);
  const value = Math.max(low, Math.min(high, Number(probability) || 0));
  const strength = high - low > 1e-9 ? (value - low) / (high - low) : .5;
  return (.045 + strength * .075).toFixed(3);
}

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
    this.root.dataset.guideMode = state.mode ?? 'rarity';
    this.root.dataset.entryCount = String(state.entries.length);
    this.title.textContent = state.guide;
    this.zone.textContent = `${state.zone} • equipped tackle odds`;
    const probabilities = state.entries.map((entry) => Number(entry.probability) || 0);
    const minimum = probabilities.length ? Math.min(...probabilities) : 0;
    const maximum = probabilities.length ? Math.max(...probabilities) : 0;
    this.list.innerHTML = state.entries.length ? state.entries.map((entry) => {
      const markers = [entry.exclusive ? '◆' : '', state.mode === 'atlas' && !entry.caught ? '○' : '']
        .filter(Boolean).join(' ');
      const markerLabel = [entry.exclusive ? 'Location exclusive' : '', state.mode === 'atlas' && !entry.caught ? 'Not yet caught' : '']
        .filter(Boolean).join(', ');
      return `<li data-rarity="${entry.rarity.toLowerCase()}" style="--odds-bg-alpha:${guideOddsShade(entry.probability, minimum, maximum)}"><span><span class="ecology-guide-name">${escapeHtml(entry.name)}${markers ? ` <i title="${markerLabel}">${markers}</i>` : ''}</span><small>${entry.rarity}</small></span><strong>${formatGuideOdds(entry.probability)}</strong></li>`;
    }).join('') : '<li><span>No matching creatures</span><strong>—</strong></li>';
  }
}
