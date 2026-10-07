import test from 'node:test';
import assert from 'node:assert/strict';
import SCENE from '../src/world/library-island-v2.scene.json' with { type: 'json' };
import { SaveSystem } from '../src/persistence/save-system.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import { EQUIPMENT_CATALOG } from '../src/progression/equipment.js';
import { COSMETIC_CATALOG } from '../src/progression/cosmetics.js';
import { MAP_ITEMS } from '../src/world/world-locations.js';
import { buildCleanBasaltTerrainLocal } from '../src/world/cave-island-v23.js';
import { TRIANGLE_PRISM_INDICES, TRIANGLE_PRISM_POSITIONS } from '../src/world/triangle-prism.js';
import { adaptLibrarySceneToEditor, normalizeLibraryEditorPayload, serializeLibrarySceneFromEditor } from '../tools/map-editor/library-scene-adapter.js';
import { makeCleanCaveEditorLevel } from '../tools/map-editor/production-island-adapter.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('Basalt editor starts from the exact shared game core, not the obsolete captured shell', () => {
  const level = makeCleanCaveEditorLevel();
  const core = buildCleanBasaltTerrainLocal();
  assert.equal(level.terrain.mode, 'authored-triangle-mesh');
  assert.deepEqual(level.terrain.positions, core.positions);
  assert.deepEqual(level.terrain.indices, core.indices);
});

test('Library undo/autosave payload round-trip retains edited terrain and objects', () => {
  const before = adaptLibrarySceneToEditor(SCENE);
  before.terrain.positions[0] += .375;
  before.objects[0].name = 'Edited Library Part';
  const after = normalizeLibraryEditorPayload(JSON.parse(JSON.stringify(before)));
  assert.equal(after.terrain.positions[0], before.terrain.positions[0]);
  assert.equal(after.objects[0].name, 'Edited Library Part');
});

test('triangle prism is a closed eight-triangle shape', () => {
  assert.equal(TRIANGLE_PRISM_POSITIONS.length / 3, 6);
  assert.equal(TRIANGLE_PRISM_INDICES.length / 3, 8);
  const edges = new Map();
  for (let i = 0; i < TRIANGLE_PRISM_INDICES.length; i += 3) {
    for (const [a, b] of [
      [TRIANGLE_PRISM_INDICES[i], TRIANGLE_PRISM_INDICES[i + 1]],
      [TRIANGLE_PRISM_INDICES[i + 1], TRIANGLE_PRISM_INDICES[i + 2]],
      [TRIANGLE_PRISM_INDICES[i + 2], TRIANGLE_PRISM_INDICES[i]]
    ]) {
      const key = [a, b].sort((x, y) => x - y).join(':');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every((count) => count === 2));
});

test('Library scene export retains the new triangle shape for gameplay', () => {
  const editor = adaptLibrarySceneToEditor(SCENE);
  const part = editor.objects.find((item) => item.metadata?.librarySourceKind === 'part');
  part.type = 'triangle-prism';
  part.metadata.authoredPrimitive = 'triangle-prism';
  const exported = serializeLibrarySceneFromEditor(editor);
  assert.equal(exported.parts.find((item) => item.id === part.id)?.type, 'triangle-prism');
});

test('debug item grant persists on one save without fabricating catches or earnings', () => {
  const storage = new MemoryStorage();
  const saves = new SaveSystem(storage);
  const beforeCollection = structuredClone(saves.data.collection);
  const beforeEarnings = saves.data.lifetime?.moneyEarned;
  new ProgressionSystem(saves).debugUnlockAllItems();
  const reloaded = new SaveSystem(storage);
  const state = reloaded.data.progression;
  assert.ok(EQUIPMENT_CATALOG.every((item) => state.ownedEquipment.includes(item.id)));
  assert.ok(MAP_ITEMS.every((item) => state.ownedItems.includes(item.id)));
  assert.ok(COSMETIC_CATALOG.every((item) => state.ownedCosmetics.includes(item.id)));
  assert.equal(reloaded.data.boat.owned, true);
  assert.deepEqual(reloaded.data.collection, beforeCollection);
  assert.equal(reloaded.data.lifetime?.moneyEarned, beforeEarnings);
});
