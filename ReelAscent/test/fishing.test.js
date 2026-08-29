import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseWeightedSpecies, createCatchRecord, createFishSpecimen, createFishSpecimenForCategories,
  FISH_SONG_TEMPO_MULTIPLIER, FISH_SPECIES, getFishDisplayMetrics, getWeightedSpeciesTable, rollFish
} from '../src/fishing/fish-data.js';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import {
  createFishingPerformanceSnapshot, FISHING_PERFORMANCE_HISTORY_LIMIT, FishingPerformanceHistory
} from '../src/fishing/fishing-performance.js';
import {
  generateRhythmPattern, gradeRhythmPerformance, RHYTHM_SCALE_DEGREES, RhythmSession,
  SHINY_LANE_MIRROR, validateThreeNoteChordRule
} from '../src/fishing/rhythm-session.js';

function sequence(values, fallback = 0.5) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

function seededRandom(seed = 123456789) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const allFishIds = FISH_SPECIES.map((fish) => fish.id);

function hitPatternNote(session, note) {
  session.handleInput(note.lane, note.hitTime);
  if (note.status === 'holding') session.completeHold(note, note.hitTime + note.duration);
}

test('fishing zones use explicit water geometry without any water-death API', () => {
  const shallowZone = new FishingZone({
    id: 'test-pond',
    label: 'Test Pond',
    center: { x: 10, z: -5 },
    radii: { x: 6, z: 4 },
    surfaceY: 0.1,
    fishIds: ['bluegill'],
    exclusions: [{ x: 10, z: -2, width: 2, depth: 3 }]
  });

  assert.equal(shallowZone.contains({ x: 10, z: -5 }), true);
  assert.equal(shallowZone.contains({ x: 10, z: -2 }), false);
  assert.equal(shallowZone.contains({ x: 17, z: -5 }), false);
  assert.ok(shallowZone.distanceToWater({ x: 17, z: -5 }) > 0);
  const clamped = shallowZone.clampToWater({ x: 30, z: -5 }, 0.5);
  assert.ok(shallowZone.contains(clamped));
  assert.equal(clamped.y, 0.1);
  assert.equal(typeof shallowZone.isDeepWater, 'undefined');
  assert.equal(shallowZone.canCastFrom({ x: 17, y: 1, z: -5 }, 2), true);
  assert.equal(shallowZone.canCastFrom({ x: 30, y: 1, z: -5 }, 2), false);

  const deepZone = new FishingZone({
    id: 'deep-lake', label: 'Deep Lake', center: { x: 0, z: 0 },
    radii: { x: 10, z: 8 }, surfaceY: .1, fishIds: ['bluegill'], depth: 'deep'
  });
  assert.equal(deepZone.contains({ x: 0, z: 0 }), true);
  assert.equal(typeof deepZone.isDeepWater, 'undefined');

  const ocean = new FishingZone({
    id: 'ocean', label: 'Ocean', center: { x: 10, z: 10 }, shape: 'annulus',
    innerRadius: 20, outerRadius: 45, surfaceY: 0,
    fishIds: ['sardine'], depth: 'deep'
  });
  assert.equal(ocean.contains({ x: 10, z: 10 }), false, 'annulus must exclude its inland center');
  assert.equal(ocean.contains({ x: 40, z: 10 }), true);
  assert.ok(Math.abs(ocean.distanceToWater({ x: 25, z: 10 }) - 1.8) < 1e-9,
    'cast distance follows the rendered shoreline overlap, not the offshore ecology boundary');
  assert.equal(typeof ocean.isDeepWater, 'undefined');
  assert.ok(ocean.containsWaterFootprint(ocean.clampToWater({ x: 10, z: 10 })));
});

test('weighted species selection reaches every configured rarity tier', () => {
  const completeTable = getWeightedSpeciesTable(allFishIds);
  assert.equal(chooseWeightedSpecies(allFishIds, () => 0).id, completeTable[0].fish.id);
  assert.equal(chooseWeightedSpecies(allFishIds, () => 0.999999).id, completeTable.at(-1).fish.id);

  const table = getWeightedSpeciesTable(allFishIds, { rarityBias: .5 });
  assert.equal(table.length, FISH_SPECIES.length);
  assert.ok(table.every((entry) => entry.probability > 0));

  const rng = seededRandom(42);
  const rarities = new Set();
  for (let index = 0; index < 30000; index += 1) {
    const fish = rollFish(allFishIds, {}, rng);
    rarities.add(fish.rarity);
  }
  assert.deepEqual([...rarities].sort(), ['Common', 'Legendary', 'Rare', 'Uncommon']);
});

