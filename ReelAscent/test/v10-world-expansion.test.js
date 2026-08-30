import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CUSTOM_COLOR_FIELDS,
  DEFAULT_APPEARANCE,
  hexToColor,
  normalizeAppearance,
  resolveAppearance
} from '../src/player/appearance.js';
import { sanitizeAppearance } from '../server/src/snapshot-validation.js';
import {
  FRACTURED_ROCK_FORM_KINDS,
  LOWLAND_TREE_CONFIG,
  MID_MOUNTAIN_ROCK_DENSITY_CONFIG,
  MOUNTAIN_REST_LEDGE_CONFIG,
  SUMMIT_BENCH_CONFIG,
  SUMMIT_BENCH_CONFIGS,
  applyCoreRestTerraces
} from '../src/world/mountain-v2.js';

test('300–700 ft has a dedicated high-density two-rock field', async () => {
  const mountain = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.deepEqual(MID_MOUNTAIN_ROCK_DENSITY_CONFIG.belts.map((belt) => belt.height),
    [91.44, 121.92, 152.4, 167.64, 182.88, 213.36]);
  assert.ok(MID_MOUNTAIN_ROCK_DENSITY_CONFIG.belts.reduce((sum, belt) => sum + belt.count, 0) >= 390);
  assert.equal(MID_MOUNTAIN_ROCK_DENSITY_CONFIG.rocksPerOpenAnchor, 2);
  assert.match(mountain, /buildHighAltitudeInfill\(\);\s*this\.buildThreeToSevenHundredRockField\(\);\s*this\.buildMidHighTraversalAnchors\(\)/);
  assert.match(mountain, /dense formation[\s\S]*dense companion/);
  assert.match(mountain, /midMountainRockFieldAudit/);
});

test('500-ft rest shelf is a wide, deep part of the mountain core mesh', () => {
  const ledge = MOUNTAIN_REST_LEDGE_CONFIG.fiveHundred;
  assert.equal(ledge.coreTerrain, true);
  assert.ok(ledge.width >= 10);
  assert.ok(ledge.depth >= 7);
  assert.ok(Math.abs(applyCoreRestTerraces(ledge.angle, ledge.radius, ledge.targetHeight + 40)
    - ledge.targetHeight) < .001);
  assert.equal(applyCoreRestTerraces(ledge.angle + 40, ledge.radius, 177), 177);
});

test('rock library includes eight additional fractured silhouettes with exact hull collision', async () => {
  const mountain = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  for (const kind of ['anvil', 'tooth', 'fin', 'bulb', 'terrace', 'prow', 'twist', 'crouch']) {
    assert.ok(FRACTURED_ROCK_FORM_KINDS.includes(kind));
    assert.match(mountain, new RegExp(`kind === '${kind}'`));
  }
  assert.ok(new Set(FRACTURED_ROCK_FORM_KINDS).size >= 21);
  assert.match(mountain, /form\.hull\.flatMap[\s\S]*ColliderDesc\.convexHull\(points\)/);
});

test('summit bench seats the player facing fishable tarn water', async () => {
  const [mountain, interaction] = await Promise.all([
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/home-interaction.js', import.meta.url), 'utf8')
  ]);
  assert.equal(SUMMIT_BENCH_CONFIG.fishingFacing, 'summit-tarn');
  assert.ok(SUMMIT_BENCH_CONFIG.interactionDistance < 3);
  assert.equal(SUMMIT_BENCH_CONFIGS.length, 2);
  assert.equal(Math.abs(SUMMIT_BENCH_CONFIGS[0].angle - SUMMIT_BENCH_CONFIGS[1].angle), 180);
  assert.match(mountain, /id: config\.id[\s\S]*action: 'bench'[\s\S]*seatPosition:[\s\S]*exitPosition:[\s\S]*facingYaw/);
  assert.match(interaction, /interaction\.action === 'bench'[\s\S]*player\.setBenchSeat\(interaction\)/);
  assert.match(interaction, /player\.clearBenchSeat\(\)/);
  assert.match(interaction, /pendingSeat[\s\S]*startEmote\('sit'\)/);
  assert.match(interaction, /press F to fish[\s\S]*click the prompt to get up/);
});

test('lower forest is denser and its substantial trunks and branches are climbable', async () => {
  const [mountain, world] = await Promise.all([
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/world.js', import.meta.url), 'utf8')
  ]);
  assert.ok(LOWLAND_TREE_CONFIG.candidateCount >= 200);
  assert.ok(LOWLAND_TREE_CONFIG.maximumClimbableTrees >= 60);
  assert.match(mountain, /climbable trunk[\s\S]*registerClimbSurface\(trunk, trunk\.physicsCollider, 'rough'/);
  assert.match(mountain, /climbable branch[\s\S]*registerClimbSurface\(branch, branch\.physicsCollider, 'rough'/);
  assert.match(mountain, /attempt < 4[\s\S]*lowlandTreeAudit/);
  assert.match(world, /addCylinder[\s\S]*entity\.physicsCollider = this\.physicsWorld\.createCollider/);
});

test('cosmetics accept safe custom colors locally and through server snapshots', async () => {
  const menu = await readFile(new URL('../src/ui/appearance-menu.js', import.meta.url), 'utf8');
  assert.deepEqual(CUSTOM_COLOR_FIELDS.map((field) => field.key),
    ['shirtTint', 'pantsTint', 'hairTint', 'accessoryTint', 'blobTint']);
  const custom = normalizeAppearance({ ...DEFAULT_APPEARANCE, shirtTint: '#12ABef', blobTint: '#224466' });
  assert.equal(custom.shirtTint, '#12abef');
  assert.deepEqual(hexToColor('#0000ff'), [0, 0, 1]);
  assert.deepEqual(resolveAppearance(custom).blobColor, hexToColor('#224466'));
  assert.equal(normalizeAppearance({ shirtTint: 'red' }).shirtTint, null);
  assert.equal(sanitizeAppearance({ shirtTint: '<script>', blobTint: '#ABCDEF' }).blobTint, '#abcdef');
  assert.equal(sanitizeAppearance({ shirtTint: '<script>' }).shirtTint, null);
  assert.match(menu, /input\.type = 'color'[\s\S]*data-appearance-tint|dataset\.appearanceTint/);
  assert.match(menu, /data-appearance-reset-tint|dataset\.appearanceResetTint/);
});

test('Blue Blob matches the original capsule, head, and facing-marker multiplayer proxy', async () => {
  const [player, remote] = await Promise.all([
    readFile(new URL('../src/player/player.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/multiplayer/remote-avatar.js', import.meta.url), 'utf8')
  ]);
  for (const source of [player, remote]) {
    assert.match(source, /classic Blue Blob body[^\n]*'capsule'/i);
    assert.match(source, /classic Blue Blob head[^\n]*'sphere'/i);
    assert.match(source, /classic Blue Blob facing marker[^\n]*'box'/i);
    assert.doesNotMatch(source, /blobLimbs/);
  }
  assert.match(remote, /setMaterialColor\(blobBlue, resolved\.blobColor/);
});

test('cabin upgrade uses true framed windows and adds a finished hearth interior', async () => {
  const mountain = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(mountain, /true framed window opening/);
  assert.match(mountain, /front window sill wall[\s\S]*front window header wall/);
  assert.match(mountain, /open door[\s\S]*stone hearth[\s\S]*fireplace glow[\s\S]*stone chimney/);
  assert.match(mountain, /woven rug[\s\S]*exposed rafter[\s\S]*hanging lantern[\s\S]*Crooked Peak sign/);
});
