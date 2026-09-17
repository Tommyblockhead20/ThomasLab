import * as pc from 'playcanvas';
import {
  MOUNTAIN_CENTER,
  MOUNTAIN_FISHING_LOCATIONS,
  SUMMIT_HEIGHT,
  terrainHeightAt,
  FRACTURED_ROCK_FORM_KINDS
} from '../../src/world/mountain-v2.js';
import {
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
import { WORLD_EDITOR_WORLDS, getWorldEditorWorld, worldHasCapability } from './world-registry.js';
import {
  WORLD_EDITOR_LEVEL_KIND,
  normalizeWorldEditorLevel,
  nextStableId,
  downloadWorldLevel,
  wrapLegacyStoneveilPatch,
  unwrapLegacyStoneveilPatch
} from './world-level-format.js';
import { GenericWorldScene, sculptTriangleMesh } from './generic-scene.js';
import { SlopeOverlay, slopeOverlayLegend } from './slope-overlay.js';
import { validateWorldLevel } from './validation.js';
import {
  LIBRARY_SCENE_FILENAME,
  adaptLibrarySceneToEditor,
  isLibraryAuthoredScene,
  normalizeLibraryEditorPayload,
  serializeLibrarySceneFromEditor
} from './library-scene-adapter.js';
import { movingPlatformPose } from '../../src/world/world-editor-v2-runtime.js';
import { SKYSCRAPER_ROOM_LIBRARY, getRoomLibraryTemplate, makeRoomLibraryDefinition, makeRoomComponentDefinition } from './room-library.js';
import { PIRATE_ASSET_LIBRARY, getPirateAsset, makePirateAssetDefinition } from './pirate-library.js';

const STORAGE_KEY = 'reel-ascent-map-editor-v1';
const CHECKPOINT_KEY = 'reel-ascent-map-editor-v1-manual-checkpoint';
const RECOVERY_DB_NAME = 'reel-ascent-map-editor-recovery';
const RECOVERY_STORE = 'autosaves';
const RECOVERY_KEY = 'latest-patch';
const STONEVEIL_AUTOSAVE_META_KEY = 'reel-ascent-map-editor-stoneveil-autosave-meta-v2';
const CAMERA_VIEW_KEY = 'reel-ascent-map-editor-camera-view-v1';
const MIN_BRIGHTNESS_KEY = 'reel-ascent-map-editor-min-brightness-v1';
const WORLD_V2_ACTIVE_KEY = 'reel-ascent-world-editor-v2-active-world';
const WORLD_V2_STORAGE_PREFIX = 'reel-ascent-world-editor-v2-level:';
const WORLD_V2_CHECKPOINT_PREFIX = 'reel-ascent-world-editor-v2-checkpoint:';
const RIGHT_PANEL_WIDTH_KEY = 'reel-ascent-world-editor-v2-right-panel-width';
const COLLAPSE_PREFS_KEY = 'reel-ascent-world-editor-v2-collapsed-sections';
const OUTLINER_GROUP_PREFS_KEY = 'reel-ascent-world-editor-v2-outliner-groups';
const SNAP_PREFS_KEY = 'reel-ascent-world-editor-v2-snap-prefs';

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
let stoneveilProjectSignature = null;
let stoneveilContextRecovery = null;
let webglRecoveryCount = 0;
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
const terrainRenderState = { entity: null, mesh: null, vertexCapacity: 0, indexCapacity: 0 };
let caveConnectStart = null;
let activeWorldId = (() => {
  try {
    const saved = localStorage.getItem(WORLD_V2_ACTIVE_KEY);
    return WORLD_EDITOR_WORLDS.some((world) => world.id === saved) ? saved : 'stoneveil-peak';
  } catch { return 'stoneveil-peak'; }
})();
const genericLevels = new Map();
const genericHistories = new Map();
const genericFutures = new Map();
let genericScene = null;
let slopeOverlay = null;
let outlinerFilter = '';
let validationIssues = [];
let validationFilter = 'all';
const editorHiddenStoneveilIds = new Set();
let draggingWaypoint = null;
const prefabWorkspace = { active: false, definitionId: null, returnCamera: null, returnSelection: null };

function activePrefabDefinition(level = activeGenericLevel()) {
  if (!prefabWorkspace.active || !level) return null;
  return (level.prefabs?.definitions ?? []).find((item) => item.id === prefabWorkspace.definitionId) ?? null;
}

function currentCollisionMode() { return $('#collision-mode')?.value || 'normal'; }
function collisionVisible() { return currentCollisionMode() !== 'normal'; }
function snapNumber(value, step) {
  const numeric = Number(value);
  const increment = Math.max(.0001, Number(step) || 1);
  return Math.round(numeric / increment) * increment;
}
function gridSnapEnabled() { return Boolean($('#grid-snap')?.checked); }
function rotationSnapEnabled() { return Boolean($('#rotation-snap')?.checked); }
function gridSnapStep() { return Math.max(.05, Number($('#grid-snap-step')?.value) || .5); }
function rotationSnapStep() { return Math.max(1, Number($('#rotation-snap-step')?.value) || 15); }
function maybeSnapPosition(position) {
  if (!gridSnapEnabled()) return position;
  const step = gridSnapStep();
  return { x: snapNumber(position.x, step), y: snapNumber(position.y, step), z: snapNumber(position.z, step) };
}
function maybeSnapRotation(value) { return rotationSnapEnabled() ? snapNumber(value, rotationSnapStep()) : value; }

function nextPrefabChildId(definition, prefix = 'CHILD') {
  const ids = new Set([
    ...(definition?.objects ?? []).map((item) => item.id),
    ...(definition?.movingPlatforms ?? []).map((item) => item.id),
    ...(definition?.waters ?? []).map((item) => item.id || item.identity)
  ].filter(Boolean).map(String));
  for (let sequence = 1; sequence < 100000; sequence += 1) {
    const candidate = `${prefix}-${String(sequence).padStart(3, '0')}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `${prefix}-${Date.now()}`;
}

function refreshGenericScene({ preserveSelection = true } = {}) {
  const level = activeGenericLevel();
  if (!level || isStoneveilWorld()) return;
  genericScene.setWorld(activeWorld(), level);
  if (prefabWorkspace.active) {
    const definition = activePrefabDefinition(level);
    if (definition) genericScene.setPrefabWorkspace(definition);
    else prefabWorkspace.active = false;
  }
  genericScene.setEnabled(true);
  genericScene.setCollisionMode(currentCollisionMode());
  if (preserveSelection) genericScene.setSelected(selected?.id ?? null);
}

function activeWorld() { return getWorldEditorWorld(activeWorldId); }
function isStoneveilWorld() { return activeWorldId === 'stoneveil-peak'; }
function activeGenericLevel() { return genericLevels.get(activeWorldId) ?? null; }
function genericStorageKey(worldId = activeWorldId) { return `${WORLD_V2_STORAGE_PREFIX}${worldId}`; }
function genericCheckpointKey(worldId = activeWorldId) { return `${WORLD_V2_CHECKPOINT_PREFIX}${worldId}`; }

const walkthroughState = {
  active: false,
  loading: false,
  fly: false,
  rapier: null,
  rapierPromise: null,
  world: null,
  terrainCollider: null,
  genericKinematics: [],
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
  entryPitch: 0,
  editorCameraBeforeWalk: null,
  selectionBeforeWalk: null
};


const canvas = $('#editor-canvas');
const app = new pc.Application(canvas, {
  graphicsDeviceOptions: { antialias: true, alpha: false }
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

function loadMinimumBrightness() {
  try {
    const value = Number(localStorage.getItem(MIN_BRIGHTNESS_KEY));
    if (Number.isFinite(value)) return clamp(value, 0.35, 0.85);
  } catch {}
  return 0.55;
}

let minimumBrightness = loadMinimumBrightness();
function applyMinimumBrightness(value = minimumBrightness) {
  minimumBrightness = clamp(Number(value) || 0.55, 0.35, 0.85);
  // This is deliberately an ambient-light floor rather than exposure. Sunlit exterior
  // surfaces retain their directional lighting while cave faces never fall near black.
  app.scene.ambientLight = new pc.Color(
    minimumBrightness * 0.94,
    minimumBrightness,
    minimumBrightness * 0.97
  );
  const slider = $('#minimum-brightness');
  const output = $('#minimum-brightness-out');
  if (slider) slider.value = String(Math.round(minimumBrightness * 100));
  if (output) output.textContent = `${Math.round(minimumBrightness * 100)}%`;
  try { localStorage.setItem(MIN_BRIGHTNESS_KEY, String(minimumBrightness)); } catch {}
}

applyMinimumBrightness();
app.start();

const sceneRoot = new pc.Entity('World Editor V2 Scene');
app.root.addChild(sceneRoot);
const stoneveilRoot = new pc.Entity('Stoneveil Legacy Editor Scene');
sceneRoot.addChild(stoneveilRoot);

const terrainRoot = new pc.Entity('Terrain Root');
const waterRoot = new pc.Entity('Water Root');
const caveMarkerRoot = new pc.Entity('Cave Marker Root');
const placedRoot = new pc.Entity('Placed Root');
const snapshotRoot = new pc.Entity('Snapshot Root');
const helperRoot = new pc.Entity('Helper Root');
const tunnelRoot = new pc.Entity('Tunnel Root');
stoneveilRoot.addChild(terrainRoot);
stoneveilRoot.addChild(waterRoot);
stoneveilRoot.addChild(caveMarkerRoot);
stoneveilRoot.addChild(placedRoot);
stoneveilRoot.addChild(snapshotRoot);
stoneveilRoot.addChild(tunnelRoot);
stoneveilRoot.addChild(helperRoot);

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
function cameraViewPayload() {
  return {
    target: { x: cameraState.target.x, y: cameraState.target.y, z: cameraState.target.z },
    yaw: cameraState.yaw,
    pitch: cameraState.pitch,
    distance: cameraState.distance
  };
}
function saveCameraViewNow() {
  if (cameraViewSaveTimer) { clearTimeout(cameraViewSaveTimer); cameraViewSaveTimer = null; }
  try { sessionStorage.setItem(CAMERA_VIEW_KEY, JSON.stringify(cameraViewPayload())); } catch {}
}
function queueCameraViewSave() {
  if (cameraViewSaveTimer) return;
  cameraViewSaveTimer = setTimeout(() => {
    cameraViewSaveTimer = null;
    saveCameraViewNow();
  }, 120);
}

const materials = {
  terrain: makeMaterial([0.49, 0.54, 0.49], 0.08),
  terrainXray: makeMaterial([0.42, 0.52, 0.49], 0.04, 0.10),
  terrainWire: makeMaterial([1.0, 0.12, 0.12], 0.02, 0.20),
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
for (const material of [materials.terrain, materials.terrainXray, materials.terrainWire]) {
  try { material.cull = pc.CULLFACE_NONE; material.update(); } catch {}
}

genericScene = new GenericWorldScene(app, sceneRoot);
slopeOverlay = new SlopeOverlay(app, stoneveilRoot, PLAYER_CONFIG);

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
  walkthroughState.genericKinematics = [];
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
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  let terrainCollider = null;
  const genericKinematics = [];

  if (isStoneveilWorld()) {
    const data = currentTerrainData ?? terrainDataForRender();
    if (!data?.positions?.length || !data?.indices?.length) {
      throw new Error('No terrain mesh is available for walkthrough collision.');
    }
    const terrainDesc = RAPIER.ColliderDesc.trimesh(
      Float32Array.from(data.positions),
      Uint32Array.from(data.indices)
    ).setFriction(1).setRestitution(0);
    terrainCollider = world.createCollider(terrainDesc);
  } else {
    for (const box of genericScene.getWalkthroughBoxes()) {
      const size = box.size ?? { x: 1, y: 1, z: 1 };
      const rotation = box.rotation ?? { x: 0, y: 0, z: 0 };
      const quat = new pc.Quat().setFromEulerAngles(rotation.x || 0, rotation.y || 0, rotation.z || 0);
      if (box.moving) {
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(box.center.x, box.center.y, box.center.z)
            .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
        );
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setFriction(.94).setRestitution(0),
          body
        );
        genericKinematics.push({
          id: box.id, definition: box.definition, body,
          entity: genericScene.movingEntities.get(box.id) ?? null
        });
      } else {
        const desc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
          .setTranslation(box.center.x, box.center.y, box.center.z)
          .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
          .setFriction(1).setRestitution(0);
        world.createCollider(desc);
      }
    }
  }

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
  walkthroughState.genericKinematics = genericKinematics;
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
    state.editorCameraBeforeWalk = {
      target: { x: cameraState.target.x, y: cameraState.target.y, z: cameraState.target.z },
      yaw: cameraState.yaw, pitch: cameraState.pitch, distance: cameraState.distance
    };
    state.selectionBeforeWalk = selected ? { kind: selected.kind, id: selected.id } : null;
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
      setWalkthroughMessage(`Walkthrough started in Fly mode because the gameplay capsule overlaps ${isStoneveilWorld() ? 'terrain' : 'scene collision'} here. Fly into open space, then press F for Walk.`);
    } else {
      setWalkthroughMessage(`Walkthrough: Walk mode active using the game capsule/slope settings${isStoneveilWorld() ? ' against the authored terrain mesh' : ' against scene/platform collision'}. F toggles Fly; Esc exits.`);
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
  state.active = false;
  state.fly = false;
  state.keys.clear();
  cameraKeys.clear();
  state.jumpQueued = false;
  document.body.classList.remove('walkthrough-active');
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();

  const previous = state.editorCameraBeforeWalk;
  if (previous) {
    cameraState.target.set(previous.target.x, previous.target.y, previous.target.z);
    cameraState.yaw = previous.yaw;
    cameraState.pitch = previous.pitch;
    cameraState.distance = previous.distance;
  }
  if (state.selectionBeforeWalk?.id) {
    selected = { ...state.selectionBeforeWalk };
    if (!isStoneveilWorld()) genericScene.setSelected(selected.id);
  }
  state.editorCameraBeforeWalk = null;
  state.selectionBeforeWalk = null;
  destroyWalkthroughPhysics();
  syncWalkthroughHud();
  updateCamera();
  renderUi();
  setStatus('Exited Walkthrough — restored the previous editor camera and selection.');
}

function advanceGenericWalkthroughKinematics(dt) {
  if (isStoneveilWorld() || !walkthroughState.genericKinematics.length) return false;
  genericScene.elapsedSeconds += Math.max(0, dt);
  for (const item of walkthroughState.genericKinematics) {
    const point = movingPlatformPose(item.definition, genericScene.elapsedSeconds);
    item.body.setNextKinematicTranslation({ x: point.x, y: point.y, z: point.z });
    if (item.entity) item.entity.setLocalPosition(point.x, point.y, point.z);
  }
  return true;
}

function updateWalkthrough(dt) {
  const state = walkthroughState;
  if (!state.active) return;
  dt = Math.min(Math.max(Number(dt) || 0, 0), .05);
  if (!(dt > 0)) return;
  const genericMoved = advanceGenericWalkthroughKinematics(dt);
  if (genericMoved) {
    state.world.timestep = dt;
    state.world.step();
  }

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
  const collisionDebug = collisionVisible();
  const material = collisionDebug ? materials.terrainWire : (xrayCoreEnabled() ? materials.terrainXray : materials.terrain);
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
  const data = terrainDataForRender();
  currentTerrainData = data;
  const normals = calculateAreaWeightedNormals(data.positions, data.indices);
  const vertexCount = Math.floor(data.positions.length / 3);
  const indexCount = data.indices.length;

  // Keep one dynamic GPU mesh alive for Stoneveil instead of destroying/recreating a
  // ~174k-triangle mesh after every sculpt click. Repeated full buffer allocation was a
  // major source of GPU-memory churn and WebGL context-loss flashes in long sessions.
  if (!terrainRenderState.mesh || !terrainRenderState.entity) {
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.clear(true, true, vertexCount, indexCount);
    const entity = new pc.Entity(isMeshMode() ? 'Frozen 3D Mountain Mesh' : 'Editable Mountain');
    entity._editorOwnedMeshes = [mesh];
    entity.addComponent('render');
    entity.render.meshInstances = [new pc.MeshInstance(mesh, materials.terrain, entity)];
    terrainRoot.addChild(entity);
    terrainRenderState.mesh = mesh;
    terrainRenderState.entity = entity;
    terrainRenderState.vertexCapacity = vertexCount;
    terrainRenderState.indexCapacity = indexCount;
  } else if (vertexCount > terrainRenderState.vertexCapacity || indexCount > terrainRenderState.indexCapacity) {
    terrainRenderState.vertexCapacity = Math.max(vertexCount, Math.ceil(terrainRenderState.vertexCapacity * 1.35));
    terrainRenderState.indexCapacity = Math.max(indexCount, Math.ceil(terrainRenderState.indexCapacity * 1.35));
    terrainRenderState.mesh.clear(true, true, terrainRenderState.vertexCapacity, terrainRenderState.indexCapacity);
  }

  const mesh = terrainRenderState.mesh;
  mesh.setPositions(data.positions);
  mesh.setNormals(normals);
  mesh.setIndices(data.indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES, true);
  terrainRenderState.entity.name = isMeshMode() ? 'Frozen 3D Mountain Mesh' : 'Editable Mountain';
  const terrainMaterial = collisionVisible() ? materials.terrainWire : (xrayCoreEnabled() ? materials.terrainXray : materials.terrain);
  terrainRenderState.entity.render.meshInstances[0].material = terrainMaterial;

  if ($('#show-slope')?.checked) slopeOverlay.setEnabled(true, data);
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
    entity.enabled = !editorHiddenStoneveilIds.has(String(item.id));
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

function isLibraryWorld(worldId = activeWorldId) { return worldId === 'library-island'; }

function genericStoredPayload(level = activeGenericLevel(), worldId = activeWorldId) {
  return isLibraryWorld(worldId) ? serializeLibrarySceneFromEditor(level) : level;
}

function loadGenericAutosave(worldId) {
  try {
    const raw = localStorage.getItem(genericStorageKey(worldId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isLibraryWorld(worldId)) return normalizeLibraryEditorPayload(parsed);
    return normalizeWorldEditorLevel(parsed, {
      worldId,
      displayName: getWorldEditorWorld(worldId).label,
      runtimeLocationId: getWorldEditorWorld(worldId).runtimeLocationId
    });
  } catch { return null; }
}

async function loadGenericProjectLevel(world, { preferAutosave = true } = {}) {
  if (preferAutosave) {
    const autosave = loadGenericAutosave(world.id);
    if (autosave) return autosave;
  }
  const response = await fetch(world.dataUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${world.label}: HTTP ${response.status}`);
  const payload = await response.json();
  if (world.kind === 'library-authored-scene') return adaptLibrarySceneToEditor(payload);
  return normalizeWorldEditorLevel(payload, {
    worldId: world.id, displayName: world.label, runtimeLocationId: world.runtimeLocationId
  });
}

function persistGenericLevel(level = activeGenericLevel()) {
  if (!level) return;
  level.updatedAt = new Date().toISOString();
  try { localStorage.setItem(genericStorageKey(level.worldId), JSON.stringify(genericStoredPayload(level, level.worldId))); }
  catch (error) { console.warn('World Editor V2 generic autosave failed.', error); }
}

function genericHistoryFor(worldId = activeWorldId) {
  if (!genericHistories.has(worldId)) genericHistories.set(worldId, []);
  return genericHistories.get(worldId);
}
function genericFutureFor(worldId = activeWorldId) {
  if (!genericFutures.has(worldId)) genericFutures.set(worldId, []);
  return genericFutures.get(worldId);
}
function saveGenericHistory() {
  const level = activeGenericLevel();
  if (!level) return;
  const stack = genericHistoryFor();
  stack.push(JSON.stringify(genericStoredPayload(level)));
  if (stack.length > 120) stack.shift();
  genericFutures.set(activeWorldId, []);
}

function commitGeneric(mutator, { rebuild = true, recordHistory = true } = {}) {
  const level = activeGenericLevel();
  if (!level) return;
  if (recordHistory) saveGenericHistory();
  mutator(level);
  level.updatedAt = new Date().toISOString();
  persistGenericLevel(level);
  if (rebuild) refreshGenericScene();
  else genericScene.setSelected(selected?.id ?? null);
  renderUi();
}

function replaceActiveGenericLevel(level, { persist = true } = {}) {
  const normalized = isLibraryWorld()
    ? normalizeLibraryEditorPayload(level)
    : normalizeWorldEditorLevel(level, {
    worldId: activeWorldId,
    displayName: activeWorld().label,
    runtimeLocationId: activeWorld().runtimeLocationId
  });
  genericLevels.set(activeWorldId, normalized);
  if (persist) persistGenericLevel(normalized);
  selected = null;
  refreshGenericScene({ preserveSelection: false });
}

function setWorldCameraDefaults(worldId) {
  if (worldId === 'skyscraper') {
    cameraState.target.set(0, 150, 0); cameraState.yaw = 38; cameraState.pitch = -10; cameraState.distance = 410;
  } else if (worldId === 'cave-fishing-island') {
    cameraState.target.set(0, 0, 0); cameraState.yaw = 42; cameraState.pitch = -22; cameraState.distance = 58;
  } else if (worldId === 'pirate-island') {
    cameraState.target.set(0, 0, 0); cameraState.yaw = 42; cameraState.pitch = -28; cameraState.distance = 82;
  } else if (worldId === 'library-island') {
    cameraState.target.set(0, 2.2, 0); cameraState.yaw = 38; cameraState.pitch = -22; cameraState.distance = 88;
  } else {
    cameraState.target.set(MOUNTAIN_CENTER.x, 105, MOUNTAIN_CENTER.z); cameraState.yaw = 42; cameraState.pitch = -24; cameraState.distance = 430;
  }
  updateCamera();
}

function enterPrefabWorkspace(definitionId, { returnSelection = selected } = {}) {
  if (isStoneveilWorld()) return false;
  const level = activeGenericLevel();
  const definition = (level?.prefabs?.definitions ?? []).find((item) => item.id === definitionId);
  if (!definition) { setStatus(`Prefab definition ${definitionId} was not found.`); return false; }
  if (!prefabWorkspace.active) {
    prefabWorkspace.returnCamera = {
      target: { x: cameraState.target.x, y: cameraState.target.y, z: cameraState.target.z },
      yaw: cameraState.yaw, pitch: cameraState.pitch, distance: cameraState.distance
    };
    prefabWorkspace.returnSelection = returnSelection ? { kind: returnSelection.kind, id: returnSelection.id } : null;
  }
  prefabWorkspace.active = true;
  prefabWorkspace.definitionId = definitionId;
  selected = null;
  genericScene.setPrefabWorkspace(definition);
  genericScene.setEnabled(true);
  genericScene.setCollisionMode(currentCollisionMode());
  cameraState.target.set(0, 1.5, 0);
  cameraState.yaw = 38;
  cameraState.pitch = -22;
  cameraState.distance = 28;
  updateCamera();
  document.body.classList.add('prefab-workspace-active');
  const banner = $('#prefab-workspace-banner');
  if (banner) banner.hidden = false;
  if ($('#prefab-workspace-name')) $('#prefab-workspace-name').textContent = `${definition.kind === 'room' ? 'Room' : 'Prefab'}: ${definition.name}`;
  if ($('#prefab-workspace-actions')) $('#prefab-workspace-actions').hidden = false;
  renderUi();
  setStatus(`Editing ${definition.name} at local origin. New objects are stored as local prefab children.`);
  return true;
}

function exitPrefabWorkspace({ restore = true } = {}) {
  if (!prefabWorkspace.active) return;
  const returnCamera = prefabWorkspace.returnCamera;
  const returnSelection = prefabWorkspace.returnSelection;
  prefabWorkspace.active = false;
  prefabWorkspace.definitionId = null;
  prefabWorkspace.returnCamera = null;
  prefabWorkspace.returnSelection = null;
  document.body.classList.remove('prefab-workspace-active');
  if ($('#prefab-workspace-banner')) $('#prefab-workspace-banner').hidden = true;
  if ($('#prefab-workspace-actions')) $('#prefab-workspace-actions').hidden = true;
  selected = restore && returnSelection ? returnSelection : null;
  refreshGenericScene();
  if (restore && returnCamera) {
    cameraState.target.set(returnCamera.target.x, returnCamera.target.y, returnCamera.target.z);
    cameraState.yaw = returnCamera.yaw;
    cameraState.pitch = returnCamera.pitch;
    cameraState.distance = returnCamera.distance;
    updateCamera();
  }
  renderUi();
  setStatus('Returned to world editing.');
}

function definitionForSelectedInstance() {
  if (isStoneveilWorld() || !selected || !['prefab-instance', 'room'].includes(selected.kind)) return null;
  const level = activeGenericLevel();
  const instance = selected.kind === 'room'
    ? (level.rooms ?? []).find((item) => item.id === selected.id)
    : (level.prefabs?.instances ?? []).find((item) => item.id === selected.id);
  if (!instance) return null;
  return (level.prefabs?.definitions ?? []).find((item) => item.id === instance.prefabId) ?? null;
}

async function switchWorld(worldId, { keepCamera = false } = {}) {
  if (prefabWorkspace.active) exitPrefabWorkspace({ restore: false });
  const world = getWorldEditorWorld(worldId);
  if (walkthroughState.active) exitWalkthrough();
  activeWorldId = world.id;
  try { localStorage.setItem(WORLD_V2_ACTIVE_KEY, activeWorldId); } catch {}
  selected = null;
  tool = 'select';
  caveConnectStart = null;
  $$('#tool-grid button').forEach((button) => button.classList.toggle('active', button.dataset.tool === 'select'));
  if (isStoneveilWorld()) {
    stoneveilRoot.enabled = true;
    genericScene.setEnabled(false);
    if ($('#show-slope')?.checked) slopeOverlay.setEnabled(true, currentTerrainData ?? terrainDataForRender());
  } else {
    stoneveilRoot.enabled = false;
    slopeOverlay.setEnabled(false);
    if (!genericLevels.has(activeWorldId)) {
      genericLevels.set(activeWorldId, await loadGenericProjectLevel(world, { preferAutosave: true }));
    }
    genericScene.setWorld(world, activeGenericLevel());
    genericScene.setEnabled(true);
    genericScene.setCollisionMode(currentCollisionMode());
  }
  if (!keepCamera) setWorldCameraDefaults(activeWorldId);
  syncWorldUi();
  rebuildAll();
  setStatus(`${world.label} loaded. ${isStoneveilWorld() ? 'Legacy authored Stoneveil patch remains the production-safe source.' : 'Edits autosave independently for this world.'}`);
}

function historyPayload(source = patch) {
  const copy = clone(source);
  // Existing-rock snapshots can dwarf terrain edits. They are not part of Undo/Redo;
  // preserve the currently loaded snapshot across history restores instead. Large terrain
  // arrays are packed into typed arrays so an authored Stoneveil history step consumes a
  // few MB instead of retaining another giant JSON string / boxed-number array graph.
  copy.bakedSnapshot = null;
  const mesh = copy.terrain?.bakedMesh;
  if (mesh?.positions && mesh?.indices) {
    mesh.positions = Float32Array.from(mesh.positions);
    mesh.indices = Uint32Array.from(mesh.indices);
  }
  return copy;
}

function trimStoneveilHistoryStack(stack) {
  const limit = isMeshMode() ? 10 : 120;
  while (stack.length > limit) stack.shift();
}

function saveHistory() {
  if (suppressHistory) return;
  history.push(historyPayload());
  trimStoneveilHistoryStack(history);
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

function restoreHistoryPayload(payload) {
  const bakedSnapshot = patch.bakedSnapshot;
  patch = normalizePatch(payload);
  if (!patch.bakedSnapshot && bakedSnapshot) patch.bakedSnapshot = bakedSnapshot;
  runtimeSnapshot = clone(patch.bakedSnapshot ?? runtimeSnapshot ?? { objects: [], rocks: [] });
}

function undo() {
  if (!isStoneveilWorld()) {
    const stack = genericHistoryFor();
    if (!stack.length) return;
    genericFutureFor().push(JSON.stringify(genericStoredPayload()));
    replaceActiveGenericLevel(JSON.parse(stack.pop()), { persist: true });
    rebuildAll();
    return;
  }
  if (!history.length) return;
  future.push(historyPayload());
  trimStoneveilHistoryStack(future);
  restoreHistoryPayload(history.pop());
  persistPatch();
  selected = null;
  syncSnapshotUi();
  rebuildAll();
}

function redo() {
  if (!isStoneveilWorld()) {
    const stack = genericFutureFor();
    if (!stack.length) return;
    genericHistoryFor().push(JSON.stringify(genericStoredPayload()));
    replaceActiveGenericLevel(JSON.parse(stack.pop()), { persist: true });
    rebuildAll();
    return;
  }
  if (!future.length) return;
  history.push(historyPayload());
  trimStoneveilHistoryStack(history);
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
    baseProjectSignature: stoneveilProjectSignature,
    terrainSignature: stoneveilTerrainSignature(patch),
    // IndexedDB performs structured cloning for put(). Passing the live object avoids
    // creating a second full 3D-mesh clone in JavaScript before that clone even starts.
    patch
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

function stoneveilTerrainSignature(source = patch) {
  const mesh = source?.terrain?.bakedMesh;
  if (!mesh?.positions?.length || !mesh?.indices?.length) return 'stoneveil:no-baked-mesh';
  let hash = 0x811c9dc5;
  const mix = (value) => { hash ^= (value >>> 0); hash = Math.imul(hash, 0x01000193) >>> 0; };
  mix(mesh.positions.length); mix(mesh.indices.length);
  // 1e-5 m quantization is far below meaningful editor precision while producing a
  // deterministic fingerprint that catches even localized terrain revisions.
  for (const value of mesh.positions) mix(Math.round(Number(value) * 100000));
  for (const value of mesh.indices) mix(Number(value));
  return `triangle-mesh-v1:${mesh.positions.length / 3}:${mesh.indices.length / 3}:${hash.toString(16).padStart(8, '0')}`;
}

function recoveryMatchesCurrentProject(record) {
  return Boolean(stoneveilProjectSignature && record?.baseProjectSignature === stoneveilProjectSignature);
}

async function recoverNewerAutosaveIfNeeded() {
  const record = await readRecoverySnapshot();
  if (!record?.patch) return false;
  if (!recoveryMatchesCurrentProject(record)) return false;
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
  // Frozen Stoneveil is far beyond the practical localStorage payload size. Stringifying the
  // whole mesh on every sculpt click caused multi-megabyte temporary allocations and repeated
  // quota failures. Mesh mode now uses IndexedDB for the actual autosave and keeps only tiny
  // metadata in localStorage. Heightfield compatibility mode retains the old localStorage path.
  if (isMeshMode()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STONEVEIL_AUTOSAVE_META_KEY, JSON.stringify({
        updatedAt: patch.updatedAt ?? null,
        baseProjectSignature: stoneveilProjectSignature,
        terrainSignature: stoneveilTerrainSignature(patch)
      }));
    } catch {}
    queueRecoverySnapshot();
    return;
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(patch)); }
  catch (error) { console.warn('Map Editor localStorage autosave unavailable; IndexedDB recovery remains active.', error); }
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
    if (!isStoneveilWorld()) {
      const record = { savedAt: new Date().toISOString(), level: clone(genericStoredPayload()) };
      localStorage.setItem(genericCheckpointKey(), JSON.stringify(record));
      setStatus(`World checkpoint saved at ${new Date(record.savedAt).toLocaleTimeString()}.`);
      return;
    }
    const record = { savedAt: new Date().toISOString(), patch: checkpointPayload() };
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(record));
    setStatus(`Checkpoint saved at ${new Date(record.savedAt).toLocaleTimeString()}.`);
  } catch (error) {
    setStatus(`Could not save checkpoint: ${error?.message || error}`);
  }
}

