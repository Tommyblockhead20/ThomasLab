import { AUXILIARY_FOOTPRINTS } from './auxiliary-layout';
import type { Level } from './types';
import { FIRING_RACK } from './stokehold';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from './navigation';

export interface PlanWall {
  x: number;
  z: number;
  w: number;
  d: number;
  level: Level;
  prop?: boolean;
  windows?: boolean;
}
export const BRIDGE = {
  wheel: { x: -2.8, z: -20 },
  chart: { x: -3.2, z: -17.2 },
  telegraph: { x: 4.4, z: -20 },
  phone: { x: 5.8, z: -18.5 },
  command: { x: 3.4, z: -17.2 },
};
// Furniture sits against the sides of the working room. Both doors and the
// passage between them stay clear, including space to turn after entering.
export const WIRELESS = {
  receiver: { x: -0.6, z: -8.375, yaw: -Math.PI / 2 },
  copy: { x: -4.9, z: -8.375, yaw: Math.PI / 2 },
  phone: { x: -4.65, z: -8.95 },
  apparatus: { x: 4.95, z: -8.375, yaw: -Math.PI / 2 },
};
export const DECK_FITTINGS = [
  ...[-2, 2].map((x) => ({ x, z: -34, w: 2.1 / W, d: 2.2 / L, level: 2 as Level })),
  { x: 0, z: 31, w: 0.56 / W, d: 0.56 / L, level: 2 as Level },
  { x: 0, z: -31 - 16 / L, w: 0.3 / W, d: 0.6 / L, level: 2 as Level },
];
export const LEVEL_Y: Record<Level, number> = { '-2': -2.52, '-1': -19, '0': 0, '1': 7, '2': -5.4 };
export const FUNNEL_POSITIONS = [-13, -1.6, 9.8, 21.2];
export const BOAT_DECK_FRONT = -21.05,
  BOAT_DECK_BACK = 24.5;
