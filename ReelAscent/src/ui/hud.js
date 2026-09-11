import { isCheatsEnabled } from '../debug/cheat-gate.js';
import { MOBILE_FISHING_DIRECTION_ORDER } from '../fishing/result-actions.js';
import { formatInputCode } from '../player/movement.js';
import { GAME_VERSION } from '../version.js';
import { SongVoteStore, normalizeDownvoteReason, songDownvoteReasonForDigit, songVoteKey } from '../fishing/song-votes.js';

function formatRunTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const DEBUG_LANE_LABELS = Object.freeze({ A: 'LEFT', W: 'UP', S: 'DOWN', D: 'RIGHT' });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export class Hud {
  constructor(voterId = '') {
    const version = document.querySelector('#pause-version');
    if (version) version.textContent = GAME_VERSION;
    this.root = document.querySelector('#hud');
    this.staminaPanel = document.querySelector('.stamina-panel');
    this.staminaTrack = document.querySelector('.stamina-track');
    this.staminaFill = document.querySelector('#stamina-fill');
    this.staminaValue = document.querySelector('#stamina-value');
    this.debugPanel = document.querySelector('#debug-panel');
    this.rockDebugLabel = document.createElement('output');
    this.rockDebugLabel.className = 'rock-debug-label';
    this.rockDebugLabel.hidden = true;
    document.body.appendChild(this.rockDebugLabel);
    this.gripPrompt = document.querySelector('#grip-prompt');
    this.fishPrompt = document.querySelector('#fish-prompt');
    this.tutorialToast = document.querySelector('#tutorial-toast');
    this.tutorialToastTime = 0;
    this.controlHints = Object.fromEntries(['move', 'sprint', 'jump', 'slide', 'grip', 'fish', 'inventory', 'journal', 'settings', 'emotes', 'map'].map((id) => [
      id, [...document.querySelectorAll(`[data-control-hint="${id}"] kbd, [data-control-key="${id}"]`)]
    ]));
    this.fishingPanel = document.querySelector('#fishing-panel');
    this.fishingZone = document.querySelector('#fishing-zone');
    this.fishingMessage = document.querySelector('#fishing-message');
    this.sessionSummary = document.querySelector('#session-summary');
    this.castMeter = document.querySelector('#cast-meter');
    this.castFill = document.querySelector('#cast-fill');
    this.castValue = document.querySelector('#cast-value');
    this.bitePrompt = document.querySelector('#bite-prompt');
    this.rhythmNoteElements = new Map();
    this.bindRhythmHudElements();
    this.catchBanner = document.querySelector('#catch-banner');
    this.catchRarity = document.querySelector('#catch-rarity');
    this.catchSpecies = document.querySelector('#catch-species');
    this.catchLength = document.querySelector('#catch-length');
    this.catchLengthCategory = document.querySelector('#catch-length-category');
    this.catchWeight = document.querySelector('#catch-weight');
    this.catchSizeCategory = document.querySelector('#catch-size-category');
    this.catchQualityWrap = document.querySelector('#catch-quality-wrap');
    this.catchValueWrap = document.querySelector('#catch-value-wrap');
    this.catchValue = document.querySelector('#catch-value');
    this.catchQuality = document.querySelector('#catch-quality');
    this.catchQualityStars = document.querySelector('#catch-quality-stars');
    this.catchRecord = document.querySelector('#catch-record');
    this.catchHint = document.querySelector('#catch-hint');
    this.fishingResultControls = document.querySelector('#fishing-result-controls');
    this.fishingResultTitle = document.querySelector('#fishing-result-title');
    this.songFeedback = document.querySelector('#song-feedback');
    this.songFeedbackSummary = document.querySelector('#song-feedback-summary');
    this.songDownvoteReason = document.querySelector('#song-downvote-reason');
    this.songVoteStore = new SongVoteStore(null, voterId);
    this.songAggregates = new Map();
    this.resultActionHandler = () => false;
    this.feedbackPending = false;
    this.feedbackError = '';
    this.allowVoteChange = false;
    this.downvoteReasonOpen = false;
    this.downvoteReasonPending = false;
    this.currentSongFeedback = null;
    this.currentSongFeedbackKey = '';
    this.onFishingResultPointerDown = (event) => {
      const reasonButton = event.target.closest?.('[data-song-downvote-reason]');
      if (reasonButton && !this.fishingResultControls?.hidden) {
        event.preventDefault();
        event.stopPropagation();
        if (!this.canSelectSongDownvoteReason(this.currentSongFeedback)) return;
        const reason = reasonButton.dataset.songDownvoteReason;
        if (reason === 'skip') {
          this.dismissSongDownvoteReason();
          return;
        }
        const normalized = normalizeDownvoteReason(reason);
        if (normalized) this.resultActionHandler('downvote-reason', 'trigger', normalized);
        return;
      }
      const button = event.target.closest?.('[data-fishing-result-action]');
      if (!button || this.fishingResultControls?.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.fishingResultAction;
      if (action === 'vote-change') {
        this.allowVoteChange = true;
        this.feedbackError = '';
        this.renderSongFeedback(this.currentSongFeedback);
        return;
      }
      if (this.feedbackPending || (['up', 'down'].includes(action) && !this.canRateSong(this.currentSongFeedback))) return;
      if (action === 'clear-vote' && !this.songVoteStore.hasRated(this.currentSongFeedback)) return;
      if (action === 'recast') {
        button.setPointerCapture?.(event.pointerId);
        this.resultRecastPointerId = event.pointerId;
        this.resultActionHandler(action, 'start', `result-button:${event.pointerId}`);
      } else this.resultActionHandler(action, 'trigger');
    };
    this.onFishingResultPointerUp = (event) => {
      if (event.pointerId !== this.resultRecastPointerId) return;
      event.preventDefault(); event.stopPropagation();
      this.resultRecastPointerId = null;
      this.resultActionHandler('recast', 'end', `result-button:${event.pointerId}`);
    };
    this.fishingResultControls?.addEventListener('pointerdown', this.onFishingResultPointerDown);
    this.fishingResultControls?.addEventListener('pointerup', this.onFishingResultPointerUp);
    this.fishingResultControls?.addEventListener('pointercancel', this.onFishingResultPointerUp);
    this.mobileControls = document.querySelector('#mobile-controls');
    this.touchContextAction = document.querySelector('#touch-context-action');
    this.runStatus = document.querySelector('#run-status');
    this.currencyIndicator = document.querySelector('#currency-indicator');
    this.runSector = document.querySelector('#run-sector');
    this.runElevation = document.querySelector('#run-elevation');
    this.runBanner = document.querySelector('#run-banner');
    this.runBannerTitle = document.querySelector('#run-banner-title');
    this.runBannerDetail = document.querySelector('#run-banner-detail');
    this.runEndScreen = document.querySelector('#run-end-screen');
    this.runEndTime = document.querySelector('#run-end-time');
    this.runEndElevation = document.querySelector('#run-end-elevation');
    this.runEndFish = document.querySelector('#run-end-fish');
    this.runEndRarest = document.querySelector('#run-end-rarest');
    this.runEndStart = document.querySelector('#run-end-next-start');
    this.debugVisible = false;
    this.smoothedFps = 60;
    this.lastTouchContextLabel = '';
    this.mobileDirectionButtons = Object.fromEntries(['up', 'down', 'left', 'right'].map((direction) => [
      direction, document.querySelector(`[data-touch-action="${direction}"]`)
    ]));
    for (const [index, direction] of MOBILE_FISHING_DIRECTION_ORDER.entries()) {
      this.mobileDirectionButtons[direction]?.style.setProperty('--fishing-direction-column', String(index + 1));
    }

    this.onKeyDown = (event) => {
      const reason = !event.repeat && this.canSelectSongDownvoteReason(this.currentSongFeedback)
        ? songDownvoteReasonForDigit(event.code)
        : null;
      if (reason) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.resultActionHandler('downvote-reason', 'trigger', reason);
        return;
      }
      if (event.code !== 'F3' || event.repeat || !isCheatsEnabled()) return;
      event.preventDefault();
      this.debugVisible = !this.debugVisible;
      this.debugPanel.hidden = !this.debugVisible;
      document.body.classList.toggle('debug-visible', this.debugVisible);
    };

    window.addEventListener('keydown', this.onKeyDown);
  }

  show() {
    this.root.hidden = false;
  }

  bindRhythmHudElements() {
    this.rhythmPanel = document.querySelector('#rhythm-panel');
    this.rhythmBpm = document.querySelector('#rhythm-bpm');
    this.rhythmJudgment = document.querySelector('#rhythm-judgment');
    this.rhythmProgressFill = document.querySelector('#rhythm-progress-fill');
    this.rhythmProgressValue = document.querySelector('#rhythm-progress-value');
    this.rhythmEscapeFill = document.querySelector('#rhythm-escape-fill');
    this.rhythmEscapeValue = document.querySelector('#rhythm-escape-value');
    this.rhythmLaneElements = new Map(
      [...document.querySelectorAll('.rhythm-lane')].map((lane) => [lane.dataset.lane, lane])
    );
    this.rhythmLayers = new Map([...this.rhythmLaneElements.values()].map((lane) => [
      lane.dataset.lane, lane.querySelector('.note-layer')
    ]));
    this.rhythmReceptors = new Map([...this.rhythmLaneElements.values()].map((lane) => [
      lane.dataset.lane, lane.querySelector('.rhythm-receptor')
    ]));
  }

  ensureRhythmHud() {
    if (this.rhythmPanel?.isConnected) return true;
    if (!this.root) return false;
    const panel = document.createElement('section');
    panel.id = 'rhythm-panel';
    panel.className = 'rhythm-panel';
    panel.setAttribute('aria-label', 'Fishing rhythm challenge');
    const lanes = [['A', '←'], ['W', '↑'], ['S', '↓'], ['D', '→']]
      .map(([lane, arrow]) => `<div class="rhythm-lane" data-lane="${lane}"><div class="note-layer"></div><div class="rhythm-receptor" aria-hidden="true"><span>${arrow}</span></div></div>`)
      .join('');
    panel.innerHTML = `<div class="rhythm-heading"><strong>MATCH THE MOVEMENT</strong><span id="rhythm-bpm">GET READY</span></div><div id="rhythm-stage" class="rhythm-stage">${lanes}</div><output id="rhythm-judgment" class="rhythm-judgment"></output><div class="rhythm-meters"><div class="rhythm-meter-row"><span><b>REEL IN</b><output id="rhythm-progress-value">0%</output></span><div class="meter-track"><div id="rhythm-progress-fill" class="meter-fill rhythm-progress-fill"></div></div></div><div class="rhythm-meter-row"><span><b>ESCAPE</b><output id="rhythm-escape-value">0%</output></span><div class="meter-track"><div id="rhythm-escape-fill" class="meter-fill rhythm-escape-fill"></div></div></div></div>`;
    this.root.appendChild(panel);
    this.rhythmNoteElements.clear();
    this.bindRhythmHudElements();
    return Boolean(this.rhythmPanel);
  }

  setPointerLocked(locked) {
    void locked;
  }

  update(dt, playerState) {
    if (this.tutorialToastTime > 0) {
      this.tutorialToastTime = Math.max(0, this.tutorialToastTime - dt);
      if (this.tutorialToastTime === 0 && this.tutorialToast) this.tutorialToast.hidden = true;
    }
    const percentage = Math.round(playerState.stamina * 100);
    this.root.dataset.position = [
      playerState.position.x.toFixed(3),
      playerState.position.y.toFixed(3),
      playerState.position.z.toFixed(3)
    ].join(',');
    this.root.dataset.grounded = String(playerState.grounded);
    this.root.dataset.speed = playerState.speed.toFixed(3);
    this.root.dataset.sprinting = String(playerState.sprinting);
    this.root.dataset.stamina = playerState.stamina.toFixed(3);
    this.root.dataset.state = playerState.movementState;
    this.root.dataset.surface = playerState.climbSurface ?? '';
    this.root.dataset.climbMaterial = playerState.climbMaterial ?? '';
    this.root.dataset.canGrip = String(playerState.canGrip);
    this.root.dataset.canFish = String(playerState.canFish);
    this.root.dataset.fishingState = playerState.fishing.state;
    this.root.dataset.fish = playerState.fishing.fish ?? '';
    this.root.dataset.rhythmBpm = String(playerState.fishing.rhythm?.bpm ?? 0);
    this.root.dataset.rhythmMisses = String(playerState.fishing.rhythm?.misses ?? 0);
    this.root.dataset.rhythmProgress = (playerState.fishing.rhythm?.progress ?? 0).toFixed(3);
    this.root.dataset.catches = String(playerState.fishing.catches);
    this.root.dataset.catchQuality = playerState.fishing.catchCard?.quality ?? '';
    this.root.dataset.runStatus = playerState.run.status;
    this.root.dataset.sector = playerState.world.sector;
    this.root.dataset.elevationBand = playerState.world.band;
    this.root.dataset.worldMaterial = playerState.world.material;
    this.root.dataset.summitReached = String(playerState.run.summitReached);
    this.root.dataset.inputMode = playerState.inputMode;
    this.root.dataset.cameraYaw = playerState.camera.yaw.toFixed(2);
    this.root.dataset.cameraPitch = playerState.camera.pitch.toFixed(2);
    this.root.dataset.cameraDistance = playerState.camera.distance.toFixed(3);
    this.root.dataset.cameraObstruction = String(playerState.camera.obstructionHandle ?? '');
    this.root.dataset.drawCalls = String(playerState.performance.drawCalls);
    this.root.dataset.worldEntities = String(playerState.performance.worldEntities);
    this.runSector.textContent = `${playerState.world.sector} • ${playerState.world.band}`;
    this.currencyIndicator.textContent = `$${playerState.progression?.money ?? 0}`;
    this.currencyIndicator.title = 'Current money';
    this.runElevation.textContent = String(Math.round(playerState.world.elevation * 3.28084));
    this.runBanner.hidden = !playerState.run.banner || playerState.run.status === 'ended';
    if (playerState.run.banner) {
      this.runBannerTitle.textContent = playerState.run.banner.title;
      this.runBannerDetail.textContent = playerState.run.banner.detail;
    }
    const runEnded = playerState.run.status === 'ended';
    this.runEndScreen.hidden = !runEnded;
    if (runEnded && playerState.run.summary) {
      this.runEndTime.textContent = formatRunTime(playerState.run.summary.elapsed);
      this.runEndElevation.textContent = String(Math.round(playerState.run.summary.highestElevation * 3.28084));
      this.runEndFish.textContent = String(playerState.run.summary.fishCaught);
      this.runEndRarest.textContent = playerState.run.summary.rarest;
      this.runEndStart.textContent = playerState.run.summary.start;
    }
    const contextualAction = playerState.contextualAction?.kind ?? null;
    const bindings = playerState.keyBindings ?? {};
    const gripKey = formatInputCode(bindings.grip ?? 'KeyG');
    const hintText = {
      move: `${formatInputCode(bindings.forward ?? 'KeyW')}/${formatInputCode(bindings.left ?? 'KeyA')}/${formatInputCode(bindings.backward ?? 'KeyS')}/${formatInputCode(bindings.right ?? 'KeyD')} / Arrows`,
      sprint: formatInputCode(bindings.sprint ?? 'ShiftLeft'),
      jump: formatInputCode(bindings.jump ?? 'Space'),
      slide: formatInputCode(bindings.slide ?? 'KeyC'),
      grip: `Click / ${gripKey}`,
      fish: formatInputCode(bindings.fish ?? 'KeyF'),
      inventory: formatInputCode(bindings.inventory ?? 'KeyI'),
      journal: formatInputCode(bindings.journal ?? 'KeyJ'),
      settings: 'Esc',
      emotes: formatInputCode(bindings.emotes ?? 'KeyE'),
      map: formatInputCode(bindings.map ?? 'KeyV')
    };
    for (const [id, keycaps] of Object.entries(this.controlHints ?? {})) {
      for (const keycap of keycaps) keycap.textContent = hintText[id];
    }
    this.gripPrompt.hidden = contextualAction !== 'grip';
    this.gripPrompt.innerHTML = playerState.movementState === 'climbing'
      ? `${playerState.climbMaterial ?? 'Rock'} • Release <kbd>Click / ${gripKey}</kbd> — Drop`
      : `Hold <kbd>Click / ${gripKey}</kbd> — Grip ${playerState.climbMaterial ?? ''}`;
    const fishKey = formatInputCode(bindings.fish ?? 'KeyF');
    this.fishPrompt.hidden = contextualAction !== 'fish';
    this.fishPrompt.innerHTML = `Press <kbd>${fishKey}</kbd> — Fish`;
    this.fishingPanel.hidden = playerState.fishing.state === 'inactive'
      || playerState.fishing.state === 'rhythm'
      || playerState.fishing.state === 'caught';
    this.fishingZone.textContent = playerState.fishing.zone ?? '';
    this.fishingMessage.textContent = playerState.fishing.message || 'Ready to cast';
    this.sessionSummary.textContent = playerState.fishing.catches === 1
      ? '1 caught'
      : `${playerState.fishing.catches} caught`;
    const showingCast = playerState.fishing.state === 'charging';
    this.castMeter.hidden = !showingCast;
    const castPercentage = Math.round(playerState.fishing.castStrength * 100);
    this.castFill.style.transform = `scaleX(${playerState.fishing.castStrength})`;
    this.castValue.textContent = `${castPercentage}%`;

    this.bitePrompt.hidden = playerState.fishing.state !== 'bite' || !playerState.fishing.showHookTutorial;

    const postCastFishing = !['inactive', 'ready', 'charging'].includes(playerState.fishing.state);
    const touchContextLabel = ({ fish: postCastFishing ? 'Exit Fish' : 'Fish', grip: 'Grip', interact: 'Interact' })[
      playerState.mobileActions?.context
    ] ?? 'Interact';
    if (this.touchContextAction && touchContextLabel !== this.lastTouchContextLabel) {
      this.touchContextAction.textContent = touchContextLabel;
      this.touchContextAction.setAttribute('aria-label', touchContextLabel);
      this.lastTouchContextLabel = touchContextLabel;
    }
    this.touchContextAction?.classList.toggle('is-unavailable', !playerState.mobileActions?.contextAvailable);

    const rhythm = playerState.fishing.rhythm;
    const matchingMovement = playerState.fishing.state === 'rhythm-starting'
      || playerState.fishing.state === 'rhythm';
    document.body.classList.toggle('fish-danger', Boolean(rhythm && rhythm.misses === 1));
    // The panel is part of the static HUD, but explicitly repair stale hidden/presentation
    // state on entry so a canceled prior cast, browser style quirk, or audio startup race
    // cannot produce an active match phase with invisible direction indicators.
    if (matchingMovement) {
      this.ensureRhythmHud();
      this.rhythmPanel.hidden = false;
      this.rhythmPanel.removeAttribute('aria-hidden');
      for (const property of ['display', 'opacity', 'visibility']) {
        this.rhythmPanel.style.removeProperty(property);
      }
    } else {
      this.rhythmPanel.hidden = true;
    }
    const fishingResultActive = Boolean(playerState.fishing.resultActive);
    if (this.mobileControls) this.mobileControls.dataset.mode = fishingResultActive
      ? 'result'
      : postCastFishing ? 'fishing' : 'movement';
    if (rhythm) {
      this.rhythmBpm.textContent = `${rhythm.bpm} BPM`;
      this.rhythmJudgment.textContent = rhythm.judgment;
      this.rhythmJudgment.dataset.judgment = rhythm.judgment.toLowerCase().replace('!', '');
      this.rhythmProgressFill.style.transform = `scaleX(${rhythm.progress})`;
      this.rhythmProgressValue.textContent = `${Math.round(rhythm.progress * 100)}%`;
      this.rhythmEscapeFill.style.transform = `scaleX(${rhythm.escapeProgress})`;
      this.rhythmEscapeValue.textContent = `${Math.round(rhythm.escapeProgress * 100)}%`;
      this.syncRhythmNotes(rhythm.notes);
      this.syncRhythmInputFeedback(playerState.fishing.inputFeedbacks ?? []);
    } else {
      this.syncRhythmNotes([]);
      if (matchingMovement) {
        this.rhythmBpm.textContent = 'GET READY';
        this.rhythmJudgment.textContent = 'MOVEMENT CUES LOADING';
        this.rhythmJudgment.dataset.judgment = '';
        this.rhythmProgressFill.style.transform = 'scaleX(0)';
        this.rhythmProgressValue.textContent = '0%';
        this.rhythmEscapeFill.style.transform = 'scaleX(0)';
        this.rhythmEscapeValue.textContent = '0%';
      }
    }

    const catchData = playerState.fishing.catchCard;
    this.catchBanner.hidden = !catchData;
    if (catchData) {
      this.catchBanner.classList.toggle('is-gallery', Boolean(catchData.gallery));
      this.catchBanner.dataset.rarity = catchData.rarity.toLowerCase();
      this.catchSpecies.textContent = catchData.name;
      this.catchLength.textContent = `${catchData.length.toFixed(1)} in`;
      this.catchLengthCategory.textContent = catchData.lengthCategory;
      this.catchWeight.textContent = `${catchData.weight.toFixed(2)} lb`;
      this.catchSizeCategory.textContent = catchData.sizeCategory;
      this.catchValueWrap.hidden = Boolean(catchData.gallery) || !Number.isFinite(catchData.value);
      this.catchValue.textContent = `$${catchData.value ?? 0}`;
      this.catchQualityWrap.hidden = Boolean(catchData.gallery);
      this.catchQuality.textContent = catchData.quality ?? '';
      this.catchQualityStars.textContent = ({ GOOD: '★☆☆', GREAT: '★★☆', PERFECT: '★★★' })[catchData.quality] ?? '';
      if (catchData.gallery) {
        this.catchRarity.hidden = false;
        this.catchRarity.textContent = catchData.galleryLabel;
        this.catchRecord.hidden = false;
        this.catchRecord.textContent = `${playerState.fishing.gallery.index}/${playerState.fishing.gallery.count}`;
        this.catchHint.hidden = false;
        this.catchHint.textContent = 'J/K species • L length • B body • H shiny • P close';
      } else {
        const flags = [catchData.rarityLabel ?? catchData.rarity, catchData.shiny ? 'SHINY!' : '', catchData.newSpecies ? 'NEW SPECIES' : ''].filter(Boolean);
        this.catchRarity.hidden = false;
        this.catchRarity.textContent = flags.join(' • ');
        this.catchRecord.hidden = !catchData.newRecord;
        this.catchRecord.textContent = 'NEW RECORD';
        this.catchHint.hidden = false;
        this.catchHint.textContent = catchData.addedToInventory ? 'ADDED TO INVENTORY' : '';
        this.catchHint.hidden = !this.catchHint.textContent;
      }
    }
    const songFeedback = fishingResultActive ? playerState.fishing.songFeedback : null;
    this.fishingResultControls.hidden = !fishingResultActive;
    if (fishingResultActive) {
      this.fishingResultTitle.textContent = songFeedback?.outcome === 'escaped' ? 'FAILED TO CATCH' : 'CATCH LANDED';
      this.renderSongFeedback(songFeedback);
    } else {
      this.currentSongFeedback = null;
      this.currentSongFeedbackKey = '';
      this.feedbackPending = false;
      this.feedbackError = '';
      this.allowVoteChange = false;
      this.downvoteReasonOpen = false;
      this.downvoteReasonPending = false;
    }
    this.renderMobileDirections(fishingResultActive, songFeedback);
    this.staminaPanel.hidden = playerState.fishing.state !== 'inactive';
    this.staminaFill.style.transform = `scaleX(${playerState.stamina})`;
    this.staminaValue.textContent = String(percentage);
    this.staminaTrack.setAttribute('aria-valuenow', String(percentage));
    this.staminaPanel.classList.toggle('is-tired', playerState.sprintLocked);

    this.smoothedFps += ((1 / Math.max(dt, 0.0001)) - this.smoothedFps) * 0.08;
    if (!this.debugVisible) return;

    const { x, y, z } = playerState.position;
    const fishing = playerState.fishing;
    const rhythmDebug = fishing.rhythm?.debug;
    const zoneMetadata = fishing.zoneMetadata;
    const lastInput = rhythmDebug?.lastInput;
    const inputTiming = Number.isFinite(lastInput?.signedMs)
      ? `${Math.abs(lastInput.signedMs)}ms ${lastInput.signedMs < 0 ? 'EARLY' : lastInput.signedMs > 0 ? 'LATE' : 'ON TIME'}`
      : 'n/a';
    const fishingDebugLines = [
      `FISHING   ${fishing.state}${fishing.zone ? ` — ${fishing.zoneId} / ${fishing.zone}` : ''}`,
      `ZONE META ${zoneMetadata ? `${zoneMetadata.tier} • ${zoneMetadata.waterType} • ${zoneMetadata.theme} • ${zoneMetadata.salinity ?? 'n/a'}` : 'none'}`,
      `FISH      ${fishing.fish ?? 'none'}${fishing.shiny ? ' • SHINY' : ''}`,
      `POOL      ${fishing.selection ? `${fishing.selection.candidatePoolSize} candidates • weight ${fishing.selection.selectedWeight.toFixed(4)} • ${(fishing.selection.selectedProbability * 100).toFixed(2)}%` : 'not selected'}`,
      `TEMPO     ${fishing.rhythm ? `source ${fishing.rhythm.authoredBpm?.join('–') ?? '?'} • base ${fishing.rhythm.baseBpm?.join('–') ?? '?'} • actual ${fishing.rhythm.bpm}` : 'none'}`,
      `PATTERN   ${rhythmDebug?.patternId ?? 'none'}`,
      `EVENT     ${rhythmDebug ? `${rhythmDebug.eventIndex}/${rhythmDebug.eventTotal} • expected ${(rhythmDebug.expectedLanes ?? []).map((lane) => DEBUG_LANE_LABELS[lane] ?? lane).join(' + ') || 'none'} @ ${rhythmDebug.expectedHitTime?.toFixed(3) ?? '-'}s` : 'none'}`,
      `INPUT     ${lastInput ? `${DEBUG_LANE_LABELS[lastInput.lane] ?? lastInput.lane} @ ${lastInput.inputTime.toFixed(3)}s • ${inputTiming} • ${lastInput.judgment}` : 'none'}`,
      `HOLDS     ${rhythmDebug?.activeHolds?.length ? rhythmDebug.activeHolds.map((hold) => `${DEBUG_LANE_LABELS[hold.lane]} ${(hold.progress * 100).toFixed(0)}%/${(hold.required * 100).toFixed(0)}%`).join(' | ') : 'none'}`,
      `REEL/ESC  ${((fishing.rhythm?.progress ?? 0) * 100).toFixed(0)}% / ${((fishing.rhythm?.escapeProgress ?? 0) * 100).toFixed(0)}%`,
      `STREAK    ${rhythmDebug?.streak ?? 0} • ${fishing.rhythm?.misses ?? 0} misses • ${fishing.rhythm?.offBeatPresses ?? 0} off beat`,
      `MISTAKES  ${rhythmDebug?.mistakeLog?.length ? rhythmDebug.mistakeLog.join(' | ') : 'none'}`
    ];
    this.debugPanel.value = [
      `FPS       ${this.smoothedFps.toFixed(0)}`,
      `DRAW      ${playerState.performance.drawCalls} calls • ${playerState.performance.triangles} tris`,
      `ENTITIES  ${playerState.performance.worldEntities} world roots`,
      `POSITION  ${x.toFixed(1)}  ${y.toFixed(1)}  ${z.toFixed(1)}`,
      `PLAYER    ${playerState.standingHeight.toFixed(2)}m tall capsule`,
      `VERT SPD  ${playerState.verticalSpeed.toFixed(2)} m/s`,
      `JUMP APEX ${playerState.normalJumpApex.toFixed(2)}m / ${(playerState.normalJumpApex * 3.28084).toFixed(1)}ft`,
      `SECTOR    ${playerState.world.sector}`,
      `ELEVATION ${Math.round(playerState.world.elevation * 3.28084)}ft — ${playerState.world.band}`,
      `WORLD MAT ${playerState.world.material}`,
      `ROCKS     ${playerState.world.rockSupport?.total ?? 0} placed • ${playerState.world.rockSupport?.crown ?? 0} crown • ${playerState.world.rockSupport?.rejected ?? 0} rejected • ${playerState.world.rockSupport?.unsupported?.length ?? 0} unsupported`,
      `DENSITY   ${playerState.world.rockDensity?.added ?? 0} infill rocks • ${playerState.world.rockDensity?.remainingSparseRegions ?? 0} actionable sparse • ${playerState.world.rockDensity?.protectedSparseRegions ?? 0} kept open`,
      `RUN       ${playerState.run.status} — ${playerState.run.start} — ${playerState.run.elapsed.toFixed(1)}s`,
      `GROUNDED  ${playerState.grounded ? 'yes' : 'no'}`,
      `STATE     ${playerState.movementState}`,
      `CONTACT   ${playerState.contactMotionLocked ? 'LOCKED' : 'free'}`,
      `SURFACE   ${playerState.climbSurface ?? 'none'}${playerState.climbSurfaceLabel ? ` — ${playerState.climbSurfaceLabel}` : ''}`,
      `MATERIAL  ${playerState.climbMaterial ?? 'none'}  ${playerState.climbStaminaMultiplier.toFixed(2)}x stamina`,
      `SLIP      ${playerState.climbSlipRate.toFixed(2)} m/s`,
      `NORMAL    ${playerState.surfaceNormal.x.toFixed(2)}  ${playerState.surfaceNormal.y.toFixed(2)}  ${playerState.surfaceNormal.z.toFixed(2)}`,
      `WALL JUMP ${playerState.wallJumpDirection.x.toFixed(2)}  ${playerState.wallJumpDirection.y.toFixed(2)}  ${playerState.wallJumpDirection.z.toFixed(2)}`,
      `REGRIP    ${playerState.sameSurfaceBlocked ? 'same surface blocked' : 'ready'}`,
      `GRIP PROBE ${playerState.gripDebug.probeHits} hits • ${playerState.gripDebug.acceptedProbeHits} accepted • ${playerState.gripDebug.rejection}`,
      `SELECTED  ${playerState.gripDebug.selected} #${playerState.gripDebug.selectedHandle ?? '-'}`,
      `CANDIDATE ${playerState.gripDebug.candidates.map((candidate) => `${candidate.current ? '*' : ''}${candidate.label} ${candidate.distance.toFixed(2)}m/${candidate.score.toFixed(2)}`).join(' | ') || 'none'}`,
      `SWITCH    ${playerState.gripDebug.switch}`,
      `MANTLE    ${playerState.gripDebug.mantle?.source ?? 'none'} • ${playerState.gripDebug.mantle?.status ?? 'idle'} • ${playerState.gripDebug.mantle?.probes ?? 0} probes`,
      `MANTLE LIP ${playerState.gripDebug.mantle?.lip ? `${playerState.gripDebug.mantle.lip.x.toFixed(1)},${playerState.gripDebug.mantle.lip.y.toFixed(1)},${playerState.gripDebug.mantle.lip.z.toFixed(1)}` : 'none'}  TARGET ${playerState.gripDebug.mantle?.target ? `${playerState.gripDebug.mantle.target.x.toFixed(1)},${playerState.gripDebug.mantle.target.y.toFixed(1)},${playerState.gripDebug.mantle.target.z.toFixed(1)}` : 'none'}`,
      `TOP-OUT   chest ${playerState.gripDebug.mantle?.chestProbe ? 'hit/search' : 'none'} • head ${playerState.gripDebug.mantle?.headProbe ? 'clear/tested' : 'none'} • slope ${Number.isFinite(playerState.gripDebug.mantle?.landingSlope) ? `${playerState.gripDebug.mantle.landingSlope.toFixed(0)}°` : '—'} • reach ${Number.isFinite(playerState.gripDebug.mantle?.reach) ? `${playerState.gripDebug.mantle.reach.toFixed(2)}m` : '—'}`,
      `ANGLE     ${playerState.surfaceAngle.toFixed(0)}°`,
      `OVERHANG  ${playerState.overhangMultiplier.toFixed(2)}x`,
      `SPEED     ${playerState.speed.toFixed(1)}`,
      `SPRINT    ${playerState.sprinting ? 'yes' : 'no'}`,
      `CAMERA    ${playerState.camera.inputMode} • ${playerState.camera.yaw.toFixed(0)}°/${playerState.camera.pitch.toFixed(0)}° • ${playerState.camera.distance.toFixed(2)}m`,
      `CAM HIT   ${playerState.camera.obstructionHandle ?? 'none'} @ ${playerState.camera.obstructionDistance.toFixed(2)}m`,
      ...fishingDebugLines,
      `CATCHES   ${playerState.fishing.catches}`,
      `FISH CHEAT B random • N easy • M hard`,
      `GALLERY   P open • J/K species • L length • B body • H shiny`,
      `FISH DEBUG F6 compact ecology overlay`,
      `COLLECTION I inventory / gear / aquarium`,
      `TELEPORT  1–6 starts • 7 lower • 8 middle • 9 upper • 0 summit • O fishing`,
      `DEBUG     T course • V grip wall • Y recovery • U fail • R new run`
    ].join('\n');
  }

  syncRhythmNotes(notes) {
    const arrows = { A: '←', W: '↑', S: '↓', D: '→' };
    const visibleIds = new Set(notes.map((note) => note.id));
    for (const [id, element] of this.rhythmNoteElements) {
      if (visibleIds.has(id)) continue;
      element.remove();
      this.rhythmNoteElements.delete(id);
    }

    for (const lane of this.rhythmLaneElements.values()) {
      lane.classList.remove('is-hot', 'is-ready', 'is-holding');
    }

    const nearestByLane = new Map();
    for (const note of notes) {
      let element = this.rhythmNoteElements.get(note.id);
      if (!element) {
        element = document.createElement('span');
        element.className = 'rhythm-note';
        element.dataset.lane = note.lane;
        element.dataset.noteId = String(note.id);
        const tail = document.createElement('span');
        tail.className = 'rhythm-note-tail';
        tail.setAttribute('aria-hidden', 'true');
        const head = document.createElement('span');
        head.className = 'rhythm-note-head';
        head.textContent = arrows[note.lane] ?? note.lane;
        const end = document.createElement('span');
        end.className = 'rhythm-note-end';
        end.textContent = arrows[note.lane] ?? note.lane;
        end.setAttribute('aria-hidden', 'true');
        element.append(tail, head, end);
        this.rhythmLayers.get(note.lane)?.appendChild(element);
        this.rhythmNoteElements.set(note.id, element);
      }
      element.style.setProperty('--note-position', String(note.visualPosition ?? note.position));
      // Only the pre-hit minimum tail is visual affordance. During an active hold this
      // value is the exact remaining song-time ratio, so the endpoint keeps travelling.
      element.style.height = note.hold ? `${(note.visualHoldLength ?? note.holdLength) * 100}%` : '0';
      element.classList.toggle('is-hold', note.hold);
      element.classList.toggle('is-holding', note.holding);
      element.classList.toggle('is-near-target', note.position <= .1 || note.holding);
      element.classList.toggle('is-on-target', note.position <= .05 || note.holding);

      const current = nearestByLane.get(note.lane);
      if (!current || note.position < current.position) nearestByLane.set(note.lane, note);
    }

    for (const [laneKey, note] of nearestByLane) {
      const lane = this.rhythmLaneElements.get(laneKey);
      if (!lane) continue;
      if (note.holding) lane.classList.add('is-holding');
      else if (note.position <= .05) lane.classList.add('is-ready');
      else if (note.position <= .12) lane.classList.add('is-hot');
    }
  }

  syncRhythmInputFeedback(feedbacks) {
    for (const feedback of feedbacks) {
      const receptor = this.rhythmReceptors.get(feedback.lane);
      if (!receptor) continue;
      receptor.classList.remove('is-pressed', 'is-input-correct', 'is-input-error');
      // Force a style flush so simultaneous/repeated keyboard or touch press edges each
      // restart the same short pulse animation, even when no note is near the receptor.
      void receptor.offsetWidth;
      receptor.classList.add('is-pressed', feedback.correct ? 'is-input-correct' : 'is-input-error');
    }
  }

  showToast(message, seconds = 4) {
    if (!this.tutorialToast) return false;
    this.tutorialToast.textContent = String(message ?? '');
    this.tutorialToast.hidden = false;
    this.tutorialToastTime = Math.max(1, Number(seconds) || 4);
    return true;
  }

  setFishingResultActionHandler(handler) {
    this.resultActionHandler = typeof handler === 'function' ? handler : () => false;
  }

  canRateSong(feedback) {
    return Boolean(feedback?.songId && !this.feedbackPending
      && (!this.songVoteStore.hasRated(feedback) || this.allowVoteChange));
  }

  beginSongVote(feedback) {
    if (this.feedbackPending || !feedback?.songId) return false;
    this.feedbackPending = true;
    this.feedbackError = '';
    this.renderSongFeedback(feedback);
    return true;
  }

  applyLocalSongVote(feedback, vote, { askForReason = false, reason = null } = {}) {
    this.songVoteStore.set(feedback, vote, reason);
    this.allowVoteChange = false;
    this.downvoteReasonOpen = vote === 'down' && askForReason;
    this.downvoteReasonPending = false;
    this.renderSongFeedback(feedback);
  }

  confirmSongVote(feedback, vote, aggregate = null, { askForReason = false, reason = null } = {}) {
    this.songVoteStore.set(feedback, vote, reason);
    if (aggregate) this.setSongAggregate(aggregate);
    this.feedbackPending = false;
    this.feedbackError = '';
    this.allowVoteChange = false;
    this.downvoteReasonOpen = vote === 'down' && askForReason;
    this.downvoteReasonPending = false;
    this.renderSongFeedback(feedback);
  }

  beginSongDownvoteReason(feedback) {
    if (!this.canSelectSongDownvoteReason(feedback)) return false;
    this.downvoteReasonPending = true;
    this.feedbackError = '';
    this.renderSongFeedback(feedback);
    return true;
  }

  applyLocalSongDownvoteReason(feedback, reason) {
    this.songVoteStore.set(feedback, 'down', reason);
    this.downvoteReasonOpen = true;
    this.renderSongFeedback(feedback);
  }

  canSelectSongDownvoteReason(feedback) {
    return Boolean(feedback?.songId
      && this.downvoteReasonOpen
      && !this.feedbackPending
      && !this.downvoteReasonPending
      && this.fishingResultControls?.hidden === false
      && songVoteKey(feedback) === this.currentSongFeedbackKey
      && this.songVoteStore.get(feedback) === 'down');
  }

  confirmSongDownvoteReason(feedback, reason, aggregate = null) {
    this.songVoteStore.set(feedback, 'down', reason);
    if (aggregate) this.setSongAggregate(aggregate);
    // Keep the optional prompt for this result so 1–5 can revise the same vote row.
    this.downvoteReasonOpen = true;
    this.downvoteReasonPending = false;
    this.feedbackError = '';
    this.renderSongFeedback(feedback);
  }

  dismissSongDownvoteReason() {
    this.downvoteReasonOpen = false;
    this.downvoteReasonPending = false;
    this.renderSongFeedback(this.currentSongFeedback);
  }

  setSongVoteError(message = "Feedback couldn't be saved.") {
    this.feedbackPending = false;
    this.downvoteReasonPending = false;
    this.feedbackError = String(message || "Feedback couldn't be saved.");
    this.renderSongFeedback(this.currentSongFeedback);
  }

  setSongAggregate(aggregate) {
    const key = songVoteKey(aggregate);
    if (!key) return false;
    this.songAggregates.set(key, { ...aggregate });
    if (key === this.currentSongFeedbackKey) this.renderSongFeedback(this.currentSongFeedback);
    return true;
  }

  renderSongFeedback(feedback) {
    const key = songVoteKey(feedback) ?? '';
    if (key !== this.currentSongFeedbackKey) {
      this.currentSongFeedbackKey = key;
      this.feedbackPending = false;
      this.feedbackError = '';
      this.allowVoteChange = false;
      this.downvoteReasonOpen = false;
      this.downvoteReasonPending = false;
    }
    this.currentSongFeedback = feedback;
    if (!key || !this.songFeedback || !this.songFeedbackSummary) return;
    const currentVote = this.songVoteStore.get(feedback);
    const asking = !currentVote || this.allowVoteChange;
    this.songFeedback.hidden = !asking;
    this.songFeedback.title = `${feedback.speciesName} • ${feedback.songId} • revision ${feedback.songRevision}`;
    for (const button of this.songFeedback.querySelectorAll('[data-fishing-result-action]')) {
      button.classList.toggle('is-pending', this.feedbackPending);
      button.disabled = this.feedbackPending;
      if (button.dataset.fishingResultAction === 'clear-vote') button.hidden = !this.allowVoteChange || !currentVote;
    }
    const aggregate = this.songAggregates.get(key);
    const aggregateText = aggregate
      ? `<span><strong>${Math.round(Number(aggregate.approvalPercent) || 0)}% liked</strong> • ${Number(aggregate.totalVotes) || 0} votes • ${Number(aggregate.upVotes) || 0} 👍 / ${Number(aggregate.downVotes) || 0} 👎</span>`
      : '<span>Live totals loading…</span>';
    this.songFeedbackSummary.hidden = !currentVote && !this.feedbackError;
    this.songFeedbackSummary.innerHTML = this.feedbackError
      ? `<span>${escapeHtml(this.feedbackError)}</span>`
      : currentVote ? `<span><strong>YOU: ${currentVote === 'up' ? '👍' : '👎'}</strong></span>${aggregateText}<button type="button" data-fishing-result-action="vote-change">CHANGE</button>` : '';
    if (this.songDownvoteReason) {
      this.songDownvoteReason.hidden = !this.downvoteReasonOpen;
      for (const button of this.songDownvoteReason.querySelectorAll('[data-song-downvote-reason]')) {
        button.disabled = this.feedbackPending || this.downvoteReasonPending;
        button.classList.toggle('is-pending', this.feedbackPending || this.downvoteReasonPending);
        const selected = button.dataset.songDownvoteReason === this.songVoteStore.getReason(feedback);
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
    }
    if (this.mobileControls) this.mobileControls.dataset.rated = String(Boolean(currentVote && !this.allowVoteChange));
  }

  renderMobileDirections(resultActive, feedback) {
    const ordinary = {
      up: ['↑', 'Move forward or rhythm up'], down: ['↓', 'Move backward or rhythm down'],
      left: ['←', 'Move left or rhythm left'], right: ['→', 'Move right or rhythm right']
    };
    const result = {
      up: ['↑<small>RECAST</small>', 'Recast'], down: ['↓<small>STAY</small>', 'Stay fishing'],
      left: ['←<small>DISLIKE</small>', 'Dislike song'], right: ['→<small>LIKE</small>', 'Like song']
    };
    for (const [direction, button] of Object.entries(this.mobileDirectionButtons ?? {})) {
      if (!button) continue;
      const [markup, label] = (resultActive ? result : ordinary)[direction];
      button.innerHTML = markup;
      button.setAttribute('aria-label', label);
    }
    if (resultActive && this.mobileControls) {
      this.mobileControls.dataset.rated = String(Boolean(this.songVoteStore.hasRated(feedback) && !this.allowVoteChange));
    }
  }

  setRockDebugLabel(rock, enabled) {
    if (!this.rockDebugLabel) return;
    this.rockDebugLabel.hidden = !enabled;
    this.rockDebugLabel.textContent = enabled
      ? (rock ? `ROCK: ${rock.id}  •  L COPY / LOG` : 'ROCK IDS ON  •  approach a climbing rock')
      : '';
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.fishingResultControls?.removeEventListener('pointerdown', this.onFishingResultPointerDown);
    this.fishingResultControls?.removeEventListener('pointerup', this.onFishingResultPointerUp);
    this.fishingResultControls?.removeEventListener('pointercancel', this.onFishingResultPointerUp);
    document.body.classList.remove('debug-visible');
    document.body.classList.remove('fish-danger');
    this.rockDebugLabel?.remove();
  }
}
