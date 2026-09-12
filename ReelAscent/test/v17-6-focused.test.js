import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_APPEARANCE,
  compactAppearance,
  normalizeAppearance,
  randomizeAppearance,
  resolveAppearance
} from '../src/player/appearance.js';
import { defaultProgressionState, normalizeProgressionState } from '../src/progression/progression-save.js';
import { GAME_VERSION } from '../src/version.js';

const here = new URL('../', import.meta.url);

test('v17.6 fresh Human and Blob defaults have every optional accessory off', () => {
  assert.equal(GAME_VERSION, 'v17.6');
  for (const key of ['accessory', 'headwear', 'eyewear', 'faceAccessory', 'backAccessory']) {
    assert.equal(DEFAULT_APPEARANCE[key], 'none', `${key} defaults off`);
  }
  assert.deepEqual(defaultProgressionState('fresh-human').appearance, DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance({ avatarType: 'blob' }), { ...DEFAULT_APPEARANCE, avatarType: 'blob' });
  assert.equal(compactAppearance(DEFAULT_APPEARANCE).accessory, 'none');
  assert.deepEqual(resolveAppearance(DEFAULT_APPEARANCE).shirtAccentColor, [0.99, 0.82, 0.33]);
});

test('Randomize can still deliberately select accessories', () => {
  const sequence = [0, .2, .3, .4, .5, .6, .72, .74, .76, .78, .8, .82];
  let index = 0;
  const randomized = randomizeAppearance(() => sequence[index++ % sequence.length]);
  assert.ok(['headwear', 'eyewear', 'faceAccessory', 'backAccessory'].some((key) => randomized[key] !== 'none'));
});

test('existing explicit and legacy accessory selections remain intact', () => {
  const explicit = normalizeProgressionState({
    schemaVersion: 13,
    player: { id: 'existing', createdAt: 1 },
    appearance: {
      ...DEFAULT_APPEARANCE,
      headwear: 'trail-hat', eyewear: 'round-glasses', faceAccessory: 'scarf', backAccessory: 'backpack'
    }
  });
  assert.deepEqual(
    ['headwear', 'eyewear', 'faceAccessory', 'backAccessory'].map((key) => explicit.appearance[key]),
    ['trail-hat', 'round-glasses', 'scarf', 'backpack']
  );

  const oneSlotLegacy = normalizeProgressionState({
    schemaVersion: 3,
    player: { id: 'legacy', createdAt: 1 },
    appearance: { avatarType: 'human', accessory: 'glasses' }
  });
  assert.equal(oneSlotLegacy.appearance.eyewear, 'glasses');
  assert.equal(oneSlotLegacy.appearance.backAccessory, 'backpack');

  const missingAppearanceLegacy = normalizeProgressionState({
    schemaVersion: 1,
    player: { id: 'old-default', createdAt: 1 }
  });
  assert.equal(missingAppearanceLegacy.appearance.headwear, 'beanie');
  assert.equal(missingAppearanceLegacy.appearance.backAccessory, 'backpack');
});

test('preview lazily instantiates the canonical gameplay character builder after becoming visible', async () => {
  const [preview, menu, player, remote] = await Promise.all([
    readFile(new URL('src/ui/appearance-preview.js', here), 'utf8'),
    readFile(new URL('src/ui/appearance-menu.js', here), 'utf8'),
    readFile(new URL('src/player/player.js', here), 'utf8'),
    readFile(new URL('src/multiplayer/remote-avatar.js', here), 'utf8')
  ]);
  assert.match(preview, /import \{ createCharacterModel \}/);
  assert.doesNotMatch(preview, /createRemoteAvatar/);
  assert.match(preview, /setVisible\(visible\)[\s\S]{0,180}!this\.initialize\(\)/);
  assert.match(preview, /new pc\.Application\(this\.canvas/);
  assert.match(preview, /this\.character = createCharacterModel\(this\.avatar/);
  assert.match(preview, /this\.character\?\.setAppearance\(this\.appearance\)/);
  assert.match(preview, /addEventListener\?\.\('resize', this\.onWindowResize\)/);
  assert.doesNotMatch(preview, /ResizeObserver/);
  assert.match(preview, /graphicsDevice\.resizeCanvas/);
  assert.doesNotMatch(preview, /this\.app\.resizeCanvas/);
  assert.match(menu, /this\.screen\.hidden = false[\s\S]{0,200}this\.preview\.setVisible\(true\)/);
  assert.match(menu, /this\.preview\.setAppearance\(appearance\)/);
  assert.match(player, /createCharacterModel\(this\.visualRoot/);
  assert.match(remote, /createCharacterModel\(rig/);
});
