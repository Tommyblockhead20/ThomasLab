import test from 'node:test';
import assert from 'node:assert/strict';
import { EQUIPMENT_BY_ID } from '../src/progression/equipment.js';
import { AQUARIUM_TANK_UPGRADES } from '../src/progression/aquarium.js';
import { getCatchValue } from '../src/progression/economy.js';
import { TIER_RARITY_PROFILES } from '../src/fishing/rarity-selection.js';

test('first useful purchases are reachable while upper upgrades retain aspiration prices', () => {
  const typical = Object.fromEntries(['Common', 'Uncommon', 'Rare', 'Legendary'].map((rarity) => [
    rarity, getCatchValue({ rarity, sizeFraction: .5, weight: 1, expectedWeight: 1, quality: 'GOOD' })
  ]));
  const lowerExpected = Object.entries(TIER_RARITY_PROFILES.lower)
    .reduce((sum, [rarity, chance]) => sum + typical[rarity] * chance, 0);
  assert.ok(lowerExpected > 15 && lowerExpected < 25);
  assert.ok(EQUIPMENT_BY_ID.get('common-field-notes').price / lowerExpected < 15);
  assert.ok(EQUIPMENT_BY_ID.get('fast-bite-chum').price / lowerExpected < 50);
  assert.ok(EQUIPMENT_BY_ID.get('precision-tip-rod').price / lowerExpected < 55);
  assert.equal(AQUARIUM_TANK_UPGRADES[1].price, 1800);
  assert.ok(EQUIPMENT_BY_ID.get('mythlight-lure').price >= 10000);
});