test('version 6.8 roster has 280 stable complete records and every base song is about 15 percent slower', () => {
  assert.equal(FISH_SPECIES.length, 280);
  assert.equal(new Set(FISH_SPECIES.map((fish) => fish.id)).size, 280);
  assert.deepEqual(
    Object.fromEntries(Object.entries(Object.groupBy(FISH_SPECIES, (fish) => fish.rarity)).map(([rarity, fish]) => [rarity, fish.length])),
    { Common: 70, Uncommon: 70, Rare: 70, Legendary: 70 }
  );
  for (const fish of FISH_SPECIES) {
    assert.ok(fish.name && fish.flavor && fish.visual && fish.habitat);
    assert.equal(fish.rhythm.tempoMultiplier, FISH_SONG_TEMPO_MULTIPLIER);
    fish.rhythm.bpm.forEach((bpm, index) => {
      assert.ok(Math.abs(bpm - fish.rhythm.authoredBpm[index] * .85) <= .6);
    });
    assert.deepEqual(validateThreeNoteChordRule(fish), [], fish.id);
  }
});

test('fish sizes favor ordinary catches but still produce trophy catches', () => {
  const ordinary = createFishSpecimen('bluegill', .5, false, () => .5);
  const trophy = createFishSpecimen('bluegill', 1.3, false, () => .5);

  assert.equal(ordinary.sizeLabel, 'Average');
  assert.equal(trophy.sizeLabel, 'Massive');
  assert.ok(trophy.length > ordinary.length);
  assert.ok(trophy.weight > ordinary.weight);
});

test('fish size population has visible tails and correlated length/weight categories', () => {
  const rng = seededRandom(4219);
  const counts = { Tiny: 0, Small: 0, Average: 0, Large: 0, Massive: 0 };
  let exactCategoryMatches = 0;
  for (let index = 0; index < 30000; index += 1) {
    const fish = rollFish(['bluegill'], {}, rng);
    counts[fish.sizeCategory] += 1;
    assert.ok(Math.abs(fish.sizeCategoryIndex - fish.lengthCategoryIndex) <= 1);
    if (fish.sizeCategoryIndex === fish.lengthCategoryIndex) exactCategoryMatches += 1;
  }
  assert.ok(exactCategoryMatches / 30000 > .9);
  const ratio = (label) => counts[label] / 30000;
  assert.ok(ratio('Tiny') >= .12 && ratio('Tiny') <= .15);
  assert.ok(ratio('Small') >= .22 && ratio('Small') <= .25);
  assert.ok(ratio('Average') >= .25 && ratio('Average') <= .3);
  assert.ok(ratio('Large') >= .2 && ratio('Large') <= .23);
  assert.ok(ratio('Massive') >= .1 && ratio('Massive') <= .15);
});

test('held-fish scale starts from the generated inch measurement in world meters', () => {
  const oneFoot = { length: 12, weight: 1, expectedWeight: 1 };
  const twoFeet = { length: 24, weight: 1, expectedWeight: 1 };
  assert.ok(Math.abs(getFishDisplayMetrics(oneFoot).displayedLength - 12 * .0254 * 1.18) < .0001);
  assert.ok(Math.abs(getFishDisplayMetrics(twoFeet).displayedLength
    / getFishDisplayMetrics(oneFoot).displayedLength - 2) < .0001);
});