export const BOAT_POSITIONS = [-15.9, -11.6, -7.3, -3, 13, 17.4, 21.8];
export const GRAND_HALL = { x: 0, z: -4.84, w: 8, d: 3.68 };
export const GRAND_HALL_DOOR = { z: -6.015, d: 0.53 };
export const DECK_HOUSES = [
  { x: 0, z: -18.65, w: 13.4, d: 4.7 },
  { x: 0, z: -12.775, w: 11, d: 7.05 },
  { x: 0, z: -8.075, w: 11, d: 2.35 },
  GRAND_HALL,
  { x: 0, z: 15.7, w: 4.8, d: 3.5 },
];
export const VENTILATORS = [
  { x: 3.7, z: 12.4, w: 1.9, d: 1.3 },
  { x: -3, z: 20.4, w: 1.4, d: 1.2 },
];
export const SHAFT = { x: -4, z: 8.9, w: 3.4, d: 4.4, floor: -19, roof: 3.25 };
export const GRAND_STAIR = {
  top: -5.69,
  landingFront: -4.31,
  landingBack: -3.12,
  turn: -3.68,
  landingY: -1.31,
  foot: -5.65,
  approach: -6.08,
  wingX: 2.28,
  mainWidth: 4.68,
  wingWidth: (2.28 * W - 4.68 / 2) * 2,
  wellWidth: 5.96,
  dome: { z: -4.58, width: 1.92, length: 4.02 },
};
const grand = GRAND_STAIR;
export const DECK_OPENINGS = [
  {
    id: 'passengers',
    x: 0,
    z: (grand.top + grand.landingBack) / 2,
    w: grand.wellWidth,
    d: grand.landingBack - grand.top,
  },
  { id: 'passengers-aft', x: 0, z: 15.85, w: 2.2, d: 1.7 },
  { id: 'machinery', ...SHAFT },
];
export const BOILERS = [-6.3, -2.1, 2.1, 6.3].map((x, i) => ({
  id: 'boiler-' + 'abcd'[i],
  index: i,
  x,
  z: -10.6,
  radius: 2.4,
  length: 6.1,
  stationX: x,
  stationZ: -10.6 + 3.2 / L,
}));
export const passengerRoute = [
  { x: 0, y: 0, z: -6.24 },
  { x: 0, y: 0, z: grand.top },
  { x: 0, y: grand.landingY, z: grand.landingFront },
  { x: 0, y: grand.landingY, z: grand.turn },
  { x: grand.wingX, y: grand.landingY, z: grand.turn },
  { x: grand.wingX, y: grand.landingY, z: grand.landingFront },
  { x: grand.wingX, y: LEVEL_Y[-2], z: grand.foot },
  { x: grand.wingX, y: LEVEL_Y[-2], z: grand.approach },
];
export const passengerAscent = [...passengerRoute].reverse();
export const portPassengerAscent = passengerAscent.map((p) => ({ ...p, x: p.x === 0 ? 0 : -p.x }));
export const aftPassengerRoute = [
  { x: 0, y: 0, z: 14.5 },
  { x: 0, y: 0, z: 15 },
  { x: 0, y: -2.52, z: 16.65 },
  { x: 0, y: -2.52, z: 17.4 },
];
// Adjacent lanes, separated by an open well; each returning flight is two
// storeys below the previous flight in that lane, with 7.3m headroom.
export const machineryRoute = [
  { x: -4.75, y: 0, z: 6.35 },
  { x: -4.75, y: 0, z: 7.55 },
];
for (let i = 0; i < 6; i++) {
  const x = i % 2 === 0 ? -4.75 : -3.25;
  const nextX = i % 2 === 0 ? -3.25 : -4.75;
  const y = (-19 * (i + 1)) / 6;
  const end = i % 2 === 0 ? 10.15 : 7.55;
  const landing = i % 2 === 0 ? 10.65 : 7.05;
  machineryRoute.push(
    { x, y, z: end },
    { x, y, z: landing },
    { x: nextX, y, z: landing },
    { x: nextX, y, z: end },
  );
}
machineryRoute.push({ x: -4.75, y: -19, z: 6.35 });
export const foreRoute = [
  { x: 7.7, y: 0, z: -20 },
  { x: 7.7, y: 0, z: BOAT_DECK_FRONT },
  { x: 7.7, y: -2.7, z: -22.5 },
  { x: 7.7, y: -2.7, z: -22.9 },
  { x: 7.7, y: -5.4, z: -24.5 },
  { x: 7.7, y: -5.4, z: -25 },
];
export const aftRoute = [
  { x: 4.5, y: 0, z: 23.3 },
  { x: 4.5, y: 0, z: BOAT_DECK_BACK },
  { x: 4.5, y: -5.4, z: 27 },
  { x: 4.5, y: -5.4, z: 27.5 },
];
export const CABIN_DOORS = [-18.7, -16.2, -13.7, -11.2, -8.7];
export const OFFICER_DOORS = [-15.15, -12.75];
export const PASSENGER_FURNITURE = [
  ...[-3.4, 3.4].flatMap((x) =>
    [13, 17, 21].map((z) => ({ x, z, w: 1.45 / W, d: 1.45 / L, kind: 'table' })),
  ),
  ...[-4.4, 4.4].flatMap((x) =>
    [1.4, 5.7].map((z) => ({ x, z, w: 2.4 / W, d: 0.85 / L, kind: 'sofa' })),
  ),
  { x: 4.5, z: 8.3, w: 2.8 / W, d: 0.9 / L, kind: 'piano' },
  ...[-8.2, 8.2].flatMap((x) =>
    [-16, 2, 16].map((z) => ({ x, z, w: 0.65 / W, d: 2 / L, kind: 'bench' })),
  ),
];
const w = (
  x: number,
  z: number,
  width: number,
  depth: number,
  level: Level,
  extra = {},
): PlanWall => ({ x, z, w: width, d: depth, level, ...extra });
const cross = (z: number, x0: number, x1: number, level: Level, gapX = 0, gapW = 1.6) => [
  w((x0 + gapX - gapW / 2) / 2, z, gapX - gapW / 2 - x0, 0.15, level),
  w((gapX + gapW / 2 + x1) / 2, z, x1 - gapX - gapW / 2, 0.15, level),
];
export const PLAN_WALLS: PlanWall[] = [
  ...[-1, 1].flatMap((side) =>
    [
      [7, -19],
      [7, -7],
      [7, 15],
    ].map(([x, z]) => w(side * x, z, 0.24 / W, 0.24 / L, 0, { prop: true })),
  ),
  // Two adjacent forward work areas, with a glazed partition and clear doorway.
  ...[-1, 1].flatMap((side) => [
    w(side * 6.55, -18.15, 0.18, 3.7, 0, { windows: true }),
    w(side * 6.55, -20.9, 0.18, 0.2, 0, { windows: true }),
  ]),
  w(0, -21, 13.1, 0.18, 0, { windows: true }),
  ...[
    [-6.55, -6.45],
    [-5.25, -3.45],
    [-2.25, 5.25],
    [6.45, 6.55],
  ].map(([a, b]) => w((a + b) / 2, -16.3, b - a, 0.15, 0)),
  w(1, -20.05, 0.15, 1.9, 0, { windows: true }),
  w(1, -17.375, 0.15, 2.15, 0, { windows: true }),
  // Closed cabins outboard, passages beside the first funnel and chart room.
  ...[-1, 1].flatMap((side) => [
    w(side * 5.5, -12.775, 0.18, 7.05, 0, { windows: true }),
    w(side * 4.65, -14, 1.7, 4.45, 0, { prop: true }),
    w(side * 3.8, -14, 0.15, 4.45, 0),
    w(side * 4.65, -11.75, 1.7, 0.15, 0),
    w(side * 4.65, -16.3, 1.7, 0.15, 0),
    w(side * 5.25, -9.25, 0.5, 0.15, 0),
  ]),
  // Wireless opens into the crew passage and side promenades. Its aft
  // bulkhead is solid, separating it from the first-class entrance.
  ...cross(-9.25, -5.5, 5.5, 0, -2.8, 1.2),
  w(0, -8.375, 0.15, 1.75, 0),
  ...cross(-7.5, -5.5, 0, 0, -2.6, 1.2),
  ...cross(-7.5, 0, 5.5, 0, 2.6, 1.2),
  w(0, -6.9, 11, 0.15, 0),
  ...[-1, 1].flatMap((side) => [
    w(side * 5.5, -8.375, 0.18, 1.75, 0, { windows: true }),
    w(side * 5.5, -6.95, 0.18, 0.1, 0),
  ]),
  // A broad first-class vestibule with independent side entrances.
  w(0, -6.68, GRAND_HALL.w, 0.15, 0),
  w(0, -3, GRAND_HALL.w, 0.15, 0),
  ...[-1, 1].flatMap((side) => [
    w(side * 4, -6.48, 0.15, 0.4, 0),
    w(side * 4, -4.375, 0.15, 2.75, 0),
  ]),
  // Aft passenger entrance gives the open after deck a destination.
  w(0, 13.95, 4.8, 0.15, 0),
  w(0, 17.45, 4.8, 0.15, 0),
  ...[-1, 1].flatMap((side) => [
    w(side * 2.4, 14.15, 0.15, 0.4, 0),
    w(side * 2.4, 16.175, 0.15, 2.55, 0),
  ]),
  ...VENTILATORS.map((v) => ({ ...v, level: 0 as Level, prop: true })),
  ...FUNNEL_POSITIONS.map((z) => w(0, z, 4, 2.6, 0, { prop: true })),
  ...DECK_OPENINGS.map((o) => w(o.x, o.z, o.w, o.d, 0, { prop: true })),
  w(
    0,
    (grand.top + grand.landingFront) / 2,
    grand.mainWidth / W,
    grand.landingFront - grand.top,
    -2,
    { prop: true },
  ),
  w(
    0,
    (grand.landingFront + grand.landingBack) / 2,
    grand.wellWidth,
    grand.landingBack - grand.landingFront,
    -2,
    { prop: true },
  ),
  ...[-1, 1].map((side) =>
    w(
      side * grand.wingX,
      (grand.foot + grand.landingFront) / 2,
      grand.wingWidth / W,
      grand.landingFront - grand.foot,
      -2,
      { prop: true },
    ),
  ),
  ...[-1, 1].map((side) =>
    w(
      side * (grand.wellWidth / 2 + 0.02),
      (grand.top + grand.landingBack) / 2,
      0.19 / W,
      grand.landingBack - grand.top,
      -2,
      { prop: true },
    ),
  ),
  w(SHAFT.x, SHAFT.z, SHAFT.w, SHAFT.d, -2, { prop: true }),
  w(SHAFT.x, SHAFT.z, SHAFT.w, SHAFT.d, -1, { prop: true }),
  // A deck: closed forward stateroom facades, broad central passage,
  // reception, reading lounge and aft saloon. Outside promenades connect them.
  ...[-1, 1].flatMap((s) => [
    w(s * 4.05, -13.55, 4.7, 14.5, -2, { prop: true }),
    w(s * 1.7, -13.55, 0.17, 14.5, -2),
    ...[
      [-20.8, -6.8],
      [-4.8, 9],
      [10.6, 21.1],
      [22.7, 24.2],
    ].map(([a, b]) => w(s * 6.4, (a + b) / 2, 0.18, b - a, -2)),
  ]),
  w(0, -20.8, 12.8, 0.18, -2),
  w(0, 24.2, 12.8, 0.18, -2),
  ...cross(-6.3, -6.4, 6.4, -2, 0, 2.8),
  ...cross(9.8, -6.4, 6.4, -2, 0, 2.8),
  // Machinery room and coal-bunker passage. Solid doors protect closed spaces.
  ...[-1, 1].flatMap((s) => [
    w(s * 8.9, 7.6, 0.2, 43.8, -1),
    w(s * 5.65, -3, 6.3, 5.7, -1, { prop: true }),
    w(s * 2.5, -3, 0.2, 5.7, -1),
  ]),
  w(0, -14.3, 18, 0.22, -1),
  w(0, 29.5, 18, 0.22, -1),
  ...cross(-6, -8.9, 8.9, -1, 0, 2.4),
  ...cross(0, -8.9, 8.9, -1, 0, 2.4),
  ...BOILERS.map((b) => w(b.x, b.z, (b.radius * 2) / W, b.length / L, -1, { prop: true })),
  w(FIRING_RACK.x, FIRING_RACK.z, 1.5 / W, 0.18 / L, -1, { prop: true }),
  ...[-1, 1].map((s) => w(s * 5, 17, 3, 7, -1, { prop: true })),
  // Distinct machinery spaces connected by broad watertight doorways.
  ...cross(12.2, -8.9, 8.9, -1, 1.6, 3.0),
  ...cross(21.7, -8.9, 8.9, -1, 0, 3.0),
  ...AUXILIARY_FOOTPRINTS,
  // Steering engines sit under the aft deckhouse, above the deep machinery spaces.
  w(-3, 29.2, 0.16, 3.2, 2),
  w(3, 29.2, 0.16, 3.2, 2),
  w(0, 30.8, 6, 0.16, 2),
  ...cross(27.6, -3, 3, 2, 1.5, 1.6),
  // Actual equipment footprints.
  w(BRIDGE.chart.x + 0.26, BRIDGE.chart.z, 3.22, 0.7, 0, { prop: true }),
  w(BRIDGE.wheel.x, BRIDGE.wheel.z, 0.8, 0.5, 0, { prop: true }),
  w(BRIDGE.telegraph.x, BRIDGE.telegraph.z, 0.7, 0.5, 0, { prop: true }),
  w(BRIDGE.command.x, BRIDGE.command.z, 1.8, 0.65, 0, { prop: true }),
  w(BRIDGE.wheel.x - 1.1, BRIDGE.wheel.z, 0.46 / W, 0.46 / L, 0, { prop: true }),
  ...DECK_FITTINGS.map((p) => ({ ...p, prop: true })),
  w(WIRELESS.receiver.x, WIRELESS.receiver.z, 0.95 / W, 3.65 / L, 0, { prop: true }),
  w(WIRELESS.copy.x, WIRELESS.copy.z, 0.55 / W, 1.4 / L, 0, { prop: true }),
  w(4.4, -10.2, 1.6, 0.4, 0, { prop: true }),
  w(0, -10, 1.6, 0.4, 0, { prop: true }),
  w(0, 16, 1.53, 0.92 / L, -1, { prop: true }),
  ...PASSENGER_FURNITURE.map((f) => ({ ...f, level: -2 as Level, prop: true })),
  ...PASSENGER_FURNITURE.filter((f) => f.kind === 'table').flatMap((f) =>
    [-1, 1].map((s) => w(f.x + s * (f.w / 2 + 0.4 / W), f.z, 0.7 / W, 0.6 / L, -2, { prop: true })),
  ),
  ...BOAT_POSITIONS.flatMap((z) =>
    [-1, 1].flatMap((s) => [
      w(s * 8.9, z, 2.8 / W, 9.2 / L, 0, { prop: true }),
      ...[-1, 1].map((end) =>
        w(s * (8.9 - 2.4 / W), z + (end * 3.6) / L, 0.5 / W, 0.65 / L, 0, { prop: true }),
      ),
    ]),
  ),
  w(0, -31, 0.96 / W, 0.96 / L, 2, { prop: true }),
];
export const MACHINERY_CEILING = LEVEL_Y[-1] + 5.4;
// Keep ordinary walking out of the inclined stair bodies and fixed fittings.
PLAN_WALLS.push(
  { x: 0, z: -3.825, w: 2.45 / W, d: 1.65, level: -2, prop: true },
  { x: 0, z: 15.825, w: 2.45 / W, d: 1.65, level: -2, prop: true },
  { x: 7.7, z: -22.775, w: 1.55 / W, d: 3.45, level: 2, prop: true },
  { x: 4.5, z: 25.75, w: 1.55 / W, d: 2.5, level: 2, prop: true },
  {
    x: WIRELESS.apparatus.x,
    z: WIRELESS.apparatus.z,
    w: 1.25 / W,
    d: 2.6 / L,
    level: 0,
    prop: true,
  },
  ...[-1, 1].map((side) => ({
    x: side * 6.12,
    z: 4.4,
    w: 0.38 / W,
    d: 4.1 / L,
    level: -2 as Level,
    prop: true,
  })),
);
// The casing passes through A deck. Its walls replace any intersected room
// partition, so a saloon bulkhead can never slice across a descending flight.
for (let i = PLAN_WALLS.length - 1; i >= 0; i--) {
  const p = PLAN_WALLS[i];
  if (p.level !== -2 || p.prop) continue;
  const x0 = SHAFT.x - SHAFT.w / 2,
    x1 = SHAFT.x + SHAFT.w / 2;
  const z0 = SHAFT.z - SHAFT.d / 2,
    z1 = SHAFT.z + SHAFT.d / 2;
  if (p.x + p.w / 2 <= x0 || p.x - p.w / 2 >= x1 || p.z + p.d / 2 <= z0 || p.z - p.d / 2 >= z1)
    continue;
  PLAN_WALLS.splice(i, 1);
  if (p.w > p.d) {
    for (const [a, b] of [
      [p.x - p.w / 2, x0],
      [x1, p.x + p.w / 2],
    ])
      if (b > a) PLAN_WALLS.push({ ...p, x: (a + b) / 2, w: b - a });
  } else {
    for (const [a, b] of [
      [p.z - p.d / 2, z0],
      [z1, p.z + p.d / 2],
    ])
      if (b > a) PLAN_WALLS.push({ ...p, z: (a + b) / 2, d: b - a });
  }
}
for (const z of [-13.6, -6.6])
  for (const x of [-6.3, 0, 6.3]) {
    if (z === -6.6 && x === 0) continue;
    PLAN_WALLS.push({ x, z, w: 3.6 / W, d: 1.4 / L, level: -1, prop: true });
  }
