import * as pc from 'playcanvas';
import RAPIER from '@dimforge/rapier3d-compat';
import { COLORS, PLAYER_CONFIG } from './config.js';
import { OrbitCamera } from './camera/orbit-camera.js';
import { FishingController } from './fishing/fishing.js';
import { fishingResultActionForDirection } from './fishing/result-actions.js';
import { songVoteKey } from './fishing/song-votes.js';
import { FISH_SPECIES } from './fishing/fish-data.js';
import { SaveSystem } from './persistence/save-system.js';
import { ProgressionSystem } from './progression/progression.js';
import { Player } from './player/player.js';
import { loadGamepadBindings, loadKeyBindings } from './player/movement.js';
import { stabilizeMobileContext } from './player/mobile-actions.js';
import { FishJournal } from './ui/fish-journal.js';
import { EcologyGuidePanel } from './ui/ecology-guide.js';
import { FishingPerformanceMenu } from './ui/fishing-performance.js';
import { Hud } from './ui/hud.js';
import { InventoryMenu } from './ui/inventory.js';
import { MountainWorld, START_LOCATIONS } from './world/mountain-v2.js';
import { RunManager } from './world/run-manager.js';
import { MultiplayerClient } from './multiplayer/multiplayer-client.js';
import { MESSAGE_TYPES } from './multiplayer/protocol.js';
import { MultiplayerMenu } from './ui/multiplayer-menu.js';
import { describeTransientSession } from './persistence/session-state.js';
import { createRemoteAvatar } from './multiplayer/remote-avatar.js';
import { MountainMapMenu } from './ui/mountain-map.js';
import { EmoteMenu } from './ui/emote-menu.js';
import { AppearanceMenu } from './ui/appearance-menu.js';
import { HomeInteractionController } from './ui/home-interaction.js';
import { isBetterCatch } from './persistence/best-catch.js';
import { cheatGate, isCheatsEnabled } from './debug/cheat-gate.js';
import { ShopMenu } from './ui/shop.js';
import { AquariumMenu } from './ui/aquarium.js';
import { BoatTravelMenu } from './ui/boat-travel.js';
import { PauseMenu } from './ui/pause-menu.js';
import { resolveGlobalWorldPosition, WORLD_LOCATIONS } from './world/world-locations.js';
import { TrailBadgeSystem } from './progression/trail-badges.js';
import { TrailBadgeMenu } from './ui/trail-badges.js';
import { TutorialSystem } from './tutorial/tutorial-system.js';
import { OceanSharkHazard } from './world/ocean-shark-hazard.js';
import { SongFeedbackDashboard } from './ui/song-feedback-dashboard.js';
import { markStartup } from './debug/startup-timings.js';
import { GamepadController } from './input/gamepad-controller.js';
import { getDestinationAccess } from './progression/destination-progression.js';

export class Game {
  static async create(canvas, onProgress = () => {}) {
    onProgress('Loading the physics trail');
    markStartup('physics:init-start');
    await RAPIER.init();
    markStartup('physics:init-ready');
    return new Game(canvas, RAPIER, onProgress);
  }

