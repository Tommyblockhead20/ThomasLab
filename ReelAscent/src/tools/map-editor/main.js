import * as pc from 'playcanvas';
import {
  MOUNTAIN_CENTER,
  MOUNTAIN_FISHING_LOCATIONS,
  SUMMIT_HEIGHT,
  terrainHeightAt,
  FRACTURED_ROCK_FORM_KINDS
} from '../../src/world/mountain-v2.js';
import {
  applyMidPlateauPreset,
  applyTerrainPatchHeight,
  downloadJson,
  FEET_PER_METER,
  makeEmptyPatch,
  normalizePatch
} from './patch-format.js';
import {
  PLAYER_CONFIG,
  PLAYER_FOOT_OFFSET,
  PLAYER_STANDING_HEIGHT
} from '../../src/config.js';

const STORAGE_KEY = 'reel-ascent-map-editor-v1';
const CHECKPOINT_KEY = 'reel-ascent-map-editor-v1-manual-checkpoint';
const RECOVERY_DB_NAME = 'reel-ascent-map-editor-recovery';
const RECOVERY_STORE = 'autosaves';
const RECOVERY_KEY = 'latest-patch';
const CAMERA_VIEW_KEY = 'reel-ascent-map-editor-camera-view-v1';
const TERRAIN_OUTER_RADIUS = 208;
const CROWN_BASE_RADIUS = 41;
const CROWN_TOP_RADIUS = 8;
const CROWN_BASE_HEIGHT = 215;
const TERRAIN_SEGMENTS = 180;
const TERRAIN_RINGS = 66;
const ROCK_KINDS = [...new Set(FRACTURED_ROCK_FORM_KINDS)];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, value) => {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const deg = (radians) => radians * 180 / Math.PI;
const rad = (degrees) => degrees * Math.PI / 180;
const clone = (value) => structuredClone(value);

let patch = loadLocalPatch();
let runtimeSnapshot = clone(patch.bakedSnapshot ?? { objects: [], rocks: [] });
let tool = 'select';
let selected = null;
let idCounter = Date.now() % 1000000;
let draggingBrush = false;
let lastBrushPoint = null;
let history = [];
let future = [];
let suppressHistory = false;
let activeBrushTransaction = false;
let currentTerrainData = null;
let caveConnectStart = null;

const walkthroughState = {
  active: false,
  loading: false,
  fly: false,
  rapier: null,
  rapierPromise: null,
  world: null,
  terrainCollider: null,
  body: null,
  collider: null,
  controller: null,
  capsuleShape: null,
  keys: new Set(),
  yaw: 0,
  pitch: 0,
  grounded: false,
  verticalVelocity: 0,
  horizontalVelocity: new pc.Vec3(),
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  jumpQueued: false,
  eye: new pc.Vec3(),
  flyEye: new pc.Vec3(),
  entryEye: new pc.Vec3(),
  entryYaw: 0,
  entryPitch: 0
};


const canvas = $('#editor-canvas');
const app = new pc.Application(canvas, {
  graphicsDeviceOptions: { antialias: true, alpha: false }
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight = new pc.Color(0.38, 0.43, 0.4);
app.start();

const sceneRoot = new pc.Entity('Map Editor Scene');
app.root.addChild(sceneRoot);

const terrainRoot = new pc.Entity('Terrain Root');
const waterRoot = new pc.Entity('Water Root');
const caveMarkerRoot = new pc.Entity('Cave Marker Root');
const placedRoot = new pc.Entity('Placed Root');
const snapshotRoot = new pc.Entity('Snapshot Root');
const helperRoot = new pc.Entity('Helper Root');
const tunnelRoot = new pc.Entity('Tunnel Root');
sceneRoot.addChild(terrainRoot);
sceneRoot.addChild(waterRoot);
sceneRoot.addChild(caveMarkerRoot);
sceneRoot.addChild(placedRoot);
sceneRoot.addChild(snapshotRoot);
sceneRoot.addChild(tunnelRoot);
sceneRoot.addChild(helperRoot);

const cameraEntity = new pc.Entity('Editor Camera');
cameraEntity.addComponent('camera', {
  clearColor: new pc.Color(0.71, 0.8, 0.85),
  farClip: 4000,
  nearClip: 0.03,
  fov: 52
});
app.root.addChild(cameraEntity);

const sun = new pc.Entity('Sun');
sun.addComponent('light', {
  type: 'directional',
  color: new pc.Color(1, 0.97, 0.88),
  intensity: 1.3,
  castShadows: false
});
sun.setEulerAngles(48, -35, 0);
app.root.addChild(sun);

const fill = new pc.Entity('Fill');
fill.addComponent('light', {
  type: 'directional',
  color: new pc.Color(0.45, 0.58, 0.68),
  intensity: 0.35,
  castShadows: false
});
fill.setEulerAngles(-25, 145, 0);
app.root.addChild(fill);

const cameraState = {
  target: new pc.Vec3(MOUNTAIN_CENTER.x, 105, MOUNTAIN_CENTER.z),
  yaw: 42,
  pitch: -24,
  distance: 430
};
try {
  const savedView = JSON.parse(sessionStorage.getItem(CAMERA_VIEW_KEY) || 'null');
  const values = [savedView?.target?.x, savedView?.target?.y, savedView?.target?.z, savedView?.yaw, savedView?.pitch, savedView?.distance].map(Number);
  if (values.every(Number.isFinite)) {
    cameraState.target.set(values[0], values[1], values[2]);
    cameraState.yaw = values[3];
    cameraState.pitch = clamp(values[4], -89, 75);
    cameraState.distance = clamp(values[5], 0.25, 1600);
  }
} catch {}
let cameraViewSaveTimer = null;
function queueCameraViewSave() {
  if (cameraViewSaveTimer) return;
  cameraViewSaveTimer = setTimeout(() => {
    cameraViewSaveTimer = null;
    try {
      sessionStorage.setItem(CAMERA_VIEW_KEY, JSON.stringify({
        target: { x: cameraState.target.x, y: cameraState.target.y, z: cameraState.target.z },
        yaw: cameraState.yaw,
        pitch: cameraState.pitch,
        distance: cameraState.distance
      }));
    } catch {}
  }, 120);
}

const materials = {
  terrain: makeMaterial([0.49, 0.54, 0.49], 0.08),
  terrainXray: makeMaterial([0.42, 0.52, 0.49], 0.04, 0.10),
  terrainWire: makeMaterial([0.2, 0.27, 0.23], 0.02),
  water: makeMaterial([0.15, 0.62, 0.72], 0.78, 0.5),
  waterSelected: makeMaterial([0.96, 0.73, 0.23], 0.9, 0.35),
  caveWaterXray: makeMaterial([0.96, 0.20, 0.82], 0.9, 0.88),
  caveBeacon: makeMaterial([1.0, 0.35, 0.88], 0.25, 0.72),
  rock: makeMaterial([0.42, 0.44, 0.42], 0.12),
  snapshotRock: makeMaterial([0.34, 0.38, 0.36], 0.05),
  selected: makeMaterial([0.95, 0.69, 0.2], 0.2),
  grass: makeMaterial([0.2, 0.52, 0.24], 0.04),
  darkGreen: makeMaterial([0.12, 0.34, 0.17], 0.04),
  leaf: makeMaterial([0.28, 0.57, 0.27], 0.04),
  trunk: makeMaterial([0.36, 0.23, 0.12], 0.03),
  flower: makeMaterial([0.85, 0.35, 0.48], 0.1),
  decor: makeMaterial([0.48, 0.34, 0.18], 0.08),
  helper: makeMaterial([0.96, 0.26, 0.2], 0.02, 0.28),
  cave: makeMaterial([0.22, 0.24, 0.23], 0.03),
  caveSelected: makeMaterial([0.78, 0.56, 0.18], 0.08),
  tunnelGuide: makeMaterial([0.88, 0.46, 0.18], 0.04, 0.32)
};
for (const material of [materials.terrain, materials.terrainXray]) {
  try { material.cull = pc.CULLFACE_NONE; material.update(); } catch {}
}

const waterMaterialCache = new Map();
function normalizeHexColor(value, fallback = '#269eb8') {
  const text = String(value || '').trim();
  const full = /^#[0-9a-f]{6}$/i.test(text) ? text : (/^#[0-9a-f]{3}$/i.test(text)
    ? `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}` : fallback);
  return full.toLowerCase();
}
function hexToRgb01(value) {
  const hex = normalizeHexColor(value).slice(1);
  return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
}
function waterMaterialFor(record) {
  const override = patch.fishingOverrides?.[record.id] ?? {};
  if (!override.color) return materials.water;
  const hex = normalizeHexColor(override.color);
  if (!waterMaterialCache.has(hex)) waterMaterialCache.set(hex, makeMaterial(hexToRgb01(hex), 0.78, 0.5));
  return waterMaterialCache.get(hex);
}

function makeMaterial(rgb, gloss = 0.1, opacity = 1) {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(...rgb);
  material.gloss = gloss * 100;
  material.metalness = 0;
  material.opacity = opacity;
  if (opacity < 1) {
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
  }
  material.update();
  return material;
}

function updateCamera() {
  if (walkthroughState.active) return;
  const yaw = rad(cameraState.yaw);
  const pitch = rad(cameraState.pitch);
  const cp = Math.cos(pitch);
  const position = new pc.Vec3(
    cameraState.target.x + Math.sin(yaw) * cp * cameraState.distance,
    cameraState.target.y + Math.sin(-pitch) * cameraState.distance,
    cameraState.target.z + Math.cos(yaw) * cp * cameraState.distance
  );
  cameraEntity.setPosition(position);
  cameraEntity.lookAt(cameraState.target);
  queueCameraViewSave();
}
updateCamera();

function walkthroughEyeOffset() {
  const standingHeight = Number(PLAYER_STANDING_HEIGHT) || 1.88;
  const footOffset = Number(PLAYER_FOOT_OFFSET)
    || ((Number(PLAYER_CONFIG?.capsuleHalfHeight) || .6) + (Number(PLAYER_CONFIG?.radius) || .34));
  return Math.max(.42, standingHeight * .9 - footOffset);
}

function walkthroughForward(yawDegrees = walkthroughState.yaw, pitchDegrees = walkthroughState.pitch) {
  const yaw = rad(yawDegrees);
  const pitch = rad(pitchDegrees);
  const cp = Math.cos(pitch);
  return new pc.Vec3(
    -Math.sin(yaw) * cp,
    Math.sin(pitch),
    -Math.cos(yaw) * cp
  ).normalize();
}

function walkthroughFlatAxes() {
  const yaw = rad(walkthroughState.yaw);
  return {
    forward: new pc.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw)),
    right: new pc.Vec3(Math.cos(yaw), 0, -Math.sin(yaw))
  };
}

function moveTowardScalar(current, target, maximumDelta) {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function syncWalkthroughHud(message = '') {
  const hud = $('#walkthrough-hud');
  if (hud) hud.hidden = !walkthroughState.active;
  const mode = $('#walkthrough-mode');
  if (mode) mode.textContent = walkthroughState.fly
    ? 'FLY / NOCLIP'
    : (walkthroughState.grounded ? 'WALK · GROUNDED' : 'WALK · AIRBORNE');
  const flyButton = $('#walkthrough-fly-toggle');
  if (flyButton) flyButton.textContent = walkthroughState.fly ? 'Switch to Walk (F)' : 'Switch to Fly (F)';
  const note = $('#walkthrough-note');
  if (note && message) note.textContent = message;
  const button = $('#walkthrough-toggle');
  if (button) {
    button.textContent = walkthroughState.loading
      ? 'Loading Walkthrough…'
      : (walkthroughState.active ? 'Walkthrough Active' : 'Walkthrough');
    button.disabled = walkthroughState.loading || walkthroughState.active;
  }
}

function setWalkthroughMessage(message) {
  const note = $('#walkthrough-note');
  if (note) note.textContent = message;
  setStatus(message);
}

async function ensureWalkthroughRapier() {
  if (walkthroughState.rapier) return walkthroughState.rapier;
  if (!walkthroughState.rapierPromise) {
    walkthroughState.rapierPromise = import('@dimforge/rapier3d-compat').then(async (module) => {
      const RAPIER = module.default ?? module;
      if (typeof RAPIER.init === 'function') await RAPIER.init();
      walkthroughState.rapier = RAPIER;
      return RAPIER;
    });
  }
  return walkthroughState.rapierPromise;
}

function destroyWalkthroughPhysics() {
  try { walkthroughState.world?.free?.(); } catch {}
  walkthroughState.world = null;
  walkthroughState.terrainCollider = null;
  walkthroughState.body = null;
  walkthroughState.collider = null;
  walkthroughState.controller = null;
  walkthroughState.capsuleShape = null;
}

function currentWalkthroughEye() {
  if (walkthroughState.fly) return walkthroughState.flyEye.clone();
  const position = walkthroughState.body?.translation?.();
  if (!position) return cameraEntity.getPosition().clone();
  return new pc.Vec3(position.x, position.y + walkthroughEyeOffset(), position.z);
}

function updateWalkthroughCamera() {
  if (!walkthroughState.active) return;
  const eye = currentWalkthroughEye();
  walkthroughState.eye.copy(eye);
  const forward = walkthroughForward();
  cameraEntity.setPosition(eye);
  cameraEntity.lookAt(eye.clone().add(forward));
}

function walkthroughCapsuleBlockedAt(position) {
  const state = walkthroughState;
  if (!state.world || !state.capsuleShape) return false;
  let blocked = false;
  state.world.intersectionsWithShape(
    { x: position.x, y: position.y, z: position.z },
    { x: 0, y: 0, z: 0, w: 1 },
    state.capsuleShape,
    () => {
      blocked = true;
      return false;
    },
    undefined,
    undefined,
    state.collider
  );
  return blocked;
}

function buildWalkthroughPhysics(RAPIER, eyePosition) {
  destroyWalkthroughPhysics();
  const data = currentTerrainData ?? terrainDataForRender();
  if (!data?.positions?.length || !data?.indices?.length) {
    throw new Error('No terrain mesh is available for walkthrough collision.');
  }

  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const terrainDesc = RAPIER.ColliderDesc.trimesh(
    Float32Array.from(data.positions),
    Uint32Array.from(data.indices)
  ).setFriction(1).setRestitution(0);
  const terrainCollider = world.createCollider(terrainDesc);

  const center = {
    x: eyePosition.x,
    y: eyePosition.y - walkthroughEyeOffset(),
    z: eyePosition.z
  };
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z)
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(PLAYER_CONFIG.capsuleHalfHeight, PLAYER_CONFIG.radius)
      .setFriction(0)
      .setRestitution(0),
    body
  );
  const controller = world.createCharacterController(.025);
  controller.setSlideEnabled(true);
  controller.enableAutostep(
    PLAYER_CONFIG.microLipHeight,
    PLAYER_CONFIG.microLipMinimumWidth,
    false
  );
  controller.enableSnapToGround(.22);
  controller.setMaxSlopeClimbAngle(PLAYER_CONFIG.maxSlopeDegrees * Math.PI / 180);
  controller.setMinSlopeSlideAngle(PLAYER_CONFIG.slideSlopeDegrees * Math.PI / 180);

  walkthroughState.world = world;
  walkthroughState.terrainCollider = terrainCollider;
  walkthroughState.body = body;
  walkthroughState.collider = collider;
  walkthroughState.controller = controller;
  walkthroughState.capsuleShape = new RAPIER.Capsule(PLAYER_CONFIG.capsuleHalfHeight, PLAYER_CONFIG.radius);
  walkthroughState.horizontalVelocity.set(0, 0, 0);
  walkthroughState.verticalVelocity = 0;
  walkthroughState.grounded = false;
  walkthroughState.coyoteTimer = 0;
  walkthroughState.jumpBufferTimer = 0;
  walkthroughState.jumpQueued = false;
  walkthroughState.flyEye.copy(eyePosition);
}

function setWalkthroughFly(enabled, { silent = false } = {}) {
  const state = walkthroughState;
  if (!state.active || state.fly === Boolean(enabled)) return true;
  if (enabled) {
    state.flyEye.copy(currentWalkthroughEye());
    state.fly = true;
    state.horizontalVelocity.set(0, 0, 0);
    state.verticalVelocity = 0;
    state.keys.clear();
    if (!silent) setWalkthroughMessage('Fly mode: noclip enabled. WASD follows view, Q/E move down/up, Shift flies faster.');
    syncWalkthroughHud();
    updateWalkthroughCamera();
    return true;
  }

  const center = {
    x: state.flyEye.x,
    y: state.flyEye.y - walkthroughEyeOffset(),
    z: state.flyEye.z
  };
  if (walkthroughCapsuleBlockedAt(center)) {
    setWalkthroughMessage('Cannot switch to Walk here: the gameplay-size capsule overlaps terrain. Fly into open space first.');
    return false;
  }
  state.body.setTranslation(center, true);
  state.body.setNextKinematicTranslation(center);
  state.fly = false;
  state.horizontalVelocity.set(0, 0, 0);
  state.verticalVelocity = 0;
  state.grounded = false;
  state.keys.clear();
  if (!silent) setWalkthroughMessage('Walk mode: gameplay-size capsule, gravity, slopes and jump are active.');
  syncWalkthroughHud();
  updateWalkthroughCamera();
  return true;
}

function resetWalkthroughToEntry() {
  const state = walkthroughState;
  if (!state.active) return;
  state.yaw = state.entryYaw;
  state.pitch = state.entryPitch;
  state.horizontalVelocity.set(0, 0, 0);
  state.verticalVelocity = 0;
  state.grounded = false;
  state.coyoteTimer = 0;
  state.jumpBufferTimer = 0;
  state.jumpQueued = false;
  state.flyEye.copy(state.entryEye);
  const center = {
    x: state.entryEye.x,
    y: state.entryEye.y - walkthroughEyeOffset(),
    z: state.entryEye.z
  };
  if (state.fly || walkthroughCapsuleBlockedAt(center)) {
    state.fly = true;
  } else {
    state.body.setTranslation(center, true);
    state.body.setNextKinematicTranslation(center);
  }
  setWalkthroughMessage(state.fly
    ? 'Reset to walkthrough entry in Fly mode.'
    : 'Reset to walkthrough entry in Walk mode.');
  syncWalkthroughHud();
  updateWalkthroughCamera();
}

