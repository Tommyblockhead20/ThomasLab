import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import {
  resolveCreaturePresentation,
  SUPPORTED_CREATURE_ARCHETYPES
} from '../src/fishing/creature-presentation.js';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import { getRarityProfile, PHYSICAL_WATER_RARITY_PROFILES } from '../src/fishing/rarity-selection.js';
import { SELECTIVE_BOBBER_SETTINGS, sampleBobberBiteDelay } from '../src/fishing/selective-bobbers.js';
import { AVATAR_ATTACHMENT_OVERLAP_EPSILON, validateAvatarAttachmentSpec } from '../src/player/character-model.js';
import { EQUIPMENT_BY_ID } from '../src/progression/equipment.js';
import { BLUEWATER_SIDE_SEAT_CONFIG, MAIN_ISLAND_DOCK_CONFIG } from '../src/world/mountain-v2.js';

test('all 300 active species resolve through the supported shared presentation catalog', () => {
  assert.equal(FISH_SPECIES.length, 300);
  for (const species of FISH_SPECIES) {
    const result = resolveCreaturePresentation(species.canonicalId, { context: 'v13 audit', warn: false });
    assert.equal(result.canonicalId, species.canonicalId);
    assert.equal(result.fallback, null, `${species.name} must not fall back`);
    assert.equal(result.archetype, species.visual.archetype);
    assert.ok(SUPPORTED_CREATURE_ARCHETYPES.has(result.archetype));
  }
});

test('gallery retains canonical species IDs and all presentation contexts share the resolver', async () => {
  const [fishing, specimenModel, inventory, mountain, remote, player] = await Promise.all([
    readFile(new URL('../src/fishing/fishing.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/fishing/specimen-model.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/inventory.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/multiplayer/remote-avatar.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/player/player.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(fishing, /speciesId:\s*`gallery-model-/);
  assert.match(fishing, /resolveCreaturePresentation\(fish/);
  assert.match(specimenModel, /resolveCreaturePresentation\(specimen/);
  assert.match(inventory, /resolveCreaturePresentation\(specimen/);
  assert.match(mountain, /createSpecimenModel\(specimen/);
  assert.match(remote, /createSpecimenModel\(specimen/);
  assert.match(player, /createSpecimenModel\(specimen/);
});

test('avatar assembly spec guarantees overlap at every animated core joint', () => {
  const result = validateAvatarAttachmentSpec();
  assert.equal(result.valid, true);
  for (const [link, overlap] of Object.entries(result.links)) {
    assert.ok(overlap >= AVATAR_ATTACHMENT_OVERLAP_EPSILON - 1e-9, `${link} overlap`);
  }
});

test('path water resolves a local surface height instead of one fixed cascade height', () => {
  const zone = new FishingZone({
    id: 'slope', label: 'Slope', center: { x: 0, z: 0 }, surfaceY: 50,
    shape: 'path', pathPoints: [{ x: 0, y: 2, z: 0 }, { x: 10, y: 12, z: 0 }],
    pathWidth: 2, fishIds: []
  });
  assert.equal(zone.resolveSurfaceY({ x: 1, z: 0 }), 3);
  assert.equal(zone.resolveSurfaceY({ x: 9, z: 0 }), 11);
  assert.equal(zone.clampToWater({ x: 7, z: 1 }).y, 9);
});

test('waterfall bobber states use point-specific water height', async () => {
  const fishing = await readFile(new URL('../src/fishing/fishing.js', import.meta.url), 'utf8');
  assert.match(fishing, /target\.y = \(landingZone \?\? this\.zone\)\.resolveSurfaceY\(target\)/);
  assert.match(fishing, /updateWaiting[\s\S]*resolveSurfaceY\(this\.bobberPosition\)/);
  assert.match(fishing, /updateBite[\s\S]*resolveSurfaceY\(waterPoint\)/);
  assert.match(fishing, /updateRhythm[\s\S]*resolveSurfaceY\(waterPoint\)/);
});

test('main docks, helm, and side fishing seat have functional dimensions and cues', async () => {
  const mountain = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.ok(MAIN_ISLAND_DOCK_CONFIG.length >= 20);
  assert.ok(MAIN_ISLAND_DOCK_CONFIG.centerRadius + MAIN_ISLAND_DOCK_CONFIG.length * .5 > 225);
  assert.ok(BLUEWATER_SIDE_SEAT_CONFIG.interactionDistance >= 2);
  assert.match(mountain, /Bluewater Reach steering wheel/);
  assert.match(mountain, /Bluewater Reach pilot seat/);
  assert.match(mountain, /SIT & FISH OFF THE PORT SIDE/);
  assert.match(mountain, /USE HELM • TRAVEL \/ GO HOME/);
});

test('selective bobbers are accessible and only modestly tilt catch quality', () => {
  const selectiveItem = EQUIPMENT_BY_ID.get('selective-drift-bobber');
  const trophyItem = EQUIPMENT_BY_ID.get('trophy-sentinel-bobber');
  assert.equal(selectiveItem.price, 1800);
  assert.equal(trophyItem.price, 4500);
  assert.doesNotMatch(`${selectiveItem.effect} ${trophyItem.effect}`, /seconds|%|average|probability/i);
  assert.deepEqual([
    sampleBobberBiteDelay(SELECTIVE_BOBBER_SETTINGS.selective, 0),
    sampleBobberBiteDelay(SELECTIVE_BOBBER_SETTINGS.selective, 1)
  ], [21, 35]);
  assert.deepEqual([
    sampleBobberBiteDelay(SELECTIVE_BOBBER_SETTINGS.trophy, 0),
    sampleBobberBiteDelay(SELECTIVE_BOBBER_SETTINGS.trophy, 1)
  ], [58.5, 91.5]);
  const normal = PHYSICAL_WATER_RARITY_PROFILES.ocean;
  const selective = getRarityProfile({ rarityProfile: normal, bobberAcceptanceByRarity: SELECTIVE_BOBBER_SETTINGS.selective.acceptanceByRarity });
  const trophy = getRarityProfile({ rarityProfile: normal, bobberAcceptanceByRarity: SELECTIVE_BOBBER_SETTINGS.trophy.acceptanceByRarity });
  assert.ok(selective.Common < normal.Common && trophy.Common < selective.Common);
  assert.ok(selective.Rare + selective.Legendary < .27);
  assert.ok(trophy.Rare + trophy.Legendary < .34);
});

test('cabin door is swung clear and the front gable closes the roof gap', async () => {
  const mountain = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(mountain, /Trail cabin front gable course/);
  assert.match(mountain, /Trail cabin open door', \{ x: -\.63, y: 1\.36, z: 4\.08 \}/);
});