test('species rhythm patterns stay inside their data-driven input and BPM ranges', () => {
  const groupBounds = {
    Common: [5, 9], Uncommon: [8, 14], Rare: [11, 20], Legendary: [16, 28]
  };
  for (const fish of FISH_SPECIES) {
    assert.equal(fish.rhythm.motifs.length, 1);
    assert.ok(fish.rhythm.instrument);
    for (let sample = 0; sample < 20; sample += 1) {
      const specimen = createFishSpecimenForCategories(fish, 2, 2, false, () => .5);
      const pattern = generateRhythmPattern(specimen, seededRandom(sample + fish.name.length));
      const baseline = (fish.rhythm.bpm[0] + fish.rhythm.bpm[1]) * .5 + 20;
      const groupCount = new Set(pattern.notes.map((note) => note.groupIndex)).size;
      assert.ok(Math.abs(pattern.bpm - baseline) <= 2);
      assert.ok(groupCount >= groupBounds[fish.rarity][0] && groupCount <= groupBounds[fish.rarity][1]);
      assert.ok(pattern.notes.length >= groupCount && pattern.notes.length <= groupCount * 4);
      assert.ok(pattern.notes.every((note) => ['A', 'W', 'S', 'D'].includes(note.lane)));
    }
  }
  const easySession = new RhythmSession(FISH_SPECIES.find((fish) => fish.id === 'bluegill'), 0, seededRandom(1));
  const hardSession = new RhythmSession(FISH_SPECIES.find((fish) => fish.id === 'channel-catfish'), 0, seededRandom(1));
  assert.ok(easySession.goodWindow > hardSession.goodWindow);
});

test('species songs have distinct deterministic direction and sustain signatures', () => {
  const signatures = FISH_SPECIES.map((fish) => fish.rhythm.motifs[0].replace(/[12]/g, ''));
  assert.equal(new Set(signatures).size, FISH_SPECIES.length);
});

test('rarity adaptation, specimen tempo, and holds remain data-driven', () => {
  const groupBounds = {
    Common: [5, 9], Uncommon: [8, 14], Rare: [11, 20], Legendary: [16, 28]
  };
  for (const fish of FISH_SPECIES) {
    const specimen = createFishSpecimenForCategories(fish, 2, 2, false, () => .5);
    const pattern = generateRhythmPattern(specimen, seededRandom(91));
    const groupCount = new Set(pattern.notes.map((note) => note.groupIndex)).size;
    const baseline = (fish.rhythm.bpm[0] + fish.rhythm.bpm[1]) * .5 + 20;
    assert.ok(groupCount >= groupBounds[fish.rarity][0] && groupCount <= groupBounds[fish.rarity][1]);
    assert.ok(Math.abs(pattern.bpm - baseline) <= 2);
  }
  const common = generateRhythmPattern(createFishSpecimen('bluegill', .5, false, () => .5), seededRandom(4));
  const legendary = generateRhythmPattern(createFishSpecimen('channel-catfish', .5, false, () => .5), seededRandom(4));
  assert.ok(legendary.notes.length > common.notes.length);
  assert.ok(legendary.notes.some((note) => note.duration > 0));
});

test('shiny performances mirror authored direction and pitch lanes without changing rhythm', () => {
  assert.deepEqual(RHYTHM_SCALE_DEGREES, {
    A: [1, 2], W: [3, 4], S: [5, 6], D: [7, 8]
  });
  const species = FISH_SPECIES.find((fish) => fish.id === 'rainbow-trout');
  const normal = createFishSpecimen(species, .5, false, () => .5);
  const shiny = createFishSpecimen(species, .5, true, () => .5);
  const normalPattern = generateRhythmPattern(normal, seededRandom(23));
  const shinyPattern = generateRhythmPattern(shiny, seededRandom(23));
  assert.equal(normalPattern.motifIndex, shinyPattern.motifIndex);
  assert.equal(normalPattern.bpm, shinyPattern.bpm);
  assert.equal(normalPattern.instrument, shinyPattern.instrument);
  assert.deepEqual(shinyPattern.notes.map((note) => note.lane), normalPattern.notes.map((note) => SHINY_LANE_MIRROR[note.lane]));
  assert.deepEqual(shinyPattern.notes.map((note) => note.hitTime), normalPattern.notes.map((note) => note.hitTime));
});

