import { CATCH_QUALITY_CONFIG, RHYTHM_CONFIG } from '../config.js';

// Four input lanes, eight musical scale degrees. Each arrow owns two neighboring
// degrees of an 8-note diatonic scale so the minigame stays four-button while the
// recorded instrument songs can actually form melodies.
export const RHYTHM_LANES = Object.freeze(['A', 'S', 'W', 'D']);
export const RHYTHM_SCALE_DEGREES = Object.freeze({
  A: Object.freeze([1, 2]), // left
  W: Object.freeze([3, 4]), // up
  S: Object.freeze([5, 6]), // down
  D: Object.freeze([7, 8])  // right
});
export const RHYTHM_SCALE_SEMITONES = Object.freeze([0, 2, 4, 5, 7, 9, 11, 12]);
export const SHINY_LANE_MIRROR = Object.freeze({ A: 'D', D: 'A', W: 'S', S: 'W' });

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const between = (range, rng) => range[0] + (range[1] - range[0]) * rng();

// Extra late/early forgiveness for actually striking a note. This is separate from
// inter-note spacing: it widens the successful hit window without changing BPM,
// note spacing, hold duration, or the stricter PERFECT timing window.
const GOOD_WINDOW_BONUS_BY_RARITY = Object.freeze({
  // Common/Uncommon are intentionally generous. This widens only the successful
  // strike window; PERFECT remains unchanged and specimen BPM still works normally.
  Common: .055,
  Uncommon: .04,
  Rare: .015,
  Legendary: 0
});

export const RHYTHM_MINIMUM_ACTION_GAP_SECONDS = .08;

// Only these quick-moving species can receive a short tap riff. Riffs replace a small
// run of existing events rather than expanding the song and therefore preserve each
// species' authored melodic identity and overall difficulty envelope.
export const RHYTHM_RIFF_PROFILES = Object.freeze({
  rainbow_shiner: Object.freeze({ chance: .14, minimum: 3, maximum: 4, timingWindowScale: .58 }),
  mackerel: Object.freeze({ chance: .14, minimum: 3, maximum: 4, timingWindowScale: .58 }),
  great_barracuda: Object.freeze({ chance: .18, minimum: 3, maximum: 5, timingWindowScale: .6 }),
  piranha: Object.freeze({ chance: .16, minimum: 3, maximum: 4, timingWindowScale: .6 }),
  sailfish: Object.freeze({ chance: .2, minimum: 4, maximum: 5, timingWindowScale: .6 }),
  yellowfin_tuna: Object.freeze({ chance: .24, minimum: 4, maximum: 6, timingWindowScale: .68 }),
  swordfish: Object.freeze({ chance: .28, minimum: 4, maximum: 6, timingWindowScale: .68 })
});

// Four-lane chords are deliberately a different vocabulary from riffs. The tiny
// probabilities plus one-per-song cap make them a special Rare/Legendary flourish.
export const FOUR_LANE_CHORD_PROFILES = Object.freeze({
  electric_eel: .035,
  mantis_shrimp: .035,
  yellowfin_tuna: .035,
  american_alligator: .035,
  swordfish: .07,
  polar_bear: .07,
  great_white_shark: .07,
  peaklight_koi: .07
});

