import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildEcologyAudit } from '../scripts/ecology-audit.mjs';
import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import { BASELINE_SPECIES_PROBABILITY_CAPS, BRACKISH_COMPATIBLE_SPECIES } from '../src/fishing/ecology-config.js';
import { buildTwoStageProbabilityTable } from '../src/fishing/rarity-selection.js';
import { DEFAULT_FISHING_VERTICAL_TOLERANCE } from '../src/fishing/fishing-zone.js';
import { underwaterEscapeJumpMultiplier, underwaterGravityMultiplier } from '../src/player/player.js';
import { defaultProgressionState, normalizeProgressionState, PROGRESSION_SCHEMA_VERSION } from '../src/progression/progression-save.js';
import { localCalendarDayKey, ProgressionSystem } from '../src/progression/progression.js';
import { SONG_DOWNVOTE_REASONS, SONG_VOTE_SCHEMA_VERSION, SongVoteStore, songDownvoteReasonForDigit } from '../src/fishing/song-votes.js';
import { MemorySongVoteStore, SONG_DOWNVOTE_REASON_IDS } from '../server/src/song-vote-store.js';
import {
  BLUEWATER_REACH_DESCRIPTOR,
  FROSTHOOK_COLD_OCEAN_DESCRIPTOR,
  OCEAN_FISHING_DESCRIPTOR
} from '../src/world/mountain-v2.js';
import { GAME_VERSION } from '../src/version.js';

const here = new URL('../', import.meta.url);
const close = (actual, expected, tolerance = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `${actual} should be within ${tolerance} of ${expected}`
);

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

class FakeSaveSystem {
  constructor(progression = defaultProgressionState('v21-test-player')) {
    this.data = { progression, lifetime: { activePlaytimeSeconds: 0 } };
    this.saved = 0;
    this.earnings = [];
    this.sold = [];
  }
  save() { this.saved += 1; }
  recordLegitimateEarnings(value) { this.earnings.push(value); }
  recordSpeciesSold(specimens) { this.sold.push(...specimens.map((entry) => entry.specimenId)); }
}

const specimen = (specimenId, value, speciesId = 'bluegill') => ({
  specimenId, speciesId, name: speciesId, rarity: 'Common', length: 10, weight: 1,
  value, provenance: { legitimate: true }
});

test('v21 baseline ecology satisfies caps, reachability, diversity, and water identity', () => {
  const audit = buildEcologyAudit();
  assert.equal(GAME_VERSION, 'v21');
  assert.equal(audit.waterCount, 28);
  assert.deepEqual(audit.accidentallyUnreachable, []);

  const firstPlaces = new Map();
  const topThreePlaces = new Map();
  for (const water of audit.waters) {
    const total = Object.values(water.rarityOdds).reduce((sum, value) => sum + value, 0);
    close(total, 1, 1e-8);
    assert.ok(water.probabilityTable.length > 0, water.id);
    const sorted = [...water.probabilityTable].sort((left, right) => right.probability - left.probability);
    if (water.id === 'hearthward-pond') {
      assert.equal(water.eligibleSpecies, 3);
      assert.deepEqual(water.rarities, { Common: 3, Uncommon: 0, Rare: 0, Legendary: 0 });
    } else {
      for (const entry of sorted) {
        assert.ok(entry.probability <= BASELINE_SPECIES_PROBABILITY_CAPS[entry.rarity] + 1e-9,
          `${water.id}/${entry.id} exceeded its ${entry.rarity} cap`);
      }
    }
    firstPlaces.set(sorted[0].id, (firstPlaces.get(sorted[0].id) ?? 0) + 1);
    for (const entry of sorted.slice(0, 3)) {
      topThreePlaces.set(entry.id, (topThreePlaces.get(entry.id) ?? 0) + 1);
    }
  }
  assert.deepEqual([...firstPlaces].filter(([, count]) => count > 1), []);
  assert.deepEqual([...topThreePlaces].filter(([, count]) => count > 2), []);
  assert.deepEqual(audit.species.filter((entry) => !entry.futureReserved && entry.eligibleWaters === 0), []);
  assert.deepEqual(audit.species.filter((entry) => entry.futureReserved && entry.eligibleWaters > 0), []);
  assert.deepEqual(audit.species.filter((entry) => entry.eligibleWaters > audit.waterCount / 2), []);

  assert.equal(audit.waters.find((entry) => entry.id === 'amber-reed-pond').habitat.salinity, 'brackish');
  assert.ok(audit.waters.find((entry) => entry.id === 'bluewater-reach-water').eligibleSpecies >= 75);
  assert.ok(audit.waters.find((entry) => entry.id === 'outer-ocean').eligibleSpecies >= 75);
  for (const id of ['mottled-sculpin', 'sardine', 'nokken']) {
    assert.ok((topThreePlaces.get(id) ?? 0) <= 2, id);
  }
});