async function enterWalkthrough() {
  const state = walkthroughState;
  if (state.active || state.loading) return;
  state.loading = true;
  syncWalkthroughHud();
  setStatus('Loading walkthrough physics…');
  try {
    const RAPIER = await ensureWalkthroughRapier();
    const eye = cameraEntity.getPosition().clone();
    const forward = cameraState.target.clone().sub(eye);
    if (forward.lengthSq() < .0001) forward.set(0, 0, -1);
    else forward.normalize();
    const yaw = deg(Math.atan2(-forward.x, -forward.z));
    const pitch = deg(Math.asin(clamp(forward.y, -1, 1)));

    buildWalkthroughPhysics(RAPIER, eye);
    state.entryEye.copy(eye);
    state.entryYaw = yaw;
    state.entryPitch = pitch;
    state.yaw = yaw;
    state.pitch = clamp(pitch, -89, 89);
    state.active = true;
    state.fly = false;
    state.keys.clear();
    cameraKeys.clear();
    document.body.classList.add('walkthrough-active');

    const center = {
      x: eye.x,
      y: eye.y - walkthroughEyeOffset(),
      z: eye.z
    };
    if (walkthroughCapsuleBlockedAt(center)) {
      state.fly = true;
      state.flyEye.copy(eye);
      setWalkthroughMessage('Walkthrough started in Fly mode because the gameplay capsule overlaps terrain here. Fly into open cave space, then press F for Walk.');
    } else {
      setWalkthroughMessage('Walkthrough: Walk mode active. Click viewport if mouse-look is not locked. F toggles Fly; Esc exits.');
    }
    updateWalkthroughCamera();
    syncWalkthroughHud();
    canvas.requestPointerLock?.();
  } catch (error) {
    console.error(error);
    destroyWalkthroughPhysics();
    state.active = false;
    setStatus(`Walkthrough failed to start: ${error?.message || error}`);
  } finally {
    state.loading = false;
    syncWalkthroughHud();
  }
}

function exitWalkthrough() {
  const state = walkthroughState;
  if (!state.active) return;
  const eye = currentWalkthroughEye();
  const forward = walkthroughForward();
  state.active = false;
  state.fly = false;
  state.keys.clear();
  cameraKeys.clear();
  state.jumpQueued = false;
  document.body.classList.remove('walkthrough-active');
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();

  cameraState.yaw = state.yaw;
  cameraState.pitch = clamp(state.pitch, -89, 75);
  cameraState.distance = 4;
  cameraState.target.copy(eye).add(forward.mulScalar(cameraState.distance));
  destroyWalkthroughPhysics();
  syncWalkthroughHud();
  updateCamera();
  setStatus('Exited Walkthrough at the same cave location.');
}

function updateWalkthrough(dt) {
  const state = walkthroughState;
  if (!state.active) return;
  dt = Math.min(Math.max(Number(dt) || 0, 0), .05);
  if (!(dt > 0)) return;

  if (state.fly) {
    const forward = walkthroughForward();
    const { right } = walkthroughFlatAxes();
    const direction = new pc.Vec3();
    if (state.keys.has('KeyW')) direction.add(forward);
    if (state.keys.has('KeyS')) direction.sub(forward);
    if (state.keys.has('KeyD')) direction.add(right);
    if (state.keys.has('KeyA')) direction.sub(right);
    if (state.keys.has('KeyE') || state.keys.has('Space')) direction.y += 1;
    if (state.keys.has('KeyQ') || state.keys.has('ControlLeft') || state.keys.has('ControlRight')) direction.y -= 1;
    if (direction.lengthSq() > .0001) {
      direction.normalize();
      const base = Math.max(Number(PLAYER_CONFIG.sprintSpeed) || 6.5, Number(PLAYER_CONFIG.walkSpeed) || 4.2);
      const speed = base * (state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') ? 3.2 : 1.25);
      state.flyEye.add(direction.mulScalar(speed * dt));
    }
    updateWalkthroughCamera();
    syncWalkthroughHud();
    return;
  }

  const { forward, right } = walkthroughFlatAxes();
  let x = 0, z = 0;
  if (state.keys.has('KeyA')) x -= 1;
  if (state.keys.has('KeyD')) x += 1;
  if (state.keys.has('KeyW')) z += 1;
  if (state.keys.has('KeyS')) z -= 1;
  const inputLength = Math.hypot(x, z);
  const moveDirection = new pc.Vec3();
  if (inputLength > .001) {
    moveDirection.add(right.clone().mulScalar(x / Math.max(1, inputLength)))
      .add(forward.clone().mulScalar(z / Math.max(1, inputLength)));
    moveDirection.y = 0;
    if (moveDirection.lengthSq() > .0001) moveDirection.normalize();
  }

  if (state.jumpQueued) {
    state.jumpBufferTimer = Number(PLAYER_CONFIG.jumpBufferTime) || .12;
    state.jumpQueued = false;
  } else {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
  }
  if (state.grounded) state.coyoteTimer = Number(PLAYER_CONFIG.coyoteTime) || .1;
  else state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);

  const sprinting = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight');
  const targetSpeed = sprinting
    ? (Number(PLAYER_CONFIG.sprintSpeed) || 6.5)
    : (Number(PLAYER_CONFIG.walkSpeed) || 4.2);
  const accelerating = inputLength > .001;
  const acceleration = state.grounded
    ? (accelerating ? Number(PLAYER_CONFIG.groundAcceleration) || 32 : Number(PLAYER_CONFIG.groundDeceleration) || 38)
    : (accelerating ? Number(PLAYER_CONFIG.airAcceleration) || 8 : Number(PLAYER_CONFIG.airDeceleration) || 2.5);
  state.horizontalVelocity.x = moveTowardScalar(
    state.horizontalVelocity.x,
    moveDirection.x * (accelerating ? targetSpeed : 0),
    acceleration * dt
  );
  state.horizontalVelocity.z = moveTowardScalar(
    state.horizontalVelocity.z,
    moveDirection.z * (accelerating ? targetSpeed : 0),
    acceleration * dt
  );

  if (state.grounded && state.verticalVelocity < 0) {
    state.verticalVelocity = -1.8;
  } else {
    const gravity = Number(PLAYER_CONFIG.gravity) || 24;
    const terminal = Number(PLAYER_CONFIG.terminalVelocity) || 32;
    state.verticalVelocity = Math.max(-terminal, state.verticalVelocity - gravity * dt);
  }

  if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
    state.verticalVelocity = Number(PLAYER_CONFIG.jumpSpeed) || 7.2;
    state.jumpBufferTimer = 0;
    state.coyoteTimer = 0;
    state.grounded = false;
  }

  const desired = {
    x: state.horizontalVelocity.x * dt,
    y: state.verticalVelocity * dt,
    z: state.horizontalVelocity.z * dt
  };
  state.controller.computeColliderMovement(state.collider, desired);
  const movement = state.controller.computedMovement();
  const grounded = state.controller.computedGrounded();
  const current = state.body.translation();
  const next = {
    x: current.x + movement.x,
    y: current.y + movement.y,
    z: current.z + movement.z
  };
  state.body.setNextKinematicTranslation(next);
  state.world.timestep = dt;
  state.world.step();
  state.grounded = grounded;
  if (state.grounded && desired.y < 0 && movement.y > desired.y * .25) state.verticalVelocity = -1.8;

  updateWalkthroughCamera();
  syncWalkthroughHud();
}

function xrayCoreEnabled() {
  return Boolean($('#xray-core')?.checked);
}

function isMeshMode() {
  return Boolean(patch?.terrain?.bakedMesh?.positions?.length && patch?.terrain?.bakedMesh?.indices?.length);
}

function brushFalloff(distance, radius) {
  if (!(radius > 0) || distance >= radius) return 0;
  const t = clamp(1 - distance / radius, 0, 1);
  return t * t * (3 - 2 * t);
}

function brushOrganicRadius(hit, dx, dy, dz, radius) {
  // Make the footprint round on the clicked surface, but not mathematically perfect.
  // A small deterministic wobble keeps repeated sculpting from reading like a cookie cutter.
  const sourceNormal = hit?.editorNormal;
  let nx = Number(sourceNormal?.x) || 0, ny = Number(sourceNormal?.y) || 1, nz = Number(sourceNormal?.z) || 0;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  const rx = Math.abs(ny) < .9 ? 0 : 1;
  const ry = Math.abs(ny) < .9 ? 1 : 0;
  const rz = 0;
  let ux = ry * nz - rz * ny, uy = rz * nx - rx * nz, uz = rx * ny - ry * nx;
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  const u = dx * ux + dy * uy + dz * uz;
  const v = dx * vx + dy * vy + dz * vz;
  const angle = Math.atan2(v, u);
  const seed = Math.sin((hit.x * 12.9898) + (hit.y * 4.1414) + (hit.z * 78.233)) * 43758.5453;
  const phase = (seed - Math.floor(seed)) * Math.PI * 2;
  const wobble = Math.sin(angle * 5 + phase) * .055 + Math.sin(angle * 9 - phase * .7) * .025;
  return Math.max(radius * .82, radius * (1 + wobble));
}

function brushTangentDistance(hit, x, y, z, radius) {
  const sourceNormal = hit?.editorNormal;
  let nx = Number(sourceNormal?.x) || 0, ny = Number(sourceNormal?.y) || 1, nz = Number(sourceNormal?.z) || 0;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  const dx = x - hit.x, dy = y - hit.y, dz = z - hit.z;
  const normalDistance = dx * nx + dy * ny + dz * nz;
  const tx = dx - nx * normalDistance;
  const ty = dy - ny * normalDistance;
  const tz = dz - nz * normalDistance;
  return {
    distance: Math.hypot(tx, ty, tz),
    radius: brushOrganicRadius(hit, dx, dy, dz, radius)
  };
}

function applyTerrainDisplayMode() {
  const material = xrayCoreEnabled() ? materials.terrainXray : materials.terrain;
  for (const entity of terrainRoot.children) {
    if (!entity.render?.meshInstances) continue;
    for (const instance of entity.render.meshInstances) instance.material = material;
  }
}

function baseTerrainHeightWorld(x, z) {
  const dx = x - MOUNTAIN_CENTER.x;
  const dz = z - MOUNTAIN_CENTER.z;
  const radius = Math.hypot(dx, dz);
  if (radius > TERRAIN_OUTER_RADIUS) return null;
  const angle = (deg(Math.atan2(dz, dx)) + 360) % 360;
  if (radius < CROWN_BASE_RADIUS) {
    const t = clamp((CROWN_BASE_RADIUS - radius) / (CROWN_BASE_RADIUS - CROWN_TOP_RADIUS), 0, 1);
    const crown = CROWN_BASE_HEIGHT + (SUMMIT_HEIGHT - CROWN_BASE_HEIGHT) * Math.pow(t, 0.93);
    return radius <= CROWN_TOP_RADIUS ? SUMMIT_HEIGHT : crown;
  }
  return terrainHeightAt(angle, radius);
}

function editedTerrainHeightWorld(x, z) {
  const base = baseTerrainHeightWorld(x, z);
  if (!Number.isFinite(base)) return null;
  return applyTerrainPatchHeight(base, x, z, patch);
}

function tunnelFrame(tunnelRecord) {
  const tunnel = resolvedTunnel(tunnelRecord);
  const dx = tunnel.target.x - tunnel.entrance.x;
  const dz = tunnel.target.z - tunnel.entrance.z;
  const horizontal = Math.max(.001, Math.hypot(dx, dz));
  const inward = { x: dx / horizontal, z: dz / horizontal };
  const right = { x: inward.z, z: -inward.x };
  // v1.7 deliberately keeps the entrance simple: one small aperture plus a local
  // replacement/collar mesh. The core itself is no longer warped for every tunnel.
  const halfWidth = Math.max(1.0, tunnel.width * .5);
  const openingDepth = Math.max(.9, Math.min(1.8, tunnel.width * .34));
  const mouthDepth = Math.max(1.15, Math.min(2.4, tunnel.width * .48));
  const start = {
    x: tunnel.entrance.x + inward.x * mouthDepth,
    y: tunnel.entrance.y - .12,
    z: tunnel.entrance.z + inward.z * mouthDepth
  };
  return { tunnel, inward, right, horizontal, halfWidth, openingDepth, mouthDepth, start };
}

function deformTunnelCoreVertexWorld(x, y, z) {
  // v1.7: no global tunnel-driven terrain deformation. This was the source of the
  // canyon look and most of the editor slowdown. The overhang is a tiny local 3D mouth.
  return { x, y, z };
}

