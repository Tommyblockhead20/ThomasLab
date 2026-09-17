const clone = (value) => structuredClone(value);

function box(name, position, size, {
  materialKey = 'wall', collision = true, climbMaterial = 'ungrippable', rotation = { x: 0, y: 0, z: 0 }, metadata = {}
} = {}) {
  return {
    name,
    type: 'box',
    category: 'room',
    transform: { position: { ...position }, rotation: { ...rotation }, scale: { x: 1, y: 1, z: 1 } },
    size: { ...size },
    collision,
    climbMaterial,
    visible: true,
    metadata: { materialKey, ...metadata }
  };
}


function water(id, name, position, radii, {
  depthMeters = .45,
  fishingZoneScale = 1,
  fishIds = [],
  color = '#269eb8',
  componentId = 'water',
  metadata = {}
} = {}) {
  return {
    id,
    name,
    identity: id,
    position: { ...position },
    radii: { ...radii },
    depthMeters,
    fishingZoneScale,
    color,
    fishIds: [...fishIds],
    metadata: {
      roomFishingWater: true,
      componentId,
      ...metadata
    }
  };
}

const shell = (width, depth, height, { doorwayWidth = 2.2, backWindows = false } = {}) => [
  box('Floor slab', { x: 0, y: -.12, z: 0 }, { x: width, y: .24, z: depth }, { materialKey: 'floor' }),
  box('Left wall', { x: -width / 2 + .11, y: height / 2, z: 0 }, { x: .22, y: height, z: depth }, { materialKey: 'wall' }),
  box('Right wall', { x: width / 2 - .11, y: height / 2, z: 0 }, { x: .22, y: height, z: depth }, { materialKey: 'wall' }),
  box('Back wall left', { x: -(width + doorwayWidth) / 4, y: height / 2, z: depth / 2 - .11 }, { x: (width - doorwayWidth) / 2, y: height, z: .22 }, { materialKey: backWindows ? 'glass' : 'wall' }),
  box('Back wall right', { x: (width + doorwayWidth) / 4, y: height / 2, z: depth / 2 - .11 }, { x: (width - doorwayWidth) / 2, y: height, z: .22 }, { materialKey: backWindows ? 'glass' : 'wall' }),
  box('Front wall left', { x: -(width + doorwayWidth) / 4, y: height / 2, z: -depth / 2 + .11 }, { x: (width - doorwayWidth) / 2, y: height, z: .22 }, { materialKey: 'wall' }),
  box('Front wall right', { x: (width + doorwayWidth) / 4, y: height / 2, z: -depth / 2 + .11 }, { x: (width - doorwayWidth) / 2, y: height, z: .22 }, { materialKey: 'wall' }),
  box('Door header', { x: 0, y: height - .34, z: -depth / 2 + .11 }, { x: doorwayWidth, y: .68, z: .22 }, { materialKey: 'trim' })
];

const ceiling = (width, depth, height, lights = []) => [
  box('Ceiling slab', { x: 0, y: height + .09, z: 0 }, { x: width, y: .18, z: depth }, { materialKey: 'ceiling' }),
  ...lights.map((p, i) => box(`Ceiling light ${i + 1}`, { x: p.x, y: height - .06, z: p.z }, { x: 1.25, y: .08, z: .45 }, { materialKey: 'light', collision: false }))
];