function speciesKey(fish) {
  return String(fish.canonicalId ?? fish.speciesId ?? fish.id ?? '')
    .trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function groupRhythmEvents(events) {
  const groups = [];
  for (const event of [...events].sort((a, b) => a.groupIndex - b.groupIndex || a.stepIndex - b.stepIndex)) {
    const previous = groups.at(-1);
    if (previous && previous.groupIndex === event.groupIndex) previous.events.push(event);
    else groups.push({ groupIndex: event.groupIndex, stepIndex: event.stepIndex, events: [event] });
  }
  return groups;
}

export function applySpecialRhythmVocabulary(events, fish, rng = Math.random) {
  const key = speciesKey(fish);
  const groups = groupRhythmEvents(events);
  const riffProfile = RHYTHM_RIFF_PROFILES[key];
  let riff = null;

  if (riffProfile && groups.length >= riffProfile.minimum + 2 && rng() < riffProfile.chance) {
    const desiredLength = riffProfile.minimum
      + Math.floor(rng() * (riffProfile.maximum - riffProfile.minimum + 1));
    const length = Math.min(desiredLength, groups.length - 2);
    const start = 1 + Math.floor(rng() * Math.max(1, groups.length - length - 1));
    for (let index = start; index < start + length; index += 1) {
      const source = groups[index].events[0];
      groups[index].events = [{
        ...source,
        hold: false,
        holdLevel: 0,
        riff: true,
        timingWindowScale: riffProfile.timingWindowScale
      }];
    }
    riff = Object.freeze({ start, length, speciesId: key });
  }

  let fourLaneChord = null;
  const chordChance = FOUR_LANE_CHORD_PROFILES[key] ?? 0;
  if (['Rare', 'Legendary'].includes(fish.rarity) && chordChance > 0 && groups.length >= 7 && rng() < chordChance) {
    const candidates = groups
      .map((group, index) => ({ group, index }))
      .filter(({ group, index }) => index >= 2 && index <= groups.length - 3
        && !group.events.some((event) => event.riff || event.hold)
        && !groups[index - 1].events.some((event) => event.riff || event.hold)
        && !groups[index + 1].events.some((event) => event.riff || event.hold));
    if (candidates.length) {
      const selected = candidates[Math.floor(rng() * candidates.length)];
      const source = selected.group.events[0];
      selected.group.events = RHYTHM_LANES.map((lane, laneIndex) => ({
        ...source,
        lane,
        pitchSlot: (source.pitchSlot + laneIndex) % 2,
        degree: RHYTHM_SCALE_DEGREES[lane][(source.pitchSlot + laneIndex) % 2],
        hold: false,
        holdLevel: 0,
        riff: false,
        fourLaneChord: true
      }));
      fourLaneChord = Object.freeze({ groupIndex: selected.group.groupIndex, speciesId: key });
    }
  }

  return { events: groups.flatMap((group) => group.events), riff, fourLaneChord };
}

function effectiveGoodWindow(fish, config, successWindowMultiplier = 1) {
  return config.goodWindow
    * (fish.rhythm.timingTolerance ?? 1)
    * Math.max(.1, successWindowMultiplier)
    + (GOOD_WINDOW_BONUS_BY_RARITY[fish.rarity] ?? 0);
}

// Shift complete note groups rather than individual notes. Intentional chords must remain
// simultaneous; only the next group moves beyond an active hold/release window.
export function normalizeRequiredActionTimings(notes, goodWindow, minimumGap = RHYTHM_MINIMUM_ACTION_GAP_SECONDS) {
  const ordered = [...notes].sort((a, b) => a.hitTime - b.hitTime || a.id - b.id);
  const groups = [];
  for (const note of ordered) {
    const key = note.groupIndex ?? note.stepIndex ?? note.hitTime;
    const group = groups.at(-1);
    if (group && group.key === key) group.notes.push(note);
    else groups.push({ key, notes: [note] });
  }
  let previousActionEnd = -Infinity;
  let previousGroup = null;
  for (const [groupIndex, group] of groups.entries()) {
    const authoredHitTime = Math.min(...group.notes.map((note) => note.hitTime));
    const currentWindow = Math.max(...group.notes.map((note) => goodWindow * (note.timingWindowScale ?? 1)));
    const riffPair = previousGroup?.notes.every((note) => note.riff)
      && group.notes.every((note) => note.riff);
    const chordPair = previousGroup?.notes.some((note) => note.fourLaneChord)
      || group.notes.some((note) => note.fourLaneChord);
    const actionGap = riffPair ? .035 : chordPair ? .32 : minimumGap;
    const earliestHit = previousActionEnd + actionGap + currentWindow;
    const shiftedHitTime = Math.max(authoredHitTime, earliestHit);
    for (const note of group.notes) {
      note.authoredStepIndex = note.stepIndex;
      note.hitTime += shiftedHitTime - authoredHitTime;
      note.stepIndex = groupIndex;
      note.groupIndex = groupIndex;
    }
    previousActionEnd = Math.max(...group.notes.map((note) => (
      note.hitTime + Math.max(0, note.duration) + goodWindow * (note.timingWindowScale ?? 1)
    )));
    previousGroup = group;
  }
  return ordered;
}

function fallbackMotif(settings) {
  const count = Math.max(3, settings.inputs?.[0] ?? 5);
  return Array.from({ length: count }, (_, index) => `${RHYTHM_LANES[index % 4]}${settings.holdChance >= 1 ? '~' : ''}`).join(' ');
}

function adaptEventsForRarity(events, rarity) {
  const groups = [];
  for (const event of [...events].sort((a, b) => a.stepIndex - b.stepIndex)) {
    const last = groups.at(-1);
    if (last && last.stepIndex === event.stepIndex) last.events.push(event);
    else groups.push({ stepIndex: event.stepIndex, events: [event] });
  }

  const profile = ({
    Common: { factor: .88, minimum: 5, maximum: 9, chordEvery: 9, tripleEvery: Infinity, holdEvery: 8, maxHold: 1 },
    Uncommon: { factor: 1.16, minimum: 8, maximum: 14, chordEvery: 7, tripleEvery: Infinity, holdEvery: 6, maxHold: 1 },
    Rare: { factor: 1.48, minimum: 11, maximum: 20, chordEvery: 4, tripleEvery: Infinity, holdEvery: 4, maxHold: 2 },
    Legendary: { factor: 1.84, minimum: 16, maximum: 28, chordEvery: 3, tripleEvery: 9, holdEvery: 3, maxHold: 3 }
  })[rarity] ?? { factor: 1, minimum: groups.length, maximum: 20, chordEvery: 6, tripleEvery: Infinity, holdEvery: 5, maxHold: 2 };
  const targetCount = clamp(Math.round(groups.length * profile.factor), profile.minimum, profile.maximum);
  const adjusted = [];
  let stepCursor = 0;
  let previousSourceStep = groups[0]?.stepIndex ?? 0;
  for (let groupIndex = 0; groupIndex < targetCount; groupIndex += 1) {
    const source = groups[groupIndex % Math.max(1, groups.length)] ?? {
      stepIndex: groupIndex,
      events: [{ lane: RHYTHM_LANES[groupIndex % RHYTHM_LANES.length], pitchSlot: 0, degree: groupIndex + 1 }]
    };
    if (groupIndex > 0) {
      const sourceDelta = source.stepIndex > previousSourceStep
        ? source.stepIndex - previousSourceStep
        : 1;
      stepCursor += clamp(sourceDelta, 1, 3);
    }
    previousSourceStep = source.stepIndex;
    let desiredChordSize = 1;
    if (rarity !== 'Common' && source.events.length > 1) desiredChordSize = Math.min(2, source.events.length);
    if (groupIndex > 0 && groupIndex % profile.chordEvery === profile.chordEvery - 1) desiredChordSize = 2;
    if (groupIndex > 1 && groupIndex % profile.tripleEvery === profile.tripleEvery - 1) desiredChordSize = 3;

    const candidates = [];
    for (let scan = 0; scan < groups.length && candidates.length < desiredChordSize; scan += 1) {
      const candidateGroup = groups[(groupIndex + scan) % groups.length];
      for (const candidate of candidateGroup.events) {
        if (!candidates.some((event) => event.lane === candidate.lane)) candidates.push(candidate);
        if (candidates.length >= desiredChordSize) break;
      }
    }
    const chord = candidates.length ? candidates.slice(0, desiredChordSize) : source.events.slice(0, 1);
    chord.forEach((event) => {
      const mayHold = chord.length === 1
        && (event.hold || (groupIndex > 0 && groupIndex % profile.holdEvery === profile.holdEvery - 2));
      const holdLevel = mayHold
        ? Math.min(profile.maxHold, Math.max(
          event.holdLevel ?? 1,
          1 + (Math.floor(groupIndex / profile.holdEvery) % profile.maxHold)
        ))
        : 0;
      adjusted.push({
        ...event,
        stepIndex: stepCursor,
        groupIndex,
        hold: holdLevel > 0,
        holdLevel
      });
    });
  }
  return adjusted;
}

export function parseAuthoredMotif(source, shiny = false) {
  const events = [];
  let stepIndex = 0;
  const laneOccurrences = Object.fromEntries(RHYTHM_LANES.map((lane) => [lane, 0]));

  for (const raw of source.trim().split(/\s+/)) {
    if (!raw) continue;
    if (/^-+$/.test(raw)) {
      stepIndex += raw.length;
      continue;
    }

    // Song notation supports A/W/S/D plus an optional pitch slot 1 or 2 and optional hold:
    //   A1  W2~  A1+D2
    // Legacy lane-only motifs remain deterministic: the two scale notes alternate in a
    // fixed pattern, so old songs gain an 8-note melody without any per-catch randomness.
    const chord = raw.split('+').map((part) => part.trim()).filter(Boolean);
    let tokenAdvance = 1;
    for (const part of chord) {
      const match = part.toUpperCase().match(/^([ASWD])([12])?(~{1,3})?$/);
      if (!match) continue;
      const originalLane = match[1];
      const explicitSlot = match[2] ? Number(match[2]) - 1 : null;
      const holdLevel = match[3]?.length ?? 0;
      const hold = holdLevel > 0;
      const occurrence = laneOccurrences[originalLane]++;
      // A fixed 0,1,0,0,1,1 contour gives repeated arrows some melodic movement while
      // still allowing recognizable repeated pitches. Future authored songs can specify
      // the slot explicitly with A1/A2 etc.
      const inferredContour = [0, 1, 0, 0, 1, 1];
      const normalSlot = explicitSlot ?? inferredContour[(occurrence + stepIndex) % inferredContour.length];
      const lane = shiny ? SHINY_LANE_MIRROR[originalLane] : originalLane;
      const pitchSlot = shiny ? 1 - normalSlot : normalSlot;
      const degree = RHYTHM_SCALE_DEGREES[lane][pitchSlot];
      events.push({ lane, pitchSlot, degree, stepIndex, hold, holdLevel });
      if (hold) tokenAdvance = Math.max(tokenAdvance, 1 + holdLevel);
    }
    stepIndex += tokenAdvance;
  }
  return { events, stepCount: stepIndex };
}

export function validateThreeNoteChordRule(fish) {
  const parsed = parseAuthoredMotif(fish.rhythm.motifs[0], false);
  const byStep = new Map();
  for (const event of parsed.events) {
    const group = byStep.get(event.stepIndex) ?? [];
    group.push(event);
    byStep.set(event.stepIndex, group);
  }
  const errors = [];
  const tripleSteps = [...byStep].filter(([, events]) => events.length === 3).map(([step]) => step);
  for (const [step, events] of byStep) {
    if (events.length > 3) errors.push(`step ${step} has ${events.length} simultaneous notes`);
    if (events.length !== 3) continue;
    if (!['Rare', 'Legendary'].includes(fish.rarity)) errors.push(`step ${step} uses a three-note chord below Rare`);
    if (events.some((event) => event.hold)) errors.push(`step ${step} overlaps a hold`);
    if (byStep.has(step - 1) || byStep.has(step + 1)) errors.push(`step ${step} lacks a full empty step on both sides`);
    if (tripleSteps.some((other) => other !== step && Math.abs(other - step) < 4)) {
      errors.push(`step ${step} is too close to another three-note chord`);
    }
    const incomingHold = parsed.events.some((event) => (
      event.hold && event.stepIndex < step && event.stepIndex + event.holdLevel >= step - 1
    ));
    if (incomingHold) errors.push(`step ${step} has an incoming hold overlap`);
  }
  return errors;
}

export function generateRhythmPattern(fish, rng = Math.random, config = RHYTHM_CONFIG, modifiers = {}) {
  const settings = fish.rhythm;
  // Each species now has one authored base song. Normal specimens always use that exact
  // pitch/rhythm identity; shinies mirror it. Individual size only changes how the tune
  // is performed (tempo/sustain), never which melody is selected.
  const motifs = settings.motifs?.length ? settings.motifs : [fallbackMotif(settings)];
  const motifIndex = 0;
  const parsed = parseAuthoredMotif(motifs[0], fish.shiny);
  const adaptedEvents = adaptEventsForRarity(parsed.events, fish.rarity);
  const specialVocabulary = applySpecialRhythmVocabulary(adaptedEvents, fish, rng);
  const events = specialVocabulary.events;
  const [typicalMinLength, typicalMaxLength] = fish.sizeModel?.typicalLength ?? [fish.length ?? 1, fish.length ?? 1];
  const lengthSpan = Math.max(.01, typicalMaxLength - typicalMinLength);
  const lengthFactor = clamp(((fish.length ?? typicalMinLength) - typicalMinLength) / lengthSpan, -.15, 1.7);
  const weightCondition = clamp(
    (fish.weight ?? fish.expectedWeight ?? 1) / Math.max(.01, fish.expectedWeight ?? fish.weight ?? 1),
    .72,
    1.4
  );
  const baselineBpm = (settings.bpm[0] + settings.bpm[1]) * .5 + 20;
  // Length and weight alter difficulty without changing the song itself. Bigger/heavier
  // specimens are worth more, so they perform the same species tune FASTER; tiny/light
  // specimens get a slower, more forgiving performance. Species difficulty still dominates.
  const tempoScale = clamp(
    1 + (lengthFactor - .5) * .09 + (weightCondition - 1) * .28,
    .8,
    1.22
  );
  const bpm = Math.round(clamp(
    baselineBpm * tempoScale * Math.max(.5, modifiers.tempoMultiplier ?? 1),
    55,
    190
  ));
  const beat = 60 / bpm;
  // Large fish also tighten the spacing slightly. Long specimens still gain longer/more
  // hold notes below, so trophy fish become faster AND more demanding rather than easier.
  const phraseStretch = clamp(1 - (lengthFactor - .5) * .05, .93, 1.06);
  const sustainScale = clamp(
    1 + (lengthFactor - .5) * .16 + (weightCondition - 1) * .24,
    .82,
    1.3
  );
  const spacing = beat * .5 * phraseStretch;
  // Keep the hit windows and note/sustain lengths exactly as authored, but add a small
  // amount of dead air BETWEEN note steps for the easier rarity tiers. This gives fingers
  // time to travel from one arrow to the next without making the actual timing window
  // wider or slowing the synthesized note itself. The final normalization below only
  // shifts notes whose complete required-action windows would otherwise conflict.
  const interNoteGap = ({ Common: .14, Uncommon: .09, Rare: .025, Legendary: 0 }[fish.rarity] ?? .05);
  const lengthTier = fish.lengthCategoryIndex ?? 2;
  const eventGroups = groupRhythmEvents(events);
  const timingPatterns = {
    Common: [1.5, 2, 1, 1.5, 1],
    Uncommon: [1, 1.5, 2, 1, 1.5, 1],
    Rare: [1, 1.5, 1, 2, 1, 1.5, 3],
    Legendary: [1, 1.5, 1, 2, 1, 1.5, 3, 1]
  };
  const timingPattern = timingPatterns[fish.rarity] ?? timingPatterns.Uncommon;
  const groupHitTimes = new Map();
  let groupTime = config.approachSeconds;
  eventGroups.forEach((group, index) => {
    if (index > 0) {
      const previous = eventGroups[index - 1];
      const authoredMultiple = clamp(group.stepIndex - previous.stepIndex, 1, 3);
      let multiplier = Math.max(authoredMultiple, timingPattern[(index - 1) % timingPattern.length]);
      const riffPair = previous.events.every((event) => event.riff)
        && group.events.every((event) => event.riff);
      const chordBreathingRoom = previous.events.some((event) => event.fourLaneChord)
        || group.events.some((event) => event.fourLaneChord);
      const safeLegendaryHalfBeat = fish.rarity === 'Legendary' && index % 11 === 7
        && previous.events.length === 1 && group.events.length === 1
        && !previous.events[0].hold && !group.events[0].hold;
      if (riffPair || safeLegendaryHalfBeat) multiplier = .5;
      if (chordBreathingRoom) multiplier = Math.max(multiplier, 2.5);
      groupTime += spacing * multiplier + (riffPair ? 0 : interNoteGap);
    }
    groupHitTimes.set(group.groupIndex, groupTime);
  });
  const groupSizes = new Map(eventGroups.map((group) => [group.groupIndex, group.events.length]));
  const authoredNotes = events.map((event, id) => {
    // Long specimens keep the SAME tune, but phrase-ending notes linger more often.
    // This is deterministic by authored step so repeated catches remain recognizable.
    const singleNoteGroup = groupSizes.get(event.groupIndex) === 1;
    const sizeAddedHoldLevel = !event.riff && singleNoteGroup && lengthTier >= 4
      ? (event.groupIndex % 10 === 3 ? 3 : event.groupIndex % 5 === 3 ? 2 : 0)
      : !event.riff && singleNoteGroup && lengthTier >= 3 && event.groupIndex % 8 === 5 ? 1 : 0;
    const holdLevel = Math.max(event.holdLevel ?? (event.hold ? 1 : 0), sizeAddedHoldLevel);
    const holdBeatLengths = [0, .55, .9, 1.3];
    return {
      id,
      stepIndex: event.stepIndex,
      lane: event.lane,
      pitchSlot: event.pitchSlot,
      degree: event.degree,
      groupIndex: event.groupIndex,
      hitTime: groupHitTimes.get(event.groupIndex) ?? config.approachSeconds,
      duration: holdLevel ? beat * holdBeatLengths[holdLevel] * sustainScale : 0,
      holdLevel,
      riff: Boolean(event.riff),
      fourLaneChord: Boolean(event.fourLaneChord),
      timingWindowScale: event.timingWindowScale ?? 1,
      status: 'pending',
      timingJudgment: null,
      signedErrorMs: null,
      missReason: null,
      holdCompletionFraction: null,
      escapeContribution: 0
    };
  });
  const notes = normalizeRequiredActionTimings(
    authoredNotes,
    effectiveGoodWindow(fish, config, modifiers.successWindowMultiplier ?? modifiers.rhythmTolerance ?? 1)
  );
  const finalNote = notes.at(-1);
  return {
    bpm,
    interNoteGap,
    motifIndex,
    motif: motifs[motifIndex],
    instrument: settings.instrument ?? 'wood',
    root: settings.root ?? 55,
    notes,
    riff: specialVocabulary.riff,
    fourLaneChord: specialVocabulary.fourLaneChord,
    duration: finalNote
      ? finalNote.hitTime + finalNote.duration + config.goodWindow * (finalNote.timingWindowScale ?? 1) + .32
      : config.approachSeconds,
    approachSeconds: config.approachSeconds,
    requiredHits: Math.max(1, notes.length - 1),
    totalEvents: notes.length
  };
}

export function gradeRhythmPerformance(performance, config = CATCH_QUALITY_CONFIG) {
  const successfulNotes = Math.max(0, performance.successfulNotes ?? 0);
  const perfectNotes = Math.max(0, performance.perfectNotes ?? 0);
  const misses = Math.max(0, performance.misses ?? 0);
  const offBeatPresses = Math.max(0, performance.offBeatPresses ?? 0);
  const perfectRatio = successfulNotes ? perfectNotes / successfulNotes : 0;
  if (misses === 0 && offBeatPresses === 0 && perfectRatio >= config.perfectMinimumRatio) return 'PERFECT';
  if ((misses === 0 && offBeatPresses <= 1 && perfectRatio >= config.greatCleanMinimumRatio)
    || (misses === 1 && offBeatPresses === 0 && perfectRatio >= config.greatOneMissMinimumRatio)) return 'GREAT';
  return 'GOOD';
}

export class RhythmSession {
  constructor(fish, startTime, rng = Math.random, config = RHYTHM_CONFIG, modifiers = {}) {
    this.fish = fish;
    this.config = config;
    this.modifiers = { ...modifiers };
    this.timingTolerance = fish.rhythm.timingTolerance ?? 1;
    this.successWindowMultiplier = Math.max(.1, modifiers.successWindowMultiplier ?? modifiers.rhythmTolerance ?? 1);
    this.reelGainMultiplier = Math.max(.1, modifiers.reelGain ?? 1);
    this.escapeGainMultiplier = Math.max(.1, modifiers.escapeGain ?? 1)
      / Math.max(.1, modifiers.mistakeAllowanceMultiplier ?? 1);
    this.pattern = generateRhythmPattern(fish, rng, config, modifiers);
    // The visible end marker remains the ideal release point, while the hidden success
    // threshold gives easier species a generous early-release allowance.
    this.holdRequiredFraction = ({ Common: .38, Uncommon: .48, Rare: .58, Legendary: .66 }[fish.rarity] ?? .54);
    this.holdEndpointGraceSeconds = ({ Common: .16, Uncommon: .14, Rare: .11, Legendary: .09 }[fish.rarity] ?? .12);
    this.startTime = startTime;
    this.lastNow = startTime;
    this.pauseOffset = 0;
    this.songTime = 0;
    this.successfulNotes = 0;
    this.perfectNotes = 0;
    this.goodNotes = 0;
    this.completedNotes = 0;
    this.misses = 0;
    this.offBeatPresses = 0;
    // Escape/loss meter: a missed due note costs 1/2, while a stray off-beat press costs 1/4.
    // That preserves one full missed note of forgiveness while still discouraging key mashing.
    this.lossMeter = 0;
    this.lossSpacingSeconds = .5;
    this.lastQualifyingMistakeTime = null;
    this.spacedMistakeCount = 0;
    this.judgment = '';
    this.judgmentTime = 0;
    this.lastJudgedLane = null;
    this.lastJudgedDegree = null;
    this.lastJudgmentCorrect = false;
    this.audioEvents = [];
    this.inputFeedbackEvents = [];
    this.inputSerial = 0;
    this.lastInput = null;
    this.streak = 0;
    this.longestStreak = 0;
    this.wrongLaneInputs = 0;
    this.earlyHoldReleases = 0;
    this.mistakeLog = [];
    this.mistakeEvents = [];
    this.rawInputLog = [];
    this.result = null;
    this.lastBeat = -1;
  }

  update(now, inputs = [], isLaneHeld = () => false) {
    if (this.result) return this.result;
    const frameGap = now - this.lastNow;
    if (frameGap > this.config.pauseGapSeconds) this.pauseOffset += frameGap;
    this.lastNow = now;
    this.songTime = Math.max(0, now - this.startTime - this.pauseOffset);

    for (const input of inputs) {
      this.handleInput(input.lane, Math.max(0, input.time - this.startTime - this.pauseOffset));
      if (this.result) return this.result;
    }

    for (const note of this.pattern.notes) {
      if (note.status === 'holding') {
        const endTime = note.hitTime + note.duration;
        const requiredUntil = note.hitTime + note.duration * this.holdRequiredFraction;
        if (this.songTime >= endTime) {
          // Holding beyond the authored endpoint is harmless: finish on the exact tail time.
          this.completeHold(note);
        } else if (this.songTime > note.hitTime + this.perfectWindowFor(note) && !isLaneHeld(note.lane)) {
          if (this.songTime >= requiredUntil || this.songTime >= endTime - this.holdEndpointGraceSeconds) {
            this.completeHold(note);
          } else this.missNote(note, note.lane, this.songTime, 'hold-release');
        }
      } else if (note.status === 'pending' && this.songTime > note.hitTime + this.goodWindowFor(note)) {
        this.missNote(note);
      }
      if (this.result) return this.result;
    }

    if (this.judgment && this.songTime - this.judgmentTime > this.config.feedbackSeconds) {
      this.judgment = '';
    }
    this.resolveOutcome();
    return this.result;
  }

  handleInput(lane, inputTime) {
    let matching = null;
    let matchingDelta = Infinity;
    let timingTarget = null;
    let timingDelta = Infinity;

    for (const note of this.pattern.notes) {
      if (note.status !== 'pending') continue;
      const delta = Math.abs(note.hitTime - inputTime);
      if (delta < timingDelta) {
        timingTarget = note;
        timingDelta = delta;
      }
      if (note.lane === lane && delta < matchingDelta) {
        matching = note;
        matchingDelta = delta;
      }
    }

    if (matching && matchingDelta <= this.goodWindowFor(matching)) {
      const perfect = matchingDelta <= this.perfectWindowFor(matching);
      const signedMs = Math.round((inputTime - matching.hitTime) * 1000);
      matching.timingJudgment = perfect ? 'perfect' : 'good';
      matching.signedErrorMs = signedMs;
      if (matching.duration > 0) {
        matching.status = 'holding';
        matching.holdStartedAt = inputTime;
      } else {
        matching.status = 'hit';
        this.completedNotes += 1;
        this.successfulNotes += 1;
        this.streak += 1;
        this.longestStreak = Math.max(this.longestStreak, this.streak);
        if (perfect) this.perfectNotes += 1;
        else this.goodNotes += 1;
      }
      this.setJudgment(perfect ? 'PERFECT' : 'GOOD', lane, true, matching);
      this.recordInput(lane, perfect ? 'PERFECT' : 'GOOD', true, signedMs, matching, inputTime);
      this.audioEvents.push({ lane: matching.lane, degree: matching.degree, perfect });
      this.resolveOutcome();
      return;
    }

    if (timingTarget && timingDelta <= this.goodWindowFor(timingTarget)) {
      // A wrong direction at the correct time is ONE mistake: consume that due note as
      // missed so it cannot time out later and count as a second miss.
      this.recordInput(lane, 'WRONG LANE', false, Math.round((inputTime - timingTarget.hitTime) * 1000), timingTarget, inputTime);
      this.missNote(timingTarget, lane, inputTime, 'wrong-lane');
      this.resolveOutcome();
      return;
    }

    // A stray press with no note nearby is a smaller mistake rather than a free input.
    // Four off-beat presses lose a normal fish; three are survivable. One off-beat press
    // can also be combined with one missed note (.25 + .5) without immediately losing it.
    const signedMs = timingTarget ? Math.round((inputTime - timingTarget.hitTime) * 1000) : null;
    this.recordInput(lane, 'OFF BEAT', false, signedMs, timingTarget, inputTime);
    this.registerOffBeat(lane, inputTime, timingTarget, signedMs);
    this.resolveOutcome();
  }

  completeHold(note, completionTime = this.songTime) {
    if (note.status !== 'holding') return;
    note.status = 'hit';
    this.completedNotes += 1;
    this.successfulNotes += 1;
    this.streak += 1;
    this.longestStreak = Math.max(this.longestStreak, this.streak);
    note.holdCompletionFraction = clamp((completionTime - note.hitTime) / Math.max(.001, note.duration), 0, 1);
    if (note.timingJudgment === 'perfect') this.perfectNotes += 1;
    else this.goodNotes += 1;
    this.setJudgment('HOLD!', note.lane, true, note);
  }

  applyMistakeLoss(amount, mistakeTime = this.songTime) {
    if (this.lastQualifyingMistakeTime === null
      || mistakeTime - this.lastQualifyingMistakeTime >= this.lossSpacingSeconds) {
      this.spacedMistakeCount += 1;
      this.lastQualifyingMistakeTime = mistakeTime;
    }
    const previous = this.lossMeter;
    const next = previous + amount * this.escapeGainMultiplier;
    // A clustered panic burst cannot take a normal fish from safe to fully escaped.
    this.lossMeter = (!this.fish.shiny && next >= 1 && this.spacedMistakeCount < 2)
      ? Math.min(.95, next)
      : clamp(next, 0, 1);
    return this.lossMeter - previous;
  }

  missNote(note, inputLane = note.lane, mistakeTime = this.songTime, reason = 'timeout') {
    if (note.status === 'missed' || note.status === 'hit') return;
    const wasHolding = note.status === 'holding';
    note.status = 'missed';
    note.missReason = reason;
    this.misses += 1;
    this.streak = 0;
    const escapeContribution = this.applyMistakeLoss(.5, mistakeTime);
    note.escapeContribution = (note.escapeContribution ?? 0) + escapeContribution;
    this.completedNotes += 1;
    this.setJudgment('MISS', inputLane, false);
    if (wasHolding || reason === 'hold-release') {
      const fraction = clamp((mistakeTime - note.hitTime) / Math.max(.001, note.duration), 0, 1);
      note.holdCompletionFraction = fraction;
      this.earlyHoldReleases += 1;
      this.logMistake(
        `HOLD RELEASED EARLY: ${Math.round(fraction * 100)}% / ${Math.round(this.holdRequiredFraction * 100)}% required`,
        { type: 'early-hold-release', noteId: note.id, lane: note.lane, time: mistakeTime, escapeContribution }
      );
    } else if (reason === 'wrong-lane') {
      this.wrongLaneInputs += 1;
      this.logMistake(
        `WRONG LANE: ${this.laneLabel(inputLane)} pressed — expected ${this.laneLabel(note.lane)}`,
        { type: 'wrong-lane', noteId: note.id, lane: inputLane, expectedLane: note.lane, time: mistakeTime, escapeContribution }
      );
    } else {
      const group = this.expectedGroup(note.hitTime);
      this.logMistake(
        `MISSED: ${group.map((entry) => this.laneLabel(entry.lane)).join(' + ')} @ ${note.hitTime.toFixed(2)}s`,
        { type: 'timeout', noteId: note.id, lane: note.lane, time: mistakeTime, escapeContribution }
      );
    }
    this.failCleanPerformanceIfNecessary();
  }

  registerOffBeat(inputLane, mistakeTime = this.songTime, timingTarget = null, signedMs = null) {
    this.offBeatPresses += 1;
    this.streak = 0;
    const escapeContribution = this.applyMistakeLoss(.25, mistakeTime);
    if (timingTarget) timingTarget.escapeContribution = (timingTarget.escapeContribution ?? 0) + escapeContribution;
    this.setJudgment('OFF BEAT', inputLane, false);
    const timing = signedMs === null ? 'with no pending note' : `${Math.abs(signedMs)} ms ${signedMs < 0 ? 'EARLY' : 'LATE'}`;
    this.logMistake(
      `${this.laneLabel(inputLane)} — ${timing}${timingTarget ? ` (expected ${this.laneLabel(timingTarget.lane)})` : ''}`,
      { type: 'off-beat', noteId: timingTarget?.id ?? null, lane: inputLane, time: mistakeTime, signedMs, escapeContribution }
    );
    this.failCleanPerformanceIfNecessary();
  }

  failCleanPerformanceIfNecessary() {
    if (!this.requiresCleanPerformance || this.lossMeter <= 0) return false;
    this.result = 'escaped';
    return true;
  }

  laneLabel(lane) {
    return ({ A: 'LEFT', W: 'UP', S: 'DOWN', D: 'RIGHT' })[lane] ?? lane ?? 'UNKNOWN';
  }

  expectedGroup(hitTime) {
    return this.pattern.notes.filter((note) => Math.abs(note.hitTime - hitTime) < .0001);
  }

  logMistake(message, detail = {}) {
    this.mistakeEvents.push({ number: this.mistakeEvents.length + 1, message, ...detail });
    this.mistakeLog.unshift(message);
    this.mistakeLog.length = Math.min(this.mistakeLog.length, 10);
  }

  recordInput(lane, judgment, correct, signedMs, target, inputTime = this.songTime) {
    this.inputSerial += 1;
    const feedback = Object.freeze({
      serial: this.inputSerial,
      lane,
      judgment,
      correct,
      counted: correct,
      mistake: !correct,
      reason: correct ? null : judgment === 'WRONG LANE' ? 'wrong lane' : 'off beat',
      signedMs,
      expectedLanes: target ? this.expectedGroup(target.hitTime).map((note) => note.lane) : [],
      expectedHitTime: target?.hitTime ?? null,
      targetNoteId: target?.id ?? null,
      inputTime
    });
    this.lastInput = feedback;
    this.inputFeedbackEvents.push(feedback);
    this.rawInputLog.push(feedback);
  }

  resolveOutcome() {
    const remaining = this.pattern.notes.filter((note) => note.status === 'pending' || note.status === 'holding').length;
    const songJudged = remaining === 0;
    if (this.requiresCleanPerformance && this.lossMeter > 0) {
      // Shinies require a completely clean performance: no missed notes and no off-beat taps.
      this.result = 'escaped';
    } else if (this.lossMeter >= 1 && this.spacedMistakeCount >= 2) {
      this.result = 'escaped';
    } else if (this.successfulNotes * this.reelGainMultiplier + remaining < this.pattern.requiredHits && this.spacedMistakeCount >= 2) {
      // Clustered mistakes are given the same anti-burst grace before a line break.
      this.result = 'escaped';
    } else if (songJudged) {
      this.result = this.successfulNotes * this.reelGainMultiplier >= this.pattern.requiredHits ? 'caught' : 'escaped';
    } else if (this.songTime >= this.pattern.duration) {
      this.result = 'escaped';
    }
  }

  setJudgment(value, lane = null, correct = false, note = null) {
    this.judgment = value;
    this.judgmentTime = this.songTime;
    this.lastJudgedLane = lane;
    this.lastJudgedDegree = correct ? (note?.degree ?? null) : null;
    this.lastJudgmentCorrect = correct;
  }

  getVisibleNotes() {
    const minimumTime = this.songTime - this.goodWindow;
    const maximumTime = this.songTime + this.pattern.approachSeconds;
    return this.pattern.notes
      .filter((note) => (note.status === 'pending' || note.status === 'holding')
        && note.hitTime + note.duration >= minimumTime && note.hitTime <= maximumTime)
      .map((note) => {
        const position = clamp((note.hitTime - this.songTime) / this.pattern.approachSeconds, -.08, 1.12);
        const endPosition = clamp((note.hitTime + note.duration - this.songTime) / this.pattern.approachSeconds, -.08, 1.6);
        const holding = note.status === 'holding';
        const authoredHoldLength = note.duration / this.pattern.approachSeconds;
        return {
          id: note.id,
          lane: note.lane,
          degree: note.degree,
          pitchSlot: note.pitchSlot,
          position,
          hold: note.duration > 0,
          holdLevel: note.holdLevel ?? 0,
          holdLength: authoredHoldLength,
          endPosition,
          holding,
          // Once a hold starts, pin only its head to the receptor. Its remaining tail
          // continues to shrink from the song clock, so long holds never visually freeze.
          // Before the hit, a minimum visual span makes the shortest valid hold distinct
          // from two rapid taps without changing its authored timing or judgment window.
          visualPosition: holding ? 0 : position,
          visualHoldLength: note.duration <= 0
            ? 0
            : holding
              ? Math.max(0, endPosition)
              : Math.max(.13, authoredHoldLength)
        };
      });
  }

  consumeAudioEvents() {
    return this.audioEvents.splice(0);
  }

  consumeInputFeedbackEvents() {
    return this.inputFeedbackEvents.splice(0);
  }

  getDebugState() {
    const activeHolds = this.pattern.notes
      .filter((note) => note.status === 'holding')
      .map((note) => ({
        lane: note.lane,
        progress: clamp((this.songTime - note.hitTime) / Math.max(.001, note.duration), 0, 1),
        required: this.holdRequiredFraction,
        endpointGraceSeconds: this.holdEndpointGraceSeconds
      }));
    const next = this.pattern.notes.find((note) => note.status === 'pending' || note.status === 'holding');
    return {
      patternId: `${this.fish.speciesId ?? this.fish.id}:motif-${this.pattern.motifIndex + 1}`,
      eventIndex: Math.min(this.completedNotes + 1, this.pattern.totalEvents),
      eventTotal: this.pattern.totalEvents,
      expectedLanes: next ? this.expectedGroup(next.hitTime).map((note) => note.lane) : [],
      expectedHitTime: next?.hitTime ?? null,
      lastInput: this.lastInput,
      inputLog: [...this.rawInputLog],
      songTime: this.songTime,
      perfectWindow: this.perfectWindow,
      goodWindow: this.goodWindow,
      requiresCleanPerformance: this.requiresCleanPerformance,
      activeHolds,
      streak: this.streak,
      mistakeLog: [...this.mistakeLog]
    };
  }

  getFailureReason() {
    const latest = this.mistakeEvents.at(-1);
    const cause = ({
      'early-hold-release': 'released hold early',
      'wrong-lane': 'wrong direction',
      'off-beat': 'stray/off-beat input',
      timeout: 'missed note'
    })[latest?.type] ?? null;
    if (this.fish.shiny && this.lossMeter > 0) return `shiny escaped${cause ? ` — ${cause}` : ''}`;
    if (this.lossMeter >= 1) return `escape meter filled${cause ? ` — ${cause}` : ''}`;
    if (this.songTime >= this.pattern.duration) return `song ended before enough notes${cause ? ` — ${cause}` : ''}`;
    if (this.successfulNotes * this.reelGainMultiplier < this.pattern.requiredHits) {
      return `too many mistakes${cause ? ` — ${cause}` : ''}`;
    }
    return cause ?? 'rhythm failed';
  }

  get progress() {
    return clamp(this.successfulNotes * this.reelGainMultiplier / this.pattern.requiredHits, 0, 1);
  }

  get perfectWindow() {
    return this.config.perfectWindow * this.timingTolerance;
  }

  perfectWindowFor(note) {
    return this.perfectWindow * (note?.timingWindowScale ?? 1);
  }

  get goodWindow() {
    return this.config.goodWindow * this.timingTolerance * this.successWindowMultiplier
      + (GOOD_WINDOW_BONUS_BY_RARITY[this.fish.rarity] ?? 0);
  }

  goodWindowFor(note) {
    return this.goodWindow * (note?.timingWindowScale ?? 1);
  }

  get escapeProgress() {
    return clamp(this.fish.shiny && this.lossMeter > 0 ? 1 : this.lossMeter, 0, 1);
  }

  get requiresCleanPerformance() {
    return Boolean(this.fish.shiny);
  }

  get nearLoss() {
    return !this.fish.shiny && this.lossMeter >= .5 && this.lossMeter < 1 && !this.result;
  }

  get perfectPerformance() {
    return this.result === 'caught' && this.misses === 0 && this.offBeatPresses === 0;
  }

  get quality() {
    return gradeRhythmPerformance(this);
  }

  get beatIndex() {
    const beat = 60 / this.pattern.bpm;
    return Math.floor(Math.max(0, this.songTime - this.pattern.approachSeconds) / beat);
  }
}
