import { isCheatsEnabled } from '../debug/cheat-gate.js';
import { formatInputCode } from '../player/movement.js';

function formatRunTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const DEBUG_LANE_LABELS = Object.freeze({ A: 'LEFT', W: 'UP', S: 'DOWN', D: 'RIGHT' });

export class Hud {
  constructor() {
    this.root = document.querySelector('#hud');
    this.staminaPanel = document.querySelector('.stamina-panel');
    this.staminaTrack = document.querySelector('.stamina-track');
    this.staminaFill = document.querySelector('#stamina-fill');
    this.staminaValue = document.querySelector('#stamina-value');
    this.debugPanel = document.querySelector('#debug-panel');
    this.gripPrompt = document.querySelector('#grip-prompt');
    this.fishPrompt = document.querySelector('#fish-prompt');
    this.controlHints = Object.fromEntries(['move', 'sprint', 'jump', 'slide', 'grip', 'fish', 'inventory', 'journal', 'multiplayer', 'emotes', 'map'].map((id) => [
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
    this.rhythmLayers = new Map(
      [...this.rhythmLaneElements.values()].map((lane) => [
        lane.dataset.lane,
        lane.querySelector('.note-layer')
      ])
    );
    this.rhythmReceptors = new Map(
      [...this.rhythmLaneElements.values()].map((lane) => [
        lane.dataset.lane,
        lane.querySelector('.rhythm-receptor')
      ])
    );
    this.rhythmNoteElements = new Map();
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
    this.mobileControls = document.querySelector('#mobile-controls');
    this.touchGrip = document.querySelector('#touch-grip');
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
    this.lastTouchGripLabel = '';

    this.onKeyDown = (event) => {
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

  setPointerLocked(locked) {
    void locked;
  }

  update(dt, playerState) {
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
      multiplayer: formatInputCode(bindings.multiplayer ?? 'KeyM'),
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

    // Fishing uses the directional pad (↓ to hook, arrows for rhythm); keep Grip semantically stable.
    const touchGripLabel = 'Grip';
    if (this.touchGrip && touchGripLabel !== this.lastTouchGripLabel) {
      this.touchGrip.textContent = touchGripLabel;
      this.lastTouchGripLabel = touchGripLabel;
    }

    const rhythm = playerState.fishing.rhythm;
    document.body.classList.toggle('fish-danger', Boolean(rhythm && rhythm.misses === 1));
    this.rhythmPanel.hidden = !rhythm;
    if (this.mobileControls) this.mobileControls.dataset.mode = rhythm ? 'rhythm' : 'movement';
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
        this.catchHint.textContent = catchData.addedToInventory ? 'ADDED TO INVENTORY • Press any arrow to continue • Click also works' : '';
        this.catchHint.hidden = !this.catchHint.textContent;
      }
    }
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

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    document.body.classList.remove('debug-visible');
    document.body.classList.remove('fish-danger');
  }
}
