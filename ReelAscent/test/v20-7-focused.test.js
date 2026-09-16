import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ALL_FISHING_WATER_DESCRIPTORS } from '../src/world/mountain-v2.js';
import { getEcologySelection } from '../src/fishing/fish-ecology.js';
import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import { getWeightedSpeciesTable } from '../src/fishing/fish-data.js';
import {
  DEFAULT_GAMEPAD_BINDINGS,
  formatGamepadBinding,
  normalizeGamepadBindings,
  setGamepadBinding
} from '../src/player/movement.js';
import {
  COSMETIC_BY_ID,
  GENERIC_COSMETIC_VISUAL_DUPLICATE_GROUPS,
  PENDING_COSMETIC_VISUAL_REDESIGN_IDS,
  cosmeticVisualRedesignPending
} from '../src/progression/cosmetics.js';

const summitPool = (descriptor) => getEcologySelection({
  ...descriptor,
  center: { x: 0, y: descriptor.y ?? 0, z: 0 },
  modifiers: {}
});

test('authored Stoneveil keeps summit floor but excludes duplicate Crown sides', async () => {
  const [source, runtime] = await Promise.all([
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/map-editor-runtime.js', import.meta.url), 'utf8')
  ]);
  assert.match(source, /this\.authoredStoneveilCoreActive\s*\? topTriangles/);
  assert.match(source, /authoredSummitInfill/);
  assert.match(runtime, /summitIndices\.map\(\(index\) => index \+ summitVertexOffset\)/);
  assert.match(runtime, /editorIncludesSummitInfill/);
  assert.match(source, /auditStoneveilTerrainAuthority\(\)/);
  assert.match(source, /bakedRenders:[\s\S]{0,900}legacyCrownColliders/);
});

test('both real summit waters gained intended candidates without future-reserved entries', () => {
  const species = new Map(FISH_SPECIES.map((fish) => [fish.id, fish]));
  const waters = ALL_FISHING_WATER_DESCRIPTORS.filter((water) => water.tier === 'summit');
  assert.deepEqual(waters.map((water) => water.id).sort(), ['crooked-peak-tarn', 'crown-vault']);
  for (const water of waters) {
    const selection = summitPool(water);
    assert.ok(selection.fishIds.length >= 32, `${water.id}: ${selection.fishIds.length}`);
    const live = getWeightedSpeciesTable(selection.fishIds, {
      ...water.modifiers,
      rarityTier: selection.habitat.rarityTier,
      habitatWeights: selection.habitatWeights,
      maximumSpeciesProbability: water.maximumSpeciesProbability
    });
    assert.ok(live.length >= (water.id === 'crooked-peak-tarn' ? 29 : 32));
    assert.ok(live.every((entry) => entry.probability > 0));
    assert.ok(selection.fishIds.includes('naiad'));
    assert.ok(selection.fishIds.includes('beluga-sturgeon'));
    assert.ok(selection.fishIds.every((id) => !species.get(id)?.futureReserved));
  }
});

test('appearance is five visible button tabs, keeps skin slider, and has no cosmetic dropdown', async () => {
  const [markup, menu] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/appearance-menu.js', import.meta.url), 'utf8')
  ]);
  for (const tab of ['body', 'hair', 'face', 'neck', 'back']) assert.match(markup, new RegExp(`data-appearance-tab="${tab}"`));
  assert.doesNotMatch(menu, /createElement\('select'\)|data\.appearanceSelect/);
  assert.match(menu, /dataset\.appearanceSkinSlider/);
  assert.match(menu, /const duplicateGroup = group\.cosmetic \? cosmeticVisualDuplicateGroup/);
  assert.match(menu, /button\.disabled = Boolean\(redesignPending\)/);
  assert.match(menu, /Visual redesign pending/);
});

test('unresolved generic Legendary duplicates remain canonical but are marked pending', () => {
  assert.equal(PENDING_COSMETIC_VISUAL_REDESIGN_IDS.length, 48);
  for (const id of PENDING_COSMETIC_VISUAL_REDESIGN_IDS) {
    assert.ok(COSMETIC_BY_ID.has(id), id);
    assert.equal(cosmeticVisualRedesignPending(id), true);
  }
  assert.equal(COSMETIC_BY_ID.get('catch-green_sea_turtle').visual, 'shell');
  for (const group of GENERIC_COSMETIC_VISUAL_DUPLICATE_GROUPS) {
    assert.equal(cosmeticVisualRedesignPending(group[0]), false);
    assert.ok(group.slice(1).every(cosmeticVisualRedesignPending));
  }
});

test('controller bindings normalize, label and reject duplicates', () => {
  assert.equal(formatGamepadBinding(DEFAULT_GAMEPAD_BINDINGS.jump), 'A');
  assert.equal(formatGamepadBinding(null), 'Unbound');
  assert.equal(normalizeGamepadBindings({ jump: 999 }).jump, DEFAULT_GAMEPAD_BINDINGS.jump);
  const duplicate = setGamepadBinding('map', DEFAULT_GAMEPAD_BINDINGS.jump, { ...DEFAULT_GAMEPAD_BINDINGS });
  assert.equal(duplicate.ok, false);
  const movement = setGamepadBinding('forward', 3, { ...DEFAULT_GAMEPAD_BINDINGS });
  assert.equal(movement.ok, false);
});