test('shiny fish escape on their first miss but can be caught with a clean full song', () => {
  const shiny = createFishSpecimen('bluegill', .5, true, () => .5);
  const failed = new RhythmSession(shiny, 0, seededRandom(2));
  failed.missNote(failed.pattern.notes[0]);
  assert.equal(failed.result, 'escaped');
  assert.equal(failed.escapeProgress, 1);

  const clean = new RhythmSession(shiny, 0, seededRandom(2));
  for (const note of clean.pattern.notes) {
    clean.handleInput(note.lane, note.hitTime);
    if (note.status === 'holding') clean.completeHold(note, note.hitTime + note.duration);
  }
  clean.resolveOutcome();
  assert.equal(clean.result, 'caught');
  assert.equal(clean.misses, 0);
});

test('F6 rhythm diagnostics retain every press with chart and judgment details', () => {
  const session = new RhythmSession(createFishSpecimen('bluegill', .5, false, () => .5), 0, seededRandom(3));
  const note = session.pattern.notes[0];
  session.handleInput(note.lane, note.hitTime + .02);
  session.handleInput('D', note.hitTime + 8);
  const debug = session.getDebugState();
  assert.equal(debug.inputLog.length, 2);
  assert.deepEqual(Object.keys(debug.inputLog[0]).sort(), [
    'correct', 'counted', 'expectedHitTime', 'expectedLanes', 'inputTime', 'judgment',
    'lane', 'mistake', 'reason', 'serial', 'signedMs', 'targetNoteId'
  ]);
  assert.equal(debug.inputLog[0].counted, true);
  assert.equal(debug.inputLog[1].mistake, true);
});

test('GOOD, GREAT, and PERFECT grades are reachable from existing judgments', () => {
  assert.equal(gradeRhythmPerformance({ misses: 1, successfulNotes: 10, perfectNotes: 4 }), 'GOOD');
  assert.equal(gradeRhythmPerformance({ misses: 0, successfulNotes: 10, perfectNotes: 5 }), 'GREAT');
  assert.equal(gradeRhythmPerformance({ misses: 1, successfulNotes: 10, perfectNotes: 7 }), 'GREAT');
  assert.equal(gradeRhythmPerformance({ misses: 0, successfulNotes: 10, perfectNotes: 8 }), 'PERFECT');
});

test('catch records retain quality and elevation for collection systems', () => {
  const specimen = createFishSpecimen('rainbow-trout', .6, false, () => .5);
  const record = createCatchRecord(specimen, {
    id: 'test-water', label: 'Test Water', surfaceY: 52.1
  }, 'GREAT', 1234);
  assert.equal(record.quality, 'GREAT');
  assert.equal(record.location, 'test-water');
  assert.equal(record.caughtAt, 1234);
  assert.equal(record.elevation, 52.1);
});

test('species size models change proportions and permit extreme trophy outliers', () => {
  const bluegill = createFishSpecimen('bluegill', .5, false, () => .5);
  const trout = createFishSpecimen('rainbow-trout', .5, false, () => .5);
  const catfish = createFishSpecimen('channel-catfish', .5, false, () => .5);
  assert.notEqual(bluegill.visual.lengthScale, trout.visual.lengthScale);
  assert.notEqual(bluegill.visual.depth, catfish.visual.depth);
  assert.notEqual(trout.sizeModel.lengthWeightExponent, catfish.sizeModel.lengthWeightExponent);

  const extreme = createFishSpecimen('largemouth-bass', 1.5, false, () => .5);
  assert.equal(extreme.sizeLabel, 'Massive');
  assert.equal(extreme.lengthCategory, 'Extremely Long');
  assert.ok(extreme.length > FISH_SPECIES.find((fish) => fish.id === 'largemouth-bass').maxLength);
  assert.ok(extreme.weight > FISH_SPECIES.find((fish) => fish.id === 'largemouth-bass').maxWeight);
});

test('high-zone rarity bias increases Rare and Legendary selection while preserving common water', () => {
  const lowRng = seededRandom(735);
  const highRng = seededRandom(735);
  let lowRare = 0;
  let highRare = 0;
  for (let index = 0; index < 6000; index += 1) {
    if (['Rare', 'Legendary'].includes(chooseWeightedSpecies(allFishIds, lowRng, { rarityBias: 0 }).rarity)) lowRare += 1;
    if (['Rare', 'Legendary'].includes(chooseWeightedSpecies(allFishIds, highRng, { rarityBias: 1 }).rarity)) highRare += 1;
  }
  assert.ok(highRare > lowRare * 1.7);
  assert.ok(lowRare > 0);
});

