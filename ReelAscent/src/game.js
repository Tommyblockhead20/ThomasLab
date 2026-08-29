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
    this.app.scene.ambientLight = new pc.Color(0.76, 0.78, 0.73);
    this.app.scene.fog.type = pc.FOG_LINEAR;
    this.app.scene.fog.color.set(COLORS.fog[0], COLORS.fog[1], COLORS.fog[2]);
    this.app.scene.fog.start = 170;
    this.app.scene.fog.end = 390;
    this.app.scene.exposure = 1.08;
    this.app.scene.toneMapping = pc.TONEMAP_ACES;

    this.physicsWorld = new physics.World({ x: 0, y: -PLAYER_CONFIG.gravity, z: 0 });
    this.physicsWorld.timestep = 1 / 60;

    this.createLighting();
    this.world = new MountainWorld(this.app, physics, this.physicsWorld);
    const initialStart = this.world.chooseStart();
    this.hud = new Hud();
    this.saveSystem = new SaveSystem();
    this.progression = new ProgressionSystem(this.saveSystem);
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
    this.inventory = new InventoryMenu(this.progression);
    this.activeMultiplayerSeed = null;
    this.lastMultiplayerFishingActive = false;
    this.multiplayer = new MultiplayerClient(this.progression.state.player.id, {
      createRemoteRepresentation: (playerId) => this.createRemotePlayerRepresentation(playerId),
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
      intensity: 1.45,
      castShadows: true,
      shadowBias: 0.2,
      normalOffsetBias: 0.05,
      shadowDistance: 105,
      shadowResolution: 1536
    });
    sun.setEulerAngles(48, -32, 0);
    this.app.root.addChild(sun);
  }

  update(dt) {
    if (this.destroyed) return;
    if (!this.journal.isOpen && !this.inventory.isOpen && !this.multiplayerMenu.isOpen) {
      this.runManager.update(dt);
      if (!this.runManager.paused) {
        this.player.update(dt, this.camera.getPlanarAxes());
        this.physicsWorld.timestep = dt;
        this.physicsWorld.step();
        this.player.afterPhysics(dt);
      }
    }
    this.syncPersistentProgress();
    this.world.update(dt);
    const multiplayerPlayerState = this.player.getState();
    this.multiplayer.update(Date.now(), {
      position: multiplayerPlayerState.position,
      yaw: this.player.facingYaw,
      movement: multiplayerPlayerState.movementState,
      fishingState: multiplayerPlayerState.movementState === 'fishing' ? 'active' : null
    });
    this.syncMultiplayerFishingState(multiplayerPlayerState);
    this.fishing.updateDebug(dt);
    this.fishingPerformance.update(this.fishing.getFishingPerformanceState());
    this.inventory.update();
    this.ecologyGuide.update();
    this.camera.update(dt);
    this.hud.update(dt, this.getState());
  }

  createRemotePlayerRepresentation(playerId) {
    const root = new pc.Entity(`Remote player ${playerId}`);
    const material = new pc.StandardMaterial();
    material.diffuse = new pc.Color(0.28, 0.72, 0.95);
    material.emissive = new pc.Color(0.025, 0.06, 0.08);
    material.gloss = 0.2;
    material.update();

    const body = new pc.Entity('Remote body');
    body.addComponent('render', { type: 'capsule', material, castShadows: true, receiveShadows: true });
    body.setLocalScale(0.72, 1.12, 0.72);
    body.setLocalPosition(0, -0.05, 0);
    root.addChild(body);

    const head = new pc.Entity('Remote head');
    head.addComponent('render', { type: 'sphere', material, castShadows: true, receiveShadows: true });
    head.setLocalScale(0.48, 0.48, 0.48);
    head.setLocalPosition(0, 0.82, 0);
    root.addChild(head);

    const facing = new pc.Entity('Remote facing marker');
    facing.addComponent('render', { type: 'box', material, castShadows: false, receiveShadows: false });
    facing.setLocalScale(0.16, 0.16, 0.48);
    facing.setLocalPosition(0, 0.35, -0.43);
    root.addChild(facing);

    const fishingRod = new pc.Entity('Remote fishing rod');
    fishingRod.addComponent('render', { type: 'box', material, castShadows: true, receiveShadows: false });
    fishingRod.setLocalScale(0.045, 1.25, 0.045);
    fishingRod.setLocalPosition(0.48, 0.42, -0.28);
    fishingRod.setLocalEulerAngles(28, 0, -18);
    fishingRod.enabled = false;
    root.addChild(fishingRod);
    root.setFishingState = (value) => {
      fishingRod.enabled = typeof value === 'object' ? Boolean(value?.active) : value === 'active';
    };

    root.setPosition(0, -1000, 0);
    this.app.root.addChild(root);
    return root;
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
    const shiny = catchData.shiny ? ' SHINY' : '';
    this.hud.showToast?.(`Player caught${shiny} ${catchData.name || catchData.speciesId || 'something'}!`);
  }

  syncPersistentProgress() {
    for (const catchData of this.fishing.catchHistory) {
      if (this.persistedCatches.has(catchData)) continue;
      this.persistedCatches.add(catchData);
      this.saveSystem.recordCatch(catchData);
      this.multiplayer.sendCatchEvent(catchData);
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

