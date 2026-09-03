import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculatePresentationDistance } from '../src/camera/presentation-framing.js';
import { calculateEyeAttachment } from '../src/fishing/creature-presentation.js';
import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import { RhythmSession } from '../src/fishing/rhythm-session.js';
import { isSlideInputCode, RhythmLaneInputState } from '../src/player/movement.js';
import { FISHING_DEBUG_TOGGLE_CODE } from '../src/ui/fishing-performance.js';
import {
  COASTAL_SHELF_RADIUS,
  MountainWorld,
  OCEAN_FLOOR_OUTER_RADIUS,
  OUT_OF_WORLD_FALL_Y,
  oceanFloorHeightAt
} from '../src/world/mountain-v2.js';

test('a same-lane press edge can hit a tap while another source sustains that lane hold', () => {
  const fish = FISH_SPECIES.find((entry) => entry.id === 'rainbow-trout');
  const session = new RhythmSession(fish, 0, () => .5);
  session.config = { ...session.config, pauseGapSeconds: 99 };
  session.lastNow = .99;
  session.pattern = {
    ...session.pattern,
    duration: 4,
    requiredHits: 2,
    totalEvents: 2,
    notes: [
      { id: 1, lane: 'D', degree: 7, hitTime: 1, duration: 2, status: 'pending' },
      { id: 2, lane: 'D', degree: 8, hitTime: 2, duration: 0, status: 'pending' }
    ]
  };
  const lanes = new RhythmLaneInputState();
  lanes.beginCapture();

  lanes.press('key:ArrowRight', 'D', 1);
  session.update(1, lanes.consume(), (lane) => lanes.isLaneHeld(lane));
  assert.equal(session.pattern.notes[0].status, 'holding');

  lanes.press('key:KeyD', 'D', 2);
  session.update(2, lanes.consume(), (lane) => lanes.isLaneHeld(lane));
  assert.equal(session.pattern.notes[1].status, 'hit');
  lanes.release('key:KeyD');
  assert.equal(lanes.isLaneHeld('D'), true);
  session.update(2.2, lanes.consume(), (lane) => lanes.isLaneHeld(lane));
  assert.equal(session.pattern.notes[0].status, 'holding');
  assert.equal(session.earlyHoldReleases, 0);
});

test('C is the only desktop slide binding', () => {
  assert.equal(isSlideInputCode('KeyC'), true);
  assert.equal(isSlideInputCode('ControlLeft'), false);
  assert.equal(isSlideInputCode('ControlRight'), false);
});

test('F6 fishing debug remains live but is hidden from the normal controls card', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const controls = html.slice(
    html.indexOf('<div class="controls-card">'),
    html.indexOf('</div>', html.indexOf('<div class="controls-card">'))
  );
  assert.equal(FISHING_DEBUG_TOGGLE_CODE, 'F6');
  assert.match(html, /id="fishing-performance"/);
  assert.match(html, /id="performance-candidates"/);
  assert.doesNotMatch(controls, /<kbd>F\d+<\/kbd>/);
  assert.match(controls, /<kbd>I<\/kbd> Inventory/);
  assert.match(controls, /<kbd>M<\/kbd> Multiplayer/);
});

test('ocean water and radius are nonfatal while a below-world fall still fails', () => {
  const isFatalPosition = MountainWorld.prototype.isFatalPosition;
  assert.equal(isFatalPosition({ x: 900, y: -12, z: 900 }), false);
  assert.equal(isFatalPosition({ x: 10000, y: 0, z: 10000 }), false);
  assert.equal(isFatalPosition({ x: 260, y: OUT_OF_WORLD_FALL_Y - .1, z: 0 }), true);
});

test('the physical seabed extends substantially offshore and descends continuously', () => {
  const waterEdge = COASTAL_SHELF_RADIUS - 5;
  assert.ok(OCEAN_FLOOR_OUTER_RADIUS - waterEdge >= 120);
  const heights = [waterEdge, waterEdge + 30, waterEdge + 75, OCEAN_FLOOR_OUTER_RADIUS]
    .map((radius) => oceanFloorHeightAt(radius));
  assert.ok(heights.every((height, index) => index === 0 || height < heights[index - 1]));
  assert.ok(heights.at(-1) < -10);
});

test('catch framing is closer than v6.9 at tiny, average, and massive bounds', () => {
  const legacyDistance = (radius, fov = 47, aspect = 16 / 9) => {
    const verticalHalfFov = fov * Math.PI / 360;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
    const fitted = radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov));
    return Math.min(96, Math.max(2.55, fitted * 1.16 + .22));
  };
  for (const radius of [.7, 1.4, 12]) {
    assert.ok(calculatePresentationDistance(radius) < legacyDistance(radius));
  }
  assert.ok(calculatePresentationDistance(.7) < calculatePresentationDistance(1.4));
  assert.ok(calculatePresentationDistance(1.4) < calculatePresentationDistance(12));
});

test('radius-derived eye attachment overlaps the head without burying most of the eye', () => {
  const representatives = [
    { headLength: .3, headHeight: .3, headWidth: .26, eyeX: .39, eyeY: .07, headCenterX: .34, headCenterY: 0, eyeDepth: .045 },
    { headLength: .34, headHeight: .3, headWidth: .29, eyeX: .38, eyeY: .14, headCenterX: .31, headCenterY: .07, eyeDepth: .03 }
  ];
  for (const dimensions of representatives) {
    const placement = calculateEyeAttachment(dimensions);
    const innerEyeSurface = placement.centerOffset - placement.eyeHalfDepth;
    assert.ok(innerEyeSurface < placement.headSurfaceOffset);
    assert.ok(placement.visibleFraction >= .7);
    assert.ok(placement.visibleFraction <= .9);
  }
});

test('Kraken is dramatically larger than an ordinary giant octopus in the v9.2 roster', () => {
  const kraken = FISH_SPECIES.find((entry) => entry.name === 'Kraken');
  const octopus = FISH_SPECIES.find((entry) => entry.name === 'Giant Pacific Octopus');
  assert.ok(kraken.sizeModel.typicalLength[0] > octopus.sizeModel.typicalLength[1] * 6);
  assert.ok(kraken.sizeModel.typicalWeight[0] > octopus.sizeModel.typicalWeight[1] * 80);
  assert.equal(FISH_SPECIES.length, 300);
  assert.deepEqual(
    Object.fromEntries(['Common', 'Uncommon', 'Rare', 'Legendary'].map((rarity) => [
      rarity,
      FISH_SPECIES.filter((entry) => entry.rarity === rarity).length
    ])),
    { Common: 75, Uncommon: 75, Rare: 75, Legendary: 75 }
  );
});

test('fishing cleanup removes repeated labels while preserving catch measurements', async () => {
  const [html, fishing] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/fishing/fishing.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(html, /Click or drag to look around/);
  assert.doesNotMatch(html, /id="rhythm-fish"/);
  assert.doesNotMatch(html, /<span class="eyebrow">FISHING<\/span>/);
  assert.match(html, /id="catch-length"/);
  assert.match(html, /id="catch-weight"/);
  assert.match(fishing, /showRecastHint/);
});
