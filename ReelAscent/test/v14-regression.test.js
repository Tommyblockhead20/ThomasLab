import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CLIMBING_CONFIG, PLAYER_CONFIG } from '../src/config.js';
import { repairAttachmentLayout } from '../src/fishing/specimen-model.js';
import { encodeProgressBackup, decodeProgressBackup } from '../src/persistence/progress-backup.js';
import { defaultSave, SaveSystem } from '../src/persistence/save-system.js';
import { serializeProgress, validateProgressImport } from '../src/progression/progress-transfer.js';
import {
  FROSTHOOK_COLD_OCEAN_DESCRIPTOR,
  ISLAND_UNDERWATER_PROFILE,
  OCEAN_FISHING_DESCRIPTOR
} from '../src/world/mountain-v2.js';
import { SATELLITE_WORLD_LOCATIONS, WORLD_LOCATIONS } from '../src/world/world-locations.js';

const here = new URL('..', import.meta.url);

test('v14 centralizes small-lip movement, broadens grip volume, and keeps two-point ledge rest', () => {
  assert.equal(PLAYER_CONFIG.microLipHeight, .46);
  assert.ok(PLAYER_CONFIG.microLipMinimumWidth > 0);
  assert.ok(CLIMBING_CONFIG.gripProbeVerticalOffset > 0);
  assert.ok(CLIMBING_CONFIG.gripProbeFanAmount > 0);
  assert.deepEqual(CLIMBING_CONFIG.mantleFaceProbeSideOffsets, [0, -.18, .18]);
  assert.ok(PLAYER_CONFIG.staminaPartialSupportFraction <= 2 / 9);
});

test('dense secondary rock infill opts into rounded collision proxies', async () => {
  const source = await readFile(new URL('src/world/mountain-v2.js', here), 'utf8');
  assert.match(source, /ColliderDesc\.roundCuboid/);
  assert.match(source, /collisionProxy: 'rounded-box'/);
});

test('mouse look remains active while primary Grip is held', async () => {
  const source = await readFile(new URL('src/camera/orbit-camera.js', here), 'utf8');
  assert.doesNotMatch(source, /if \(this\.player\.input\.primaryHeld\) return/);
  assert.match(source, /Looking is independent from action ownership/);
});

test('normal HUD is clean and Escape owns the six ordered v14 sections', async () => {
  const html = await readFile(new URL('index.html', here), 'utf8');
  assert.doesNotMatch(html, /id="return-home"/);
  assert.doesNotMatch(html, /class="controls-card"/);
  const pause = html.slice(html.indexOf('id="pause-menu"'), html.indexOf('id="fish-journal"'));
  const labels = [...pause.matchAll(/<button[^>]+(?:data-pause-tab|data-pause-action|data-pause-open-multiplayer)[^>]*>([^<]+)/g)]
    .map((match) => match[1]);
  assert.deepEqual(labels, ['CABIN', 'MULTIPLAYER', 'SAVES', 'SETTINGS', 'STATS', 'CONTROLS']);
  assert.doesNotMatch(html, /id="game-version"/);
  assert.match(pause, /id="pause-version"/);
});

test('compressed progress round-trips all durable save families through current validation', async () => {
  const save = defaultSave();
  save.progression.money = 4321;
  save.progression.ownedEquipment.push('precision-tip-rod');
  save.progression.equipped.rod = 'precision-tip-rod';
  save.progression.ownedItems.push('gps-map');
  save.progression.appearance.shirtTint = '#123456';
  save.progression.aquariumCapacityTier = 3;
  save.progression.aquariumIncome = { bankedActiveSeconds: 81, lastObservedActiveSeconds: 900, lifetimePaid: 275 };
  save.progression.inventory.push({ specimenId: 'specimen-v14', speciesId: 'bluegill', name: 'Bluegill', length: 9, weight: 1 });
  save.progression.aquarium.push({ specimenId: 'aquarium-v14', speciesId: 'common-carp', name: 'Common Carp', length: 20, weight: 4 });
  save.collection.bluegill = { discovered: true, catches: 2 };
  save.lifetime.fishCaught = 2;
  save.trailBadges.unlocked.push('v14-test');
  save.trailBadges.uniqueSpeciesSold.push('bluegill');
  save.trailBadges.watersFished.push('outer-ocean');
  save.trailBadges.destinationsVisited.push('home-island');
  save.runHistory.push({ endedAt: 1, highestElevation: 100, fishCaught: 2, rarest: 'Rare', summitReached: false, start: 'Test' });
  const text = serializeProgress(save, { createdAt: 111, updatedAt: 222 });
  assert.equal(text.includes('\n'), false, 'source of truth should be compact');
  const encoded = await encodeProgressBackup(text);
  const decoded = await decodeProgressBackup(encoded.bytes);
  const validated = validateProgressImport(decoded);
  const storageData = new Map();
  const storage = {
    getItem: (key) => storageData.get(key) ?? null,
    setItem: (key, value) => storageData.set(key, value)
  };
  const saveSystem = new SaveSystem(storage);
  assert.equal(saveSystem.getSlotSnapshot('slot-2'), null);
  assert.equal(saveSystem.replaceSlotData('slot-2', validated.save, validated.saveMetadata), true);
  const imported = saveSystem.getSlotSnapshot('slot-2');
  assert.equal(imported.progression.money, 4321);
  assert.equal(imported.progression.inventory[0].specimenId, 'specimen-v14');
  assert.equal(imported.progression.aquarium[0].specimenId, 'aquarium-v14');
  assert.equal(imported.progression.aquariumCapacityTier, 3);
  assert.equal(imported.progression.aquariumIncome.lifetimePaid, 275);
  assert.equal(imported.progression.appearance.shirtTint, '#123456');
  assert.ok(imported.progression.ownedEquipment.includes('precision-tip-rod'));
  assert.equal(imported.progression.equipped.rod, 'precision-tip-rod');
  assert.ok(imported.progression.ownedItems.includes('gps-map'));
  assert.equal(imported.collection.bluegill.discovered, true);
  assert.equal(imported.lifetime.fishCaught, 2);
  assert.ok(imported.trailBadges.unlocked.includes('v14-test'));
  assert.ok(imported.trailBadges.uniqueSpeciesSold.includes('bluegill'));
  assert.ok(imported.trailBadges.watersFished.includes('outer-ocean'));
  assert.ok(imported.trailBadges.destinationsVisited.includes('home-island'));
  assert.equal(imported.runHistory.length, 1);
  assert.deepEqual(saveSystem.getSlotMetadata('slot-2'), { createdAt: 111, updatedAt: 222 });
});

