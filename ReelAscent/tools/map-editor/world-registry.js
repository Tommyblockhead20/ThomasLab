export const WORLD_EDITOR_WORLDS = Object.freeze([
  Object.freeze({
    id: 'stoneveil-peak', label: 'STONEVEIL PEAK', runtimeLocationId: 'main-mountain',
    dataUrl: '../../src/world/map-editor-patch.json', kind: 'stoneveil-legacy',
    capabilities: ['select', 'terrain', 'water', 'rocks', 'vegetation', 'decor', 'walkthrough', 'slope-diagnostic', 'collision-debug']
  }),
  Object.freeze({
    id: 'home-island', label: 'HEARTHWARD ISLE / HOME', runtimeLocationId: 'home-island',
    dataUrl: null, kind: 'production-island',
    capabilities: ['select', 'terrain', 'objects', 'water', 'walkthrough', 'collision-debug']
  }),
  Object.freeze({
    id: 'shop-island', label: "OUTFITTER'S REACH / SHOP", runtimeLocationId: 'shop-island',
    dataUrl: null, kind: 'production-island',
    capabilities: ['select', 'terrain', 'objects', 'water', 'walkthrough', 'collision-debug']
  }),
  Object.freeze({
    id: 'aquarium-island', label: 'GLASSWATER ISLE / AQUARIUM', runtimeLocationId: 'aquarium-island',
    dataUrl: null, kind: 'production-island',
    capabilities: ['select', 'terrain', 'objects', 'water', 'walkthrough', 'collision-debug']
  }),
  Object.freeze({
    id: 'cave-fishing-island', label: 'CAVE FISHING ISLAND / BASALT GROTTO', runtimeLocationId: 'cave-fishing-island',
    dataUrl: '../../src/world/world-editor-levels/cave-fishing-island.json', kind: 'generic',
    capabilities: ['select', 'terrain', 'objects', 'water', 'walkthrough', 'collision-debug']
  }),
  Object.freeze({
    id: 'skyscraper', label: 'SKYSCRAPER / ESB', runtimeLocationId: 'skyreach-foundation',
    dataUrl: '../../src/world/world-editor-levels/skyscraper.json', kind: 'generic',
    capabilities: ['select', 'objects', 'parkour', 'moving-platforms', 'prefabs', 'rooms', 'walkthrough', 'collision-debug']
  }),
  Object.freeze({
    id: 'pirate-island', label: 'PIRATE ISLAND', runtimeLocationId: 'pirate-island',
    dataUrl: '../../src/world/world-editor-levels/pirate-island.json', kind: 'generic',
    capabilities: ['select', 'terrain', 'objects', 'water', 'prefabs', 'rooms', 'walkthrough', 'collision-debug']
  }),
  Object.freeze({
    id: 'normal-fishing-island', label: 'MANGROVE CAY', runtimeLocationId: 'normal-fishing-island',
    dataUrl: null, kind: 'production-island',
    capabilities: ['select', 'terrain', 'objects', 'water', 'walkthrough', 'collision-debug']
  }),
  Object.freeze({
    id: 'cold-island', label: 'FROSTHOOK ISLE', runtimeLocationId: 'cold-island',
    dataUrl: null, kind: 'production-island',
    capabilities: ['select', 'terrain', 'objects', 'water', 'walkthrough', 'collision-debug']
  }),
  Object.freeze({
    id: 'library-island', label: 'LIBRARY ISLAND / VEILED ATHENAEUM', runtimeLocationId: 'veiled-athenaeum',
    dataUrl: '../../src/world/library-island-v2.scene.json', kind: 'library-authored-scene',
    capabilities: ['select', 'terrain', 'objects', 'water', 'prefabs', 'lights', 'markers', 'benches', 'walkthrough', 'collision-debug']
  })
]);

export const WORLD_EDITOR_WORLD_BY_ID = new Map(WORLD_EDITOR_WORLDS.map((world) => [world.id, world]));

export function getWorldEditorWorld(worldId) {
  return WORLD_EDITOR_WORLD_BY_ID.get(worldId) ?? WORLD_EDITOR_WORLDS[0];
}

export function worldHasCapability(worldId, capability) {
  return getWorldEditorWorld(worldId).capabilities.includes(capability);
}
