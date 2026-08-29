import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePresentationDistance } from '../src/camera/presentation-framing.js';
import { PLAYER_CONFIG } from '../src/config.js';
import {
  FISH_SPECIES,
  getFishDisplayMetrics,
  getWeightedSpeciesTable
} from '../src/fishing/fish-data.js';
import { getEcologySelection } from '../src/fishing/fish-ecology.js';
import { RhythmSession } from '../src/fishing/rhythm-session.js';
import { stabilizeWedgeMovement } from '../src/player/collision-stability.js';
import {
  FALLGLASS_WATERFALL_RADII,
  MOUNTAIN_FISHING_LOCATIONS,
  SUMMIT_ROUTE_CONNECTOR
} from '../src/world/mountain-v2.js';

test('summit ecology has a viable post-weighting five-percent ceiling with repeat history', () => {
  const descriptor = MOUNTAIN_FISHING_LOCATIONS.find((water) => water.id === 'crooked-peak-tarn');
  const zone = {
    ...descriptor,
    center: { x: 260, z: 0 },
    modifiers: {
      rarityBias: descriptor.rarityBias,
      maximumSpeciesProbability: descriptor.maximumSpeciesProbability
    }
  };
  const ecology = getEcologySelection(zone);
  assert.ok(ecology.fishIds.length >= 20);
  for (const recentSpeciesIds of [[], ecology.fishIds.slice(0, 4)]) {
    const table = getWeightedSpeciesTable(ecology.fishIds, {
      ...zone.modifiers,
      habitatWeights: ecology.habitatWeights,
      recentSpeciesIds,
      disablePoolEnrichment: true
    });
    assert.ok(Math.max(...table.map((entry) => entry.probability)) <= .05 + 1e-9);
    assert.ok(Math.abs(table.reduce((sum, entry) => sum + entry.probability, 0) - 1) < 1e-9);
  }
});

test('length and condition independently control longitudinal and cross-body scale', () => {
  const light = getFishDisplayMetrics({ length: 20, weight: 2, expectedWeight: 4 });
  const heavy = getFishDisplayMetrics({ length: 20, weight: 7.6, expectedWeight: 4 });
  assert.equal(light.displayedLength, heavy.displayedLength);
  assert.ok(heavy.girthMultiplier > light.girthMultiplier * 2);
  assert.ok(heavy.widthMultiplier > light.widthMultiplier * 3);

  const tiny = getFishDisplayMetrics({ length: 1.5, weight: .02, expectedWeight: .02 });
  const massive = getFishDisplayMetrics({ length: 900, weight: 100000, expectedWeight: 100000 });
  assert.ok(tiny.displayedLength < .06);
  assert.ok(massive.displayedLength > 20);
});

test('summit water dragon owns the dedicated dragon model archetype', () => {
  const dragon = FISH_SPECIES.find((fish) => fish.id === 'summit-water-dragon');
  assert.equal(dragon.visual.archetype, 'dragon');
  assert.ok(dragon.sizeModel.depth > .5);
  assert.ok(dragon.sizeModel.head > 1);
});

test('bounds-based camera framing moves closer for tiny and farther for huge catches', () => {
  const tinyDistance = calculatePresentationDistance(.7, 47, 16 / 9);
  const ordinaryDistance = calculatePresentationDistance(1.4, 47, 16 / 9);
  const hugeDistance = calculatePresentationDistance(12, 47, 16 / 9);
  assert.ok(tinyDistance < ordinaryDistance);
  assert.ok(hugeDistance > ordinaryDistance * 5);
});

test('long hold tails keep moving and short holds remain distinct from repeated taps', () => {
  const fish = FISH_SPECIES.find((entry) => entry.id === 'rainbow-trout');
  const session = new RhythmSession(fish, 0, () => .5);
  session.pattern = {
    ...session.pattern,
    approachSeconds: 2,
    duration: 10,
    notes: [
      { id: 1, lane: 'A', hitTime: 1, duration: 4, status: 'holding' },
      { id: 2, lane: 'S', hitTime: 3, duration: .1, status: 'pending' },
      { id: 3, lane: 'S', hitTime: 3.16, duration: 0, status: 'pending' }
    ]
  };
  session.songTime = 1.5;
  const firstFrame = session.getVisibleNotes();
  const longStart = firstFrame.find((note) => note.id === 1);
  const short = firstFrame.find((note) => note.id === 2);
  assert.equal(longStart.visualPosition, 0);
  assert.ok(short.visualHoldLength >= .13);
  assert.equal(firstFrame.filter((note) => note.lane === 'S').length, 2);

  session.songTime = 3;
  const longLater = session.getVisibleNotes().find((note) => note.id === 1);
  assert.ok(longLater.visualHoldLength < longStart.visualHoldLength);
});

test('opposing blocked contacts stabilize wedges without altering a single-wall slide', () => {
  const desired = { x: .1, y: -.02, z: 0 };
  const corrected = { x: -.035, y: -.01, z: .012 };
  const wedge = stabilizeWedgeMovement(desired, corrected, [
    { x: 1, y: 0, z: 0 },
    { x: -.8, y: .1, z: .2 }
  ]);
  assert.deepEqual(wedge, {
    x: 0,
    y: 0,
    z: 0,
    stabilized: true,
    opposingContacts: true,
    blocked: true
  });

  const wallSlide = stabilizeWedgeMovement(desired, { x: .04, y: -.01, z: .08 }, [
    { x: -1, y: 0, z: 0 }
  ]);
  assert.equal(wallSlide.stabilized, false);
  assert.equal(wallSlide.z, .08);
});

test('slide pose, summit connector, and sampled waterfall meet the 6.9 geometry contract', () => {
  assert.equal(PLAYER_CONFIG.slidePoseDelay, .25);
  assert.ok(SUMMIT_ROUTE_CONNECTOR.thresholdRadius < SUMMIT_ROUTE_CONNECTOR.lipRadius);
  assert.ok(SUMMIT_ROUTE_CONNECTOR.maximumVerticalGap <= .82);
  assert.ok(FALLGLASS_WATERFALL_RADII.includes(116));
  assert.ok(FALLGLASS_WATERFALL_RADII.every((radius, index, values) => (
    index === 0 || radius - values[index - 1] <= 4
  )));
});