test('canonical model-space attachment repair connects separated visible parts', () => {
  const input = [
    { name: 'body', position: { x: 0, y: 0, z: 0 }, scale: { x: .6, y: .3, z: .3 } },
    { name: 'head', position: { x: .62, y: 0, z: 0 }, scale: { x: .25, y: .24, z: .24 } },
    { name: 'tail', position: { x: -.72, y: 0, z: 0 }, scale: { x: .28, y: .4, z: .08 } },
    { name: 'eye', position: { x: .72, y: .08, z: .2 }, scale: { x: .045, y: .045, z: .035 } }
  ];
  const result = repairAttachmentLayout(input);
  assert.ok(result.corrections.length >= 2);
  const reaches = (a, b) => ['x', 'y', 'z'].every((axis) => (
    Math.abs(a.position[axis] - b.position[axis])
      <= (a.scale[axis] + b.scale[axis]) * .5 - .012 + 1e-9
  ));
  const visited = new Set([0]);
  while (true) {
    const before = visited.size;
    result.parts.forEach((part, index) => {
      if ([...visited].some((other) => reaches(part, result.parts[other]))) visited.add(index);
    });
    if (visited.size === before) break;
  }
  assert.equal(visited.size, result.parts.length);
});

test('future archive and large tower foundation are generic, stable, map-visible locked destinations', () => {
  assert.equal(SATELLITE_WORLD_LOCATIONS.length, 9);
  const archive = WORLD_LOCATIONS.find((entry) => entry.id === 'veiled-athenaeum');
  const tower = WORLD_LOCATIONS.find((entry) => entry.id === 'skyreach-foundation');
  assert.equal(archive.type, 'mythical-library-island');
  assert.equal(tower.type, 'large-island-foundation');
  for (const location of [archive, tower]) {
    assert.equal(location.destination.enabled, false);
    assert.ok(location.destination.lockMessage.length > 30);
    assert.ok(location.outline.length >= 12);
    assert.ok(location.loadGroup);
    assert.ok(location.dock.arrivalPosition);
  }
  assert.ok(tower.radii.x >= 45);
});

test('small-island submerged apron is broad and staged without changing shoreline radius', () => {
  assert.deepEqual(ISLAND_UNDERWATER_PROFILE.radiusFactors, [2.35, 1.65, 1]);
  assert.ok(ISLAND_UNDERWATER_PROFILE.intermediateDepth > 1);
});

test('Frosthook marine water remains a distinct Cold Ocean before generic ocean fallback', async () => {
  assert.equal(FROSTHOOK_COLD_OCEAN_DESCRIPTOR.label, 'Frosthook Cold Ocean');
  assert.equal(FROSTHOOK_COLD_OCEAN_DESCRIPTOR.waterType, 'cold-ocean');
  assert.notEqual(FROSTHOOK_COLD_OCEAN_DESCRIPTOR.id, OCEAN_FISHING_DESCRIPTOR.id);
  const source = await readFile(new URL('src/world/mountain-v2.js', here), 'utf8');
  assert.match(source, /if \(isFrosthookColdOceanPoint\(point\)\) return FROSTHOOK_COLD_OCEAN_DESCRIPTOR\.outerRadius/);
});
