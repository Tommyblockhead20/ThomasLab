import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_APPEARANCE,
  accessoryConcealsHair,
  hairVisibilityForHeadwear,
  randomizeAppearance,
  resolveAppearance
} from '../src/player/appearance.js';
import { normalizeProgressionState } from '../src/progression/progression-save.js';
import {
  MOUNTAIN_REST_LEDGE_CONFIG,
  OCEAN_VISUAL_OUTER_RADIUS,
  OCEAN_WATER_INNER_RADIUS,
  SUMMIT_BENCH_CONFIGS,
  UPPER_SHOULDER_START_RADIUS,
  applyCoreRestTerraces
} from '../src/world/mountain-v2.js';

test('classic v1-v7 trail appearance is restored and full hats conceal hair', () => {
  const resolved = resolveAppearance(DEFAULT_APPEARANCE);
  assert.deepEqual(resolved.shirtColorValue.color, [.95, .5, .22]);
  assert.deepEqual(resolved.skinToneValue.color, [.93, .72, .52]);
  assert.deepEqual(resolved.pantsColorValue.color, [.23, .31, .29]);
  assert.deepEqual(resolved.accessoryColor, [.99, .82, .33]);
  assert.equal(DEFAULT_APPEARANCE.accessory, 'beanie');
  assert.equal(DEFAULT_APPEARANCE.headwear, 'beanie');
  for (const id of ['beanie', 'trail-hat', 'fishing-cap']) assert.equal(accessoryConcealsHair(id), true);
  for (const id of ['glasses', 'headlamp', 'scarf']) assert.equal(accessoryConcealsHair(id), false);
  assert.deepEqual(hairVisibilityForHeadwear('ponytail', 'beanie'), { root: true, top: false });
  assert.deepEqual(hairVisibilityForHeadwear('tousled', 'beanie'), { root: false, top: false });
});

test('appearance randomizer returns a complete normalized cosmetic selection', () => {
  const sequence = [0, .2, .4, .6, .8, .1, .9];
  let index = 0;
  const appearance = randomizeAppearance(() => sequence[index++]);
  assert.equal(Object.keys(appearance).length, Object.keys(DEFAULT_APPEARANCE).length);
  assert.equal(appearance.shirtTint, null);
  assert.equal(appearance.accessoryTint, null);
});

test('only genuinely missing appearance data receives the classic trail look', () => {
  const formerDefault = {
    avatarType: 'human', skinTone: 'warm', shirtColor: 'alpine', pantsColor: 'pine',
    hairStyle: 'tousled', hairColor: 'espresso', accessory: 'none', shirtTint: null,
    pantsTint: null, hairTint: null, accessoryTint: null, blobTint: null
  };
  const preservedFormerDefault = normalizeProgressionState({ schemaVersion: 3, appearance: formerDefault }).appearance;
  assert.equal(preservedFormerDefault.shirtColor, 'alpine');
  assert.equal(preservedFormerDefault.pantsColor, 'pine');
  assert.equal(preservedFormerDefault.headwear, 'none');
  assert.deepEqual(normalizeProgressionState({ schemaVersion: 3 }).appearance, DEFAULT_APPEARANCE);
  const customized = normalizeProgressionState({
    schemaVersion: 3,
    appearance: { ...formerDefault, shirtColor: 'rose' }
  }).appearance;
  assert.equal(customized.shirtColor, 'rose');
  assert.equal(customized.accessory, 'none');
});

test('ocean render is a dry-center annulus instead of a transparent island-wide disk', async () => {
  const mountain = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.ok(OCEAN_VISUAL_OUTER_RADIUS > OCEAN_WATER_INNER_RADIUS);
  assert.match(mountain, /Outer ocean annular surface/);
  assert.match(mountain, /\[OCEAN_VISUAL_OUTER_RADIUS, OCEAN_WATER_INNER_RADIUS\]/);
  assert.doesNotMatch(mountain, /addCylinder\('Outer ocean'/);
});

test('the widened Alpine core contains a distinct broad 550-ft terrain shelf', () => {
  const ledge = MOUNTAIN_REST_LEDGE_CONFIG.fiveFifty;
  assert.equal(ledge.targetHeight, 167.64);
  assert.equal(ledge.coreTerrain, true);
  assert.ok(ledge.width >= 12 && ledge.depth >= 8);
  assert.ok(Math.abs(applyCoreRestTerraces(ledge.angle, ledge.radius, ledge.targetHeight + 30)
    - ledge.targetHeight) < .001);
  assert.ok(UPPER_SHOULDER_START_RADIUS > 68 && UPPER_SHOULDER_START_RADIUS <= 74);
});

test('cabin and aquarium share composed local transforms and the summit has two bench seats', async () => {
  const [mountain, player, interaction] = await Promise.all([
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/player/player.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/home-interaction.js', import.meta.url), 'utf8')
  ]);
  assert.match(mountain, /createStructureRoot[\s\S]*addStructureBox[\s\S]*entity\.getRotation\(\)/);
  assert.match(mountain, /Trail cabin roof \$\{side < 0 \? 'west' : 'east'\} pitch[\s\S]*Trail cabin roof ridge/);
  assert.match(mountain, /Shoreline aquarium canopy \$\{side < 0 \? 'west' : 'east'\} pitch[\s\S]*Shoreline aquarium canopy ridge/);
  assert.equal(SUMMIT_BENCH_CONFIGS.length, 2);
  assert.match(player, /setBenchSeat\(interaction\)[\s\S]*clearBenchSeat\(\)/);
  assert.match(player, /Preserve the seated lower-body pose while the fishing arms/);
  assert.match(interaction, /STOP FISHING & GET UP[\s\S]*CLICK TO GET UP/);
});