export const STAIR_WIDTH = 1.3; // metres, including full treads
export const AUXILIARY_PUMPS = [-6.8, 6.8].flatMap((x) =>
  [3.5, 10].map((z) => ({ x, z, w: 2.8 / W, d: 2.6 / L })),
);
PLAN_WALLS.push(...AUXILIARY_PUMPS.map((p) => ({ ...p, level: -1 as Level, prop: true })));
export const STAIR_HEADROOM = 1.9; // minimum tested eye/ceiling allowance
export const floorMetres = (level: Level) => LEVEL_Y[level] * H;

export const DOORWAYS = [
  { x: 1, z: -18.775, w: 0.15, d: 0.65 },
  { x: -6.55, z: -20.45, w: 0.18, d: 0.8 },
  { x: 6.55, z: -20.45, w: 0.18, d: 0.8 },
  { x: -2.85, z: -16.3, w: 1.2, d: 0.15 },
  { x: -5.975, z: -16.3, w: 0.95, d: 0.15 },
  { x: 5.975, z: -16.3, w: 0.95, d: 0.15 },
  { x: -2.8, z: -9.25, w: 1.2, d: 0.15 },
  { x: -2.6, z: -7.5, w: 1.2, d: 0.15 },
  { x: 2.6, z: -7.5, w: 1.2, d: 0.15 },
  { x: -5.5, z: -7.25, w: 0.18, d: 0.5 },
  { x: 5.5, z: -7.25, w: 0.18, d: 0.5 },
  ...[-1, 1].map((side) => ({ x: (side * GRAND_HALL.w) / 2, w: 0.15, ...GRAND_HALL_DOOR })),
  { x: -2.4, z: 14.6, w: 0.15, d: 0.5 },
  { x: 2.4, z: 14.6, w: 0.15, d: 0.5 },
];

