import * as pc from 'playcanvas';
import RAPIER from '@dimforge/rapier3d-compat';
import { COLORS, PLAYER_CONFIG } from './config.js';
import { OrbitCamera } from './camera/orbit-camera.js';
import { FishingController } from './fishing/fishing.js';
import { FISH_SPECIES } from './fishing/fish-data.js';
import { SaveSystem } from './persistence/save-system.js';
import { ProgressionSystem } from './progression/progression.js';
import { Player } from './player/player.js';
import { loadKeyBindings } from './player/movement.js';
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
import { cheatGate, isCheatsEnabled } from './debug/cheat-gate.js';
import { ShopMenu } from './ui/shop.js';
import { AquariumMenu } from './ui/aquarium.js';
import { BoatTravelMenu } from './ui/boat-travel.js';
import { PauseMenu } from './ui/pause-menu.js';
import { resolveGlobalWorldPosition, WORLD_LOCATIONS } from './world/world-locations.js';
import { TrailBadgeSystem } from './progression/trail-badges.js';
import { TrailBadgeMenu } from './ui/trail-badges.js';

export class Game {
  static async create(canvas, onProgress = () => {}) {
    onProgress('Loading the physics trail');
    await RAPIER.init();
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

    this.physicsWorld = new physics.World({ x: 0, y: -PLAYER_CONFIG.gravity, z: 0 });
    this.physicsWorld.timestep = 1 / 60;

    this.createLighting();
    this.world = new MountainWorld(this.app, physics, this.physicsWorld);
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
    this.hud = new Hud();
    this.saveSystem = new SaveSystem();
    this.progression = new ProgressionSystem(this.saveSystem);
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
    this.camera = new OrbitCamera(
      this.app,
      canvas,
      this.physicsWorld,
      physics,
      this.player,
      this.hud
    );
    this.fishing = new FishingController(this.app, this.player, this.world, { progression: this.progression });
    this.ecologyGuide = new EcologyGuidePanel(this.fishing);
    this.fishingPerformance = new FishingPerformanceMenu(this.fishing);
    this.inventory = new InventoryMenu(this.progression, this.player);
    this.player.showInventorySpecimen(this.progression.getHeldInventorySpecimen());
    this.player.showHeldEquipment(this.progression.getHeldEquipmentItem());
    this.appearanceMenu = new AppearanceMenu(this.progression, this.player);
    this.homeInteraction = new HomeInteractionController(this.world, this.player, this.progression, this.hud, this.camera);
    this.shopMenu = new ShopMenu(this.progression);
    this.aquariumMenu = new AquariumMenu(this.progression);
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
      getCurrentLocationId: () => this.currentLocationId
    });
    this.boatTravel = new BoatTravelMenu((destinationId) => this.travelByBoat(destinationId));
    this.onOpenBoat = (event) => this.boatTravel.open(event.detail?.currentLocationId);
    window.addEventListener('reel-ascent:open-boat', this.onOpenBoat);
    this.emoteMenu = new EmoteMenu(
      (emoteId) => this.player.startEmote(emoteId),
      () => this.player.canStartEmote()
    );
    this.activeMultiplayerSeed = null;
    this.lastMultiplayerFishingActive = false;
    this.activeCatchPresentation = null;
    this.remoteCatchNotices = new Map();
    this.multiplayerCatchFeed = document.querySelector('#multiplayer-catch-feed');
    this.multiplayer = new MultiplayerClient(this.saveSystem.multiplayerPlayerId, {
      createRemoteRepresentation: (playerId, colorIndex, appearance, displayName) => (
        this.createRemotePlayerRepresentation(playerId, colorIndex, appearance, displayName)
      ),
      onAuthoritativeRunSeed: (runSeed) => this.applyAuthoritativeRunSeed(runSeed)
    });
    this.multiplayer.room.setLocalLocationId?.(this.currentLocationId);
    this.onMultiplayerMessage = (event) => this.handleMultiplayerMessage(event.detail);
    this.multiplayer.addEventListener('message', this.onMultiplayerMessage);
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
    this.persistedCatches = new WeakSet();
    this.lastSummitReached = false;
    this.lastRunStatus = this.runManager.status;
    this.camera.update(1 / 60, true);
    this.pauseMenu = new PauseMenu(this.progression, {
      getStats: () => this.getLifetimeStats(),
      onResume: () => this.setLocalPause(false),
      onMultiplayer: () => {
        this.setLocalPause(false);
        this.multiplayerMenu.open();
      }
    });

    this.onResize = () => this.app.resizeCanvas();
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
    this.onDebugKeyDown = (event) => {
      if (event.repeat || event.code !== 'F9' || !isCheatsEnabled()) return;
      if (this.isEditableTarget(event.target)) return;
      event.preventDefault();
      const money = this.progression.addMoney(1000, { legitimate: false });
      this.recordStatEvent('debug-money', { amount: 1000 }, false);
      this.hud.showToast?.(`+$1,000 • $${money}`);
      this.inventory.update();
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onPauseKeyDown, true);
    window.addEventListener('keydown', this.onPausedGameplayKeyDown, true);
    window.addEventListener('keydown', this.onDebugKeyDown, true);

    this.app.on('update', (rawDt) => this.update(Math.min(rawDt, 0.05)));
    this.app.start();
    this.hud.show();

    // A tiny debug surface supports smoke tests without coupling game logic to the HUD.
    window.__reelAscent = Object.freeze({
      getState: () => this.getState(),
      getFishingPerformance: () => this.fishing.getFishingPerformanceState(),
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
      getTransientSession: () => describeTransientSession(this)
    });
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
    const modalOpen = this.isGameplayModalOpen();
    const localGameplayPaused = this.localPause.active;
    if (!modalOpen && !localGameplayPaused) {
      this.runManager.update(dt);
      if (!this.runManager.paused) {
        // Generic world interaction only consumes Grip when a real nearby target exists;
        // otherwise Grip remains available to climbing exactly as before.
        this.homeInteraction.captureInteractionInput();
        this.player.update(dt, this.camera.getPlanarAxes());
        this.physicsWorld.timestep = dt;
        this.physicsWorld.step();
        this.player.afterPhysics(dt);
      }
    }
    if (!localGameplayPaused) this.updateSessionStats(dt);
    this.syncPersistentProgress();
    if (this.lastHomeProgressRevision !== this.saveSystem.revision) {
      const unlocked = this.trailBadges.evaluate();
      if (unlocked.length) this.hud.showToast?.(`Trail Badge unlocked • ${unlocked.length} new`);
      this.world.updateHomeProgress?.(this.saveSystem.getSnapshot());
      this.world.updateAquariumResidents?.(this.saveSystem.getSnapshot());
      this.lastHomeProgressRevision = this.saveSystem.revision;
    }
    this.world.update(dt);
    const multiplayerPlayerState = this.player.getState();
    this.contextualAction = this.resolveContextualAction(multiplayerPlayerState);
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
    this.hud.update(dt, this.getState());
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
      || this.trailBadgeMenu.isOpen;
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
    this.pauseMenu?.setOpen(false);
  }

  setCurrentLocation(locationId, coordinateSpace = 'global-world') {
    if (!locationId) return this.currentLocationId;
    this.currentLocationId = locationId;
    this.currentCoordinateSpace = coordinateSpace || 'global-world';
    this.world.setActiveLocation?.(locationId);
    this.multiplayer?.room?.setLocalLocationId?.(locationId);
    return this.currentLocationId;
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
    if (!currentBest || weight > currentBest.weight || (weight === currentBest.weight && length > currentBest.length)) {
      this.sessionStats.bestCatch = {
        speciesId: catchData?.speciesId ?? null,
        name: catchData?.name ?? null,
        rarity, shiny: Boolean(catchData?.shiny),
        weight, length
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

  applyAuthoritativeRunSeed(runSeed) {
    if (runSeed === null || runSeed === undefined) return;
    this.activeMultiplayerSeed = runSeed;
    const sharedStart = this.world.chooseStart(null, this.seededRandom(runSeed));
    this.setCurrentLocation(sharedStart.locationId ?? this.currentLocationId, sharedStart.coordinateSpace ?? 'global-world');
    this.runManager.startRun(sharedStart, true);
    this.hud.showToast?.(`Joined shared run • ${sharedStart.label}`);
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
      keyBindings: loadKeyBindings(),
      pause: {
        active: this.localPause.active,
        multiplayerContinues: true
      },
      statsFoundation: this.getSessionStats(),
      performance: {
        drawCalls: this.app.stats.drawCalls?.total ?? 0,
        triangles: this.app.stats.scene?.triangles ?? 0,
        worldEntities: this.world.root.children.length
      }
    };
  }

  destroy() {
    this.destroyed = true;
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
    window.removeEventListener('reel-ascent:open-boat', this.onOpenBoat);
    this.appearanceMenu.destroy();
    this.homeInteraction.destroy();
    this.mapMenu.destroy();
    this.emoteMenu.destroy();
    this.multiplayerMenu.destroy();
    this.multiplayer.removeEventListener('message', this.onMultiplayerMessage);
    this.multiplayer.destroy();
    this.camera.destroy();
    this.runManager.destroy();
    this.journal.destroy();
    this.hud.destroy();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onPauseKeyDown, true);
    window.removeEventListener('keydown', this.onPausedGameplayKeyDown, true);
    window.removeEventListener('keydown', this.onDebugKeyDown, true);
    cheatGate.destroy();
    delete window.__reelAscent;
    this.app.destroy();
    this.physicsWorld.free();
  }
}