test('specimen traits only make bounded performance adjustments', () => {
  const species = FISH_SPECIES.find((fish) => fish.id === 'common-carp');
  const small = { ...createFishSpecimen(species, .1, false, () => .5), condition: .84 };
  const large = { ...createFishSpecimen(species, .95, false, () => .5), condition: 1.16 };
  const smallPattern = generateRhythmPattern(small, seededRandom(11));
  const largePattern = generateRhythmPattern(large, seededRandom(11));
  const baseline = (species.rhythm.bpm[0] + species.rhythm.bpm[1]) * .5 + 20;
  assert.equal(smallPattern.motifIndex, largePattern.motifIndex);
  assert.ok(smallPattern.bpm >= baseline * .8 && smallPattern.bpm <= baseline * 1.22);
  assert.ok(largePattern.bpm >= baseline * .8 && largePattern.bpm <= baseline * 1.22);
  assert.ok(largePattern.bpm > smallPattern.bpm);
  assert.notEqual(smallPattern.notes.find((note) => note.duration)?.duration, largePattern.notes.find((note) => note.duration)?.duration);
});

test('every song has exactly one spare event and one miss remains recoverable', () => {
  for (const fish of FISH_SPECIES) {
    const session = new RhythmSession(createFishSpecimen(fish, .5, false, () => .5), 0, seededRandom(7));
    assert.equal(session.pattern.totalEvents, session.pattern.requiredHits + 1);
  }
  const fish = createFishSpecimen(FISH_SPECIES[0], .5, false, () => .5);
  const recovered = new RhythmSession(fish, 0, seededRandom(4));
  recovered.missNote(recovered.pattern.notes[0]);
  for (const note of recovered.pattern.notes.slice(1)) hitPatternNote(recovered, note);
  recovered.resolveOutcome();
  assert.equal(recovered.result, 'caught');

  const escaped = new RhythmSession(fish, 0, seededRandom(4));
  escaped.missNote(escaped.pattern.notes[0], undefined, 0);
  escaped.missNote(escaped.pattern.notes[1], undefined, .6);
  escaped.resolveOutcome();
  assert.equal(escaped.result, 'escaped');
});

test('a fish cannot be caught before the final song event is judged', () => {
  const fish = {
    rhythm: {
      bpm: [92, 92], inputs: [6, 6], holdChance: 0,
      motifs: ['A S W D A S'], instrument: 'wood', root: 55
    }
  };
  const session = new RhythmSession(fish, 0, seededRandom(9));
  for (const note of session.pattern.notes.slice(0, -1)) {
    hitPatternNote(session, note);
  }
  assert.equal(session.successfulNotes, session.pattern.requiredHits);
  assert.equal(session.result, null);
  const finalNote = session.pattern.notes.at(-1);
  hitPatternNote(session, finalNote);
  assert.equal(session.result, 'caught');
  assert.equal(session.perfectPerformance, true);
});

test('accurate rhythm inputs catch a fish', () => {
  const fish = {
    rhythm: {
      bpm: [92, 92], duration: [5, 5], inputs: [6, 6], density: 0.7,
      complexity: 0.35, burstChance: 0, holdChance: 0, escapeTolerance: 4
    }
  };
  const startTime = 100;
  const session = new RhythmSession(fish, startTime, seededRandom(17));
  let noteIndex = 0;
  let result = null;
  const heldUntil = new Map();
  for (let step = 1; step < 2400 && !result; step += 1) {
    const now = startTime + step / 120;
    const inputs = [];
    while (session.pattern.notes[noteIndex]
      && now >= startTime + session.pattern.notes[noteIndex].hitTime) {
      const note = session.pattern.notes[noteIndex];
      inputs.push({ lane: note.lane, time: startTime + note.hitTime });
      if (note.duration > 0) heldUntil.set(note.lane, startTime + note.hitTime + note.duration);
      noteIndex += 1;
    }
    result = session.update(now, inputs, (lane) => (heldUntil.get(lane) ?? -Infinity) >= now);
  }

  assert.equal(result, 'caught');
  assert.equal(session.misses, 0);
  assert.equal(session.progress, 1);
});

