import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PlayerSession } from '../server/src/player-session.js';
import { RoomManager } from '../server/src/room-manager.js';
import { sanitizeAppearance } from '../server/src/snapshot-validation.js';
import {
  compactAppearance,
  normalizeAppearance,
  resolveAppearance
} from '../src/player/appearance.js';
import {
  deriveAcceptedBobberProfile,
  getSelectiveBobberSettings,
  sampleBobberBiteDelay
} from '../src/fishing/selective-bobbers.js';
import { PHYSICAL_WATER_RARITY_PROFILES } from '../src/fishing/rarity-selection.js';
import { createBakedTerrainGroundQuery } from '../src/world/map-editor-runtime.js';
import { GAME_VERSION } from '../src/version.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `${actual} should be within ${tolerance} of ${expected}`
);
const session = (id, name) => {
  const result = new PlayerSession(id, { send() {} });
  result.displayName = name;
  return result;
};

test('v20.4 is the active displayed build version', () => {
  assert.equal(GAME_VERSION, 'v20.4');
});

test('authored ground query uses upward baked surfaces and ignores downward ceilings', () => {
  const patch = { terrain: { bakedMesh: {
    positions: [0, 10, 0, 0, 10, 1, 1, 10, 0, 0, 5, 0, 0, 5, 1, 1, 5, 0],
    indices: [0, 1, 2, 3, 5, 4]
  } } };
  const query = createBakedTerrainGroundQuery(patch, { cellSize: 2 });
  const hit = query(.2, .2, { minimumNormalY: .05 });
  assert.equal(hit.y, 10);
  assert.ok(hit.normal.y > 0);
  assert.equal(query(4, 4), null);
});

test('shirt, hat, and accessory colors stay independent and legacy outfit data migrates', () => {
  const independent = normalizeAppearance({
    shirtColor: 'plum', hatColor: 'midnight', accessoryColor: 'sky',
    shirtTint: '#123456', hatTint: '#654321', accessoryTint: '#abcdef', headwear: 'trail-hat'
  });
  assert.equal(independent.shirtColor, 'plum');
  assert.equal(independent.hatColor, 'midnight');
  assert.equal(independent.accessoryColor, 'sky');
  assert.equal(independent.shirtTint, '#123456');
  assert.equal(independent.hatTint, '#654321');
  assert.equal(independent.accessoryTint, '#abcdef');
  assert.notDeepEqual(resolveAppearance(independent).hatColor, resolveAppearance(independent).accessoryColor);
  const migrated = normalizeAppearance({ outfitColor: 'plum', outfitTint: '#123456' });
  assert.deepEqual(
    [migrated.shirtColor, migrated.hatColor, migrated.accessoryColor],
    ['plum', 'plum', 'plum']
  );
  const compact = compactAppearance(migrated);
  assert.equal(compact.shirtColor, 'plum');
  assert.equal(compact.hatColor, 'plum');
  assert.equal(compact.accessoryColor, 'plum');
  assert.equal('outfitColor' in compact, false);
  const serverAppearance = sanitizeAppearance(independent);
  assert.equal(serverAppearance.shirtColor, 'plum');
  assert.equal(serverAppearance.hatColor, 'midnight');
  assert.equal(serverAppearance.accessoryColor, 'sky');
});

test('display names are unique per room, case-insensitively, until reservation removal', () => {
  const manager = new RoomManager();
  const host = session('host', 'Trail Guide');
  assert.equal(manager.host(host).ok, true);
  const code = host.room.code;
  assert.equal(host.room.hasDisplayName(' TRAIL GUIDE ', host.playerId), false);
  const otherRoomHost = session('other-host', 'trail guide');
  assert.equal(manager.host(otherRoomHost).ok, true);
  const duplicate = session('duplicate', '  trail   guide  ');
  const rejected = manager.join(duplicate, code);
  assert.deepEqual(rejected, {
    ok: false,
    code: 'display_name_in_use',
    message: 'That player name is already in use in this room.'
  });
  host.room.remove(host);
  assert.equal(manager.join(duplicate, code).ok, true);
});

test('v20.3 bobbers use exact retention and bounded fixed cadence', () => {
  const ocean = PHYSICAL_WATER_RARITY_PROFILES.ocean;
  assert.deepEqual(getSelectiveBobberSettings('selective').acceptanceByRarity,
    { Common: .06, Uncommon: .56, Rare: .96, Legendary: 1 });
  assert.deepEqual(getSelectiveBobberSettings('trophy').acceptanceByRarity,
    { Common: 0, Uncommon: .05, Rare: .82, Legendary: 1 });
  close(sampleBobberBiteDelay(getSelectiveBobberSettings('selective'), 0, { profile: ocean }), 22.5);
  close(sampleBobberBiteDelay(getSelectiveBobberSettings('trophy'), 1, { profile: ocean }), 144);
  const selective = deriveAcceptedBobberProfile(ocean, 'selective');
  close(selective.Common, .1145320197044335);
  close(selective.Uncommon, .3448275862068966);
  close(selective.Rare, .3251231527093596);
  close(selective.Legendary, .21551724137931033);
  const trophy = deriveAcceptedBobberProfile(ocean, 'trophy');
  close(trophy.Common, 0);
  close(trophy.Uncommon, .05875440658049354);
  close(trophy.Rare, .5299647473560517);
  close(trophy.Legendary, .41128084606345475);
});

test('journal cards grow with content and guide odds include equipped bobber filtering', async () => {
  const [styles, fishing, guide] = await Promise.all([
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/fishing/fishing.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/ecology-guide.js', import.meta.url), 'utf8')
  ]);
  assert.match(styles, /\.journal-grid\s*\{[\s\S]*?grid-auto-rows:\s*max-content/);
  assert.match(styles, /\.journal-card\s*\{[\s\S]*?height:\s*auto[\s\S]*?overflow:\s*visible/);
  assert.match(fishing, /getEcologyGuideState\(\)[\s\S]*?deriveBobberAcceptance\(potentialProfile, bobberMode\)/);
  assert.match(fishing, /selectedEntry \?\?= selectionTable\.filter\([\s\S]*?bobberAcceptance\[entry\.fish\.rarity\][\s\S]*?> 0/);
  assert.match(guide, /equipped tackle odds/);
});
