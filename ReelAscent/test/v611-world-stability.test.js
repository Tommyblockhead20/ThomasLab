import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STAMINA_CONFIG } from '../src/config.js';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import { calculateCatchGroundLift, catchGroundSamplePoints } from '../src/fishing/presentation-grounding.js';
import {
  CONTACT_RECOVERY_MAX_SECONDS,
  CONTACT_RECOVERY_MIN_SECONDS,
  createContactRecovery,
  sampleContactRecovery
} from '../src/player/contact-recovery.js';
import { TestWorld } from '../src/world/world.js';
import {
  MOUNTAIN_CENTER,
  MountainWorld,
  OCEAN_FLOOR_OUTER_RADIUS,
  OCEAN_SEABED_JOIN_RADIUS,
  OCEAN_SHALLOW_WALK_END_RADIUS,
  OCEAN_SURFACE_Y,
  OCEAN_WATER_INNER_RADIUS,
  OUT_OF_WORLD_FALL_Y,
  START_LOCATIONS,
  SUMMIT_HEIGHT,
  oceanFloorHeightAt
} from '../src/world/mountain-v2.js';
import {
  auditRockDensity,
  basinTerrainHeight,
  summitBasinHeight,
  supportAdjustment
} from '../src/world/world-validation.js';

test('only a below-world fall can end the run; water has no death classification', async () => {
  const [playerSource, zoneSource, worldSource, mountainSource] = await Promise.all([
    readFile(new URL('../src/player/player.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/fishing/fishing-zone.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/world.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8')
  ]);
  const activeDeathPath = [playerSource, zoneSource, worldSource, mountainSource].join('\n');
  assert.doesNotMatch(activeDeathPath, /isDeepWater|fatalInnerRadius|killRadiusScale|drown/i);
  assert.equal(MountainWorld.prototype.isFatalPosition({ x: 10000, y: -12, z: 10000 }), false);
  assert.equal(MountainWorld.prototype.isFatalPosition({ x: 260, y: OUT_OF_WORLD_FALL_Y - .01, z: 0 }), true);
});

test('the beach remains and the rendered Rapier seabed is broad, shallow first, then deeper', async () => {
  const mountainSource = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.ok(START_LOCATIONS.some((start) => start.id === 'sandy-beach'));
  assert.ok(OCEAN_SHALLOW_WALK_END_RADIUS - OCEAN_WATER_INNER_RADIUS >= 18);
  assert.ok(OCEAN_FLOOR_OUTER_RADIUS - OCEAN_WATER_INNER_RADIUS >= 120);
  assert.ok(oceanFloorHeightAt(OCEAN_SEABED_JOIN_RADIUS) > oceanFloorHeightAt(OCEAN_WATER_INNER_RADIUS));
  assert.ok(oceanFloorHeightAt(OCEAN_SHALLOW_WALK_END_RADIUS) >= OCEAN_SURFACE_Y - .7);
  assert.ok(oceanFloorHeightAt(OCEAN_FLOOR_OUTER_RADIUS) < -10);
  assert.match(mountainSource, /Extended walkable ocean floor/);
  assert.match(mountainSource, /ColliderDesc\.trimesh/);
});

test('casting uses the actual cast direction: dry beach fails while an outward shore cast succeeds', () => {
  const ocean = new FishingZone({
    id: 'ocean', label: 'Ocean', center: MOUNTAIN_CENTER, shape: 'annulus',
    innerRadius: OCEAN_WATER_INNER_RADIUS, outerRadius: OCEAN_FLOOR_OUTER_RADIUS - 5,
    surfaceY: OCEAN_SURFACE_Y, fishIds: ['sardine']
  });
  const fakeWorld = {
    findFishingZoneAt(point) {
      return ocean.contains(point, .25) ? ocean : null;
    }
  };
  const cast = TestWorld.prototype.getFishingZoneForCast;
  const dry = { x: MOUNTAIN_CENTER.x + OCEAN_WATER_INNER_RADIUS - 20, y: OCEAN_SURFACE_Y, z: 0 };
  const shore = { x: MOUNTAIN_CENTER.x + OCEAN_WATER_INNER_RADIUS - 4, y: OCEAN_SURFACE_Y, z: 0 };
  assert.equal(cast.call(fakeWorld, dry, { x: 1, z: 0 }, 3, 12), null);
  assert.equal(cast.call(fakeWorld, shore, { x: -1, z: 0 }, 3, 12), null);
  assert.equal(cast.call(fakeWorld, shore, { x: 1, z: 0 }, 3, 12), ocean);
});

test('ordinary and summit water surfaces are enclosed by depressed floors and raised shores', () => {
  const centerHeight = 52;
  const depth = 2.2;
  const surface = centerHeight - depth + .45;
  assert.ok(basinTerrainHeight(52, centerHeight, depth, 0) < surface);
  assert.ok(basinTerrainHeight(52, centerHeight, depth, 1) > surface);
  const summitSurface = SUMMIT_HEIGHT - .12;
  assert.ok(summitBasinHeight(0, SUMMIT_HEIGHT, summitSurface) < summitSurface);
  assert.ok(summitBasinHeight(1, SUMMIT_HEIGHT, summitSurface) > summitSurface);
});

test('F6 is a compact nonmodal overlay with input telemetry and the journal keeps seven columns', async () => {
  const [html, debugSource, styles] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/fishing-performance.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="fishing-performance"/);
  assert.match(html, /id="performance-candidates"/);
  const debugMarkup = html.slice(html.indexOf('id="fishing-performance"'), html.indexOf('id="mobile-controls"'));
  assert.doesNotMatch(debugMarkup, /aria-modal="true"/);
  assert.match(debugMarkup, /performance-input-log/);
  assert.doesNotMatch(debugSource, /exitPointerLock|\.focus\(/);
  const compactStart = styles.lastIndexOf('/* v6.11 keeps fishing telemetry');
  const compactRule = styles.slice(compactStart, styles.indexOf('body.inventory-open', compactStart));
  const overlayRule = compactRule.match(/\.fishing-performance\s*\{[^}]*\}/s)?.[0] ?? '';
  assert.match(overlayRule, /width:\s*min\(38rem,/);
  assert.doesNotMatch(overlayRule, /width:\s*100(?:vw|%)|height:\s*100(?:vh|%)/);
  assert.match(styles, /\.journal-grid\s*\{[^}]*grid-template-columns:\s*repeat\(7,/s);
  assert.match(styles, /\.journal-card\s*>\s*strong\s*\{[^}]*font-size:\s*\.9rem/s);
});

test('contact recovery is eased over 0.18–0.30 seconds rather than teleporting', () => {
  const recovery = createContactRecovery({ x: 0, y: 1, z: 0 }, { x: 2, y: 1, z: 0 });
  assert.ok(recovery.duration >= CONTACT_RECOVERY_MIN_SECONDS);
  assert.ok(recovery.duration <= CONTACT_RECOVERY_MAX_SECONDS);
  const start = sampleContactRecovery(recovery, 0);
  const middle = sampleContactRecovery(recovery, recovery.duration / 2);
  const end = sampleContactRecovery(recovery, recovery.duration);
  assert.equal(start.x, 0);
  assert.ok(middle.x > 0 && middle.x < 2);
  assert.ok(middle.y > 1);
  assert.equal(end.x, 2);
  assert.equal(end.complete, true);
});

test('large catch grounding samples its rendered footprint and applies only the needed lift', () => {
  const samples = catchGroundSamplePoints({ center: { x: 4, y: 8, z: 6 }, halfExtents: { x: 5, y: 3, z: 2 } });
  assert.equal(samples.length, 5);
  assert.equal(calculateCatchGroundLift(-.5, .2), .78);
  assert.equal(calculateCatchGroundLift(2, .2), 0);
});

test('sprint stamina drain is reduced by 65 percent while remaining finite', () => {
  assert.equal(STAMINA_CONFIG.sprintDrainPerSecond, 4.2);
  assert.ok(STAMINA_CONFIG.sprintDrainPerSecond <= 12 * .4);
  assert.ok(STAMINA_CONFIG.sprintDrainPerSecond > 0);
});

test('support validation requires multiple contacts and density audit identifies sparse sectors', async () => {
  const initial = [.1, .2, .4, 1];
  const first = supportAdjustment(initial, .12, 3);
  assert.equal(first.supported, false);
  const adjusted = initial.map((clearance) => clearance - first.adjustment);
  assert.equal(supportAdjustment(adjusted, .12, 3).supported, true);

  const rocks = [];
  for (let sector = 0; sector < 18; sector += 1) {
    if (sector === 5) continue;
    for (let count = 0; count < 3; count += 1) rocks.push({ angle: sector * 20 + 1, radius: 100 });
  }
  const sparse = auditRockDensity(rocks, [{ id: 'middle', minimumRadius: 80, maximumRadius: 120 }], 18);
  assert.deepEqual(sparse.map((entry) => entry.sector), [5]);

  const mountainSource = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(mountainSource, /rejectedRocks\.push/);
  assert.match(mountainSource, /minimumContacts|contactCount/);
  assert.match(mountainSource, /density-balanced secondary/);
  assert.match(mountainSource, /diffuseVertexColor\s*=\s*true/);
  assert.match(mountainSource, /underside|crevice|weather|grain/i);
  assert.match(mountainSource, /buildCaveInteriorShell|interior roof/);
});