function pointInTriangleXZ(point, a, b, c) {
  const sign = (p1, p2, p3) => ((p1[0] - p3[0]) * (p2[2] - p3[2]) - (p2[0] - p3[0]) * (p1[2] - p3[2]));
  const d1 = sign(point, a, b);
  const d2 = sign(point, b, c);
  const d3 = sign(point, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function tunnelPortalContainsPoint(point, source) {
  const frame = tunnelFrame(source);
  const relX = point[0] - frame.tunnel.entrance.x;
  const relZ = point[2] - frame.tunnel.entrance.z;
  const inward = relX * frame.inward.x + relZ * frame.inward.z;
  const lateral = relX * frame.right.x + relZ * frame.right.z;
  // A deliberately tiny cut. The collar mesh covers the coarse triangles removed around it.
  return Math.abs(inward) <= frame.openingDepth && Math.abs(lateral) <= frame.halfWidth * .92;
}

function triangleIntersectsTunnelPortal(a, b, c) {
  if (!(patch.tunnels?.length)) return false;
  const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  const edgeMidpoints = [
    [(a[0] + b[0]) * .5, 0, (a[2] + b[2]) * .5],
    [(b[0] + c[0]) * .5, 0, (b[2] + c[2]) * .5],
    [(c[0] + a[0]) * .5, 0, (c[2] + a[2]) * .5]
  ];
  return patch.tunnels.some((source) => {
    if ([a, b, c, centroid, ...edgeMidpoints].some((point) => tunnelPortalContainsPoint(point, source))) return true;
    // If the small portal sits wholly inside one coarse terrain triangle, remove that triangle.
    const frame = tunnelFrame(source);
    const center = [frame.tunnel.entrance.x, 0, frame.tunnel.entrance.z];
    return pointInTriangleXZ(center, a, b, c);
  });
}

function manualPointIsCut(worldX, worldZ) {
  return (patch.terrain?.cuts ?? []).some((cut) => {
    const radius = Math.max(0, Number(cut.radius) || 0);
    return Math.hypot(worldX - Number(cut.x), worldZ - Number(cut.z)) <= radius;
  });
}

function buildHeightfieldTerrainData() {
  const positions = [];
  const sourcePositions = [];
  const indices = [];
  const ringOffsets = [];
  for (let ring = 0; ring <= TERRAIN_RINGS; ring += 1) {
    const t = ring / TERRAIN_RINGS;
    const radius = TERRAIN_OUTER_RADIUS - (TERRAIN_OUTER_RADIUS - CROWN_TOP_RADIUS) * t;
    ringOffsets.push(positions.length / 3);
    for (let segment = 0; segment < TERRAIN_SEGMENTS; segment += 1) {
      const angle = segment * 360 / TERRAIN_SEGMENTS;
      const r = rad(angle);
      const x = MOUNTAIN_CENTER.x + Math.cos(r) * radius;
      const z = MOUNTAIN_CENTER.z + Math.sin(r) * radius;
      const y = editedTerrainHeightWorld(x, z) ?? 0;
      sourcePositions.push(x, y, z);
      positions.push(x, y, z);
    }
  }

  for (let ring = 0; ring < TERRAIN_RINGS; ring += 1) {
    for (let segment = 0; segment < TERRAIN_SEGMENTS; segment += 1) {
      const next = (segment + 1) % TERRAIN_SEGMENTS;
      const a = ringOffsets[ring] + segment;
      const b = ringOffsets[ring + 1] + segment;
      const c = ringOffsets[ring] + next;
      const d = ringOffsets[ring + 1] + next;
      const pa = [sourcePositions[a * 3], sourcePositions[a * 3 + 1], sourcePositions[a * 3 + 2]];
      const pb = [sourcePositions[b * 3], sourcePositions[b * 3 + 1], sourcePositions[b * 3 + 2]];
      const pcv = [sourcePositions[c * 3], sourcePositions[c * 3 + 1], sourcePositions[c * 3 + 2]];
      const pd = [sourcePositions[d * 3], sourcePositions[d * 3 + 1], sourcePositions[d * 3 + 2]];
      const cut1 = triangleCutWorld(pa, pb, pcv);
      const cut2 = triangleCutWorld(pcv, pb, pd);
      if (!cut1) indices.push(a, b, c);
      if (!cut2) indices.push(c, b, d);
    }
  }
  return { positions, indices };
}

function terrainDataForRender() {
  if (isMeshMode()) return patch.terrain.bakedMesh;
  return buildHeightfieldTerrainData();
}

function calculateAreaWeightedNormals(positions, indices) {
  const normals = new Array(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const o of [a, b, c]) {
      normals[o] += nx; normals[o + 1] += ny; normals[o + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
  }
  return normals;
}

function rebuildTerrain() {
  destroyChildren(terrainRoot);
  const data = terrainDataForRender();
  currentTerrainData = data;
  const geometry = new pc.Geometry();
  geometry.positions = data.positions;
  geometry.indices = data.indices;
  // Use area-weighted normals. Pure local subdivision should not visibly change a broad
  // region merely because one old triangle became several coplanar triangles.
  geometry.normals = calculateAreaWeightedNormals(data.positions, data.indices);
  const mesh = pc.Mesh.fromGeometry(app.graphicsDevice, geometry);
  const entity = new pc.Entity(isMeshMode() ? 'Frozen 3D Mountain Mesh' : 'Editable Mountain');
  entity._editorOwnedMeshes = [mesh];
  entity.addComponent('render');
  entity.render.meshInstances = [new pc.MeshInstance(mesh, xrayCoreEnabled() ? materials.terrainXray : materials.terrain, entity)];
  terrainRoot.addChild(entity);

  rebuildWaterMeshes();
  rebuildTunnels();
  updatePlacedObjectHeights();
  rebuildSelectionHelper();
}

function triangleCutWorld(a, b, c) {
  const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  const manualCut = [a, b, c, centroid].some((p) => manualPointIsCut(p[0], p[2]));
  return manualCut || triangleIntersectsTunnelPortal(a, b, c);
}

const waterRecords = new Map();
function waterState(base) {
  const override = patch.fishingOverrides[base.id] ?? {};
  const angle = Number.isFinite(Number(override.angle)) ? Number(override.angle) : base.angle;
  const radius = Number.isFinite(Number(override.radius)) ? Number(override.radius) : base.radius;
  const radii = Array.isArray(override.radii)
    ? [Number(override.radii[0]) || base.radii?.[0] || 4, Number(override.radii[1]) || base.radii?.[1] || 4]
    : [base.radii?.[0] || 4, base.radii?.[1] || 4];
  const r = rad(angle);
  const x = MOUNTAIN_CENTER.x + Math.cos(r) * radius;
  const z = MOUNTAIN_CENTER.z + Math.sin(r) * radius;
  const originalBaseTerrain = base.offshore ? base.y : baseTerrainHeightWorld(
    MOUNTAIN_CENTER.x + Math.cos(rad(base.angle)) * base.radius,
    MOUNTAIN_CENTER.z + Math.sin(rad(base.angle)) * base.radius
  );
  const offset = Number.isFinite(base.y) && Number.isFinite(originalBaseTerrain) ? base.y - originalBaseTerrain : 0.15;
  const defaultY = base.offshore
    ? base.y
    : (editedTerrainHeightWorld(x, z) ?? base.y ?? 0) + offset;
  const y = Number.isFinite(Number(override.waterY)) ? Number(override.waterY) : defaultY;
  return { base, id: base.id, label: base.label, angle, radius, radii, x, y, z, offshore: base.offshore, cave: base.cave, waterfall: base.waterfall };
}

function rebuildWaterMeshes() {
  destroyChildren(waterRoot);
  destroyChildren(caveMarkerRoot);
  waterRecords.clear();
  if (!$('#show-waters').checked) return;
  const xray = xrayCoreEnabled();
  for (const base of MOUNTAIN_FISHING_LOCATIONS) {
    if (base.offshore) continue;
    const record = waterState(base);
    waterRecords.set(record.id, record);
    const isSelected = selected?.kind === 'water' && selected.id === record.id;
    const material = isSelected ? materials.waterSelected : (xray && record.cave ? materials.caveWaterXray : waterMaterialFor(record));
    const entity = createEllipseEntity(record, material);
    entity.editorRecord = record;
    waterRoot.addChild(entity);

    // In X-Ray mode, cave waters get a thin locator beacon up to the visible core surface.
    // This makes horizontally recessed cave pools easy to find without changing any patch data.
    if (xray && record.cave) {
      const surfaceY = editedTerrainHeightWorld(record.x, record.z);
      const topY = Math.max(record.y + 8, Number.isFinite(surfaceY) ? surfaceY + 8 : record.y + 24);
      const height = Math.max(4, topY - record.y);
      const beacon = new pc.Entity(`${record.label} cave locator`);
      addPrimitive(beacon, 'cylinder', materials.caveBeacon, [0, height * .5, 0], [.12, height * .5, .12]);
      addPrimitive(beacon, 'sphere', materials.caveBeacon, [0, height, 0], [.65, .65, .65]);
      beacon.setPosition(record.x, record.y + .08, record.z);
      caveMarkerRoot.addChild(beacon);
    }
  }
}

function createEllipseEntity(record, material) {
  const segments = 44;
  const positions = [0, 0, 0];
  const indices = [];
  for (let i = 0; i < segments; i += 1) {
    const a = i * Math.PI * 2 / segments;
    positions.push(Math.cos(a) * record.radii[0], 0, Math.sin(a) * record.radii[1]);
  }
  for (let i = 0; i < segments; i += 1) indices.push(0, ((i + 1) % segments) + 1, i + 1);
  const geometry = new pc.Geometry();
  geometry.positions = positions;
  geometry.indices = indices;
  geometry.calculateNormals();
  const mesh = pc.Mesh.fromGeometry(app.graphicsDevice, geometry);
  const entity = new pc.Entity(record.label);
  entity._editorOwnedMeshes = [mesh];
  entity.addComponent('render');
  entity.render.meshInstances = [new pc.MeshInstance(mesh, material, entity)];
  entity.setPosition(record.x, record.y + 0.05, record.z);
  return entity;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) * 0.5;
}

function waterCenterFloorY(record) {
  if (!record) return null;
  if (isMeshMode()) {
    const p = patch.terrain.bakedMesh.positions;
    const candidates = [];
    for (let i = 0; i < p.length; i += 3) {
      const dx = (p[i] - record.x) / Math.max(.2, record.radii[0]);
      const dz = (p[i + 2] - record.z) / Math.max(.2, record.radii[1]);
      const q = Math.hypot(dx, dz);
      const y = p[i + 1];
      // Only sample the central floor below the water plane. This deliberately ignores
      // cave roofs/overhangs sharing the same X/Z footprint.
      if (q <= .36 && y <= record.y + .2 && y >= record.y - 30) candidates.push(y);
    }
    return median(candidates);
  }
  const terrainY = editedTerrainHeightWorld(record.x, record.z);
  return Number.isFinite(terrainY) ? terrainY : null;
}

function waterDepthMeters(record) {
  const floorY = waterCenterFloorY(record);
  if (!Number.isFinite(floorY)) return null;
  return Math.max(0, record.y - floorY);
}

function setBakedWaterDepth(record, desiredDepth) {
  const mesh = patch?.terrain?.bakedMesh;
  if (!mesh || !record) return 0;
  const currentDepth = waterDepthMeters(record);
  if (!Number.isFinite(currentDepth)) return 0;
  const delta = desiredDepth - currentDepth;
  if (Math.abs(delta) < .001) return 0;
  let changed = 0;
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    const dx = (p[i] - record.x) / Math.max(.2, record.radii[0]);
    const dz = (p[i + 2] - record.z) / Math.max(.2, record.radii[1]);
    const q = Math.hypot(dx, dz);
    if (q >= 1.06) continue;
    const y = p[i + 1];
    // Never move roof/overhang vertices above the water plane; only reshape the submerged
    // basin/floor. The center moves fully and the shoreline fades to zero.
    if (y > record.y + .2 || y < record.y - 35) continue;
    const weight = 1 - smoothstep(.42, 1.04, q);
    if (weight <= 0) continue;
    p[i + 1] -= delta * weight;
    changed += 1;
  }
  mesh.editedAt = new Date().toISOString();
  return changed;
}

function resolvedTunnel(tunnel) {
  const entranceX = Number(tunnel?.entrance?.x) || 0;
  const entranceZ = Number(tunnel?.entrance?.z) || 0;
  const terrainY = editedTerrainHeightWorld(entranceX, entranceZ);
  const entrance = {
    x: entranceX,
    y: tunnel?.anchorEntranceToTerrain === false
      ? (Number(tunnel?.entrance?.y) || 0)
      : (Number.isFinite(terrainY) ? terrainY : Number(tunnel?.entrance?.y) || 0) + (Number(tunnel?.entranceHeightOffset) || -.28),
    z: entranceZ
  };
  const target = {
    x: Number(tunnel?.target?.x) || 0,
    y: Number(tunnel?.target?.y) || 0,
    z: Number(tunnel?.target?.z) || 0
  };
  return {
    ...tunnel,
    entrance,
    target,
    width: Math.max(1.8, Number(tunnel?.width) || 5),
    height: Math.max(2.1, Number(tunnel?.height) || 4),
    chamberFlare: Math.max(1, Number(tunnel?.chamberFlare) || 1.18)
  };
}

function tunnelProfile(tunnel, start, target, t) {
  const width = tunnel.width;
  const height = tunnel.height;
  const chamberFlare = tunnel.chamberFlare;
  const flare = 1 + (chamberFlare - 1) * Math.max(0, Math.min(1, (t - .64) / .36));
  const floor = {
    x: start.x + (target.x - start.x) * t,
    y: start.y + (target.y - start.y) * t,
    z: start.z + (target.z - start.z) * t
  };
  floor.y += Math.sin(t * Math.PI * 3.1) * Math.sin(t * Math.PI) * .12;
  return { floor, halfWidth: width * .5 * flare, height: height * (1 + (flare - 1) * .45) };
}

function tunnelMeshData(tunnelRecord) {
  const frame = tunnelFrame(tunnelRecord);
  const { tunnel, start } = frame;
  const target = tunnel.target;
  const dx = target.x - start.x;
  const dz = target.z - start.z;
  const horizontal = Math.max(.001, Math.hypot(dx, dz));
  const right = { x: dz / horizontal, z: -dx / horizontal };
  const inward = { x: dx / horizontal, z: dz / horizontal };

  // --- local recessed mouth / overhang collar ---
  // Outer arch is larger than the tiny terrain cut so it visually/collision-wise patches
  // the coarse removed triangles. Inner arch is recessed and becomes the tunnel start.
  const collarVertices = [];
  const collarTriangles = [];
  const archSides = 12;
  const outerHalf = tunnel.width * .92;
  const outerHeight = tunnel.height * 1.18;
  const innerHalf = tunnel.width * .5;
  const innerHeight = tunnel.height;
  const outerCenter = {
    x: tunnel.entrance.x - inward.x * .18,
    y: tunnel.entrance.y - .10,
    z: tunnel.entrance.z - inward.z * .18
  };
  const innerCenter = { ...start };

  for (let ring = 0; ring < 2; ring += 1) {
    const center = ring === 0 ? outerCenter : innerCenter;
    const half = ring === 0 ? outerHalf : innerHalf;
    const height = ring === 0 ? outerHeight : innerHeight;
    for (let side = 0; side <= archSides; side += 1) {
      const phase = side / archSides * Math.PI;
      const lateral = Math.cos(phase) * half;
      const shoulder = Math.pow(Math.sin(phase), .80);
      collarVertices.push([
        center.x + right.x * lateral,
        center.y + shoulder * height,
        center.z + right.z * lateral
      ]);
    }
  }
  const stride = archSides + 1;
  for (let side = 0; side < archSides; side += 1) {
    const a = side;
    const b = side + 1;
    const c = stride + side;
    const d = stride + side + 1;
    collarTriangles.push([a, c, b], [b, c, d]);
  }
  // Floor/lip closes the bottom of the collar while leaving the arched opening itself open.
  const outerRight = 0;
  const outerLeft = archSides;
  const innerRight = stride;
  const innerLeft = stride + archSides;
  collarTriangles.push([outerRight, innerRight, outerLeft], [outerLeft, innerRight, innerLeft]);

  // --- enclosed passage ---
  const stations = Math.max(7, Math.min(28, Math.round(horizontal / 3.0) + 2));
  const sides = 10;
  const shellVertices = [];
  const shellTriangles = [];
  for (let station = 0; station < stations; station += 1) {
    const t = station / Math.max(1, stations - 1);
    const profile = tunnelProfile(tunnel, start, target, t);
    for (let side = 0; side <= sides; side += 1) {
      const phase = side / sides * Math.PI;
      const lateral = Math.cos(phase) * profile.halfWidth;
      const shoulder = Math.pow(Math.sin(phase), .82);
      shellVertices.push([
        profile.floor.x + right.x * lateral,
        profile.floor.y + shoulder * profile.height,
        profile.floor.z + right.z * lateral
      ]);
    }
  }
  for (let station = 0; station < stations - 1; station += 1) {
    for (let side = 0; side < sides; side += 1) {
      const a = station * (sides + 1) + side;
      const b = a + 1;
      const c = (station + 1) * (sides + 1) + side;
      const d = c + 1;
      shellTriangles.push([a, c, b], [b, c, d]);
    }
  }
  const floorVertices = [];
  const floorTriangles = [];
  const columns = 5;
  for (let station = 0; station < stations; station += 1) {
    const t = station / Math.max(1, stations - 1);
    const profile = tunnelProfile(tunnel, start, target, t);
    for (let column = 0; column < columns; column += 1) {
      const side = -1 + column / Math.max(1, columns - 1) * 2;
      floorVertices.push([
        profile.floor.x + right.x * side * profile.halfWidth,
        profile.floor.y - (1 - Math.abs(side)) * .08,
        profile.floor.z + right.z * side * profile.halfWidth
      ]);
    }
  }
  for (let station = 0; station < stations - 1; station += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = station * columns + column;
      const b = a + 1;
      const c = (station + 1) * columns + column;
      const d = c + 1;
      floorTriangles.push([a, c, b], [b, c, d]);
    }
  }
  return { tunnel, frame, collarVertices, collarTriangles, shellVertices, shellTriangles, floorVertices, floorTriangles };
}

function makeTunnelMeshEntity(name, vertices, triangles, material, origin) {
  const geometry = new pc.Geometry();
  geometry.positions = [];
  geometry.indices = [];
  for (const triangle of triangles) {
    for (const index of triangle) {
      const v = vertices[index];
      geometry.positions.push(v[0] - origin.x, v[1] - origin.y, v[2] - origin.z);
      geometry.indices.push(geometry.indices.length);
    }
  }
  geometry.calculateNormals();
  const mesh = pc.Mesh.fromGeometry(app.graphicsDevice, geometry);
  const entity = new pc.Entity(name);
  entity._editorOwnedMeshes = [mesh];
  entity.addComponent('render');
  entity.render.meshInstances = [new pc.MeshInstance(mesh, material, entity)];
  return entity;
}

function rebuildTunnels() {
  destroyChildren(tunnelRoot);
  for (const source of patch.tunnels ?? []) {
    const data = tunnelMeshData(source);
    const { tunnel, collarVertices, collarTriangles, shellVertices, shellTriangles, floorVertices, floorTriangles } = data;
    const selectedTunnel = selected?.kind === 'tunnel' && selected.id === source.id;
    const root = new pc.Entity(source.name || source.id || 'Cave tunnel');
    root.setPosition(tunnel.entrance.x, tunnel.entrance.y, tunnel.entrance.z);
    const material = selectedTunnel ? materials.caveSelected : materials.cave;
    root.addChild(makeTunnelMeshEntity('Recessed cave mouth', collarVertices, collarTriangles, material, tunnel.entrance));
    root.addChild(makeTunnelMeshEntity('Tunnel shell', shellVertices, shellTriangles, material, tunnel.entrance));
    root.addChild(makeTunnelMeshEntity('Tunnel floor', floorVertices, floorTriangles, material, tunnel.entrance));
    root.editorRecord = source;
    root.editorSelectionRadius = Math.max(1.4, tunnel.width * .85);
    tunnelRoot.addChild(root);
  }
}

function caveWaterTargetOptions() {
  return MOUNTAIN_FISHING_LOCATIONS.filter((water) => water.cave && !water.offshore);
}

function tunnelTargetForWater(base, entrance) {
  const water = waterState(base);
  const dx = entrance.x - water.x;
  const dz = entrance.z - water.z;
  const distance = Math.max(.001, Math.hypot(dx, dz));
  const towardEntrance = { x: dx / distance, z: dz / distance };
  const edge = Math.max(water.radii?.[0] || 4, water.radii?.[1] || 4) + .8;
  return {
    x: water.x + towardEntrance.x * edge,
    y: water.y - .18,
    z: water.z + towardEntrance.z * edge
  };
}

function rebuildPlacedObjects() {
  destroyChildren(placedRoot);
  for (const item of patch.placedObjects) {
    const entity = createPlacedEntity(item, selected?.kind === 'placed' && selected.id === item.id);
    entity.editorRecord = item;
    placedRoot.addChild(entity);
  }
}

function createPlacedEntity(item, isSelected = false) {
  const material = isSelected ? materials.selected : item.type === 'rock' ? materials.rock : item.type === 'plant' ? materials.leaf : materials.decor;
  const root = new pc.Entity(item.name || item.id);
  root.setPosition(item.position.x, item.position.y, item.position.z);
  root.setEulerAngles(item.rotation?.x || 0, item.rotation?.y || 0, item.rotation?.z || 0);
  root.setLocalScale(item.scale?.x || 1, item.scale?.y || 1, item.scale?.z || 1);
  if (item.type === 'rock') {
    const shape = rockPrimitiveForKind(item.formKind);
    addPrimitive(root, shape, material, [0, 0, 0], [1, 1, 1]);
  } else if (item.type === 'plant') {
    buildPlantPreview(root, item.plantKind, material);
  } else {
    buildDecorPreview(root, item.decorKind, material);
  }
  return root;
}

function rockPrimitiveForKind(kind) {
  if (['spire', 'needle', 'tooth', 'fin'].includes(kind)) return 'cone';
  if (['column', 'knuckle', 'bulb'].includes(kind)) return 'cylinder';
  return 'box';
}

function buildPlantPreview(root, kind) {
  if (['pine', 'broadleaf', 'dead-tree'].includes(kind)) {
    addPrimitive(root, 'cylinder', materials.trunk, [0, 0.9, 0], [0.22, 1.8, 0.22]);
    if (kind === 'pine') {
      addPrimitive(root, 'cone', materials.darkGreen, [0, 2.2, 0], [1.05, 2.8, 1.05]);
    } else if (kind === 'broadleaf') {
      addPrimitive(root, 'sphere', materials.leaf, [0, 2.25, 0], [1.4, 1.1, 1.4]);
    } else {
      addPrimitive(root, 'cylinder', materials.trunk, [0.45, 1.7, 0], [0.08, 1.1, 0.08], [0, 0, 58]);
    }
    return;
  }
  if (kind === 'cattail' || kind === 'reed') {
    for (let i = -2; i <= 2; i += 1) {
      addPrimitive(root, 'cylinder', materials.grass, [i * 0.18, 0.7 + (i % 2) * .08, (i % 2) * .12], [0.04, 1.4, 0.04]);
      if (kind === 'cattail') addPrimitive(root, 'cylinder', materials.trunk, [i * 0.18, 1.48, (i % 2) * .12], [0.07, .24, .07]);
    }
    return;
  }
  if (kind === 'flower') {
    addPrimitive(root, 'cylinder', materials.grass, [0, .28, 0], [.04, .55, .04]);
    addPrimitive(root, 'sphere', materials.flower, [0, .62, 0], [.18, .12, .18]);
    return;
  }
  const scale = kind === 'tall-grass' ? 1.4 : kind === 'shrub' ? 1.15 : kind === 'alpine-scrub' ? .72 : .9;
  addPrimitive(root, kind === 'shrub' || kind === 'alpine-scrub' ? 'sphere' : 'cone', kind === 'alpine-scrub' ? materials.darkGreen : materials.leaf, [0, .45 * scale, 0], [0.8 * scale, .9 * scale, .8 * scale]);
}

