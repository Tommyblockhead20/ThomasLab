import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { boatMapDestinationUsesClouds, boatMapLockSummary } from '../src/ui/boat-travel.js';
import { EQUIPMENT_BY_ID, EquipmentManager } from '../src/progression/equipment.js';
import { normalizeProgressionState, PROGRESSION_SCHEMA_VERSION } from '../src/progression/progression-save.js';
import { selectEcologyGuideEntries } from '../src/fishing/fishing.js';
import { deriveAcceptedBobberProfile, SELECTIVE_BOBBER_SETTINGS } from '../src/fishing/selective-bobbers.js';
import { PHYSICAL_WATER_RARITY_PROFILES } from '../src/fishing/rarity-selection.js';

const here = new URL('../', import.meta.url);
const close = (actual, expected, tolerance = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `${actual} should be within ${tolerance} of ${expected}`
);

test('Bluewater purchase lock stays visible while hidden and unfinished destinations use clouds', () => {
  assert.equal(boatMapDestinationUsesClouds('locked-cloud'), true);
  assert.equal(boatMapDestinationUsesClouds('known-unavailable'), true);
  assert.equal(boatMapDestinationUsesClouds('locked-purchase'), false);
  assert.equal(boatMapDestinationUsesClouds('available'), false);
  assert.equal(boatMapLockSummary({
    state: 'locked-cloud', reason: 'Discover 5 Trail Badges or catch 25 unique species.'
  }), '5 BADGES OR 25 SPECIES');
  assert.equal(boatMapLockSummary({ state: 'locked-purchase' }), 'BUY THE $2,000 BLUEWATER BOAT');
});

test('Outfitter upgrades have concise, useful effects and coherent category price ladders', () => {
  assert.equal(EQUIPMENT_BY_ID.get('precision-tip-rod').modifiers.successWindowMultiplier, 1.2);
  assert.equal(EQUIPMENT_BY_ID.get('trophy-braid').modifiers.specimenSizeBias, .2);
  assert.equal(EQUIPMENT_BY_ID.get('prism-lure').modifiers.shinyChanceMultiplier, 3);
  assert.equal(EQUIPMENT_BY_ID.get('trail-runners').modifiers.sprintSpeedMultiplier, 1.2);
  assert.ok([...EQUIPMENT_BY_ID.values()].every((item) => item.effect.length <= 90));
  for (const ids of [
    ['trail-rod', 'precision-tip-rod', 'virtuoso-rod'],
    ['standard-line', 'shock-absorb-line', 'trophy-braid', 'braided-lifeline'],
    ['trail-bobber', 'selective-drift-bobber', 'trophy-sentinel-bobber'],
    ['trail-boots', 'trail-runners', 'endurance-belt', 'springstep-boots', 'summit-vault-boots']
  ]) {
    const prices = ids.map((id) => EQUIPMENT_BY_ID.get(id).price);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b), ids.join(', '));
  }
});

test('balanced selective bobbers use the intended shorter cadence and modest rarity tilt', () => {
  assert.deepEqual(SELECTIVE_BOBBER_SETTINGS.selective.acceptanceByRarity,
    { Common: .42, Uncommon: .58, Rare: .64, Legendary: .68 });
  assert.deepEqual(SELECTIVE_BOBBER_SETTINGS.trophy.acceptanceByRarity,
    { Common: .18, Uncommon: .32, Rare: .4, Legendary: .46 });
  assert.equal(SELECTIVE_BOBBER_SETTINGS.selective.targetWaitSeconds, 28);
  assert.equal(SELECTIVE_BOBBER_SETTINGS.trophy.targetWaitSeconds, 75);
  const selective = deriveAcceptedBobberProfile(PHYSICAL_WATER_RARITY_PROFILES.ocean, 'selective');
  const trophy = deriveAcceptedBobberProfile(PHYSICAL_WATER_RARITY_PROFILES.ocean, 'trophy');
  close(selective.Rare + selective.Legendary, .23867313915857605);
  close(trophy.Rare + trophy.Legendary, .30262112867355045);
});

test('Binder combines only owned Field Note pages and Catch Log Pages are passive', () => {
  const entry = (id, rarity, probability, exclusiveWaterId = '') => ({
    probability,
    fish: { id, name: id, rarity, habitat: { exclusiveWaterId } }
  });
  const table = [
    entry('common-a', 'Common', .4),
    entry('uncommon-a', 'Uncommon', .3),
    entry('rare-a', 'Rare', .2, 'pond'),
    entry('legendary-a', 'Legendary', .1)
  ];
  const selected = selectEcologyGuideEntries(table, 'binder', null, 'pond', [
    { guideMode: 'rarity', guideRarity: 'Common' },
    { guideMode: 'exclusive' }
  ]);
  assert.deepEqual(selected.map((item) => item.fish.id), ['common-a', 'rare-a']);
  assert.equal(EQUIPMENT_BY_ID.get('catch-log-pages').passive, true);
  const state = normalizeProgressionState({
    schemaVersion: PROGRESSION_SCHEMA_VERSION,
    money: 5000,
    ownedEquipment: ['catch-log-pages']
  });
  const manager = new EquipmentManager(() => state, () => {});
  assert.match(manager.equip('catch-log-pages').reason, /always active/i);
});

test('legacy Atlas owners keep the complete Binder and catch-history feature set', () => {
  const migrated = normalizeProgressionState({
    schemaVersion: 15,
    ownedEquipment: ['master-naturalist-atlas'],
    equipped: { guide: 'master-naturalist-atlas' }
  });
  for (const id of [
    'common-field-notes', 'uncommon-field-notes', 'rare-field-notes',
    'legendary-field-notes', 'local-secrets-guide', 'catch-log-pages'
  ]) assert.ok(migrated.ownedEquipment.includes(id), id);
  assert.equal(migrated.equipped.guide, 'master-naturalist-atlas');
});

test('chart labels avoid Glasswater and shared sign lettering has stable depth separation', async () => {
  const [styles, signRenderer] = await Promise.all([
    readFile(new URL('src/styles.css', here), 'utf8'),
    readFile(new URL('src/world/sign-text-renderer.js', here), 'utf8')
  ]);
  assert.match(styles, /is-known-unavailable \.boat-map-construction[\s\S]*?bottom:\s*calc\(100% \+ \.16rem\)/);
  assert.match(styles, /is-locked-cloud \.boat-map-lock[\s\S]*?color:\s*#173f3c/);
  assert.match(signRenderer, /material\.depthBias\s*=\s*-1/);
  assert.match(signRenderer, /surfaceOffset \?\? \.56/);
});