// One solid per straight wall run: duplicate end bulkheads used to flicker.
for (let i = 0; i < PLAN_WALLS.length; i++) {
  const a = PLAN_WALLS[i];
  if (a.prop) continue;
  const horizontal = a.w > a.d;
  for (let j = i + 1; j < PLAN_WALLS.length; j++) {
    const b = PLAN_WALLS[j];
    if (b.prop || b.level !== a.level || !!b.windows !== !!a.windows || b.w > b.d !== horizontal)
      continue;
    const fixed = horizontal ? 'z' : 'x',
      extent = horizontal ? 'w' : 'd',
      variable = horizontal ? 'x' : 'z',
      thick = horizontal ? 'd' : 'w';
    if (Math.abs(a[fixed] - b[fixed]) > 1e-6 || Math.abs(a[thick] - b[thick]) > 1e-6) continue;
    const lo = Math.min(a[variable] - a[extent] / 2, b[variable] - b[extent] / 2),
      hi = Math.max(a[variable] + a[extent] / 2, b[variable] + b[extent] / 2);
    if (hi - lo > a[extent] + b[extent] + 1e-6) continue;
    a[variable] = (lo + hi) / 2;
    a[extent] = hi - lo;
    PLAN_WALLS.splice(j, 1);
    j = i;
  }
}
