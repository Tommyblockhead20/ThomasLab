import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ACCESSORIES,
  AVATAR_TYPES,
  DEFAULT_APPEARANCE,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  normalizeAppearance
} from '../src/player/appearance.js';
import { SAVE_SCHEMA_VERSION, SAVE_STORAGE_KEY, SaveSystem } from '../src/persistence/save-system.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import { validateProgressImport } from '../src/progression/progress-transfer.js';
import { createPlayerSnapshot } from '../src/multiplayer/protocol.js';
import { RoomState } from '../src/multiplayer/room-state.js';
import { sanitizeAppearance, validateSnapshot } from '../server/src/snapshot-validation.js';
import {
  FRACTURED_ROCK_FORM_KINDS,
  HOME_CABIN_CONFIG,
  MOUNTAIN_FOOT_RADIUS
} from '../src/world/mountain-v2.js';

class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const customAppearance = Object.freeze({
  avatarType: 'blob',
  skinTone: 'deep',
  shirtColor: 'plum',
  pantsColor: 'denim',
  hairStyle: 'mohawk',
  hairColor: 'teal',
  accessory: 'glasses',
  headwear: 'none',
  eyewear: 'glasses',
  faceAccessory: 'none',
  backAccessory: 'backpack',
  backpackColor: 'coral',
  blobColor: 'violet',
  shirtTint: '#123456',
  pantsTint: '#654321',
  hairTint: '#abcdef',
  accessoryTint: '#fedcba',
  blobTint: '#47b8f2'
});

test('appearance catalog has curated human options and Blue Blob is opt-in', () => {
  assert.deepEqual(AVATAR_TYPES.map((entry) => entry.id), ['human', 'blob']);
  assert.equal(DEFAULT_APPEARANCE.avatarType, 'human');
  assert.ok(SKIN_TONES.length >= 5);
  assert.ok(SHIRT_COLORS.length >= 6);
  assert.ok(PANTS_COLORS.length >= 5);
  assert.ok(HAIR_STYLES.length >= 5);
  assert.ok(HAIR_COLORS.length >= 6);
  assert.ok(ACCESSORIES.length >= 4);
  assert.deepEqual(normalizeAppearance({ avatarType: 'spaceship', accessory: '<script>' }), DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance(customAppearance), customAppearance);
});

test('old saves migrate to human defaults while chosen cosmetics persist and export/import', () => {
  const legacyStorage = new MemoryStorage({
    [SAVE_STORAGE_KEY]: JSON.stringify({ version: 5, progression: { money: 14 } })
  });
  const legacy = new SaveSystem(legacyStorage);
  assert.equal(legacy.data.version, SAVE_SCHEMA_VERSION);
  assert.deepEqual(legacy.data.progression.appearance, DEFAULT_APPEARANCE);

  const storage = new MemoryStorage();
  const save = new SaveSystem(storage);
  const progression = new ProgressionSystem(save);
  assert.deepEqual(progression.setAppearance(customAppearance), customAppearance);
  assert.deepEqual(new SaveSystem(storage).data.progression.appearance, customAppearance);
  const imported = validateProgressImport(progression.exportProgress());
  assert.deepEqual(imported.save.progression.appearance, customAppearance);
  assert.deepEqual(imported.document.progression.economy.appearance, customAppearance);
});

test('protocol v1 carries normalized cosmetic IDs and colors and the server sanitizes each field', () => {
  const message = createPlayerSnapshot('player-v9', {
    position: { x: 1, y: 2, z: 3 }, yaw: 30, movement: 'grounded', appearance: customAppearance
  }, 1);
  assert.equal(message.protocolVersion, 1);
  assert.deepEqual(message.payload.appearance, customAppearance);
  assert.equal(JSON.stringify(message.payload.appearance).includes('mesh'), false);

  const session = { playerId: 'player-v9', lastSequence: 0, lastSnapshot: null };
  const accepted = validateSnapshot(message.payload, session, 1000);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.snapshot.appearance, customAppearance);
  assert.deepEqual(sanitizeAppearance({ ...customAppearance, hairStyle: 'injected', accessory: 44 }), {
    ...customAppearance, hairStyle: DEFAULT_APPEARANCE.hairStyle, accessory: DEFAULT_APPEARANCE.accessory
  });
});

