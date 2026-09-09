import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import { generateRhythmPattern } from '../src/fishing/rhythm-session.js';
import { SongVoteStore, SONG_VOTES_STORAGE_KEY } from '../src/fishing/song-votes.js';
import { stabilizeMobileContext } from '../src/player/mobile-actions.js';
import { DEFAULT_APPEARANCE } from '../src/player/appearance.js';
import { SaveSystem } from '../src/persistence/save-system.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import { normalizeProgressionState } from '../src/progression/progression-save.js';
import {
  BADGE_COSMETIC_REWARD_BY_ID,
  CASINO_EXCLUSIVE_COSMETICS,
  COSMETIC_BY_ID,
  COSMETIC_CATALOG,
  LEGENDARY_COSMETIC_REWARD_BY_SPECIES,
  PREVIOUS_ACTIVE_COSMETIC_COUNT,
  SHOP_COSMETICS,
  STARTER_COSMETICS
} from '../src/progression/cosmetics.js';
import { TRAIL_BADGE_DEFINITIONS } from '../src/progression/trail-badges.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('v16 mobile context switches upward immediately and resists lower-priority flicker', () => {
  let state = stabilizeMobileContext({}, { kind: 'fish', priority: 60 }, 1000);
  assert.equal(state.current.kind, 'fish');
  state = stabilizeMobileContext(state, { kind: 'grip', priority: 40 }, 1050);
  assert.equal(state.current.kind, 'fish');
  state = stabilizeMobileContext(state, { kind: 'grip', priority: 40 }, 1175);
  assert.equal(state.current.kind, 'grip');
  state = stabilizeMobileContext(state, { kind: 'interact', priority: 80 }, 1180);
  assert.equal(state.current.kind, 'interact');
  state = stabilizeMobileContext(state, null, 1300);
  assert.equal(state.current.kind, 'interact');
  state = stabilizeMobileContext(state, null, 1370);
  assert.equal(state.current, null);
});

test('v16 cosmetic catalog expands over 50 percent and covers every Legendary and badge', () => {
  assert.ok(COSMETIC_CATALOG.length >= Math.ceil(PREVIOUS_ACTIVE_COSMETIC_COUNT * 1.5));
  assert.equal(new Set(COSMETIC_CATALOG.map(({ id }) => id)).size, COSMETIC_CATALOG.length);
  assert.ok(STARTER_COSMETICS.length >= 8);
  assert.ok(SHOP_COSMETICS.length >= 10);
  assert.ok(CASINO_EXCLUSIVE_COSMETICS.every((entry) => entry.source.type === 'casino'));
  const legendary = FISH_SPECIES.filter((entry) => entry.rarity === 'Legendary');
  assert.equal(Object.keys(LEGENDARY_COSMETIC_REWARD_BY_SPECIES).length, legendary.length);
  for (const species of legendary) {
    const rewardId = LEGENDARY_COSMETIC_REWARD_BY_SPECIES[species.canonicalId ?? species.id];
    assert.equal(COSMETIC_BY_ID.get(rewardId)?.source.speciesId, species.canonicalId ?? species.id);
  }
  assert.equal(Object.keys(BADGE_COSMETIC_REWARD_BY_ID).length, TRAIL_BADGE_DEFINITIONS.length);
  for (const badge of TRAIL_BADGE_DEFINITIONS) {
    const reward = COSMETIC_BY_ID.get(BADGE_COSMETIC_REWARD_BY_ID[badge.id]);
    assert.equal(reward?.source.badgeId, badge.id);
  }
});

test('v16 cosmetics are per-save, grandfather equipped old items, and test mode is session-only', () => {
  const migrated = normalizeProgressionState({
    appearance: { ...DEFAULT_APPEARANCE, eyewear: 'aviators' }
  });
  assert.ok(migrated.ownedCosmetics.includes('aviators'));

  const storage = new MemoryStorage();
  const saves = new SaveSystem(storage);
  saves.data.progression.money = 500;
  const progression = new ProgressionSystem(saves);
  const shopItem = SHOP_COSMETICS[0];
  assert.equal(progression.purchaseCosmetic(shopItem.id).ok, true);
  assert.equal(progression.getCosmeticAccess(shopItem.id).unlocked, true);
  const casino = CASINO_EXCLUSIVE_COSMETICS.find((entry) => entry.supports.includes('human'));
  assert.equal(progression.getCosmeticAccess(casino.id).unlocked, false);
  assert.equal(progression.toggleCosmeticTestMode(), true);
  assert.equal(progression.getCosmeticAccess(casino.id).unlocked, true);
  assert.ok(!progression.getSnapshot().ownedCosmetics.includes(casino.id));
  assert.equal(saves.createSlot('slot-2'), true);
  assert.equal(saves.getSlotSnapshot('slot-2').progression.ownedCosmetics.includes(shopItem.id), false);
});

test('v16 song votes are one changeable browser-level vote per stable song ID', () => {
  const storage = new MemoryStorage();
  const store = new SongVoteStore(storage);
  const fish = FISH_SPECIES[0];
  const first = generateRhythmPattern(fish, () => .5);
  const second = generateRhythmPattern(fish, () => .1);
  assert.match(first.songId, /^song:[a-z0-9_:-]+:authored-1$/i);
  assert.equal(first.songId, second.songId);
  assert.equal(store.toggle(first.songId, 'up'), 'up');
  assert.equal(store.toggle(first.songId, 'up'), null);
  assert.equal(store.set(first.songId, 'down'), 'down');
  assert.equal(new SongVoteStore(storage).get(first.songId), 'down');
  assert.equal(Object.keys(JSON.parse(storage.getItem(SONG_VOTES_STORAGE_KEY)).votes).length, 1);
});

test('v16 UI source has consolidated mobile actions and rebuilt Aquarium hierarchy', async () => {
  const [html, aquarium, styles, movement, journal, inventory] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/aquarium.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/player/movement.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/fish-journal.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/inventory.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /data-touch-action="movement-action"/);
  assert.match(html, /data-touch-action="context-action"/);
  assert.doesNotMatch(html, /data-touch-action="(sprint|slide|fish|grip)"/);
  assert.match(movement, /effectiveAction === 'grip'/);
  assert.match(journal, /onMobilePointerDown/);
  assert.match(inventory, /onMobilePointerDown/);
  assert.match(styles, /\.mobile-utility-cluster[\s\S]{0,900}pointer-events: auto/);
  assert.match(aquarium, /aquarium-summary-row/);
  assert.match(aquarium, /aquarium-desktop-layout/);
  assert.match(aquarium, /aquarium-tank-rail/);
  assert.match(aquarium, /aquarium-specimen-browser/);
  assert.match(aquarium, /aquarium-detail-panel/);
  assert.match(styles, /grid-template-columns: 13\.5rem minmax\(28rem, 1fr\) 19rem/);
  assert.match(styles, /\.aquarium-tank-list \{ display: flex/);
  assert.match(styles, /\.aquarium-topbar \{ position: sticky/);
});
