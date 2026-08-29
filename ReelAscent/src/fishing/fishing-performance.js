export const FISHING_PERFORMANCE_HISTORY_LIMIT = 8;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const round = (value, places = 0) => {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * .5;
}

function eventJudgment(notes) {
  if (notes.some((note) => note.status === 'holding')) return 'HOLDING';
  if (notes.every((note) => note.status === 'pending')) return 'PENDING';
  if (notes.some((note) => note.missReason === 'wrong-lane')) return 'WRONG LANE';
  if (notes.some((note) => note.missReason === 'hold-release')) return 'EARLY RELEASE';
  const hits = notes.filter((note) => note.status === 'hit').length;
  if (hits > 0 && hits < notes.length) return 'CHORD PARTIAL';
  if (notes.every((note) => note.status === 'missed')) return 'MISS';
  if (notes.some((note) => note.duration > 0)) return 'HOLD';
  if (notes.every((note) => note.timingJudgment === 'perfect')) return 'PERFECT';
  if (notes.every((note) => note.status === 'hit')) return 'GOOD';
  return 'PENDING';
}

function groupRhythmEvents(session) {
  const groups = new Map();
  for (const note of session.pattern.notes) {
    const key = Number.isFinite(note.stepIndex) ? note.stepIndex : note.hitTime.toFixed(4);
    const group = groups.get(key) ?? [];
    group.push(note);
    groups.set(key, group);
  }

  return [...groups.values()].map((notes, index) => {
    const expectedTime = notes[0].hitTime;
    const actualInputs = session.rawInputLog
      .filter((input) => input.targetNoteId !== null && notes.some((note) => note.id === input.targetNoteId))
      .map((input) => ({ ...input }));
    const noteDetails = notes.map((note) => ({
      id: note.id,
      lane: note.lane,
      degree: note.degree,
      expectedTime: round(note.hitTime, 4),
      duration: round(note.duration, 4),
      status: note.status,
      timingJudgment: note.timingJudgment?.toUpperCase?.() ?? null,
      signedErrorMs: note.signedErrorMs ?? null,
      missReason: note.missReason ?? null,
      holdCompletionFraction: round(note.holdCompletionFraction, 3),
      holdRequiredFraction: note.duration > 0 ? round(session.holdRequiredFraction, 3) : null,
      escapeContribution: round(note.escapeContribution ?? 0, 3)
    }));
    return {
      number: index + 1,
      stepIndex: notes[0].stepIndex ?? index,
      expectedLanes: notes.map((note) => note.lane),
      expectedTime: round(expectedTime, 4),
      actualInputs,
      judgment: eventJudgment(notes),
      isChord: notes.length > 1,
      notes: noteDetails,
      escapeContribution: round(noteDetails.reduce((total, note) => total + note.escapeContribution, 0), 3)
    };
  });
}

export function createFishingPerformanceSnapshot(session, context = {}) {
  if (!session) return null;
  const events = groupRhythmEvents(session);
  const timedInputs = session.rawInputLog.filter((input) => Number.isFinite(input.signedMs));
  const signedErrors = timedInputs.map((input) => input.signedMs);
  const absoluteErrors = signedErrors.map(Math.abs);
  const holdNotes = session.pattern.notes.filter((note) => note.duration > 0);
  const chordEvents = events.filter((event) => event.isChord);
  const successfulChords = chordEvents.filter((event) => event.notes.every((note) => note.status === 'hit')).length;
  const perfect = session.perfectNotes;
  const good = session.goodNotes;
  const judgedHits = perfect + good;
  const location = context.location ?? {};
  const fish = session.fish ?? {};

  return {
    id: context.id ?? `fight-${context.sequence ?? 0}`,
    sequence: context.sequence ?? 0,
    startedAt: context.startedAt ?? null,
    capturedAt: context.capturedAt ?? Date.now(),
    live: Boolean(context.live),
    result: context.result ?? session.result ?? 'active',
    catchQuality: context.catchQuality ?? (session.result === 'caught' ? session.quality : null),
    fish: {
      speciesId: fish.speciesId ?? fish.id ?? '',
      name: fish.name ?? 'Unknown creature',
      rarity: fish.rarity ?? 'Common',
      shiny: Boolean(fish.shiny),
      length: round(fish.length, 1),
      weight: round(fish.weight, 2),
      sizeLabel: fish.sizeLabel ?? fish.sizeCategory ?? '',
      lengthCategory: fish.lengthCategory ?? ''
    },
    location: {
      id: location.id ?? '',
      label: location.label ?? 'Unknown water',
      habitat: location.habitat ?? '',
      tier: location.tier ?? '',
      waterType: location.waterType ?? '',
      theme: location.theme ?? '',
      salinity: location.salinity ?? ''
    },
    tempo: {
      sourceBpm: [...(fish.rhythm?.sourceAuthoredBpm ?? [])],
      baseBpm: [...(fish.rhythm?.authoredBpm ?? [])],
      slowedBpm: [...(fish.rhythm?.bpm ?? [])],
      actualBpm: session.pattern.bpm
    },
    summary: {
      events: events.length,
      notes: session.pattern.notes.length,
      successes: session.successfulNotes,
      misses: session.misses,
      offBeatPresses: session.offBeatPresses,
      wrongLanePresses: session.wrongLaneInputs,
      earlyHoldReleases: session.earlyHoldReleases,
      escapeProgress: round(session.escapeProgress, 3),
      longestStreak: session.longestStreak,
      timingAccuracy: absoluteErrors.length
        ? round(clamp(1 - (absoluteErrors.reduce((sum, value) => sum + value, 0) / absoluteErrors.length)
          / Math.max(1, session.goodWindow * 1000), 0, 1) * 100, 1)
        : null,
      meanAbsoluteErrorMs: absoluteErrors.length
        ? round(absoluteErrors.reduce((sum, value) => sum + value, 0) / absoluteErrors.length, 1)
        : null,
      medianAbsoluteErrorMs: round(median(absoluteErrors), 1),
      timingBiasMs: signedErrors.length
        ? round(signedErrors.reduce((sum, value) => sum + value, 0) / signedErrors.length, 1)
        : null,
      perfectPercent: judgedHits ? round(perfect / judgedHits * 100, 1) : null,
      goodPercent: judgedHits ? round(good / judgedHits * 100, 1) : null,
      hitSuccessPercent: session.pattern.notes.length
        ? round(session.successfulNotes / session.pattern.notes.length * 100, 1)
        : null,
      holdSuccessPercent: holdNotes.length
        ? round(holdNotes.filter((note) => note.status === 'hit').length / holdNotes.length * 100, 1)
        : null,
      chordSuccessPercent: chordEvents.length ? round(successfulChords / chordEvents.length * 100, 1) : null
    },
    events,
    mistakes: session.mistakeEvents.map((mistake) => ({ ...mistake })),
    inputLog: session.rawInputLog.map((input) => ({ ...input })),
    unmatchedInputs: session.rawInputLog.filter((input) => input.targetNoteId === null).map((input) => ({ ...input }))
  };
}

export class FishingPerformanceHistory {
  constructor(limit = FISHING_PERFORMANCE_HISTORY_LIMIT) {
    this.limit = Math.max(1, Math.floor(limit));
    this.entries = [];
  }

  add(snapshot) {
    if (!snapshot) return null;
    const retained = copy({ ...snapshot, live: false });
    this.entries.unshift(retained);
    this.entries.length = Math.min(this.entries.length, this.limit);
    return copy(retained);
  }

  getSnapshot() {
    return this.entries.map(copy);
  }
}
