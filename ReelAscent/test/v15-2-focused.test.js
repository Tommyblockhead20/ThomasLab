import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  chooseStrongBobberRefusal,
  deriveAcceptedBobberProfile,
  deriveBobberAcceptance,
  expectedAcceptedBites,
  getSelectiveBobberSettings,
  sampleBobberBiteDelay,
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

test('Outer Ocean bobber retention uses the v20.3 per-rarity acceptance chances', () => {
  const ocean = PHYSICAL_WATER_RARITY_PROFILES.ocean;
  const normal = expectedAcceptedBites(ocean, 'standard');
  const selective = expectedAcceptedBites(ocean, 'selective');
  const trophy = expectedAcceptedBites(ocean, 'trophy');
  close(normal.Common, 37.2);
  close(normal.Uncommon, 12);
  close(normal.Rare, 6.6);
  close(normal.Legendary, 4.2);
  close(normal.total, 60);
  close(selective.Common, 2.232);
  close(selective.Uncommon, 6.72);
  close(selective.Rare, 6.336);
  close(selective.Legendary, 4.2);
  close(selective.total, 19.488);
  close(trophy.Common, 0);
  close(trophy.Uncommon, .6);
  close(trophy.Rare, 5.412);
  close(trophy.Legendary, 4.2);
  close(trophy.total, 10.212);
  assert.equal(getSelectiveBobberSettings('selective').acceptanceByRarity.Rare, .96);
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
  close(selective.Common, .288);
  close(selective.Uncommon, 8.064);
  close(selective.Rare, 31.68);
  close(selective.Legendary, 7.8);
  close(selective.total, 47.832);
  close(trophy.Uncommon, .72);
  close(trophy.Rare, 27.06);
  close(trophy.Legendary, 7.8);
  close(trophy.total, 35.58);
  const scaled = deriveBobberAcceptance(cloudstep, 'trophy');
  assert.ok(scaled.Legendary > scaled.Rare && scaled.Rare > scaled.Uncommon);
});

test('selective bobber timers keep their advertised bounded cadence and filtered mix', () => {
  const ocean = PHYSICAL_WATER_RARITY_PROFILES.ocean;
  const selective = getSelectiveBobberSettings('selective');
  const trophy = getSelectiveBobberSettings('trophy');
  close(sampleBobberBiteDelay(selective, 0, { profile: ocean }), 22.5);
  close(sampleBobberBiteDelay(selective, .5, { profile: ocean }), 30);
  close(sampleBobberBiteDelay(selective, 1, { profile: ocean }), 37.5);
  close(sampleBobberBiteDelay(trophy, 0, { profile: ocean }), 96);
  close(sampleBobberBiteDelay(trophy, .5, { profile: ocean }), 120);
  close(sampleBobberBiteDelay(trophy, 1, { profile: ocean }), 144);
  const accepted = deriveAcceptedBobberProfile(ocean, 'selective');
  close(accepted.Common, .1145320197044335);
  close(accepted.Uncommon, .3448275862068966);
  close(accepted.Rare, .3251231527093596);
  close(accepted.Legendary, .21551724137931033);
});

test('Sentinel eligibility is generalized and refusal messages avoid immediate repeats', () => {
  assert.equal(strongestBobberHasEligibleTarget(['Common']), false);
  assert.equal(strongestBobberHasEligibleTarget(['Common', 'Uncommon']), true);
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

test('bobber wiring analytically preserves filtering while using one bounded visible timer', async () => {
  const [fishing, rarity, config] = await Promise.all([
    readFile(new URL('src/fishing/fishing.js', here), 'utf8'),
    readFile(new URL('src/fishing/rarity-selection.js', here), 'utf8'),
    readFile(new URL('src/config.js', here), 'utf8')
  ]);
  assert.match(fishing, /deriveAcceptedBobberProfile\(potentialProfile, bobberMode\)/);
  assert.match(fishing, /sampleBobberBiteDelay\(bobber, this\.rng\(\)/);
  assert.doesNotMatch(fishing, /this\.rng\(\) >= acceptance/);
  assert.doesNotMatch(rarity, /bobberAcceptanceByRarity/);
  assert.match(config, /biteDelayMinimum: 5[\s\S]{0,80}biteDelayMaximum: 15/);
});
