import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import { FISHING_CONFIG } from '../src/config.js';
import { FishingController } from '../src/fishing/fishing.js';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import { FISH_SPECIES, getWeightedSpeciesTable } from '../src/fishing/fish-data.js';
import { TIER_RARITY_PROFILES } from '../src/fishing/rarity-selection.js';
import { EQUIPMENT_CATALOG } from '../src/progression/equipment.js';
import { chooseAcceptedBobberEntry, deriveAcceptedBobberProfile } from '../src/fishing/selective-bobbers.js';

test('retained selection never picks zero-weight or rejected entries at random boundaries', () => {
  const common = { fish: { rarity: 'Common' }, probability: .7 };
  const zero = { fish: { rarity: 'Uncommon' }, probability: 0 };
  const rare = { fish: { rarity: 'Rare' }, probability: .3 };
  for (const roll of [0, Number.EPSILON, .25, .5, 1 - Number.EPSILON, 1, -1, NaN]) {
    assert.equal(chooseAcceptedBobberEntry([common, zero, rare], 'trophy', roll), rare);
  }
  assert.equal(chooseAcceptedBobberEntry([common], 'trophy', 0), null);
  assert.equal(chooseAcceptedBobberEntry([], 'selective', .5), null);
  assert.equal(chooseAcceptedBobberEntry([zero, rare], 'standard', 0), rare);
});

test('retained catch frequencies match the odds shown by the bobber profile', () => {
  const profile = { Common: .62, Uncommon: .20, Rare: .11, Legendary: .07 };
  const table = Object.entries(profile).map(([rarity, probability]) => ({ fish: { rarity }, probability }));
  for (const mode of ['standard', 'selective', 'trophy']) {
    const expected = deriveAcceptedBobberProfile(profile, mode);
    const counts = Object.fromEntries(Object.keys(profile).map(rarity => [rarity, 0]));
    for (let index = 0; index < 10000; index++) counts[chooseAcceptedBobberEntry(table, mode, index / 10000).fish.rarity]++;
    for (const rarity of Object.keys(profile)) assert.ok(Math.abs(counts[rarity] / 10000 - expected[rarity]) <= .0002, `${mode} ${rarity}`);
  }
});

test('every live rarity profile and chance-changing lure keeps Sentinel free of Common fish', () => {
  const ids = FISH_SPECIES.filter(fish => !fish.futureReserved).map(fish => fish.id);
  const lures = EQUIPMENT_CATALOG.filter(item => item.category === 'lure');
  for (const [tier, profile] of Object.entries(TIER_RARITY_PROFILES)) for (const lure of lures) {
    const table = getWeightedSpeciesTable(ids, { rarityProfile: profile, ...lure.modifiers, disablePoolEnrichment: true });
    for (let index = 0; index <= 32; index++) {
      const selected = chooseAcceptedBobberEntry(table, 'trophy', index / 32);
      assert.ok(selected, `${tier} with ${lure.id} has retained fish`);
      assert.notEqual(selected.fish.rarity, 'Common');
      assert.ok(selected.probability > 0);
    }
  }
});

function controller(mode = 'trophy', rarities = null, roll = 0) {
  const zone = new FishingZone({ id: 'test-bobber-pond', label: 'Test Pond', center: { x: 0, z: 0 }, radii: { x: 20, z: 20 }, surfaceY: 0, fishIds: FISH_SPECIES.map(fish => fish.id), modifiers: { rarityTier: 'lower' } });
  zone.tier = 'lower'; zone.waterType = 'pond'; zone.theme = 'fernwood';
  if (rarities) zone.allowedRarities = rarities;
  const result = {
    zone, config: FISHING_CONFIG, rng: () => roll, charge: .5, recentHookSpecies: [], hookTutorialSeen: true,
    cast: { target: new pc.Vec3(), landingZone: zone }, bobberPosition: new pc.Vec3(), aimDirection: new pc.Vec3(1, 0, 0),
    bobberRoot: { enabled: true }, lineEntity: { enabled: true },
    progression: { getModifiers: () => ({}), getModifier: () => 1, getEquippedItem: category => category === 'bobber' ? { bobberMode: mode } : category === 'guide' ? { name: 'Common Field Notes', guideMode: 'rarity', guideRarity: 'Common' } : { id: 'test-rod' } },
    audio: { tone() {}, prepareInstrument: async () => {}, prepareAccents: async () => {}, splash() {}, bite() {}, cast() {} },
    player: { getPosition: () => new pc.Vec3() }, world: { findFishingZoneAt: () => zone },
    getRodTipPosition: () => new pc.Vec3(), setState(state, message) { this.state = state; this.message = message; }, triggerRipple() {}, hasCaughtSpecies: () => false
  };
  result.getSelectionModifiers = FishingController.prototype.getSelectionModifiers;
  return result;
}

test('real bite selection and equipped guide obey Sentinel filtering, including a zero roll', () => {
  for (const roll of [0, .25, .5, .999999, 1]) {
    const fishing = controller('trophy', null, roll);
    assert.equal(FishingController.prototype.beginBite.call(fishing), true);
    assert.notEqual(fishing.selectedFish.rarity, 'Common');
    assert.equal(fishing.state, 'bite');
    assert.deepEqual(FishingController.prototype.getEcologyGuideState.call(fishing).entries, []);
  }
});

test('Sentinel refuses Common-only water before casting and exits a depleted cast cleanly', () => {
  const fishing = controller('trophy', ['Common']);
  assert.equal(FishingController.prototype.startCast.call(fishing), false);
  assert.equal(fishing.state, 'result');
  assert.equal(fishing.cast, null);
  assert.equal(fishing.lineEntity.enabled, false);
  assert.equal(FishingController.prototype.beginBite.call(controller('trophy', ['Common'])), false);
});

test('empty or unavailable pools reset every bobber instead of starting a fishless bite', () => {
  for (const mode of ['standard', 'selective', 'trophy']) {
    const fishing = controller(mode, ['unavailable-tier']);
    assert.equal(FishingController.prototype.beginBite.call(fishing), false);
    assert.equal(fishing.selectedFish, null);
    assert.equal(fishing.state, 'result');
    assert.equal(fishing.cast, null);
    assert.equal(fishing.bobberRoot.enabled, false);
    assert.equal(fishing.lineEntity.enabled, false);
  }
});