const bathroom = {
  id: 'bathroom', label: 'Bathroom', description: 'Complete public restroom with stalls, fixtures, vanity, storage and lighting.',
  dimensions: { x: 12, y: 3.4, z: 8.5 },
  waters: [
    water('skyreach-toilet', 'Skyscraper Restroom Toilet', { x: -3.3, y: .57, z: 2.08 }, { x: .28, z: .22 }, {
      depthMeters: .22, fishingZoneScale: 1.05, fishIds: ['weather-loach', 'golden-shiner'], componentId: 'toilets',
      metadata: { physicalSource: 'Toilet bowl', waterType: 'tiny-freshwater', jokeFishing: true }
    })
  ],
  components: [
    { id: 'shell', label: 'Shell + doorway', offset: { x: 0, y: 0, z: 0 }, objects: shell(12, 8.5, 3.4, { doorwayWidth: 2.2 }) },
    { id: 'stalls', label: 'Stall bank', offset: { x: -3.3, y: 0, z: 1.3 }, objects: [
      box('Stall divider A', { x: -1.15, y: 1.25, z: 0 }, { x: .12, y: 2.5, z: 3.0 }, { materialKey: 'partition' }),
      box('Stall divider B', { x: 1.15, y: 1.25, z: 0 }, { x: .12, y: 2.5, z: 3.0 }, { materialKey: 'partition' }),
      box('Stall front A', { x: -2.2, y: 1.25, z: -1.42 }, { x: 1.9, y: 2.5, z: .1 }, { materialKey: 'partition' }),
      box('Stall front B', { x: 0, y: 1.25, z: -1.42 }, { x: 1.9, y: 2.5, z: .1 }, { materialKey: 'partition' }),
      box('Stall front C', { x: 2.2, y: 1.25, z: -1.42 }, { x: 1.9, y: 2.5, z: .1 }, { materialKey: 'partition' })
    ]},
    { id: 'toilets', label: 'Toilets + tanks', offset: { x: -3.3, y: 0, z: 2.25 }, objects: [-2.2, 0, 2.2].flatMap((x, i) => [
      box(`Toilet ${i + 1} base`, { x, y: .27, z: 0 }, { x: .62, y: .54, z: .82 }, { materialKey: 'fixture' }),
      box(`Toilet ${i + 1} tank`, { x, y: .7, z: .3 }, { x: .58, y: .72, z: .24 }, { materialKey: 'fixture' })
    ])},
    { id: 'vanity', label: 'Double vanity + sinks', offset: { x: 3.25, y: 0, z: 1.55 }, objects: [
      box('Vanity cabinet', { x: 0, y: .48, z: 0 }, { x: 3.7, y: .96, z: .72 }, { materialKey: 'wood' }),
      box('Countertop', { x: 0, y: 1.02, z: 0 }, { x: 4.0, y: .12, z: .82 }, { materialKey: 'stone' }),
      box('Sink left', { x: -1.05, y: 1.1, z: 0 }, { x: .78, y: .12, z: .48 }, { materialKey: 'fixture', collision: false }),
      box('Sink right', { x: 1.05, y: 1.1, z: 0 }, { x: .78, y: .12, z: .48 }, { materialKey: 'fixture', collision: false }),
      box('Faucet left', { x: -1.05, y: 1.32, z: .2 }, { x: .08, y: .42, z: .08 }, { materialKey: 'metal', collision: false }),
      box('Faucet right', { x: 1.05, y: 1.32, z: .2 }, { x: .08, y: .42, z: .08 }, { materialKey: 'metal', collision: false })
    ]},
    { id: 'mirror', label: 'Mirror + backsplash', offset: { x: 3.25, y: 0, z: 2.02 }, objects: [
      box('Backsplash', { x: 0, y: 1.35, z: .28 }, { x: 4.2, y: .58, z: .08 }, { materialKey: 'tile', collision: false }),
      box('Mirror', { x: 0, y: 2.03, z: .32 }, { x: 3.8, y: 1.18, z: .06 }, { materialKey: 'glass', collision: false })
    ]},
    { id: 'storage', label: 'Bench + storage', offset: { x: 3.7, y: 0, z: -2.55 }, objects: [
      box('Bench', { x: 0, y: .34, z: 0 }, { x: 3.2, y: .32, z: .72 }, { materialKey: 'wood' }),
      box('Bench support left', { x: -1.2, y: .15, z: 0 }, { x: .18, y: .3, z: .56 }, { materialKey: 'metal' }),
      box('Bench support right', { x: 1.2, y: .15, z: 0 }, { x: .18, y: .3, z: .56 }, { materialKey: 'metal' }),
      box('Supply cabinet', { x: 1.95, y: 1.0, z: .18 }, { x: .95, y: 2.0, z: .66 }, { materialKey: 'metal' })
    ]},
    { id: 'entry', label: 'Entry signage + trash', offset: { x: 0, y: 0, z: -3.35 }, objects: [
      box('Entry sign', { x: 0, y: 2.45, z: .02 }, { x: 1.9, y: .42, z: .08 }, { materialKey: 'accent', collision: false }),
      box('Trash bin', { x: 2.1, y: .48, z: .32 }, { x: .58, y: .96, z: .58 }, { materialKey: 'dark' })
    ]},
    { id: 'ceiling', label: 'Ceiling + lights', offset: { x: 0, y: 0, z: 0 }, objects: ceiling(12, 8.5, 3.4, [{ x: -3.3, z: 0 }, { x: 0, z: 0 }, { x: 3.3, z: 0 }]) }
  ]
};