test('wrong rhythm inputs build escape pressure and lose the fish', () => {
  const fish = {
    rhythm: {
      bpm: [100, 100], duration: [6, 6], inputs: [8, 8], density: 0.8,
      complexity: 0.5, burstChance: 0, holdChance: 0, escapeTolerance: 1
    }
  };
  const session = new RhythmSession(fish, 20, seededRandom(4));
  let result = null;
  for (let step = 1; step <= 7 && !result; step += 1) {
    const now = 20 + step * 0.1;
    result = session.update(now, [{ lane: 'A', time: now }]);
  }

  assert.equal(result, 'escaped');
  assert.equal(session.progress, 0);
});

test('long tab gaps pause the rhythm clock instead of skipping notes', () => {
  const fish = {
    rhythm: {
      bpm: [90, 90], duration: [5, 5], inputs: [5, 5], density: 0.7,
      complexity: 0.2, burstChance: 0, holdChance: 0, escapeTolerance: 4
    }
  };
  const session = new RhythmSession(fish, 50, seededRandom(2));
  session.update(50.1);
  session.update(55.1);
  assert.ok(Math.abs(session.songTime - 0.1) < 0.0001);
  assert.equal(session.misses, 0);
});

test('releasing a hold note early counts as a miss', () => {
  const fish = {
    rhythm: {
      bpm: [80, 80], duration: [3, 3], inputs: [1, 1], density: 0.7,
      complexity: 0, burstChance: 0, holdChance: 1, escapeTolerance: 4
    }
  };
  const session = new RhythmSession(fish, 10, () => 0.5);
  const note = session.pattern.notes[0];
  for (let now = 10 + 1 / 120; now < 10 + note.hitTime; now += 1 / 120) {
    session.update(now);
  }
  session.update(10 + note.hitTime, [{ lane: note.lane, time: 10 + note.hitTime }], () => true);
  session.update(10 + note.hitTime + 0.12, [], () => false);
  assert.equal(session.misses, 1);
  assert.equal(note.status, 'missed');
});

test('hold notes use rarity forgiveness and auto-complete at the visible endpoint', () => {
  const makeFish = (rarity) => ({
    rarity,
    rhythm: {
      bpm: [80, 80], inputs: [1, 1], holdChance: 1,
      motifs: ['A~~~'], instrument: 'wood', root: 55, timingTolerance: 1
    }
  });
  const strike = (session, start, note) => {
    for (let now = start + 1 / 120; now < start + note.hitTime; now += 1 / 120) session.update(now);
    session.update(start + note.hitTime, [{ lane: note.lane, time: start + note.hitTime }], () => true);
  };
  const releaseAt = (session, start, note, fraction) => {
    const releaseTime = start + note.hitTime + note.duration * fraction;
    for (let now = start + note.hitTime + 1 / 120; now < releaseTime; now += 1 / 120) {
      session.update(now, [], () => true);
    }
    session.update(releaseTime, [], () => false);
  };

  const common = new RhythmSession(makeFish('Common'), 10, () => .5);
  const commonNote = common.pattern.notes[0];
  strike(common, 10, commonNote);
  releaseAt(common, 10, commonNote, .46);
  assert.equal(commonNote.status, 'hit');

  const legendary = new RhythmSession(makeFish('Legendary'), 20, () => .5);
  const legendaryNote = legendary.pattern.notes[0];
  strike(legendary, 20, legendaryNote);
  releaseAt(legendary, 20, legendaryNote, .6);
  assert.equal(legendaryNote.status, 'missed');

  const heldLate = new RhythmSession(makeFish('Rare'), 30, () => .5);
  const heldLateNote = heldLate.pattern.notes[0];
  strike(heldLate, 30, heldLateNote);
  for (let now = 30 + heldLateNote.hitTime + 1 / 120;
    now <= 30 + heldLateNote.hitTime + heldLateNote.duration + .05; now += 1 / 120) {
    heldLate.update(now, [], () => true);
  }
  assert.equal(heldLateNote.status, 'hit');
  assert.equal(heldLate.misses, 0);
});

