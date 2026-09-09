import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  chooseStrongBobberRefusal,
  deriveBobberAcceptance,
  expectedAcceptedBites,
  getSelectiveBobberSettings,
  STRONG_BOBBER_REFUSAL_MESSAGES,
  strongestBobberHasEligibleTarget
} from '../src/fishing/selective-bobbers.js';
import { PHYSICAL_WATER_RARITY_PROFILES } from '../src/fishing/rarity-selection.js';
import {
  createStableRockId,
  deriveAquariumWaterBounds,
  ISLAND_UNDERWATER_PROFILE,
  MID_MOUNTAIN_SPIRAL_CONFIG,
  PUBLIC_AQUARIUM_CONFIG
} from '../src/world/mountain-v2.js';

const here = new URL('../', import.meta.url);
const close = (actual, expected, tolerance = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `${actual} should be within ${tolerance} of ${expected}`
);

test('Outer Ocean bobber retention matches the direct 10-minute calibration', () => {
  const ocean = PHYSICAL_WATER_RARITY_PROFILES.ocean;
  const normal = expectedAcceptedBites(ocean, 'standard');
  const selective = expectedAcceptedBites(ocean, 'selective');
  const trophy = expectedAcceptedBites(ocean, 'trophy');
  close(normal.Common, 37.2);
  close(normal.Uncommon, 12);
  close(normal.Rare, 6.6);
  close(normal.Legendary, 4.2);
  close(normal.total, 60);
  close(selective.Common, 2.2);
  close(selective.Uncommon, 7);
  close(selective.Rare, 6.6);
  close(selective.Legendary, 4.2);
  close(selective.total, 20);
  close(trophy.Common, 0);
  close(trophy.Uncommon, .5);
  close(trophy.Rare, 2);
  close(trophy.Legendary, 2.5);
  close(trophy.total, 5);
  assert.equal(getSelectiveBobberSettings('selective').acceptanceByRarity.Rare, 1);
});

test('Cloudstep keeps its own high-rarity ecology under the same retention filters', () => {
  const cloudstep = PHYSICAL_WATER_RARITY_PROFILES.cloudstep;
  const normal = expectedAcceptedBites(cloudstep, 'standard');
  const selective = expectedAcceptedBites(cloudstep, 'selective');
  const trophy = expectedAcceptedBites(cloudstep, 'trophy');
  close(normal.Common, 4.8);
  close(normal.Uncommon, 14.4);
  close(normal.Rare, 33);
  close(normal.Legendary, 7.8);
  close(normal.total, 60);
  close(selective.Common, .1147327249022164);
  close(selective.Uncommon, 3.395045632333767);
  close(selective.Rare, 13.337679269882656);
  close(selective.Legendary, 3.1525423728813555);
  close(selective.total, 20);
  close(trophy.Uncommon, .19681349578256794);
  close(trophy.Rare, 3.2802249297094655);
  close(trophy.Legendary, 1.5229615745079663);
  close(trophy.total, 5);
  const scaled = deriveBobberAcceptance(cloudstep, 'trophy');
  assert.ok(scaled.Legendary > scaled.Rare && scaled.Rare > scaled.Uncommon);
});

test('Sentinel eligibility is generalized and refusal messages avoid immediate repeats', () => {
  assert.equal(strongestBobberHasEligibleTarget(['Common']), false);
  assert.equal(strongestBobberHasEligibleTarget(['Common', 'Uncommon']), false);
  assert.equal(strongestBobberHasEligibleTarget(['Common', 'Rare']), true);
  assert.equal(STRONG_BOBBER_REFUSAL_MESSAGES.length, 10);
  const first = chooseStrongBobberRefusal(0);
  assert.notEqual(chooseStrongBobberRefusal(0, first), first);
});

test('Aquarium bounds derive from the 50-percent-wider tank dimensions', () => {
  assert.equal(PUBLIC_AQUARIUM_CONFIG.tankWidth, 18);
  const bounds = deriveAquariumWaterBounds();
  close(bounds.maxX - bounds.minX, PUBLIC_AQUARIUM_CONFIG.tankWidth - PUBLIC_AQUARIUM_CONFIG.waterInset * 2);
  close(bounds.maxZ - bounds.minZ, PUBLIC_AQUARIUM_CONFIG.tankDepth - PUBLIC_AQUARIUM_CONFIG.waterInset * 2);
  assert.ok(bounds.maxX > 8 && bounds.maxY < PUBLIC_AQUARIUM_CONFIG.waterlineY);
});

test('stable rock IDs are deterministic, human-readable, and unrelated names do not renumber them', () => {
  const position = { x: 220, y: 208.48, z: -35 };
  const id = createStableRockId('spiral 3 step 72', position);
  assert.equal(createStableRockId('spiral 3 step 72', position), id);
  createStableRockId('unrelated newly inserted rock', { x: 1, y: 2, z: 3 });
  assert.equal(createStableRockId('spiral 3 step 72', position), id);
  assert.match(id, /^R-684-(?:N|NE|E|SE|S|SW|W|NW)-[0-9A-Z]{5}$/);
});

test('v15.2 world source uses coherent shores, safe island props, broad cold depth, and narrow-band density', async () => {
  const source = await readFile(new URL('src/world/mountain-v2.js', here), 'utf8');
  assert.deepEqual(ISLAND_UNDERWATER_PROFILE.radiusFactors, [2.35, 1.72, 1.28, 1]);
  assert.doesNotMatch(source, /microWobble/);
  assert.match(source, /Frosthook submerged pale cold-ocean shelf[\s\S]{0,180}\{ x: 225, z: 195 \}, this\.materials\.coldOceanBed/);
  assert.match(source, /Cave island natural rock[\s\S]{0,350}ensureCoreContact: false/);
  assert.equal(MID_MOUNTAIN_SPIRAL_CONFIG.maximumHeight, 213.36);
  assert.ok(MID_MOUNTAIN_SPIRAL_CONFIG.priority680To700StepHeight < MID_MOUNTAIN_SPIRAL_CONFIG.priority660To700StepHeight);
  assert.doesNotMatch(source, /Hearthward pond short fishing deck/);
  assert.match(source, /Hearthward pond connected sloped bank/);
});

test('bobber wiring filters completed potential bites and does not normalize bobbers into water profiles', async () => {
  const [fishing, rarity, config] = await Promise.all([
    readFile(new URL('src/fishing/fishing.js', here), 'utf8'),
    readFile(new URL('src/fishing/rarity-selection.js', here), 'utf8'),
    readFile(new URL('src/config.js', here), 'utf8')
  ]);
  assert.match(fishing, /this\.rng\(\) >= acceptance/);
  assert.match(fishing, /this\.schedulePotentialBite\(\);\s*return false/);
  assert.doesNotMatch(rarity, /bobberAcceptanceByRarity/);
  assert.match(config, /biteDelayMinimum: 5[\s\S]{0,80}biteDelayMaximum: 15/);
});
