import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import {
  FOUR_LANE_CHORD_PROFILES,
  generateRhythmPattern,
  RHYTHM_RIFF_PROFILES
} from '../src/fishing/rhythm-session.js';
import { createPlayerSnapshot } from '../src/multiplayer/protocol.js';
import { applyCoreRestTerraces, CAVE_TOPOLOGY_CONFIG, MOUNTAIN_REST_LEDGE_CONFIG } from '../src/world/mountain-v2.js';
import { validateSnapshot } from '../server/src/snapshot-validation.js';
import { isPartialFootRestEligible } from '../src/player/player.js';

function sequence(values, fallback = .5) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

function fishNamed(name) {
  const fish = FISH_SPECIES.find((entry) => entry.name === name);
  assert.ok(fish, `${name} exists in active catalog`);
  return fish;
}

test('selected energetic species can generate short playable single-tap riffs only', () => {
  const selected = [
    'Rainbow Shiner', 'Mackerel', 'Great Barracuda', 'Piranha',
    'Sailfish', 'Yellowfin Tuna', 'Swordfish'
  ];
  assert.equal(Object.keys(RHYTHM_RIFF_PROFILES).length, selected.length);
  for (const name of selected) {
    // Force riff, select a middle length/start, and decline any eligible chord.
    const pattern = generateRhythmPattern(fishNamed(name), sequence([0, .5, .5, .99]));
    assert.ok(pattern.riff, `${name} produced a riff`);
    assert.ok(pattern.riff.length >= 3 && pattern.riff.length <= 6);
    const riffNotes = pattern.notes.filter((note) => note.riff);
    assert.equal(riffNotes.length, pattern.riff.length);
    assert.ok(riffNotes.every((note) => note.duration === 0 && !note.fourLaneChord));
    const groups = Object.groupBy(riffNotes, (note) => note.groupIndex);
    assert.ok(Object.values(groups).every((notes) => notes.length === 1));
    for (let index = 1; index < riffNotes.length; index += 1) {
      const separation = riffNotes[index].hitTime - riffNotes[index - 1].hitTime;
      assert.ok(separation >= .27 && separation <= .48, `${name} riff subdivision is playable eighth-note territory`);
    }
  }
  assert.equal(generateRhythmPattern(fishNamed('Bluegill'), () => 0).riff, null);
});

test('eligible high-rarity songs can contain one isolated all-lane chord', () => {
  assert.deepEqual(Object.keys(FOUR_LANE_CHORD_PROFILES).sort(), [
    'american_alligator', 'electric_eel', 'great_white_shark', 'mantis_shrimp',
    'peaklight_koi', 'polar_bear', 'swordfish', 'yellowfin_tuna'
  ]);
  const pattern = generateRhythmPattern(fishNamed('Swordfish'), sequence([.99, 0, .5]));
  assert.ok(pattern.fourLaneChord);
  const chord = pattern.notes.filter((note) => note.fourLaneChord);
  assert.equal(chord.length, 4);
  assert.deepEqual(chord.map((note) => note.lane).sort(), ['A', 'D', 'S', 'W']);
  assert.ok(chord.every((note) => note.duration === 0 && !note.riff));
  assert.equal(new Set(chord.map((note) => note.hitTime)).size, 1);
  const groups = [...new Set(pattern.notes.map((note) => note.hitTime))].sort((a, b) => a - b);
  const index = groups.indexOf(chord[0].hitTime);
  assert.ok(chord[0].hitTime - groups[index - 1] >= .62);
  assert.ok(groups[index + 1] - chord[0].hitTime >= .62);
});

test('core rest terraces are terrain-owned at 500 and 600 ft', () => {
  for (const ledge of [MOUNTAIN_REST_LEDGE_CONFIG.fiveHundred, MOUNTAIN_REST_LEDGE_CONFIG.sixHundred]) {
    assert.equal(ledge.coreTerrain, true);
    assert.ok(Math.abs(applyCoreRestTerraces(ledge.angle, ledge.radius, ledge.targetHeight + 25)
      - ledge.targetHeight) < .001);
    assert.ok(ledge.depth >= 5.4);
  }
});

test('partial-foot stamina support accepts modest ledges but rejects side/airborne motion states', () => {
  const resting = {
    movementState: 'grounded', actualSpeed: .04, hasMoveInput: false,
    sprintHeld: false, slideHeld: false, gripHeld: false,
    slidingDownSlope: false, slideRecoveryActive: false
  };
  assert.equal(isPartialFootRestEligible({ partial: true }, resting), true);
  assert.equal(isPartialFootRestEligible({ partial: false }, resting), false);
  assert.equal(isPartialFootRestEligible({ partial: true }, { ...resting, movementState: 'climbing' }), false);
  assert.equal(isPartialFootRestEligible({ partial: true }, { ...resting, slidingDownSlope: true }), false);
  assert.equal(isPartialFootRestEligible({ partial: true }, { ...resting, actualSpeed: .5 }), false);
});

test('caves, map, bench, emote UI, and fishing exit have explicit continuation contracts', async () => {
  const [html, mountain, player, fishing, styles] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/player/player.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/fishing/fishing.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.equal(CAVE_TOPOLOGY_CONFIG.enclosed, true);
  assert.equal(CAVE_TOPOLOGY_CONFIG.exteriorTrench, false);
  assert.match(mountain, /visibleTriangles = triangles\.filter/);
  assert.match(mountain, /interior floor[\s\S]*interior roof[\s\S]*rear chamber/);
  assert.doesNotMatch(mountain, /entrance lintel|entrance .* jamb/);
  assert.match(mountain, /buildSummitBench/);
  assert.match(html, /data-inventory-map>TRAIL MAP/);
  assert.match(html, /id="mountain-map"/);
  assert.match(html, /data-emote-id="wave"/);
  assert.match(styles, /\.mountain-map-graphic/);
  assert.match(player, /exitFishing\(options = \{\}\)/);
  assert.match(player, /this\.input\.consumeCancel\(\)[\s\S]{0,650}this\.exitFishing/);
  assert.match(fishing, /cancel\(\)[\s\S]{0,900}endRhythmCapture/);
});

test('emotes remain additive protocol-v1 snapshot state and are server validated', () => {
  const message = createPlayerSnapshot('player-test', {
    position: { x: 1, y: 2, z: 3 }, yaw: 45, movement: 'grounded',
    emote: { id: 'wave', startedAt: 1234 }
  }, 1);
  assert.equal(message.protocolVersion, 1);
  assert.equal(message.payload.emote.id, 'wave');
  const session = { playerId: 'player-test', lastSequence: 0, lastSnapshot: null };
  const accepted = validateSnapshot(message.payload, session, 2000);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.snapshot.emote, { id: 'wave', startedAt: 1234 });
  const rejectedEmote = validateSnapshot({ ...message.payload, sequence: 2, emote: { id: 'teleport' } }, session, 2000);
  assert.equal(rejectedEmote.ok, true);
  assert.equal(rejectedEmote.snapshot.emote, null);
});
