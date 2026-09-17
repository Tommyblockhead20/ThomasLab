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

const libraryAssembly = (id, name, category, description, objects) => assembly(id, name, ['library-island'], `Library / ${category}`, description, objects);
const legs = (prefix, width, depth, height, material = 'wood') => [-1, 1].flatMap((x) => [-1, 1].map((z) =>
  part(`${prefix}-leg-${x}-${z}`, { x: x * width * .42, y: height / 2, z: z * depth * .38 }, { x: .18, y: height, z: .18 }, material)));

const LIBRARY_FURNITURE = [
  shelf('athenaeum-shelf-narrow-v4', 'Athenaeum Shelf — Narrow', { width: 1.8, height: 4.2, shelfCount: 6, bookDensity: .7 }),
  shelf('athenaeum-shelf-archive-v4', 'Athenaeum Shelf — Archive', { width: 5.2, height: 5.8, shelfCount: 8, bookDensity: .94 }),
  shelf('athenaeum-shelf-low-v4', 'Athenaeum Shelf — Low', { width: 4.4, height: 2.1, shelfCount: 4, bookDensity: .72 }),
  shelf('athenaeum-shelf-grand-v4', 'Athenaeum Shelf — Grand Double', { width: 6.2, height: 6.1, shelfCount: 8, doubleSided: true, bookDensity: .9 }),
  libraryAssembly('library-reading-table-v4', 'Long Reading Table', 'Tables', 'A substantial reading table with trestle legs and brass reading lamps.', [
    part('top', { x: 0, y: 1.02, z: 0 }, { x: 6.2, y: .24, z: 1.8 }, 'woodLight'), ...legs('table', 6.2, 1.8, .95),
    part('spine', { x: 0, y: .55, z: 0 }, { x: 4.5, y: .18, z: .18 }, 'wood'),
    ...[-1.7, 0, 1.7].map((x, i) => part(`lamp-${i}`, { x, y: 1.65, z: 0 }, { x: .18, y: 1.2, z: .18 }, 'brass', { type: 'cylinder', collision: false }))
  ]),
  libraryAssembly('library-writing-desk-v4', 'Writing Desk', 'Tables', 'A compact writing desk with drawers, raised back, and writing surface.', [
    part('desktop', { x: 0, y: .9, z: 0 }, { x: 3, y: .2, z: 1.5 }, 'woodLight'), ...legs('desk', 3, 1.5, .85),
    part('drawer-bank', { x: .9, y: .63, z: 0 }, { x: .8, y: .46, z: 1.2 }, 'wood'),
    part('back-rail', { x: 0, y: 1.25, z: .64 }, { x: 2.8, y: .5, z: .12 }, 'wood')
  ]),
  libraryAssembly('library-chair-v4', 'Reading Chair', 'Seating', 'Wood reading chair with seat, back slats, and four legs.', [
    part('seat', { x: 0, y: .62, z: 0 }, { x: 1.05, y: .16, z: 1.0 }, 'woodLight'), ...legs('chair', 1.05, 1, .58),
    part('back', { x: 0, y: 1.25, z: .43 }, { x: 1.0, y: 1.15, z: .14 }, 'wood')
  ]),
  libraryAssembly('library-armchair-v4', 'Archive Armchair', 'Seating', 'Upholstered archive chair with readable arms, cushion, and high back.', [
    part('seat', { x: 0, y: .55, z: 0 }, { x: 1.2, y: .28, z: 1.1 }, 'fabric'),
    part('back', { x: 0, y: 1.3, z: .45 }, { x: 1.35, y: 1.35, z: .3 }, 'fabric'),
    ...[-.72, .72].map((x, i) => part(`arm-${i}`, { x, y: .82, z: 0 }, { x: .24, y: .5, z: 1.1 }, 'wood'))
  ]),
  libraryAssembly('library-couch-v4', 'Gallery Couch', 'Seating', 'A three-seat gallery couch with cushions, back, arms, and feet.', [
    part('base', { x: 0, y: .45, z: 0 }, { x: 3.6, y: .5, z: 1.25 }, 'fabric'),
    ...[-1.15, 0, 1.15].map((x, i) => part(`cushion-${i}`, { x, y: .78, z: -.08 }, { x: 1.05, y: .22, z: .9 }, 'fabric')),
    part('back', { x: 0, y: 1.35, z: .52 }, { x: 3.6, y: 1.3, z: .28 }, 'fabric'),
    ...[-1.92, 1.92].map((x, i) => part(`arm-${i}`, { x, y: .82, z: 0 }, { x: .24, y: .7, z: 1.25 }, 'wood'))
  ]),
  libraryAssembly('library-bench-v4', 'Gallery Bench', 'Seating', 'Backed gallery bench with a broad seat and grounded supports.', [
    part('seat', { x: 0, y: .62, z: 0 }, { x: 3.4, y: .22, z: .9 }, 'woodLight'),
    part('back', { x: 0, y: 1.2, z: .38 }, { x: 3.4, y: 1.0, z: .18 }, 'wood'),
    ...[-1.25, 1.25].map((x, i) => part(`support-${i}`, { x, y: .3, z: 0 }, { x: .28, y: .6, z: .72 }, 'wood'))
  ]),
  libraryAssembly('library-lectern-v4', 'Archivist Lectern', 'Study', 'Angled lectern with a broad book rest and weighted pedestal.', [
    part('base', { x: 0, y: .12, z: 0 }, { x: 1.4, y: .24, z: 1.0 }, 'wood'),
    part('post', { x: 0, y: .8, z: 0 }, { x: .32, y: 1.5, z: .32 }, 'wood'),
    part('rest', { x: 0, y: 1.55, z: -.08 }, { x: 1.5, y: .16, z: 1.1 }, 'woodLight', { rotation: { x: 16, y: 0, z: 0 } })
  ]),
  libraryAssembly('library-book-cart-v4', 'Book Cart', 'Study', 'Double-sided rolling book cart with shelves, handle, and wheels.', [
    part('frame', { x: 0, y: .9, z: 0 }, { x: 2, y: 1.6, z: .75 }, 'wood'),
    ...[.38, 1.0, 1.55].map((y, i) => part(`shelf-${i}`, { x: 0, y, z: 0 }, { x: 1.8, y: .1, z: .8 }, 'woodLight')),
    part('handle', { x: 1.15, y: 1.45, z: 0 }, { x: .15, y: .15, z: 1.0 }, 'brass', { collision: false }),
    ...[-.75, .75].flatMap((x) => [-.3, .3].map((z) => part(`wheel-${x}-${z}`, { x, y: .15, z }, { x: .28, y: .28, z: .12 }, 'metal', { type: 'cylinder', collision: false })))
  ]),
  libraryAssembly('library-rolling-ladder-v4', 'Rolling Shelf Ladder', 'Study', 'Tall rolling ladder with side rails, rungs, and upper hook.', [
    ...[-.48, .48].map((x, i) => part(`rail-${i}`, { x, y: 2.2, z: 0 }, { x: .12, y: 4.4, z: .14 }, 'wood', { rotation: { x: 0, y: 0, z: i ? -4 : 4 } })),
    ...Array.from({ length: 9 }, (_, i) => part(`rung-${i}`, { x: 0, y: .3 + i * .45, z: 0 }, { x: 1.0, y: .1, z: .14 }, 'woodLight'))
  ]),
  libraryAssembly('library-book-pile-v4', 'Book Pile', 'Decor', 'A varied stack of individually readable books.', Array.from({ length: 7 }, (_, i) => part(`book-${i}`, { x: (i % 2 ? .08 : -.04), y: .07 + i * .13, z: (i % 3 - 1) * .03 }, { x: 1.1 - i * .035, y: .12, z: .72 }, ['bookGreen','bookRed','bookBlue'][i % 3], { rotation: { x: 0, y: (i % 3 - 1) * 7, z: 0 }, collision: false }))),
  libraryAssembly('library-globe-v4', 'Brass Library Globe', 'Decor', 'A globe on a brass axis, pedestal, and circular base.', [
    part('base', { x: 0, y: .12, z: 0 }, { x: 1.1, y: .24, z: 1.1 }, 'wood', { type: 'cylinder' }),
    part('post', { x: 0, y: .75, z: 0 }, { x: .18, y: 1.3, z: .18 }, 'brass', { type: 'cylinder' }),
    part('globe', { x: 0, y: 1.65, z: 0 }, { x: 1.25, y: 1.25, z: 1.25 }, 'bookBlue', { type: 'sphere', collision: false })
  ]),
  libraryAssembly('library-display-case-v4', 'Glass Display Case', 'Display', 'Glass-topped display case with cabinet base and trim.', [
    part('base', { x: 0, y: .45, z: 0 }, { x: 2.6, y: .9, z: 1.35 }, 'wood'),
    part('glass', { x: 0, y: 1.15, z: 0 }, { x: 2.5, y: .55, z: 1.25 }, 'glass', { collision: false }),
    part('trim', { x: 0, y: 1.45, z: 0 }, { x: 2.7, y: .1, z: 1.45 }, 'brass', { collision: false })
  ]),
  libraryAssembly('library-map-cabinet-v4', 'Map Cabinet', 'Display', 'Wide shallow-drawer map cabinet with brass pulls.', [
    part('body', { x: 0, y: .8, z: 0 }, { x: 3.6, y: 1.6, z: 1.25 }, 'wood'),
    ...[.25, .65, 1.05, 1.45].map((y, i) => part(`drawer-${i}`, { x: 0, y, z: -.64 }, { x: 3.35, y: .3, z: .08 }, 'woodLight')),
    ...[.25, .65, 1.05, 1.45].map((y, i) => part(`pull-${i}`, { x: 0, y, z: -.72 }, { x: .5, y: .08, z: .08 }, 'brass', { collision: false }))
  ]),
  libraryAssembly('library-chandelier-v4', 'Archive Chandelier', 'Lighting', 'Brass chandelier with chain, ring, and visible warm lamps.', [
    part('chain', { x: 0, y: 2.0, z: 0 }, { x: .12, y: 4, z: .12 }, 'brass', { collision: false }),
    part('ring', { x: 0, y: .1, z: 0 }, { x: 2.6, y: .14, z: 2.6 }, 'brass', { type: 'cylinder', collision: false }),
    ...Array.from({ length: 8 }, (_, i) => { const a=i/8*Math.PI*2; return part(`lamp-${i}`, { x: Math.cos(a)*1.05, y: .15, z: Math.sin(a)*1.05 }, { x: .22, y: .45, z: .22 }, 'warmGlow', { type: 'sphere', collision: false }); })
  ]),
  libraryAssembly('library-floor-lamp-v4', 'Reading Floor Lamp', 'Lighting', 'Tall brass reading lamp with weighted base and warm shade.', [
    part('base', { x: 0, y: .08, z: 0 }, { x: .75, y: .16, z: .75 }, 'brass', { type: 'cylinder' }),
    part('stem', { x: 0, y: 1.3, z: 0 }, { x: .12, y: 2.5, z: .12 }, 'brass', { type: 'cylinder' }),
    part('shade', { x: 0, y: 2.6, z: 0 }, { x: .8, y: .55, z: .8 }, 'warmGlow', { type: 'cone', collision: false })
  ]),
  libraryAssembly('library-rug-v4', 'Grand Reading Rug', 'Decor', 'Large patterned reading-room rug assembled from bordered fabric layers.', [
    part('rug', { x: 0, y: .02, z: 0 }, { x: 7, y: .04, z: 4.8 }, 'fabric', { collision: false }),
    part('border', { x: 0, y: .035, z: 0 }, { x: 6.5, y: .025, z: 4.3 }, 'bookRed', { collision: false })
  ]),
  libraryAssembly('library-planter-v4', 'Indoor Planter', 'Decor', 'Stone planter with trunk and layered foliage.', [
    part('pot', { x: 0, y: .45, z: 0 }, { x: 1.1, y: .9, z: 1.1 }, 'stone', { type: 'cylinder' }),
    part('trunk', { x: 0, y: 1.5, z: 0 }, { x: .24, y: 1.4, z: .24 }, 'wood', { type: 'cylinder' }),
    ...[-.45,0,.45].map((x,i)=>part(`leaf-${i}`, { x, y: 2.25 + (i===1?.25:0), z: (i-1)*.12 }, { x: 1.1, y: .75, z: 1.1 }, 'plant', { type:'sphere', collision:false }))
  ]),
  libraryAssembly('library-column-v4', 'Carved Gallery Column', 'Architecture', 'Layered stone column with base, shaft, and capital.', [
    part('base', { x: 0, y: .2, z: 0 }, { x: 1.25, y: .4, z: 1.25 }, 'stone'),
    part('shaft', { x: 0, y: 2.4, z: 0 }, { x: .8, y: 4.2, z: .8 }, 'stone', { type: 'cylinder' }),
    part('capital', { x: 0, y: 4.65, z: 0 }, { x: 1.4, y: .5, z: 1.4 }, 'stone')
  ]),
  libraryAssembly('library-arch-v4', 'Gallery Arch', 'Architecture', 'Three-piece gallery arch that leaves a true traversable opening.', [
    part('left', { x: -2, y: 2.2, z: 0 }, { x: .75, y: 4.4, z: 1.0 }, 'stone'),
    part('right', { x: 2, y: 2.2, z: 0 }, { x: .75, y: 4.4, z: 1.0 }, 'stone'),
    part('lintel', { x: 0, y: 4.35, z: 0 }, { x: 4.75, y: .85, z: 1.0 }, 'stone')
  ]),
  libraryAssembly('library-railing-v4', 'Gallery Railing', 'Architecture', 'Modular upper-gallery railing with posts, rails, and balusters.', [
    part('top', { x: 0, y: 1.15, z: 0 }, { x: 4.8, y: .16, z: .22 }, 'woodLight'),
    part('bottom', { x: 0, y: .2, z: 0 }, { x: 4.8, y: .14, z: .22 }, 'wood'),
    ...Array.from({ length: 7 }, (_, i) => part(`baluster-${i}`, { x: -2.1 + i*.7, y: .68, z: 0 }, { x: .12, y: .9, z: .12 }, 'wood'))
  ]),
  libraryAssembly('library-double-door-v4', 'Archive Double Door', 'Architecture', 'Pair of paneled archive doors with frame and brass handles.', [
    part('left-door', { x: -1, y: 1.6, z: 0 }, { x: 1.85, y: 3.2, z: .2 }, 'wood'),
    part('right-door', { x: 1, y: 1.6, z: 0 }, { x: 1.85, y: 3.2, z: .2 }, 'wood'),
    ...[-.22,.22].map((x,i)=>part(`handle-${i}`, { x, y: 1.55, z: -.18 }, { x: .12, y: .12, z: .12 }, 'brass', { type:'sphere', collision:false }))
  ]),
  libraryAssembly('library-window-v4', 'Tall Archive Window', 'Architecture', 'Tall framed window with mullions and translucent panes.', [
    part('pane', { x: 0, y: 2.1, z: 0 }, { x: 2.6, y: 4.2, z: .08 }, 'glass', { collision:false }),
    ...[-1.4,0,1.4].map((x,i)=>part(`vertical-${i}`, { x, y: 2.1, z: 0 }, { x: .12, y: 4.5, z: .16 }, 'wood')),
    ...[0,2.1,4.2].map((y,i)=>part(`horizontal-${i}`, { x:0, y, z:0 }, { x: 2.9, y:.12, z:.16 }, 'wood'))
  ]),
  libraryAssembly('library-stair-segment-v4', 'Gallery Stair Segment', 'Architecture', 'Twelve-step modular stair flight with side stringers.', [
    ...Array.from({ length: 12 }, (_, i)=>part(`step-${i}`, { x:0, y:.125+i*.25, z:-2.75+i*.5 }, { x:2.5, y:.25, z:.6 }, 'woodLight')),
    ...[-1.35,1.35].map((x,i)=>part(`stringer-${i}`, { x, y:1.5, z:0 }, { x:.18, y:.28, z:6.4 }, 'wood', { rotation:{x:-26.5,y:0,z:0} }))
  ]),
  libraryAssembly('library-corner-shelf-v4', 'Athenaeum Corner Shelf', 'Shelves', 'L-shaped corner bookcase with frames, shelf boards, backs, and visible books.', [
    ...['x','z'].flatMap((axis)=>[
      part(`${axis}-left`, axis==='x'?{x:-1.45,y:2,z:.22}:{x:.22,y:2,z:-1.45}, axis==='x'?{x:.14,y:4,z:.62}:{x:.62,y:4,z:.14}, 'wood'),
      part(`${axis}-right`, axis==='x'?{x:1.45,y:2,z:.22}:{x:.22,y:2,z:1.45}, axis==='x'?{x:.14,y:4,z:.62}:{x:.62,y:4,z:.14}, 'wood'),
      ...[.15,1.1,2.05,3,3.9].map((y,i)=>part(`${axis}-shelf-${i}`, axis==='x'?{x:0,y,z:.22}:{x:.22,y,z:0}, axis==='x'?{x:3,y:.11,z:.62}:{x:.62,y:.11,z:3}, 'woodLight'))
    ]),
    ...Array.from({length:12},(_,i)=>part(`corner-book-${i}`, {x:-1.15+(i%6)*.43,y:.48+Math.floor(i/6)*.95,z:i<6?.03:.42}, {x:.17,y:.62,z:.28}, ['bookGreen','bookRed','bookBlue'][i%3], {collision:false}))
  ]),
  libraryAssembly('library-manuscript-stand-v4', 'Manuscript Stand', 'Study', 'Museum-style angled manuscript stand with protected reading surface.', [
    part('base',{x:0,y:.12,z:0},{x:1.5,y:.24,z:1.1},'wood'), part('post',{x:0,y:.75,z:0},{x:.26,y:1.25,z:.26},'brass'),
    part('case',{x:0,y:1.4,z:0},{x:1.8,y:.18,z:1.25},'glass',{rotation:{x:14,y:0,z:0},collision:false}), part('manuscript',{x:0,y:1.48,z:-.08},{x:1.35,y:.04,z:.82},'bookRed',{rotation:{x:14,y:0,z:0},collision:false})
  ]),
  libraryAssembly('library-map-table-v4', 'Map Table', 'Tables', 'Broad map table with inset chart, drawers, and sturdy legs.', [
    part('top',{x:0,y:1,z:0},{x:4.6,y:.24,z:2.7},'woodLight'), ...legs('map-table',4.6,2.7,.94),
    part('chart',{x:0,y:1.14,z:0},{x:3.8,y:.025,z:2},'bookBlue',{collision:false}), part('drawer',{x:0,y:.78,z:-1.2},{x:2.2,y:.28,z:.22},'wood')
  ]),
  libraryAssembly('library-archive-cabinet-v4', 'Archive Cabinet', 'Display', 'Tall paneled storage cabinet with double doors and brass pulls.', [
    part('body',{x:0,y:2,z:0},{x:2.8,y:4,z:1.15},'wood'), part('door-left',{x:-.68,y:2,z:-.6},{x:1.25,y:3.6,z:.12},'woodLight'),
    part('door-right',{x:.68,y:2,z:-.6},{x:1.25,y:3.6,z:.12},'woodLight'), ...[-.12,.12].map((x,i)=>part(`pull-${i}`,{x,y:2,z:-.72},{x:.1,y:.22,z:.1},'brass',{collision:false}))
  ]),
  libraryAssembly('library-wall-sconce-v4', 'Archive Wall Sconce', 'Lighting', 'Wall plate, brass arm, and warm non-colliding lamp shade.', [
    part('plate',{x:0,y:1.4,z:.12},{x:.55,y:.85,z:.18},'brass'), part('arm',{x:0,y:1.2,z:-.32},{x:.12,y:.12,z:.9},'brass',{rotation:{x:-12,y:0,z:0},collision:false}),
    part('shade',{x:0,y:1.05,z:-.78},{x:.65,y:.55,z:.65},'warmGlow',{type:'cone',collision:false})
  ]),
  libraryAssembly('library-scholar-statue-v4', 'Scholar Statue', 'Decor', 'Stylized scholar statue on a layered stone pedestal.', [
    part('base',{x:0,y:.18,z:0},{x:1.5,y:.36,z:1.5},'stone'), part('pedestal',{x:0,y:.85,z:0},{x:1.1,y:1.05,z:1.1},'stone'),
    part('body',{x:0,y:2.15,z:0},{x:.85,y:1.7,z:.65},'stone'), part('head',{x:0,y:3.25,z:0},{x:.7,y:.7,z:.7},'stone',{type:'sphere'}),
    part('book',{x:.45,y:2.25,z:-.42},{x:.8,y:.15,z:.6},'stone',{rotation:{x:10,y:12,z:0},collision:false})
  ]),
  libraryAssembly('library-balcony-section-v4', 'Gallery Balcony Section', 'Architecture', 'Modular balcony slab with fascia, railing, and underside supports.', [
    part('slab',{x:0,y:.1,z:0},{x:6,y:.2,z:2.4},'stone'), part('fascia',{x:0,y:-.12,z:-1.15},{x:6,y:.45,z:.18},'stone'),
    part('rail-top',{x:0,y:1.25,z:-1.1},{x:6,y:.16,z:.2},'woodLight'), ...Array.from({length:9},(_,i)=>part(`baluster-${i}`,{x:-2.7+i*.675,y:.72,z:-1.1},{x:.12,y:1.05,z:.12},'wood'))
  ]),
  libraryAssembly('library-single-door-v4', 'Archive Door', 'Architecture', 'Paneled single door with complete frame and brass handle.', [
    part('door',{x:0,y:1.6,z:0},{x:1.85,y:3.2,z:.2},'wood'), part('frame-left',{x:-1.05,y:1.7,z:0},{x:.2,y:3.4,z:.28},'woodLight'),
    part('frame-right',{x:1.05,y:1.7,z:0},{x:.2,y:3.4,z:.28},'woodLight'), part('frame-top',{x:0,y:3.35,z:0},{x:2.3,y:.2,z:.28},'woodLight'), part('handle',{x:.62,y:1.55,z:-.18},{x:.13,y:.13,z:.13},'brass',{type:'sphere',collision:false})
  ]),
  libraryAssembly('library-secret-shelf-door-v4', 'Secret Bookshelf Door', 'Shelves', 'Bookcase-front secret door with full shelf boards, frame, books, and hidden pivot side.', [
    part('left',{x:-1.45,y:2,z:0},{x:.16,y:4,z:.62},'wood'), part('right',{x:1.45,y:2,z:0},{x:.16,y:4,z:.62},'wood'), part('back',{x:0,y:2,z:.28},{x:2.75,y:3.8,z:.1},'wood'),
    ...[.15,1.1,2.05,3,3.9].map((y,i)=>part(`shelf-${i}`,{x:0,y,z:0},{x:2.9,y:.11,z:.62},'woodLight')),
    ...Array.from({length:15},(_,i)=>part(`book-${i}`,{x:-1.2+(i%5)*.6,y:.5+Math.floor(i/5)*.96,z:-.12},{x:.18,y:.65,z:.28},['bookGreen','bookRed','bookBlue'][i%3],{collision:false}))
  ]),
  libraryAssembly('library-stair-landing-v4', 'Gallery Stair Landing', 'Architecture', 'Broad landing with structural underside and matching railing corner.', [
    part('landing',{x:0,y:.12,z:0},{x:4,y:.24,z:4},'woodLight'), part('underframe',{x:0,y:-.08,z:0},{x:3.7,y:.22,z:3.7},'wood'),
    part('rail-a',{x:0,y:1.15,z:-1.9},{x:4,y:.15,z:.18},'woodLight'), part('rail-b',{x:-1.9,y:1.15,z:0},{x:.18,y:.15,z:4},'woodLight')
  ])
];

export const WORLD_EDITOR_V3_ASSETS = Object.freeze([
  shelf('athenaeum-shelf-standard-v3', 'Athenaeum Shelf — Standard', { width: 3.4, height: 3.6, shelfCount: 5 }),
  shelf('athenaeum-shelf-tall-v3', 'Athenaeum Shelf — Tall', { width: 3.8, height: 5.2, shelfCount: 7, bookDensity: .88 }),
  shelf('athenaeum-shelf-double-v3', 'Athenaeum Shelf — Double-sided', { width: 4.2, height: 4.1, shelfCount: 6, doubleSided: true }),
  fire('athenaeum-fireplace-v3', 'Athenaeum Fireplace', false),
  fire('athenaeum-monumental-fireplace-v3', 'Monumental Athenaeum Fireplace', true),
  ...LIBRARY_FURNITURE,
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