const restaurant = {
  id: 'restaurant', label: 'Restaurant', description: 'Finished Art-Deco restaurant blockout with host stand, bar, dining clusters and service pass.',
  dimensions: { x: 24, y: 4.1, z: 13 },
  waters: [
    water('skyreach-restaurant-aquarium', 'Skyscraper Restaurant Aquarium', { x: 8.5, y: 1.45, z: -3.95 }, { x: 1.55, z: .48 }, {
      depthMeters: .82, fishingZoneScale: .9, fishIds: ['bluegill', 'golden-shiner', 'pumpkinseed'], componentId: 'aquarium',
      metadata: { physicalSource: 'Dining-room fish tank', waterType: 'aquarium' }
    })
  ],
  components: [
    { id: 'shell', label: 'Shell + window wall', offset: { x: 0, y: 0, z: 0 }, objects: shell(24, 13, 4.1, { doorwayWidth: 3.2, backWindows: true }) },
    { id: 'host', label: 'Host + entry', offset: { x: 0, y: 0, z: -4.8 }, objects: [
      box('Host stand', { x: 0, y: .62, z: 0 }, { x: 2.4, y: 1.24, z: .72 }, { materialKey: 'wood' }),
      box('Host brass rail', { x: 0, y: 1.36, z: .18 }, { x: 2.55, y: .08, z: .08 }, { materialKey: 'accent', collision: false }),
      box('Restaurant sign', { x: 0, y: 2.6, z: .32 }, { x: 3.8, y: .58, z: .08 }, { materialKey: 'accent', collision: false })
    ]},
    { id: 'bar', label: 'Bar + backbar', offset: { x: -8.4, y: 0, z: 1.6 }, objects: [
      box('Bar counter', { x: 0, y: .62, z: 0 }, { x: 5.8, y: 1.24, z: .9 }, { materialKey: 'wood' }),
      box('Bar top', { x: 0, y: 1.28, z: 0 }, { x: 6.1, y: .12, z: 1.02 }, { materialKey: 'stone' }),
      box('Backbar', { x: 0, y: 1.3, z: 1.35 }, { x: 5.8, y: 2.6, z: .46 }, { materialKey: 'dark' }),
      ...[-2, -.7, .7, 2].map((x, i) => box(`Bar stool ${i + 1}`, { x, y: .43, z: -.9 }, { x: .48, y: .86, z: .48 }, { materialKey: 'fabric' }))
    ]},
    { id: 'booths', label: 'Window booths', offset: { x: 7.4, y: 0, z: 3.7 }, objects: [-3.1, 0, 3.1].flatMap((x, i) => [
      box(`Booth ${i + 1} table`, { x, y: .72, z: 0 }, { x: 2.1, y: .14, z: 1.3 }, { materialKey: 'wood' }),
      box(`Booth ${i + 1} seat A`, { x, y: .58, z: -.9 }, { x: 2.35, y: .84, z: .66 }, { materialKey: 'fabric' }),
      box(`Booth ${i + 1} seat B`, { x, y: .58, z: .9 }, { x: 2.35, y: .84, z: .66 }, { materialKey: 'fabric' })
    ])},
    { id: 'tables-a', label: 'Dining cluster A', offset: { x: -1.5, y: 0, z: .7 }, objects: [-2.3, 2.3].flatMap((x, i) => [
      box(`Dining A${i + 1} table`, { x, y: .74, z: 0 }, { x: 2.1, y: .14, z: 1.5 }, { materialKey: 'wood' }),
      box(`Dining A${i + 1} chair north`, { x, y: .48, z: 1.15 }, { x: .62, y: .96, z: .62 }, { materialKey: 'fabric' }),
      box(`Dining A${i + 1} chair south`, { x, y: .48, z: -1.15 }, { x: .62, y: .96, z: .62 }, { materialKey: 'fabric' })
    ])},
    { id: 'tables-b', label: 'Dining cluster B', offset: { x: 2.1, y: 0, z: -3.2 }, objects: [-2.4, 1.1, 4.6].flatMap((x, i) => [
      box(`Dining B${i + 1} table`, { x, y: .72, z: 0 }, { x: 1.8, y: .14, z: 1.3 }, { materialKey: 'wood' }),
      box(`Dining B${i + 1} chair left`, { x: x - 1.15, y: .46, z: 0 }, { x: .58, y: .92, z: .58 }, { materialKey: 'fabric' }),
      box(`Dining B${i + 1} chair right`, { x: x + 1.15, y: .46, z: 0 }, { x: .58, y: .92, z: .58 }, { materialKey: 'fabric' })
    ])},
    { id: 'service', label: 'Kitchen/service pass', offset: { x: -7.8, y: 0, z: -3.8 }, objects: [
      box('Service counter', { x: 0, y: .7, z: 0 }, { x: 6.0, y: 1.4, z: .8 }, { materialKey: 'metal' }),
      box('Service pass shelf', { x: 0, y: 1.75, z: .25 }, { x: 5.7, y: .12, z: .52 }, { materialKey: 'metal' }),
      box('Kitchen screen', { x: 0, y: 2.45, z: .4 }, { x: 6.2, y: 1.25, z: .12 }, { materialKey: 'tile' })
    ]},
    { id: 'decor', label: 'Planters + divider', offset: { x: 0, y: 0, z: 3.7 }, objects: [
      box('Dining divider', { x: -2.2, y: 1.0, z: 0 }, { x: 4.2, y: 2.0, z: .16 }, { materialKey: 'dark' }),
      box('Planter left', { x: 2.2, y: .36, z: 0 }, { x: 1.1, y: .72, z: 1.1 }, { materialKey: 'stone' }),
      box('Plant left', { x: 2.2, y: 1.1, z: 0 }, { x: .72, y: 1.0, z: .72 }, { materialKey: 'plant', collision: false }),
      box('Planter right', { x: 4.2, y: .36, z: 0 }, { x: 1.1, y: .72, z: 1.1 }, { materialKey: 'stone' }),
      box('Plant right', { x: 4.2, y: 1.1, z: 0 }, { x: .72, y: 1.0, z: .72 }, { materialKey: 'plant', collision: false })
    ]},
    { id: 'aquarium', label: 'Fish tank', offset: { x: 8.5, y: 0, z: -3.95 }, objects: [
      box('Aquarium cabinet', { x: 0, y: .45, z: 0 }, { x: 3.8, y: .9, z: 1.25 }, { materialKey: 'wood' }),
      box('Aquarium glass back', { x: 0, y: 1.55, z: .55 }, { x: 3.7, y: 1.5, z: .08 }, { materialKey: 'glass', collision: false }),
      box('Aquarium glass front', { x: 0, y: 1.55, z: -.55 }, { x: 3.7, y: 1.5, z: .08 }, { materialKey: 'glass', collision: false }),
      box('Aquarium glass left', { x: -1.81, y: 1.55, z: 0 }, { x: .08, y: 1.5, z: 1.1 }, { materialKey: 'glass', collision: false }),
      box('Aquarium glass right', { x: 1.81, y: 1.55, z: 0 }, { x: .08, y: 1.5, z: 1.1 }, { materialKey: 'glass', collision: false }),
      box('Aquarium top trim', { x: 0, y: 2.34, z: 0 }, { x: 3.85, y: .12, z: 1.22 }, { materialKey: 'accent', collision: false })
    ]},
    { id: 'ceiling', label: 'Ceiling + pendant lights', offset: { x: 0, y: 0, z: 0 }, objects: ceiling(24, 13, 4.1, [{ x: -7, z: 0 }, { x: -2.3, z: 0 }, { x: 2.3, z: 0 }, { x: 7, z: 0 }]) }
  ]
};

