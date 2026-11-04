import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH_SPECIES, createFishSpecimen } from '../src/fishing/fish-data.js';
import { RhythmSession } from '../src/fishing/rhythm-session.js';
import { FishingController } from '../src/fishing/fishing.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import { SaveSystem } from '../src/persistence/save-system.js';

const fish = (shiny = false) => createFishSpecimen('bluegill', .5, shiny, () => .5);
function hit(session, note) {
  session.handleInput(note.lane, note.hitTime);
  if (note.status === 'holding') session.completeHold(note, note.hitTime + note.duration);
  session.resolveOutcome();
}

test('normal songs honor the same visible loss budget for default and upgraded lines', () => {
  for (const [allowance, misses] of [[1, 1], [1.5, 2], [2, 3]]) {
    const session = new RhythmSession(fish(), 0, () => .5, undefined, { mistakeAllowanceMultiplier: allowance });
    session.pattern.notes.slice(0, misses).forEach((note, i) => session.missNote(note, note.lane, i * .7));
    assert.ok(session.lossMeter < 1); assert.equal(session.result, null, 'a surviving song can still award its fish');
    for (const note of session.pattern.notes.slice(misses)) hit(session, note);
    assert.equal(session.result, 'caught'); assert.equal(session.progress, 1);
  }
});

test('a forgiven clustered chord mistake cannot turn into a hidden failure at the song end', () => {
  const session = new RhythmSession(fish(), 0, () => .5);
  session.missNote(session.pattern.notes[0], undefined, 1);
  session.missNote(session.pattern.notes[1], undefined, 1.01);
  assert.ok(session.lossMeter < 1); assert.equal(session.result, null);
  for (const note of session.pattern.notes.slice(2)) hit(session, note);
  assert.equal(session.result, 'caught');
});

test('the last tap or hold tail resolves the catch immediately, including a forgiven final miss', () => {
  const recovered = new RhythmSession(fish(), 0, () => .5);
  for (const note of recovered.pattern.notes.slice(0, -1)) hit(recovered, note);
  assert.equal(recovered.result, null); assert.ok(recovered.progress < 1);
  recovered.missNote(recovered.pattern.notes.at(-1), undefined, recovered.pattern.notes.at(-1).hitTime);
  assert.equal(recovered.result, 'caught');
  const held = new RhythmSession(fish(), 0, () => .5), final = held.pattern.notes.at(-1);
  final.duration = .6; held.pattern.duration = final.hitTime + 1;
  for (const note of held.pattern.notes.slice(0, -1)) hit(held, note);
  held.handleInput(final.lane, final.hitTime);
  assert.equal(final.status, 'holding'); assert.equal(held.result, null);
  held.lastNow = final.hitTime + final.duration - .02;
  held.update(final.hitTime + final.duration, [], () => true);
  assert.equal(held.result, 'caught');
});

test('exhausted normal and first-mistake shiny attempts end immediately and stay terminal', () => {
  for (const shiny of [false, true]) {
    const session = new RhythmSession(fish(shiny), 0, () => .5);
    session.missNote(session.pattern.notes[0], undefined, 1);
    if (!shiny) { assert.equal(session.result, null); session.missNote(session.pattern.notes[1], undefined, 1.7); }
    assert.equal(session.result, 'escaped');
    const successes = session.successfulNotes;
    for (const note of session.pattern.notes) hit(session, note);
    assert.equal(session.result, 'escaped'); assert.equal(session.successfulNotes, successes);
  }
});

test('all current species award a clean full song and normal species can recover one miss', () => {
  for (const species of FISH_SPECIES) for (const shiny of [false, true]) {
    const session = new RhythmSession(createFishSpecimen(species, .5, shiny, () => .5), 0, () => .5);
    if (!shiny) session.missNote(session.pattern.notes[0], undefined, session.pattern.notes[0].hitTime);
    for (const note of session.pattern.notes) if (note.status !== 'missed') hit(session, note);
    assert.equal(session.result, 'caught', `${species.id} ${shiny ? 'shiny' : 'normal'}`);
  }
});

test('a completed upgraded-line song reaches the real inventory exactly once', () => {
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const saves = new SaveSystem(storage), progression = new ProgressionSystem(saves), specimen = fish();
  const rhythm = new RhythmSession(specimen, 0, () => .5, undefined, { mistakeAllowanceMultiplier: 2 });
  rhythm.pattern.notes.slice(0, 3).forEach((note, i) => rhythm.missNote(note, note.lane, i * .7));
  for (const note of rhythm.pattern.notes.slice(3)) hit(rhythm, note);
  assert.equal(rhythm.result, 'caught');
  const controller = Object.assign(Object.create(FishingController.prototype), {
    state: 'rhythm', rhythm, progression, selectedFish: specimen,
    zone: { id: 'test-water', label: 'Test Water', surfaceY: 0 },
    player: { input: { endRhythmCapture() {}, clearTouchActions() {} } },
    bestBySpecies: new Map(), seenSpecies: new Set(), catchHistory: [],
    recordPerformanceEncounter() {}, showCaughtFish() {}, audio: { success() {} },
    rodRoot: {}, lineEntity: {}, bobberRoot: {}
  });
  assert.equal(controller.landCatch(), true);
  assert.equal(controller.catchCard.addedToInventory, true);
  assert.equal(progression.state.inventory.length, 1);
  assert.equal(controller.state, 'caught'); assert.equal(controller.rhythm, null);
  assert.equal(controller.landCatch(), false);
  assert.equal(progression.state.inventory.length, 1); assert.equal(controller.catchHistory.length, 1);
  assert.equal(new ProgressionSystem(new SaveSystem(storage)).state.inventory.length, 1);
});