  constructor(canvas, physics, onProgress) {
    this.canvas = canvas;
    this.physics = physics;
    this.destroyed = false;
    cheatGate.install();

    onProgress('Painting the meadow');
    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      }
    });
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = new pc.Color(0.68, 0.72, 0.67);
    this.app.scene.fog.type = pc.FOG_LINEAR;
    this.app.scene.fog.color.set(COLORS.fog[0], COLORS.fog[1], COLORS.fog[2]);
    this.app.scene.fog.start = 190;
    this.app.scene.fog.end = 425;
    this.app.scene.exposure = 1.06;
    this.app.scene.toneMapping = pc.TONEMAP_ACES;
    markStartup('playcanvas:app-ready');

    this.physicsWorld = new physics.World({ x: 0, y: -PLAYER_CONFIG.gravity, z: 0 });
    this.physicsWorld.timestep = 1 / 60;

    this.createLighting();
    markStartup('world:build-start');
    this.world = new MountainWorld(this.app, physics, this.physicsWorld);
    markStartup('world:build-ready');
    const initialStart = this.world.getHomeArrival?.() ?? this.world.chooseStart();
    const worldLocations = this.world.getWorldLocations?.() ?? [];
    const initialWorldLocation = worldLocations.find((location) => location.id === initialStart.locationId)
      ?? worldLocations.find((location) => location.type === 'main-island')
      ?? null;
    const mainWorldLocation = worldLocations.find((location) => location.type === 'main-island') ?? initialWorldLocation;
    this.currentLocationId = initialStart.locationId ?? initialWorldLocation?.id ?? null;
    this.currentCoordinateSpace = initialStart.coordinateSpace ?? 'global-world';
    this.mainWorldLocationId = mainWorldLocation?.id ?? this.currentLocationId;
    this.world.setActiveLocation?.(this.currentLocationId);
    this.localPause = { active: false, openedAt: null, totalPausedSeconds: 0 };
    this.benchPopulationRefresh = 0;
    this.boatSoftlockRecovery = { timer: 0, lastPosition: null };
    this.sessionStats = {
      activePlaytimeSeconds: 0,
      fishCaught: 0,
      catchesByRarity: {},
      shinyCaught: 0,
      bestCatch: null,
      ascents: 0,
      watersCaught: new Set(),
      boatTrips: 0,
      fastestAscentSeconds: null,
      ascentStartActiveSeconds: null,
      ascentCheatContaminated: false,
      ascentCompleted: false,
      events: []
    };
    this.pendingPersistentPlaytime = 0;
    this.contextualAction = null;
    this.mobileContextState = { current: null, candidate: null, candidateSince: 0, lastSeenAt: 0 };
    this.rockDebugEnabled = false;
    this.rockDebugTarget = null;
    this.saveSystem = new SaveSystem();
    markStartup('save:ready');
    this.storageWarningShown = false;
    this.hud = new Hud(this.saveSystem.multiplayerPlayerId);
    this.progression = new ProgressionSystem(this.saveSystem);
    this.tutorials = new TutorialSystem(this.saveSystem, this.hud);
    this.world.updateHomeProgress?.(this.saveSystem.getSnapshot());
    this.world.updateAquariumResidents?.(this.saveSystem.getSnapshot());
    this.lastHomeProgressRevision = this.saveSystem.revision;
    this.journal = new FishJournal(this.saveSystem, FISH_SPECIES);
    this.player = new Player(
      this.app,
      canvas,
      this.physicsWorld,
      physics,
      this.world,
      initialStart.position,
      this.progression
    );
    markStartup('player:ready');
    this.camera = new OrbitCamera(
      this.app,
      canvas,
      this.physicsWorld,
      physics,
      this.player,
      this.hud
    );
    this.fishing = new FishingController(this.app, this.player, this.world, {
      progression: this.progression,
      hasCaughtSpecies: (speciesId) => this.saveSystem.hasCaughtSpecies(speciesId)
    });
    markStartup('fishing:ready');
    this.ecologyGuide = new EcologyGuidePanel(this.fishing);
    this.fishingPerformance = new FishingPerformanceMenu(this.fishing);
    this.inventory = new InventoryMenu(this.progression, this.player);
    this.player.showInventorySpecimen(this.progression.getHeldInventorySpecimen());
    this.player.showHeldEquipment(this.progression.getHeldEquipmentItem());
    this.appearanceMenu = new AppearanceMenu(this.progression, this.player);
    this.homeInteraction = new HomeInteractionController(this.world, this.player, this.progression, this.hud, this.camera);
    this.shopMenu = new ShopMenu(this.progression);
    this.aquariumMenu = new AquariumMenu(this.progression, {
      getSocialShowcases: () => this.getAquariumSocialShowcases(),
      onShowcaseChanged: () => this.sendAquariumShowcase(true)
    });
    const mountainMapData = this.world.getMapData();
    this.totalMapWaters = mountainMapData.waters?.length ?? 0;
    this.saveSystem.recordDestinationVisit(this.currentLocationId);
    this.trailBadges = new TrailBadgeSystem(this.saveSystem, this.progression, {
      activeSpecies: FISH_SPECIES,
      waters: mountainMapData.waters ?? [],
      biomes: [...new Set((mountainMapData.waters ?? []).map((water) => water.ecologyTheme ?? water.theme).filter(Boolean))],
      destinations: WORLD_LOCATIONS
    });
    this.trailBadgeMenu = new TrailBadgeMenu(this.trailBadges);
    this.mapMenu = new MountainMapMenu(mountainMapData, {
      getLocalPlayer: () => ({ id: 'YOU', position: this.getLocalGlobalPosition() }),
      getRemotePlayers: () => [...(this.multiplayer?.room?.members ?? new Map()).entries()]
        .filter(([, remote]) => remote.globalPosition || remote.lastSample)
        .map(([id, remote]) => ({
          id: id.slice(-6).toUpperCase(),
          locationId: remote.locationId,
          position: remote.globalPosition ?? remote.lastSample
        })),
      getHeldItemId: () => this.progression.getHeldWorldItemId(),
      getCurrentLocationId: () => this.currentLocationId,
      getDestinationAccess: (locationId) => getDestinationAccess(this.saveSystem.data, locationId)
    });
    this.boatTravel = new BoatTravelMenu((destinationId) => this.travelByBoat(destinationId), {
      getDestinationAccess: (locationId) => getDestinationAccess(this.saveSystem.data, locationId),
      ownsBoat: () => this.progression.ownsBoat()
    });
    this.onOpenBoat = (event) => this.boatTravel.open(event.detail?.currentLocationId);
    window.addEventListener('reel-ascent:open-boat', this.onOpenBoat);
    this.emoteMenu = new EmoteMenu(
      (emoteId) => this.player.startEmote(emoteId),
      () => this.player.canStartEmote()
    );
    this.activeMultiplayerSeed = null;
    this.lastAquariumShowcaseSignature = '';
    this.lastMultiplayerFishingActive = false;
    this.activeCatchPresentation = null;
    this.remoteCatchNotices = new Map();
    this.multiplayerCatchFeed = document.querySelector('#multiplayer-catch-feed');
    this.multiplayer = new MultiplayerClient(this.saveSystem.multiplayerPlayerId, {
      displayName: this.saveSystem.playerDisplayName,
      createRemoteRepresentation: (playerId, colorIndex, appearance, displayName) => (
        this.createRemotePlayerRepresentation(playerId, colorIndex, appearance, displayName)
      ),
      onAuthoritativeRunSeed: (runSeed, roomState) => this.applyAuthoritativeRunSeed(runSeed, roomState)
    });
    this.homeInteraction.setMultiplayer(this.multiplayer);
    this.player.onSeatCleared = () => this.multiplayer.releaseBenchSeat();
    this.onNameEstablished = (event) => this.saveSystem.setPlayerDisplayName(event.detail);
    this.multiplayer.addEventListener('nameestablished', this.onNameEstablished);
    this.multiplayer.room.setLocalLocationId?.(this.currentLocationId);
    this.onMultiplayerMessage = (event) => this.handleMultiplayerMessage(event.detail);
    this.multiplayer.addEventListener('message', this.onMultiplayerMessage);
    this.onSongVoteAggregate = (event) => this.hud.setSongAggregate(event.detail);
    this.multiplayer.addEventListener('songvoteaggregate', this.onSongVoteAggregate);
    this.lastSongVoteQueryKey = '';
    this.songFeedbackDashboard = new SongFeedbackDashboard(this.multiplayer);
    this.hud.setFishingResultActionHandler((action, phase, source) => this.performFishingResultAction(action, phase, source));
    this.multiplayerMenu = new MultiplayerMenu(this.multiplayer);
    this.player.setFishingController(this.fishing);
    this.runManager = new RunManager(
      this.player,
      this.fishing,
      this.world,
      this.hud,
      this.camera,
      initialStart,
      { onLocationChange: (locationId, coordinateSpace) => this.setCurrentLocation(locationId, coordinateSpace) }
    );
    this.player.setRunManager(this.runManager);
    this.runManager.startRun(initialStart, false);
    this.sharkHazard = new OceanSharkHazard(this.app, this.hud, {
      getExposureDistance: (point) => this.world.getOceanSafetyDistance?.(point) ?? 0,
      onAttack: () => {
        this.fishing.exitFishing?.({ releasePointerLock: true });
        this.player.exitFishing?.({ releasePointerLock: true });
        this.runManager.returnToCabin();
        this.hud.showToast?.('Rescued at Hearthward Cabin. Your run and progress are safe.', 4);
      }
    });
    this.persistedCatches = new WeakSet();
    this.lastSummitReached = false;
    this.lastRunStatus = this.runManager.status;
    this.camera.update(1 / 60, true);
    this.pauseMenu = new PauseMenu(this.progression, {
      getPlayerName: () => this.saveSystem.playerDisplayName,
      onPlayerNameChange: (name) => {
        if (!this.saveSystem.setPlayerDisplayName(name)) return false;
        this.multiplayer.setDisplayName(this.saveSystem.playerDisplayName);
        return true;
      },
      getStats: () => this.getLifetimeStats(),
      onBeforeSaveSwitch: () => this.flushActivePlaytime(),
      onResume: () => this.setLocalPause(false),
      onCabin: () => {
        this.runManager.returnToCabin();
        this.setLocalPause(false);
      },
      onMultiplayer: () => {
        this.multiplayerMenu.open();
      },
      onCloseMultiplayer: () => this.multiplayerMenu.close()
    });
    markStartup('ui:ready');

    this.onResize = () => this.app.resizeCanvas();
    this.onVisibilityChange = () => {
      if (document.hidden && this.multiplayer.state !== 'in_room' && !this.multiplayer.room.roomCode) this.setLocalPause(true);
    };
    this.onPauseKeyDown = (event) => {
      if (event.code !== 'Escape' || event.repeat || this.isEditableTarget(event.target)) return;

      // Existing modal/interaction owners get first refusal. Their own Escape handlers run
      // after this capture listener and close/cancel the active state without opening Pause.
      if (!this.localPause.active && this.hasEscapePriorityState()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      this.setLocalPause(!this.localPause.active);
    };
    this.onPausedGameplayKeyDown = (event) => {
      if (!this.localPause.active || event.code === 'Escape' || this.isEditableTarget(event.target)) return;
      if (!this.isGameplayInputCode(event.code)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.onFishingResultKeyDown = (event) => {
      if (this.isEditableTarget(event.target)) return;
      const action = fishingResultActionForDirection(event.code);
      if (!action || (!this.fishing.resultActive && !(action === 'recast' && this.fishing.resultRecastCharging))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) this.performFishingResultAction(action, action === 'recast' ? 'start' : 'trigger', `key:${event.code}`);
    };
    this.onFishingResultKeyUp = (event) => {
      if (fishingResultActionForDirection(event.code) !== 'recast' || !this.fishing.resultRecastCharging) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.performFishingResultAction('recast', 'end', `key:${event.code}`);
    };
    this.onFishingResultPointerDown = (event) => {
      if (!this.fishing.resultActive || event.button > 0) return;
      const direction = event.target.closest?.('[data-touch-action]')?.dataset.touchAction;
      const action = fishingResultActionForDirection(direction);
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action === 'recast') {
        this.resultRecastPointerId = event.pointerId;
        this.performFishingResultAction(action, 'start', `dpad:${event.pointerId}`);
      } else this.performFishingResultAction(action, 'trigger');
    };
    this.onFishingResultPointerUp = (event) => {
      if (event.pointerId !== this.resultRecastPointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.resultRecastPointerId = null;
      this.performFishingResultAction('recast', 'end', `dpad:${event.pointerId}`);
    };
    this.mobilePauseButton = document.querySelector('#mobile-pause');
    this.onMobilePausePointerDown = (event) => {
      if (event.button > 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.setLocalPause(true);
    };
    this.onDebugKeyDown = (event) => {
      if (event.repeat || !isCheatsEnabled()) return;
      if (this.isEditableTarget(event.target)) return;
      if (event.code === 'F2') {
        event.preventDefault();
        const enabled = this.progression.toggleCosmeticTestMode();
        this.hud.showToast?.(enabled
          ? 'COSMETIC TEST MODE — ALL UNLOCKED'
          : 'Cosmetic Test Mode disabled', 3);
        this.appearanceMenu.update();
        return;
      }
      if (event.code === 'F5' && event.shiftKey) {
        event.preventDefault();
        void this.songFeedbackDashboard.toggle();
        return;
      }
      if (event.code === 'F5') {
        event.preventDefault();
        this.rockDebugEnabled = !this.rockDebugEnabled;
        this.hud.showToast?.(`Map IDs ${this.rockDebugEnabled ? 'ON • L copies/logs nearest ID' : 'OFF'} (F5)`, 2.5);
        return;
      }
      if (event.code === 'KeyL' && this.rockDebugEnabled && this.rockDebugTarget?.id) {
        event.preventDefault();
        console.info(`[Reel Ascent map] ${this.rockDebugTarget.id} • ${this.rockDebugTarget.name}`);
        navigator.clipboard?.writeText?.(this.rockDebugTarget.id).catch?.(() => {});
        this.hud.showToast?.(`${this.rockDebugTarget.id} • copied / logged`, 3);
        return;
      }
      if (event.code === 'F9') {
        event.preventDefault();
        const money = this.progression.addMoney(1000, { legitimate: false });
        this.recordStatEvent('debug-money', { amount: 1000 }, false);
        this.hud.showToast?.(`+$1,000 • $${money}`);
        this.inventory.update();
      }
    };
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('keydown', this.onPauseKeyDown, true);
    window.addEventListener('keydown', this.onPausedGameplayKeyDown, true);
    window.addEventListener('keydown', this.onFishingResultKeyDown, true);
    window.addEventListener('keyup', this.onFishingResultKeyUp, true);
    window.addEventListener('pointerdown', this.onFishingResultPointerDown, true);
    window.addEventListener('pointerup', this.onFishingResultPointerUp, true);
    window.addEventListener('pointercancel', this.onFishingResultPointerUp, true);
    window.addEventListener('keydown', this.onDebugKeyDown, true);
    this.mobilePauseButton?.addEventListener('pointerdown', this.onMobilePausePointerDown);

    this.gamepadController = new GamepadController(this);
    this.app.on('update', (rawDt) => this.update(Math.min(rawDt, 0.05)));
    this.app.once('frameend', () => markStartup('gameplay:first-interactive-frame'));
    this.app.start();
    markStartup('playcanvas:app-started');
    this.hud.show();

    // A tiny debug surface supports smoke tests without coupling game logic to the HUD.
    window.__reelAscent = Object.freeze({
      getState: () => this.getState(),
      getFishingPerformance: () => this.fishing.getFishingPerformanceState(),
      getStoneveilTerrainAuthority: () => this.world.stoneveilTerrainAuthority,
      getProgression: () => this.progression.getSnapshot(),
      purchase: (itemId) => this.progression.purchase(itemId),
      equip: (itemId) => this.progression.equip(itemId),
      sell: (specimenId) => this.progression.sellSpecimen(specimenId),
      addMoney: (amount = 1000) => {
        const money = this.progression.addMoney(amount, { legitimate: false });
        this.recordStatEvent('debug-money', { amount }, false);
        return money;
      },
      respawn: () => this.player.respawn(),
      newRun: () => {
        const start = this.world.chooseStart(this.runManager.currentStart.id);
        this.setCurrentLocation(start.locationId ?? this.currentLocationId, start.coordinateSpace ?? 'global-world');
        return this.runManager.startRun(start, true);
      },
      teleport: (code) => {
        const target = this.world.getDebugTarget(code);
        if (target) {
          this.markCheatAction('teleport');
          this.setCurrentLocation(target.locationId ?? this.currentLocationId, target.coordinateSpace ?? 'global-world');
          this.player.teleport(target.position, target.facingYaw);
          this.camera.setYaw(target.facingYaw);
          this.world.setDeveloperCourseVisible(['KeyT', 'KeyV'].includes(code));
        }
        return Boolean(target);
      },
      starts: START_LOCATIONS.map((start) => ({ id: start.id, label: start.label, ...start.position })),
      getSessionStats: () => this.getSessionStats(),
      getCurrentLocationId: () => this.currentLocationId,
      openAquarium: () => this.aquariumMenu.open(),
      getLocalSongVotes: () => this.hud.songVoteStore.exportSummary(),
      getCosmeticDiagnostic: () => ({
        local: this.player.characterModel?.getCosmeticDiagnostic?.() ?? null,
        remotes: Object.fromEntries([...this.multiplayer.room.members].map(([playerId, remote]) => [
          playerId, remote.representation?.getCosmeticDiagnostic?.() ?? null
        ]))
      }),
      getTransientSession: () => describeTransientSession(this)
    });
    this.devUiPreview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('ui') : null;
    if (this.devUiPreview === 'aquarium') globalThis.setTimeout(() => this.aquariumMenu.open(), 0);
    if (this.devUiPreview === 'appearance') globalThis.setTimeout(() => this.appearanceMenu.open(), 0);
    if (this.devUiPreview === 'song-feedback') globalThis.setTimeout(() => this.songFeedbackDashboard.open(), 0);
    this.ensureDeveloperFishingResultPreview();
  }

  createLighting() {
    const sun = new pc.Entity('Sun');
    sun.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.91, 0.7),
      intensity: 1.38,
      castShadows: true,
      shadowBias: 0.2,
      normalOffsetBias: 0.05,
      shadowDistance: 118,
      shadowResolution: 1536
    });
    sun.setEulerAngles(48, -32, 0);
    this.app.root.addChild(sun);
  }

  update(dt) {
    if (this.destroyed) return;
    this.gamepadController.poll(dt);
    const modalOpen = this.isGameplayModalOpen();
    const localGameplayPaused = this.localPause.active;
    if (!modalOpen && !localGameplayPaused) {
      this.runManager.update(dt);
      if (!this.runManager.paused) {
        // Generic world interaction only consumes Grip when a real nearby target exists;
        // otherwise Grip remains available to climbing exactly as before.
        this.homeInteraction.captureInteractionInput();
        this.world.updateKinematics?.(dt);
        this.player.update(dt, this.camera.getPlanarAxes());
        this.physicsWorld.timestep = dt;
        this.physicsWorld.step();
        this.player.afterPhysics(dt);
        this.updateBoatSoftlockRecovery(dt);
      }
    }
    if (!localGameplayPaused) this.updateSessionStats(dt);
    if (!localGameplayPaused) this.sharkHazard.update(dt, this.player.getPosition());
    this.syncPersistentProgress();
    if (!this.storageWarningShown && this.saveSystem.lastLoadError === 'write-unavailable') {
      this.storageWarningShown = true;
      this.hud.showToast?.('Browser storage is unavailable. Download a backup from Pause > Saves.', 6);
    }
    if (this.lastHomeProgressRevision !== this.saveSystem.revision) {
      const unlocked = this.trailBadges.evaluate();
      if (unlocked.length) this.hud.showToast?.(`Trail Badge unlocked • ${unlocked.length} new`);
      this.world.updateHomeProgress?.(this.saveSystem.getSnapshot());
      this.world.updateAquariumResidents?.(this.saveSystem.getSnapshot(), this.getAquariumSocialShowcases());
      this.sendAquariumShowcase();
      this.lastHomeProgressRevision = this.saveSystem.revision;
    }
    // Keep networking/UI alive for this client, but do not advance the local world clock.
    if (!localGameplayPaused) this.world.update(dt);
    const multiplayerPlayerState = this.player.getState();
    this.benchPopulationRefresh -= dt;
    if (this.benchPopulationRefresh <= 0) {
      this.benchPopulationRefresh = .4;
      const inRoom = this.multiplayer.state === 'in_room';
      const roster = inRoom ? [...this.multiplayer.room.roster.values()].filter((entry) => entry.connected !== false) : [];
      const occupiedIds = inRoom ? [...this.multiplayer.room.benchSeats.keys()] : [];
      const positions = [multiplayerPlayerState.position, ...roster.map((entry) => entry.globalPosition).filter(Boolean)];
      this.world.setBenchPopulation?.(inRoom ? Math.max(1, roster.length) : 1, occupiedIds, positions);
    }
    this.rockDebugTarget = this.rockDebugEnabled
      ? (multiplayerPlayerState.climbRockId
          ? { id: multiplayerPlayerState.climbRockId, name: multiplayerPlayerState.climbSurfaceLabel ?? 'gripped rock', distance: 0 }
          : this.world.getNearestMapDebug?.(multiplayerPlayerState.position, 12))
      : null;
    this.hud.setRockDebugLabel?.(this.rockDebugTarget, this.rockDebugEnabled);
    this.contextualAction = this.resolveContextualAction(multiplayerPlayerState);
    const mobileContextCandidate = this.fishing.active
      ? { kind: 'fish', priority: 110 }
      : this.contextualAction;
    this.mobileContextState = stabilizeMobileContext(
      this.mobileContextState,
      mobileContextCandidate,
      performance.now()
    );
    this.player.input.setMobileActionModes?.({
      context: this.mobileContextState.current?.kind ?? 'interact'
    });
    this.tutorials.update(localGameplayPaused ? 0 : dt, this.contextualAction);
    this.homeInteraction.setPromptAllowed(this.contextualAction?.kind === 'interact');
    this.homeInteraction.update();
    const globalPosition = this.getLocalGlobalPosition(multiplayerPlayerState.position);
    this.multiplayer.update(Date.now(), {
      position: multiplayerPlayerState.position,
      globalPosition,
      locationId: this.currentLocationId,
      coordinateSpace: this.currentCoordinateSpace,
      yaw: this.player.facingYaw,
      movement: multiplayerPlayerState.movementState,
      posture: multiplayerPlayerState.posture,
      appearance: multiplayerPlayerState.appearance,
      emote: multiplayerPlayerState.emote,
      fishingState: multiplayerPlayerState.movementState === 'fishing' ? 'active' : null,
      heldItem: multiplayerPlayerState.heldItem
    });
    this.syncMultiplayerFishingState(multiplayerPlayerState);
    this.syncMultiplayerCatchPresentation();
    this.updateRemoteCatchNotices();
    this.fishing.updateDebug(dt);
    const songFeedback = this.fishing.lastSongFeedback;
    const feedbackKey = songVoteKey(songFeedback) ?? '';
    if (feedbackKey !== this.lastSongVoteQueryKey) {
      this.lastSongVoteQueryKey = feedbackKey;
      if (feedbackKey && this.hud.songVoteStore.hasRated(songFeedback)) {
        const savedVote = this.hud.songVoteStore.get(songFeedback);
        const savedReason = this.hud.songVoteStore.getReason(songFeedback);
        this.multiplayer.submitSongVote(songFeedback, savedVote, savedReason)
          .then((aggregate) => this.hud.confirmSongVote(songFeedback, savedVote, aggregate, { reason: savedReason }))
          .catch(() => this.hud.setSongVoteError(this.multiplayer.voteOutbox.persisted
            ? 'Live feedback is queued for automatic retry.' : 'Live feedback is queued in this tab only.'));
      }
    }
    this.fishingPerformance.update(this.fishing.getFishingPerformanceState());
    const heldSpecimen = this.progression.getHeldInventorySpecimen();
    if ((this.player.heldInventorySpecimen?.specimenId ?? null) !== (heldSpecimen?.specimenId ?? null)) {
      this.player.showInventorySpecimen(heldSpecimen);
    }
    const heldEquipment = this.progression.getHeldEquipmentItem();
    if ((this.player.heldEquipmentItem?.id ?? null) !== (heldEquipment?.id ?? null)) {
      this.player.showHeldEquipment(heldEquipment);
    }
    this.inventory.update();
    this.shopMenu.update();
    this.aquariumMenu.update();
    this.mapMenu.update();
    this.appearanceMenu.update();
    this.ecologyGuide.update();
    this.camera.update(dt);
    // Fishing's own initialization/update callbacks may run after Game construction.
    // Reassert only the opt-in development fixture so narrow-screen result UI checks
    // remain deterministic without altering production fishing state.
    this.ensureDeveloperFishingResultPreview();
    this.hud.update(dt, this.getState());
  }

  ensureDeveloperFishingResultPreview() {
    if (!['fishing-result-success', 'fishing-result-failure'].includes(this.devUiPreview)
      || this.fishing.resultActive) return;
    const failed = this.devUiPreview.endsWith('failure');
    this.fishing.lastSongFeedback = {
      speciesId: 'bluegill',
      speciesName: 'Bluegill',
      songId: 'song:bluegill:authored-1',
      songRevision: 1,
      outcome: failed ? 'escaped' : 'caught'
    };
    this.fishing.setState('result', failed ? 'The fish broke the rhythm and escaped' : 'Catch landed');
  }

  isEditableTarget(target) {
    const tagName = target?.tagName?.toLowerCase?.();
    return ['input', 'textarea', 'select'].includes(tagName) || Boolean(target?.isContentEditable);
  }

  isGameplayInputCode(code) {
    return Boolean(this.player?.input?.matchesAnyGameplayCode?.(code))
      || ['KeyJ', 'KeyI', 'KeyE'].includes(code);
  }

  isGameplayModalOpen() {
    return this.journal.isOpen || this.inventory.isOpen || this.multiplayerMenu.isOpen
      || this.mapMenu.isOpen || this.emoteMenu.isOpen || this.appearanceMenu.isOpen
      || this.shopMenu.isOpen || this.aquariumMenu.isOpen || this.boatTravel.isOpen
      || this.trailBadgeMenu.isOpen || this.songFeedbackDashboard?.isOpen;
  }

  hasEscapePriorityState() {
    return this.isGameplayModalOpen() || this.fishing.active || Boolean(this.player?.benchSeat);
  }

  setLocalPause(active) {
    const next = Boolean(active);
    if (next === this.localPause.active) return;
    if (next) {
      this.localPause.active = true;
      this.localPause.openedAt = performance.now();
      this.pauseMenu?.setOpen(true);
      document.exitPointerLock?.();
      return;
    }

    if (this.localPause.openedAt !== null) {
      this.localPause.totalPausedSeconds += Math.max(0, performance.now() - this.localPause.openedAt) / 1000;
    }
    this.localPause.active = false;
    this.localPause.openedAt = null;
    this.multiplayerMenu?.close();
    this.pauseMenu?.setOpen(false);
  }

  performFishingResultAction(action, phase = 'trigger', detail = null) {
    if (action === 'recast') return phase === 'end'
      ? this.fishing.releaseResultRecast()
      : this.fishing.beginResultRecast();
    if (!this.fishing.resultActive) return false;
    if (action === 'stay') return this.fishing.performResultAction(action);
    if (action === 'downvote-reason') {
      const feedback = { ...this.fishing.lastSongFeedback };
      if (!this.hud.beginSongDownvoteReason(feedback)) return false;
      this.hud.applyLocalSongDownvoteReason(feedback, detail);
      this.multiplayer.submitSongVote(feedback, 'down', detail)
        .then((aggregate) => this.hud.confirmSongDownvoteReason(feedback, detail, aggregate))
        .catch(() => {
          const message = this.multiplayer.voteOutbox.persisted
            ? 'Reason saved locally and queued for retry.' : 'Reason is queued in this tab only; browser storage is unavailable.';
          this.hud.setSongVoteError(message);
          this.hud.showToast?.(message, 3);
        });
      return true;
    }
    const clearing = action === 'clear-vote';
    if ((!['up', 'down'].includes(action) && !clearing)
      || (!clearing && !this.hud.canRateSong(this.fishing.lastSongFeedback))) return false;
    const feedback = { ...this.fishing.lastSongFeedback };
    const vote = clearing ? null : action;
    if (!this.hud.beginSongVote(feedback)) return false;
    this.hud.applyLocalSongVote(feedback, vote, { askForReason: vote === 'down' });
    this.multiplayer.submitSongVote(feedback, vote)
      .then((aggregate) => this.hud.confirmSongVote(feedback, vote, aggregate, { askForReason: vote === 'down' }))
      .catch(() => {
        const message = this.multiplayer.voteOutbox.persisted
          ? 'Feedback saved locally and queued for retry.' : 'Feedback is queued in this tab only; browser storage is unavailable.';
        this.hud.setSongVoteError(message);
        this.hud.showToast?.(message, 3);
      });
    return true;
  }

  setCurrentLocation(locationId, coordinateSpace = 'global-world') {
    if (!locationId) return this.currentLocationId;
    const requestedAccess = getDestinationAccess(this.saveSystem.data, locationId);
    if (!requestedAccess.playable) {
      const safe = this.world.getHomeArrival?.();
      if (safe?.position) {
        this.fishing?.cancel?.();
        this.player?.clearBenchSeat?.();
        this.player?.teleport?.(safe.position, safe.facingYaw);
        this.camera?.setYaw?.(safe.facingYaw);
        locationId = safe.locationId ?? 'home-island';
        coordinateSpace = safe.coordinateSpace ?? 'global-world';
        this.hud?.showToast?.('That destination is unavailable. Returned safely to Hearthward Isle.');
      }
    }
    this.currentLocationId = locationId;
    this.currentCoordinateSpace = coordinateSpace || 'global-world';
    this.world.setActiveLocation?.(locationId);
    if (locationId === 'aquarium-island') {
      this.world.updateAquariumResidents?.(this.saveSystem.getSnapshot(), this.getAquariumSocialShowcases());
    }
    this.boatSoftlockRecovery.timer = 0;
    this.boatSoftlockRecovery.lastPosition = null;
    this.multiplayer?.room?.setLocalLocationId?.(locationId);
    return this.currentLocationId;
  }

  updateBoatSoftlockRecovery(dt) {
    const state = this.boatSoftlockRecovery;
    const position = this.player.getPosition();
    const recovery = this.currentLocationId === 'bluewater-reach'
      ? this.world.getBoatSoftlockRecovery?.(position)
      : null;
    const moved = state.lastPosition
      ? Math.hypot(position.x - state.lastPosition.x, position.y - state.lastPosition.y, position.z - state.lastPosition.z)
      : Infinity;
    state.lastPosition = { x: position.x, y: position.y, z: position.z };
    if (!recovery || moved > .035) {
      state.timer = 0;
      return false;
    }
    state.timer += dt;
    if (state.timer < 3.5) return false;
    state.timer = 0;
    state.lastPosition = null;
    if (this.fishing.active) this.player.exitFishing();
    this.player.teleport(recovery.position, recovery.facingYaw);
    this.camera.setYaw(recovery.facingYaw);
    this.hud.showToast?.('Recovered safely to the boat deck.');
    return true;
  }

  getLocalGlobalPosition(position = this.player?.getPosition?.() ?? { x: 0, y: 0, z: 0 }) {
    return resolveGlobalWorldPosition(this.currentLocationId, position, this.currentCoordinateSpace);
  }

  resolveContextualAction(playerState = this.player.getState()) {
    if (this.localPause.active || this.isGameplayModalOpen() || this.fishing.active) return null;
    if (['climbing', 'mantling'].includes(playerState.movementState)) return { kind: 'grip', priority: 100 };
    const interaction = this.homeInteraction.refreshCurrent().current;
    if (interaction) return { kind: 'interact', id: interaction.id, label: interaction.label, priority: 80 };
    if (playerState.canFish) return { kind: 'fish', zoneId: this.fishing.findNearbyZone?.()?.id ?? null, priority: 60 };
    if (playerState.canGrip) return { kind: 'grip', priority: 40 };
    return null;
  }

  recordStatEvent(type, detail = {}, legitimate = true) {
    this.sessionStats.events.push({
      type,
      detail: { ...detail },
      legitimate: Boolean(legitimate),
      activePlaytimeSeconds: this.sessionStats.activePlaytimeSeconds
    });
    if (this.sessionStats.events.length > 160) this.sessionStats.events.splice(0, this.sessionStats.events.length - 160);
  }

  markCheatAction(kind) {
    if (kind === 'teleport') this.sessionStats.ascentCheatContaminated = true;
    this.recordStatEvent(`cheat:${kind}`, {}, false);
  }

  isLegitimateCatch(catchData) {
    const source = String(catchData?.source ?? catchData?.origin ?? '').toLowerCase();
    return !catchData?.cheatGenerated && !catchData?.debugGenerated && !catchData?.debugSpawned
      && !catchData?.spawnedByCheat && !source.includes('debug') && !source.includes('cheat');
  }

  recordCatchStats(catchData) {
    const legitimate = this.isLegitimateCatch(catchData);
    const rarity = String(catchData?.rarity ?? 'unknown').toLowerCase();
    const zoneId = catchData?.zoneId ?? catchData?.fishingZoneId ?? catchData?.location ?? this.fishing.zone?.id ?? null;

    this.recordStatEvent('fish-caught', {
      speciesId: catchData?.speciesId ?? null, rarity, zoneId, shiny: Boolean(catchData?.shiny)
    }, legitimate);
    if (!legitimate) return;

    this.sessionStats.fishCaught += 1;
    this.sessionStats.catchesByRarity[rarity] = (this.sessionStats.catchesByRarity[rarity] ?? 0) + 1;
    if (catchData?.shiny) this.sessionStats.shinyCaught += 1;
    if (zoneId) this.sessionStats.watersCaught.add(zoneId);

    const weight = Number(catchData?.weight) || 0;
    const length = Number(catchData?.length) || 0;
    const currentBest = this.sessionStats.bestCatch;
    const candidate = {
      speciesId: catchData?.speciesId ?? null,
      name: catchData?.name ?? null,
      rarity, shiny: Boolean(catchData?.shiny),
      weight, length,
      sizeFraction: catchData?.sizeFraction ?? null,
      weightFraction: catchData?.weightFraction ?? null,
      value: catchData?.value ?? 0,
      caughtAt: catchData?.caughtAt ?? Date.now()
    };
    if (isBetterCatch(candidate, currentBest)) {
      this.sessionStats.bestCatch = {
        ...candidate
      };
    }
  }

  updateSessionStats(dt) {
    this.sessionStats.activePlaytimeSeconds += dt;
    this.pendingPersistentPlaytime += dt;
    if (this.pendingPersistentPlaytime >= 15) this.flushActivePlaytime();
    const playerState = this.player.getState();
    const worldInfo = this.world.getWorldInfo(playerState.position, playerState.climbMaterial);
    const elevationMeters = Number(worldInfo?.elevation) || 0;
    if (this.currentLocationId !== this.mainWorldLocationId) return;

    if (elevationMeters <= 1.0) {
      this.sessionStats.ascentStartActiveSeconds = this.sessionStats.activePlaytimeSeconds;
      this.sessionStats.ascentCheatContaminated = false;
      this.sessionStats.ascentCompleted = false;
      return;
    }

    if (elevationMeters < 304.8 || this.sessionStats.ascentCompleted
      || this.sessionStats.ascentStartActiveSeconds === null) return;

    this.sessionStats.ascentCompleted = true;
    const elapsed = Math.max(0, this.sessionStats.activePlaytimeSeconds - this.sessionStats.ascentStartActiveSeconds);
    const legitimate = !this.sessionStats.ascentCheatContaminated;
    this.recordStatEvent('ascent-1000ft', { seconds: elapsed }, legitimate);
    if (legitimate && (this.sessionStats.fastestAscentSeconds === null || elapsed < this.sessionStats.fastestAscentSeconds)) {
      this.sessionStats.fastestAscentSeconds = elapsed;
      this.saveSystem.recordFastestAscent(elapsed, { legitimate: true });
    }
  }

  flushActivePlaytime() {
    const seconds = this.pendingPersistentPlaytime;
    if (!(seconds > 0)) return 0;
    this.pendingPersistentPlaytime = 0;
    this.saveSystem.recordActivePlaytime(seconds);
    return seconds;
  }

  getLifetimeStats() {
    // Include the current unflushed seconds so Pause → Stats always looks live without
    // forcing localStorage writes every frame.
    const lifetime = this.saveSystem.getLifetimeSnapshot();
    const purchase = this.progression.getPurchaseProgress?.() ?? { purchased: 0, total: 0, percent: 0 };
    const totalWaters = this.totalMapWaters;
    const watersCaught = Array.isArray(lifetime.fishingWatersCaught) ? lifetime.fishingWatersCaught.length : 0;
    return {
      activePlaytimeSeconds: (Number(lifetime.activePlaytimeSeconds) || 0) + this.pendingPersistentPlaytime,
      fishCaught: Number(lifetime.fishCaught) || 0,
      catchesByRarity: { ...(lifetime.catchesByRarity ?? {}) },
      shinyCaught: Number(lifetime.shinyCaught) || 0,
      bestCatch: lifetime.bestCatch ? { ...lifetime.bestCatch } : null,
      ascents: Number(lifetime.summitCount) || 0,
      boatTrips: Number(lifetime.boatTrips) || 0,
      fastestAscentSeconds: lifetime.fastestAscentSeconds ?? null,
      watersCaught,
      totalWaters,
      waterPercent: totalWaters ? watersCaught / totalWaters * 100 : 0,
      itemsPurchased: purchase.purchased,
      totalPurchasableItems: purchase.total,
      purchasePercent: purchase.percent,
      legitimateEarnings: Number(lifetime.legitimateEarnings) || 0
    };
  }

  getSessionStats() {
    const pausedNow = this.localPause.openedAt === null
      ? 0
      : Math.max(0, performance.now() - this.localPause.openedAt) / 1000;
    return {
      activePlaytimeSeconds: this.sessionStats.activePlaytimeSeconds,
      fishCaught: this.sessionStats.fishCaught,
      catchesByRarity: { ...this.sessionStats.catchesByRarity },
      shinyCaught: this.sessionStats.shinyCaught,
      bestCatch: this.sessionStats.bestCatch ? { ...this.sessionStats.bestCatch } : null,
      ascents: this.sessionStats.ascents,
      watersCaught: [...this.sessionStats.watersCaught],
      boatTrips: this.sessionStats.boatTrips,
      fastestAscentSeconds: this.sessionStats.fastestAscentSeconds,
      pausedSeconds: this.localPause.totalPausedSeconds + pausedNow,
      recentEvents: this.sessionStats.events.slice(-24).map((event) => ({ ...event, detail: { ...event.detail } }))
    };
  }

  createRemotePlayerRepresentation(playerId, colorIndex = 0, appearance = null, displayName = 'Player') {
    return createRemoteAvatar(this.app, playerId, colorIndex, appearance, displayName);
  }

  travelByBoat(destinationId) {
    const access = getDestinationAccess(this.saveSystem.data, destinationId);
    const courtesyFerry = (this.currentLocationId === 'home-island' && destinationId === 'shop-island')
      || (this.currentLocationId === 'shop-island' && destinationId === 'home-island');
    if (!access.playable || (!this.progression.ownsBoat() && !courtesyFerry)) {
      this.hud.showToast?.(access.reason || 'Purchase the Trail Boat before sailing there.');
      return false;
    }
    const arrival = this.world.chooseTravelArrival(destinationId);
    if (!arrival || arrival.safe === false) return false;
    if (this.fishing.active) this.fishing.cancel();
    this.player.clearBenchSeat?.();
    this.player.teleport(arrival.position, arrival.facingYaw);
    this.camera.setYaw(arrival.facingYaw);
    this.setCurrentLocation(arrival.locationId ?? arrival.location?.id ?? destinationId, arrival.coordinateSpace ?? 'global-world');
    this.saveSystem.recordDestinationVisit(this.currentLocationId, { legitimate: true });
    this.sessionStats.boatTrips += 1;
    this.saveSystem.recordBoatTrip({ legitimate: true });
    this.recordStatEvent('boat-trip', { destinationId: this.currentLocationId, dockId: arrival.dockId ?? null }, true);
    this.hud.showToast?.(`Arrived at ${arrival.location.displayName} • ${arrival.dockId}`);
    return true;
  }

  seededRandom(seed) {
    let state = (Number(seed) >>> 0) || 1;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  applyAuthoritativeRunSeed(runSeed, roomState = null) {
    if (runSeed === null || runSeed === undefined) return;
    this.activeMultiplayerSeed = runSeed;
    const roster = Array.isArray(roomState?.players) ? roomState.players : [];
    const slotIndex = Math.max(0, roster.findIndex((entry) => (entry?.id ?? entry?.playerId) === this.multiplayer.playerId));
    const sharedStart = this.world.getMultiplayerHomeArrival?.(slotIndex) ?? this.world.getHomeArrival();
    this.setCurrentLocation(sharedStart.locationId ?? this.currentLocationId, sharedStart.coordinateSpace ?? 'global-world');
    this.runManager.startRun(sharedStart, true);
    this.hud.showToast?.(`Joined room at ${sharedStart.label}`);
  }

  syncMultiplayerFishingState(playerState) {
    const active = playerState.movementState === 'fishing';
    if (active === this.lastMultiplayerFishingActive) return;
    this.lastMultiplayerFishingActive = active;
    this.multiplayer.sendFishingState({
      active,
      state: active ? 'active' : 'ended',
      zoneId: active ? this.fishing.zone?.id ?? null : null
    });
  }

  handleMultiplayerMessage(message) {
    if (message?.type === MESSAGE_TYPES.ERROR) {
      if (message.payload?.code === 'display_name_in_use' && this.multiplayer.displayName) {
        this.saveSystem.setPlayerDisplayName(this.multiplayer.displayName);
      }
      this.hud.showToast?.(message.payload?.message || 'Multiplayer service error.', 4);
      return;
    }
    if (message?.type === MESSAGE_TYPES.ROOM_STATE) {
      this.sendAquariumShowcase(true);
      this.world.updateAquariumResidents?.(this.saveSystem.getSnapshot(), this.getAquariumSocialShowcases());
      this.aquariumMenu.render?.(true);
      return;
    }
    if (message?.type === MESSAGE_TYPES.AQUARIUM_SHOWCASE) {
      this.world.updateAquariumResidents?.(this.saveSystem.getSnapshot(), this.getAquariumSocialShowcases());
      this.aquariumMenu.render?.(true);
      return;
    }
    if (message?.type !== MESSAGE_TYPES.CATCH_EVENT) return;
    const catchData = message.payload ?? {};
    if (catchData.active === false) {
      const current = this.remoteCatchNotices.get(catchData.playerId);
      if (!catchData.presentationId || current?.presentationId === catchData.presentationId) {
        this.remoteCatchNotices.delete(catchData.playerId);
        this.renderRemoteCatchNotices();
      }
      return;
    }
    const shiny = catchData.shiny ? ' SHINY' : '';
    const player = this.multiplayer.room.getPlayerPresentation(catchData.playerId);
    const identity = player?.displayName || player?.name || `${player?.colorName ?? 'REMOTE'} PLAYER`;
    this.remoteCatchNotices.set(catchData.playerId, {
      presentationId: catchData.presentationId,
      identity,
      color: player?.colorName?.toLowerCase?.() ?? 'blue',
      title: `${identity} CAUGHT${shiny}`,
      detail: `${catchData.name || catchData.speciesId || 'Unknown catch'} • ${Number(catchData.length).toFixed(1)} in • ${Number(catchData.weight).toFixed(2)} lb`,
      expiresAt: Date.now() + 22_000
    });
    this.renderRemoteCatchNotices();
  }

  getAquariumSocialShowcases() {
    if (this.multiplayer?.state !== 'in_room') return [];
    return [...this.multiplayer.room.roster.values()].filter((player) => player.connected !== false).slice(0, 10).map((player) => ({
      playerId: player.id,
      isLocal: player.id === this.multiplayer.playerId,
      displayName: player.displayName || player.name || (player.id === this.multiplayer.playerId ? this.multiplayer.displayName : 'Player'),
      connected: player.connected !== false,
      specimens: player.id === this.multiplayer.playerId
        ? this.progression.getAquariumShowcasePresentation()
        : (Array.isArray(player.aquariumShowcase) ? player.aquariumShowcase.slice(0, 30) : [])
    }));
  }

  sendAquariumShowcase(force = false) {
    if (this.multiplayer?.state !== 'in_room') return false;
    const specimens = this.progression.getAquariumShowcasePresentation();
    const signature = specimens.map((entry) => `${entry.specimenId}:${entry.length}:${entry.weight}:${entry.shiny ? 1 : 0}`).join('|');
    if (!force && signature === this.lastAquariumShowcaseSignature) return false;
    if (!this.multiplayer.sendAquariumShowcase(specimens)) return false;
    this.lastAquariumShowcaseSignature = signature;
    const local = this.multiplayer.room.roster.get(this.multiplayer.playerId);
    if (local) this.multiplayer.room.roster.set(this.multiplayer.playerId, { ...local, aquariumShowcase: specimens });
    return true;
  }

  updateRemoteCatchNotices(now = Date.now()) {
    let changed = false;
    for (const [playerId, notice] of this.remoteCatchNotices) {
      if (now < notice.expiresAt) continue;
      this.remoteCatchNotices.delete(playerId);
      changed = true;
    }
    if (changed) this.renderRemoteCatchNotices();
  }

  renderRemoteCatchNotices() {
    if (!this.multiplayerCatchFeed) return;
    this.multiplayerCatchFeed.replaceChildren(...[...this.remoteCatchNotices.values()].map((notice) => {
      const card = document.createElement('article');
      card.dataset.color = notice.color;
      const title = document.createElement('strong');
      title.textContent = notice.title;
      const detail = document.createElement('span');
      detail.textContent = notice.detail;
      card.append(title, detail);
      return card;
    }));
    this.multiplayerCatchFeed.hidden = this.remoteCatchNotices.size === 0;
  }

  syncMultiplayerCatchPresentation() {
    if (!this.activeCatchPresentation || this.fishing.state === 'caught') return;
    this.multiplayer.sendCatchEvent({ ...this.activeCatchPresentation, active: false });
    this.activeCatchPresentation = null;
  }

  syncPersistentProgress() {
    for (const catchData of this.fishing.catchHistory) {
      if (this.persistedCatches.has(catchData)) continue;
      this.persistedCatches.add(catchData);
      const legitimateCatch = this.isLegitimateCatch(catchData);
      const zoneId = catchData?.zoneId ?? catchData?.fishingZoneId ?? catchData?.location ?? this.fishing.zone?.id ?? null;
      this.recordCatchStats(catchData);
      this.saveSystem.recordCatch({
        ...catchData,
        fishingZoneId: zoneId,
        biomeId: catchData?.biomeId ?? this.fishing.zone?.ecologyTheme ?? this.fishing.zone?.theme ?? null
      }, { legitimate: legitimateCatch });
      const presentation = {
        ...catchData,
        presentationId: `${catchData.speciesId}:${catchData.caughtAt}`,
        active: true
      };
      if (this.multiplayer.sendCatchEvent(presentation)) this.activeCatchPresentation = presentation;
      this.journal.refresh();
    }

    if (this.runManager.summitReached && !this.lastSummitReached) {
      const legitimateAscent = !this.sessionStats.ascentCheatContaminated;
      this.recordStatEvent('summit', {}, legitimateAscent);
      if (legitimateAscent) this.sessionStats.ascents += 1;
      this.saveSystem.recordSummit({ legitimate: legitimateAscent });
      this.journal.refresh();
    }
    this.lastSummitReached = this.runManager.summitReached;

    if (this.runManager.status === 'ended' && this.lastRunStatus !== 'ended') {
      this.saveSystem.recordRun({
        ...this.runManager.summary,
        summitReached: this.runManager.summitReached
      });
      this.journal.refresh();
    }
    this.lastRunStatus = this.runManager.status;
  }

  getState() {
    const playerState = this.player.getState();
    return {
      ...playerState,
      camera: this.camera.getDebugState(),
      world: this.world.getWorldInfo(playerState.position, playerState.climbMaterial),
      run: this.runManager.getState(),
      progression: this.progression.getHudState(),
      location: {
        locationId: this.currentLocationId,
        coordinateSpace: this.currentCoordinateSpace,
        globalPosition: this.getLocalGlobalPosition(playerState.position)
      },
      contextualAction: this.contextualAction ? { ...this.contextualAction } : null,
      mobileActions: {
        context: this.mobileContextState.current?.kind ?? 'interact',
        contextAvailable: Boolean(this.mobileContextState.current)
      },
      keyBindings: loadKeyBindings(),
      gamepadBindings: loadGamepadBindings(),
      inputDevice: this.player.input.activeInputDevice,
      pause: {
        active: this.localPause.active,
        multiplayerContinues: true
      },
      statsFoundation: this.getSessionStats(),
      cosmeticTestMode: this.progression.isCosmeticTestMode(),
      performance: {
        drawCalls: this.app.stats.drawCalls?.total ?? 0,
        triangles: this.app.stats.scene?.triangles ?? 0,
        worldEntities: this.world.root.children.length
      }
    };
  }

  destroy() {
    this.destroyed = true;
    this.gamepadController?.destroy();
    this.flushActivePlaytime();
    this.player.destroy();
    this.fishing.destroy();
    this.fishingPerformance.destroy();
    this.inventory.destroy();
    this.shopMenu.destroy();
    this.aquariumMenu.destroy();
    this.boatTravel.destroy();
    this.trailBadgeMenu.destroy();
    this.pauseMenu?.destroy();
    this.songFeedbackDashboard?.destroy();
    window.removeEventListener('reel-ascent:open-boat', this.onOpenBoat);
    this.appearanceMenu.destroy();
    this.homeInteraction.destroy();
    this.mapMenu.destroy();
    this.emoteMenu.destroy();
    this.multiplayerMenu.destroy();
    this.multiplayer.removeEventListener('message', this.onMultiplayerMessage);
    this.multiplayer.removeEventListener('nameestablished', this.onNameEstablished);
    this.multiplayer.removeEventListener('songvoteaggregate', this.onSongVoteAggregate);
    this.multiplayer.destroy();
    this.camera.destroy();
    this.runManager.destroy();
    this.sharkHazard?.destroy();
    this.journal.destroy();
    this.hud.destroy();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('keydown', this.onPauseKeyDown, true);
    window.removeEventListener('keydown', this.onPausedGameplayKeyDown, true);
    window.removeEventListener('keydown', this.onFishingResultKeyDown, true);
    window.removeEventListener('keyup', this.onFishingResultKeyUp, true);
    window.removeEventListener('pointerdown', this.onFishingResultPointerDown, true);
    window.removeEventListener('pointerup', this.onFishingResultPointerUp, true);
    window.removeEventListener('pointercancel', this.onFishingResultPointerUp, true);
    window.removeEventListener('keydown', this.onDebugKeyDown, true);
    this.mobilePauseButton?.removeEventListener('pointerdown', this.onMobilePausePointerDown);
    cheatGate.destroy();
    delete window.__reelAscent;
    this.app.destroy();
    this.physicsWorld.free();
  }
}
