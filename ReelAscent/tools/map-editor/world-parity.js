const PROFILES = Object.freeze({
  'stoneveil-peak': Object.freeze({
    production: 'map-editor-patch.json frozen Stoneveil mesh + authored object overrides',
    editor: 'the same map-editor-patch.json',
    productionOnly: ['transient particles', 'runtime fishing interaction helpers'],
    editorOnly: ['selection helpers', 'diagnostic overlays'],
    origin: 'global world; main-mountain origin (260, 0, 0)',
    status: 'shared-authority'
  }),
  'cave-fishing-island': Object.freeze({
    production: 'buildCleanBasaltTerrainWorld() + canonical basalt-grotto descriptor',
    editor: 'buildCleanBasaltTerrainLocal() from the same cave-island-v23 module',
    productionOnly: ['fishing interaction volume'],
    editorOnly: ['authoring helpers'],
    origin: 'island-local editor coordinates translated by world-locations.js globalOrigin',
    status: 'shared-authority'
  }),
  'normal-fishing-island': Object.freeze({
    production: 'buildOceanIslandTerrainData(normal-fishing-island) + deterministic Mangrove decorators',
    editor: 'same terrain generator + deterministic edit-relevant production references',
    productionOnly: ['minor procedural shoreline dressing'],
    editorOnly: ['authoring helpers'],
    origin: 'island-local editor coordinates translated by world-locations.js globalOrigin',
    status: 'shared-terrain'
  }),
  'cold-island': Object.freeze({
    production: 'buildOceanIslandTerrainData(cold-island) + deterministic Frosthook decorators',
    editor: 'same terrain generator + edit-relevant production references',
    productionOnly: ['minor snow/ice dressing'],
    editorOnly: ['authoring helpers'],
    origin: 'island-local editor coordinates translated by world-locations.js globalOrigin',
    status: 'shared-terrain'
  }),
  'library-island': Object.freeze({
    production: 'library-island-v2.scene.json + buildOceanIslandTerrainData(veiled-athenaeum)',
    editor: 'same scene JSON + topology-only refined copy of the same terrain surface',
    productionOnly: ['batched shelf books', 'fishing/ride interaction helpers'],
    editorOnly: ['individual editable book records', 'terrain authoring topology'],
    origin: 'scene local root at world-locations.js Veiled Athenaeum origin',
    status: 'shared-authority'
  }),
  skyscraper: Object.freeze({
    production: 'world-locations.js Skyreach terrain + empire-state-building GLB',
    editor: 'same terrain generator + same GLB reference + authored level JSON',
    productionOnly: ['future gameplay systems'],
    editorOnly: ['route authoring helpers', 'cutaway controls'],
    origin: 'island-local level translated to Skyreach global origin; GLB bounds-grounded',
    status: 'shared-reference'
  }),
  'pirate-island': Object.freeze({
    production: 'no production destination/gameplay in v23.1',
    editor: 'pirate-island.json authored future-content candidate',
    productionOnly: [],
    editorOnly: ['entire future Pirate authoring scene'],
    origin: 'standalone island-local authoring space',
    status: 'editor-only-future'
  })
});

export function worldParityProfile(worldId) {
  return PROFILES[worldId] ?? Object.freeze({
    production: 'buildOceanIslandTerrainData() + active deterministic structure builder',
    editor: 'same terrain generator + edit-relevant production records',
    productionOnly: ['minor runtime-only decoration/interaction helpers'],
    editorOnly: ['authoring helpers'],
    origin: 'island-local editor coordinates translated by world-locations.js globalOrigin',
    status: 'shared-terrain'
  });
}

export function buildWorldParityDiagnostic(world, level = null) {
  const profile = worldParityProfile(world?.id);
  const terrainPositions = level?.terrain?.positions ?? [];
  const terrainIndices = level?.terrain?.indices ?? [];
  return Object.freeze({
    worldId: world?.id ?? level?.worldId ?? 'unknown',
    status: profile.status,
    productionSource: profile.production,
    editorSource: profile.editor,
    terrainVertices: Math.floor(terrainPositions.length / 3),
    terrainTriangles: Math.floor(terrainIndices.length / 3),
    objects: level?.objects?.length ?? 0,
    waters: level?.waters?.length ?? 0,
    prefabInstances: level?.prefabs?.instances?.length ?? 0,
    productionOnly: [...profile.productionOnly],
    editorOnly: [...profile.editorOnly],
    origin: profile.origin,
    globalOrigin: level?.metadata?.globalOrigin ?? null
  });
}
