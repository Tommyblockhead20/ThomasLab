import { makeBookshelfPrefab, makeFireplacePrefab } from './architectural-tools.js';

const part = (id, position, size, materialKey, options = {}) => ({
  id, name: options.name || id, type: options.type || 'box', category: options.category || 'architecture',
  transform: { position, rotation: options.rotation || { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  size, collision: options.collision !== false, visible: true,
  metadata: { materialKey, materialRole: materialKey, authoredPrimitive: options.type || 'box', ...(options.metadata || {}) }
});

const assembly = (id, name, worlds, category, description, objects) => ({
  id, name, worlds, category, description,
  definition: { id, name, kind: 'world-editor-v3-asset', version: 1, objects, movingPlatforms: [], waters: [], metadata: { category, description, editorAsset: true } }
});

const shelf = (id, name, options) => ({ id, name, worlds: ['library-island'], category: 'Library / Shelves', description: `${name} with a real frame, shelves, and individually varied books.`, definition: { ...makeBookshelfPrefab({ id, ...options }), name } });
const fire = (id, name, monumental) => ({ id, name, worlds: ['library-island'], category: 'Library / Fireplaces', description: `${name} with masonry, firebox, logs, visible flame geometry, and authored light metadata.`, definition: { ...makeFireplacePrefab({ id, monumental }), name } });

export const WORLD_EDITOR_V3_ASSETS = Object.freeze([
  shelf('athenaeum-shelf-standard-v3', 'Athenaeum Shelf — Standard', { width: 3.4, height: 3.6, shelfCount: 5 }),
  shelf('athenaeum-shelf-tall-v3', 'Athenaeum Shelf — Tall', { width: 3.8, height: 5.2, shelfCount: 7, bookDensity: .88 }),
  shelf('athenaeum-shelf-double-v3', 'Athenaeum Shelf — Double-sided', { width: 4.2, height: 4.1, shelfCount: 6, doubleSided: true }),
  fire('athenaeum-fireplace-v3', 'Athenaeum Fireplace', false),
  fire('athenaeum-monumental-fireplace-v3', 'Monumental Athenaeum Fireplace', true),
  assembly('basalt-natural-ledge-v3', 'Basalt Natural Ledge', ['cave-fishing-island'], 'Basalt / Traversal', 'Three irregular overlapping basalt forms for a climbable rest ledge.', [
    part('ledge-core', { x: 0, y: 0, z: 0 }, { x: 6.2, y: .8, z: 3.4 }, 'stoneDark', { type: 'sphere' }),
    part('ledge-left', { x: -2.1, y: -.25, z: .35 }, { x: 2.8, y: 1.5, z: 2.6 }, 'stone'),
    part('ledge-right', { x: 2.15, y: -.32, z: -.2 }, { x: 2.7, y: 1.35, z: 2.45 }, 'stone')
  ]),
  assembly('basalt-cave-arch-v3', 'Basalt Cave Arch', ['cave-fishing-island'], 'Basalt / Cave', 'Three-piece cave-mouth arch that leaves a real traversable center opening.', [
    part('arch-left', { x: -2.15, y: 2, z: 0 }, { x: 1.25, y: 4, z: 1.7 }, 'stoneDark'),
    part('arch-right', { x: 2.15, y: 2, z: 0 }, { x: 1.25, y: 4, z: 1.7 }, 'stoneDark'),
    part('arch-lintel', { x: 0, y: 4.15, z: 0 }, { x: 5.55, y: 1.15, z: 1.8 }, 'stoneDark')
  ]),
  assembly('basalt-column-cluster-v3', 'Basalt Column Cluster', ['cave-fishing-island'], 'Basalt / Detail', 'A varied climbable cluster rather than one repeated cube.', [
    part('column-a', { x: -1.1, y: 1.8, z: .2 }, { x: 1.25, y: 3.6, z: 1.2 }, 'stoneDark', { type: 'cylinder' }),
    part('column-b', { x: .1, y: 2.45, z: 0 }, { x: 1.4, y: 4.9, z: 1.35 }, 'stone', { type: 'cylinder' }),
    part('column-c', { x: 1.25, y: 1.45, z: -.15 }, { x: 1.1, y: 2.9, z: 1.05 }, 'stoneDark', { type: 'cylinder' })
  ]),
  assembly('pirate-rope-bridge-v3', 'Pirate Rope Bridge', ['pirate-island'], 'Pirate / Traversal', 'Linked planks, rails, and rope-like side spans for a readable crossing.', [
    ...Array.from({ length: 11 }, (_, index) => part(`plank-${index + 1}`, { x: 0, y: -.08 + Math.sin(index / 10 * Math.PI) * -.25, z: -5 + index }, { x: 2.3, y: .16, z: .72 }, 'wood', { rotation: { x: 0, y: (index % 3 - 1) * 2, z: (index % 2 ? 1 : -1) * 2 } })),
    part('rail-left', { x: -1.25, y: .8, z: 0 }, { x: .1, y: .1, z: 11 }, 'rope', { collision: false }),
    part('rail-right', { x: 1.25, y: .8, z: 0 }, { x: .1, y: .1, z: 11 }, 'rope', { collision: false })
  ]),
  assembly('pirate-watch-scaffold-v3', 'Pirate Watch Scaffold', ['pirate-island'], 'Pirate / Architecture', 'A climbable lookout with deck, posts, cross braces, ladder, and lantern hook.', [
    ...[-2, 2].flatMap((x) => [-2, 2].map((z) => part(`post-${x}-${z}`, { x, y: 2.6, z }, { x: .35, y: 5.2, z: .35 }, 'wood'))),
    part('deck', { x: 0, y: 4.8, z: 0 }, { x: 5.1, y: .28, z: 5.1 }, 'wood'),
    part('brace-a', { x: -2.05, y: 2.5, z: 0 }, { x: .18, y: 5.5, z: .18 }, 'wood', { rotation: { x: 45, y: 0, z: 0 } }),
    part('brace-b', { x: 2.05, y: 2.5, z: 0 }, { x: .18, y: 5.5, z: .18 }, 'wood', { rotation: { x: -45, y: 0, z: 0 } })
  ]),
  assembly('pirate-wreck-bow-v3', 'Pirate Wreck Bow', ['pirate-island'], 'Pirate / Landmark', 'A broken ship-bow landmark assembled from climbable hull planes and ribs.', [
    part('keel', { x: 0, y: 1.2, z: 0 }, { x: .45, y: .5, z: 8 }, 'woodDark', { rotation: { x: -12, y: 0, z: 0 } }),
    part('hull-left', { x: -1.6, y: 2, z: .2 }, { x: .35, y: 3.8, z: 7.2 }, 'wood', { rotation: { x: -8, y: 0, z: -24 } }),
    part('hull-right', { x: 1.6, y: 2, z: .2 }, { x: .35, y: 3.8, z: 7.2 }, 'wood', { rotation: { x: -8, y: 0, z: 24 } }),
    ...Array.from({ length: 5 }, (_, index) => part(`rib-${index}`, { x: 0, y: 1.1 + index * .35, z: -2.6 + index * 1.25 }, { x: 4.7 - index * .35, y: .22, z: .22 }, 'woodDark'))
  ])
]);

export function assetsForWorld(worldId) { return WORLD_EDITOR_V3_ASSETS.filter((asset) => asset.worlds.includes(worldId)); }
export function getV3Asset(id) { return WORLD_EDITOR_V3_ASSETS.find((asset) => asset.id === id) || null; }
