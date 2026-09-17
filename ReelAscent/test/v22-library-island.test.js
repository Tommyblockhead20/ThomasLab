import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { BASELINE_SPECIES_PROBABILITY_CAPS } from '../src/fishing/ecology-config.js';
import { getWeightedSpeciesTable } from '../src/fishing/fish-data.js';
import { attachZoneEcology } from '../src/fishing/fish-ecology.js';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import {
  LIBRARY_WATER_IDS,
  adaptLibrarySceneToEditor,
  serializeLibrarySceneFromEditor,
  validateLibraryAuthoredScene
} from '../tools/map-editor/library-scene-adapter.js';

const scene = JSON.parse(fs.readFileSync('src/world/library-island-v2.scene.json', 'utf8'));
const mountainSource = fs.readFileSync('src/world/mountain-v2.js', 'utf8');
const registrySource = fs.readFileSync('tools/map-editor/world-registry.js', 'utf8');

test('v22 authored scene validates and retains the production entity budget', () => {
  assert.deepEqual(validateLibraryAuthoredScene(scene), []);
  const renderCount = scene.parts.length
    + scene.instances.reduce((sum, instance) => sum + scene.prefabs[instance.prefab].parts.length, 0)
    + scene.benches.length * 2;
  assert.ok(renderCount >= 400, 'v3 shelf/fireplace geometry should remain present');
  assert.ok(renderCount <= scene.performance.maximumAuthoredRenderEntities);
  assert.equal(scene.lights.length, 9);
  assert.equal(scene.parts.filter((part) => part.material === 'mist').length, 6);
});

test('v22 editor adapter is lossless for an untouched scene', () => {
  const editor = adaptLibrarySceneToEditor(scene);
  assert.deepEqual(serializeLibrarySceneFromEditor(editor), scene);
  assert.equal(editor.objects.length, scene.parts.length + scene.lights.length + scene.markers.length + scene.benches.length);
  assert.equal(editor.prefabs.instances.length, scene.instances.length);
});

test('v22 unrelated edits preserve unknown future scene and record properties', () => {
  const future = structuredClone(scene);
  future.futureSceneMetadata = { retained: true, nested: ['alpha', 22] };
  future.parts[4].futurePartProperty = { shaderHint: 'keep-me' };
  future.prefabs['shelf-bay'].futurePrefabProperty = 'preserved';
  future.waters[0].futureEcologyProperty = { migrationVersion: 9 };
  const editor = adaptLibrarySceneToEditor(future);
  editor.objects.find((item) => item.id === 'arrival-plinth').transform.position.y += .1;
  const saved = serializeLibrarySceneFromEditor(editor);
  assert.deepEqual(saved.futureSceneMetadata, future.futureSceneMetadata);
  assert.deepEqual(saved.parts[4].futurePartProperty, future.parts[4].futurePartProperty);
  assert.equal(saved.prefabs['shelf-bay'].futurePrefabProperty, 'preserved');
  assert.deepEqual(saved.waters[0].futureEcologyProperty, future.waters[0].futureEcologyProperty);
});

test('v22 direct parts, prefab instances, and waters round-trip through shared local coordinates', () => {
  const editor = adaptLibrarySceneToEditor(scene);
  const direct = editor.objects.find((item) => item.id === 'arrival-plinth');
  direct.transform.position.x += 2.25;
  direct.size.z += .75;
  const instance = editor.prefabs.instances.find((item) => item.id === 'entry-arch');
  instance.transform.position.z -= 1.5;
  instance.transform.rotation.y = 17;
  const water = editor.waters.find((item) => item.id === 'athenaeum-atrium-basin');
  water.position.x += 1;
  water.radii.x += .5;
  const saved = serializeLibrarySceneFromEditor(editor);
  assert.equal(saved.parts.find((item) => item.id === direct.id).position[0], direct.transform.position.x);
  assert.equal(saved.parts.find((item) => item.id === direct.id).size[2], direct.size.z);
  assert.equal(saved.instances.find((item) => item.id === instance.id).position[2], instance.transform.position.z);
  assert.equal(saved.instances.find((item) => item.id === instance.id).rotation[1], 17);
  assert.equal(saved.waters.find((item) => item.id === water.id).centerLocal[0], water.position.x);
  assert.equal(saved.waters.find((item) => item.id === water.id).radii[0], water.radii.x);
  assert.deepEqual(saved.waters.map((item) => item.id), LIBRARY_WATER_IDS);
});

test('v22 production and editor both point at the same authoritative scene', () => {
  assert.match(mountainSource, /import \{ buildVeiledAthenaeumV2 \} from '\.\/library-island-v2\.js'/);
  assert.match(mountainSource, /const report = buildVeiledAthenaeumV2\(this, location\)/);
  assert.doesNotMatch(mountainSource, /Veiled Athenaeum obscured foundation/);
  assert.match(registrySource, /library-island-v2\.scene\.json/);
  assert.match(registrySource, /kind: 'library-authored-scene'/);
});

test('v22 authored fishing waters keep stable identities and nonempty explicit pools', () => {
  assert.deepEqual(scene.waters.map((water) => water.id), LIBRARY_WATER_IDS);
  for (const water of scene.waters) {
    assert.ok(water.fishIds.length >= 4, `${water.id} should retain its authored fish pool`);
    assert.ok(water.surfaceLocalY > water.floorLocalY, `${water.id} should have positive depth`);
  }
});

test('v22 authored water anchors remain present in structurally valid basic-tackle pools', () => {
  for (const water of scene.waters) {
    const zone = new FishingZone({
      id: water.id, label: water.label, center: { x: 0, z: 0 }, radii: { x: 3, z: 3 },
      surfaceY: 0, floorY: -1, fishIds: water.fishIds, modifiers: water.modifiers
    });
    Object.assign(zone, {
      tier: water.tier ?? 'lower', waterType: water.waterType, theme: water.theme,
      ecologyThemes: water.ecologyThemes, cave: Boolean(water.cave),
      authoredFishIds: [...water.fishIds], probabilityGroup: water.probabilityGroup ?? water.id
    });
    attachZoneEcology(zone);
    assert.ok(water.fishIds.every((id) => zone.fishIds.includes(id)), `${water.id} lost an authored anchor`);
    assert.doesNotThrow(() => getWeightedSpeciesTable(zone.fishIds, {
      ...zone.modifiers, habitatWeights: zone.ecologyWeights, disablePoolEnrichment: true,
      baselineSpeciesProbabilityCaps: BASELINE_SPECIES_PROBABILITY_CAPS
    }));
  }
});