const penthouse = {
  id: 'penthouse', label: 'Penthouse', description: 'Luxury penthouse blockout with lounge, kitchen, bedroom, office, dining and view wall.',
  dimensions: { x: 26, y: 4.4, z: 14 },
  waters: [
    water('skyreach-penthouse-jacuzzi', 'Penthouse Jacuzzi', { x: 8.4, y: .62, z: -3.1 }, { x: 2.15, z: 1.5 }, {
      depthMeters: .72, fishingZoneScale: .92, fishIds: ['bluegill', 'channel-catfish', 'capybara'], componentId: 'jacuzzi',
      metadata: { physicalSource: 'Penthouse jacuzzi', waterType: 'pool' }
    })
  ],
  components: [
    { id: 'shell', label: 'Shell + glass view wall', offset: { x: 0, y: 0, z: 0 }, objects: shell(26, 14, 4.4, { doorwayWidth: 3.2, backWindows: true }) },
    { id: 'lounge', label: 'Lounge', offset: { x: 5.2, y: 0, z: 1.6 }, objects: [
      box('Sofa long', { x: 0, y: .48, z: 0 }, { x: 4.8, y: .96, z: 1.05 }, { materialKey: 'fabric' }),
      box('Sofa side', { x: 2.0, y: .48, z: -2.0 }, { x: 1.05, y: .96, z: 3.1 }, { materialKey: 'fabric' }),
      box('Coffee table', { x: -1.0, y: .36, z: -1.75 }, { x: 2.4, y: .22, z: 1.25 }, { materialKey: 'glass' }),
      box('Media console', { x: -3.2, y: .45, z: -1.9 }, { x: .55, y: .9, z: 3.6 }, { materialKey: 'dark' }),
      box('Display panel', { x: -3.48, y: 1.75, z: -1.9 }, { x: .08, y: 1.65, z: 3.25 }, { materialKey: 'glass', collision: false })
    ]},
    { id: 'kitchen', label: 'Kitchen + island', offset: { x: -7.7, y: 0, z: 2.5 }, objects: [
      box('Kitchen cabinets', { x: 0, y: .9, z: 1.8 }, { x: 6.3, y: 1.8, z: .65 }, { materialKey: 'wood' }),
      box('Kitchen counter', { x: 0, y: 1.02, z: 1.4 }, { x: 6.5, y: .14, z: 1.0 }, { materialKey: 'stone' }),
      box('Island base', { x: 0, y: .62, z: -.7 }, { x: 4.6, y: 1.24, z: 1.35 }, { materialKey: 'dark' }),
      box('Island top', { x: 0, y: 1.28, z: -.7 }, { x: 5.0, y: .12, z: 1.55 }, { materialKey: 'stone' }),
      box('Fridge', { x: -2.6, y: 1.25, z: 1.65 }, { x: 1.05, y: 2.5, z: .78 }, { materialKey: 'metal' })
    ]},
    { id: 'bedroom', label: 'Bedroom suite', offset: { x: 7.7, y: 0, z: -3.75 }, objects: [
      box('Bed platform', { x: 0, y: .38, z: 0 }, { x: 4.2, y: .76, z: 2.5 }, { materialKey: 'wood' }),
      box('Mattress', { x: 0, y: .88, z: 0 }, { x: 4.0, y: .34, z: 2.35 }, { materialKey: 'fabric' }),
      box('Headboard', { x: 0, y: 1.55, z: 1.18 }, { x: 4.25, y: 1.7, z: .18 }, { materialKey: 'fabric' }),
      box('Nightstand left', { x: -2.6, y: .42, z: .65 }, { x: .8, y: .84, z: .8 }, { materialKey: 'wood' }),
      box('Nightstand right', { x: 2.6, y: .42, z: .65 }, { x: .8, y: .84, z: .8 }, { materialKey: 'wood' })
    ]},
    { id: 'bath', label: 'Private bath', offset: { x: 8.8, y: 0, z: 3.7 }, objects: [
      box('Bath divider', { x: -2.0, y: 1.7, z: 0 }, { x: .16, y: 3.4, z: 5.2 }, { materialKey: 'glass' }),
      box('Tub', { x: .2, y: .48, z: 1.1 }, { x: 2.7, y: .96, z: 1.35 }, { materialKey: 'fixture' }),
      box('Bath vanity', { x: .7, y: .55, z: -1.5 }, { x: 3.2, y: 1.1, z: .78 }, { materialKey: 'wood' }),
      box('Bath mirror', { x: .7, y: 1.9, z: -1.92 }, { x: 3.0, y: 1.6, z: .06 }, { materialKey: 'glass', collision: false })
    ]},
    { id: 'office', label: 'Office / reading nook', offset: { x: -8.2, y: 0, z: -3.7 }, objects: [
      box('Desk', { x: 0, y: .74, z: 0 }, { x: 3.4, y: .14, z: 1.2 }, { materialKey: 'wood' }),
      box('Desk pedestal', { x: -1.35, y: .38, z: 0 }, { x: .55, y: .76, z: .9 }, { materialKey: 'wood' }),
      box('Office chair', { x: .2, y: .52, z: -1.0 }, { x: .72, y: 1.04, z: .72 }, { materialKey: 'fabric' }),
      box('Bookshelf', { x: -2.7, y: 1.5, z: 1.5 }, { x: 1.1, y: 3.0, z: .5 }, { materialKey: 'wood' })
    ]},
    { id: 'dining', label: 'Dining table', offset: { x: -1.2, y: 0, z: 3.1 }, objects: [
      box('Dining table', { x: 0, y: .76, z: 0 }, { x: 4.1, y: .16, z: 1.65 }, { materialKey: 'wood' }),
      ...[-1.45, 0, 1.45].flatMap((x, i) => [
        box(`Dining chair N${i + 1}`, { x, y: .48, z: 1.25 }, { x: .62, y: .96, z: .62 }, { materialKey: 'fabric' }),
        box(`Dining chair S${i + 1}`, { x, y: .48, z: -1.25 }, { x: .62, y: .96, z: .62 }, { materialKey: 'fabric' })
      ])
    ]},
    { id: 'view', label: 'View lounge / planters', offset: { x: 0, y: 0, z: 5.3 }, objects: [
      box('View bench', { x: 0, y: .42, z: 0 }, { x: 5.6, y: .84, z: .75 }, { materialKey: 'fabric' }),
      box('Planter A', { x: -4.0, y: .4, z: 0 }, { x: 1.0, y: .8, z: 1.0 }, { materialKey: 'stone' }),
      box('Plant A', { x: -4.0, y: 1.2, z: 0 }, { x: .7, y: 1.15, z: .7 }, { materialKey: 'plant', collision: false }),
      box('Planter B', { x: 4.0, y: .4, z: 0 }, { x: 1.0, y: .8, z: 1.0 }, { materialKey: 'stone' }),
      box('Plant B', { x: 4.0, y: 1.2, z: 0 }, { x: .7, y: 1.15, z: .7 }, { materialKey: 'plant', collision: false })
    ]},
    { id: 'jacuzzi', label: 'Jacuzzi / plunge pool', offset: { x: 8.4, y: 0, z: -3.1 }, objects: [
      box('Jacuzzi basin', { x: 0, y: .34, z: 0 }, { x: 5.2, y: .68, z: 3.8 }, { materialKey: 'tile' }),
      box('Jacuzzi inner dark', { x: 0, y: .58, z: 0 }, { x: 4.5, y: .16, z: 3.05 }, { materialKey: 'dark', collision: false }),
      box('Jacuzzi step', { x: 0, y: .2, z: -2.15 }, { x: 2.0, y: .4, z: .7 }, { materialKey: 'stone' })
    ]},
    { id: 'ceiling', label: 'Ceiling + lighting', offset: { x: 0, y: 0, z: 0 }, objects: ceiling(26, 14, 4.4, [{ x: -8, z: 0 }, { x: -3, z: 0 }, { x: 3, z: 0 }, { x: 8, z: 0 }]) }
  ]
};

