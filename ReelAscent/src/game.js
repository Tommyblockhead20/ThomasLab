import * as pc from 'playcanvas';
import RAPIER from '@dimforge/rapier3d-compat';
import { COLORS, PLAYER_CONFIG } from './config.js';
import { OrbitCamera } from './camera/orbit-camera.js';
import { FishingController } from './fishing/fishing.js';
import { FISH_SPECIES } from './fishing/fish-data.js';
import { SaveSystem } from './persistence/save-system.js';
import { ProgressionSystem } from './progression/progression.js';
import { Player } from './player/player.js';
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
    const initialStart = this.world.chooseStart();
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
    this.appearanceMenu = new AppearanceMenu(this.progression, this.player);
    this.homeInteraction = new HomeInteractionController(this.world, this.player, this.progression, this.hud);
    this.mapMenu = new MountainMapMenu();
    this.emoteMenu = new EmoteMenu(
      (emoteId) => this.player.startEmote(emoteId),
      () => this.player.canStartEmote()
    );
    this.activeMultiplayerSeed = null;
    this.lastMultiplayerFishingActive = false;
    this.activeCatchPresentation = null;
    this.remoteCatchNotices = new Map();
    this.multiplayerCatchFeed = document.querySelector('#multiplayer-catch-feed');
    this.multiplayer = new MultiplayerClient(this.progression.state.player.id, {
      createRemoteRepresentation: (playerId, colorIndex, appearance) => (
        this.createRemotePlayerRepresentation(playerId, colorIndex, appearance)
      ),
      onAuthoritativeRunSeed: (runSeed) => this.applyAuthoritativeRunSeed(runSeed)
    });
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
      initialStart
    );
    this.player.setRunManager(this.runManager);
    this.runManager.startRun(initialStart, false);
    this.persistedCatches = new WeakSet();
    this.lastSummitReached = false;
    this.lastRunStatus = this.runManager.status;
    this.camera.update(1 / 60, true);

    this.onResize = () => this.app.resizeCanvas();
    this.onDebugKeyDown = (event) => {
      if (event.repeat || event.code !== 'F9') return;
      const editable = ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase?.()) || event.target?.isContentEditable;
      if (editable) return;
      event.preventDefault();
      const money = this.progression.addMoney(1000);
      this.hud.showToast?.(`+$1,000 • $${money}`);
      this.inventory.update();
    };
    window.addEventListener('resize', this.onResize);
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
      addMoney: (amount = 1000) => this.progression.addMoney(amount),
      respawn: () => this.player.respawn(),
      newRun: () => this.runManager.startRun(this.world.chooseStart(this.runManager.currentStart.id), true),
      teleport: (code) => {
        const target = this.world.getDebugTarget(code);
        if (target) {
          this.player.teleport(target.position, target.facingYaw);
          this.camera.setYaw(target.facingYaw);
          this.world.setDeveloperCourseVisible(['KeyT', 'KeyV'].includes(code));
        }
        return Boolean(target);
      },
      starts: START_LOCATIONS.map((start) => ({ id: start.id, label: start.label, ...start.position })),
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
    if (!this.journal.isOpen && !this.inventory.isOpen && !this.multiplayerMenu.isOpen
      && !this.mapMenu.isOpen && !this.emoteMenu.isOpen && !this.appearanceMenu.isOpen) {
      this.runManager.update(dt);
      if (!this.runManager.paused) {
        this.player.update(dt, this.camera.getPlanarAxes());
        this.physicsWorld.timestep = dt;
        this.physicsWorld.step();
        this.player.afterPhysics(dt);
      }
    }
    this.syncPersistentProgress();
    if (this.lastHomeProgressRevision !== this.saveSystem.revision) {
      this.world.updateHomeProgress?.(this.saveSystem.getSnapshot());
      this.world.updateAquariumResidents?.(this.saveSystem.getSnapshot());
      this.lastHomeProgressRevision = this.saveSystem.revision;
    }
    this.world.update(dt);
    this.homeInteraction.update();
    const multiplayerPlayerState = this.player.getState();
    this.multiplayer.update(Date.now(), {
      position: multiplayerPlayerState.position,
      yaw: this.player.facingYaw,
      movement: multiplayerPlayerState.movementState,
      appearance: multiplayerPlayerState.appearance,
      emote: multiplayerPlayerState.emote,
      fishingState: multiplayerPlayerState.movementState === 'fishing' ? 'active' : null
    });
    this.syncMultiplayerFishingState(multiplayerPlayerState);
    this.syncMultiplayerCatchPresentation();
    this.updateRemoteCatchNotices();
    this.fishing.updateDebug(dt);
    this.fishingPerformance.update(this.fishing.getFishingPerformanceState());
    this.inventory.update();
    this.appearanceMenu.update();
    this.ecologyGuide.update();
    this.camera.update(dt);
    this.hud.update(dt, this.getState());
  }

  createRemotePlayerRepresentation(playerId, colorIndex = 0, appearance = null) {
    return createRemoteAvatar(this.app, playerId, colorIndex, appearance);
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
    const identity = `${player?.colorName ?? 'REMOTE'} PLAYER`;
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
      this.saveSystem.recordCatch(catchData);
      const presentation = {
        ...catchData,
        presentationId: `${catchData.speciesId}:${catchData.caughtAt}`,
        active: true
      };
      if (this.multiplayer.sendCatchEvent(presentation)) this.activeCatchPresentation = presentation;
      this.journal.refresh();
    }

    if (this.runManager.summitReached && !this.lastSummitReached) {
      this.saveSystem.recordSummit();
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
      performance: {
        drawCalls: this.app.stats.drawCalls?.total ?? 0,
        triangles: this.app.stats.scene?.triangles ?? 0,
        worldEntities: this.world.root.children.length
      }
    };
  }

  destroy() {
    this.destroyed = true;
    this.player.destroy();
    this.fishing.destroy();
    this.fishingPerformance.destroy();
    this.inventory.destroy();
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
    window.removeEventListener('keydown', this.onDebugKeyDown, true);
    delete window.__reelAscent;
    this.app.destroy();
    this.physicsWorld.free();
  }
}
