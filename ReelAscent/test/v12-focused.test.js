import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { FISHING_CONFIG } from '../src/config.js';
import { getRarityProfile, PHYSICAL_WATER_RARITY_PROFILES } from '../src/fishing/rarity-selection.js';
import { SELECTIVE_BOBBER_SETTINGS, sampleBobberBiteDelay } from '../src/fishing/selective-bobbers.js';
import { EQUIPMENT_BY_ID } from '../src/progression/equipment.js';
import { DEFAULT_EQUIPPED, normalizeProgressionState, PROGRESSION_SCHEMA_VERSION } from '../src/progression/progression-save.js';
import { getWorldLocation, WORLD_CENTER } from '../src/world/world-locations.js';

test('selective bobbers equip through the normal gear/save architecture', () => {
  assert.equal(PROGRESSION_SCHEMA_VERSION, 11);
  assert.equal(DEFAULT_EQUIPPED.bobber, 'trail-bobber');
  assert.equal(normalizeProgressionState({}).equipped.bobber, 'trail-bobber');
  assert.equal(EQUIPMENT_BY_ID.get('selective-drift-bobber')?.category, 'bobber');
  assert.equal(EQUIPMENT_BY_ID.get('trophy-sentinel-bobber')?.category, 'bobber');
});

test('bobber wait ranges and Ocean rarity shifts match the centralized settings', () => {
  const selective = SELECTIVE_BOBBER_SETTINGS.selective;
  const trophy = SELECTIVE_BOBBER_SETTINGS.trophy;
  assert.deepEqual([
    sampleBobberBiteDelay(selective, 0), sampleBobberBiteDelay(selective, 1)
  ], [21, 35]);
  assert.deepEqual([
    sampleBobberBiteDelay(trophy, 0), sampleBobberBiteDelay(trophy, 1)
  ], [58.5, 91.5]);
  const selectiveProfile = getRarityProfile({
    rarityProfile: PHYSICAL_WATER_RARITY_PROFILES.ocean,
    bobberAcceptanceByRarity: selective.acceptanceByRarity
  });
  const trophyProfile = getRarityProfile({
    rarityProfile: PHYSICAL_WATER_RARITY_PROFILES.ocean,
    bobberAcceptanceByRarity: trophy.acceptanceByRarity
  });
  assert.ok(selectiveProfile.Rare + selectiveProfile.Legendary > .22);
  assert.ok(trophyProfile.Rare + trophyProfile.Legendary > .29);
  assert.ok(trophyProfile.Rare + trophyProfile.Legendary < .34);
  assert.ok(trophyProfile.Common > 0);
});

test('match movement has an audio-start fallback and the HUD repairs visibility', async () => {
  assert.equal(FISHING_CONFIG.rhythmStartupFallbackSeconds, .9);
  const fishing = await readFile(new URL('../src/fishing/fishing.js', import.meta.url), 'utf8');
  const hud = await readFile(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(fishing, /stateTime >= \(this\.config\.rhythmStartupFallbackSeconds \?\? \.9\)/);
  assert.match(hud, /state === 'rhythm-starting'[\s\S]*rhythmPanel\.hidden = false/);
});

test("Outfitter's Reach dock is on the storefront/outward approach", () => {
  const shop = getWorldLocation('shop-island');
  const centerToDock = {
    x: shop.dock.worldPosition.x - shop.worldPosition.x,
    z: shop.dock.worldPosition.z - shop.worldPosition.z
  };
  const mountainToShop = {
    x: shop.worldPosition.x - WORLD_CENTER.x,
    z: shop.worldPosition.z - WORLD_CENTER.z
  };
  assert.ok(centerToDock.x * mountainToShop.x + centerToDock.z * mountainToShop.z > 0);
  assert.ok(shop.dock.arrivalPosition.y > shop.elevation);
});

test('Bluewater recovery keeps deck collision and removes only the deep hull collider', async () => {
  const mountain = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(mountain, /Bluewater Reach deep hull[\s\S]{0,180}, false\);/);
  assert.match(mountain, /Bluewater Reach stable fishing deck/);
  assert.match(mountain, /label: 'BOARD BOAT'[\s\S]*getBoatSoftlockRecovery/);
});