function buildDecorPreview(root, kind) {
  if (kind === 'bench') {
    addPrimitive(root, 'box', materials.decor, [0, .55, 0], [2.2, .18, .55]);
    addPrimitive(root, 'box', materials.decor, [0, 1.0, .22], [2.2, .75, .16]);
    for (const x of [-.8, .8]) addPrimitive(root, 'box', materials.decor, [x, .25, 0], [.16, .5, .16]);
  } else if (kind === 'log') {
    addPrimitive(root, 'cylinder', materials.decor, [0, .45, 0], [.5, 2.5, .5], [0, 0, 90]);
  } else if (kind === 'sign') {
    addPrimitive(root, 'cylinder', materials.trunk, [0, .9, 0], [.12, 1.8, .12]);
    addPrimitive(root, 'box', materials.decor, [0, 1.55, 0], [1.25, .5, .1]);
  } else if (kind === 'lantern') {
    addPrimitive(root, 'cylinder', materials.trunk, [0, 1, 0], [.1, 2, .1]);
    addPrimitive(root, 'sphere', materials.selected, [0, 2.0, 0], [.24, .28, .24]);
  } else {
    addPrimitive(root, 'box', materials.decor, [0, .5, 0], [1, 1, 1]);
  }
}

function addPrimitive(parent, type, material, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const entity = new pc.Entity(type);
  entity.addComponent('render', { type });
  if (entity.render?.meshInstances) for (const instance of entity.render.meshInstances) instance.material = material;
  entity.setLocalPosition(...position);
  entity.setLocalScale(...scale);
  entity.setLocalEulerAngles(...rotation);
  parent.addChild(entity);
  return entity;
}

function rebuildSnapshotObjects() {
  destroyChildren(snapshotRoot);
  if (!$('#show-snapshot-rocks').checked) return;
  const all = [...(runtimeSnapshot.rocks || []), ...(runtimeSnapshot.objects || [])];
  const seen = new Set();
  for (const record of all) {
    const id = String(record.rockId || record.mapObjectId || record.debugId || record.id || '');
    if (!id || seen.has(id) || patch.hiddenObjectIds.includes(id)) continue;
    seen.add(id);
    const override = patch.objectOverrides[id] || {};
    const position = override.position || record.position;
    const scale = override.scale || record.size || record.scale || { x: 1, y: 1, z: 1 };
    if (!position) continue;
    const entity = new pc.Entity(record.name || id);
    entity.addComponent('render', { type: 'box' });
    if (entity.render?.meshInstances) for (const instance of entity.render.meshInstances) instance.material = selected?.kind === 'snapshot' && selected.id === id ? materials.selected : materials.snapshotRock;
    entity.setPosition(position.x, position.y, position.z);
    entity.setLocalScale(Math.max(.2, scale.x || 1), Math.max(.2, scale.y || 1), Math.max(.2, scale.z || 1));
    const rot = override.rotation || record.rotation || { x: 0, y: 0, z: 0 };
    entity.setEulerAngles(rot.x || 0, rot.y || 0, rot.z || 0);
    entity.editorRecord = { ...record, id, position, scale, rotation: rot };
    snapshotRoot.addChild(entity);
  }
}

function updatePlacedObjectHeights() {
  if (isMeshMode()) return;
  for (const item of patch.placedObjects) {
    if (item.anchorMode !== 'terrain') continue;
    const y = editedTerrainHeightWorld(item.position.x, item.position.z);
    if (Number.isFinite(y)) item.position.y = y + (Number(item.heightOffset) || 0);
  }
  rebuildPlacedObjects();
}

function releaseEditorOwnedMeshes(entity, seen = new Set()) {
  for (const child of entity.children ?? []) releaseEditorOwnedMeshes(child, seen);
  for (const mesh of entity._editorOwnedMeshes ?? []) {
    if (!mesh || seen.has(mesh)) continue;
    seen.add(mesh);
    try { mesh.destroy(); } catch {}
  }
  entity._editorOwnedMeshes = null;
}

function destroyChildren(root) {
  // Meshes created with Mesh.fromGeometry are not shared PlayCanvas primitive assets.
  // Explicitly release them before destroying their entities; repeated terrain/water/cave
  // rebuilds otherwise leave old GPU buffers around and can eventually lose the WebGL
  // context (black canvas / apparent editor restart) during a long sculpting session.
  for (const child of [...root.children]) {
    releaseEditorOwnedMeshes(child);
    child.destroy();
  }
}

