import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectEcologyGuideEntries } from '../src/fishing/fishing.js';
import { SaveSystem } from '../src/persistence/save-system.js';
import { normalizeAppearance } from '../src/player/appearance.js';
import { guideOddsShade } from '../src/ui/ecology-guide.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const guideEntry = (id, name, rarity, probability, exclusiveWaterId = null) => ({
  probability,
  fish: { id, name, rarity, habitat: { exclusiveWaterId } }
});

test('Atlas omits display-zero entries and sorts the final reveal by live odds', () => {
  const result = selectEcologyGuideEntries([
    guideEntry('zero', 'Zero', 'Legendary', 0),
    guideEntry('rounds-zero', 'Rounds Zero', 'Rare', .00049),
    guideEntry('low', 'Low', 'Common', .03),
    guideEntry('exclusive', 'Exclusive', 'Rare', .12, 'test-water'),
    guideEntry('high', 'High', 'Uncommon', .42)
  ], 'atlas', null, 'test-water');
  assert.deepEqual(result.map((entry) => entry.fish.id), ['high', 'exclusive', 'low']);
  assert.ok(result.every((entry) => entry.probability >= .0005));
});

test('Atlas likelihood shading is subtle, bounded, and monotonic', () => {
  const low = Number(guideOddsShade(.01, .01, .3));
  const middle = Number(guideOddsShade(.15, .01, .3));
  const high = Number(guideOddsShade(.3, .01, .3));
  assert.ok(low < middle && middle < high);
  assert.ok(low >= .04 && high <= .13);
});

test('Atlas caught status uses legitimate per-save Journal history only', () => {
  const saves = new SaveSystem(new MemoryStorage());
  assert.equal(saves.hasCaughtSpecies('bluegill'), false);
  saves.recordCatch({ speciesId: 'bluegill', name: 'Bluegill', rarity: 'Common' }, { legitimate: false });
  assert.equal(saves.hasCaughtSpecies('bluegill'), false);
  saves.recordCatch({ speciesId: 'bluegill', name: 'Bluegill', rarity: 'Common' }, { legitimate: true });
  assert.equal(saves.hasCaughtSpecies('bluegill'), true);
  saves.data.inventory = [];
  saves.data.aquarium = [];
  assert.equal(saves.hasCaughtSpecies('bluegill'), true);
  saves.data.collection.rainbow_trout = { discovered: true, catches: 2 };
  assert.equal(saves.hasCaughtSpecies('rainbow_trout'), true);
});

test('Atlas caught marker is after the name and its legend is Atlas-only', async () => {
  const [markup, panel] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/ecology-guide.js', import.meta.url), 'utf8')
  ]);
  assert.match(markup, /◆ Location exclusive<br>○ Not yet caught/);
  assert.match(panel, /state\.mode === 'atlas' && !entry\.caught/);
  assert.match(panel, /escapeHtml\(entry\.name\).*markers/);
});

test('appearance channels stay independent and old merged outfit saves migrate safely', () => {
  const appearance = normalizeAppearance({
    shirtColor: 'ember', hatColor: 'midnight', accessoryColor: 'sky',
    shirtTint: '#112233', hatTint: '#445566', accessoryTint: '#778899'
  });
  assert.deepEqual(
    [appearance.shirtColor, appearance.hatColor, appearance.accessoryColor],
    ['ember', 'midnight', 'sky']
  );
  assert.deepEqual(
    [appearance.shirtTint, appearance.hatTint, appearance.accessoryTint],
    ['#112233', '#445566', '#778899']
  );
  const migrated = normalizeAppearance({ outfitColor: 'moss', outfitTint: '#abcdef' });
  assert.deepEqual(
    [migrated.shirtColor, migrated.hatColor, migrated.accessoryColor],
    ['moss', 'moss', 'moss']
  );
  const older = normalizeAppearance({ shirtColor: 'ember', accessoryTint: '#224466' });
  assert.equal(older.shirtColor, 'ember');
  assert.equal(older.hatTint, '#224466');
  assert.equal(older.accessoryTint, '#224466');
});

test('cosmetics do not manufacture arbitrary index-based uniqueness geometry', async () => {
  const source = await readFile(new URL('../src/player/character-model.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /distinctive side crest|distinctive temple wing|distinctive hanging charm|distinctive back crest/);
});
