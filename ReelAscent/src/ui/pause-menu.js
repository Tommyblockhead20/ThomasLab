import {
  KEY_BINDING_DEFINITIONS,
  formatInputCode,
  loadKeyBindings,
  resetKeyBindings,
  setKeyBinding
} from '../player/movement.js';
import { getAudioSettings, setAudioSettings } from '../audio/settings.js';
import { createProgressDownload, decodeProgressBackup } from '../persistence/progress-backup.js';

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
export class PauseMenu {
  constructor(progression, {
    getStats = () => ({}), onResume = () => {}, onCabin = () => {},
    onMultiplayer = () => {}, onCloseMultiplayer = () => {}, onBeforeSaveSwitch = () => {}
  } = {}) {
    this.progression = progression;
    this.getStats = getStats;
    this.onResume = onResume;
    this.onCabin = onCabin;
    this.onMultiplayer = onMultiplayer;
    this.onCloseMultiplayer = onCloseMultiplayer;
    this.onBeforeSaveSwitch = onBeforeSaveSwitch;
    this.screen = document.querySelector('#pause-menu');
    this.content = document.querySelector('#pause-content');
    this.status = document.querySelector('#pause-status');
    this.resumeButton = document.querySelector('#pause-resume');
    this.tabs = document.querySelector('#pause-tabs');
    this.fileInput = document.querySelector('#pause-progress-file');
    this.multiplayerPanel = document.querySelector('#multiplayer-menu');
    this.multiplayerPanelHome = this.multiplayerPanel?.parentElement ?? null;
    this.multiplayerButton = this.tabs?.querySelector('[data-pause-open-multiplayer]') ?? null;
    if (!this.multiplayerButton && this.tabs) {
      this.multiplayerButton = document.createElement('button');
      this.multiplayerButton.type = 'button';
      this.multiplayerButton.dataset.pauseOpenMultiplayer = '';
      this.multiplayerButton.textContent = 'MULTIPLAYER';
      this.tabs.appendChild(this.multiplayerButton);
    }
    this.activeTab = 'stats';
    this.pendingImport = null;
    this.isOpen = false;
    this.awaitingBinding = null;
    this.previousFocus = null;
    this.preferences = this.loadPreferences();
    this.audioSettings = getAudioSettings();
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
      if (!file) return;
      try {
        const text = await decodeProgressBackup(await file.arrayBuffer());
        const result = this.progression.previewProgressImport(text);
        this.pendingImport = { text, name: file.name, summary: result.summary };
        this.status.textContent = `Validated ${file.name}: ${result.summary.discovered} discoveries • $${result.summary.money}. Choose a destination and approve import.`;
        this.render();
      } catch (error) {
        this.pendingImport = null;
        this.status.textContent = error instanceof Error ? error.message : 'Could not read progress file.';
      }
      this.fileInput.value = '';
    };
    this.screen?.addEventListener('click', this.onClick);
    this.screen?.addEventListener('change', this.onChange);
    this.screen?.addEventListener('input', this.onChange);
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
      if (this.activeTab === 'multiplayer') this.activeTab = 'stats';
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.exitPointerLock?.();
      this.status.textContent = 'Local gameplay paused. Multiplayer players continue normally.';
      this.render();
      this.resumeButton?.focus({ preventScroll: true });
    } else {
      this.restoreMultiplayerPanel();
      this.awaitingBinding = null;
      (this.previousFocus?.isConnected ? this.previousFocus : document.querySelector('#game-canvas'))?.focus({ preventScroll: true });
      this.previousFocus = null;
    }
  }

  handleClick(event) {
    if (event.target.closest('[data-pause-action="cabin"]')) {
      this.onCabin();
      return;
    }
    if (event.target.closest('[data-pause-open-multiplayer]')) {
      this.restoreMultiplayerPanel();
      this.activeTab = 'multiplayer';
      this.render();
      this.onMultiplayer();
      const host = this.content?.querySelector('[data-pause-multiplayer-host]');
      if (host && this.multiplayerPanel) {
        this.multiplayerPanel.classList.add('is-pause-embedded');
        host.appendChild(this.multiplayerPanel);
      }
      return;
    }
    const tab = event.target.closest('[data-pause-tab]');
    if (tab) {
      this.restoreMultiplayerPanel();
      this.activeTab = tab.dataset.pauseTab;
      this.onCloseMultiplayer();
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
    if (event.target.closest('[data-reset-tutorials]')) {
      const reset = this.progression.resetTutorials();
      this.status.textContent = reset
        ? 'Fishing, climbing, and boat tutorials reset for this save only.'
        : 'Tutorials could not be reset in browser storage.';
    }
  }

  handlePreferenceChange(event) {
    const audio = event.target.closest?.('[data-audio-setting]');
    if (audio) {
      const key = audio.dataset.audioSetting;
      this.audioSettings = setAudioSettings({ [key]: Number(audio.value) / 100 });
      const output = audio.parentElement?.querySelector('output');
      if (output) output.textContent = `${Math.round(this.audioSettings[key] * 100)}%`;
      return;
    }
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
    this.multiplayerButton?.setAttribute('aria-pressed', String(this.activeTab === 'multiplayer'));
    this.content.innerHTML = ({
      stats: () => this.renderStats(),
      saves: () => this.renderSaveData(),
      settings: () => this.renderSettings(),
      controls: () => this.renderKeybinds(),
      multiplayer: () => '<div class="pause-multiplayer-host" data-pause-multiplayer-host></div>'
    })[this.activeTab]?.() ?? this.renderStats();
  }

  renderStats() {
    const stats = this.getStats() ?? {};
    const best = stats.bestCatch;
    const rarity = stats.catchesByRarity ?? {};
    return `<div class="pause-stats-grid">
      <article><small>ACTIVE PLAYTIME</small><strong>${formatDuration(stats.activePlaytimeSeconds)}</strong></article>
      <article><small>TOTAL CATCHES</small><strong>${stats.fishCaught ?? 0}</strong></article>
      <article><small>SHINY</small><strong>${stats.shinyCaught ?? 0}</strong></article>
      <article><small>ASCENTS</small><strong>${stats.ascents ?? 0}</strong></article>
      <article><small>FASTEST ASCENT</small><strong>${stats.fastestAscentSeconds ? formatDuration(stats.fastestAscentSeconds) : '—'}</strong></article>
      <article><small>BOAT TRIPS</small><strong>${stats.boatTrips ?? 0}</strong></article>
      <article><small>WATERS FISHED IN</small><strong>${stats.watersCaught ?? 0}/${stats.totalWaters ?? 0} • ${Math.round(stats.waterPercent ?? 0)}%</strong></article>
      <article><small>ITEMS PURCHASED</small><strong>${stats.itemsPurchased ?? 0}/${stats.totalPurchasableItems ?? 0} • ${Math.round(stats.purchasePercent ?? 0)}%</strong></article>
    </div>
    <section class="pause-stat-detail"><h3>CATCHES BY RARITY</h3><p>Common ${rarity.Common ?? 0} • Uncommon ${rarity.Uncommon ?? 0} • Rare ${rarity.Rare ?? 0} • Legendary ${rarity.Legendary ?? 0}</p></section>
    <section class="pause-stat-detail"><h3>BEST CATCH</h3><p>${best ? `${escapeHtml(best.name || best.speciesId)} • ${Number(best.length).toFixed(1)} in • ${Number(best.weight).toFixed(2)} lb${best.shiny ? ' • SHINY' : ''}` : 'No legitimate catch recorded yet.'}</p></section>`;
  }

  renderSaveData() {
    const slotCards = this.progression.saveSystem.getSlotSummaries().map((slot) => {
      const date = slot.updatedAt ? new Date(slot.updatedAt).toLocaleString() : 'Unused';
      if (slot.empty) return `<article class="save-slot-card"><header><strong>${slot.label}</strong><span>EMPTY</span></header><button data-pause-slot-action="create" data-slot-id="${slot.id}">CREATE SAVE</button></article>`;
      return `<article class="save-slot-card ${slot.active ? 'is-active' : ''}"><header><strong>${slot.label}</strong><span>${slot.active ? 'ACTIVE SAVE' : 'LOCAL SAVE'}</span></header><dl><div><dt>LAST PLAYED</dt><dd>${escapeHtml(date)}</dd></div><div><dt>MONEY</dt><dd>$${slot.money}</dd></div><div><dt>JOURNAL</dt><dd>${slot.discovered} creatures</dd></div><div><dt>PLAYTIME</dt><dd>${formatDuration(slot.activePlaytimeSeconds)}</dd></div><div><dt>LIFETIME</dt><dd>${slot.fishCaught} catches • ${slot.summits} summits</dd></div></dl><div class="save-slot-actions"><button data-pause-slot-action="select" data-slot-id="${slot.id}" ${slot.active ? 'disabled' : ''}>PLAY THIS SAVE</button><button data-pause-slot-action="download" data-slot-id="${slot.id}">DOWNLOAD PROGRESS</button><button data-pause-slot-action="reset" data-slot-id="${slot.id}">RESET SAVE</button></div></article>`;
    }).join('');
    const options = this.progression.saveSystem.getSlotSummaries().map((slot) => `<option value="${slot.id}" ${slot.active ? 'selected' : ''}>${slot.label}${slot.empty ? ' (empty)' : slot.active ? ' (current)' : ''}</option>`).join('');
    const pending = this.pendingImport
      ? `<p class="import-ready"><strong>${escapeHtml(this.pendingImport.name)}</strong> is valid: ${this.pendingImport.summary.discovered} discoveries, ${this.pendingImport.summary.inventory} carried, ${this.pendingImport.summary.aquarium} in Aquarium, $${this.pendingImport.summary.money}.</p><label>IMPORT DESTINATION<select id="pause-progress-slot">${options}</select></label><button data-pause-progress-action="import">APPROVE IMPORT</button>`
      : '';
    return `<p class="save-local-note">Progress autosaves in this browser and device. Download a backup to move it elsewhere or protect it before clearing browser data.</p><div class="save-data-content">${slotCards}</div><section class="progress-import"><header><h3>IMPORT PROGRESS</h3><strong>.REELASCENT / JSON</strong></header><p>Select one compressed Reel Ascent backup or a current/legacy JSON export. The file is validated before any slot is overwritten.</p><button data-pause-progress-action="file">IMPORT PROGRESS</button>${pending}</section>`;
  }

  renderSettings() {
    const audioSlider = (key, label) => `<label class="pause-volume"><span>${label}</span><input type="range" min="0" max="100" step="1" value="${Math.round(this.audioSettings[key] * 100)}" data-audio-setting="${key}"><output>${Math.round(this.audioSettings[key] * 100)}%</output></label>`;
    return `<div class="pause-setting-list">
      <h3>GAMEPLAY &amp; INTERFACE</h3>
      <h3>SOUND</h3>
      ${audioSlider('master', 'Master Volume')}
      ${audioSlider('rhythm', 'Music / Rhythm Volume')}
      ${audioSlider('sfx', 'SFX Volume')}
      ${audioSlider('ambient', 'Ambient Volume')}
      <h3>ACCESSIBILITY</h3>
      <label><span>Interface scale</span><select data-pause-preference="uiScale"><option value="compact" ${this.preferences.uiScale === 'compact' ? 'selected' : ''}>Compact</option><option value="normal" ${this.preferences.uiScale === 'normal' ? 'selected' : ''}>Normal</option><option value="large" ${this.preferences.uiScale === 'large' ? 'selected' : ''}>Large</option></select></label>
      <label><input type="checkbox" data-pause-preference="reduceMotion" ${this.preferences.reduceMotion ? 'checked' : ''}> Reduce non-gameplay UI animation</label>
      <label><input type="checkbox" data-pause-preference="rhythmHighContrast" ${this.preferences.rhythmHighContrast ? 'checked' : ''}> High-contrast rhythm lanes and notes</label>
      <label><input type="checkbox" data-pause-preference="largeContextPrompts" ${this.preferences.largeContextPrompts ? 'checked' : ''}> Larger contextual action prompts</label>
      <button class="pause-secondary-action" data-reset-tutorials>RESET TUTORIALS FOR THIS SAVE</button>
    </div>`;
  }

  renderKeybinds() {
    const bindings = loadKeyBindings();
    const rows = Object.entries(KEY_BINDING_DEFINITIONS).map(([action, definition]) => {
      const currentLabel = formatInputCode(bindings[action]);
      const fixedLabels = [...new Set(definition.fixedCodes.map(formatInputCode))]
        .filter((label) => label !== currentLabel);
      return `<article class="keybind-row ${this.awaitingBinding === action ? 'is-waiting' : ''}"><div><strong>${escapeHtml(definition.label)}</strong>${fixedLabels.length ? `<small>Always also: ${fixedLabels.join(', ')}</small>` : ''}</div><kbd>${escapeHtml(currentLabel)}</kbd><button data-rebind-action="${action}">${this.awaitingBinding === action ? 'PRESS A KEY…' : 'REBIND'}</button></article>`;
    }).join('');
    return `<div class="keybind-list">${rows}</div><button class="pause-secondary-action" data-reset-bindings>RESET GAMEPLAY BINDINGS</button>`;
  }

  handleSlotAction(action, slotId) {
    const saves = this.progression.saveSystem;
    if (action === 'create') { if (saves.createSlot(slotId)) this.render(); return; }
    if (action === 'download') {
      void createProgressDownload(this.progression.exportProgressForSlot(slotId), `reel-ascent-${slotId}`);
      this.status.textContent = 'Save backup downloaded.';
      return;
    }
    if (action === 'select') {
      if (!globalThis.confirm?.('Load this save slot? The page will reload and leave any current multiplayer room.')) return;
      this.onBeforeSaveSwitch();
      if (saves.selectSlot(slotId)) globalThis.location?.reload();
      return;
    }
    const summary = saves.getSlotSummaries().find((slot) => slot.id === slotId);
    if (!globalThis.confirm?.(`Reset ${summary?.label ?? 'this save slot'}? This permanently replaces only that slot with a new save.`)) return;
    if (summary?.active) this.onBeforeSaveSwitch();
    const ok = saves.resetSlot(slotId);
    if (!ok) return;
    if (summary?.active) globalThis.location?.reload(); else this.render();
  }

  async handleProgressTransfer(action) {
    if (action === 'file') return this.fileInput?.click();
    if (action !== 'import' || !this.pendingImport) return;
    try {
      const preview = this.progression.previewProgressImport(this.pendingImport.text);
      const slotId = this.screen?.querySelector('#pause-progress-slot')?.value ?? this.progression.saveSystem.activeSlotId;
      const summary = this.progression.saveSystem.getSlotSummaries().find((slot) => slot.id === slotId);
      if (!globalThis.confirm?.(`Overwrite ${summary?.label ?? slotId} with ${preview.summary.discovered} discoveries and $${preview.summary.money}?`)) return;
      if (summary?.active) this.onBeforeSaveSwitch();
      await createProgressDownload(this.progression.exportProgressForSlot(slotId), 'reel-ascent-backup-before-import').catch(() => null);
      this.progression.importProgressToSlot(this.pendingImport.text, slotId);
      this.pendingImport = null;
      this.status.textContent = 'Backup downloaded. Import complete.';
      if (summary?.active) globalThis.setTimeout(() => globalThis.location?.reload(), 180); else this.render();
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : 'Progress import failed.';
    }
  }

  restoreMultiplayerPanel() {
    if (!this.multiplayerPanel || !this.multiplayerPanelHome
      || this.multiplayerPanel.parentElement === this.multiplayerPanelHome) return;
    this.multiplayerPanel.classList.remove('is-pause-embedded');
    this.multiplayerPanelHome.appendChild(this.multiplayerPanel);
  }

  destroy() {
    this.restoreMultiplayerPanel();
    this.screen?.removeEventListener('click', this.onClick);
    this.screen?.removeEventListener('change', this.onChange);
    this.screen?.removeEventListener('input', this.onChange);
    this.resumeButton?.removeEventListener('click', this.onResumeClick);
    this.fileInput?.removeEventListener('change', this.onFileChange);
    window.removeEventListener('keydown', this.onKeyDown, true);
    document.body.classList.remove('pause-open');
  }
}