const maintenance = {
  id: 'maintenance', label: 'Maintenance / Utility', description: 'Service room with workbench, storage, electrical cabinets, pipes and utility fixtures.',
  dimensions: { x: 14, y: 3.5, z: 10 },
  waters: [
    water('skyreach-maintenance-spill', 'Electrified Maintenance Spill', { x: 4.2, y: .025, z: -1.55 }, { x: 1.7, z: 1.05 }, {
      depthMeters: .06, fishingZoneScale: 1.0, fishIds: ['electric-eel'], componentId: 'electrical',
      metadata: { physicalSource: 'Spilled water by electrical cabinets', waterType: 'puddle', electrified: true }
    })
  ],
  components: [
    { id: 'shell', label: 'Service shell', offset: { x: 0, y: 0, z: 0 }, objects: shell(14, 10, 3.5, { doorwayWidth: 2.2 }) },
    { id: 'workbench', label: 'Workbench', offset: { x: -4.4, y: 0, z: 2.8 }, objects: [
      box('Workbench top', { x: 0, y: .86, z: 0 }, { x: 4.2, y: .16, z: 1.0 }, { materialKey: 'wood' }),
      box('Workbench frame', { x: 0, y: .43, z: 0 }, { x: 3.8, y: .75, z: .7 }, { materialKey: 'metal' }),
      box('Pegboard', { x: 0, y: 1.85, z: .48 }, { x: 4.0, y: 1.45, z: .08 }, { materialKey: 'dark', collision: false })
    ]},
    { id: 'shelving', label: 'Storage shelving', offset: { x: 4.7, y: 0, z: 2.7 }, objects: [
      box('Shelf frame', { x: 0, y: 1.35, z: 0 }, { x: 3.0, y: 2.7, z: .65 }, { materialKey: 'metal' }),
      ...[.45, 1.05, 1.65, 2.25].map((y, i) => box(`Shelf ${i + 1}`, { x: 0, y, z: 0 }, { x: 2.9, y: .08, z: .78 }, { materialKey: 'metal' }))
    ]},
    { id: 'electrical', label: 'Electrical cabinets', offset: { x: 4.9, y: 0, z: -.9 }, objects: [
      box('Electrical cabinet A', { x: -.85, y: 1.1, z: 0 }, { x: 1.45, y: 2.2, z: .55 }, { materialKey: 'metal' }),
      box('Electrical cabinet B', { x: .85, y: 1.1, z: 0 }, { x: 1.45, y: 2.2, z: .55 }, { materialKey: 'metal' }),
      box('Warning strip', { x: 0, y: 2.0, z: -.31 }, { x: 3.1, y: .18, z: .04 }, { materialKey: 'accent', collision: false })
    ]},
    { id: 'pipes', label: 'Pipe rack', offset: { x: -4.8, y: 0, z: -.7 }, objects: [-.8, 0, .8].map((x, i) =>
      box(`Service pipe ${i + 1}`, { x, y: 1.9, z: 0 }, { x: .22, y: 3.1, z: .22 }, { materialKey: i === 1 ? 'accent' : 'metal' })) },
    { id: 'lockers', label: 'Tool lockers', offset: { x: -4.8, y: 0, z: -3.5 }, objects: [-1.25, 0, 1.25].map((x, i) =>
      box(`Tool locker ${i + 1}`, { x, y: 1.05, z: 0 }, { x: 1.05, y: 2.1, z: .72 }, { materialKey: 'metal' })) },
    { id: 'sink', label: 'Utility sink', offset: { x: 1.8, y: 0, z: 3.45 }, objects: [
      box('Utility sink basin', { x: 0, y: .85, z: 0 }, { x: 1.5, y: .5, z: 1.0 }, { materialKey: 'fixture' }),
      box('Utility sink pedestal', { x: 0, y: .4, z: 0 }, { x: .75, y: .8, z: .65 }, { materialKey: 'metal' }),
      box('Utility faucet', { x: 0, y: 1.35, z: .35 }, { x: .08, y: .55, z: .08 }, { materialKey: 'metal', collision: false })
    ]},
    { id: 'cart', label: 'Maintenance cart', offset: { x: .8, y: 0, z: -2.7 }, objects: [
      box('Cart body', { x: 0, y: .55, z: 0 }, { x: 2.2, y: 1.1, z: 1.15 }, { materialKey: 'metal' }),
      box('Cart top', { x: 0, y: 1.15, z: 0 }, { x: 2.35, y: .1, z: 1.25 }, { materialKey: 'dark' })
    ]},
    { id: 'ceiling', label: 'Ceiling + service lights', offset: { x: 0, y: 0, z: 0 }, objects: ceiling(14, 10, 3.5, [{ x: -3.5, z: 0 }, { x: 0, z: 0 }, { x: 3.5, z: 0 }]) }
  ]
};

