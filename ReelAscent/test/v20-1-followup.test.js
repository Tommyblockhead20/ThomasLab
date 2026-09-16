import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFishSpecimen } from '../src/fishing/fish-data.js';
import { FISHING_RESULT_DIRECTIONS } from '../src/fishing/result-actions.js';
import { RhythmSession } from '../src/fishing/rhythm-session.js';
import { DEFAULT_APPEARANCE } from '../src/player/appearance.js';
import { SAVE_SLOTS_STORAGE_KEY, SaveSystem } from '../src/persistence/save-system.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import { formatGuideOdds } from '../src/ui/ecology-guide.js';
import { triangleSurfaceHeightAt } from '../src/world/mountain-v2.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('Play This Save cannot overwrite its destination with the current full save', () => {
  const storage = new MemoryStorage();
  const saves = new SaveSystem(storage);
  const progression = new ProgressionSystem(saves);
  progression.setAppearance({ shirtColor: 'rose', pantsColor: 'navy' });
  progression.addMoney(111);
  saves.data.collection.bluegill = { discovered: true, catches: 7, name: 'Bluegill' };
  saves.data.lifetime.fishCaught = 7;
  saves.save();
  const firstBeforeSwitch = saves.getSnapshot();
  assert.equal(saves.createSlot('slot-2'), true);
  const second = saves.getSlotSnapshot('slot-2');
  second.progression.appearance = { ...DEFAULT_APPEARANCE, shirtColor: 'moss', pantsColor: 'charcoal' };
  second.progression.money = 222;
  second.collection['rainbow-trout'] = { discovered: true, catches: 2, name: 'Rainbow Trout' };
  second.lifetime.fishCaught = 2;
  assert.equal(saves.replaceSlotData('slot-2', second), true);

  assert.equal(progression.selectSaveSlot('slot-2', { freezeUntilReload: true }), true);
  assert.equal(progression.getAppearance().outfitColor, 'moss');
  assert.equal(progression.getSnapshot().money, 222);
  assert.equal(saves.data.collection.rainbow_trout.catches, 2);
  // Reproduce a late callback holding the previous game's complete payload. Persistence must
  // reject it after Play This Save has durably selected the destination.
  saves.data = firstBeforeSwitch;
  assert.equal(saves.save(), true);
  const storedDuringTransition = JSON.parse(storage.getItem(SAVE_SLOTS_STORAGE_KEY));
  assert.equal(storedDuringTransition.activeSlotId, 'slot-2');
  assert.equal(storedDuringTransition.slots[1].data.progression.money, 222);
  assert.equal(storedDuringTransition.slots[1].data.collection.rainbow_trout.catches, 2);

  const reloaded = new SaveSystem(storage);
  assert.equal(reloaded.activeSlotId, 'slot-2');
  assert.equal(reloaded.data.progression.money, 222);
  assert.equal(reloaded.data.progression.appearance.outfitColor, 'moss');
  assert.equal(reloaded.data.collection.rainbow_trout.catches, 2);
  assert.equal(reloaded.data.collection.bluegill, undefined);

  const reloadedProgression = new ProgressionSystem(reloaded);
  assert.equal(reloadedProgression.selectSaveSlot('slot-1'), true);
  assert.equal(reloadedProgression.getAppearance().outfitColor, 'rose');
  assert.equal(reloadedProgression.getSnapshot().money, 111);
  assert.equal(reloaded.data.collection.bluegill.catches, 7);
  assert.equal(reloaded.data.collection.rainbow_trout, undefined);
  assert.equal(reloadedProgression.selectSaveSlot('slot-2'), true);
  assert.equal(reloadedProgression.getAppearance().outfitColor, 'moss');
  reloadedProgression.commit();
  assert.equal(reloaded.getSlotSnapshot('slot-2').progression.appearance.outfitColor, 'moss');
});

test('fishing result controls mirror arrows with WASD', () => {
  assert.deepEqual(
    ['KeyW', 'KeyS', 'KeyA', 'KeyD'].map((code) => FISHING_RESULT_DIRECTIONS[code]),
    ['recast', 'stay', 'down', 'up']
  );
  assert.deepEqual(
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map((code) => FISHING_RESULT_DIRECTIONS[code]),
    ['recast', 'stay', 'down', 'up']
  );
});

test('Master Atlas uses compact one-decimal odds and a multi-column screen layout', async () => {
  assert.equal(formatGuideOdds(.12345), '12.3%');
  assert.equal(formatGuideOdds(.01), '1.0%');
  const [guideSource, styleSource] = await Promise.all([
    readFile(new URL('../src/fishing/fishing.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(guideSource, /mode:\s*guide\.guideMode/);
  assert.match(styleSource, /data-guide-mode="atlas"[\s\S]{0,300}repeat\(4, minmax\(0, 1fr\)\)/);
});

test('a shiny failure is terminal and ignores all later rhythm input', () => {
  const session = new RhythmSession(createFishSpecimen('bluegill', .5, true, () => .5), 0, () => .5);
  session.missNote(session.pattern.notes[0]);
  assert.equal(session.result, 'escaped');
  const snapshot = {
    completedNotes: session.completedNotes,
    successfulNotes: session.successfulNotes,
    misses: session.misses,
    offBeatPresses: session.offBeatPresses,
    inputSerial: session.inputSerial
  };
  const next = session.pattern.notes.find((note) => note.status === 'pending');
  session.handleInput(next.lane, next.hitTime);
  session.registerOffBeat('A', next.hitTime);
  session.missNote(next);
  session.completeHold(next, next.hitTime);
  session.resolveOutcome();
  assert.equal(session.result, 'escaped');
  assert.deepEqual({
    completedNotes: session.completedNotes,
    successfulNotes: session.successfulNotes,
    misses: session.misses,
    offBeatPresses: session.offBeatPresses,
    inputSerial: session.inputSerial
  }, snapshot);
});

test('bench grounding samples the highest generated surface beneath a support', () => {
  const vertices = [
    [0, 0, 0], [2, 0, 0], [0, 1, 2],
    [0, -.5, 0], [2, -.5, 0], [0, -.5, 2]
  ];
  assert.equal(triangleSurfaceHeightAt(vertices, [[0, 1, 2], [3, 4, 5]], .5, .5), .25);
  assert.equal(triangleSurfaceHeightAt(vertices, [[0, 1, 2]], 5, 5, 7), 7);
});

test('every authored bench family has visible supports and shore benches use generated island triangles', async () => {
  const source = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(source, /this\.islandTerrainSurfaces\.set\(location\.id, \{ vertices, triangles \}\)/);
  assert.match(source, /triangleSurfaceHeightAt\([\s\S]{0,180}surface\?\.triangles/);
  assert.match(source, /Hearthward pond bench leg/);
  assert.match(source, /Glasswater Aquarium visitor bench leg/);
  assert.match(source, /topY - bottomY/);
});
