import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH_SPECIES, resolveSpecies, getWeightedSpeciesTable } from '../src/fishing/fish-data.js';
import { FUTURE_CREATURE_RESERVATIONS } from '../src/fishing/future-reservations.js';
import { buildEcologyAudit } from '../scripts/ecology-audit.mjs';
import { defaultSave, migrate } from '../src/persistence/save-system.js';
import { getCatchValue } from '../src/progression/economy.js';
import { scoreBestCatch } from '../src/persistence/best-catch.js';

test('v20 final roster keeps 300 stable species IDs in four equal tiers', () => {
  assert.equal(FISH_SPECIES.length, 300);
  assert.equal(new Set(FISH_SPECIES.map((fish) => fish.id)).size, 300);
  for (const rarity of ['Common', 'Uncommon', 'Rare', 'Legendary']) {
    assert.equal(FISH_SPECIES.filter((fish) => fish.rarity === rarity).length, 75);
  }
  assert.equal(resolveSpecies('siren-ray').name, 'Siren');
  assert.equal(resolveSpecies('siren_ray').id, 'siren-ray');
  assert.equal(resolveSpecies('siren-ray').visual.archetype, 'sirenian');
});

test('future reservations are canonical but have no current legitimate catch probability', () => {
  const audit = buildEcologyAudit();
  assert.equal(audit.waterCount, 28);
  assert.equal(audit.futureReservedCount, Object.keys(FUTURE_CREATURE_RESERVATIONS).length);
  assert.deepEqual(audit.accidentallyUnreachable, []);
  assert.ok(audit.species.every((fish) => fish.status === 'CURRENTLY OBTAINABLE' || fish.status === 'FUTURE RESERVED'));
  for (const fish of FISH_SPECIES.filter((entry) => entry.futureReserved)) {
    assert.equal(getWeightedSpeciesTable([fish.id]).length, 0, fish.id);
    assert.equal(audit.species.find((entry) => entry.id === fish.id).eligibleWaters, 0);
  }
  assert.ok(audit.waters.find((water) => water.id === 'bluewater-reach-water').exclusives.length >= 3);
  assert.ok(audit.waters.find((water) => water.id === 'outer-ocean').exclusives.length >= 3);
  assert.ok(audit.waters.find((water) => water.id === 'blue-ice-melt').exclusives.length >= 3);
});

test('v14 saves retain earned outgoing Legendary cosmetics and reprice old specimens', () => {
  const old = defaultSave();
  old.version = 14;
  old.collection.starfall_minnow = { discovered: true, catches: 1, rarity: 'Legendary' };
  const historic = {
    specimenId: 'historic-1', speciesId: 'starfall_minnow', ownerId: old.progression.player.id,
    name: 'Starfall Minnow', rarity: 'Legendary', length: 8, weight: .5,
    expectedWeight: .45, sizeFraction: .7, weightFraction: .7, shiny: false,
    quality: 'GOOD', value: 999, provenance: { caughtAt: 123, locationId: 'twilight-basin' }
  };
  old.progression.inventory.push(historic);
  old.lifetime.bestCatch = { ...historic, caughtAt: 123 };
  const migrated = migrate(old);
  assert.equal(migrated.version, 15);
  assert.ok(migrated.progression.ownedCosmetics.includes('catch-starfall_minnow'));
  assert.equal(migrated.collection.starfall_minnow.rarity, 'Rare');
  const specimen = migrated.progression.inventory[0];
  assert.equal(specimen.specimenId, 'historic-1');
  assert.equal(specimen.rarity, 'Rare');
  assert.equal(specimen.value, getCatchValue({ ...historic, rarity: 'Rare' }));
  assert.equal(migrated.lifetime.bestCatch.rarity, 'Rare');
  assert.equal(scoreBestCatch({ ...historic, rarity: 'Legendary' }).score,
    scoreBestCatch({ ...historic, rarity: 'Rare' }).score);
  const fresh = defaultSave();
  fresh.collection.starfall_minnow = { discovered: true, catches: 1, rarity: 'Rare' };
  assert.ok(!migrate(fresh).progression.ownedCosmetics.includes('catch-starfall_minnow'));
});

test('future reservation does not erase a previously owned specimen or discovery', () => {
  const old = defaultSave();
  old.version = 14;
  old.collection.flying_fish = { discovered: true, catches: 1, rarity: 'Rare' };
  old.progression.inventory.push({
    specimenId: 'pre-reservation-flying-fish', speciesId: 'flying-fish',
    name: 'Flying Fish', rarity: 'Rare', length: 10, weight: 1,
    expectedWeight: 1, sizeFraction: .5, quality: 'GOOD', value: 52
  });
  const migrated = migrate(old);
  assert.equal(migrated.progression.inventory[0].specimenId, 'pre-reservation-flying-fish');
  assert.equal(migrated.progression.inventory[0].speciesId, 'flying_fish');
  assert.ok(migrated.collection['flying-fish']?.discovered || migrated.collection.flying_fish?.discovered);
});