const casino = {
  id: 'casino', label: 'Casino', description: 'Art-Deco casino floor with gaming pit, roulette, slots, cashier, bar/lounge and VIP divider.',
  dimensions: { x: 28, y: 4.5, z: 14 },
  waters: [
    water('skyreach-casino-fountain', 'Casino Fountain', { x: 0, y: .42, z: -3.35 }, { x: 1.65, z: 1.05 }, {
      depthMeters: .42, fishingZoneScale: .9, fishIds: ['golden-shiner', 'pumpkinseed', 'bluegill'], componentId: 'fountain',
      metadata: { physicalSource: 'Casino fountain', waterType: 'fountain' }
    })
  ],
  components: [
    { id: 'shell', label: 'Casino shell + entry', offset: { x: 0, y: 0, z: 0 }, objects: shell(28, 14, 4.5, { doorwayWidth: 4.0, backWindows: false }) },
    { id: 'pit', label: 'Central card-table pit', offset: { x: 0, y: 0, z: .3 }, objects: [-4.2, 0, 4.2].flatMap((x, i) => [
      box(`Card table ${i + 1}`, { x, y: .72, z: 0 }, { x: 3.1, y: .18, z: 1.7 }, { materialKey: 'casino-felt' }),
      box(`Card table ${i + 1} base`, { x, y: .36, z: 0 }, { x: 1.1, y: .72, z: .8 }, { materialKey: 'dark' }),
      ...[-1, 0, 1].map((cx, j) => box(`Card chair ${i + 1}-${j + 1}`, { x: x + cx * 1.2, y: .48, z: 1.35 }, { x: .62, y: .96, z: .62 }, { materialKey: 'casino-red' }))
    ])},
    { id: 'roulette', label: 'Roulette area', offset: { x: -8.8, y: 0, z: 2.9 }, objects: [
      box('Roulette table', { x: 0, y: .76, z: 0 }, { x: 4.0, y: .2, z: 1.8 }, { materialKey: 'casino-felt' }),
      box('Roulette pedestal', { x: 0, y: .38, z: 0 }, { x: 1.5, y: .76, z: 1.0 }, { materialKey: 'dark' }),
      box('Roulette wheel', { x: 1.15, y: 1.03, z: 0 }, { x: .95, y: .16, z: .95 }, { materialKey: 'accent', collision: false })
    ]},
    { id: 'slots', label: 'Slot-machine bank', offset: { x: 9.7, y: 0, z: 2.3 }, objects: [-3.0, -1.5, 0, 1.5, 3.0].map((z, i) =>
      box(`Slot machine ${i + 1}`, { x: 0, y: 1.05, z }, { x: .95, y: 2.1, z: 1.0 }, { materialKey: i % 2 ? 'casino-purple' : 'accent' })) },
    { id: 'cashier', label: 'Cashier cage', offset: { x: -9.1, y: 0, z: -3.9 }, objects: [
      box('Cashier counter', { x: 0, y: .76, z: 0 }, { x: 5.4, y: 1.52, z: .9 }, { materialKey: 'dark' }),
      box('Cashier cage glass', { x: 0, y: 2.05, z: .35 }, { x: 5.2, y: 1.65, z: .08 }, { materialKey: 'glass', collision: false }),
      box('Cashier brass top', { x: 0, y: 1.58, z: 0 }, { x: 5.6, y: .09, z: 1.02 }, { materialKey: 'accent' })
    ]},
    { id: 'bar', label: 'Casino bar + lounge', offset: { x: 8.4, y: 0, z: -3.9 }, objects: [
      box('Casino bar', { x: 0, y: .7, z: 0 }, { x: 6.2, y: 1.4, z: .95 }, { materialKey: 'wood' }),
      box('Casino bar top', { x: 0, y: 1.44, z: 0 }, { x: 6.5, y: .12, z: 1.08 }, { materialKey: 'accent' }),
      ...[-2.2, -.75, .75, 2.2].map((x, i) => box(`Casino stool ${i + 1}`, { x, y: .47, z: -1.0 }, { x: .55, y: .94, z: .55 }, { materialKey: 'casino-red' }))
    ]},
    { id: 'vip', label: 'VIP divider + lounge', offset: { x: 0, y: 0, z: 4.8 }, objects: [
      box('VIP divider left', { x: -3.8, y: 1.45, z: 0 }, { x: 5.8, y: 2.9, z: .14 }, { materialKey: 'dark' }),
      box('VIP divider right', { x: 3.8, y: 1.45, z: 0 }, { x: 5.8, y: 2.9, z: .14 }, { materialKey: 'dark' }),
      box('VIP sofa left', { x: -4.2, y: .5, z: -1.05 }, { x: 4.0, y: 1.0, z: .95 }, { materialKey: 'casino-red' }),
      box('VIP sofa right', { x: 4.2, y: .5, z: -1.05 }, { x: 4.0, y: 1.0, z: .95 }, { materialKey: 'casino-red' }),
      box('VIP sign', { x: 0, y: 2.8, z: -.1 }, { x: 2.5, y: .62, z: .1 }, { materialKey: 'accent', collision: false })
    ]},
    { id: 'entry', label: 'Entry arch + signage', offset: { x: 0, y: 0, z: -5.7 }, objects: [
      box('Entry arch left', { x: -2.6, y: 2.0, z: 0 }, { x: .65, y: 4.0, z: .6 }, { materialKey: 'accent' }),
      box('Entry arch right', { x: 2.6, y: 2.0, z: 0 }, { x: .65, y: 4.0, z: .6 }, { materialKey: 'accent' }),
      box('Entry arch top', { x: 0, y: 3.7, z: 0 }, { x: 5.8, y: .6, z: .6 }, { materialKey: 'accent' }),
      box('CASINO sign panel', { x: 0, y: 3.0, z: -.34 }, { x: 3.9, y: .7, z: .08 }, { materialKey: 'casino-purple', collision: false })
    ]},
    { id: 'fountain', label: 'Casino fountain', offset: { x: 0, y: 0, z: -3.35 }, objects: [
      box('Fountain basin', { x: 0, y: .28, z: 0 }, { x: 4.2, y: .56, z: 2.9 }, { materialKey: 'stone' }),
      box('Fountain inner basin', { x: 0, y: .46, z: 0 }, { x: 3.5, y: .14, z: 2.15 }, { materialKey: 'dark', collision: false }),
      box('Fountain center pedestal', { x: 0, y: .78, z: 0 }, { x: .72, y: 1.12, z: .72 }, { materialKey: 'accent' }),
      box('Fountain crown', { x: 0, y: 1.42, z: 0 }, { x: 1.35, y: .16, z: 1.35 }, { materialKey: 'accent', collision: false })
    ]},
    { id: 'ceiling', label: 'Ceiling + casino lighting', offset: { x: 0, y: 0, z: 0 }, objects: [
      ...ceiling(28, 14, 4.5, [{ x: -9, z: 0 }, { x: -3, z: 0 }, { x: 3, z: 0 }, { x: 9, z: 0 }]),
      box('Central ceiling accent', { x: 0, y: 4.31, z: 0 }, { x: 8.5, y: .10, z: 3.4 }, { materialKey: 'casino-purple', collision: false })
    ]}
  ]
};

