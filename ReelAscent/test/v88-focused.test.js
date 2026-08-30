import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_APPEARANCE,
  LEGACY_CHARACTER_PALETTE,
  resolveAppearance
} from '../src/player/appearance.js';
import {
  FALLGLASS_WATERFALL_RADII,
  createMountainMapData
} from '../src/world/mountain-v2.js';

test('v8.8 exact legacy appearance remains the new-save and reset target', async () => {
  assert.deepEqual(LEGACY_CHARACTER_PALETTE, {
    player: [.95, .5, .22],
    playerAccent: [.99, .82, .33],
    skin: [.93, .72, .52],
    boots: [.18, .22, .18],
    backpack: [.18, .39, .34],
    trousers: [.23, .31, .29],
    dark: [.08, .11, .10]
  });
  assert.deepEqual(DEFAULT_APPEARANCE, {
    avatarType: 'human', skinTone: 'warm', shirtColor: 'classic-orange',
    pantsColor: 'classic-trail', hairStyle: 'tousled', hairColor: 'espresso',
    accessory: 'beanie', headwear: 'beanie', eyewear: 'none',
    faceAccessory: 'none', backAccessory: 'backpack', shirtTint: null,
    pantsTint: null, hairTint: null, accessoryTint: null, blobTint: null
  });
  const resolved = resolveAppearance(DEFAULT_APPEARANCE);
  assert.deepEqual(resolved.shirtColorValue.color, LEGACY_CHARACTER_PALETTE.player);
  assert.deepEqual(resolved.shirtAccentColor, LEGACY_CHARACTER_PALETTE.playerAccent);
  assert.deepEqual(resolved.pantsColorValue.color, LEGACY_CHARACTER_PALETTE.trousers);

  const [menu, html] = await Promise.all([
    readFile(new URL('../src/ui/appearance-menu.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="randomize-appearance"[\s\S]*id="reset-appearance"/);
  assert.match(menu, /onResetClick[\s\S]*setAppearance\(\{ \.\.\.DEFAULT_APPEARANCE \}\)/);
  assert.match(menu, /resetButton\?\.addEventListener[\s\S]*resetButton\?\.removeEventListener/);
});

test('v8.8 map keeps five bands and cave symbols while removing noisy or false pins', async () => {
  const map = createMountainMapData();
  assert.equal(map.contours.length, 5);
  assert.equal(map.waters.length, 24);
  assert.equal(map.caves.length, 4);
  assert.equal(map.ledges.length, 3);
  assert.equal(map.landmarks.some((entry) => entry.id === 'split-boulder'), true);
  assert.equal(map.landmarks.some((entry) => entry.id === 'cabin'), true);
  assert.equal(map.landmarks.some((entry) => entry.id === 'aquarium'), true);
  assert.equal(map.cascade.length, FALLGLASS_WATERFALL_RADII.length);
  assert.ok(map.cascade.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z)));

  const menu = await readFile(new URL('../src/ui/mountain-map.js', import.meta.url), 'utf8');
  assert.match(menu, /mapData\.caves\) this\.addMarker\(markerGroup, cave, 'map-cave', '', 'C'\)/);
  assert.doesNotMatch(menu, /for \(const ledge of this\.mapData\.ledges\)/);
  const wantedLine = menu.match(/const wantedLandmarks = new Set\(\[([^\]]+)\]\)/)?.[1] ?? '';
  assert.match(wantedLine, /'split-boulder'/);
  assert.doesNotMatch(wantedLine, /'tilted-slab'/);
});

test('v8.8 fishing input is captured before the narrow seated exit policy', async () => {
  const player = await readFile(new URL('../src/player/player.js', import.meta.url), 'utf8');
  assert.match(player, /const fishingWasActive = Boolean\(this\.fishing\?\.active \|\| this\.movementState === 'fishing'\)/);
  assert.match(player, /cancelPressed && this\.benchSeat && !fishingWasActive/);
  assert.match(player, /if \(this\.benchSeat && jumpPressed\)/);
  assert.doesNotMatch(player, /this\.benchSeat && \(hasMoveInput \|\| jumpPressed/);
  assert.ok(player.indexOf('const fishingWasActive') < player.indexOf('const inputLength'));
  assert.ok(player.indexOf('if (this.benchSeat && jumpPressed)') < player.indexOf("if (this.movementState === 'fishing')", player.indexOf('const inputLength')));
});

test('v8.8 waterfall follows each edge and cave shell starts behind the mouth', async () => {
  assert.equal(FALLGLASS_WATERFALL_RADII.length, 33);
  assert.ok(FALLGLASS_WATERFALL_RADII.every((radius, index) => (
    index === 0 || radius - FALLGLASS_WATERFALL_RADII[index - 1] === 2
  )));
  const mountain = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(mountain, /sampleRadius = Math\.hypot\(radius, tangentOffset\)/);
  assert.match(mountain, /waterfallPoint\(radius, centerTangent \+ width \* \.5 \* side, \.28\)/);
  assert.match(mountain, /const entranceRecess = segment === 0 \? segmentLength \* \.18 : 0/);
  assert.match(mountain, /Split Boulder west tooth[\s\S]*Split Boulder east tooth/);
  assert.equal((mountain.match(/kind === 'tilted-slab'/g) ?? []).length, 1);
  assert.equal((mountain.match(/kind: 'tilted-slab'/g) ?? []).length, 0);
});
