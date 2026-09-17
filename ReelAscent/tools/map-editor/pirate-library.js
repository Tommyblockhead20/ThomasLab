const clone = (value) => structuredClone(value);

function box(name, position, size, materialKey = 'wood', rotation = { x: 0, y: 0, z: 0 }, collision = true) {
  return {
    name,
    type: 'box',
    category: 'pirate',
    transform: { position: { ...position }, rotation: { ...rotation }, scale: { x: 1, y: 1, z: 1 } },
    size: { ...size },
    collision,
    climbMaterial: materialKey === 'plant' ? 'ungrippable' : 'normal',
    visible: true,
    metadata: { materialKey, pirateLibrary: true }
  };
}

const ASSETS = [
  {
    id: 'dock-section', label: 'Dock section', description: 'Reusable timber dock segment with posts and side rails.', objects: [
      box('Dock deck', { x: 0, y: .18, z: 0 }, { x: 4.5, y: .36, z: 8 }, 'wood'),
      ...[-1.9, 1.9].flatMap((x) => [-3.2, 0, 3.2].map((z, i) => box(`Dock post ${x < 0 ? 'L' : 'R'}${i + 1}`, { x, y: -.75, z }, { x: .28, y: 2.2, z: .28 }, 'wood'))),
      box('Dock rail left', { x: -2.05, y: .85, z: 0 }, { x: .16, y: 1.0, z: 7.6 }, 'wood'),
      box('Dock rail right', { x: 2.05, y: .85, z: 0 }, { x: .16, y: 1.0, z: 7.6 }, 'wood')
    ]
  },
  {
    id: 'ship-bow', label: 'Shipwreck bow', description: 'Broken forward hull section for a grounded or reef-stranded wreck.', objects: [
      box('Bow keel', { x: 0, y: .45, z: 0 }, { x: .65, y: .75, z: 7.2 }, 'wood', { x: 0, y: 0, z: -8 }),
      box('Bow port hull', { x: -1.85, y: 1.3, z: 0 }, { x: .38, y: 2.6, z: 6.8 }, 'wood', { x: 0, y: -8, z: 16 }),
      box('Bow starboard hull', { x: 1.85, y: 1.3, z: 0 }, { x: .38, y: 2.6, z: 6.8 }, 'wood', { x: 0, y: 8, z: -16 }),
      box('Bow deck remnant', { x: 0, y: 1.55, z: -1.0 }, { x: 3.8, y: .24, z: 4.6 }, 'wood', { x: 0, y: 0, z: -5 }),
      box('Broken bowsprit', { x: 0, y: 2.15, z: -4.6 }, { x: .28, y: .28, z: 5.2 }, 'wood', { x: -12, y: 0, z: 0 })
    ]
  },
  {
    id: 'ship-mid', label: 'Shipwreck midsection', description: 'Open hull/deck section with ribs, useful as a climb-through module.', objects: [
      box('Mid deck', { x: 0, y: 1.25, z: 0 }, { x: 5.2, y: .24, z: 7.0 }, 'wood'),
      box('Mid port hull', { x: -2.45, y: .7, z: 0 }, { x: .35, y: 2.4, z: 7.0 }, 'wood', { x: 0, y: 0, z: 12 }),
      box('Mid starboard hull', { x: 2.45, y: .7, z: 0 }, { x: .35, y: 2.4, z: 7.0 }, 'wood', { x: 0, y: 0, z: -12 }),
      ...[-2.6, 0, 2.6].flatMap((z, i) => [
        box(`Hull rib L${i + 1}`, { x: -1.55, y: 2.0, z }, { x: .22, y: 2.0, z: .22 }, 'wood', { x: 0, y: 0, z: -18 }),
        box(`Hull rib R${i + 1}`, { x: 1.55, y: 2.0, z }, { x: .22, y: 2.0, z: .22 }, 'wood', { x: 0, y: 0, z: 18 })
      ])
    ]
  },
  {
    id: 'ship-stern', label: 'Shipwreck stern', description: 'Raised rear wreck section with quarterdeck and broken transom.', objects: [
      box('Stern lower deck', { x: 0, y: 1.0, z: 0 }, { x: 5.2, y: .26, z: 5.6 }, 'wood'),
      box('Stern quarterdeck', { x: 0, y: 2.25, z: 1.0 }, { x: 4.4, y: .25, z: 3.1 }, 'wood'),
      box('Stern transom', { x: 0, y: 1.75, z: 2.75 }, { x: 4.8, y: 2.9, z: .34 }, 'wood', { x: -5, y: 0, z: 0 }),
      box('Stern cabin wall left', { x: -2.05, y: 2.85, z: .8 }, { x: .24, y: 1.6, z: 2.8 }, 'wood'),
      box('Stern cabin wall right', { x: 2.05, y: 2.85, z: .8 }, { x: .24, y: 1.6, z: 2.8 }, 'wood')
    ]
  },
  {
    id: 'mast-rig', label: 'Broken mast + rig', description: 'Climbable mast, cross spar and torn-sail stand-in.', objects: [
      box('Broken mast', { x: 0, y: 4.0, z: 0 }, { x: .42, y: 8.0, z: .42 }, 'wood', { x: 0, y: 0, z: 7 }),
      box('Cross spar', { x: 0, y: 5.4, z: 0 }, { x: 6.2, y: .25, z: .25 }, 'wood', { x: 0, y: 0, z: -8 }),
      box('Torn sail panel', { x: 1.2, y: 4.25, z: .12 }, { x: 2.4, y: 2.4, z: .08 }, 'fabric', { x: 0, y: 0, z: -8 }, false)
    ]
  },
  {
    id: 'treasure-camp', label: 'Treasure camp', description: 'Crates, chest stand-in, table and lantern cluster.', objects: [
      box('Treasure chest base', { x: 0, y: .42, z: 0 }, { x: 1.8, y: .84, z: 1.0 }, 'wood'),
      box('Treasure chest lid', { x: 0, y: .92, z: .08 }, { x: 1.9, y: .22, z: 1.05 }, 'accent', { x: -12, y: 0, z: 0 }),
      box('Cargo crate A', { x: -1.9, y: .55, z: .8 }, { x: 1.2, y: 1.1, z: 1.2 }, 'wood'),
      box('Cargo crate B', { x: 1.9, y: .4, z: .95 }, { x: 1.0, y: .8, z: 1.0 }, 'wood'),
      box('Camp table', { x: 0, y: .78, z: -1.8 }, { x: 2.8, y: .18, z: 1.2 }, 'wood'),
      box('Lantern post', { x: 2.4, y: 1.5, z: -1.4 }, { x: .16, y: 3.0, z: .16 }, 'metal')
    ]
  },
  {
    id: 'palm-cluster', label: 'Palm cluster', description: 'Three stylized palms for quick island dressing.', objects: [-2.1, 0, 2.0].flatMap((x, i) => [
      box(`Palm ${i + 1} trunk`, { x, y: 2.5 + i * .25, z: i === 1 ? .9 : 0 }, { x: .38, y: 5 + i * .5, z: .38 }, 'wood', { x: 0, y: i * 17, z: i === 1 ? 7 : -5 }),
      box(`Palm ${i + 1} crown`, { x, y: 5.1 + i * .5, z: i === 1 ? .9 : 0 }, { x: 3.2, y: .35, z: 3.2 }, 'plant', { x: 0, y: i * 31, z: 0 }, false)
    ])
  },
  {
    id: 'reef-rocks', label: 'Reef / shoreline rocks', description: 'Low rocky cluster for reefs, beaches, and wreck grounding.', objects: [
      box('Reef rock A', { x: -2.1, y: .45, z: .3 }, { x: 2.8, y: .9, z: 2.0 }, 'stone', { x: 8, y: 18, z: 7 }),
      box('Reef rock B', { x: .2, y: .7, z: -.5 }, { x: 3.2, y: 1.4, z: 2.5 }, 'stone', { x: -6, y: -14, z: 12 }),
      box('Reef rock C', { x: 2.7, y: .38, z: .8 }, { x: 2.0, y: .76, z: 1.7 }, 'stone', { x: 5, y: 28, z: -9 })
    ]
  }
];

export const PIRATE_ASSET_LIBRARY = Object.freeze(ASSETS);

export function getPirateAsset(id) {
  return PIRATE_ASSET_LIBRARY.find((asset) => asset.id === id) ?? PIRATE_ASSET_LIBRARY[0];
}

export function makePirateAssetDefinition(id) {
  const asset = getPirateAsset(id);
  return {
    id: `PIRATE-ASSET-${asset.id.toUpperCase()}-V1`,
    name: asset.label,
    kind: 'assembly',
    version: 1,
    objects: asset.objects.map((object, index) => ({
      ...clone(object),
      id: `PIRATE-${asset.id.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
      metadata: { ...(object.metadata ?? {}), pirateAssetId: asset.id, pirateLibrary: true }
    })),
    movingPlatforms: [],
    waters: [],
    metadata: { pirateLibrary: true, pirateAssetId: asset.id, description: asset.description }
  };
}