function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${String(idCounter).padStart(6, '0')}`;
}

function historyPayload(source = patch) {
  const copy = clone(source);
  // Existing-rock snapshots can dwarf terrain edits. They are not part of Undo/Redo;
  // preserve the currently loaded snapshot across history restores instead.
  copy.bakedSnapshot = null;
  return JSON.stringify(copy);
}

function saveHistory() {
  if (suppressHistory) return;
  history.push(historyPayload());
  const limit = isMeshMode() ? 40 : 120;
  if (history.length > limit) history.shift();
  future = [];
}

function commit(mutator, { terrain = false, placed = false, snapshot = false, waters = false, history: recordHistory = true } = {}) {
  if (recordHistory) saveHistory();
  mutator();
  patch.updatedAt = new Date().toISOString();
  persistPatch();
  if (terrain) rebuildTerrain();
  else {
    if (waters) rebuildWaterMeshes();
    if (placed) rebuildPlacedObjects();
    if (snapshot) rebuildSnapshotObjects();
  }
  renderUi();
}

function restoreHistoryPayload(serialized) {
  const bakedSnapshot = patch.bakedSnapshot;
  patch = normalizePatch(JSON.parse(serialized));
  if (!patch.bakedSnapshot && bakedSnapshot) patch.bakedSnapshot = bakedSnapshot;
  runtimeSnapshot = clone(patch.bakedSnapshot ?? runtimeSnapshot ?? { objects: [], rocks: [] });
}

function undo() {
  if (!history.length) return;
  future.push(historyPayload());
  restoreHistoryPayload(history.pop());
  persistPatch();
  selected = null;
  syncSnapshotUi();
  rebuildAll();
}

function redo() {
  if (!future.length) return;
  history.push(historyPayload());
  restoreHistoryPayload(future.pop());
  persistPatch();
  selected = null;
  syncSnapshotUi();
  rebuildAll();
}

function loadLocalPatch() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizePatch(JSON.parse(raw)) : makeEmptyPatch();
  } catch {
    return makeEmptyPatch();
  }
}

let recoveryDbPromise = null;
let recoveryWriteQueued = false;
let recoveryWriteAgain = false;

function openRecoveryDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (recoveryDbPromise) return recoveryDbPromise;
  recoveryDbPromise = new Promise((resolve) => {
    let request;
    try { request = indexedDB.open(RECOVERY_DB_NAME, 1); }
    catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) db.createObjectStore(RECOVERY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return recoveryDbPromise;
}

async function writeRecoverySnapshot() {
  const db = await openRecoveryDb();
  if (!db) return false;
  const record = {
    savedAt: Date.now(),
    updatedAt: patch.updatedAt ?? null,
    patch: clone(patch)
  };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(RECOVERY_STORE, 'readwrite');
      tx.objectStore(RECOVERY_STORE).put(record, RECOVERY_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
}

function queueRecoverySnapshot() {
  // Coalesce rapid brush commits. IndexedDB can hold the now-large frozen 3D mesh even
  // after localStorage reaches its relatively small quota.
  if (recoveryWriteQueued) { recoveryWriteAgain = true; return; }
  recoveryWriteQueued = true;
  setTimeout(async () => {
    do {
      recoveryWriteAgain = false;
      await writeRecoverySnapshot();
    } while (recoveryWriteAgain);
    recoveryWriteQueued = false;
  }, 0);
}

async function readRecoverySnapshot() {
  const db = await openRecoveryDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(RECOVERY_STORE, 'readonly');
      const request = tx.objectStore(RECOVERY_STORE).get(RECOVERY_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

function patchTimestamp(value) {
  const time = Date.parse(value?.updatedAt ?? '');
  return Number.isFinite(time) ? time : 0;
}

async function recoverNewerAutosaveIfNeeded() {
  const record = await readRecoverySnapshot();
  if (!record?.patch) return false;
  const recovered = normalizePatch(record.patch);
  if (patchTimestamp(recovered) <= patchTimestamp(patch)) return false;
  patch = recovered;
  runtimeSnapshot = clone(patch.bakedSnapshot ?? { objects: [], rocks: [] });
  selected = null;
  syncSnapshotUi();
  rebuildAll();
  setStatus('Recovered a newer editor autosave after reload/context loss.');
  return true;
}

function persistPatch() {
  // Keep the original synchronous localStorage autosave for fast startup and backwards
  // compatibility, but do not rely on it alone: a heavily subdivided 3D mesh can exceed
  // localStorage quota. IndexedDB is the durable large-patch recovery copy.
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(patch)); }
  catch (error) {
    console.warn('Map Editor localStorage autosave is full; IndexedDB recovery remains active.', error);
  }
  queueRecoverySnapshot();
}

function checkpointPayload(source = patch) {
  // The baked runtime-rock snapshot can be very large. It is not needed to recover terrain
  // work, so leave it out of browser-local checkpoints and preserve the current one on restore.
  const copy = clone(source);
  copy.bakedSnapshot = null;
  return copy;
}

function saveManualCheckpoint() {
  try {
    const record = { savedAt: new Date().toISOString(), patch: checkpointPayload() };
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(record));
    setStatus(`Checkpoint saved at ${new Date(record.savedAt).toLocaleTimeString()}.`);
  } catch (error) {
    setStatus(`Could not save checkpoint: ${error?.message || error}`);
  }
}

function restoreManualCheckpoint() {
  let record = null;
  try { record = JSON.parse(localStorage.getItem(CHECKPOINT_KEY) || 'null'); } catch {}
  if (!record?.patch) { setStatus('No manual checkpoint is stored yet.'); return; }
  if (!confirm(`Restore the checkpoint from ${new Date(record.savedAt).toLocaleString()}? Current editor state will remain available through Undo.`)) return;
  saveHistory();
  const bakedSnapshot = patch.bakedSnapshot;
  patch = normalizePatch(record.patch);
  if (!patch.bakedSnapshot && bakedSnapshot) patch.bakedSnapshot = bakedSnapshot;
  runtimeSnapshot = clone(patch.bakedSnapshot ?? { objects: [], rocks: [] });
  selected = null;
  persistPatch();
  syncSnapshotUi();
  rebuildAll();
  setStatus('Checkpoint restored.');
}

async function reloadProjectPatch() {
  if (!confirm('Reload src/world/map-editor-patch.json from the project? This is useful if the file on disk still contains your pre-experiment terrain. Current editor state will remain available through Undo.')) return;
  try {
    const response = await fetch('../../src/world/map-editor-patch.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    saveHistory();
    patch = normalizePatch(data);
    runtimeSnapshot = clone(patch.bakedSnapshot ?? { objects: [], rocks: [] });
    selected = null;
    persistPatch();
    syncSnapshotUi();
    rebuildAll();
    setStatus('Reloaded project map-editor-patch.json.');
  } catch (error) {
    setStatus(`Could not reload project patch: ${error?.message || error}`);
  }
}

function rebuildAll() {
  rebuildTerrain();
  rebuildPlacedObjects();
  rebuildSnapshotObjects();
  rebuildTunnels();
  renderUi();
}

function pointerRay(event) {
  const rect = canvas.getBoundingClientRect();
  // PlayCanvas CameraComponent.screenToWorld expects coordinates in CSS/canvas element
  // pixels (0..offsetWidth / 0..offsetHeight), not drawing-buffer pixels. Multiplying by
  // canvas.width/rect.width caused the brush hit point to drift on HiDPI displays, browser
  // zoom, and some resized editor layouts.
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const near = cameraEntity.camera.screenToWorld(sx, sy, cameraEntity.camera.nearClip);
  const far = cameraEntity.camera.screenToWorld(sx, sy, cameraEntity.camera.farClip);
  return { origin: near.clone(), direction: far.clone().sub(near).normalize() };
}

function rayTerrainHit(event) {
  const ray = pointerRay(event);
  if (isMeshMode()) {
    const hit = rayBakedMeshHit(ray.origin, ray.direction);
    if (!hit) return null;
    hit.point.editorNormal = hit.normal;
    hit.point.editorTriangleOffset = hit.triangleOffset;
    return hit.point;
  }
  const maxDistance = 1500;
  const step = 4;
  let previousDelta = terrainDelta(ray.origin);
  for (let distance = step; distance <= maxDistance; distance += step) {
    const point = ray.origin.clone().add(ray.direction.clone().mulScalar(distance));
    const delta = terrainDelta(point);
    if (Number.isFinite(previousDelta) && Number.isFinite(delta) && previousDelta >= 0 && delta <= 0) {
      let low = distance - step;
      let high = distance;
      for (let i = 0; i < 12; i += 1) {
        const mid = (low + high) / 2;
        const sample = ray.origin.clone().add(ray.direction.clone().mulScalar(mid));
        const d = terrainDelta(sample);
        if (!Number.isFinite(d) || d > 0) low = mid; else high = mid;
      }
      return ray.origin.clone().add(ray.direction.clone().mulScalar((low + high) / 2));
    }
    previousDelta = delta;
  }
  return null;
}

function terrainDelta(point) {
  const height = editedTerrainHeightWorld(point.x, point.z);
  if (!Number.isFinite(height)) return NaN;
  return point.y - height;
}

function rayBakedMeshHit(origin, direction) {
  const mesh = patch?.terrain?.bakedMesh;
  if (!mesh) return null;
  const p = mesh.positions;
  const idx = mesh.indices;
  let best = null;
  for (let offset = 0; offset < idx.length; offset += 3) {
    const ia = idx[offset] * 3, ib = idx[offset + 1] * 3, ic = idx[offset + 2] * 3;
    const ax = p[ia], ay = p[ia + 1], az = p[ia + 2];
    const bx = p[ib], by = p[ib + 1], bz = p[ib + 2];
    const cx = p[ic], cy = p[ic + 1], cz = p[ic + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const px = direction.y * e2z - direction.z * e2y;
    const py = direction.z * e2x - direction.x * e2z;
    const pz = direction.x * e2y - direction.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-8) continue;
    const inv = 1 / det;
    const tx = origin.x - ax, ty = origin.y - ay, tz = origin.z - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (direction.x * qx + direction.y * qy + direction.z * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t < 0 || (best && t >= best.distance)) continue;
    const point = origin.clone().add(direction.clone().mulScalar(t));
    const normal = new pc.Vec3(
      e1y * e2z - e1z * e2y,
      e1z * e2x - e1x * e2z,
      e1x * e2y - e1y * e2x
    ).normalize();
    const expected = new pc.Vec3(
      point.x - MOUNTAIN_CENTER.x,
      Math.max(16, point.y * .28),
      point.z - MOUNTAIN_CENTER.z
    ).normalize();
    if (normal.dot(expected) < 0) normal.mulScalar(-1);
    best = { distance: t, point, normal, triangleOffset: offset };
  }
  return best;
}

let bakedAdjacencyCache = null;
function bakedMeshAdjacency(mesh) {
  const vertexCount = mesh.positions.length / 3;
  const signature = `${vertexCount}:${mesh.indices.length}`;
  if (bakedAdjacencyCache?.signature === signature) return bakedAdjacencyCache.adjacency;
  const adjacency = Array.from({ length: vertexCount }, () => new Set());
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i], b = mesh.indices[i + 1], c = mesh.indices[i + 2];
    adjacency[a].add(b); adjacency[a].add(c);
    adjacency[b].add(a); adjacency[b].add(c);
    adjacency[c].add(a); adjacency[c].add(b);
  }
  bakedAdjacencyCache = { signature, adjacency };
  return adjacency;
}

function triangleNormalAndMaxEdge(mesh, offset) {
  const p = mesh.positions, idx = mesh.indices;
  const a = idx[offset], b = idx[offset + 1], c = idx[offset + 2];
  const ao = a * 3, bo = b * 3, co = c * 3;
  const ax = p[ao], ay = p[ao + 1], az = p[ao + 2];
  const bx = p[bo], by = p[bo + 1], bz = p[bo + 2];
  const cx = p[co], cy = p[co + 1], cz = p[co + 2];
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  const ab = Math.hypot(bx - ax, by - ay, bz - az);
  const bc = Math.hypot(cx - bx, cy - by, cz - bz);
  const ca = Math.hypot(ax - cx, ay - cy, az - cz);
  return {
    a, b, c,
    centroid: [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
    normal: [nx, ny, nz],
    maxEdge: Math.max(ab, bc, ca)
  };
}

function nearestTriangleOffset(mesh, point) {
  let bestOffset = 0;
  let bestDistance = Infinity;
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const info = triangleNormalAndMaxEdge(mesh, offset);
    const dx = info.centroid[0] - point.x;
    const dy = info.centroid[1] - point.y;
    const dz = info.centroid[2] - point.z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < bestDistance) { bestDistance = distance; bestOffset = offset; }
  }
  return bestOffset;
}

function brushTargetEdge(radius) {
  return radius <= 1.5 ? .38
    : radius <= 4 ? Math.max(.55, radius * .24)
      : radius <= 12 ? Math.max(.95, radius * .24)
        : 2.8;
}

function insertBrushCenterVertex(mesh, hit, targetEdge) {
  const tri = hit?.editorTriangleOffset;
  if (!Number.isInteger(tri) || tri < 0 || tri + 2 >= mesh.indices.length) return null;
  const ids = [mesh.indices[tri], mesh.indices[tri + 1], mesh.indices[tri + 2]];
  let nearest = null;
  let nearestDistance = Infinity;
  for (const id of ids) {
    const o = id * 3;
    const d = Math.hypot(mesh.positions[o] - hit.x, mesh.positions[o + 1] - hit.y, mesh.positions[o + 2] - hit.z);
    if (d < nearestDistance) { nearestDistance = d; nearest = id; }
  }
  if (nearest != null && nearestDistance <= targetEdge * .34) {
    hit.editorCenterVertex = nearest;
    return nearest;
  }

  // Put one vertex exactly under the cursor. This guarantees a 1 m brush has a true center
  // without refining a several-meter halo just to find a nearby source-grid vertex.
  const center = mesh.positions.length / 3;
  mesh.positions.push(hit.x, hit.y, hit.z);
  const [a, b, c] = ids;
  mesh.indices.splice(tri, 3, a, b, center);
  mesh.indices.push(b, c, center, c, a, center);
  bakedAdjacencyCache = null;
  hit.editorCenterVertex = center;
  return center;
}

function vertexSurfaceDistances(mesh, seed, maxDistance) {
  const adjacency = bakedMeshAdjacency(mesh);
  const p = mesh.positions;
  const distances = new Map([[seed, 0]]);
  const queue = [[0, seed]];
  while (queue.length) {
    queue.sort((a, b) => b[0] - a[0]);
    const [distance, index] = queue.pop();
    if (distance !== distances.get(index) || distance > maxDistance) continue;
    const o = index * 3;
    for (const next of adjacency[index] || []) {
      const no = next * 3;
      const edge = Math.hypot(p[no] - p[o], p[no + 1] - p[o + 1], p[no + 2] - p[o + 2]);
      const nd = distance + edge;
      if (nd > maxDistance) continue;
      if (nd < (distances.get(next) ?? Infinity)) {
        distances.set(next, nd);
        queue.push([nd, next]);
      }
    }
  }
  return distances;
}

function refineBakedMeshForBrush(hit, radius) {
  const mesh = patch?.terrain?.bakedMesh;
  if (!mesh || !hit?.editorNormal) return false;

  const targetEdge = brushTargetEdge(radius);
  const maxPasses = radius <= 1.5 ? 3 : radius <= 4 ? 2 : 1;
  const centerVertex = insertBrushCenterVertex(mesh, hit, targetEdge);
  if (!Number.isInteger(centerVertex)) return false;
  let changed = true; // center insertion itself is a topology refinement when it happened.

  for (let pass = 0; pass < maxPasses; pass += 1) {
    // Follow the actual connected surface from the cursor. Do NOT search a fixed 4+ meter
    // world-space halo: that was the v1.11 source of apparently giant brush footprints.
    const refineLimit = radius + targetEdge * 1.35;
    const distances = vertexSurfaceDistances(mesh, centerVertex, refineLimit + targetEdge * 1.5);
    const splitEdges = new Set();
    const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
    const p = mesh.positions;

    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i], b = mesh.indices[i + 1], c = mesh.indices[i + 2];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const du = distances.get(u), dv = distances.get(v);
        if (du == null && dv == null) continue;
        if (Math.min(du ?? Infinity, dv ?? Infinity) > refineLimit) continue;
        const uo = u * 3, vo = v * 3;
        const edgeLength = Math.hypot(p[vo] - p[uo], p[vo + 1] - p[uo + 1], p[vo + 2] - p[uo + 2]);
        if (edgeLength > targetEdge * 1.28) splitEdges.add(edgeKey(u, v));
      }
    }
    if (!splitEdges.size) break;

    // Split shared EDGES, not selected triangles. Every triangle touching a split edge is
    // retriangulated with that same midpoint, so there are no T-junction cracks or stray
    // black slivers around a tiny brush.
    const midpointCache = new Map();
    const midpoint = (a, b) => {
      const key = edgeKey(a, b);
      if (midpointCache.has(key)) return midpointCache.get(key);
      const ao = a * 3, bo = b * 3;
      const index = mesh.positions.length / 3;
      mesh.positions.push(
        (mesh.positions[ao] + mesh.positions[bo]) * .5,
        (mesh.positions[ao + 1] + mesh.positions[bo + 1]) * .5,
        (mesh.positions[ao + 2] + mesh.positions[bo + 2]) * .5
      );
      midpointCache.set(key, index);
      return index;
    };

    const old = mesh.indices;
    const next = [];
    for (let i = 0; i < old.length; i += 3) {
      const a = old[i], b = old[i + 1], c = old[i + 2];
      const sab = splitEdges.has(edgeKey(a, b));
      const sbc = splitEdges.has(edgeKey(b, c));
      const sca = splitEdges.has(edgeKey(c, a));
      const mask = (sab ? 1 : 0) | (sbc ? 2 : 0) | (sca ? 4 : 0);
      if (!mask) { next.push(a, b, c); continue; }
      const ab = sab ? midpoint(a, b) : null;
      const bc = sbc ? midpoint(b, c) : null;
      const ca = sca ? midpoint(c, a) : null;
      if (mask === 1) next.push(a, ab, c, ab, b, c);
      else if (mask === 2) next.push(a, b, bc, a, bc, c);
      else if (mask === 4) next.push(a, b, ca, ca, b, c);
      else if (mask === 3) next.push(a, ab, c, ab, bc, c, ab, b, bc);
      else if (mask === 5) next.push(a, ab, ca, ab, b, c, ab, c, ca);
      else if (mask === 6) next.push(a, b, ca, b, bc, ca, bc, c, ca);
      else next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    mesh.indices = next;
    bakedAdjacencyCache = null;
    changed = true;
  }

  hit.editorTriangleOffset = nearestTriangleOffset(mesh, hit);
  const info = triangleNormalAndMaxEdge(mesh, hit.editorTriangleOffset);
  let nx = info.normal[0], ny = info.normal[1], nz = info.normal[2];
  const expected = new pc.Vec3(hit.x - MOUNTAIN_CENTER.x, Math.max(16, hit.y * .28), hit.z - MOUNTAIN_CENTER.z).normalize();
  if (nx * expected.x + ny * expected.y + nz * expected.z < 0) { nx *= -1; ny *= -1; nz *= -1; }
  hit.editorNormal = new pc.Vec3(nx, ny, nz);
  mesh.editedAt = new Date().toISOString();
  return changed;
}

function bakedBrushNeighborhood(hit, radius) {
  const mesh = patch?.terrain?.bakedMesh;
  if (!mesh || !Number.isInteger(hit?.editorCenterVertex)) return null;
  const p = mesh.positions;
  const adjacency = bakedMeshAdjacency(mesh);
  const distances = vertexSurfaceDistances(mesh, hit.editorCenterVertex, radius * 1.18 + brushTargetEdge(radius));
  const affected = [];
  for (const [index, surfaceDistance] of distances.entries()) {
    const o = index * 3;
    const dx = p[o] - hit.x, dy = p[o + 1] - hit.y, dz = p[o + 2] - hit.z;
    const localRadius = brushOrganicRadius(hit, dx, dy, dz, radius);
    if (surfaceDistance < localRadius) affected.push([index, surfaceDistance, localRadius]);
  }
  return { mesh, positions: p, adjacency, affected };
}

function sculptBakedMesh(hit, signedDistance, radius) {
  refineBakedMeshForBrush(hit, radius);
  const brush = bakedBrushNeighborhood(hit, radius);
  if (!brush || !hit?.editorNormal) return 0;
  const normal = hit.editorNormal.clone().normalize();
  let changed = 0;
  for (const [index, distance, localRadius] of brush.affected) {
    const weight = brushFalloff(distance, localRadius);
    if (weight <= 0) continue;
    const move = signedDistance * weight;
    const o = index * 3;
    brush.positions[o] += normal.x * move;
    brush.positions[o + 1] += normal.y * move;
    brush.positions[o + 2] += normal.z * move;
    changed += 1;
  }
  brush.mesh.editedAt = new Date().toISOString();
  return changed;
}

function raiseLowerBakedMesh(hit, signedDistance, radius) {
  refineBakedMeshForBrush(hit, radius);
  const brush = bakedBrushNeighborhood(hit, radius);
  if (!brush) return 0;
  let changed = 0;
  for (const [index, distance, localRadius] of brush.affected) {
    const weight = brushFalloff(distance, localRadius);
    if (weight <= 0) continue;
    // Raise/Lower means WORLD-VERTICAL movement. Do not reuse Pull Core Out's face-normal
    // movement: on a sloping/curved mountain that adds sideways displacement and can create
    // the donut/ring flare the old mesh workflow produced.
    brush.positions[index * 3 + 1] += signedDistance * weight;
    changed += 1;
  }
  brush.mesh.editedAt = new Date().toISOString();
  return changed;
}

function smoothBakedMesh(hit, radius, strength) {
  refineBakedMeshForBrush(hit, radius);
  const brush = bakedBrushNeighborhood(hit, radius);
  if (!brush) return 0;
  const source = brush.positions.slice();
  // The common brush slider is in a meter-ish range for sculpting. Convert it to a safe
  // smoothing blend rather than interpreting it as meters. Default 2 => ~16% smoothing.
  const baseBlend = clamp(Number(strength) * .08, .02, .55);
  let changed = 0;
  for (const [index, distance, localRadius] of brush.affected) {
    const neighbors = [...(brush.adjacency[index] || [])];
    if (neighbors.length < 2) continue;
    let ax = 0, ay = 0, az = 0;
    for (const next of neighbors) {
      const o = next * 3;
      ax += source[o]; ay += source[o + 1]; az += source[o + 2];
    }
    ax /= neighbors.length; ay /= neighbors.length; az /= neighbors.length;
    const o = index * 3;
    const blend = baseBlend * brushFalloff(distance, localRadius);
    if (blend <= 0) continue;
    brush.positions[o] = source[o] + (ax - source[o]) * blend;
    brush.positions[o + 1] = source[o + 1] + (ay - source[o + 1]) * blend;
    brush.positions[o + 2] = source[o + 2] + (az - source[o + 2]) * blend;
    changed += 1;
  }
  brush.mesh.editedAt = new Date().toISOString();
  return changed;
}


function caveEndpointFromHit(hit) {
  const mesh = patch?.terrain?.bakedMesh;
  const tri = Number(hit?.editorTriangleOffset);
  const ids = mesh && Number.isInteger(tri) && tri >= 0 && tri + 2 < mesh.indices.length
    ? [mesh.indices[tri], mesh.indices[tri + 1], mesh.indices[tri + 2]]
    : [];
  const normal = hit?.editorNormal ?? new pc.Vec3(0, 1, 0);
  return {
    point: { x: Number(hit.x), y: Number(hit.y), z: Number(hit.z) },
    normal: { x: Number(normal.x) || 0, y: Number(normal.y) || 1, z: Number(normal.z) || 0 },
    triangleVertexIds: ids
  };
}

function findTriangleByVertexIds(mesh, ids) {
  if (!mesh || !Array.isArray(ids) || ids.length !== 3) return -1;
  const target = [...ids].sort((a, b) => a - b).join(':');
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const key = [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]].sort((a, b) => a - b).join(':');
    if (key === target) return offset;
  }
  return -1;
}

function resolveCaveEndpointHit(mesh, endpoint) {
  const point = endpoint?.point;
  if (!point) return null;
  let triangleOffset = findTriangleByVertexIds(mesh, endpoint.triangleVertexIds);
  if (triangleOffset < 0) triangleOffset = nearestTriangleOffset(mesh, point);
  const info = triangleNormalAndMaxEdge(mesh, triangleOffset);
  let nx = Number(endpoint?.normal?.x), ny = Number(endpoint?.normal?.y), nz = Number(endpoint?.normal?.z);
  if (![nx, ny, nz].every(Number.isFinite) || Math.hypot(nx, ny, nz) < .001) {
    [nx, ny, nz] = info.normal;
  }
  const length = Math.hypot(nx, ny, nz) || 1;
  return {
    x: Number(point.x), y: Number(point.y), z: Number(point.z),
    editorTriangleOffset: triangleOffset,
    editorNormal: new pc.Vec3(nx / length, ny / length, nz / length)
  };
}

function caveOpeningTriangles(mesh, hit, radius) {
  if (!Number.isInteger(hit?.editorCenterVertex)) return new Set();
  const maxDistance = radius * 1.15 + brushTargetEdge(radius) * 1.2;
  const distances = vertexSurfaceDistances(mesh, hit.editorCenterVertex, maxDistance);
  const removed = new Set();
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const a = mesh.indices[offset], b = mesh.indices[offset + 1], c = mesh.indices[offset + 2];
    const da = distances.get(a), db = distances.get(b), dc = distances.get(c);
    if (da == null || db == null || dc == null) continue;
    const average = (da + db + dc) / 3;
    const furthest = Math.max(da, db, dc);
    // A slightly organic geodesic disk. Requiring all three corners to belong to the local
    // connected patch prevents the operation from eating the opposite cave wall merely
    // because that wall is close in world space.
    if (average <= radius * .79 && furthest <= radius * 1.02) removed.add(offset);
  }
  return removed;
}

function boundaryLoopsForRemovedTriangles(mesh, removed) {
  const edgeMap = new Map();
  const keyFor = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const a = mesh.indices[offset], b = mesh.indices[offset + 1], c = mesh.indices[offset + 2];
    const isRemoved = removed.has(offset);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = keyFor(u, v);
      let record = edgeMap.get(key);
      if (!record) {
        record = { a: Math.min(u, v), b: Math.max(u, v), removed: 0, kept: 0 };
        edgeMap.set(key, record);
      }
      if (isRemoved) record.removed += 1;
      else record.kept += 1;
    }
  }

  const boundaryEdges = [...edgeMap.values()].filter((edge) => edge.removed > 0 && edge.kept > 0);
  const adjacency = new Map();
  const add = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a).push(b);
  };
  for (const edge of boundaryEdges) { add(edge.a, edge.b); add(edge.b, edge.a); }

  const used = new Set();
  const loops = [];
  for (const edge of boundaryEdges) {
    const initialKey = keyFor(edge.a, edge.b);
    if (used.has(initialKey)) continue;
    const start = edge.a;
    let previous = edge.a;
    let current = edge.b;
    const loop = [start];
    used.add(initialKey);
    let guard = 0;
    while (guard++ < boundaryEdges.length + 4) {
      if (current === start) break;
      loop.push(current);
      const candidates = (adjacency.get(current) || []).filter((next) => next !== previous);
      if (!candidates.length) break;
      let next = candidates.find((candidate) => !used.has(keyFor(current, candidate)));
      if (next == null) next = candidates[0];
      used.add(keyFor(current, next));
      previous = current;
      current = next;
    }
    if (current === start && loop.length >= 5) loops.push(loop);
  }
  return loops;
}

function loopCentroid(mesh, loop) {
  const p = mesh.positions;
  let x = 0, y = 0, z = 0;
  for (const index of loop) {
    const o = index * 3;
    x += p[o]; y += p[o + 1]; z += p[o + 2];
  }
  const count = Math.max(1, loop.length);
  return { x: x / count, y: y / count, z: z / count };
}

function chooseBoundaryLoop(mesh, loops, point) {
  let best = null;
  for (const loop of loops) {
    const center = loopCentroid(mesh, loop);
    const distance = Math.hypot(center.x - point.x, center.y - point.y, center.z - point.z);
    if (!best || distance < best.distance) best = { loop, center, distance };
  }
  return best;
}

function rotateLoop(loop, offset) {
  return [...loop.slice(offset), ...loop.slice(0, offset)];
}

function alignBridgeLoops(mesh, sourceLoop, targetLoop) {
  const p = mesh.positions;
  let bestA = 0, bestB = 0, bestDistance = Infinity;
  for (let i = 0; i < sourceLoop.length; i += 1) {
    const ao = sourceLoop[i] * 3;
    for (let j = 0; j < targetLoop.length; j += 1) {
      const bo = targetLoop[j] * 3;
      const d = (p[ao] - p[bo]) ** 2 + (p[ao + 1] - p[bo + 1]) ** 2 + (p[ao + 2] - p[bo + 2]) ** 2;
      if (d < bestDistance) { bestDistance = d; bestA = i; bestB = j; }
    }
  }
  const a = rotateLoop(sourceLoop, bestA);
  let b = rotateLoop(targetLoop, bestB);

  const correspondenceCost = (left, right) => {
    const samples = Math.max(12, Math.min(48, Math.max(left.length, right.length)));
    let cost = 0;
    for (let k = 0; k < samples; k += 1) {
      const li = left[Math.floor(k * left.length / samples) % left.length] * 3;
      const ri = right[Math.floor(k * right.length / samples) % right.length] * 3;
      cost += (p[li] - p[ri]) ** 2 + (p[li + 1] - p[ri + 1]) ** 2 + (p[li + 2] - p[ri + 2]) ** 2;
    }
    return cost;
  };
  const reversed = [b[0], ...b.slice(1).reverse()];
  if (correspondenceCost(a, reversed) < correspondenceCost(a, b)) b = reversed;
  return [a, b];
}

function appendLoopBridge(indices, sourceLoop, targetLoop) {
  const aCount = sourceLoop.length;
  const bCount = targetLoop.length;
  let i = 0, j = 0;
  const epsilon = 1e-7;
  while (i < aCount || j < bCount) {
    const a0 = sourceLoop[i % aCount];
    const b0 = targetLoop[j % bCount];
    const nextA = i < aCount ? (i + 1) / aCount : Infinity;
    const nextB = j < bCount ? (j + 1) / bCount : Infinity;
    if (nextA < nextB - epsilon) {
      const a1 = sourceLoop[(i + 1) % aCount];
      indices.push(a0, b0, a1);
      i += 1;
    } else if (nextB < nextA - epsilon) {
      const b1 = targetLoop[(j + 1) % bCount];
      indices.push(a0, b0, b1);
      j += 1;
    } else {
      const a1 = sourceLoop[(i + 1) % aCount];
      const b1 = targetLoop[(j + 1) % bCount];
      indices.push(a0, b0, a1, a1, b0, b1);
      i += 1;
      j += 1;
    }
  }
}

function connectCaveSurfaces(startEndpoint, endEndpoint, requestedRadius) {
  const original = patch?.terrain?.bakedMesh;
  if (!original) return { ok: false, message: 'Freeze the core to 3D Mesh mode first.' };
  const radius = clamp(Number(requestedRadius) || 2, .75, 6);
  const straightDistance = Math.hypot(
    endEndpoint.point.x - startEndpoint.point.x,
    endEndpoint.point.y - startEndpoint.point.y,
    endEndpoint.point.z - startEndpoint.point.z
  );
  const maxBridge = Math.min(20, Math.max(5, radius * 5));
  if (straightDistance < .35) return { ok: false, message: 'Those two cave surfaces are essentially the same point. Click the opposite tunnel end.' };
  if (straightDistance > maxBridge) {
    return { ok: false, message: `The cave ends are ${straightDistance.toFixed(1)} m apart. Indent them closer first (about ${maxBridge.toFixed(0)} m max for this radius), then connect.` };
  }

  // Work on a private copy. A failed topology operation must leave the authored mountain
  // completely untouched rather than half-refined or half-cut.
  const work = {
    ...original,
    positions: original.positions.slice(),
    indices: original.indices.slice()
  };
  const savedMesh = patch.terrain.bakedMesh;
  patch.terrain.bakedMesh = work;
  bakedAdjacencyCache = null;
  try {
    let startHit = resolveCaveEndpointHit(work, startEndpoint);
    let endHit = resolveCaveEndpointHit(work, endEndpoint);
    if (!startHit || !endHit) throw new Error('Could not resolve one of the selected surfaces.');

    refineBakedMeshForBrush(startHit, radius);
    // Refining the first opening changes triangle offsets globally. Resolve the second endpoint
    // again by its stable triangle vertex IDs/world point before refining it.
    endHit = resolveCaveEndpointHit(work, endEndpoint);
    refineBakedMeshForBrush(endHit, radius);

    // The two sides should be nearby in 3D but far apart along the existing surface. If they are
    // already neighbors on the same local patch, this tool would make a slot rather than join two
    // tunnel ends, so reject it.
    const localDistances = vertexSurfaceDistances(work, startHit.editorCenterVertex, radius * 2.4);
    if (localDistances.has(endHit.editorCenterVertex)) {
      throw new Error('Those clicks are on the same local surface patch. Use Indent/Pull there; Cave Connect is for two separate tunnel ends across a thin wall.');
    }

    const startRemoved = caveOpeningTriangles(work, startHit, radius);
    const endRemoved = caveOpeningTriangles(work, endHit, radius);
    if (startRemoved.size < 4 || endRemoved.size < 4) {
      throw new Error('Not enough local mesh detail to form both openings. Try a slightly larger radius or click a flatter part of each tunnel end.');
    }
    for (const offset of startRemoved) {
      if (endRemoved.has(offset)) throw new Error('The two openings overlap. Use a smaller radius or move the tunnel ends a little farther apart.');
    }

    const startChoice = chooseBoundaryLoop(work, boundaryLoopsForRemovedTriangles(work, startRemoved), startEndpoint.point);
    const endChoice = chooseBoundaryLoop(work, boundaryLoopsForRemovedTriangles(work, endRemoved), endEndpoint.point);
    if (!startChoice?.loop?.length || !endChoice?.loop?.length) {
      throw new Error('Could not find a clean closed boundary around one opening. Undo nearby extreme sculpting or Smooth the dead-end faces, then try again.');
    }
    if (startChoice.loop.length < 5 || endChoice.loop.length < 5) {
      throw new Error('One opening is too coarse to stitch safely. Increase the radius slightly and try again.');
    }
    const shared = new Set(startChoice.loop);
    if (endChoice.loop.some((index) => shared.has(index))) {
      throw new Error('The two opening boundaries already touch. Use a smaller radius or a tiny Indent before connecting.');
    }

    const removeAll = new Set([...startRemoved, ...endRemoved]);
    const kept = [];
    for (let offset = 0; offset < work.indices.length; offset += 3) {
      if (!removeAll.has(offset)) kept.push(work.indices[offset], work.indices[offset + 1], work.indices[offset + 2]);
    }
    const [sourceLoop, targetLoop] = alignBridgeLoops(work, startChoice.loop, endChoice.loop);
    appendLoopBridge(kept, sourceLoop, targetLoop);
    work.indices = kept;
    work.editedAt = new Date().toISOString();
    work.topologyEditedAt = work.editedAt;
    patch.terrain.bakedMesh = work;
    bakedAdjacencyCache = null;
    return {
      ok: true,
      radius,
      distance: straightDistance,
      sourceVertices: sourceLoop.length,
      targetVertices: targetLoop.length
    };
  } catch (error) {
    patch.terrain.bakedMesh = savedMesh;
    bakedAdjacencyCache = null;
    return { ok: false, message: error?.message || String(error) };
  }
}

function commitCaveConnection(startEndpoint, endEndpoint, radius) {
  const before = historyPayload();
  const result = connectCaveSurfaces(startEndpoint, endEndpoint, radius);
  if (!result.ok) return result;
  history.push(before);
  const limit = isMeshMode() ? 40 : 120;
  if (history.length > limit) history.shift();
  future = [];
  patch.updatedAt = new Date().toISOString();
  persistPatch();
  rebuildTerrain();
  renderUi();
  return result;
}

function selectionFromClick(event) {
  const ray = pointerRay(event);
  let best = null;
  for (const entity of tunnelRoot.children) {
    const record = entity.editorRecord;
    if (!record) continue;
    const position = entity.getPosition();
    const radius = entity.editorSelectionRadius || 2.5;
    const hitDistance = raySphereDistance(ray.origin, ray.direction, position, radius);
    if (hitDistance != null && (!best || hitDistance < best.distance)) {
      best = { distance: hitDistance, kind: 'tunnel', id: record.id, record };
    }
  }
  for (const entity of [...placedRoot.children, ...snapshotRoot.children]) {
    const record = entity.editorRecord;
    if (!record) continue;
    const position = entity.getPosition();
    const scale = entity.getLocalScale();
    const radius = Math.max(.6, Math.hypot(scale.x, scale.y, scale.z) * .55);
    const hitDistance = raySphereDistance(ray.origin, ray.direction, position, radius);
    if (hitDistance != null && (!best || hitDistance < best.distance)) {
      best = { distance: hitDistance, kind: placedRoot.children.includes(entity) ? 'placed' : 'snapshot', id: record.id, record };
    }
  }
  if (best) return best;

  const terrainHit = rayTerrainHit(event);
  if (terrainHit) {
    let nearest = null;
    for (const water of waterRecords.values()) {
      const dx = (terrainHit.x - water.x) / Math.max(.1, water.radii[0]);
      const dz = (terrainHit.z - water.z) / Math.max(.1, water.radii[1]);
      const score = Math.hypot(dx, dz);
      if (score <= 1.35 && (!nearest || score < nearest.score)) nearest = { score, water };
    }
    if (nearest) return { kind: 'water', id: nearest.water.id, record: nearest.water };
  }
  return null;
}

function raySphereDistance(origin, direction, center, radius) {
  const oc = origin.clone().sub(center);
  const b = oc.dot(direction);
  const c = oc.dot(oc) - radius * radius;
  const h = b * b - c;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : null;
}

function applyToolAt(event, continuous = false) {
  if (tool === 'select') {
    selected = selectionFromClick(event);
    rebuildPlacedObjects();
    rebuildSnapshotObjects();
    rebuildWaterMeshes();
    rebuildTunnels();
    renderUi();
    return;
  }
  if (tool === 'move-water') {
    if (selected?.kind !== 'water') {
      selected = selectionFromClick(event);
      renderUi();
      return;
    }
    const hit = rayTerrainHit(event);
    if (!hit) return;
    const dx = hit.x - MOUNTAIN_CENTER.x;
    const dz = hit.z - MOUNTAIN_CENTER.z;
    const angle = (deg(Math.atan2(dz, dx)) + 360) % 360;
    const radius = Math.hypot(dx, dz);
    commit(() => {
      const existing = patch.fishingOverrides[selected.id] || {};
      patch.fishingOverrides[selected.id] = { ...existing, angle, radius };
      selected.record = waterState(MOUNTAIN_FISHING_LOCATIONS.find((item) => item.id === selected.id));
    }, { terrain: true });
    return;
  }

  const hit = rayTerrainHit(event);
  if (!hit) return;
  if (continuous && lastBrushPoint && hit.clone().sub(lastBrushPoint).length() < 1.2) return;
  lastBrushPoint = hit.clone();

  const radius = Number($('#brush-radius').value) || 8;
  const strength = Number($('#brush-strength').value) || 2;
  if (tool === 'connect-cave') {
    if (!isMeshMode()) { setStatus('Cave Connect is available after Freeze Core to 3D Mesh.'); return; }
    const connectRadius = clamp(radius, .75, 6);
    if (!caveConnectStart) {
      caveConnectStart = caveEndpointFromHit(hit);
      rebuildSelectionHelper();
      setStatus(`Cave Connect: first tunnel end marked. Click the OTHER tunnel end to open and weld them together. Opening radius ${connectRadius.toFixed(2)} m${radius > 6 ? ' (capped at 6 m for topology safety)' : ''}. Esc cancels.`);
      return;
    }
    const end = caveEndpointFromHit(hit);
    const result = commitCaveConnection(caveConnectStart, end, connectRadius);
    if (result.ok) {
      caveConnectStart = null;
      rebuildSelectionHelper();
      setStatus(`Cave loop connected: ${result.distance.toFixed(1)} m bridge, ${result.radius.toFixed(2)} m opening radius. This is one welded terrain mesh, not a separate tunnel object.`);
    } else {
      setStatus(`Cave Connect did not change the mountain: ${result.message}`);
    }
    return;
  }
  if (tool === 'raise' || tool === 'lower') {
    const deltaMeters = tool === 'raise' ? strength : -strength;
    if (isMeshMode()) {
      commit(() => raiseLowerBakedMesh(hit, deltaMeters, radius), { terrain: true, history: !activeBrushTransaction });
      setStatus(tool === 'raise'
        ? '3D Raise: connected surface patch moved straight up in world Y.'
        : '3D Lower: connected surface patch moved straight down in world Y.');
      return;
    }
    commit(() => patch.terrain.strokes.push({
      id: nextId('terrain'), x: hit.x, z: hit.z, radius, deltaMeters
    }), { terrain: true, history: !activeBrushTransaction });
    return;
  }
  if (tool === 'smooth') {
    if (!isMeshMode()) { setStatus('Smooth is available after Freeze Core to 3D Mesh.'); return; }
    commit(() => smoothBakedMesh(hit, radius, strength), { terrain: true, history: !activeBrushTransaction });
    setStatus('Smooth: relaxed only the connected surface around the clicked face; overhangs/opposite walls are not selected through space.');
    return;
  }
  if (tool === 'indent' || tool === 'pull-core') {
    if (isMeshMode()) {
      const signed = tool === 'indent' ? -strength : strength;
      commit(() => sculptBakedMesh(hit, signed, radius), { terrain: true, history: !activeBrushTransaction });
      setStatus(tool === 'indent'
        ? '3D mesh indent: surface pushed inward along its real normal. Repeated strokes can extend an overhung cave.'
        : '3D mesh pull: surface pulled outward along its real normal.');
      return;
    }
    if (tool === 'pull-core') { setStatus('Pull Core Out is available after Freeze Core to 3D Mesh.'); return; }
    commit(() => {
      patch.terrain.dents ??= [];
      patch.terrain.dents.push({ id: nextId('dent'), x: hit.x, z: hit.z, radius, depthMeters: strength });
    }, { terrain: true, history: !activeBrushTransaction });
    return;
  }
  if (tool === 'tunnel') {
    const targetId = $('#tunnel-target').value;
    const water = MOUNTAIN_FISHING_LOCATIONS.find((item) => item.id === targetId && item.cave && !item.offshore);
    if (!water) { setStatus('Choose a cave-water target first.'); return; }
    const size = Number($('#tunnel-size').value) || 3.6;
    const width = size;
    const height = Math.max(2.5, size * .86);
    const entrance = { x: hit.x, y: hit.y, z: hit.z };
    const target = tunnelTargetForWater(water, entrance);
    const item = {
      id: nextId('EDITOR-TUNNEL'),
      type: 'tunnel',
      mouthStyle: 'overhang-collar-v1',
      name: `${water.label} access tunnel`,
      targetWaterId: water.id,
      entrance,
      target,
      anchorEntranceToTerrain: true,
      entranceHeightOffset: -.18,
      width,
      height,
      chamberFlare: 1.10
    };
    commit(() => {
      patch.tunnels ??= [];
      patch.tunnels.push(item);
    }, { terrain: true });
    selected = { kind: 'tunnel', id: item.id, record: item };
    rebuildTunnels();
    renderUi();
    setStatus(`Created a small overhung cave entrance and covered passage to ${water.label}.`);
    return;
  }
  if (tool === 'hole') {
    commit(() => patch.terrain.cuts.push({ id: nextId('hole'), x: hit.x, z: hit.z, radius }), { terrain: true });
    setStatus('Manual hole punched. Use Fill Last Manual Hole / Fill All Manual Holes to restore it.');
    return;
  }
  if (tool === 'rock') {
    const scale = { x: +$('#rock-x').value || 3, y: +$('#rock-y').value || 2.5, z: +$('#rock-z').value || 3 };
    const item = {
      id: nextId('EDITOR-ROCK'), type: 'rock', name: 'Editor rock', formKind: $('#rock-kind').value,
      climbMaterial: $('#rock-material').value, anchorMode: isMeshMode() ? 'world' : 'terrain', heightOffset: 0,
      position: { x: hit.x, y: hit.y, z: hit.z }, rotation: { x: 0, y: Math.random() * 360, z: 0 }, scale
    };
    commit(() => patch.placedObjects.push(item), { placed: true });
    selected = { kind: 'placed', id: item.id, record: item };
    renderUi();
    return;
  }
  if (tool === 'plant') {
    const size = +$('#plant-size').value || 1;
    const item = {
      id: nextId('EDITOR-PLANT'), type: 'plant', name: $('#plant-kind').selectedOptions[0].textContent,
      plantKind: $('#plant-kind').value, anchorMode: isMeshMode() ? 'world' : 'terrain', heightOffset: 0,
      position: { x: hit.x, y: hit.y, z: hit.z }, rotation: { x: 0, y: Math.random() * 360, z: 0 },
      scale: { x: size, y: size, z: size }
    };
    commit(() => patch.placedObjects.push(item), { placed: true, history: !activeBrushTransaction });
    return;
  }
  if (tool === 'decor') {
    const item = {
      id: nextId('EDITOR-DECOR'), type: 'decor', name: $('#decor-kind').selectedOptions[0].textContent,
      decorKind: $('#decor-kind').value, anchorMode: isMeshMode() ? 'world' : 'terrain', heightOffset: 0,
      position: { x: hit.x, y: hit.y, z: hit.z }, rotation: { x: 0, y: Math.random() * 360, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    commit(() => patch.placedObjects.push(item), { placed: true });
  }
}

function rebuildSelectionHelper() {
  destroyChildren(helperRoot);
  if (tool === 'connect-cave' && caveConnectStart?.point) {
    const marker = new pc.Entity('Cave Connect Start');
    marker.setPosition(caveConnectStart.point.x, caveConnectStart.point.y, caveConnectStart.point.z);
    addPrimitive(marker, 'sphere', materials.selected, [0, 0, 0], [.42, .42, .42]);
    helperRoot.addChild(marker);
    return;
  }
  if (tool !== 'raise' && tool !== 'lower' && tool !== 'smooth' && tool !== 'indent' && tool !== 'pull-core' && tool !== 'hole') return;
}

function renderUi() {
  $('#undo').disabled = history.length === 0;
  $('#redo').disabled = future.length === 0;
  const meshMode = isMeshMode();
  const freeze = $('#freeze-core');
  const returnButton = $('#return-heightfield');
  if (freeze) { freeze.disabled = meshMode; freeze.textContent = meshMode ? 'Core Frozen to 3D Mesh' : 'Freeze Core to 3D Mesh'; }
  if (returnButton) returnButton.disabled = !meshMode;
  const status = $('#mesh-mode-status');
  if (status) status.innerHTML = meshMode
    ? `<strong>3D Mesh mode.</strong> The current core is explicit triangle geometry (${Math.round(patch.terrain.bakedMesh.positions.length / 3).toLocaleString()} vertices). <strong>Raise/Lower</strong> move the connected surface vertically, <strong>Smooth</strong> relaxes it, <strong>Indent/Pull</strong> sculpt caves/overhangs, and <strong>Connect Cave Ends</strong> can weld two nearby dead ends into a loop.`
    : '<strong>Heightfield mode.</strong> Finish the large mountain shape, then use <strong>Freeze Core to 3D Mesh</strong>. After freezing, Indent Core pushes the actual surface inward along its 3D normal, so it can form roofs and overhangs.';
  for (const button of $$('[data-tool="raise"], [data-tool="lower"]')) button.disabled = false;
  const smoothButton = $('[data-tool="smooth"]');
  if (smoothButton) smoothButton.disabled = !meshMode;
  const connectButton = $('[data-tool="connect-cave"]');
  if (connectButton) connectButton.disabled = !meshMode;
  $('#preset-middle').disabled = meshMode;
  $('#reset-profile').disabled = meshMode;
  drawProfileChart();
  renderProfileRows();
  renderSelection();
  renderSummary();
}

function renderProfileRows() {
  const container = $('#profile-rows');
  container.innerHTML = '';
  patch.terrain.profile.forEach((point, index) => {
    const row = document.createElement('div');
    row.className = 'profile-row';
    const summitEndpoint = Math.abs(Number(point.sourceFt) - 1000) < .01;
    const profileLocked = isMeshMode();
    row.innerHTML = `<input value="${point.sourceFt}" disabled aria-label="Source elevation"><span class="profile-arrow">→</span><input data-index="${index}" type="number" min="-100" max="1200" step="5" value="${Math.round(point.targetFt * 10) / 10}" aria-label="Edited elevation" ${summitEndpoint || profileLocked ? 'disabled title="Profile is locked in 3D Mesh mode"' : ''}>`;
    const targetInput = row.querySelector('input[data-index]');
    if (summitEndpoint || profileLocked) { container.appendChild(row); return; }
    targetInput.addEventListener('change', (event) => {
      const i = Number(event.currentTarget.dataset.index);
      const value = Number(event.currentTarget.value);
      if (!Number.isFinite(value)) return;
      commit(() => { patch.terrain.profile[i].targetFt = value; }, { terrain: true });
    });
    container.appendChild(row);
  });
}

function drawProfileChart() {
  const chart = $('#profile-chart');
  const ctx = chart.getContext('2d');
  const width = chart.width;
  const height = chart.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0f1512';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#33443b';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = 25 + i * (width - 45) / 4;
    const y = 12 + i * (height - 30) / 4;
    ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, height - 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(25, y); ctx.lineTo(width - 12, y); ctx.stroke();
  }
  const mapX = (ft) => 25 + clamp(ft / 1000, 0, 1) * (width - 40);
  const mapY = (ft) => height - 18 - clamp(ft / 1000, 0, 1.1) * (height - 30);
  ctx.strokeStyle = '#607269';
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(mapX(0), mapY(0)); ctx.lineTo(mapX(1000), mapY(1000)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#8adf9e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  patch.terrain.profile.forEach((p, index) => {
    const x = mapX(p.sourceFt), y = mapY(p.targetFt);
    if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#f5d675';
  patch.terrain.profile.forEach((p) => {
    ctx.beginPath(); ctx.arc(mapX(p.sourceFt), mapY(p.targetFt), 4, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = '#9eb0a5';
  ctx.font = '11px system-ui';
  ctx.fillText('original ft', width - 72, height - 4);
  ctx.save(); ctx.translate(9, 72); ctx.rotate(-Math.PI / 2); ctx.fillText('edited ft', 0, 0); ctx.restore();
}

function renderSelection() {
  const empty = $('#selection-empty');
  const editor = $('#selection-editor');
  if (!selected) {
    empty.hidden = false;
    editor.hidden = true;
    return;
  }
  empty.hidden = true;
  editor.hidden = false;
  const record = currentSelectedRecord();
  if (!record) { selected = null; renderSelection(); return; }
  $('#selected-name').textContent = record.label || record.name || selected.id;
  $('#selected-id').textContent = selected.id;
  const fields = $('#selection-fields');
  fields.innerHTML = '';
  if (selected.kind === 'water') {
    const water = waterState(MOUNTAIN_FISHING_LOCATIONS.find((item) => item.id === selected.id));
    const depth = waterDepthMeters(water);
    fields.appendChild(fieldGrid([
      ['Angle°', water.angle, 'angle'], ['Radius m', water.radius, 'radius'],
      ['X radius', water.radii[0], 'r0'], ['Z radius', water.radii[1], 'r1'],
      ['Water surface Y m', water.y, 'waterY'], ['Water depth m', Number.isFinite(depth) ? depth : 0, 'waterDepth']
    ], onWaterField));
    const colorWrap = document.createElement('label');
    colorWrap.className = 'color-field';
    colorWrap.textContent = 'Water color';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = normalizeHexColor(patch.fishingOverrides?.[selected.id]?.color || '#269eb8');
    colorInput.addEventListener('change', onWaterColorField);
    colorWrap.appendChild(colorInput);
    fields.appendChild(colorWrap);
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = isMeshMode()
      ? 'Water surface Y controls the TOP of the water. Water depth controls the vertical distance from that surface to the basin floor by moving only submerged floor vertices; cave roofs/overhangs are left alone.'
      : 'Water surface Y controls the top. Water depth becomes physical after Freeze Core to 3D Mesh. Color works in both modes.';
    fields.appendChild(note);
    $('#duplicate-selected').disabled = true;
    $('#hide-selected').disabled = true;
  } else if (selected.kind === 'tunnel') {
    const tunnel = resolvedTunnel(record);
    fields.appendChild(fieldGrid([
      ['Opening size m', tunnel.width, 'tsize'],
      ['Entrance X', record.entrance.x, 'tex'], ['Entrance Z', record.entrance.z, 'tez'],
      ['Target X', record.target.x, 'ttx'], ['Target Y', record.target.y, 'tty'], ['Target Z', record.target.z, 'ttz']
    ], onTunnelField));
    $('#duplicate-selected').disabled = true;
    $('#hide-selected').disabled = false;
  } else {
    const transform = selectedTransform(record);
    fields.appendChild(fieldGrid([
      ['X', transform.position.x, 'px'], ['Y', transform.position.y, 'py'], ['Z', transform.position.z, 'pz'],
      ['Scale X', transform.scale.x, 'sx'], ['Scale Y', transform.scale.y, 'sy'], ['Scale Z', transform.scale.z, 'sz'],
      ['Yaw°', transform.rotation.y, 'yaw']
    ], onObjectField));
    $('#duplicate-selected').disabled = selected.kind !== 'placed';
    $('#hide-selected').disabled = false;
  }
}

function fieldGrid(defs, handler) {
  const grid = document.createElement('div');
  grid.className = 'field-grid';
  for (const [label, value, key] of defs) {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = key === 'angle' || key === 'yaw' ? '1' : '0.1';
    input.value = Math.round((Number(value) || 0) * 100) / 100;
    input.dataset.key = key;
    input.addEventListener('change', handler);
    wrapper.appendChild(input);
    grid.appendChild(wrapper);
  }
  return grid;
}

function currentSelectedRecord() {
  if (selected.kind === 'placed') return patch.placedObjects.find((item) => item.id === selected.id);
  if (selected.kind === 'tunnel') return (patch.tunnels ?? []).find((item) => item.id === selected.id);
  if (selected.kind === 'water') return waterRecords.get(selected.id) || waterState(MOUNTAIN_FISHING_LOCATIONS.find((item) => item.id === selected.id));
  if (selected.kind === 'snapshot') {
    const all = [...(runtimeSnapshot.rocks || []), ...(runtimeSnapshot.objects || [])];
    return all.find((item) => String(item.rockId || item.mapObjectId || item.debugId || item.id) === selected.id);
  }
  return null;
}

function selectedTransform(record) {
  if (selected.kind === 'placed') return record;
  const override = patch.objectOverrides[selected.id] || {};
  return {
    position: override.position || record.position || { x: 0, y: 0, z: 0 },
    scale: override.scale || record.size || record.scale || { x: 1, y: 1, z: 1 },
    rotation: override.rotation || record.rotation || { x: 0, y: 0, z: 0 }
  };
}

function onWaterField(event) {
  const key = event.currentTarget.dataset.key;
  const value = Number(event.currentTarget.value);
  if (!Number.isFinite(value) || selected?.kind !== 'water') return;
  const base = MOUNTAIN_FISHING_LOCATIONS.find((item) => item.id === selected.id);
  const before = waterState(base);
  if (key === 'waterDepth' && isMeshMode()) {
    const desired = clamp(value, .05, 30);
    commit(() => {
      const changed = setBakedWaterDepth(before, desired);
      const current = patch.fishingOverrides[selected.id] || {};
      current.label = base.label;
      current.depthMeters = desired;
      patch.fishingOverrides[selected.id] = current;
      if (!changed) setStatus('Could not find submerged basin-floor vertices for that water.');
    }, { terrain: true });
    return;
  }
  commit(() => {
    const current = patch.fishingOverrides[selected.id] || {};
    current.label = base.label;
    if (key === 'angle') current.angle = value;
    if (key === 'radius') current.radius = value;
    if (key === 'r0' || key === 'r1') {
      const existing = current.radii || [...base.radii];
      current.radii = [...existing];
      current.radii[key === 'r0' ? 0 : 1] = Math.max(.2, value);
    }
    if (key === 'waterY') current.waterY = value;
    if (key === 'waterDepth' && !isMeshMode()) current.depthMeters = Math.max(.05, value);
    patch.fishingOverrides[selected.id] = current;
  }, { terrain: key !== 'waterY', waters: key === 'waterY' });
}

function onWaterColorField(event) {
  if (selected?.kind !== 'water') return;
  const base = MOUNTAIN_FISHING_LOCATIONS.find((item) => item.id === selected.id);
  const color = normalizeHexColor(event.currentTarget.value);
  commit(() => {
    const current = patch.fishingOverrides[selected.id] || {};
    current.label = base.label;
    current.color = color;
    patch.fishingOverrides[selected.id] = current;
  }, { waters: true });
}

function onTunnelField(event) {
  const key = event.currentTarget.dataset.key;
  const value = Number(event.currentTarget.value);
  if (!Number.isFinite(value) || selected?.kind !== 'tunnel') return;
  commit(() => {
    const tunnel = (patch.tunnels ?? []).find((item) => item.id === selected.id);
    if (!tunnel) return;
    if (key === 'tsize') {
      tunnel.width = Math.max(2.2, value);
      tunnel.height = Math.max(2.5, tunnel.width * .86);
    }
    if (key === 'tex') tunnel.entrance.x = value;
    if (key === 'tez') tunnel.entrance.z = value;
    if (key === 'ttx') tunnel.target.x = value;
    if (key === 'tty') tunnel.target.y = value;
    if (key === 'ttz') tunnel.target.z = value;
  }, { terrain: true });
}

function onObjectField(event) {
  const key = event.currentTarget.dataset.key;
  const value = Number(event.currentTarget.value);
  if (!Number.isFinite(value)) return;
  commit(() => {
    if (selected.kind === 'placed') {
      const record = patch.placedObjects.find((item) => item.id === selected.id);
      if (!record) return;
      if (key === 'px') record.position.x = value;
      if (key === 'py') { record.position.y = value; record.anchorMode = 'absolute'; }
      if (key === 'pz') record.position.z = value;
      if (key === 'sx') record.scale.x = Math.max(.05, value);
      if (key === 'sy') record.scale.y = Math.max(.05, value);
      if (key === 'sz') record.scale.z = Math.max(.05, value);
      if (key === 'yaw') record.rotation.y = value;
    } else {
      const record = currentSelectedRecord();
      const current = clone(patch.objectOverrides[selected.id] || {});
      const transform = selectedTransform(record);
      current.position = clone(transform.position);
      current.scale = clone(transform.scale);
      current.rotation = clone(transform.rotation);
      if (key === 'px') current.position.x = value;
      if (key === 'py') current.position.y = value;
      if (key === 'pz') current.position.z = value;
      if (key === 'sx') current.scale.x = Math.max(.05, value);
      if (key === 'sy') current.scale.y = Math.max(.05, value);
      if (key === 'sz') current.scale.z = Math.max(.05, value);
      if (key === 'yaw') current.rotation.y = value;
      patch.objectOverrides[selected.id] = current;
    }
  }, { placed: selected.kind === 'placed', snapshot: selected.kind === 'snapshot' });
}

function renderSummary() {
  const rows = [
    ['Terrain strokes', patch.terrain.strokes.length],
    ['Core indents', patch.terrain.dents?.length || 0],
    ['Open holes', patch.terrain.cuts.length],
    ['Cave tunnels', patch.tunnels?.length || 0],
    ['Hidden objects', patch.hiddenObjectIds.length],
    ['Moved objects', Object.keys(patch.objectOverrides).length],
    ['Placed rocks', patch.placedObjects.filter((o) => o.type === 'rock').length],
    ['Placed plants', patch.placedObjects.filter((o) => o.type === 'plant').length],
    ['Placed decor', patch.placedObjects.filter((o) => o.type === 'decor').length],
    ['Moved waters', Object.keys(patch.fishingOverrides).length],
    ['Visible existing rocks', runtimeSnapshot.rocks?.length || 0],
    ['Core mode', isMeshMode() ? `3D mesh (${Math.round(patch.terrain.bakedMesh.positions.length / 3).toLocaleString()} verts)` : 'Heightfield'],
    ['Baked rock snapshot', patch.bakedSnapshot?.rocks?.length || 0]
  ];
  $('#summary').innerHTML = rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join('');
}

function duplicateSelected() {
  if (selected?.kind !== 'placed') return;
  const source = patch.placedObjects.find((item) => item.id === selected.id);
  if (!source) return;
  const copy = clone(source);
  copy.id = nextId(source.type === 'rock' ? 'EDITOR-ROCK' : source.type === 'plant' ? 'EDITOR-PLANT' : 'EDITOR-DECOR');
  copy.position.x += 1.5;
  copy.position.z += 1.5;
  commit(() => patch.placedObjects.push(copy), { placed: true });
  selected = { kind: 'placed', id: copy.id, record: copy };
  renderUi();
}

function hideSelected() {
  if (!selected) return;
  const target = selected;
  commit(() => {
    if (target.kind === 'placed') {
      patch.placedObjects = patch.placedObjects.filter((item) => item.id !== target.id);
    } else if (target.kind === 'tunnel') {
      patch.tunnels = (patch.tunnels ?? []).filter((item) => item.id !== target.id);
    } else if (target.kind === 'snapshot') {
      if (!patch.hiddenObjectIds.includes(target.id)) patch.hiddenObjectIds.push(target.id);
    }
    selected = null;
  }, { terrain: target.kind === 'tunnel', placed: target.kind === 'placed', snapshot: target.kind === 'snapshot' });
}

function fillLastManualHole() {
  if (!patch.terrain.cuts.length) { setStatus('There are no manual Punch Hole cuts to fill. Tunnel portals are restored by deleting their tunnel.'); return; }
  const last = patch.terrain.cuts.at(-1);
  commit(() => patch.terrain.cuts.pop(), { terrain: true });
  setStatus(`Filled manual hole ${last?.id || ''}.`);
}

function fillAllManualHoles() {
  if (!patch.terrain.cuts.length) { setStatus('There are no manual Punch Hole cuts to fill.'); return; }
  if (!confirm(`Fill all ${patch.terrain.cuts.length} manual terrain holes? Tunnel-owned entrances are unaffected.`)) return;
  commit(() => { patch.terrain.cuts = []; }, { terrain: true });
  setStatus('Filled all manual Punch Hole cuts.');
}

function roundedMeshData(data) {
  return {
    format: 'triangle-mesh-v1',
    source: 'editor-freeze',
    bakedAt: new Date().toISOString(),
    positions: data.positions.map((value) => Math.round(Number(value) * 10000) / 10000),
    indices: data.indices.map((value) => Math.trunc(Number(value)))
  };
}

function clearLegacyCaveExperiments() {
  const tunnels = patch.tunnels?.length || 0;
  const cuts = patch.terrain?.cuts?.length || 0;
  if (!tunnels && !cuts) { setStatus('No legacy Cave Brush tunnels or Punch Hole cuts are present.'); return; }
  if (!confirm(`Remove ${tunnels} legacy cave tunnel(s) and ${cuts} manual hole cut(s)? This does not affect ordinary Indent Core terrain edits.`)) return;
  commit(() => {
    patch.tunnels = [];
    patch.terrain.cuts = [];
  }, { terrain: true });
  selected = null;
  setStatus('Legacy cut/rebuild cave experiments cleared.');
}

function freezeCoreToMesh() {
  if (isMeshMode()) { setStatus('The core is already frozen to a true 3D mesh.'); return; }
  const legacyTunnelCount = patch.tunnels?.length || 0;
  const legacyCutCount = patch.terrain?.cuts?.length || 0;
  if (legacyTunnelCount || legacyCutCount) {
    setStatus('Remove legacy Cave Brush / Punch Hole edits before freezing. Mesh mode does not need them.');
    alert('Before freezing, delete any old Cave Brush tunnels and fill any Punch Hole cuts. The new 3D mesh mode does not use cut-and-rebuild cave geometry.');
    return;
  }
  if (!confirm('Freeze the current mountain core into a true editable 3D mesh? This preserves your current shape. Height/profile controls will lock, and Indent Core will become a real 3D inward sculpt that can make overhangs. You can return to the untouched heightfield later if needed.')) return;
  saveManualCheckpoint();
  saveHistory();
  // Make terrain-anchored editor objects explicit before the heightfield stops being authoritative.
  for (const item of patch.placedObjects ?? []) {
    if (item.anchorMode !== 'terrain') continue;
    const y = editedTerrainHeightWorld(item.position.x, item.position.z);
    if (Number.isFinite(y)) item.position.y = y + (Number(item.heightOffset) || 0);
    item.anchorMode = 'world';
  }
  const data = buildHeightfieldTerrainData();
  patch.terrain.bakedMesh = roundedMeshData(data);
  patch.updatedAt = new Date().toISOString();
  selected = null;
  persistPatch();
  rebuildAll();
  setStatus(`Core frozen to a true 3D mesh: ${Math.round(data.positions.length / 3).toLocaleString()} vertices. Indent Core can now form overhangs.`);
}

function returnToHeightfield() {
  if (!isMeshMode()) return;
  if (!confirm('Return to the pre-freeze heightfield? Any 3D mesh-only cave/overhang sculpting will be discarded. Your original profile/raise/lower/indent edits remain intact.')) return;
  saveHistory();
  patch.terrain.bakedMesh = null;
  patch.updatedAt = new Date().toISOString();
  selected = null;
  persistPatch();
  rebuildAll();
  setStatus('Returned to Heightfield mode.');
}

async function savePatch() {
  patch.updatedAt = new Date().toISOString();
  const text = JSON.stringify(patch, null, 2);
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'map-editor-patch.json',
        types: [{ description: 'Reel Ascent map patch', accept: { 'application/json': ['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      setStatus('Patch saved.');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  downloadJson('map-editor-patch.json', patch);
  setStatus('Patch downloaded.');
}

async function loadJsonFile(file, type) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (type === 'patch') {
    saveHistory();
    patch = normalizePatch(data);
    runtimeSnapshot = clone(patch.bakedSnapshot ?? { objects: [], rocks: [] });
    selected = null;
    persistPatch();
    syncSnapshotUi();
    rebuildAll();
    setStatus(`Loaded patch: ${file.name}`);
  } else {
    runtimeSnapshot = {
      ...data,
      rocks: Array.isArray(data.rocks) ? data.rocks : [],
      objects: Array.isArray(data.objects) ? data.objects : []
    };
    syncSnapshotUi();
    rebuildSnapshotObjects();
    renderUi();
    setStatus(`Loaded runtime snapshot with ${runtimeSnapshot.rocks.length} rocks. Click “Bake Rocks Into Editor” to keep them in the patch.`);
  }
}

function syncSnapshotUi() {
  const count = runtimeSnapshot.rocks?.length || 0;
  const rockToggle = $('#show-snapshot-rocks');
  rockToggle.disabled = count === 0;
  if (count) rockToggle.checked = true;
  const rockLabel = $('#existing-rocks-label');
  if (rockLabel) rockLabel.lastChild.textContent = count ? ` Existing rocks (${count})` : ' Existing rocks (import snapshot)';
  const bakeButton = $('#bake-snapshot');
  if (bakeButton) bakeButton.disabled = count === 0;
}

function bakeSnapshotIntoPatch() {
  const count = runtimeSnapshot.rocks?.length || 0;
  if (!count) { setStatus('Import a runtime snapshot first.'); return; }
  commit(() => {
    patch.bakedSnapshot = {
      schema: runtimeSnapshot.schema ?? 1,
      generatedAt: runtimeSnapshot.generatedAt ?? new Date().toISOString(),
      bakedAt: new Date().toISOString(),
      locationId: runtimeSnapshot.locationId ?? 'main-mountain',
      rocks: clone(runtimeSnapshot.rocks ?? []),
      objects: clone(runtimeSnapshot.objects ?? [])
    };
  });
  setStatus(`Baked ${count} existing rocks into the editor patch. They will now reload without another game snapshot. Gameplay still uses its procedural rock generator until a separate runtime-finalize bake is implemented.`);
  renderUi();
}

function setStatus(message) { $('#status').textContent = message; }

function setView(view) {
  $$('#view-toolbar button[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'top') {
    cameraState.target.set(MOUNTAIN_CENTER.x, 90, MOUNTAIN_CENTER.z);
    cameraState.yaw = 0; cameraState.pitch = -89; cameraState.distance = 520;
  } else if (view === 'north') {
    cameraState.target.set(MOUNTAIN_CENTER.x, 130, MOUNTAIN_CENTER.z);
    cameraState.yaw = 180; cameraState.pitch = 0; cameraState.distance = 510;
  } else if (view === 'west') {
    cameraState.target.set(MOUNTAIN_CENTER.x, 130, MOUNTAIN_CENTER.z);
    cameraState.yaw = -90; cameraState.pitch = 0; cameraState.distance = 510;
  } else {
    cameraState.target.set(MOUNTAIN_CENTER.x, 105, MOUNTAIN_CENTER.z);
    cameraState.yaw = 42; cameraState.pitch = -24; cameraState.distance = 430;
  }
  updateCamera();
}

// UI wiring
ROCK_KINDS.forEach((kind) => $('#rock-kind').append(new Option(kind, kind)));
$('#rock-kind').value = 'chunk';

$$('#tool-grid button').forEach((button) => button.addEventListener('click', () => {
  const previousTool = tool;
  tool = button.dataset.tool;
  if (previousTool === 'connect-cave' && tool !== 'connect-cave') caveConnectStart = null;
  if (tool === 'connect-cave') caveConnectStart = null;
  rebuildSelectionHelper();
  $$('#tool-grid button').forEach((b) => b.classList.toggle('active', b === button));
  if (tool === 'indent' && isMeshMode()) setStatus('3D Indent: use a small brush and push the actual mesh inward. Repeat on the recessed back wall to extend a cave.');
  else if (tool === 'pull-core') setStatus(isMeshMode() ? 'Pull Core Out: pull the true mesh outward along its surface normal.' : 'Freeze Core to 3D Mesh first.');
  else if (tool === 'raise' && isMeshMode()) setStatus('3D Raise: moves the connected surface straight upward, not outward along its normal.');
  else if (tool === 'lower' && isMeshMode()) setStatus('3D Lower: moves the connected surface straight downward.');
  else if (tool === 'smooth') setStatus(isMeshMode() ? 'Smooth: click to relax bumps on the connected surface.' : 'Freeze Core to 3D Mesh first.');
  else if (tool === 'connect-cave') setStatus(isMeshMode() ? 'Connect Cave Ends: click one dead-end wall, then click the other. The tool opens both local patches and stitches their terrain boundaries into one continuous mesh. Esc cancels.' : 'Freeze Core to 3D Mesh first.');
  else setStatus(`Tool: ${button.textContent}`);
}));

$('#brush-radius').addEventListener('input', () => $('#brush-radius-out').textContent = `${$('#brush-radius').value} m`);
$('#brush-strength').addEventListener('input', () => $('#brush-strength-out').textContent = `${$('#brush-strength').value}`);
$('#plant-size').addEventListener('input', () => $('#plant-size-out').textContent = `${Number($('#plant-size').value).toFixed(2)}×`);
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#checkpoint').addEventListener('click', saveManualCheckpoint);
$('#restore-checkpoint').addEventListener('click', restoreManualCheckpoint);
$('#reload-project-patch').addEventListener('click', reloadProjectPatch);
$('#freeze-core').addEventListener('click', freezeCoreToMesh);
$('#return-heightfield').addEventListener('click', returnToHeightfield);
$('#clear-legacy-caves').addEventListener('click', clearLegacyCaveExperiments);
$('#save-patch').addEventListener('click', savePatch);
$('#open-patch').addEventListener('click', () => $('#patch-file').click());
$('#import-snapshot').addEventListener('click', () => $('#snapshot-file').click());
$('#bake-snapshot').addEventListener('click', bakeSnapshotIntoPatch);
$('#patch-file').addEventListener('change', (event) => event.target.files[0] && loadJsonFile(event.target.files[0], 'patch').catch((e) => setStatus(e.message)));
$('#snapshot-file').addEventListener('change', (event) => event.target.files[0] && loadJsonFile(event.target.files[0], 'snapshot').catch((e) => setStatus(e.message)));
$('#preset-middle').addEventListener('click', () => commit(() => { patch = applyMidPlateauPreset(patch, 150); }, { terrain: true }));
$('#reset-profile').addEventListener('click', () => commit(() => { patch.terrain.profile = makeEmptyPatch().terrain.profile; }, { terrain: true }));

$('#manual-hole-tool')?.addEventListener('click', () => {
  tool = 'hole';
  $$('#tool-grid button').forEach((b) => b.classList.remove('active'));
  setStatus('Advanced Punch Hole tool selected.');
});
$('#fill-last-hole')?.addEventListener('click', fillLastManualHole);
$('#fill-all-holes')?.addEventListener('click', fillAllManualHoles);
$('#duplicate-selected').addEventListener('click', duplicateSelected);
$('#hide-selected').addEventListener('click', hideSelected);
$('#show-waters').addEventListener('change', rebuildWaterMeshes);
$('#xray-core').addEventListener('change', () => {
  if ($('#xray-core').checked && !$('#show-waters').checked) $('#show-waters').checked = true;
  applyTerrainDisplayMode();
  rebuildWaterMeshes();
  setStatus($('#xray-core').checked
    ? 'X-Ray Core on — mountain ghosted; cave waters are magenta with locator beacons.'
    : 'X-Ray Core off.');
});
$('#show-snapshot-rocks').addEventListener('change', rebuildSnapshotObjects);
$('#clear-local').addEventListener('click', () => {
  if (!confirm('Clear all editor changes? This does not change the game files, only this editor patch.')) return;
  saveHistory();
  patch = makeEmptyPatch();
  runtimeSnapshot = { objects: [], rocks: [] };
  selected = null;
  persistPatch();
  syncSnapshotUi();
  rebuildAll();
});
$$('#view-toolbar button[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));

let orbiting = false;
let panning = false;
let previousPointer = null;
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('pointerdown', (event) => {
  if (walkthroughState.active) {
    event.preventDefault();
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  if (event.button === 2 || event.button === 1) {
    orbiting = event.button === 2 && !event.shiftKey;
    panning = event.button === 1 || event.shiftKey;
    previousPointer = { x: event.clientX, y: event.clientY };
    return;
  }
  if (event.button !== 0) return;
  const meshSculptClick = isMeshMode() && ['raise', 'lower', 'smooth', 'indent', 'pull-core', 'connect-cave'].includes(tool);
  draggingBrush = !meshSculptClick && ['raise', 'lower', 'indent', 'pull-core', 'plant'].includes(tool);
  activeBrushTransaction = draggingBrush;
  if (activeBrushTransaction) saveHistory();
  lastBrushPoint = null;
  applyToolAt(event, false);
});
canvas.addEventListener('pointermove', (event) => {
  if (walkthroughState.active) return;
  const hit = rayTerrainHit(event);
  if (hit) $('#cursor-info').textContent = `x ${hit.x.toFixed(1)} · z ${hit.z.toFixed(1)} · ${Math.round(hit.y * FEET_PER_METER)} ft`;
  else $('#cursor-info').textContent = '';
  if (orbiting || panning) {
    const dx = event.clientX - previousPointer.x;
    const dy = event.clientY - previousPointer.y;
    previousPointer = { x: event.clientX, y: event.clientY };
    if (orbiting) {
      cameraState.yaw -= dx * .32;
      cameraState.pitch = clamp(cameraState.pitch + dy * .28, -89, 75);
    } else {
      const scale = cameraState.distance * .0015;
      const right = cameraEntity.right.clone().mulScalar(-dx * scale);
      const up = cameraEntity.up.clone().mulScalar(dy * scale);
      cameraState.target.add(right).add(up);
    }
    updateCamera();
    return;
  }
  if (draggingBrush && (event.buttons & 1)) applyToolAt(event, true);
});
canvas.addEventListener('pointerup', () => {
  if (walkthroughState.active) return;
  orbiting = false;
  panning = false;
  draggingBrush = false;
  activeBrushTransaction = false;
  lastBrushPoint = null;
});
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (walkthroughState.active) return;

  // v1.21: restore the simple, stable orbit zoom used before v1.17.
  //
  // The editor did not have the intermittent black/jump problem before zoom was
  // changed to retarget/dolly the camera. The extra cursor-follow and through-shell
  // target translation introduced several new camera states that are unnecessary
  // for cave editing. Close cave work only needs a smaller minimum orbit distance;
  // WASD/QE already translates the whole camera rig through terrain when desired.
  //
  // Therefore wheel input once again changes ONLY cameraState.distance. It never:
  //   - ray-picks terrain,
  //   - changes cameraState.target,
  //   - auto-focuses,
  //   - switches presets,
  //   - or performs a special through-surface dolly.
  //
  // The only intentional difference from the old pre-v1.17 behavior is that the
  // minimum distance is 0.25 m instead of 18 m, so caves can be inspected closely.
  const delta = Number(event.deltaY);
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) return;

  const nextDistance = cameraState.distance * Math.exp(delta * .00032 * cameraZoomMultiplier);
  if (!Number.isFinite(nextDistance)) return;

  cameraState.distance = clamp(nextDistance, 0.25, 1600);
  updateCamera();
}, { passive: false });



const CAMERA_PREFS_KEY = 'reel-ascent-map-editor-camera-v2';
let cameraMoveMultiplier = 0.221;
let cameraZoomMultiplier = 0.235;
try {
  const savedCameraPrefs = JSON.parse(localStorage.getItem(CAMERA_PREFS_KEY) || '{}');
  if (Number.isFinite(Number(savedCameraPrefs.move))) cameraMoveMultiplier = clamp(Number(savedCameraPrefs.move), 0.2, 1.5);
  if (Number.isFinite(Number(savedCameraPrefs.zoom))) cameraZoomMultiplier = clamp(Number(savedCameraPrefs.zoom), 0.1, 1.5);
} catch {}

function syncCameraPreferenceUi() {
  const move = $('#camera-move-speed');
  const zoom = $('#camera-zoom-speed');
  const moveOut = $('#camera-move-value');
  const zoomOut = $('#camera-zoom-value');
  if (move) move.value = String(Math.round(cameraMoveMultiplier * 100));
  if (zoom) zoom.value = String(Math.round(cameraZoomMultiplier * 100));
  if (moveOut) moveOut.textContent = `${Math.round(cameraMoveMultiplier * 100)}%`;
  if (zoomOut) zoomOut.textContent = `${Math.round(cameraZoomMultiplier * 100)}%`;
}
function saveCameraPreferences() {
  try { localStorage.setItem(CAMERA_PREFS_KEY, JSON.stringify({ move: cameraMoveMultiplier, zoom: cameraZoomMultiplier })); } catch {}
}

const cameraKeys = new Set();
const cameraMoveKeys = new Set(['w', 'a', 's', 'd', 'q', 'e']);
function typingInField() {
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
}

function focusSelectedObject() {
  if (!selected) return false;
  let position = null;
  if (selected.kind === 'placed') {
    const item = patch.placedObjects.find((candidate) => candidate.id === selected.id);
    position = item?.position;
  } else if (selected.kind === 'snapshot') {
    const item = [...(runtimeSnapshot.rocks ?? []), ...(runtimeSnapshot.objects ?? [])].find((candidate) => String(candidate.id ?? candidate.rockId ?? candidate.mapObjectId) === String(selected.id));
    const override = patch.objectOverrides?.[selected.id];
    position = override?.position ?? item?.position;
  } else if (selected.kind === 'tunnel') {
    const tunnel = (patch.tunnels ?? []).find((candidate) => candidate.id === selected.id);
    position = tunnel ? resolvedTunnel(tunnel).entrance : null;
  } else if (selected.kind === 'water') {
    const water = MOUNTAIN_FISHING_LOCATIONS.find((candidate) => candidate.id === selected.id);
    const override = patch.fishingOverrides?.[selected.id] ?? {};
    if (water) {
      const angle = Number.isFinite(Number(override.angle)) ? Number(override.angle) : water.angle;
      const radius = Number.isFinite(Number(override.radius)) ? Number(override.radius) : water.radius;
      const radians = rad(angle);
      const x = MOUNTAIN_CENTER.x + Math.cos(radians) * radius;
      const z = MOUNTAIN_CENTER.z + Math.sin(radians) * radius;
      position = { x, y: editedTerrainHeightWorld(x, z) ?? water.y ?? 0, z };
    }
  }
  if (!position) return false;
  cameraState.target.set(Number(position.x) || 0, Number(position.y) || 0, Number(position.z) || 0);
  cameraState.distance = clamp(cameraState.distance, 0.25, 220);
  updateCamera();
  return true;
}


syncCameraPreferenceUi();
$('#camera-move-speed')?.addEventListener('input', (event) => {
  cameraMoveMultiplier = clamp(Number(event.target.value) / 100, 0.2, 1.5);
  syncCameraPreferenceUi();
  saveCameraPreferences();
});
$('#camera-zoom-speed')?.addEventListener('input', (event) => {
  cameraZoomMultiplier = clamp(Number(event.target.value) / 100, 0.1, 1.5);
  syncCameraPreferenceUi();
  saveCameraPreferences();
});

window.addEventListener('keydown', (event) => {
  if (walkthroughState.active) {
    const code = event.code;
    if (code === 'Escape') {
      event.preventDefault();
      exitWalkthrough();
      return;
    }
    if (code === 'KeyF' && !event.repeat) {
      event.preventDefault();
      setWalkthroughFly(!walkthroughState.fly);
      return;
    }
    if (code === 'KeyR' && !event.repeat) {
      event.preventDefault();
      resetWalkthroughToEntry();
      return;
    }
    if (code === 'Space' && !walkthroughState.fly && !event.repeat) walkthroughState.jumpQueued = true;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(code)) {
      walkthroughState.keys.add(code);
      event.preventDefault();
    }
    return;
  }
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); undo(); return; }
  if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); redo(); return; }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (typingInField()) return;
    hideSelected();
    return;
  }
  if (event.key === 'Escape' && caveConnectStart) {
    caveConnectStart = null;
    rebuildSelectionHelper();
    setStatus('Cave Connect cancelled.');
    event.preventDefault();
    return;
  }
  if (typingInField()) return;
  if (key === 'x' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat) {
    const toggle = $('#xray-core');
    if (toggle) {
      toggle.checked = !toggle.checked;
      toggle.dispatchEvent(new Event('change'));
      event.preventDefault();
      return;
    }
  }
  if (cameraMoveKeys.has(key)) {
    cameraKeys.add(key);
    event.preventDefault();
  } else if (key === 'f') {
    if (focusSelectedObject()) event.preventDefault();
  } else if (event.key === 'Home') {
    setView('perspective');
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => {
  if (walkthroughState.active) {
    walkthroughState.keys.delete(event.code);
    return;
  }
  cameraKeys.delete(event.key.toLowerCase());
});
window.addEventListener('blur', () => { cameraKeys.clear(); walkthroughState.keys.clear(); });

app.on('update', (dt) => {
  if (walkthroughState.active) {
    updateWalkthrough(dt);
    return;
  }
  if (!cameraKeys.size) return;
  const cameraPosition = cameraEntity.getPosition();
  // True fly-camera translation: W/S follows the direction the camera is actually looking,
  // including up/down pitch. This is important for reaching the base of the island and for
  // flying into a cave without first spending ages on Q/E vertical movement.
  const forward = cameraState.target.clone().sub(cameraPosition);
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  else forward.normalize();
  let right = new pc.Vec3().cross(forward, new pc.Vec3(0, 1, 0));
  if (right.lengthSq() < 0.0001) right = cameraEntity.right.clone();
  else right.normalize();
  const direction = new pc.Vec3();
  if (cameraKeys.has('w')) direction.add(forward);
  if (cameraKeys.has('s')) direction.sub(forward);
  if (cameraKeys.has('d')) direction.add(right);
  if (cameraKeys.has('a')) direction.sub(right);
  if (cameraKeys.has('e')) direction.y += 1;
  if (cameraKeys.has('q')) direction.y -= 1;
  if (direction.lengthSq() < 0.0001) return;
  direction.normalize();
  // Keep Shift traversal at roughly the old v1.14 fast speed even though normal WASD is much slower.
  const boost = window.__RA_EDITOR_SHIFT_HELD__ ? 8.82 : 1;
  const speed = clamp(cameraState.distance * 0.32, 14, 170) * cameraMoveMultiplier * boost;
  cameraState.target.add(direction.mulScalar(speed * Math.min(dt, 0.05)));
  updateCamera();
});

window.addEventListener('keydown', (event) => { if (event.key === 'Shift') window.__RA_EDITOR_SHIFT_HELD__ = true; });
window.addEventListener('keyup', (event) => { if (event.key === 'Shift') window.__RA_EDITOR_SHIFT_HELD__ = false; });
window.addEventListener('blur', () => { window.__RA_EDITOR_SHIFT_HELD__ = false; });

window.addEventListener('mousemove', (event) => {
  if (!walkthroughState.active || document.pointerLockElement !== canvas) return;
  walkthroughState.yaw -= Number(event.movementX || 0) * .12;
  walkthroughState.pitch = clamp(
    walkthroughState.pitch - Number(event.movementY || 0) * .12,
    -89,
    89
  );
  updateWalkthroughCamera();
});

document.addEventListener('pointerlockchange', () => {
  if (!walkthroughState.active) return;
  if (document.pointerLockElement === canvas) {
    const note = $('#walkthrough-note');
    if (note) note.textContent = walkthroughState.fly
      ? 'Fly mode active. F = Walk, Esc = exit.'
      : 'Walk mode active. F = Fly, Esc = exit.';
  } else {
    const note = $('#walkthrough-note');
    if (note) note.textContent = 'Mouse released. Click the viewport to recapture mouse-look, or use Exit Walkthrough.';
  }
});

$('#walkthrough-toggle')?.addEventListener('click', () => enterWalkthrough());
$('#walkthrough-fly-toggle')?.addEventListener('click', () => setWalkthroughFly(!walkthroughState.fly));
$('#walkthrough-exit')?.addEventListener('click', () => exitWalkthrough());
syncWalkthroughHud();

canvas.addEventListener('webglcontextlost', () => {
  if (walkthroughState.active) exitWalkthrough();
  // A context loss should never cost level-design work. Persist immediately to both
  // available autosave paths; PlayCanvas/browser recovery can then restore rendering.
  persistPatch();
  console.warn('Map Editor WebGL context lost; latest patch queued for recovery.');
});
canvas.addEventListener('webglcontextrestored', () => {
  rebuildAll();
  updateCamera();
  setStatus('Graphics context restored. Your editor state was preserved.');
});

window.addEventListener('resize', () => app.resizeCanvas());

rebuildAll();
syncSnapshotUi();
setStatus(isMeshMode() ? 'Ready in 3D Mesh mode. Indent Core can now create real overhangs by pushing the same terrain surface inward.' : (runtimeSnapshot.rocks?.length ? `Ready. Loaded ${runtimeSnapshot.rocks.length} baked existing rocks from the patch.` : 'Ready. Finish the large core shape, then Freeze Core to 3D Mesh for overhang/cave sculpting.'));
// If the browser had to reload after a GPU/context problem, localStorage may contain an
// older patch when the frozen mesh has outgrown its quota. Recover the newer IndexedDB copy.
recoverNewerAutosaveIfNeeded();
