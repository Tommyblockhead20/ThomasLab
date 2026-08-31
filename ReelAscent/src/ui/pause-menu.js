import {
  KEY_BINDING_DEFINITIONS,
  formatInputCode,
  loadKeyBindings,
  resetKeyBindings,
  setKeyBinding
} from '../player/movement.js';

const SETTINGS_KEY = 'reel-ascent-ui-settings-v1';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const secs = total % 60;
  return hours ? `${hours}h ${minutes}m ${secs}s` : `${minutes}m ${secs}s`;
};
const downloadProgressJson = (text, prefix = 'reel-ascent-progress') => {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export class PauseMenu {
  constructor(progression, { getStats = () => ({}), onResume = () => {} } = {}) {
    this.progression = progression;
    this.getStats = getStats;
    this.onResume = onResume;
    this.screen = document.querySelector('#pause-menu');
    this.content = document.querySelector('#pause-content');
    this.status = document.querySelector('#pause-status');
    this.resumeButton = document.querySelector('#pause-resume');
    this.tabs = document.querySelector('#pause-tabs');
    this.fileInput = document.querySelector('#pause-progress-file');
    this.activeTab = 'stats';
    this.isOpen = false;
    this.awaitingBinding = null;
    this.previousFocus = null;
    this.preferences = this.loadPreferences();
    this.applyPreferences();

    this.onClick = (event) => this.handleClick(event);
    this.onChange = (event) => this.handlePreferenceChange(event);
    this.onResumeClick = () => this.onResume();
    this.onKeyDown = (event) => {
      if (!this.isOpen || !this.awaitingBinding) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'Escape') {
        this.awaitingBinding = null;
        this.status.textContent = 'Rebind cancelled.';
        this.render();
        return;
      }
      const result = setKeyBinding(this.awaitingBinding, event.code, loadKeyBindings());
      this.status.textContent = result.ok
        ? `${KEY_BINDING_DEFINITIONS[this.awaitingBinding].label} → ${formatInputCode(event.code)}`
        : result.reason;
      if (result.ok) this.awaitingBinding = null;
      this.render();
    };
    this.onFileChange = async () => {
      const file = this.fileInput?.files?.[0];
      const textarea = this.screen?.querySelector('#pause-progress-text');
      if (!file || !textarea) return;
      try {
        textarea.value = await file.text();
        const result = this.progression.previewProgressImport(textarea.value);
        this.status.textContent = `Ready to import: ${result.summary.discovered} discovered • $${result.summary.money}.`;
      } catch (error) {
        this.status.textContent = error instanceof Error ? error.message : 'Could not read progress file.';
      }
      this.fileInput.value = '';
    };
    this.screen?.addEventListener('click', this.onClick);
    this.screen?.addEventListener('change', this.onChange);
    this.resumeButton?.addEventListener('click', this.onResumeClick);
    this.fileInput?.addEventListener('change', this.onFileChange);
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  loadPreferences() {
    try {
      const saved = JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) ?? '{}');
      return {
        showControlHints: saved.showControlHints !== false,
        reduceMotion: Boolean(saved.reduceMotion),
        uiScale: ['compact', 'normal', 'large'].includes(saved.uiScale)
          ? saved.uiScale
          : (saved.largeUi ? 'large' : 'normal'),
        rhythmHighContrast: Boolean(saved.rhythmHighContrast),
        largeContextPrompts: Boolean(saved.largeContextPrompts)
      };
    } catch { return { showControlHints: true, reduceMotion: false, uiScale: 'normal', rhythmHighContrast: false, largeContextPrompts: false }; }
  }

  savePreferences() {
    try { globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(this.preferences)); } catch {}
    this.applyPreferences();
  }

  applyPreferences() {
    document.body.classList.toggle('hide-control-hints', !this.preferences.showControlHints);
    document.body.classList.toggle('reduce-motion', this.preferences.reduceMotion);
    document.body.classList.toggle('large-ui', this.preferences.uiScale === 'large');
    document.body.classList.toggle('rhythm-high-contrast', this.preferences.rhythmHighContrast);
    document.body.classList.toggle('large-context-prompts', this.preferences.largeContextPrompts);
    document.body.dataset.uiScale = this.preferences.uiScale;
  }

  setOpen(active) {
    const next = Boolean(active);
    if (!this.screen || next === this.isOpen) return;
    this.isOpen = next;
    this.screen.hidden = !next;
    document.body.classList.toggle('pause-open', next);
    if (next) {
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.exitPointerLock?.();
      this.status.textContent = 'Local gameplay paused. Multiplayer players continue normally.';
      this.render();
      this.resumeButton?.focus({ preventScroll: true });
    } else {
      this.awaitingBinding = null;
      (this.previousFocus?.isConnected ? this.previousFocus : document.querySelector('#game-canvas'))?.focus({ preventScroll: true });
      this.previousFocus = null;
    }
  }

  handleClick(event) {
    const tab = event.target.closest('[data-pause-tab]');
    if (tab) {
      this.activeTab = tab.dataset.pauseTab;
      this.awaitingBinding = null;
      this.render();
      return;
    }
    const slot = event.target.closest('[data-pause-slot-action]');
    if (slot) return this.handleSlotAction(slot.dataset.pauseSlotAction, slot.dataset.slotId);
    const transfer = event.target.closest('[data-pause-progress-action]');
    if (transfer) return void this.handleProgressTransfer(transfer.dataset.pauseProgressAction);
    const preference = event.target.closest('[data-pause-preference]');
    if (preference?.type === 'checkbox') {
      this.preferences[preference.dataset.pausePreference] = Boolean(preference.checked);
      this.savePreferences();
      return;
    }
    const binding = event.target.closest('[data-rebind-action]');
    if (binding) {
      this.awaitingBinding = binding.dataset.rebindAction;
      this.status.textContent = `Press a key for ${KEY_BINDING_DEFINITIONS[this.awaitingBinding]?.label ?? this.awaitingBinding}. Escape cancels.`;
      this.render();
      return;
    }
    if (event.target.closest('[data-reset-bindings]')) {
      resetKeyBindings();
      this.awaitingBinding = null;
      this.status.textContent = 'Gameplay bindings reset to defaults.';
      this.render();
    }
  }

  handlePreferenceChange(event) {
    const preference = event.target.closest?.('[data-pause-preference]');
    if (!preference || preference.type === 'checkbox') return;
    this.preferences[preference.dataset.pausePreference] = preference.value;
    this.savePreferences();
  }

  render() {
    if (!this.isOpen || !this.content) return;
    for (const button of this.tabs?.querySelectorAll('[data-pause-tab]') ?? []) {
      button.setAttribute('aria-pressed', String(button.dataset.pauseTab === this.activeTab));
    }
    this.content.innerHTML = ({
      stats: () => this.renderStats(),
      'save-data': () => this.renderSaveData(),
      settings: () => this.renderSettings(),
      accessibility: () => this.renderAccessibility(),
      keybinds: () => this.renderKeybinds()
    })[this.activeTab]?.() ?? this.renderStats();
  }

  renderStats() {
    const stats = this.getStats() ?? {};
    const best = stats.bestCatch;
    const rarity = stats.catchesByRarity ?? {};
    return `<div class="pause-stats-grid">
      <article><small>ACTIVE PLAYTIME</small><strong>${formatDuration(stats.activePlaytimeSeconds)}</strong></article>
      <article><small>TOTAL FISH</small><strong>${stats.fishCaught ?? 0}</strong></article>
      <article><small>SHINY</small><strong>${stats.shinyCaught ?? 0}</strong></article>
      <article><small>ASCENTS</small><strong>${stats.ascents ?? 0}</strong></article>
      <article><small>FASTEST ASCENT</small><strong>${stats.fastestAscentSeconds ? formatDuration(stats.fastestAscentSeconds) : '—'}</strong></article>
      <article><small>BOAT TRIPS</small><strong>${stats.boatTrips ?? 0}</strong></article>
      <article><small>WATERS DISCOVERED</small><strong>${stats.watersCaught ?? 0}/${stats.totalWaters ?? 0} • ${Math.round(stats.waterPercent ?? 0)}%</strong></article>
      <article><small>ITEMS PURCHASED</small><strong>${stats.itemsPurchased ?? 0}/${stats.totalPurchasableItems ?? 0} • ${Math.round(stats.purchasePercent ?? 0)}%</strong></article>
    </div>
    <section class="pause-stat-detail"><h3>CATCHES BY RARITY</h3><p>Common ${rarity.Common ?? 0} • Uncommon ${rarity.Uncommon ?? 0} • Rare ${rarity.Rare ?? 0} • Legendary ${rarity.Legendary ?? 0}</p></section>
    <section class="pause-stat-detail"><h3>BEST CATCH</h3><p>${best ? `${escapeHtml(best.name || best.speciesId)} • ${Number(best.length).toFixed(1)} in • ${Number(best.weight).toFixed(2)} lb${best.shiny ? ' • SHINY' : ''}` : 'No legitimate catch recorded yet.'}</p></section>`;
  }

  renderSaveData() {
    const slotCards = this.progression.saveSystem.getSlotSummaries().map((slot) => {
      const date = slot.updatedAt ? new Date(slot.updatedAt).toLocaleString() : 'Unused';
      if (slot.empty) return `<article class="save-slot-card"><header><strong>${slot.label}</strong><span>EMPTY</span></header><button data-pause-slot-action="create" data-slot-id="${slot.id}">CREATE SAVE</button></article>`;
      return `<article class="save-slot-card ${slot.active ? 'is-active' : ''}"><header><strong>${slot.label}</strong><span>${slot.active ? 'CURRENT' : 'LOCAL SAVE'}</span></header><dl><div><dt>LAST PLAYED</dt><dd>${escapeHtml(date)}</dd></div><div><dt>MONEY</dt><dd>$${slot.money}</dd></div><div><dt>JOURNAL</dt><dd>${slot.discovered} discovered</dd></div><div><dt>PLAYTIME</dt><dd>${formatDuration(slot.activePlaytimeSeconds)}</dd></div><div><dt>LIFETIME</dt><dd>${slot.fishCaught} fish • ${slot.summits} summits</dd></div></dl><div class="save-slot-actions">${slot.active ? '' : `<button data-pause-slot-action="select" data-slot-id="${slot.id}">LOAD</button>`}<button data-pause-slot-action="${slot.active ? 'reset' : 'delete'}" data-slot-id="${slot.id}">${slot.active ? 'RESET CURRENT SAVE' : 'DELETE'}</button></div></article>`;
    }).join('');
    const options = this.progression.saveSystem.getSlotSummaries().map((slot) => `<option value="${slot.id}" ${slot.active ? 'selected' : ''}>${slot.label}${slot.empty ? ' (empty)' : slot.active ? ' (current)' : ''}</option>`).join('');
    return `<div class="save-data-content">${slotCards}</div><details class="progress-transfer"><summary>PORTABLE PROGRESS</summary><p>Export durable progress or import it into a chosen local slot.</p><textarea id="pause-progress-text" maxlength="8000000" spellcheck="false" placeholder="Exported progress appears here, or paste progress JSON here."></textarea><div class="progress-transfer-actions"><label>IMPORT DESTINATION<select id="pause-progress-slot">${options}</select></label><button data-pause-progress-action="download">DOWNLOAD PROGRESS</button><button data-pause-progress-action="file">LOAD FILE</button><button data-pause-progress-action="import">IMPORT PROGRESS</button></div></details>`;
  }

  renderSettings() {
    return `<div class="pause-setting-list"><label><input type="checkbox" data-pause-preference="showControlHints" ${this.preferences.showControlHints ? 'checked' : ''}> Show the always-on control hint card</label></div>`;
  }

  renderAccessibility() {
    return `<div class="pause-setting-list">
      <label><span>Interface scale</span><select data-pause-preference="uiScale"><option value="compact" ${this.preferences.uiScale === 'compact' ? 'selected' : ''}>Compact</option><option value="normal" ${this.preferences.uiScale === 'normal' ? 'selected' : ''}>Normal</option><option value="large" ${this.preferences.uiScale === 'large' ? 'selected' : ''}>Large</option></select></label>
      <label><input type="checkbox" data-pause-preference="reduceMotion" ${this.preferences.reduceMotion ? 'checked' : ''}> Reduce non-gameplay UI animation</label>
      <label><input type="checkbox" data-pause-preference="rhythmHighContrast" ${this.preferences.rhythmHighContrast ? 'checked' : ''}> High-contrast rhythm lanes and notes</label>
      <label><input type="checkbox" data-pause-preference="largeContextPrompts" ${this.preferences.largeContextPrompts ? 'checked' : ''}> Larger contextual action prompts</label>
    </div>`;
  }

  renderKeybinds() {
    const bindings = loadKeyBindings();
    const rows = Object.entries(KEY_BINDING_DEFINITIONS).map(([action, definition]) => `<article class="keybind-row ${this.awaitingBinding === action ? 'is-waiting' : ''}"><div><strong>${escapeHtml(definition.label)}</strong>${definition.fixedCodes.length ? `<small>Always also: ${definition.fixedCodes.map(formatInputCode).join(', ')}</small>` : ''}</div><kbd>${escapeHtml(formatInputCode(bindings[action]))}</kbd><button data-rebind-action="${action}">${this.awaitingBinding === action ? 'PRESS A KEY…' : 'REBIND'}</button></article>`).join('');
    return `<div class="keybind-list">${rows}</div><button class="pause-secondary-action" data-reset-bindings>RESET GAMEPLAY BINDINGS</button>`;
  }

  handleSlotAction(action, slotId) {
    const saves = this.progression.saveSystem;
    if (action === 'create') { if (saves.createSlot(slotId)) this.render(); return; }
    if (action === 'select') {
      if (!globalThis.confirm?.('Load this save slot? The page will reload and leave any current multiplayer room.')) return;
      if (saves.selectSlot(slotId)) globalThis.location?.reload();
      return;
    }
    const summary = saves.getSlotSummaries().find((slot) => slot.id === slotId);
    const phrase = `RESET ${summary?.label?.toUpperCase() ?? 'SAVE SLOT'}`;
    if (globalThis.prompt?.(`This permanently clears only ${summary?.label}. Type ${phrase} to confirm.`) !== phrase) return;
    const ok = action === 'delete' ? saves.deleteSlot(slotId) : saves.resetSlot(slotId);
    if (!ok) return;
    if (summary?.active) globalThis.location?.reload(); else this.render();
  }

  async handleProgressTransfer(action) {
    const textarea = this.screen?.querySelector('#pause-progress-text');
    if (action === 'file') return this.fileInput?.click();
    if (action === 'download') {
      const text = this.progression.exportProgress();
      if (textarea) textarea.value = text;
      downloadProgressJson(text);
      this.status.textContent = 'Current save downloaded as versioned JSON.';
      return;
    }
    if (action !== 'import' || !textarea) return;
    try {
      const preview = this.progression.previewProgressImport(textarea.value);
      const slotId = this.screen?.querySelector('#pause-progress-slot')?.value ?? this.progression.saveSystem.activeSlotId;
      const summary = this.progression.saveSystem.getSlotSummaries().find((slot) => slot.id === slotId);
      if (!globalThis.confirm?.(`Overwrite ${summary?.label ?? slotId} with ${preview.summary.discovered} discoveries and $${preview.summary.money}?`)) return;
      downloadProgressJson(this.progression.exportProgress(), 'reel-ascent-backup-before-import');
      this.progression.importProgressToSlot(textarea.value, slotId);
      this.status.textContent = 'Backup downloaded. Import complete.';
      if (summary?.active) globalThis.setTimeout(() => globalThis.location?.reload(), 180); else this.render();
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : 'Progress import failed.';
    }
  }

  destroy() {
    this.screen?.removeEventListener('click', this.onClick);
    this.screen?.removeEventListener('change', this.onChange);
    this.resumeButton?.removeEventListener('click', this.onResumeClick);
    this.fileInput?.removeEventListener('change', this.onFileChange);
    window.removeEventListener('keydown', this.onKeyDown, true);
    document.body.classList.remove('pause-open');
  }
}