function restoreManualCheckpoint() {
  if (!isStoneveilWorld()) {
    let record = null;
    try { record = JSON.parse(localStorage.getItem(genericCheckpointKey()) || 'null'); } catch {}
    if (!record?.level) { setStatus('No manual checkpoint is stored for this world yet.'); return; }
    if (!confirm(`Restore the ${activeWorld().label} checkpoint from ${new Date(record.savedAt).toLocaleString()}?`)) return;
    saveGenericHistory();
    replaceActiveGenericLevel(record.level, { persist: true });
    rebuildAll();
    setStatus('World checkpoint restored.');
    return;
  }
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
  if (!isStoneveilWorld()) {
    if (!confirm(`Reload ${activeWorld().label} from its project JSON? Current autosaved edits remain available through Undo until this page is closed.`)) return;
    try {
      saveGenericHistory();
      replaceActiveGenericLevel(await loadGenericProjectLevel(activeWorld(), { preferAutosave: false }), { persist: true });
      rebuildAll();
      setStatus(`Reloaded ${activeWorld().dataUrl}.`);
    } catch (error) {
      setStatus(`Could not reload project level: ${error?.message || error}`);
    }
    return;
  }
  if (!confirm('Reload src/world/map-editor-patch.json from the project? This is useful if the file on disk still contains your pre-experiment terrain. Current editor state will remain available through Undo.')) return;
  try {
    const response = await fetch('../../src/world/map-editor-patch.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    saveHistory();
    patch = normalizePatch(data);
    stoneveilProjectSignature = stoneveilTerrainSignature(patch);
    runtimeSnapshot = clone(patch.bakedSnapshot ?? { objects: [], rocks: [] });
    selected = null;
    persistPatch();
    // Do not leave a stale older mesh in IndexedDB if a graphics reset/page reload happens
    // immediately after the user explicitly chose the project version.
    await writeRecoverySnapshot();
    syncSnapshotUi();
    rebuildAll();
    setStatus('Reloaded and pinned the project Stoneveil patch. Browser recovery now follows this project terrain revision.');
  } catch (error) {
    setStatus(`Could not reload project patch: ${error?.message || error}`);
  }
}

async function recoverBrowserAutosaveExplicitly() {
  if (!isStoneveilWorld()) { setStatus('Browser terrain recovery applies to Stoneveil.'); return; }
  const record = await readRecoverySnapshot();
  if (!record?.patch) { setStatus('No Stoneveil IndexedDB recovery snapshot is available.'); return; }
  const recovered = normalizePatch(record.patch);
  const sameBase = recoveryMatchesCurrentProject(record);
  const message = sameBase
    ? 'Recover the latest Stoneveil browser autosave? Current project state will remain available through Undo.'
    : 'This browser recovery was created from a DIFFERENT Stoneveil project terrain revision. Recover it anyway? Use this only if you intentionally want the older/different branch.';
  if (!confirm(message)) return;
  saveHistory();
  patch = recovered;
  runtimeSnapshot = clone(patch.bakedSnapshot ?? { objects: [], rocks: [] });
  selected = null;
  persistPatch();
  syncSnapshotUi();
  rebuildAll();
  setStatus(sameBase ? 'Recovered the compatible browser autosave.' : 'Recovered a browser autosave from a different project revision by explicit request.');
}

function rebuildAll() {
  if (!isStoneveilWorld()) {
    const level = activeGenericLevel();
    if (level) {
      refreshGenericScene();
    }
    renderUi();
    return;
  }
  stoneveilRoot.enabled = true;
  genericScene.setEnabled(false);
  rebuildTerrain();
  rebuildPlacedObjects();
  rebuildSnapshotObjects();
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
  trimStoneveilHistoryStack(history);
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

function applyGenericToolAt(event) {
  const level = activeGenericLevel();
  if (!level) return;
  const ray = pointerRay(event);
  const definition = activePrefabDefinition(level);
  if (tool === 'select') {
    const hit = genericScene.pick(ray);
    selected = hit ? { kind: hit.kind, id: String(hit.id), record: hit.record } : null;
    genericScene.setSelected(selected?.id ?? null);
    renderUi();
    return;
  }
  if (activeWorldId === 'cave-fishing-island' && ['raise', 'lower', 'smooth', 'indent', 'pull-core'].includes(tool)) {
    const hit = genericScene.basaltTerrainHit(ray);
    if (!hit) {
      setStatus('Load the captured Basalt production mesh first, then sculpt the frozen candidate.');
      return;
    }
    const radius = Number($('#brush-radius')?.value) || 4;
    const strength = Number($('#brush-strength')?.value) || 1;
    let changed = 0;
    commitGeneric((draft) => {
      if (draft.terrain?.mode !== 'authored-mesh-candidate') return;
      changed = sculptTriangleMesh(draft.terrain, hit, tool, radius, strength);
      draft.terrain.editedAt = new Date().toISOString();
      draft.sourcePolicy.terrain = 'authored-candidate';
    });
    if (changed) {
      genericScene.setBasaltReferenceMode('authored');
      if ($('#basalt-reference-mode')) $('#basalt-reference-mode').value = 'authored';
      setStatus(`Basalt ${tool}: edited ${changed} connected mesh vertices. Production still uses the procedural reference until you explicitly promote it later.`);
    }
    return;
  }
  if (tool === 'move-water') {
    const expectedKinds = prefabWorkspace.active ? ['prefab-child-water'] : ['water-v2'];
    if (!expectedKinds.includes(selected?.kind)) {
      const hit = genericScene.pick(ray);
      if (hit && expectedKinds.includes(hit.kind)) {
        selected = { kind: hit.kind, id: String(hit.id), record: hit.record };
        genericScene.setSelected(selected.id);
        renderUi();
      } else setStatus('Select a water first, then click Move Water.');
      return;
    }
    const surface = genericScene.surfaceHit(ray);
    if (!surface) return;
    commitGeneric((draft) => {
      const owner = prefabWorkspace.active
        ? (draft.prefabs?.definitions ?? []).find((item) => item.id === prefabWorkspace.definitionId)
        : draft;
      const water = (owner?.waters ?? []).find((item) => String(item.id || item.identity) === selected.id);
      if (!water) return;
      water.position ??= { x: 0, y: 0, z: 0 };
      const snapped = maybeSnapPosition({ x: surface.x, y: water.position.y, z: surface.z });
      water.position.x = snapped.x;
      water.position.z = snapped.z;
    });
    setStatus(`Moved ${selected.id} without changing its canonical water identity.`);
    return;
  }
  if (!['object', 'platform', 'moving-platform'].includes(tool)) return;
  let surface = genericScene.surfaceHit(ray);
  if (!surface) { setStatus('No placement surface under the cursor.'); return; }
  if (!$('#surface-snap')?.checked) {
    if (Math.abs(ray.direction.y) < 1e-6) return;
    const distance = -ray.origin.y / ray.direction.y;
    if (distance < 0) return;
    const point = ray.origin.clone().add(ray.direction.clone().mulScalar(distance));
    surface = { x: point.x, y: 0, z: point.z, normal: { x: 0, y: 1, z: 0 }, kind: 'ground-plane' };
  }
  const size = {
    x: Math.max(.2, Number($('#platform-x')?.value) || 3),
    y: Math.max(.1, Number($('#platform-y')?.value) || .35),
    z: Math.max(.2, Number($('#platform-z')?.value) || 2)
  };
  const normal = surface.normal ?? { x: 0, y: 1, z: 0 };
  let position = { x: surface.x, y: surface.y, z: surface.z };
  let yaw = 0;
  if (Math.abs(normal.y) > .65) {
    position.y += Math.sign(normal.y || 1) * size.y / 2;
  } else {
    // Wall/surface placement keeps ledges horizontal but offsets them out from the facade.
    position.x += normal.x * Math.max(.08, size.z / 2);
    position.z += normal.z * Math.max(.08, size.z / 2);
    yaw = Math.abs(normal.x) > Math.abs(normal.z) ? 90 : 0;
  }
  position = maybeSnapPosition(position);
  yaw = maybeSnapRotation(yaw);
  const climbMaterial = $('#platform-climb-material')?.value || 'normal';
  const targetObjects = definition?.objects ?? level.objects;
  const targetMoving = definition?.movingPlatforms ?? level.movingPlatforms;
  if (tool === 'object' || tool === 'platform') {
    const prefix = tool === 'platform' ? 'PARKOUR' : 'OBJECT';
    const category = tool === 'platform' ? 'parkour' : 'decor';
    const id = definition ? nextPrefabChildId(definition, prefix) : nextStableId(level, prefix);
    const item = {
      id, name: `${tool === 'platform' ? 'Parkour Platform' : 'World Object'} ${id.split('-').at(-1)}`, type: 'box', category,
      transform: { position, rotation: { x: 0, y: yaw, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      size, collision: true, climbMaterial, visible: true,
      metadata: activeWorldId === 'skyscraper' && !prefabWorkspace.active
        ? { routeGroup: 'Unassigned' }
        : isLibraryWorld()
          ? {
              librarySourceKind: definition ? 'prefab-part' : 'part', librarySourceId: id,
              librarySourceHadId: true, materialKey: 'stone', materialRole: 'stone', authoredPrimitive: 'box'
            }
          : {}
    };
    commitGeneric((draft) => {
      const owner = prefabWorkspace.active
        ? (draft.prefabs?.definitions ?? []).find((entry) => entry.id === prefabWorkspace.definitionId)
        : draft;
      owner?.objects?.push(item);
    });
    selected = { kind: definition ? 'prefab-child-object' : 'world-object', id, record: item };
    genericScene.setSelected(id);
    renderUi();
    setStatus(`Placed ${definition ? 'prefab child' : category === 'parkour' ? 'static parkour object' : 'authored world object'} ${id}.`);
    return;
  }
  const id = definition ? nextPrefabChildId(definition, 'MOVING') : nextStableId(level, 'MOVING-PLATFORM');
  const second = { x: position.x, y: position.y + 4, z: position.z };
  const item = {
    id, name: `Moving Platform ${id.split('-').at(-1)}`, type: 'moving-platform', category: 'moving-platforms',
    transform: { position: structuredClone(position), rotation: { x: 0, y: yaw, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    size, collision: true, climbMaterial, visible: true,
    path: { points: [structuredClone(position), second], speed: 2.5, pauseSeconds: .5, mode: 'ping-pong', phaseSeconds: 0 },
    metadata: activeWorldId === 'skyscraper' && !prefabWorkspace.active ? { routeGroup: 'Unassigned' } : {}
  };
  commitGeneric((draft) => {
    const owner = prefabWorkspace.active
      ? (draft.prefabs?.definitions ?? []).find((entry) => entry.id === prefabWorkspace.definitionId)
      : draft;
    owner?.movingPlatforms?.push(item);
  });
  selected = { kind: definition ? 'prefab-child-moving' : 'moving-platform', id, record: item };
  genericScene.setSelected(id);
  renderUi();
  setStatus(`Placed ${id}. Edit its waypoints, speed, pause and path mode in Selected.`);
}

function applyToolAt(event, continuous = false) {
  if (!isStoneveilWorld()) {
    applyGenericToolAt(event);
    return;
  }
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

function syncWorldUi() {
  const world = activeWorld();
  const selector = $('#world-selector');
  if (selector && selector.value !== world.id) selector.value = world.id;
  const stoneveil = isStoneveilWorld();
  const caveTerrain = world.id === 'cave-fishing-island' && worldHasCapability(world.id, 'terrain');
  for (const id of ['rock-palette-section', 'plant-palette-section', 'decor-palette-section', 'mountain-profile-section', 'mesh-mode-section']) {
    const element = $(`#${id}`);
    if (element) element.hidden = !stoneveil;
  }
  if ($('#brush-section')) $('#brush-section').hidden = !(stoneveil || caveTerrain);
  $('#generic-palette-section').hidden = !(worldHasCapability(world.id, 'parkour') || worldHasCapability(world.id, 'objects') || worldHasCapability(world.id, 'prefabs') || worldHasCapability(world.id, 'rooms'));
  if ($('#cave-migration-section')) $('#cave-migration-section').hidden = world.id !== 'cave-fishing-island';
  if ($('#skyscraper-room-library-section')) $('#skyscraper-room-library-section').hidden = world.id !== 'skyscraper';
  if ($('#pirate-asset-library-section')) $('#pirate-asset-library-section').hidden = world.id !== 'pirate-island';
  if ($('#skyscraper-interior-wrap')) $('#skyscraper-interior-wrap').hidden = world.id !== 'skyscraper';
  if ($('#create-prefab-foundation')) $('#create-prefab-foundation').hidden = !worldHasCapability(world.id, 'prefabs');
  if ($('#create-room-foundation')) $('#create-room-foundation').hidden = !worldHasCapability(world.id, 'rooms');
  if (world.id === 'cave-fishing-island' && $('#basalt-freeze-status')) {
    const candidate=activeGenericLevel()?.terrain?.mode === 'authored-mesh-candidate' ? activeGenericLevel().terrain : null;
    $('#basalt-freeze-status').textContent=candidate ? `Candidate: ${Math.floor((candidate.positions?.length||0)/3).toLocaleString()} verts / ${Math.floor((candidate.indices?.length||0)/3).toLocaleString()} triangles · comparison only.` : 'No frozen candidate imported.';
  }
  $('#xray-core').closest('label').hidden = !stoneveil;
  $('#slope-toggle-wrap').hidden = !stoneveil;
  $('#show-snapshot-rocks').closest('label').hidden = !stoneveil;
  $('#import-snapshot').hidden = !stoneveil;
  $('#bake-snapshot').hidden = !stoneveil;
  $('#freeze-core').hidden = !stoneveil;
  if ($('#recover-browser-autosave')) $('#recover-browser-autosave').hidden = !stoneveil;
  $('#checkpoint').textContent = stoneveil ? 'Checkpoint' : 'Checkpoint World';
  $('#restore-checkpoint').textContent = stoneveil ? 'Restore Checkpoint' : 'Restore World Checkpoint';
  $('#save-patch').textContent = stoneveil ? 'Save Stoneveil Patch' : 'Save World Level';
  $('#summary-heading').textContent = stoneveil ? 'Stoneveil Summary' : `${world.label} Summary`;
  const capabilityByTool = {
    raise: 'terrain', lower: 'terrain', smooth: 'terrain', indent: 'terrain', 'pull-core': 'terrain', 'connect-cave': 'terrain',
    rock: 'rocks', plant: 'vegetation', decor: 'decor', 'move-water': 'water',
    object: 'objects', platform: 'parkour', 'moving-platform': 'moving-platforms'
  };
  for (const button of $$('#tool-grid button')) {
    const capability = capabilityByTool[button.dataset.tool];
    button.hidden = Boolean(capability && !worldHasCapability(world.id, capability));
  }
}

function renderGenericSelection() {
  const empty = $('#selection-empty');
  const editor = $('#selection-editor');
  const record = selected ? genericScene.selectedRecord(selected.id) : null;
  if (!selected || !record) {
    selected = null;
    empty.hidden = false;
    editor.hidden = true;
    return;
  }
  empty.hidden = true;
  editor.hidden = false;
  $('#selected-name').textContent = record.name || record.label || record.id || selected.id;
  $('#selected-id').textContent = selected.id;
  const fields = $('#selection-fields');
  fields.innerHTML = '';

  const meta = document.createElement('dl');
  meta.className = 'inspector-meta';
  const parentLabel = record.parentId || record.prefabInstanceId || (selected.kind === 'room' || selected.kind === 'prefab-instance' ? record.prefabId : null) || '—';
  const materialRole = record.metadata?.materialRole || record.metadata?.materialKey || '—';
  const libraryKind = record.metadata?.librarySourceKind || '—';
  meta.innerHTML = `<dt>Type</dt><dd>${selected.kind}</dd><dt>Stable ID</dt><dd title="${selected.id}">${selected.id}</dd><dt>Parent / source</dt><dd title="${parentLabel}">${parentLabel}</dd>${activeWorldId === 'library-island' ? `<dt>Authored role</dt><dd>${libraryKind}</dd><dt>Material role</dt><dd>${materialRole}</dd>` : ''}`;
  fields.appendChild(meta);

  if (!['architecture-reference', 'waypoint'].includes(selected.kind)) {
    const nameWrap = document.createElement('label');
    nameWrap.className = 'inspector-name';
    nameWrap.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = record.name || record.label || selected.id;
    nameInput.maxLength = 80;
    nameInput.addEventListener('change', () => renameGenericRecord(selected, nameInput.value));
    nameWrap.appendChild(nameInput);
    fields.appendChild(nameWrap);
  }

  if (selected.kind === 'architecture-reference') {
    const note = document.createElement('p');
    note.className = 'compact-help';
    note.innerHTML = `<strong>Runtime visual reference.</strong> Asset: ${record.asset}. Attribution: ${record.attribution}. Collision: ${record.collision}.`;
    fields.appendChild(note);
    $('#duplicate-selected').disabled = true;
    $('#hide-selected').disabled = true;
    $('#rename-selected').disabled = true;
    $('#edit-source-prefab').hidden = true;
    return;
  }

  if (selected.kind === 'waypoint') {
    const note = document.createElement('p');
    note.className = 'compact-help';
    note.textContent = `Waypoint ${Number(record.index) + 1} for ${record.platformId}. Drag it in the viewport or edit the parent platform numerically.`;
    fields.appendChild(note);
    $('#duplicate-selected').disabled = true;
    $('#hide-selected').disabled = false;
    $('#rename-selected').disabled = true;
    $('#edit-source-prefab').hidden = true;
    return;
  }

  const addNumberGrid = (defs, handler) => fields.appendChild(fieldGrid(defs, handler));
  if (selected.kind === 'water-v2' || selected.kind === 'prefab-child-water') {
    record.position ??= { x: 0, y: 0, z: 0 };
    record.radii ??= { x: 4, z: 4 };
    addNumberGrid([
      ['X', record.position.x, 'gpx'], ['Surface Y', record.position.y, 'gpy'], ['Z', record.position.z, 'gpz'],
      ['X radius', record.radii.x, 'wrx'], ['Z radius', record.radii.z, 'wrz'],
      ['Depth m', record.depthMeters ?? 1, 'wdepth'], ['Fishing scale', record.fishingZoneScale ?? 1, 'wfishing']
    ], onGenericField);
    const identity = document.createElement('p');
    identity.className = 'compact-help';
    identity.textContent = `Fishing identity: ${record.identity || record.id}. Geometry edits preserve this ecology ID.`;
    fields.appendChild(identity);
    $('#duplicate-selected').disabled = true;
    $('#hide-selected').disabled = isLibraryWorld() && selected.kind === 'water-v2';
    $('#rename-selected').disabled = false;
    $('#edit-source-prefab').hidden = true;
    return;
  }

  record.transform ??= { position: {x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scale:{x:1,y:1,z:1} };
  const rootLike = ['prefab-instance', 'room'].includes(selected.kind);
  if (rootLike) {
    addNumberGrid([
      ['X', record.transform.position.x, 'gpx'], ['Y', record.transform.position.y, 'gpy'], ['Z', record.transform.position.z, 'gpz'],
      ['Rot X°', record.transform.rotation.x, 'grx'], ['Rot Y°', record.transform.rotation.y, 'gry'], ['Rot Z°', record.transform.rotation.z, 'grz'],
      ['Scale X', record.transform.scale.x, 'gscalex'], ['Scale Y', record.transform.scale.y, 'gscaley'], ['Scale Z', record.transform.scale.z, 'gscalez']
    ], onGenericField);
    const note = document.createElement('p');
    note.className = 'compact-help';
    note.textContent = `${selected.kind === 'room' ? 'Room' : 'Prefab'} root → ${record.prefabId}. Children remain local when this root moves.`;
    fields.appendChild(note);
    $('#edit-source-prefab').hidden = false;
  } else {
    record.size ??= { x: 1, y: 1, z: 1 };
    addNumberGrid([
      ['X', record.transform.position.x, 'gpx'], ['Y', record.transform.position.y, 'gpy'], ['Z', record.transform.position.z, 'gpz'],
      ['Rot X°', record.transform.rotation.x, 'grx'], ['Rot Y°', record.transform.rotation.y, 'gry'], ['Rot Z°', record.transform.rotation.z, 'grz'],
      ['Size X', record.size.x, 'gsx'], ['Size Y', record.size.y, 'gsy'], ['Size Z', record.size.z, 'gsz']
    ], onGenericField);
    $('#edit-source-prefab').hidden = true;
  }

  if (record.metadata?.librarySourceKind === 'light') {
    addNumberGrid([
      ['Intensity', record.metadata.lightIntensity ?? 1, 'lightintensity'],
      ['Range', record.metadata.lightRange ?? 10, 'lightrange']
    ], onGenericField);
    const color = record.metadata.lightColor ?? [1, 1, 1];
    const note = document.createElement('p');
    note.className = 'compact-help';
    note.textContent = `${record.metadata.lightType || 'omni'} light · RGB ${color.map((value) => Number(value).toFixed(2)).join(' / ')}`;
    fields.appendChild(note);
  }
  if (record.metadata?.librarySourceKind === 'marker') {
    const note = document.createElement('p');
    note.className = 'compact-help';
    note.textContent = `Interaction marker: ${record.metadata.markerKind || 'interaction'}.`;
    fields.appendChild(note);
  }
  if (record.metadata?.librarySourceKind === 'bench' && record.metadata.fishingFacing) {
    const note = document.createElement('p');
    note.className = 'compact-help';
    note.textContent = `Fishing bench faces canonical water ${record.metadata.fishingFacing}.`;
    fields.appendChild(note);
  }
  if (activeWorldId === 'library-island' && record.metadata?.materialKey === 'mist') {
    const opacity = activeGenericLevel()?.librarySceneSource?.materials?.mist?.opacity;
    const note = document.createElement('p');
    note.className = 'compact-help';
    note.textContent = `Localized mist volume · authored material opacity ${Number(opacity ?? 0).toFixed(2)}. This does not alter global fog.`;
    fields.appendChild(note);
  }

  if (activeWorldId === 'skyscraper' && !prefabWorkspace.active && ['world-object', 'moving-platform'].includes(selected.kind)) {
    const route = document.createElement('label');
    route.textContent = 'Route group';
    const routeSelect = document.createElement('select');
    for (const value of ['Unassigned', 'Route A', 'Route B', 'Route C', 'Route D', 'Shared / Crossover']) routeSelect.append(new Option(value, value));
    routeSelect.value = record.metadata?.routeGroup || 'Unassigned';
    routeSelect.addEventListener('change', () => commitGeneric((draft) => {
      const item = [...(draft.objects ?? []), ...(draft.movingPlatforms ?? [])].find((candidate) => candidate.id === selected.id);
      if (!item) return;
      item.metadata ??= {};
      item.metadata.routeGroup = routeSelect.value;
    }));
    route.appendChild(routeSelect);
    fields.appendChild(route);
  }

  if (selected.kind === 'moving-platform' || selected.kind === 'prefab-child-moving') {
    const path = record.path ??= { points: [], speed: 2.5, pauseSeconds: .5, mode: 'ping-pong', phaseSeconds: 0 };
    path.points ??= [structuredClone(record.transform.position), { ...record.transform.position, y: record.transform.position.y + 4 }];
    addNumberGrid([
      ['Speed m/s', path.speed, 'mpspeed'], ['Pause s', path.pauseSeconds, 'mppause'], ['Phase s', path.phaseSeconds, 'mpphase']
    ], onGenericField);
    const count = document.createElement('div');
    count.className = 'compact-help';
    count.textContent = `${path.points.length} waypoints · click/drag orange waypoint handles in the viewport.`;
    fields.appendChild(count);
    path.points.forEach((point, index) => {
      const title = document.createElement('div');
      title.className = 'compact-help';
      title.textContent = `Waypoint ${index + 1}`;
      fields.appendChild(title);
      addNumberGrid([
        ['X', point.x, `mp${index}x`], ['Y', point.y, `mp${index}y`], ['Z', point.z, `mp${index}z`]
      ], onGenericField);
      if (path.points.length > 2) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'subtle';
        remove.textContent = `Delete waypoint ${index + 1}`;
        remove.addEventListener('click', () => removeMovingPlatformWaypoint(index));
        fields.appendChild(remove);
      }
    });
    const mode = document.createElement('label');
    mode.textContent = 'Path mode';
    const select = document.createElement('select');
    for (const value of ['ping-pong', 'loop', 'once']) select.append(new Option(value, value));
    select.value = path.mode || 'ping-pong';
    select.addEventListener('change', (event) => mutateSelectedGenericRecord((item) => { item.path.mode = event.target.value; }));
    mode.appendChild(select);
    fields.appendChild(mode);
    const addWaypoint = document.createElement('button');
    addWaypoint.type = 'button';
    addWaypoint.textContent = 'Add Waypoint';
    addWaypoint.addEventListener('click', () => mutateSelectedGenericRecord((item) => {
      const last = item.path.points.at(-1) ?? item.transform.position;
      item.path.points.push({ x: last.x, y: last.y + 2, z: last.z });
    }));
    fields.appendChild(addWaypoint);
  }
  $('#duplicate-selected').disabled = false;
  $('#hide-selected').disabled = false;
  $('#rename-selected').disabled = false;
}

function mutateSelectedGenericRecord(mutator, { rebuild = true } = {}) {
  if (!selected || isStoneveilWorld()) return;
  commitGeneric((draft) => {
    let record = null;
    if (prefabWorkspace.active) {
      const definition = (draft.prefabs?.definitions ?? []).find((entry) => entry.id === prefabWorkspace.definitionId);
      record = (definition?.objects ?? []).find((item) => item.id === selected.id)
        ?? (definition?.movingPlatforms ?? []).find((item) => item.id === selected.id)
        ?? (definition?.waters ?? []).find((item) => String(item.id || item.identity) === selected.id);
    } else {
      record = (draft.objects ?? []).find((item) => item.id === selected.id)
        ?? (draft.movingPlatforms ?? []).find((item) => item.id === selected.id)
        ?? (draft.waters ?? []).find((item) => String(item.id || item.identity) === selected.id)
        ?? (draft.prefabs?.instances ?? []).find((item) => item.id === selected.id)
        ?? (draft.rooms ?? []).find((item) => item.id === selected.id);
    }
    if (record) mutator(record, draft);
  }, { rebuild });
}

function onGenericField(event) {
  if (!selected || isStoneveilWorld()) return;
  const key = event.currentTarget.dataset.key;
  let value = Number(event.currentTarget.value);
  if (!Number.isFinite(value)) return;
  if (['gpx','gpy','gpz'].includes(key) && gridSnapEnabled()) value = snapNumber(value, gridSnapStep());
  if (['grx','gry','grz'].includes(key)) value = maybeSnapRotation(value);
  mutateSelectedGenericRecord((record) => {
    if (['water-v2','prefab-child-water'].includes(selected.kind)) {
      record.position ??= { x: 0, y: 0, z: 0 };
      record.radii ??= { x: 4, z: 4 };
      if (key === 'gpx') record.position.x = value;
      if (key === 'gpy') record.position.y = value;
      if (key === 'gpz') record.position.z = value;
      if (key === 'wrx') record.radii.x = Math.max(.1, value);
      if (key === 'wrz') record.radii.z = Math.max(.1, value);
      if (key === 'wdepth') record.depthMeters = Math.max(.05, value);
      if (key === 'wfishing') record.fishingZoneScale = Math.max(.05, value);
      return;
    }
    const t = record.transform;
    if (!t) return;
    if (key === 'gpx') t.position.x = value;
    if (key === 'gpy') t.position.y = value;
    if (key === 'gpz') t.position.z = value;
    if (key === 'grx') t.rotation.x = value;
    if (key === 'gry') t.rotation.y = value;
    if (key === 'grz') t.rotation.z = value;
    if (key === 'gscalex') t.scale.x = Math.max(.001, value);
    if (key === 'gscaley') t.scale.y = Math.max(.001, value);
    if (key === 'gscalez') t.scale.z = Math.max(.001, value);
    if (key === 'gsx') record.size.x = Math.max(.05, value);
    if (key === 'gsy') record.size.y = Math.max(.05, value);
    if (key === 'gsz') record.size.z = Math.max(.05, value);
    if (key === 'lightintensity') record.metadata.lightIntensity = Math.max(0, value);
    if (key === 'lightrange') record.metadata.lightRange = Math.max(.1, value);
    if (selected.kind === 'moving-platform' || selected.kind === 'prefab-child-moving') {
      if (key === 'mpspeed') record.path.speed = Math.max(.05, value);
      if (key === 'mppause') record.path.pauseSeconds = Math.max(0, value);
      if (key === 'mpphase') record.path.phaseSeconds = value;
      const match = /^mp(\d+)([xyz])$/.exec(key);
      if (match) {
        const point = record.path.points[Number(match[1])];
        if (point) point[match[2]] = gridSnapEnabled() ? snapNumber(value, gridSnapStep()) : value;
      }
    }
  });
}

function removeMovingPlatformWaypoint(index) {
  if (!selected || !['moving-platform','prefab-child-moving'].includes(selected.kind)) return;
  mutateSelectedGenericRecord((record) => {
    if ((record.path?.points?.length ?? 0) <= 2) return;
    record.path.points.splice(index, 1);
  });
}

function renameGenericRecord(target, rawName) {
  const value = String(rawName || '').trim().slice(0, 80);
  if (!value || !target) return;
  const previous = selected;
  selected = target;
  mutateSelectedGenericRecord((record) => { record.name = value; });
  selected = previous;
}

function loadOutlinerGroupPrefs() {
  try { return JSON.parse(localStorage.getItem(OUTLINER_GROUP_PREFS_KEY) || '{}') || {}; } catch { return {}; }
}
function saveOutlinerGroupPrefs(value) { try { localStorage.setItem(OUTLINER_GROUP_PREFS_KEY, JSON.stringify(value)); } catch {} }

function genericItemHidden(item) { return genericScene?.isEditorHidden?.(item.id) ?? false; }
function setEditorItemHidden(item, hidden) {
  if (isStoneveilWorld()) {
    if (hidden) editorHiddenStoneveilIds.add(String(item.id)); else editorHiddenStoneveilIds.delete(String(item.id));
    rebuildPlacedObjects();
    return;
  }
  genericScene.setEditorHidden(item.id, hidden);
  renderOutliner();
}

function focusOutlinerItem(item) {
  const previous = selected;
  selected = { kind: item.kind, id: item.id };
  if (!isStoneveilWorld()) genericScene.setSelected(item.id);
  const ok = focusSelectedObject();
  selected = { kind: item.kind, id: item.id };
  if (!isStoneveilWorld()) genericScene.setSelected(item.id);
  renderUi();
  if (!ok) selected = previous;
}

function renameOutlinerItem(item) {
  if (!item.renameable) return;
  const value = prompt('Rename authored object', item.name || item.id);
  if (!value?.trim()) return;
  if (isStoneveilWorld()) {
    const record = patch.placedObjects.find((entry) => entry.id === item.id);
    if (record) commit(() => { record.name = value.trim().slice(0, 80); }, { placed: true });
  } else {
    renameGenericRecord({ kind: item.kind, id: item.id }, value);
  }
  renderUi();
}

function deleteOutlinerItem(item) {
  selected = { kind: item.kind, id: item.id };
  hideSelected();
}

function renderOutliner() {
  const outliner = $('#outliner');
  if (!outliner) return;
  outliner.innerHTML = '';
  const groups = [];
  if (isStoneveilWorld()) {
    groups.push(['Terrain', [{ id: 'terrain', name: `Frozen mesh · ${Math.round((patch.terrain.bakedMesh?.positions?.length || 0) / 3).toLocaleString()} verts`, kind: 'meta', type: 'terrain' }]]);
    groups.push(['Waters', MOUNTAIN_FISHING_LOCATIONS.map((item) => ({ id: item.id, name: item.label, kind: 'water', type: 'water', renameable: false, deletable: false }))]);
    const byType = (type) => (patch.placedObjects ?? []).filter((item) => item.type === type).map((item) => ({ id:item.id, name:item.name||item.id, kind:'placed', type, renameable:true, deletable:true, hideable:true }));
    groups.push(['Rocks', byType('rock')]);
    groups.push(['Vegetation', byType('plant')]);
    groups.push(['Decor', byType('decor')]);
  } else if (prefabWorkspace.active) {
    const definition = activePrefabDefinition();
    groups.push(['Prefab / Room Root', [{ id: definition?.id || 'definition', name: definition?.name || 'Definition', kind:'meta', type:definition?.kind || 'prefab' }]]);
    const prefabObjects = definition?.objects ?? [];
    const componentNames = [...new Set(prefabObjects.map((item) => item.metadata?.componentName).filter(Boolean))];
    if (componentNames.length) {
      for (const componentName of componentNames) {
        groups.push([componentName, prefabObjects.filter((item) => item.metadata?.componentName === componentName).map((item) => ({ id:item.id,name:item.name||item.id,kind:'prefab-child-object',type:item.type||'object',renameable:true,deletable:true,hideable:true }))]);
      }
      const loose = prefabObjects.filter((item) => !item.metadata?.componentName);
      if (loose.length) groups.push(['Other Children', loose.map((item) => ({ id:item.id,name:item.name||item.id,kind:'prefab-child-object',type:item.type||'object',renameable:true,deletable:true,hideable:true }))]);
    } else groups.push(['Children', prefabObjects.map((item) => ({ id:item.id,name:item.name||item.id,kind:'prefab-child-object',type:item.type||'object',renameable:true,deletable:true,hideable:true }))]);
    groups.push(['Moving Platforms', (definition?.movingPlatforms ?? []).map((item) => ({ id:item.id,name:item.name||item.id,kind:'prefab-child-moving',type:'moving-platform',renameable:true,deletable:true,hideable:true }))]);
    groups.push(['Waters', (definition?.waters ?? []).map((item) => ({ id:String(item.id||item.identity),name:item.name||item.id,kind:'prefab-child-water',type:'water',renameable:true,deletable:true,hideable:true }))]);
  } else {
    const level = activeGenericLevel();
    if (activeWorldId === 'skyscraper') groups.push(['ESB Reference', [{ id:'__architecture__', name:'Empire State Building', kind:'architecture-reference', type:'reference' }]]);
    groups.push(['Waters', (level?.waters ?? []).map((item) => ({
      id:String(item.id||item.identity), name:item.name||item.id, kind:'water-v2', type:'water',
      renameable:true, deletable:activeWorldId !== 'library-island', hideable:true
    }))]);
    const objects = (level?.objects ?? []).map((item) => ({ id:item.id,name:item.name||item.id,kind:'world-object',type:item.type||item.category||'object',renameable:true,deletable:true,hideable:true, route:item.metadata?.routeGroup || 'Unassigned' }));
    if (activeWorldId === 'skyscraper') {
      for (const route of ['Route A','Route B','Route C','Route D','Shared / Crossover','Unassigned']) {
        const items = objects.filter((item) => item.route === route);
        const movers = (level?.movingPlatforms ?? []).filter((item) => (item.metadata?.routeGroup || 'Unassigned') === route).map((item) => ({ id:item.id,name:item.name||item.id,kind:'moving-platform',type:'moving-platform',renameable:true,deletable:true,hideable:true,route }));
        if (items.length || movers.length) groups.push([route, [...items, ...movers]]);
      }
    } else if (activeWorldId === 'library-island') {
      const sourceObjects = level?.objects ?? [];
      const categoryOrder = [
        'Architecture — Arrival / Entrance', 'Grand Reading Areas', 'Archive Areas',
        'Waterfall Atrium', 'Study Areas', 'Hidden Archive Areas', 'Upper Galleries',
        'Bridges / Terraces', 'Waterfalls / Decorative Water', 'Decorative Water',
        'Lights', 'Benches', 'Markers / Interactions', 'Mist / Atmosphere',
        'Landscaping / Decor', 'Architecture / Misc'
      ];
      for (const category of categoryOrder) {
        const items = sourceObjects.filter((item) => item.category === category).map((item) => ({
          id:item.id, name:item.name||item.id, kind:'world-object', type:item.type||'object',
          renameable:true, deletable:true, hideable:true
        }));
        if (items.length) groups.push([category, items]);
      }
    } else {
      groups.push(['Objects', objects]);
      groups.push(['Moving Platforms', (level?.movingPlatforms ?? []).map((item) => ({ id:item.id,name:item.name||item.id,kind:'moving-platform',type:'moving-platform',renameable:true,deletable:true,hideable:true }))]);
    }
    groups.push(['Prefab Instances', (level?.prefabs?.instances ?? []).map((item) => ({ id:item.id,name:item.name||item.id,kind:'prefab-instance',type:'prefab',renameable:true,deletable:true,hideable:true }))]);
    groups.push(['Rooms', (level?.rooms ?? []).map((item) => ({ id:item.id,name:item.name||item.id,kind:'room',type:'room',renameable:true,deletable:true,hideable:true }))]);
  }

  const prefs = loadOutlinerGroupPrefs();
  const filter = outlinerFilter.trim().toLowerCase();
  let shown = 0;
  for (const [name, sourceItems] of groups) {
    const items = sourceItems.filter((item) => !filter || `${item.name} ${item.id} ${item.type} ${item.route || ''}`.toLowerCase().includes(filter));
    if (!items.length && filter) continue;
    const groupKey = `${activeWorldId}:${prefabWorkspace.active ? prefabWorkspace.definitionId : 'world'}:${name}`;
    const collapsed = Boolean(prefs[groupKey]);
    const row = document.createElement('div');
    row.className = `outliner-group-row${collapsed ? ' collapsed' : ''}`;
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'outliner-group-toggle'; toggle.textContent = `${name} (${items.length})`;
    toggle.addEventListener('click', () => { prefs[groupKey] = !collapsed; saveOutlinerGroupPrefs(prefs); renderOutliner(); });
    row.appendChild(toggle); outliner.appendChild(row);
    if (collapsed) continue;
    for (const item of items) {
      shown += 1;
      if (item.kind === 'meta') {
        const meta = document.createElement('div'); meta.className='outliner-empty'; meta.textContent=item.name; meta.title=item.id; outliner.appendChild(meta); continue;
      }
      const itemRow = document.createElement('div');
      itemRow.className = `outliner-row${genericItemHidden(item) || (isStoneveilWorld() && editorHiddenStoneveilIds.has(String(item.id))) ? ' hidden-record' : ''}`;
      const main = document.createElement('button'); main.type='button'; main.className='outliner-main';
      if (selected?.id === item.id) main.classList.add('selected');
      main.title = `${item.id} · ${item.type}`;
      main.innerHTML = `<span class="outliner-name">${item.name}</span><span class="outliner-type">${item.type}</span>`;
      main.addEventListener('click', () => { selected={kind:item.kind,id:item.id}; if(!isStoneveilWorld()) genericScene.setSelected(item.id); renderUi(); });
      itemRow.appendChild(main);
      const actions = [
        ['◎','Focus',()=>focusOutlinerItem(item),true],
        [genericItemHidden(item) || (isStoneveilWorld() && editorHiddenStoneveilIds.has(String(item.id))) ? '○':'◉','Toggle editor visibility',()=>setEditorItemHidden(item, !(genericItemHidden(item) || (isStoneveilWorld() && editorHiddenStoneveilIds.has(String(item.id))))),Boolean(item.hideable)],
        ['✎','Rename',()=>renameOutlinerItem(item),Boolean(item.renameable)],
        ['×','Delete',()=>deleteOutlinerItem(item),Boolean(item.deletable)]
      ];
      for (const [label,title,handler,enabled] of actions) {
        const b=document.createElement('button'); b.type='button'; b.className='outliner-icon'; b.textContent=label; b.title=title; b.disabled=!enabled; if(enabled) b.addEventListener('click',handler); itemRow.appendChild(b);
      }
      outliner.appendChild(itemRow);
    }
  }
  if (!shown && filter) { const empty=document.createElement('div'); empty.className='outliner-empty'; empty.textContent='No matching objects.'; outliner.appendChild(empty); }
}

function renderSourcePolicy() {
  const target = $('#source-policy-status');
  if (!target) return;
  let policy = null;
  if (isStoneveilWorld()) policy = { terrain:'authored', waters:'authored', objects:(patch.placedObjects?.length ? 'hybrid':'procedural'), vegetation:'procedural', decor:(patch.placedObjects?.some((item)=>item.type==='decor') ? 'hybrid':'procedural') };
  else policy = activeGenericLevel()?.sourcePolicy ?? {};
  target.innerHTML = Object.entries(policy).map(([key,value]) => `<span class="source-chip ${String(value).toLowerCase().replaceAll(' ','-')}">${key}: ${value}</span>`).join('');
}

function selectValidationIssue(issue) {
  if (!issue?.objectId) return;
  const id = String(issue.objectId);
  if (isStoneveilWorld()) {
    if ((patch.placedObjects ?? []).some((item) => item.id === id)) selected={kind:'placed',id};
    else if (MOUNTAIN_FISHING_LOCATIONS.some((item)=>item.id===id)) selected={kind:'water',id};
  } else {
    const level=activeGenericLevel();
    const kind=(level.objects??[]).some((i)=>i.id===id)?'world-object':(level.movingPlatforms??[]).some((i)=>i.id===id)?'moving-platform':(level.rooms??[]).some((i)=>i.id===id)?'room':(level.prefabs?.instances??[]).some((i)=>i.id===id)?'prefab-instance':(level.waters??[]).some((i)=>String(i.id||i.identity)===id)?'water-v2':null;
    if(kind){ selected={kind,id}; genericScene.setSelected(id); }
  }
  if (selected) { focusSelectedObject(); renderUi(); }
}

function renderValidation() {
  const container = $('#validation-list');
  if (!container) return;
  const legend = $('#slope-legend');
  if (legend) {
    legend.hidden = !isStoneveilWorld();
    if (isStoneveilWorld()) legend.innerHTML = slopeOverlayLegend(PLAYER_CONFIG)
      .map(([label, range]) => `<span class="slope-chip ${label.startsWith('WALK') ? 'walkable' : label.startsWith('AWK') ? 'awkward' : label.startsWith('SLIDE') ? 'slide' : 'extreme'}">${label}</span><span>${range}</span>`)
      .join('') + `<span class="hint">Slide exit</span><span>${PLAYER_CONFIG.slideExitSlopeDegrees}° hysteresis</span>`;
  }
  if (isStoneveilWorld()) {
    validationIssues = [];
    if (!patch.terrain?.bakedMesh?.positions?.length) validationIssues.push({ severity:'error', code:'terrain-missing', message:'Stoneveil has no frozen terrain mesh.' });
    const seen = new Set();
    for (const item of patch.placedObjects ?? []) {
      if (!item.id) validationIssues.push({ severity:'error', code:'missing-id', message:'Authored Stoneveil object has no stable ID.' });
      else if (seen.has(item.id)) validationIssues.push({ severity:'error', code:'duplicate-id', objectId:item.id, message:`Duplicate authored object ID: ${item.id}` });
      else seen.add(item.id);
      if (item.position && !Object.values(item.position).every((v)=>Number.isFinite(Number(v)))) validationIssues.push({ severity:'error', code:'bad-position', objectId:item.id, message:`${item.name || item.id} has an invalid position.` });
    }
  } else validationIssues = validateWorldLevel(activeGenericLevel());
  const issues = validationIssues.filter((issue) => validationFilter === 'all' || issue.severity === validationFilter);
  container.innerHTML = '';
  if (!issues.length) { container.textContent = validationIssues.length ? 'No issues in this severity filter.' : 'No structural warnings.'; return; }
  for (const issue of issues) {
    const node=document.createElement('div'); node.className=`validation-item ${issue.severity}${issue.objectId ? ' selectable':''}`;
    node.innerHTML=`<strong>${String(issue.severity).toUpperCase()}</strong> · ${issue.message}`;
    if(issue.objectId){ node.title=`Select ${issue.objectId}`; node.addEventListener('click',()=>selectValidationIssue(issue)); }
    container.appendChild(node);
  }
}

function renderUi() {
  syncWorldUi();
  if (!isStoneveilWorld()) {
    $('#undo').disabled = genericHistoryFor().length === 0;
    $('#redo').disabled = genericFutureFor().length === 0;
    renderGenericSelection();
    renderSummary();
    renderOutliner();
    renderValidation();
    renderSourcePolicy();
    return;
  }
  $('#undo').disabled = history.length === 0;
  $('#redo').disabled = future.length === 0;
  const meshMode = isMeshMode();
  const freeze = $('#freeze-core');
  const returnButton = $('#return-heightfield');
  if (freeze) { freeze.disabled = meshMode; freeze.textContent = meshMode ? 'Core Frozen to 3D Mesh' : 'Freeze Core to 3D Mesh'; }
  if (returnButton) returnButton.disabled = !meshMode;
  const status = $('#mesh-mode-status');
  if (status) status.innerHTML = meshMode
    ? `<strong>3D Mesh</strong> · ${Math.round(patch.terrain.bakedMesh.positions.length / 3).toLocaleString()} vertices · cave/overhang sculpting enabled.`
    : '<strong>Heightfield compatibility mode.</strong> Freeze when ready for arbitrary 3D sculpting.';
  for (const button of $$('[data-tool="raise"], [data-tool="lower"]')) button.disabled = false;
  const smoothButton = $('[data-tool="smooth"]');
  if (smoothButton) smoothButton.disabled = !meshMode;
  const connectButton = $('[data-tool="connect-cave"]');
  if (connectButton) connectButton.disabled = !meshMode;
  $('#reset-profile').disabled = meshMode;
  drawProfileChart();
  renderProfileRows();
  renderSelection();
  renderSummary();
  renderOutliner();
  renderValidation();
  renderSourcePolicy();
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
  $('#rename-selected').disabled = selected.kind !== 'placed';
  $('#edit-source-prefab').hidden = true;
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
      ? 'Surface Y moves the top; Depth moves submerged basin-floor vertices only.'
      : 'Depth becomes physical after freezing to 3D mesh.';
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
  if (!isStoneveilWorld()) return selected ? genericScene.selectedRecord(selected.id) : null;
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
  if (!isStoneveilWorld()) {
    const level = activeGenericLevel();
    const rows = [
      ['Schema', level?.schema ?? '—'],
      ['World ID', level?.worldId ?? activeWorldId],
      ['Static objects', level?.objects?.length ?? 0],
      ['Moving platforms', level?.movingPlatforms?.length ?? 0],
      ['Waters', level?.waters?.length ?? 0],
      ['Prefab definitions', level?.prefabs?.definitions?.length ?? 0],
      ['Prefab instances', level?.prefabs?.instances?.length ?? 0],
      ['Rooms', level?.rooms?.length ?? 0],
      ['Terrain source', level?.sourcePolicy?.terrain ?? '—'],
      ['Architecture source', level?.sourcePolicy?.architecture ?? '—']
    ];
    $('#summary').innerHTML = rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join('');
    return;
  }
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
  if (!isStoneveilWorld()) {
    if (!selected || ['water-v2','prefab-child-water','architecture-reference','waypoint'].includes(selected.kind)) return;
    const level = activeGenericLevel();
    if (prefabWorkspace.active && ['prefab-child-object','prefab-child-moving'].includes(selected.kind)) {
      const definition = activePrefabDefinition(level);
      const sourceList = selected.kind === 'prefab-child-moving' ? definition?.movingPlatforms : definition?.objects;
      const source = sourceList?.find((item) => item.id === selected.id);
      if (!source) return;
      const copy = clone(source);
      copy.id = nextPrefabChildId(definition, selected.kind === 'prefab-child-moving' ? 'MOVING' : 'CHILD');
      copy.name = `${source.name || source.id} Copy`;
      if (copy.transform?.position) { copy.transform.position.x += 1.5; copy.transform.position.z += 1.5; }
      if (selected.kind === 'prefab-child-moving' && copy.path?.points) for (const point of copy.path.points) { point.x += 1.5; point.z += 1.5; }
      commitGeneric((draft) => {
        const owner=(draft.prefabs?.definitions??[]).find((item)=>item.id===prefabWorkspace.definitionId);
        (selected.kind === 'prefab-child-moving' ? owner?.movingPlatforms : owner?.objects)?.push(copy);
      });
      selected={kind:selected.kind,id:copy.id}; genericScene.setSelected(copy.id); renderUi(); return;
    }
    const sourceList = selected.kind === 'moving-platform' ? level.movingPlatforms
      : selected.kind === 'prefab-instance' ? level.prefabs.instances
        : selected.kind === 'room' ? level.rooms : level.objects;
    const source = sourceList.find((item) => item.id === selected.id);
    if (!source) return;
    const copy = clone(source);
    const prefix = selected.kind === 'moving-platform' ? 'MOVING-PLATFORM'
      : selected.kind === 'prefab-instance' ? 'PREFAB-INSTANCE'
        : selected.kind === 'room' ? 'ROOM' : 'OBJECT';
    copy.id = nextStableId(level, prefix);
    copy.name = `${source.name || source.id} Copy`;
    if (copy.transform?.position) { copy.transform.position.x += 1.5; copy.transform.position.z += 1.5; }
    if (selected.kind === 'moving-platform' && copy.path?.points) for (const point of copy.path.points) { point.x += 1.5; point.z += 1.5; }
    commitGeneric((draft) => {
      const target = selected.kind === 'moving-platform' ? draft.movingPlatforms
        : selected.kind === 'prefab-instance' ? draft.prefabs.instances
          : selected.kind === 'room' ? draft.rooms : draft.objects;
      target.push(copy);
    });
    selected = { kind: selected.kind, id: copy.id, record: copy };
    genericScene.setSelected(copy.id);
    renderUi();
    return;
  }
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
  if (!isStoneveilWorld()) {
    const target = { ...selected };
    if (isLibraryWorld() && target.kind === 'water-v2') {
      setStatus('Canonical Library fishing waters cannot be deleted; move or resize the authored water instead.');
      return;
    }
    if (target.kind === 'waypoint') {
      const info=genericScene.selectedRecord(target.id);
      if (info?.platformId) {
        const parentKind=info.workspace?'prefab-child-moving':'moving-platform';
        selected={kind:parentKind,id:info.platformId};
        removeMovingPlatformWaypoint(info.index);
      }
      return;
    }
    commitGeneric((draft) => {
      if (prefabWorkspace.active) {
        const owner=(draft.prefabs?.definitions??[]).find((item)=>item.id===prefabWorkspace.definitionId);
        if (target.kind === 'prefab-child-object') owner.objects = owner.objects.filter((item)=>item.id!==target.id);
        else if (target.kind === 'prefab-child-moving') owner.movingPlatforms = owner.movingPlatforms.filter((item)=>item.id!==target.id);
        else if (target.kind === 'prefab-child-water') owner.waters = owner.waters.filter((item)=>String(item.id||item.identity)!==target.id);
      } else if (target.kind === 'world-object') draft.objects = draft.objects.filter((item) => item.id !== target.id);
      else if (target.kind === 'moving-platform') draft.movingPlatforms = draft.movingPlatforms.filter((item) => item.id !== target.id);
      else if (target.kind === 'water-v2') draft.waters = draft.waters.filter((item) => String(item.id || item.identity) !== target.id);
      else if (target.kind === 'prefab-instance') draft.prefabs.instances = draft.prefabs.instances.filter((item) => item.id !== target.id);
      else if (target.kind === 'room') draft.rooms = draft.rooms.filter((item) => item.id !== target.id);
    });
    selected = null;
    genericScene.setSelected(null);
    renderUi();
    return;
  }
  const target = selected;
  commit(() => {
    if (target.kind === 'placed') patch.placedObjects = patch.placedObjects.filter((item) => item.id !== target.id);
    else if (target.kind === 'tunnel') patch.tunnels = (patch.tunnels ?? []).filter((item) => item.id !== target.id);
    else if (target.kind === 'snapshot') { if (!patch.hiddenObjectIds.includes(target.id)) patch.hiddenObjectIds.push(target.id); }
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
  const data = isStoneveilWorld() ? patch : genericStoredPayload();
  if (!data) return;
  data.updatedAt = new Date().toISOString();
  if (!isStoneveilWorld()) persistGenericLevel(activeGenericLevel());
  const filename = isStoneveilWorld() ? 'map-editor-patch.json'
    : isLibraryWorld() ? LIBRARY_SCENE_FILENAME : `${activeWorldId}.json`;
  const text = JSON.stringify(data, null, 2);
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Reel Ascent world/editor JSON', accept: { 'application/json': ['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      setStatus(`${activeWorld().label} saved.`);
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  if (isStoneveilWorld() || isLibraryWorld()) downloadJson(filename, data);
  else downloadWorldLevel(data, filename);
  setStatus(`${activeWorld().label} downloaded.`);
}

function exportActiveWorldV2() {
  if (isLibraryWorld()) {
    downloadJson(LIBRARY_SCENE_FILENAME, serializeLibrarySceneFromEditor(activeGenericLevel()));
    setStatus('Exported the production-compatible Veiled Athenaeum authored scene.');
    return;
  }
  const level = isStoneveilWorld() ? wrapLegacyStoneveilPatch(patch) : normalizeWorldEditorLevel(activeGenericLevel());
  downloadWorldLevel(level, `${activeWorldId}-world-editor-v2.json`);
  setStatus(isStoneveilWorld()
    ? 'Exported a schema-v2 compatibility envelope containing the exact current Stoneveil patch. Production patch was not replaced.'
    : 'Exported World Editor V2 level.');
}

async function loadJsonFile(file, type) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (type === 'patch') {
    if (isLibraryAuthoredScene(data)) {
      await switchWorld('library-island');
      saveGenericHistory();
      replaceActiveGenericLevel(data, { persist: true });
      rebuildAll();
      setStatus(`Loaded Veiled Athenaeum authored scene: ${file.name}`);
      return;
    }
    if (data?.kind === WORLD_EDITOR_LEVEL_KIND) {
      if (data.worldId === 'stoneveil-peak') {
        await switchWorld('stoneveil-peak');
        const legacy = unwrapLegacyStoneveilPatch(data);
        if (!legacy) throw new Error('Stoneveil V2 envelope does not contain its legacy compatibility patch.');
        saveHistory();
        patch = normalizePatch(legacy);
        runtimeSnapshot = clone(patch.bakedSnapshot ?? { objects: [], rocks: [] });
        selected = null;
        persistPatch();
        syncSnapshotUi();
        rebuildAll();
      } else {
        if (!WORLD_EDITOR_WORLDS.some((world) => world.id === data.worldId)) throw new Error(`Unknown World Editor worldId: ${data.worldId}`);
        await switchWorld(data.worldId);
        saveGenericHistory();
        replaceActiveGenericLevel(data, { persist: true });
        rebuildAll();
      }
      setStatus(`Loaded World Editor V2 level: ${file.name}`);
      return;
    }
    await switchWorld('stoneveil-peak');
    saveHistory();
    patch = normalizePatch(data);
    runtimeSnapshot = clone(patch.bakedSnapshot ?? { objects: [], rocks: [] });
    selected = null;
    persistPatch();
    syncSnapshotUi();
    rebuildAll();
    setStatus(`Loaded Stoneveil patch: ${file.name}`);
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
  const center = isStoneveilWorld()
    ? { x: MOUNTAIN_CENTER.x, y: view === 'top' ? 90 : 130, z: MOUNTAIN_CENTER.z }
    : { x: 0, y: activeWorldId === 'skyscraper' ? (view === 'top' ? 170 : 145) : 0, z: 0 };
  const distance = isStoneveilWorld() ? (view === 'perspective' ? 430 : 510) : (activeWorldId === 'skyscraper' ? 430 : 75);
  if (view === 'top') {
    cameraState.target.set(center.x, center.y, center.z);
    cameraState.yaw = 0; cameraState.pitch = -89; cameraState.distance = distance;
  } else if (view === 'north') {
    cameraState.target.set(center.x, center.y, center.z);
    cameraState.yaw = 180; cameraState.pitch = 0; cameraState.distance = distance;
  } else if (view === 'west') {
    cameraState.target.set(center.x, center.y, center.z);
    cameraState.yaw = -90; cameraState.pitch = 0; cameraState.distance = distance;
  } else if (isStoneveilWorld()) {
    cameraState.target.set(MOUNTAIN_CENTER.x, 105, MOUNTAIN_CENTER.z);
    cameraState.yaw = 42; cameraState.pitch = -24; cameraState.distance = 430;
  } else {
    setWorldCameraDefaults(activeWorldId);
    return;
  }
  updateCamera();
}


function loadJsonPreference(key, fallback = {}) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function saveJsonPreference(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

function setupResizableRightPanel() {
  const handle = $('#right-resize-handle');
  if (!handle) return;
  let width = clamp(Number(localStorage.getItem(RIGHT_PANEL_WIDTH_KEY)) || 390, 300, 620);
  const apply = () => {
    document.documentElement.style.setProperty('--right-panel-width', `${width}px`);
    handle.style.right = `calc(${width}px - 3px)`;
    app.resizeCanvas();
  };
  apply();
  let startX = 0, startWidth = width;
  handle.addEventListener('pointerdown', (event) => {
    startX = event.clientX; startWidth = width;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-right-panel');
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    width = clamp(startWidth + (startX - event.clientX), 300, Math.min(620, window.innerWidth * .48));
    apply();
  });
  const finish = (event) => {
    if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    document.body.classList.remove('resizing-right-panel');
    try { localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(Math.round(width))); } catch {}
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

function setupCollapsibleSections() {
  const prefs = loadJsonPreference(COLLAPSE_PREFS_KEY, {});
  const sections = [...document.querySelectorAll('#left-panel > section, #right-panel > section')];
  sections.forEach((section, index) => {
    const heading = section.querySelector(':scope > h2');
    if (!heading) return;
    const key = section.id || `${section.closest('aside')?.id || 'panel'}:${index}:${heading.textContent.trim().split('?')[0].trim()}`;
    section.classList.add('collapsible');
    section.dataset.collapseKey = key;
    if (prefs[key]) section.classList.add('collapsed');
    heading.addEventListener('click', (event) => {
      if (event.target.closest('button, input, select')) return;
      section.classList.toggle('collapsed');
      prefs[key] = section.classList.contains('collapsed');
      saveJsonPreference(COLLAPSE_PREFS_KEY, prefs);
    });
  });
}

function setupSnapPreferences() {
  const prefs = loadJsonPreference(SNAP_PREFS_KEY, {});
  if ($('#grid-snap') && prefs.grid != null) $('#grid-snap').checked = Boolean(prefs.grid);
  if ($('#grid-snap-step') && prefs.gridStep != null) $('#grid-snap-step').value = String(prefs.gridStep);
  if ($('#rotation-snap') && prefs.rotation != null) $('#rotation-snap').checked = Boolean(prefs.rotation);
  if ($('#rotation-snap-step') && prefs.rotationStep != null) $('#rotation-snap-step').value = String(prefs.rotationStep);
  if ($('#surface-snap') && prefs.surface != null) $('#surface-snap').checked = Boolean(prefs.surface);
  const save = () => saveJsonPreference(SNAP_PREFS_KEY, {
    grid:gridSnapEnabled(), gridStep:gridSnapStep(), rotation:rotationSnapEnabled(), rotationStep:rotationSnapStep(), surface:Boolean($('#surface-snap')?.checked)
  });
  for (const id of ['grid-snap','grid-snap-step','rotation-snap','rotation-snap-step','surface-snap']) $(`#${id}`)?.addEventListener('change', save);
}

function populateRoomLibraryUi() {
  const roomSelect = $('#room-library-template');
  const componentSelect = $('#room-library-component');
  if (!roomSelect || !componentSelect) return;
  if (!roomSelect.options.length) {
    for (const template of SKYSCRAPER_ROOM_LIBRARY) roomSelect.add(new Option(template.label, template.id));
  }
  const template = getRoomLibraryTemplate(roomSelect.value || SKYSCRAPER_ROOM_LIBRARY[0]?.id);
  componentSelect.replaceChildren(...template.components.map((component) => new Option(component.label, component.id)));
  const description = $('#room-library-description');
  if (description) description.textContent = `${template.description} ${template.components.length} major modules. Complete room size ≈ ${template.dimensions.x} × ${template.dimensions.z} m.`;
}

function ensureLibraryDefinition(draft, definition) {
  draft.prefabs ??= { definitions: [], instances: [] };
  draft.prefabs.definitions ??= [];
  const existing = draft.prefabs.definitions.find((item) => item.id === definition.id);
  if (existing) return existing;
  draft.prefabs.definitions.push(definition);
  return definition;
}

function roomLibraryPlacement() {
  return maybeSnapPosition({ x: cameraState.target.x, y: cameraState.target.y, z: cameraState.target.z });
}

function placeCompleteLibraryRoom() {
  if (activeWorldId !== 'skyscraper') return;
  const level = activeGenericLevel();
  const templateId = $('#room-library-template')?.value || SKYSCRAPER_ROOM_LIBRARY[0]?.id;
  const template = getRoomLibraryTemplate(templateId);
  const definition = makeRoomLibraryDefinition(templateId);
  const id = nextStableId(level, 'ROOM');
  const room = {
    id,
    name: `${template.label} ${id.split('-').at(-1)}`,
    prefabId: definition.id,
    linked: true,
    transform: { position: roomLibraryPlacement(), rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { roomLibraryId: template.id, libraryAuthored: true, completeRoom: true }
  };
  commitGeneric((draft) => {
    ensureLibraryDefinition(draft, definition);
    draft.rooms.push(room);
  });
  selected = { kind: 'room', id };
  genericScene.setSelected(id);
  genericScene.setSkyscraperInteriorMode(true);
  if ($('#skyscraper-interior-mode')) $('#skyscraper-interior-mode').checked = true;
  focusSelectedObject();
  renderUi();
  setStatus(`Placed complete ${template.label}. Interior cutaway is on so the exterior shell does not hide the room. Edit Source Prefab exposes its ${template.components.length} named component groups.`);
}

function placeLibraryComponent() {
  if (activeWorldId !== 'skyscraper') return;
  const level = activeGenericLevel();
  const templateId = $('#room-library-template')?.value || SKYSCRAPER_ROOM_LIBRARY[0]?.id;
  const componentId = $('#room-library-component')?.value;
  const template = getRoomLibraryTemplate(templateId);
  const component = template.components.find((item) => item.id === componentId) ?? template.components[0];
  const definition = makeRoomComponentDefinition(templateId, component.id);
  if (!definition) return;
  const id = nextStableId(level, 'PREFAB-INSTANCE');
  const instance = {
    id,
    name: `${template.label} — ${component.label} ${id.split('-').at(-1)}`,
    prefabId: definition.id,
    linked: true,
    transform: { position: roomLibraryPlacement(), rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: {
      roomLibraryId: template.id,
      roomComponentId: component.id,
      libraryAuthored: true,
      suggestedAssemblyOffset: structuredClone(component.offset)
    }
  };
  commitGeneric((draft) => {
    ensureLibraryDefinition(draft, definition);
    draft.prefabs.instances.push(instance);
  });
  selected = { kind: 'prefab-instance', id };
  genericScene.setSelected(id);
  renderUi();
  setStatus(`Placed ${template.label} component: ${component.label}. It is an independent linked module with its own root transform.`);
}


function populatePirateAssetUi() {
  const select = $('#pirate-asset-template');
  if (!select) return;
  if (!select.options.length) {
    for (const asset of PIRATE_ASSET_LIBRARY) select.add(new Option(asset.label, asset.id));
  }
  const asset = getPirateAsset(select.value || PIRATE_ASSET_LIBRARY[0]?.id);
  if ($('#pirate-asset-description')) $('#pirate-asset-description').textContent = asset.description;
}

function placePirateAsset() {
  if (activeWorldId !== 'pirate-island') return;
  const level = activeGenericLevel();
  const assetId = $('#pirate-asset-template')?.value || PIRATE_ASSET_LIBRARY[0]?.id;
  const asset = getPirateAsset(assetId);
  const definition = makePirateAssetDefinition(assetId);
  const id = nextStableId(level, 'PIRATE-INSTANCE');
  const instance = {
    id,
    name: `${asset.label} ${id.split('-').at(-1)}`,
    prefabId: definition.id,
    linked: true,
    transform: { position: maybeSnapPosition({ x: cameraState.target.x, y: cameraState.target.y, z: cameraState.target.z }), rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { pirateAssetId: asset.id, pirateLibrary: true }
  };
  commitGeneric((draft) => {
    ensureLibraryDefinition(draft, definition);
    draft.prefabs.instances.push(instance);
  });
  selected = { kind: 'prefab-instance', id };
  genericScene.setSelected(id);
  focusSelectedObject();
  renderUi();
  setStatus(`Placed pirate asset: ${asset.label}. Duplicate/move it or use Edit Source Prefab to alter the linked source.`);
}

function createTestRoom() {
  if (isStoneveilWorld() || !worldHasCapability(activeWorldId, 'rooms')) return;
  const level=activeGenericLevel();
  const definitionId=nextStableId(level,'ROOM-PREFAB');
  const roomId=nextStableId(level,'ROOM');
  const child=(name,position,size)=>({ id:'',name,type:'box',category:'room',transform:{position,rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}},size,collision:true,climbMaterial:'normal',visible:true,metadata:{} });
  const objects=[
    child('Floor',{x:0,y:-.1,z:0},{x:8,y:.2,z:7}),
    child('Back Wall',{x:0,y:1.5,z:3.4},{x:8,y:3,z:.2}),
    child('Left Wall',{x:-3.9,y:1.5,z:0},{x:.2,y:3,z:7}),
    child('Right Wall',{x:3.9,y:1.5,z:0},{x:.2,y:3,z:7}),
    child('Interior Crate',{x:2.2,y:.45,z:1.5},{x:.9,y:.9,z:.9})
  ];
  objects.forEach((item,index)=>item.id=`ROOM-CHILD-${String(index+1).padStart(3,'0')}`);
  const definition={id:definitionId,name:`Test Room ${definitionId.split('-').at(-1)}`,kind:'room',version:1,objects,movingPlatforms:[],waters:[],metadata:{independentlyAuthored:true,testFixture:true}};
  const room={id:roomId,name:`Test Room Instance ${roomId.split('-').at(-1)}`,prefabId:definitionId,linked:true,transform:{position:{x:cameraState.target.x,y:cameraState.target.y,z:cameraState.target.z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}},metadata:{}};
  commitGeneric((draft)=>{ draft.prefabs.definitions.push(definition); draft.rooms.push(room); });
  selected={kind:'room',id:roomId}; genericScene.setSelected(roomId); renderUi();
  setStatus('Created a linked test-room prefab and instance. Edit Source Prefab opens its local-coordinate workspace.');
}



function importBasaltFreezeObject(raw, sourceLabel = 'production-freeze-import') {
  if (activeWorldId !== 'cave-fishing-island') return;
  const mesh = raw.terrain?.positions && raw.terrain?.indices ? raw.terrain : raw;
  if (!Array.isArray(mesh.positions) || !Array.isArray(mesh.indices) || mesh.positions.length < 9 || mesh.indices.length < 3 || mesh.positions.length % 3 || mesh.indices.length % 3) {
    throw new Error('Basalt freeze must contain triangle-mesh positions[] and indices[] arrays.');
  }
  if (!mesh.positions.every((v)=>Number.isFinite(Number(v))) || !mesh.indices.every((v)=>Number.isInteger(Number(v)) && Number(v)>=0)) {
    throw new Error('Basalt freeze contains invalid/non-finite mesh values.');
  }
  const vertexCount=mesh.positions.length/3;
  if (mesh.indices.some((index)=>index>=vertexCount)) throw new Error('Basalt freeze contains an out-of-range triangle index.');
  let positions=mesh.positions.map(Number);
  const coordinateSpace=String(mesh.coordinateSpace || raw.coordinateSpace || 'island-local');
  const origin=mesh.origin || raw.origin || raw.worldOrigin || null;
  if (coordinateSpace === 'world' && origin && Number.isFinite(Number(origin.x)) && Number.isFinite(Number(origin.z))) {
    positions=positions.slice();
    for(let i=0;i<positions.length;i+=3){ positions[i]-=Number(origin.x); positions[i+2]-=Number(origin.z); }
  } else if (coordinateSpace === 'world') {
    throw new Error('World-space Basalt freeze needs origin/worldOrigin so the editor can preserve the island-local authored frame.');
  }
  commitGeneric((draft)=>{
    draft.terrain={ mode:'authored-mesh-candidate', format:mesh.format || 'triangle-mesh-v1', coordinateSpace:'island-local', positions, indices:mesh.indices.map(Number), source:sourceLabel, capturedAt:mesh.capturedAt || raw.capturedAt || new Date().toISOString(), parts: structuredClone(mesh.parts || raw.parts || []), metadata:{ ...(mesh.metadata||{}), originalCoordinateSpace:coordinateSpace } };
    draft.sourcePolicy.terrain='authored-candidate';
  });
  genericScene.setBasaltReferenceMode('authored');
  if ($('#basalt-reference-mode')) $('#basalt-reference-mode').value='authored';
  const status=$('#basalt-freeze-status');
  if(status) status.textContent=`Editable candidate: ${vertexCount.toLocaleString()} verts / ${(mesh.indices.length/3).toLocaleString()} triangles. Production still uses procedural terrain.`;
  setStatus('Basalt production freeze loaded as an editable authored candidate. Raise/Lower/Smooth/Indent/Pull now edit the island/cave mesh itself; production is not switched yet.');
}

function loadCapturedBasaltFreeze() {
  const raw = localStorage.getItem('reel-ascent:world-editor-v2:basalt-production-freeze');
  if (!raw) throw new Error('No captured Basalt production mesh is cached yet. Open the normal game once with this update, then return to the editor and click this again.');
  importBasaltFreezeObject(JSON.parse(raw), 'actual-production-capture');
}

async function importBasaltFreezeFile(file) {
  if (activeWorldId !== 'cave-fishing-island') return;
  importBasaltFreezeObject(JSON.parse(await file.text()), 'production-freeze-file');
}

function renameSelectedRecord() {
  if (!selected) return;
  const record=currentSelectedRecord();
  if (!record || ['architecture-reference','waypoint','water'].includes(selected.kind)) return;
  const current=record.name||record.label||selected.id;
  const value=prompt('Rename authored object',current);
  if (!value?.trim()) return;
  if (isStoneveilWorld()) {
    if (selected.kind === 'placed') commit(()=>{ record.name=value.trim().slice(0,80); },{placed:true});
  } else renameGenericRecord(selected,value);
  renderUi();
}

function setupV21Ui() {
  setupResizableRightPanel();
  setupCollapsibleSections();
  setupSnapPreferences();
  $('#outliner-search')?.addEventListener('input', (event) => { outlinerFilter=event.target.value||''; renderOutliner(); });
  $('#validation-filter')?.addEventListener('change', (event) => { validationFilter=event.target.value||'all'; renderValidation(); });
  $('#refresh-validation')?.addEventListener('click', renderValidation);
  $('#focus-selected')?.addEventListener('click', () => focusSelectedObject());
  $('#rename-selected')?.addEventListener('click', renameSelectedRecord);
  $('#edit-source-prefab')?.addEventListener('click', () => { const def=definitionForSelectedInstance(); if(def) enterPrefabWorkspace(def.id); });
  $('#room-library-template')?.addEventListener('change', populateRoomLibraryUi);
  $('#place-complete-room')?.addEventListener('click', placeCompleteLibraryRoom);
  $('#place-room-component')?.addEventListener('click', placeLibraryComponent);
  populateRoomLibraryUi();
  $('#pirate-asset-template')?.addEventListener('change', populatePirateAssetUi);
  $('#place-pirate-asset')?.addEventListener('click', placePirateAsset);
  populatePirateAssetUi();
  $('#skyscraper-interior-mode')?.addEventListener('change', (event) => genericScene.setSkyscraperInteriorMode(event.target.checked));
  $('#create-test-room')?.addEventListener('click', createTestRoom);
  $('#save-prefab-workspace')?.addEventListener('click', () => { persistGenericLevel(); setStatus('Prefab/room definition saved to this world autosave. Use Save World Level to download the JSON.'); });
  $('#exit-prefab-workspace')?.addEventListener('click', () => exitPrefabWorkspace());
  $('#prefab-workspace-return')?.addEventListener('click', () => exitPrefabWorkspace());
  $('#collision-mode')?.addEventListener('change', (event) => {
    const mode=event.target.value;
    if (isStoneveilWorld()) {
      applyTerrainDisplayMode();
      setStatus(mode==='normal'?'Collision inspection off.':'Stoneveil uses the same frozen triangle mesh for render and terrain collision; collision inspection enabled.');
    } else {
      genericScene.setCollisionMode(mode);
      setStatus(mode==='normal'?'Collision inspection off.':`Collision mode: ${event.target.selectedOptions[0]?.textContent || mode}.`);
    }
  });
  $('#basalt-reference-mode')?.addEventListener('change', (event) => genericScene.setBasaltReferenceMode(event.target.value));
  $('#load-basalt-capture')?.addEventListener('click', () => { try { loadCapturedBasaltFreeze(); } catch (error) { setStatus(error.message); } });
  $('#import-basalt-freeze')?.addEventListener('click', () => $('#basalt-freeze-file')?.click());
  $('#basalt-freeze-file')?.addEventListener('change', (event) => {
    const file=event.target.files?.[0];
    if(file) importBasaltFreezeFile(file).catch((error)=>setStatus(error.message));
    event.target.value='';
  });
}

// UI wiring
for (const world of WORLD_EDITOR_WORLDS) $('#world-selector')?.append(new Option(world.label, world.id));
if ($('#world-selector')) $('#world-selector').value = activeWorldId;
$('#world-selector')?.addEventListener('change', (event) => switchWorld(event.target.value).catch((error) => setStatus(error.message)));
ROCK_KINDS.forEach((kind) => $('#rock-kind').append(new Option(kind, kind)));
$('#rock-kind').value = 'chunk';

$$('#tool-grid button').forEach((button) => button.addEventListener('click', () => {
  const previousTool = tool;
  tool = button.dataset.tool;
  if (previousTool === 'connect-cave' && tool !== 'connect-cave') caveConnectStart = null;
  if (tool === 'connect-cave') caveConnectStart = null;
  rebuildSelectionHelper();
  $$('#tool-grid button').forEach((b) => b.classList.toggle('active', b === button));
  if (activeWorldId === 'cave-fishing-island' && ['raise','lower','smooth','indent','pull-core'].includes(tool)) setStatus('Basalt terrain brush: this edits the frozen production candidate mesh itself. Load the captured production mesh first; production remains procedural until later promotion.');
  else if (tool === 'indent' && isMeshMode()) setStatus('3D Indent: use a small brush and push the actual mesh inward. Repeat on the recessed back wall to extend a cave.');
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
$('#create-prefab-foundation')?.addEventListener('click', () => {
  if (isStoneveilWorld() || !worldHasCapability(activeWorldId, 'prefabs')) return;
  const level = activeGenericLevel();
  const definitionId = nextStableId(level, 'PREFAB');
  const instanceId = nextStableId(level, 'PREFAB-INSTANCE');
  const definition = {
    id: definitionId, name: `Prefab ${definitionId.split('-').at(-1)}`, kind: 'assembly', version: 1,
    objects: [], movingPlatforms: [], waters: [], metadata: {}
  };
  const instance = {
    id: instanceId, name: `Prefab Instance ${instanceId.split('-').at(-1)}`, prefabId: definitionId, linked: true,
    transform: {
      position: { x: cameraState.target.x, y: cameraState.target.y, z: cameraState.target.z },
      rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }
    }, metadata: {}
  };
  commitGeneric((draft) => {
    draft.prefabs.definitions.push(definition);
    draft.prefabs.instances.push(instance);
  });
  selected = { kind: 'prefab-instance', id: instanceId };
  genericScene.setSelected(instanceId);
  renderUi();
  setStatus(`Created linked prefab ${definitionId}. Select Edit Source Prefab to author its local children.`);
});
$('#create-room-foundation')?.addEventListener('click', () => {
  if (isStoneveilWorld() || !worldHasCapability(activeWorldId, 'rooms')) return;
  const level = activeGenericLevel();
  const definitionId = nextStableId(level, 'ROOM-PREFAB');
  const roomId = nextStableId(level, 'ROOM');
  const definition = {
    id: definitionId, name: `Room Module ${definitionId.split('-').at(-1)}`, kind: 'room', version: 1,
    objects: [], movingPlatforms: [], waters: [], metadata: { independentlyAuthored: true }
  };
  const room = {
    id: roomId, name: `Room ${roomId.split('-').at(-1)}`, prefabId: definitionId, linked: true,
    transform: {
      position: { x: cameraState.target.x, y: cameraState.target.y, z: cameraState.target.z },
      rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }
    }, metadata: {}
  };
  commitGeneric((draft) => {
    draft.prefabs.definitions.push(definition);
    draft.rooms.push(room);
  });
  selected = { kind: 'room', id: roomId };
  genericScene.setSelected(roomId);
  renderUi();
  setStatus(`Created linked room ${definitionId}. Select Edit Source Prefab to build it at local origin.`);
});
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#checkpoint').addEventListener('click', saveManualCheckpoint);
$('#restore-checkpoint').addEventListener('click', restoreManualCheckpoint);
$('#reload-project-patch').addEventListener('click', reloadProjectPatch);
$('#recover-browser-autosave')?.addEventListener('click', recoverBrowserAutosaveExplicitly);
$('#freeze-core').addEventListener('click', freezeCoreToMesh);
$('#return-heightfield').addEventListener('click', returnToHeightfield);
$('#clear-legacy-caves').addEventListener('click', clearLegacyCaveExperiments);
$('#save-patch').addEventListener('click', savePatch);
$('#export-world-v2')?.addEventListener('click', exportActiveWorldV2);
$('#open-patch').addEventListener('click', () => $('#patch-file').click());
$('#import-snapshot').addEventListener('click', () => $('#snapshot-file').click());
$('#bake-snapshot').addEventListener('click', bakeSnapshotIntoPatch);
$('#patch-file').addEventListener('change', (event) => event.target.files[0] && loadJsonFile(event.target.files[0], 'patch').catch((e) => setStatus(e.message)));
$('#snapshot-file').addEventListener('change', (event) => event.target.files[0] && loadJsonFile(event.target.files[0], 'snapshot').catch((e) => setStatus(e.message)));
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
$('#show-slope')?.addEventListener('change', (event) => {
  if (!isStoneveilWorld()) return;
  slopeOverlay.setEnabled(event.target.checked, currentTerrainData ?? terrainDataForRender());
  if (event.target.checked) {
    const legend = slopeOverlayLegend(PLAYER_CONFIG).map(([label, range]) => `${label} ${range}`).join(' · ');
    setStatus(`Slope diagnostic: ${legend}. Slide exit hysteresis is ${PLAYER_CONFIG.slideExitSlopeDegrees}°.`);
  } else setStatus('Slope diagnostic off.');
});
$('#show-snapshot-rocks').addEventListener('change', rebuildSnapshotObjects);
$('#clear-local').addEventListener('click', async () => {
  if (!isStoneveilWorld()) {
    if (!confirm(`Clear the browser autosave for ${activeWorld().label} and reload its project JSON?`)) return;
    saveGenericHistory();
    try { localStorage.removeItem(genericStorageKey()); } catch {}
    replaceActiveGenericLevel(await loadGenericProjectLevel(activeWorld(), { preferAutosave: false }), { persist: false });
    rebuildAll();
    setStatus(`Cleared ${activeWorld().label} browser autosave.`);
    return;
  }
  if (!confirm('Clear all Stoneveil browser editor changes? This does not change the project file, but it resets the current browser patch.')) return;
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
  const caveMeshSculptClick = activeWorldId === 'cave-fishing-island' && Boolean(activeGenericLevel()?.terrain?.mode === 'authored-mesh-candidate') && ['raise', 'lower', 'smooth', 'indent', 'pull-core'].includes(tool);
  const meshSculptClick = (isMeshMode() && ['raise', 'lower', 'smooth', 'indent', 'pull-core', 'connect-cave'].includes(tool)) || caveMeshSculptClick;
  draggingBrush = !meshSculptClick && ['raise', 'lower', 'indent', 'pull-core', 'plant'].includes(tool);
  activeBrushTransaction = draggingBrush;
  if (activeBrushTransaction) saveHistory();
  lastBrushPoint = null;
  applyToolAt(event, false);
});
canvas.addEventListener('pointermove', (event) => {
  if (walkthroughState.active) return;
  const hit = isStoneveilWorld() ? rayTerrainHit(event) : genericScene.surfaceHit(pointerRay(event));
  if (hit) $('#cursor-info').textContent = isStoneveilWorld()
    ? `x ${hit.x.toFixed(1)} · z ${hit.z.toFixed(1)} · ${Math.round(hit.y * FEET_PER_METER)} ft`
    : `x ${hit.x.toFixed(1)} · y ${hit.y.toFixed(1)} · z ${hit.z.toFixed(1)}`;
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
  if (!isStoneveilWorld()) {
    const record = genericScene.selectedRecord(selected.id);
    const position = ['water-v2','prefab-child-water','architecture-reference'].includes(selected.kind)
      ? record?.position
      : selected.kind === 'waypoint' ? record?.point
        : record?.transform?.position;
    if (!position) return false;
    cameraState.target.set(Number(position.x) || 0, Number(position.y) || 0, Number(position.z) || 0);
    cameraState.distance = clamp(cameraState.distance, 0.25, activeWorldId === 'skyscraper' ? 180 : 90);
    updateCamera();
    return true;
  }
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
  if ((event.ctrlKey || event.metaKey) && key === 'd') { event.preventDefault(); duplicateSelected(); return; }
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
  if (!isStoneveilWorld()) genericScene.update(dt);
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
$('#minimum-brightness')?.addEventListener('input', (event) => {
  applyMinimumBrightness(Number(event.target.value) / 100);
});
applyMinimumBrightness(minimumBrightness);
syncWalkthroughHud();

canvas.addEventListener('webglcontextlost', (event) => {
  // Calling preventDefault is required for the browser to allow restoration of this WebGL
  // context instead of treating the loss as terminal. Keep the current in-memory editor
  // state/camera; do NOT rerun startup source selection on a graphics-only reset.
  event.preventDefault();
  if (walkthroughState.active) exitWalkthrough();
  saveCameraViewNow();
  stoneveilContextRecovery = {
    worldId: activeWorldId,
    camera: cameraViewPayload(),
    selected: selected ? clone(selected) : null,
    tool
  };
  // Every edit is already queued to IndexedDB. Avoid serializing/cloning the giant mesh again
  // while the browser is under GPU-memory pressure. Generic worlds are small enough to persist.
  if (!isStoneveilWorld()) persistGenericLevel();
  console.warn('World Editor WebGL context lost; preserving the current in-memory world/camera for restoration.');
  setStatus('Graphics reset detected — preserving current world, camera and selection…');
});
canvas.addEventListener('webglcontextrestored', () => {
  webglRecoveryCount += 1;
  rebuildAll();
  const recovery = stoneveilContextRecovery;
  if (recovery?.worldId === activeWorldId && recovery.camera) {
    cameraState.target.set(recovery.camera.target.x, recovery.camera.target.y, recovery.camera.target.z);
    cameraState.yaw = recovery.camera.yaw;
    cameraState.pitch = recovery.camera.pitch;
    cameraState.distance = recovery.camera.distance;
    selected = recovery.selected;
    tool = recovery.tool || tool;
  }
  updateCamera();
  saveCameraViewNow();
  stoneveilContextRecovery = null;
  setStatus(`Graphics context restored in-place (${webglRecoveryCount}). Current terrain source, camera and selection were preserved.`);
});

window.addEventListener('resize', () => app.resizeCanvas());

setupV21Ui();

async function initializeWorldEditorV2() {
  try {
    // The checked-in project patch is always the Stoneveil baseline. Browser recovery is only
    // auto-applied when it explicitly records that SAME terrain revision as its base. This
    // prevents a later-timestamped recovery from an older mountain from silently replacing a
    // newer game/project mountain after a reload or graphics failure.
    const response = await fetch('../../src/world/map-editor-patch.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Stoneveil project patch HTTP ${response.status}`);
    const projectPatch = normalizePatch(await response.json());
    stoneveilProjectSignature = stoneveilTerrainSignature(projectPatch);
    patch = projectPatch;
    let compatibleRecoveryApplied = false;
    const recovery = await readRecoverySnapshot();
    if (recovery?.patch && recoveryMatchesCurrentProject(recovery)) {
      const recovered = normalizePatch(recovery.patch);
      if (patchTimestamp(recovered) > patchTimestamp(projectPatch)) {
        patch = recovered;
        compatibleRecoveryApplied = true;
      }
    }
    runtimeSnapshot = clone(patch.bakedSnapshot ?? { objects: [], rocks: [] });
    persistPatch();
    syncSnapshotUi();
    await switchWorld(activeWorldId, { keepCamera: activeWorldId === 'stoneveil-peak' });
    if (isStoneveilWorld()) {
      setStatus(compatibleRecoveryApplied
        ? 'World Editor V2.3.1 ready. Recovered edits from the SAME project Stoneveil terrain revision.'
        : 'World Editor V2.3.1 ready. Project Stoneveil terrain is authoritative; stale/different browser recovery was not auto-applied.');
    }
  } catch (error) {
    console.error(error);
    activeWorldId = 'stoneveil-peak';
    stoneveilRoot.enabled = true;
    genericScene.setEnabled(false);
    rebuildAll();
    setStatus(`World Editor V2 startup warning: ${error?.message || error}`);
  }
}
initializeWorldEditorV2();
