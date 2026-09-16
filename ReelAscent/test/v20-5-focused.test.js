import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAppearance, randomizeAppearance } from '../src/player/appearance.js';
import { DEFAULT_FISHING_VERTICAL_TOLERANCE, FishingZone } from '../src/fishing/fishing-zone.js';
import { underwaterEscapeJumpMultiplier } from '../src/player/player.js';
import { CREATURE_MODEL_AUDIT } from '../src/fishing/creature-model-audit.js';
import { GAME_VERSION } from '../src/version.js';
import { COSMETIC_BY_ID, COSMETIC_CATALOG } from '../src/progression/cosmetics.js';

test('v20.5 appearance persists independent facial hair and keeps safe defaults', () => {
  const appearance = normalizeAppearance({ beardStyle: 'full', mustacheStyle: 'handlebar', hairColor: 'copper' });
  assert.equal(appearance.beardStyle, 'full');
  assert.equal(appearance.mustacheStyle, 'handlebar');
  assert.equal(appearance.hairColor, 'copper');
  assert.equal(normalizeAppearance({ beardStyle: 'invalid' }).beardStyle, 'none');
  assert.ok(['none', 'stubble', 'short', 'full', 'goatee'].includes(randomizeAppearance(() => .4).beardStyle));
});

test('generic Legendary cosmetic names map to their real design family', () => {
  const expected = { Crest: 'crest', Lens: 'round', Charm: 'necklace', Mantle: 'cape' };
  for (const cosmetic of COSMETIC_CATALOG.filter((entry) => entry.source.type === 'catch')) {
    const suffix = Object.keys(expected).find((word) => cosmetic.label.endsWith(` ${word}`));
    if (suffix && cosmetic.label === `${cosmetic.source.speciesName} ${suffix}`) {
      assert.equal(cosmetic.visual, expected[suffix], cosmetic.label);
    }
  }
  assert.equal(COSMETIC_BY_ID.get('cowboy-hat').visual, 'cowboy');
  assert.equal(COSMETIC_BY_ID.get('casino-card-shark-cap').visual, 'cap');
});

test('fishing vertical allowance is six metres without changing horizontal distance', () => {
  const zone = new FishingZone({ id: 'test', label: 'Test', center: { x: 0, z: 0 }, radii: { x: 2, z: 2 }, surfaceY: 0, fishIds: [] });
  assert.equal(DEFAULT_FISHING_VERTICAL_TOLERANCE, 6);
  assert.equal(zone.canCastFrom({ x: 3, y: 5.99, z: 0 }, 1.01), true);
  assert.equal(zone.canCastFrom({ x: 3, y: 6.01, z: 0 }, 1.01), false);
  assert.equal(zone.canCastFrom({ x: 3.02, y: 0, z: 0 }, 1.01), false);
});

test('underwater escape preserves shallow jumps and approaches double jump height', () => {
  assert.equal(underwaterEscapeJumpMultiplier(.5), 1);
  assert.ok(underwaterEscapeJumpMultiplier(.55) > 1);
  assert.ok(Math.abs(underwaterEscapeJumpMultiplier(.8) ** 2 - 2) < .001);
});

test('all 300 active creatures are included in the grouped model audit', () => {
  assert.equal(CREATURE_MODEL_AUDIT.total, 300);
  assert.equal(Object.values(CREATURE_MODEL_AUDIT.archetypeCounts).reduce((sum, count) => sum + count, 0), 300);
  assert.deepEqual(CREATURE_MODEL_AUDIT.mismatches, []);
});

test('Basalt opening and Crown rock exclusions are explicit in active world source', async () => {
  const world = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(world, /cave-fishing-island'[\s\S]{0,120}ring >= 2/);
  assert.match(world, /cave-fishing-island'[\s\S]{0,180}centerIndex/);
  assert.match(world, /buildCrownRoutes\(\)[\s\S]{0,3000}isRockInProtectedWaterApproach/);
});

test('v20.5 is the active build', () => assert.equal(GAME_VERSION, 'v20.5'));