test('rhythm telemetry records every press edge and explains timing, wrong lanes, misses, and holds', () => {
  const fish = createFishSpecimen('common-carp', .5, false, () => .5);
  const session = new RhythmSession(fish, 10, () => .5);
  const first = session.pattern.notes[0];
  session.handleInput(first.lane, first.hitTime);
  const feedback = session.consumeInputFeedbackEvents();
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0].lane, first.lane);
  assert.equal(feedback[0].signedMs, 0);

  const pending = session.pattern.notes.find((note) => note.status === 'pending');
  const wrongLane = ['A', 'W', 'S', 'D'].find((lane) => lane !== pending.lane);
  session.handleInput(wrongLane, pending.hitTime);
  assert.match(session.mistakeLog.join('\n'), /WRONG LANE/);
  const debug = session.getDebugState();
  assert.equal(debug.eventTotal, session.pattern.totalEvents);
  assert.ok(Array.isArray(debug.activeHolds));
  assert.ok(Number.isFinite(debug.streak));
});

test('performance snapshots explain clean timing, mistakes, holds, chords, and shiny losses', () => {
  const makeDiagnosticFish = (motif, rarity = 'Rare', shiny = false) => ({
    id: 'diagnostic-fish', speciesId: 'diagnostic-fish', name: 'Diagnostic Fish', rarity, shiny,
    length: 14.2, weight: 2.4, sizeLabel: 'Average', lengthCategory: 'Typical',
    rhythm: {
      bpm: [92, 92], authoredBpm: [108, 108], sourceAuthoredBpm: [127, 127],
      inputs: [8, 8], motifs: [motif], instrument: 'wood', root: 55, timingTolerance: 1
    }
  });
  const context = {
    id: 'fight-test', sequence: 1, result: 'active',
    location: { id: 'test-water', label: 'Test Water', habitat: 'upper / tarn', theme: 'frost' }
  };

  const clean = new RhythmSession(makeDiagnosticFish('A W S D A W S D'), 0, () => .5);
  clean.pattern.notes.forEach((note, index) => clean.handleInput(note.lane, note.hitTime + (index % 2 ? .03 : -.025)));
  const cleanSnapshot = createFishingPerformanceSnapshot(clean, { ...context, result: 'caught', catchQuality: clean.quality });
  assert.equal(cleanSnapshot.result, 'caught');
  assert.equal(cleanSnapshot.inputLog.length, clean.pattern.notes.length);
  assert.ok(cleanSnapshot.inputLog.some((input) => input.signedMs < 0));
  assert.ok(cleanSnapshot.inputLog.some((input) => input.signedMs > 0));
  assert.equal(cleanSnapshot.summary.misses, 0);
  assert.equal(cleanSnapshot.location.theme, 'frost');

  const mistakes = new RhythmSession(makeDiagnosticFish('A W S D A W S D'), 0, () => .5);
  const first = mistakes.pattern.notes[0];
  const wrongLane = ['A', 'W', 'S', 'D'].find((lane) => lane !== first.lane);
  mistakes.handleInput(wrongLane, first.hitTime);
  mistakes.handleInput('D', 0);
  const timeout = mistakes.pattern.notes.find((note) => note.status === 'pending');
  mistakes.missNote(timeout, timeout.lane, timeout.hitTime + mistakes.goodWindow, 'timeout');
  const mistakeSnapshot = createFishingPerformanceSnapshot(mistakes, context);
  assert.equal(mistakeSnapshot.summary.wrongLanePresses, 1);
  assert.equal(mistakeSnapshot.summary.offBeatPresses, 1);
  assert.ok(mistakeSnapshot.mistakes.some((entry) => entry.type === 'timeout'));
  assert.ok(mistakeSnapshot.events.some((event) => event.judgment === 'WRONG LANE'));

  const hold = new RhythmSession(makeDiagnosticFish('A~~~ -- S W D A W S D', 'Legendary'), 0, () => .5);
  const holdNote = hold.pattern.notes[0];
  hold.handleInput(holdNote.lane, holdNote.hitTime);
  const releaseTime = holdNote.hitTime + holdNote.duration * .3;
  hold.missNote(holdNote, holdNote.lane, releaseTime, 'hold-release');
  const holdSnapshot = createFishingPerformanceSnapshot(hold, context);
  assert.equal(holdSnapshot.summary.earlyHoldReleases, 1);
  assert.equal(holdSnapshot.events[0].judgment, 'EARLY RELEASE');
  assert.ok(holdSnapshot.events[0].notes[0].holdCompletionFraction < holdSnapshot.events[0].notes[0].holdRequiredFraction);

  const chord = new RhythmSession(makeDiagnosticFish('A+W -- S D A W S D', 'Rare'), 0, () => .5);
  const chordGroup = chord.expectedGroup(chord.pattern.notes[0].hitTime);
  chord.handleInput(chordGroup[0].lane, chordGroup[0].hitTime);
  chord.missNote(chordGroup[1], chordGroup[1].lane, chordGroup[1].hitTime + chord.goodWindow, 'timeout');
  const chordSnapshot = createFishingPerformanceSnapshot(chord, context);
  assert.equal(chordSnapshot.events[0].isChord, true);
  assert.equal(chordSnapshot.events[0].judgment, 'CHORD PARTIAL');
  assert.equal(chordSnapshot.events[0].expectedLanes.length, 2);

  const escaped = new RhythmSession(makeDiagnosticFish('A W S D A W S D'), 0, () => .5);
  escaped.missNote(escaped.pattern.notes[0], undefined, .1);
  escaped.missNote(escaped.pattern.notes[1], undefined, .7);
  escaped.resolveOutcome();
  assert.equal(createFishingPerformanceSnapshot(escaped, { ...context, result: 'escaped' }).result, 'escaped');

  const shiny = new RhythmSession(makeDiagnosticFish('A W S D A W S D', 'Rare', true), 0, () => .5);
  shiny.missNote(shiny.pattern.notes[0]);
  shiny.resolveOutcome();
  const shinySnapshot = createFishingPerformanceSnapshot(shiny, { ...context, result: 'escaped' });
  assert.equal(shinySnapshot.fish.shiny, true);
  assert.equal(shinySnapshot.summary.escapeProgress, 1);
});

