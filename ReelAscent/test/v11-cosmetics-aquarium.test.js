import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ACCESSORIES,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_COLORS,
  SHIRT_COLORS
} from '../src/player/appearance.js';
import { sanitizeAppearance } from '../server/src/snapshot-validation.js';
import { specimenDisplayScale } from '../src/fishing/specimen-model.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import {
  PROGRESSION_SCHEMA_VERSION,
  defaultProgressionState,
  normalizeProgressionState,
  normalizeSpecimen
} from '../src/progression/progression-save.js';
import {
  HOME_CABIN_CONFIG,
  PUBLIC_AQUARIUM_CONFIG
} from '../src/world/mountain-v2.js';

function aquariumTestSpecimen(specimenId = 'specimen-v11') {
  return normalizeSpecimen({
    specimenId,
    ownerId: 'player-v11',
    speciesId: 'bluegill',
    name: 'Bluegill',
    rarity: 'Common',
    length: 12.25,
    weight: 1.1,
    expectedWeight: 1,
    shiny: true,
    value: 24,
    provenance: { caughtAt: 1_700_000_000_000, locationId: 'fernwater-pond' }
  }, 'player-v11');
}

function memorySaveWithSpecimen() {
  const specimen = aquariumTestSpecimen();
  const data = {
    progression: {
      ...defaultProgressionState('player-v11'),
      inventory: [specimen]
    }
  };
  return {
    data,
    saves: 0,
    save() { this.saves += 1; return true; }
  };
}

test('v11 expands every requested cosmetic category and server validation accepts it', async () => {
  assert.ok(SHIRT_COLORS.length >= 9);
  assert.ok(PANTS_COLORS.length >= 7);
  assert.ok(HAIR_COLORS.length >= 9);
  for (const id of ['long', 'bun', 'braids']) assert.ok(HAIR_STYLES.some((entry) => entry.id === id));
  for (const id of ['fishing-cap', 'headlamp', 'scarf', 'flower-crown', 'goggles']) {
    assert.ok(ACCESSORIES.some((entry) => entry.id === id));
    assert.equal(sanitizeAppearance({ accessory: id }).accessory, id);
  }

  const [player, remote] = await Promise.all([
    readFile(new URL('../src/player/player.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/multiplayer/remote-avatar.js', import.meta.url), 'utf8')
  ]);
  for (const source of [player, remote]) {
    for (const id of ['long', 'bun', 'braids']) assert.match(source, new RegExp(`\\['${id}',`));
    for (const id of ['fishing-cap', 'headlamp', 'scarf', 'flower-crown', 'goggles']) {
      assert.match(source, new RegExp(`\\['${id}',`));
    }
  }
});

test('an exact inventory specimen can be held, put away, and cannot remain held after aquarium transfer', () => {
  const save = memorySaveWithSpecimen();
  const progression = new ProgressionSystem(save);
  const specimen = progression.state.inventory[0];

  assert.equal(progression.setHeldInventorySpecimen(specimen.specimenId).specimen, specimen);
  assert.equal(progression.getHeldInventorySpecimen(), specimen);
  assert.equal(progression.state.heldSpecimenId, specimen.specimenId);
  assert.equal(save.saves, 1);

  assert.equal(progression.setHeldInventorySpecimen(specimen.specimenId).specimen, null);
  assert.equal(progression.state.heldSpecimenId, null);
  progression.setHeldInventorySpecimen(specimen.specimenId);
  assert.equal(progression.moveInventorySpecimenToAquarium(specimen.specimenId).ok, true);
  assert.equal(progression.state.heldSpecimenId, null);
  assert.equal(progression.state.inventory.length, 0);
  assert.equal(progression.state.aquarium[0].specimenId, specimen.specimenId);
});

test('held specimen selection migrates safely and display size remains bounded', () => {
  const specimen = aquariumTestSpecimen();
  const valid = normalizeProgressionState({
    ...defaultProgressionState('player-v11'), inventory: [specimen], heldSpecimenId: specimen.specimenId
  });
  assert.equal(PROGRESSION_SCHEMA_VERSION, 5);
  assert.equal(valid.heldSpecimenId, specimen.specimenId);
  assert.equal(normalizeProgressionState({ ...valid, heldSpecimenId: 'missing' }).heldSpecimenId, null);
  assert.ok(specimenDisplayScale({ length: .01 }, .8) >= .34);
  assert.equal(specimenDisplayScale({ length: 50_000 }, .8), .8);
});

test('inventory UI exposes persistent hold and put-away actions and restores the model on load', async () => {
  const [inventory, player, game] = await Promise.all([
    readFile(new URL('../src/ui/inventory.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/player/player.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/game.js', import.meta.url), 'utf8')
  ]);
  assert.match(inventory, /data-inventory-action="hold"[\s\S]*PUT AWAY[\s\S]*HOLD IN HAND/);
  assert.match(inventory, /setHeldInventorySpecimen[\s\S]*showInventorySpecimen/);
  assert.match(player, /showInventorySpecimen\(specimen = null\)[\s\S]*updateInventorySpecimenPose/);
  assert.match(player, /!this\.fishing\?\.active[\s\S]*'fishing', 'climbing', 'mantling', 'sliding'[\s\S]*model\.root\.enabled = visible/);
  assert.match(game, /showInventorySpecimen\(this\.progression\.getHeldInventorySpecimen\(\)\)/);
});

test('the shoreline aquarium is separate from the cabin and animates exact saved residents', async () => {
  assert.equal(PUBLIC_AQUARIUM_CONFIG.separateFromCabin, true);
  assert.ok(Math.abs(PUBLIC_AQUARIUM_CONFIG.angle - HOME_CABIN_CONFIG.angle) >= 30);
  assert.ok(PUBLIC_AQUARIUM_CONFIG.visibleResidentLimit >= 36);
  assert.ok(PUBLIC_AQUARIUM_CONFIG.tankHeight >= 4);

  const [mountain, game, homeInteraction, inventory] = await Promise.all([
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/game.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/home-interaction.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/inventory.js', import.meta.url), 'utf8')
  ]);
  assert.match(mountain, /buildPublicAquarium\(\)[\s\S]*Shoreline aquarium front glass[\s\S]*Shoreline aquarium collection sign/);
  assert.match(mountain, /id: 'shoreline-aquarium'[\s\S]*action: 'aquarium'/);
  assert.match(mountain, /save\.progression\?\.aquarium[\s\S]*createSpecimenModel\(specimen/);
  assert.match(mountain, /updateAquariumSwimming\(\)[\s\S]*Math\.sin[\s\S]*resident\.model\.tail\.setLocalEulerAngles/);
  assert.match(game, /updateAquariumResidents\?\.\(this\.saveSystem\.getSnapshot\(\)\)/);
  assert.match(homeInteraction, /interaction\.action === 'aquarium'[\s\S]*reel-ascent:open-aquarium/);
  assert.match(inventory, /onOpenAquarium[\s\S]*open\('aquarium'\)/);
  assert.match(inventory, /addEventListener\('reel-ascent:open-aquarium', this\.onOpenAquarium\)/);
});
