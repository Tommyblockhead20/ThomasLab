import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BACK_ACCESSORIES,
  DEFAULT_APPEARANCE,
  EYEWEAR,
  FACE_ACCESSORIES,
  HEADWEAR,
  LEGACY_CHARACTER_PALETTE,
  SKIN_TONES,
  compactAppearance,
  normalizeAppearance
} from '../src/player/appearance.js';
import { normalizeProgressionState } from '../src/progression/progression-save.js';
import { sanitizeAppearance } from '../server/src/snapshot-validation.js';
import {
  LOWLAND_TREE_CONFIG,
  MID_MOUNTAIN_ROCK_DENSITY_CONFIG,
  MOUNTAIN_BIOME_SECTORS,
  createMountainMapData
} from '../src/world/mountain-v2.js';

test('v8.7 map is generated from five real contours and all 24 waters', () => {
  const map = createMountainMapData();
  assert.equal(map.contours.length, 5);
  assert.equal(map.waters.length, 24);
  assert.equal(new Set(map.waters.map((water) => water.id)).size, 24);
  assert.equal(map.caves.length, 4);
  assert.equal(map.ledges.some((ledge) => ledge.id === '550ft-alpine'), true);
  assert.equal(map.landmarks.some((landmark) => landmark.id === 'cabin'), true);
  assert.equal(map.landmarks.some((landmark) => landmark.id === 'aquarium'), true);
  assert.ok(new Set(map.contours[2].points.map((point) => point.radius.toFixed(1))).size > 12);
});

test('v8.7 density has a dedicated 550-ft belt and biome-weighted climbable forest budget', () => {
  assert.equal(MID_MOUNTAIN_ROCK_DENSITY_CONFIG.belts.some((belt) => belt.height === 167.64), true);
  assert.ok(MID_MOUNTAIN_ROCK_DENSITY_CONFIG.belts.reduce((sum, belt) => sum + belt.count, 0) >= 390);
  assert.ok(LOWLAND_TREE_CONFIG.candidateCount >= 200);
  assert.ok(LOWLAND_TREE_CONFIG.maximumClimbableTrees >= 60);
  assert.deepEqual(MOUNTAIN_BIOME_SECTORS.map((biome) => biome.id), ['sunwash', 'blackstone', 'fernwood']);
});

test('v8.7 cosmetics use categorized compact state and preserve existing save choices', () => {
  assert.deepEqual(LEGACY_CHARACTER_PALETTE.player, [.95, .5, .22]);
  assert.deepEqual(LEGACY_CHARACTER_PALETTE.playerAccent, [.99, .82, .33]);
  assert.deepEqual(LEGACY_CHARACTER_PALETTE.boots, [.18, .22, .18]);
  assert.equal(SKIN_TONES.length, 8);
  assert.equal(HEADWEAR.some((entry) => entry.id === 'beanie'), true);
  assert.equal(EYEWEAR.some((entry) => entry.id === 'glasses'), true);
  assert.equal(FACE_ACCESSORIES.some((entry) => entry.id === 'scarf'), true);
  assert.equal(BACK_ACCESSORIES.some((entry) => entry.id === 'backpack'), true);
  const custom = normalizeAppearance({
    ...DEFAULT_APPEARANCE,
    shirtColor: 'rose', headwear: 'trail-hat', eyewear: 'glasses', faceAccessory: 'scarf'
  });
  assert.equal(compactAppearance(custom).headwear, 'trail-hat');
  assert.equal(sanitizeAppearance(custom).eyewear, 'glasses');
  assert.equal(normalizeProgressionState({ schemaVersion: 1, appearance: custom }).appearance.shirtColor, 'rose');
  assert.deepEqual(normalizeProgressionState({ schemaVersion: 1 }).appearance, DEFAULT_APPEARANCE);
});

test('v8.7 interaction, seating, preview, and water fixes are wired to shared paths', async () => {
  const [movement, interaction, player, preview, mapMenu, mountain] = await Promise.all([
    readFile(new URL('../src/player/movement.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/home-interaction.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/player/player.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/appearance-preview.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/mountain-map.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8')
  ]);
  assert.match(movement, /consumeGripInteraction[\s\S]*suppressGripUntilRelease/);
  assert.match(interaction, /refreshCurrent[\s\S]*captureInteractionInput[\s\S]*this\.interact/);
  assert.match(player, /holdSeatAnchor[\s\S]*setNextKinematicTranslation/);
  assert.match(player, /movementState === 'fishing' && !this\.grounded && !this\.benchSeat/);
  assert.match(player, /getState\(\)[\s\S]*posture: this\.benchSeat \? 'seated' : 'standing'/);
  assert.match(preview, /createRemoteAvatar/);
  assert.match(mapMenu, /mapData\.waters[\s\S]*mapData\.contours/);
  assert.match(mountain, /doubleSided: true/);
  assert.doesNotMatch(mountain, /water\.base\.x \* pulse/);
  assert.match(mountain, /Fallglass continuous terrain-following cascade/);
});