export const SKYSCRAPER_ROOM_LIBRARY = Object.freeze([bathroom, restaurant, penthouse, maintenance, casino]);

export function getRoomLibraryTemplate(id) {
  return SKYSCRAPER_ROOM_LIBRARY.find((item) => item.id === id) ?? SKYSCRAPER_ROOM_LIBRARY[0];
}

export function getRoomLibraryComponent(templateId, componentId) {
  return getRoomLibraryTemplate(templateId).components.find((item) => item.id === componentId) ?? null;
}

function translatedObject(object, offset, prefix, component) {
  const copy = clone(object);
  copy.id = `${prefix}-${component.id}-${String(component._index + 1).padStart(2, '0')}`.toUpperCase();
  copy.transform.position.x += offset.x;
  copy.transform.position.y += offset.y;
  copy.transform.position.z += offset.z;
  copy.metadata = {
    ...(copy.metadata ?? {}),
    libraryAuthored: true,
    componentId: component.id,
    componentName: component.label
  };
  return copy;
}

export function makeRoomLibraryDefinition(templateId) {
  const template = getRoomLibraryTemplate(templateId);
  const objects = [];
  const waters = [];
  for (const component of template.components) {
    component.objects.forEach((object, index) => {
      objects.push(translatedObject(object, component.offset, `ROOMLIB-${template.id}`, { ...component, _index: index }));
    });
  }
  for (const source of template.waters ?? []) {
    const copy = clone(source);
    copy.metadata = { ...(copy.metadata ?? {}), libraryAuthored: true, roomLibraryId: template.id };
    waters.push(copy);
  }
  return {
    id: `ROOMLIB-${template.id.toUpperCase()}-V1`,
    name: `${template.label} — Complete`,
    kind: 'room',
    version: 1,
    objects,
    movingPlatforms: [],
    waters,
    metadata: {
      independentlyAuthored: true,
      libraryAuthored: true,
      roomLibraryId: template.id,
      roomLibraryVersion: 1,
      dimensions: clone(template.dimensions),
      componentCount: template.components.length,
      description: template.description
    }
  };
}

