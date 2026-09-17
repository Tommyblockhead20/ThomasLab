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

const extra = (id, label, description, objects) => ({ id, label, description, objects });
ASSETS.push(
  extra('dock-corner', 'Dock corner', 'Right-angle timber dock module with grounded posts.', [
    box('Corner deck A',{x:0,y:.18,z:0},{x:4.5,y:.36,z:7},'wood'), box('Corner deck B',{x:3.4,y:.18,z:2.5},{x:4,y:.36,z:4.5},'wood'),
    ...[-1.8,1.8,5].flatMap((x,i)=>[-2.7,2.7].map((z,j)=>box(`Post ${i}-${j}`,{x,y:-.8,z},{x:.28,y:2.3,z:.28},'wood')))
  ]),
  extra('dock-t', 'Dock T junction', 'T-shaped dock junction for branching piers.', [
    box('Stem',{x:0,y:.18,z:1.5},{x:4,y:.36,z:9},'wood'), box('Cross',{x:0,y:.18,z:-3},{x:10,y:.36,z:4},'wood'),
    ...[-4.6,0,4.6].flatMap((x)=>[-4.6,-1.4].map((z)=>box(`Post ${x}-${z}`,{x,y:-.8,z},{x:.3,y:2.3,z:.3},'wood')))
  ]),
  extra('dock-stairs', 'Dock stairs', 'Six broad timber steps down to a lower landing.', Array.from({length:6},(_,i)=>box(`Step ${i+1}`,{x:0,y:.15+i*.28,z:-1.5+i*.55},{x:3.2,y:.3,z:.72},'wood'))),
  extra('dock-ladder', 'Dock ladder', 'Two rails and climb-readable rungs for a pier edge.', [
    ...[-.55,.55].map((x)=>box(`Rail ${x}`,{x,y:-.8,z:0},{x:.14,y:3,z:.14},'metal')),
    ...Array.from({length:7},(_,i)=>box(`Rung ${i+1}`,{x:0,y:-2+i*.42,z:0},{x:1.15,y:.11,z:.14},'metal'))
  ]),
  extra('rope-railing', 'Rope railing', 'Modular pier posts with two readable rope runs.', [
    ...[-2.5,0,2.5].map((x)=>box(`Post ${x}`,{x,y:.8,z:0},{x:.18,y:1.6,z:.18},'wood')),
    ...[.55,1.15].map((y)=>box(`Rope ${y}`,{x:0,y,z:0},{x:5.2,y:.09,z:.09},'fabric',{},false))
  ]),
  extra('plank-pile', 'Plank pile', 'Loose varied timber planks for shoreline and camp dressing.', Array.from({length:7},(_,i)=>box(`Plank ${i+1}`,{x:(i%3-1)*.18,y:.07+i*.09,z:(i%2)*.12},{x:3-i*.08,y:.12,z:.34},'wood',{x:0,y:(i%3-1)*7,z:(i%2?2:-2)}))),
  extra('ship-wheel', 'Ship wheel', 'Hub, spokes, and rim stand-in mounted on a pedestal.', [
    box('Pedestal',{x:0,y:.75,z:.25},{x:.3,y:1.5,z:.3},'wood'), box('Hub',{x:0,y:1.55,z:0},{x:.35,y:.35,z:.35},'metal'),
    ...Array.from({length:8},(_,i)=>box(`Spoke ${i+1}`,{x:Math.cos(i*Math.PI/4)*.55,y:1.55+Math.sin(i*Math.PI/4)*.55,z:0},{x:.12,y:1.4,z:.12},'wood',{x:0,y:0,z:45-i*45},false))
  ]),
  extra('pirate-cannon', 'Deck cannon', 'Climbable cannon carriage, barrel, and wheels.', [
    box('Carriage',{x:0,y:.42,z:0},{x:1.5,y:.65,z:2.2},'wood'), box('Barrel',{x:0,y:.95,z:-.35},{x:.48,y:.48,z:3.2},'metal',{x:-7,y:0,z:0}),
    ...[-.82,.82].flatMap((x)=>[-.65,.65].map((z)=>box(`Wheel ${x}-${z}`,{x,y:.35,z},{x:.24,y:.75,z:.75},'wood')))
  ]),
  extra('anchor', 'Anchor', 'Large iron anchor silhouette with shank, flukes, and crossbar.', [
    box('Shank',{x:0,y:1.25,z:0},{x:.24,y:2.5,z:.24},'metal'), box('Crossbar',{x:0,y:2.1,z:0},{x:2.1,y:.2,z:.2},'metal'),
    box('Fluke L',{x:-.6,y:.2,z:0},{x:1.2,y:.2,z:.45},'metal',{x:0,y:0,z:-22}), box('Fluke R',{x:.6,y:.2,z:0},{x:1.2,y:.2,z:.45},'metal',{x:0,y:0,z:22})
  ]),
  extra('barrel-stack', 'Barrel stack', 'Three cargo barrels stacked as a camp prop.', [
    box('Barrel A',{x:-.55,y:.55,z:0},{x:.9,y:1.1,z:.9},'wood'), box('Barrel B',{x:.55,y:.55,z:0},{x:.9,y:1.1,z:.9},'wood'), box('Barrel C',{x:0,y:1.55,z:0},{x:.9,y:1.1,z:.9},'wood')
  ]),
  extra('cargo-crates', 'Cargo crates', 'Varied stack of readable shipping crates.', [
    box('Crate large',{x:-.6,y:.65,z:0},{x:1.3,y:1.3,z:1.3},'wood'), box('Crate high',{x:.65,y:.48,z:.25},{x:1,y:.96,z:1},'wood'), box('Crate top',{x:.1,y:1.5,z:.05},{x:.85,y:.85,z:.85},'wood',{x:0,y:9,z:0})
  ]),
  extra('treasure-pile', 'Treasure pile', 'Treasure chest surrounded by gold-toned loot blocks.', [
    box('Chest',{x:0,y:.45,z:0},{x:1.8,y:.9,z:1.05},'wood'),
    ...Array.from({length:14},(_,i)=>box(`Coin cluster ${i+1}`,{x:(i%5-2)*.27,y:.08+Math.floor(i/5)*.08,z:-.75+(i%3)*.22},{x:.24,y:.12,z:.24},'accent',{},false))
  ]),
  extra('rope-coil', 'Rope coil', 'Layered rope bundle for dock and ship dressing.', Array.from({length:5},(_,i)=>box(`Coil ${i+1}`,{x:0,y:.08+i*.07,z:0},{x:1.7-i*.14,y:.08,z:1.7-i*.14},'fabric',{},false))),
  extra('campfire', 'Pirate campfire', 'Stone ring, crossed logs, and non-colliding flame forms.', [
    ...Array.from({length:8},(_,i)=>box(`Stone ${i+1}`,{x:Math.cos(i*Math.PI/4)*.75,y:.18,z:Math.sin(i*Math.PI/4)*.75},{x:.5,y:.36,z:.45},'stone',{x:0,y:i*22.5,z:0})),
    box('Logs',{x:0,y:.28,z:0},{x:1.5,y:.22,z:.25},'wood',{x:0,y:35,z:0}), box('Flame',{x:0,y:.85,z:0},{x:.65,y:1.2,z:.65},'accent',{},false)
  ]),
  extra('pirate-tent', 'Pirate tent', 'A-frame camp tent with fabric walls and ridge pole.', [
    box('Fabric left',{x:-.75,y:1.1,z:0},{x:.12,y:2.4,z:3.2},'fabric',{x:0,y:0,z:-35},false),
    box('Fabric right',{x:.75,y:1.1,z:0},{x:.12,y:2.4,z:3.2},'fabric',{x:0,y:0,z:35},false), box('Ridge',{x:0,y:2.05,z:0},{x:.16,y:.16,z:3.4},'wood')
  ]),
  extra('pirate-sign', 'Pirate sign', 'Post-and-board trail sign for authored landmarks.', [
    box('Post',{x:0,y:1.2,z:0},{x:.25,y:2.4,z:.25},'wood'), box('Board',{x:0,y:2.1,z:0},{x:2.4,y:.7,z:.18},'wood',{x:0,y:0,z:3})
  ]),
  extra('wooden-cage', 'Wooden cage', 'Open barred cage assembly with floor and top frame.', [
    box('Floor',{x:0,y:.1,z:0},{x:2.5,y:.2,z:2.5},'wood'), box('Top',{x:0,y:2.6,z:0},{x:2.5,y:.2,z:2.5},'wood'),
    ...[-1.1,0,1.1].flatMap((x)=>[-1.1,1.1].map((z)=>box(`Bar ${x}-${z}`,{x,y:1.35,z},{x:.12,y:2.5,z:.12},'wood')))
  ]),
  extra('dinghy', 'Small dinghy', 'Open small-boat hull assembled from keel, sides, and seats.', [
    box('Keel',{x:0,y:.35,z:0},{x:.35,y:.35,z:4.8},'wood'), box('Port',{x:-1,y:.7,z:0},{x:.25,y:1.2,z:4.4},'wood',{x:0,y:0,z:16}),
    box('Starboard',{x:1,y:.7,z:0},{x:.25,y:1.2,z:4.4},'wood',{x:0,y:0,z:-16}), ...[-1.2,0,1.2].map((z,i)=>box(`Seat ${i+1}`,{x:0,y:1.0,z},{x:1.8,y:.15,z:.4},'wood'))
  ]),
  extra('beach-vegetation', 'Beach grass + bushes', 'Low editable vegetation cluster for beach dressing.', [
    ...[-1.5,-.6,.2,.9,1.5].map((x,i)=>box(`Grass ${i+1}`,{x,y:.35+(i%2)*.15,z:(i%3-1)*.5},{x:.22,y:.7+(i%2)*.3,z:.22},'plant',{x:0,y:i*31,z:i%2?12:-12},false)),
    box('Bush',{x:0,y:.6,z:1.1},{x:1.8,y:1.2,z:1.5},'plant',{},false)
  ]),
  extra('driftwood', 'Driftwood cluster', 'Bleached shoreline logs and branches.', [
    box('Log',{x:0,y:.3,z:0},{x:.45,y:.45,z:4.8},'wood',{x:0,y:24,z:8}), box('Branch A',{x:-.8,y:.5,z:.7},{x:.22,y:.22,z:2.4},'wood',{x:15,y:-28,z:12}), box('Branch B',{x:.7,y:.45,z:-.3},{x:.18,y:.18,z:2.1},'wood',{x:-12,y:36,z:-9})
  ]),
  extra('coral-reef', 'Coral reef cluster', 'Reef rocks with branching coral silhouettes.', [
    box('Reef base',{x:0,y:.35,z:0},{x:3.4,y:.7,z:2.5},'stone',{x:4,y:18,z:3}),
    ...[-1.1,-.35,.45,1.1].map((x,i)=>box(`Coral ${i+1}`,{x,y:.9+(i%2)*.25,z:(i%3-1)*.35},{x:.18+i*.04,y:1.3+(i%2)*.5,z:.18+i*.04},'accent',{x:0,y:i*25,z:i%2?14:-10},false))
  ]),
  extra('ruined-arch', 'Ruined stone arch', 'Broken climbable arch for a pirate-island ruin.', [
    box('Left pier',{x:-1.8,y:1.7,z:0},{x:1,y:3.4,z:1.2},'stone',{x:0,y:0,z:-3}), box('Right pier',{x:1.8,y:1.35,z:0},{x:1,y:2.7,z:1.2},'stone',{x:0,y:0,z:4}), box('Broken lintel',{x:-.45,y:3.5,z:0},{x:2.9,y:.8,z:1.2},'stone',{x:0,y:0,z:-7})
  ]),
  extra('cave-mouth-pieces', 'Rock cave entrance', 'Three-piece rocky opening that preserves a real traversable center.', [
    box('Left rock',{x:-2.2,y:1.8,z:0},{x:1.6,y:3.6,z:2.1},'stone',{x:3,y:-8,z:-5}), box('Right rock',{x:2.2,y:1.7,z:0},{x:1.7,y:3.4,z:2.2},'stone',{x:-4,y:7,z:6}), box('Roof rock',{x:0,y:3.8,z:0},{x:5.4,y:1.4,z:2.3},'stone',{x:2,y:0,z:-3})
  ])
);

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