test('room roster applies appearance immediately and snapshots update the existing avatar live', () => {
  const room = new RoomState('local');
  const applied = [];
  room.applyRoomState({ players: [
    { id: 'local' },
    { id: 'remote', appearance: customAppearance }
  ] }, (playerId, colorIndex, appearance) => ({
    playerId, colorIndex, initialAppearance: appearance,
    setAppearance(value) { applied.push(normalizeAppearance(value)); },
    setPosition() {}, setEulerAngles() {}, setMovementState() {}, destroy() {}
  }));
  const representation = room.members.get('remote').representation;
  assert.deepEqual(representation.initialAppearance, customAppearance);
  assert.deepEqual(applied.at(-1), customAppearance);
  const changed = { ...customAppearance, avatarType: 'human', shirtColor: 'ember' };
  assert.equal(room.consumeSnapshot({
    playerId: 'remote', sequence: 1, serverTime: 1000,
    position: { x: 0, y: 1, z: 0 }, yaw: 0, movement: 'grounded', appearance: changed
  }), true);
  assert.deepEqual(applied.at(-1), changed);
  assert.equal(room.members.get('remote').representation, representation);
  room.clear();
});

test('cabin initializes outside the climb web with solid structure and useful interactions', async () => {
  const [mountain, html, game] = await Promise.all([
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/game.js', import.meta.url), 'utf8')
  ]);
  assert.ok(HOME_CABIN_CONFIG.radius > MOUNTAIN_FOOT_RADIUS);
  assert.ok(HOME_CABIN_CONFIG.width >= 8 && HOME_CABIN_CONFIG.depth >= 6);
  assert.ok(HOME_CABIN_CONFIG.interactionDistance < 3);
  assert.match(mountain, /buildStarts\(\);\s*this\.buildHomeCabin\(\);\s*this\.buildPublicAquarium\(\);\s*this\.buildContinuousClimbWeb\(\)/);
  assert.match(mountain, /Trail cabin stable floor[\s\S]*Trail cabin back wall[\s\S]*Trail cabin doorway header/);
  assert.match(mountain, /action: 'appearance'[\s\S]*action: 'rest'[\s\S]*action: 'trophies'/);
  assert.match(mountain, /getNearestHomeInteraction/);
  assert.match(html, /id="appearance-menu"/);
  assert.match(html, /id="home-interaction-action"[^>]*>[\s\S]*<kbd>X<\/kbd>/);
  assert.match(game, /new HomeInteractionController/);
});

test('environment pass tapers vegetation and keeps small detail decorative', async () => {
  const [mountain, game, camera] = await Promise.all([
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/game.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/camera/orbit-camera.js', import.meta.url), 'utf8')
  ]);
  assert.match(mountain, /buildEnvironmentAesthetics/);
  assert.match(mountain, /solidTrees < LOWLAND_TREE_CONFIG\.maximumClimbableTrees/);
  assert.match(mountain, /addEnvironmentTree[\s\S]*Lower mountain bush[\s\S]*Hardy alpine scrub/);
  assert.match(mountain, /Coastal grass cluster[\s\S]*castShadows: false/);
  assert.match(mountain, /isEnvironmentPlacementOpen[\s\S]*rockPlacements\.some/);
  assert.match(mountain, /500ft wind-bent landmark shrub|\$\{rest\.id\} wind-bent landmark shrub/);
  assert.match(mountain, /this\.materials\.caveWall/);
  assert.match(game, /fog\.start = 190[\s\S]*fog\.end = 425/);
  assert.match(camera, /clearColor: new pc\.Color\(0\.42, 0\.68, 0\.77\)/);
});

test('rock variety adds new silhouettes and regional material treatment without collider drift', async () => {
  const mountain = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.ok(FRACTURED_ROCK_FORM_KINDS.length >= 15);
  for (const kind of ['shard', 'hook', 'knuckle', 'slab']) {
    assert.ok(FRACTURED_ROCK_FORM_KINDS.includes(kind));
  }
  assert.match(mountain, /const environments = \[[\s\S]*warm:[\s\S]*green:/);
  assert.match(mountain, /environmentIndex = 5[\s\S]*environmentIndex = 4[\s\S]*environmentIndex = 3/);
  assert.match(mountain, /ColliderDesc\.convexHull\(points\)/);
  assert.match(mountain, /form\.mesh[\s\S]*form\.hull/);
});