export function makeRoomComponentDefinition(templateId, componentId) {
  const template = getRoomLibraryTemplate(templateId);
  const component = getRoomLibraryComponent(templateId, componentId);
  if (!component) return null;
  return {
    id: `ROOMCOMP-${template.id.toUpperCase()}-${component.id.toUpperCase()}-V1`,
    name: `${template.label} — ${component.label}`,
    kind: 'room-component',
    version: 1,
    objects: component.objects.map((object, index) => translatedObject(object, { x: 0, y: 0, z: 0 }, `ROOMCOMP-${template.id}-${component.id}`, { ...component, _index: index })),
    movingPlatforms: [],
    waters: (template.waters ?? []).filter((waterItem) => waterItem.metadata?.componentId === component.id).map((waterItem) => {
      const copy = clone(waterItem);
      copy.position.x -= component.offset.x;
      copy.position.y -= component.offset.y;
      copy.position.z -= component.offset.z;
      copy.metadata = { ...(copy.metadata ?? {}), libraryAuthored: true, roomLibraryId: template.id, roomComponentId: component.id };
      return copy;
    }),
    metadata: {
      independentlyAuthored: true,
      libraryAuthored: true,
      roomLibraryId: template.id,
      roomComponentId: component.id,
      roomLibraryVersion: 1,
      defaultAssemblyOffset: clone(component.offset),
      description: `${component.label} from the ${template.label} kit.`
    }
  };
}