test('hard cave and salinity gates survive curated additions and exclusives', () => {
  const audit = buildEcologyAudit();
  const fishById = new Map(FISH_SPECIES.map((fish) => [fish.id, fish]));
  const obligateCave = new Set([
    'blind-cave-eel', 'cave-tetra', 'ashen-cave-snail', 'basalt-cave-shrimp',
    'chimeblind-shrimp', 'pallid-cave-crab', 'whisper-eel',
    'echo-cave-salamander', 'glass-cave-lobster', 'obsidian-blindfish'
  ]);
  for (const water of audit.waters) {
    for (const entry of water.probabilityTable) {
      const fish = fishById.get(entry.id);
      const preference = fish.habitat ?? {};
      if (obligateCave.has(entry.id)) assert.equal(water.habitat.cave, true, `${entry.id}/${water.id}`);
      if (water.habitat.salinity === 'brackish') {
        assert.ok(preference.salinity === 'both'
          || preference.salinities?.includes('brackish')
          || BRACKISH_COMPATIBLE_SPECIES.has(entry.id), `${entry.id} is not brackish compatible`);
      } else if (preference.salinity && preference.salinity !== 'both') {
        assert.equal(preference.salinity, water.habitat.salinity, `${entry.id}/${water.id}`);
      }
      if (preference.exclusiveWaterId) assert.equal(preference.exclusiveWaterId, water.id, entry.id);
    }
  }
  const stoneLoach = audit.species.find((entry) => entry.id === 'stone-loach');
  const nonCaveOdds = stoneLoach.mostLikely.filter(({ waterId }) => (
    !audit.waters.find((water) => water.id === waterId).habitat.cave
  ));
  assert.ok(nonCaveOdds.every(({ probability }) => probability < .01));
  assert.ok(!audit.waters.find((entry) => entry.id === 'split-rock-pool').probabilityTable.some((entry) => entry.id === 'stone-loach'));
});

test('strict probability caps redistribute iteratively and reject impossible tiers', () => {
  const commons = Array.from({ length: 7 }, (_, index) => ({
    id: `common-${index}`, rarity: 'Common', catchWeight: index ? 1 : 100,
    maxLength: 10, maxWeight: 1, visual: { archetype: 'panfish' }
  }));
  const table = buildTwoStageProbabilityTable(commons, commons.map(({ id }) => id), {
    rarityProfile: { Common: 1, Uncommon: 0, Rare: 0, Legendary: 0 },
    baselineSpeciesProbabilityCaps: BASELINE_SPECIES_PROBABILITY_CAPS,
    waterId: 'cap-test'
  });
  close(table.reduce((sum, entry) => sum + entry.probability, 0), 1);
  assert.ok(table.every((entry) => entry.probability <= .15 + 1e-9));
  assert.throws(() => buildTwoStageProbabilityTable(commons.slice(0, 6), commons.slice(0, 6).map(({ id }) => id), {
    rarityProfile: { Common: 1, Uncommon: 0, Rare: 0, Legendary: 0 },
    baselineSpeciesProbabilityCaps: BASELINE_SPECIES_PROBABILITY_CAPS,
    waterId: 'impossible-test'
  }), /Structurally impossible impossible-test Common tier/);
});

test('ocean pacing and Bluewater size identities are active in authoritative descriptors', () => {
  assert.equal(OCEAN_FISHING_DESCRIPTOR.biteDelayMultiplier, 1.2);
  assert.equal(FROSTHOOK_COLD_OCEAN_DESCRIPTOR.biteDelayMultiplier, 1.2);
  assert.equal(BLUEWATER_REACH_DESCRIPTOR.biteDelayMultiplier, 1.25);
  assert.equal(BLUEWATER_REACH_DESCRIPTOR.largeSpeciesWeightBias, .20);
  assert.equal(BLUEWATER_REACH_DESCRIPTOR.specimenSizeBias, .12);
});