test('performance history retains eight independent newest-first session snapshots', () => {
  const fish = createFishSpecimen('bluegill', .5, false, () => .5);
  const session = new RhythmSession(fish, 0, () => .5);
  for (const note of session.pattern.notes) session.handleInput(note.lane, note.hitTime);
  const base = createFishingPerformanceSnapshot(session, { id: 'fight-0', sequence: 0, result: 'caught' });
  const history = new FishingPerformanceHistory();
  for (let index = 1; index <= 9; index += 1) {
    const source = { ...base, id: `fight-${index}`, sequence: index, fish: { ...base.fish, name: `Fish ${index}` } };
    history.add(source);
    source.fish.name = 'MUTATED SOURCE';
  }
  const snapshots = history.getSnapshot();
  assert.equal(FISHING_PERFORMANCE_HISTORY_LIMIT, 8);
  assert.equal(snapshots.length, 8);
  assert.equal(snapshots[0].id, 'fight-9');
  assert.equal(snapshots.at(-1).id, 'fight-2');
  assert.equal(snapshots[0].fish.name, 'Fish 9');
  snapshots[0].fish.name = 'MUTATED COPY';
  assert.equal(history.getSnapshot()[0].fish.name, 'Fish 9');
});

test('performance snapshot keeps the complete raw input and mistake logs', () => {
  const fish = createFishSpecimen('channel-catfish', .5, false, () => .5);
  const session = new RhythmSession(fish, 0, () => .5);
  for (const note of session.pattern.notes) session.handleInput(note.lane, note.hitTime);
  for (let index = 0; index < 12; index += 1) session.logMistake(`synthetic diagnostic ${index}`, { type: 'test' });
  const snapshot = createFishingPerformanceSnapshot(session, { id: 'full-log', result: 'caught' });
  assert.ok(snapshot.inputLog.length > 10);
  assert.equal(snapshot.inputLog.length, session.pattern.notes.length);
  assert.equal(snapshot.mistakes.length, 12);
  assert.equal(session.mistakeLog.length, 10, 'legacy F3 summary remains intentionally bounded');
});
