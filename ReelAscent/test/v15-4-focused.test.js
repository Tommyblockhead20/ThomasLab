import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INVENTORY_SORT_OPTIONS, sortInventorySpecimens } from '../src/ui/inventory.js';
import { MOUNTAIN_FISHING_LOCATIONS } from '../src/world/mountain-v2.js';

const specimen = (id, overrides = {}) => ({
  specimenId: id,
  name: id,
  rarity: 'Common',
  quality: 'GOOD',
  length: 10,
  weight: 1,
  value: 10,
  lengthCategoryIndex: 2,
  sizeCategoryIndex: 2,
  provenance: { caughtAt: 1, locationLabel: 'Stoneveil Tarn' },
  ...overrides
});

test('v15.4 catch sorting exposes every requested mode with stable useful tie-breakers', () => {
  assert.deepEqual(INVENTORY_SORT_OPTIONS.map(([value]) => value), [
    'recent', 'value', 'rarity', 'size', 'species', 'location'
  ]);
  const catches = [
    specimen('bass', { name: 'Bass', rarity: 'Rare', value: 80, length: 19, lengthCategoryIndex: 3,
      provenance: { caughtAt: 20, locationLabel: 'Mangrove Lagoon' } }),
    specimen('char', { name: 'Arctic Char', rarity: 'Legendary', value: 70, length: 14, lengthCategoryIndex: 2,
      provenance: { caughtAt: 30, locationLabel: 'Frosthook' } }),
    specimen('pike', { name: 'Pike', rarity: 'Rare', value: 90, length: 31, lengthCategoryIndex: 4,
      provenance: { caughtAt: 10, locationLabel: 'Frosthook' } })
  ];
  assert.deepEqual(sortInventorySpecimens(catches, 'recent').map(({ specimenId }) => specimenId), ['char', 'bass', 'pike']);
  assert.deepEqual(sortInventorySpecimens(catches, 'value').map(({ specimenId }) => specimenId), ['pike', 'bass', 'char']);
  assert.deepEqual(sortInventorySpecimens(catches, 'rarity').map(({ specimenId }) => specimenId), ['char', 'pike', 'bass']);
  assert.deepEqual(sortInventorySpecimens(catches, 'size').map(({ specimenId }) => specimenId), ['pike', 'bass', 'char']);
  assert.deepEqual(sortInventorySpecimens(catches, 'species').map(({ specimenId }) => specimenId), ['char', 'bass', 'pike']);
  assert.deepEqual(sortInventorySpecimens(catches, 'location').map(({ specimenId }) => specimenId), ['char', 'pike', 'bass']);
});

test('Mangrove Lagoon sits below a carved bank and owns a seated fishing log interaction', async () => {
  const lagoon = MOUNTAIN_FISHING_LOCATIONS.find(({ id }) => id === 'amber-reed-pond');
  assert.equal(lagoon.waterY, .62);
  const source = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(source, /const mangroveLagoonCenter = location\.id === 'normal-fishing-island'/);
  assert.match(source, /const basinFloor = location\.elevation - \.36/);
  assert.match(source, /Mangrove Lagoon sit-and-fish log/);
  assert.match(source, /id: 'mangrove-lagoon-fishing-log'[\s\S]{0,500}fishingFacing: 'amber-reed-pond'/);
  assert.doesNotMatch(source, /Mangrove Cay submerged warm mud shelf/);
});

test('Aquarium UI preserves compact management and explicit move actions in the rebuilt hierarchy', async () => {
  const source = await readFile(new URL('../src/ui/aquarium.js', import.meta.url), 'utf8');
  assert.match(source, /aquarium-summary-row/);
  assert.match(source, /aquarium-tank-rail/);
  assert.match(source, /aquarium-specimen-browser/);
  assert.match(source, /Browsing all retained and carried creatures/);
  assert.match(source, /MOVE TO TANK/);
  assert.match(source, /CURRENT PLACEMENT/);
});

test('Aquarium dock approach has a dedicated low-profile path and restrained controls', async () => {
  const worldSource = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(worldSource, /Glasswater packed dock path/);
  assert.match(worldSource, /dockArrivalDistance/);
  assert.match(styles, /\.aquarium-tank-list \{ min-height: 0; display: grid/);
  assert.match(styles, /\.aquarium-tank-card\.is-selected \{ background: rgb\(239 217 139 \/ 8%\)/);
});

test('fish buyer copy no longer explains duplicate aquarium sale behavior', async () => {
  const source = await readFile(new URL('../src/ui/shop.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Aquarium residents are never included|Aquarium specimens are not included|Aquarium specimens stay on display/);
});