test('submerged gravity eases to 30 percent while escape jump and ocean exclusions remain intact', async () => {
  assert.equal(underwaterGravityMultiplier(0), 1);
  assert.equal(underwaterGravityMultiplier(.2), 1);
  assert.ok(underwaterGravityMultiplier(.5) < 1 && underwaterGravityMultiplier(.5) > .3);
  close(underwaterGravityMultiplier(.75), .3);
  close(underwaterGravityMultiplier(1), .3);
  assert.equal(underwaterEscapeJumpMultiplier(.5), 1);
  assert.ok(underwaterEscapeJumpMultiplier(.8) > 1.4);
  const source = await readFile(new URL('src/world/world.js', here), 'utf8');
  assert.match(source, /\['ocean', 'cold-ocean', 'bluewater-ocean'\]\.includes\(zone\.waterType\)/);
  assert.equal(DEFAULT_FISHING_VERTICAL_TOLERANCE, 7);
});

test('the Old Man daily sale is specimen-selected, double value, calendar-day, and per-save', () => {
  const save = new FakeSaveSystem();
  const progression = new ProgressionSystem(save);
  progression.state.inventory.push(specimen('inventory-one', 50));
  progression.state.aquarium.push(specimen('aquarium-one', 30, 'pumpkinseed'));
  progression.state.heldSpecimenId = 'inventory-one';
  const firstDay = new Date(2026, 8, 17, 10, 0, 0);
  const nextDay = new Date(2026, 8, 18, 0, 1, 0);

  const first = progression.sellOldManDailySpecimen('inventory-one', firstDay);
  assert.equal(first.ok, true);
  assert.equal(first.amount, 100);
  assert.equal(progression.state.money, 100);
  assert.equal(progression.state.heldSpecimenId, null);
  assert.equal(progression.state.oldManDailySaleDate, localCalendarDayKey(firstDay));
  assert.equal(progression.sellOldManDailySpecimen('aquarium-one', firstDay).ok, false);

  const second = progression.sellOldManDailySpecimen('aquarium-one', nextDay);
  assert.equal(second.ok, true);
  assert.equal(second.amount, 60);
  assert.equal(progression.state.money, 160);
  assert.deepEqual(save.earnings, [100, 60]);
  assert.deepEqual(save.sold, ['inventory-one', 'aquarium-one']);
  assert.equal(normalizeProgressionState(progression.state).oldManDailySaleDate, localCalendarDayKey(nextDay));
  assert.equal(PROGRESSION_SCHEMA_VERSION, 14);

  const otherSave = new ProgressionSystem(new FakeSaveSystem());
  assert.equal(otherSave.getOldManDailySaleStatus(firstDay).available, true);
});

test('Bad Model is the sixth durable downvote reason without dropping prior reasons', async () => {
  const reasons = ['sounds_bad', 'glitched', 'too_hard', 'too_easy', 'bad_instrument', 'bad_model'];
  assert.equal(SONG_VOTE_SCHEMA_VERSION, 6);
  assert.deepEqual(SONG_DOWNVOTE_REASONS.map(({ id }) => id), reasons);
  assert.deepEqual(SONG_DOWNVOTE_REASON_IDS, reasons);
  reasons.forEach((reason, index) => assert.equal(songDownvoteReasonForDigit(`Digit${index + 1}`), reason));

  const feedback = { speciesId: 'bluegill', songId: 'song:bluegill:authored-1', songRevision: 1 };
  const local = new SongVoteStore(new MemoryStorage(), 'browser-player');
  local.set(feedback, 'down', 'bad_model');
  assert.equal(local.getReason(feedback), 'bad_model');
  const server = new MemorySongVoteStore();
  const aggregate = await server.setVote({ ...feedback, voterId: 'server-player', vote: 'down', reason: 'bad_model' });
  assert.equal(aggregate.downvoteReasons.bad_model, 1);

  const [html, serverSource] = await Promise.all([
    readFile(new URL('index.html', here), 'utf8'),
    readFile(new URL('server/src/song-vote-store.js', here), 'utf8')
  ]);
  assert.match(html, /KEYS 1–6/);
  assert.match(html, /data-song-downvote-reason="bad_model"/);
  assert.match(serverSource, /bad_model/);
  for (const legacy of ['awkward_rhythm', 'too_long', 'bad_fit', 'other']) assert.match(serverSource, new RegExp(legacy));
});
