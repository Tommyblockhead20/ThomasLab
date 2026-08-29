import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH_SPECIES, canonicalSpeciesId } from '../src/fishing/fish-data.js';
import { normalizeRarity, SAVE_SCHEMA_VERSION, SAVE_STORAGE_KEY, SaveSystem } from '../src/persistence/save-system.js';

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function catchData(overrides = {}) {
  return {
    speciesId: 'rainbow-trout',
    name: 'Rainbow Trout',
    rarity: 'Uncommon',
    rarityLabel: 'Uncommon',
    length: 18.4,
    weight: 5.2,
    lengthCategory: 'Long',
    lengthCategoryIndex: 3,
    sizeCategory: 'Large',
    sizeCategoryIndex: 3,
    quality: 'GREAT',
    shiny: false,
    locationLabel: 'Cloudstep Lake',
    elevation: 52.1,
    caughtAt: 1000,
    ...overrides
  };
}

test('missing and corrupt saves fall back to a valid versioned default', () => {
  const missing = new SaveSystem(new MemoryStorage());
  assert.equal(missing.data.version, SAVE_SCHEMA_VERSION);
  assert.deepEqual(missing.data.collection, {});

  const corrupt = new SaveSystem(new MemoryStorage({ [SAVE_STORAGE_KEY]: '{not-json' }));
  assert.equal(corrupt.data.version, SAVE_SCHEMA_VERSION);
  assert.equal(corrupt.lastLoadError, 'corrupt-or-unavailable');
  assert.equal(corrupt.data.lifetime.fishCaught, 0);

  const blocked = new SaveSystem({
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  });
  assert.equal(blocked.data.version, SAVE_SCHEMA_VERSION);
  assert.equal(blocked.lastLoadError, 'corrupt-or-unavailable');
  assert.equal(blocked.recordSummit(), false);
  assert.equal(blocked.lastLoadError, 'write-unavailable');
});

test('legacy and partial saves migrate with missing-field defaults', () => {
  const storage = new MemoryStorage({
    [SAVE_STORAGE_KEY]: JSON.stringify({
      version: 0,
      collection: { bluegill: { discovered: true, catches: 2 } }
    })
  });
  const save = new SaveSystem(storage);
  assert.equal(save.data.version, SAVE_SCHEMA_VERSION);
  assert.equal(save.data.collection.bluegill.catches, 2);
  assert.equal(save.data.collection.bluegill.shinyCount, 0);
  assert.equal(save.data.lifetime.summitCount, 0);
});

test('legacy Epic values normalize to canonical Legendary without changing the save schema', () => {
  const storage = new MemoryStorage({
    [SAVE_STORAGE_KEY]: JSON.stringify({
      version: SAVE_SCHEMA_VERSION,
      collection: {
        'lake-sturgeon': { discovered: true, rarity: 'Epic', catches: 4, bestWeight: 51.2 }
      },
      runHistory: [{ rarest: 'Epic Lake Sturgeon', fishCaught: 4 }]
    })
  });
  const save = new SaveSystem(storage);
  assert.equal(normalizeRarity('Epic'), 'Legendary');
  assert.equal(save.data.version, SAVE_SCHEMA_VERSION);
  assert.equal(save.data.collection.lake_sturgeon.rarity, 'Legendary');
  assert.equal(save.data.collection.lake_sturgeon.catches, 4);
  assert.equal(save.data.collection.lake_sturgeon.bestWeight, 51.2);
  assert.equal(save.data.runHistory[0].rarest, 'Legendary Lake Sturgeon');
  save.recordCatch(catchData({ speciesId: 'legacy-catch', rarity: 'Epic', rarityLabel: undefined }));
  assert.equal(save.data.collection['legacy-catch'].rarity, 'Legendary');
});

test('a complete 51-species v13 collection normalizes without losing stable IDs', () => {
  const legacyRoster = FISH_SPECIES.slice(0, 51);
  const collection = Object.fromEntries(legacyRoster.map((fish, index) => [fish.id, {
    discovered: true,
    name: fish.name,
    rarity: fish.rarityLabel,
    catches: index + 1,
    bestLength: fish.minLength
  }]));
  const storage = new MemoryStorage({
    [SAVE_STORAGE_KEY]: JSON.stringify({ version: 1, collection })
  });
  const snapshot = new SaveSystem(storage).getSnapshot();
  assert.equal(Object.keys(snapshot.collection).length, 51);
  assert.deepEqual(Object.keys(snapshot.collection), legacyRoster.map((fish) => canonicalSpeciesId(fish.id)));
  assert.equal(snapshot.collection.bluegill.discovered, true);
  assert.equal(snapshot.collection[canonicalSpeciesId(legacyRoster.at(-1).id)].catches, 51);
});

test('catch records preserve discovery, bests, quality, shinies, and survive reload', () => {
  const storage = new MemoryStorage();
  const save = new SaveSystem(storage);
  assert.equal(save.recordCatch(catchData()), true);
  assert.equal(save.recordCatch(catchData({
    length: 16,
    weight: 6.4,
    lengthCategory: 'Average',
    lengthCategoryIndex: 2,
    sizeCategory: 'Massive',
    sizeCategoryIndex: 4,
    quality: 'PERFECT',
    shiny: true,
    locationLabel: 'High Cirque Tarn',
    elevation: 120.1,
    caughtAt: 2000
  })), true);

  const reloaded = new SaveSystem(storage).getSnapshot();
  const fish = reloaded.collection.rainbow_trout;
  assert.equal(reloaded.lifetime.fishCaught, 2);
  assert.equal(fish.discovered, true);
  assert.equal(fish.catches, 2);
  assert.equal(fish.bestLength, 18.4);
  assert.equal(fish.bestWeight, 6.4);
  assert.equal(fish.bestLengthCategory, 'Long');
  assert.equal(fish.bestSizeCategory, 'Massive');
  assert.equal(fish.bestQuality, 'PERFECT');
  assert.equal(fish.shinyCount, 1);
  assert.equal(fish.firstLocation, 'Cloudstep Lake');
  assert.equal(fish.bestLocation, 'High Cirque Tarn');
  assert.equal(fish.highestCatchElevation, 120.1);
});

test('summits and bounded run summaries persist lifetime progress', () => {
  const storage = new MemoryStorage();
  const save = new SaveSystem(storage);
  save.recordSummit();
  for (let index = 0; index < 14; index += 1) {
    save.recordRun({
      highestElevation: 80 + index,
      fishCaught: index,
      rarest: 'Rare Splake',
      summitReached: index === 13,
      start: 'Tidewash Cove'
    });
  }
  const reloaded = new SaveSystem(storage).getSnapshot();
  assert.equal(reloaded.lifetime.summitCount, 1);
  assert.equal(reloaded.lifetime.runsCompleted, 14);
  assert.equal(reloaded.lifetime.highestElevation, 93);
  assert.equal(reloaded.runHistory.length, 12);
  assert.equal(reloaded.runHistory[0].summitReached, true);
});

test('a failed imported-save write keeps the prior in-memory progress', () => {
  const save = new SaveSystem(new MemoryStorage());
  save.data.progression.money = 321;
  save.storage = { setItem() { throw new Error('blocked'); } };
  assert.equal(save.replaceData({ ...save.getSnapshot(), progression: { ...save.data.progression, money: 999 } }), false);
  assert.equal(save.data.progression.money, 321);
});
