import { BRIDGE } from './layout';
import {
  NEST,
  NEST_PHONE,
  NEST_BELL,
  NEST_ENTRY,
  NEST_EXIT,
  lookoutSpawn,
  insideNest,
} from './lookout';
import type { Level, Position, Station } from './types';
import { SHIP_WIDTH_SCALE as W, SHIP_LENGTH_SCALE as L, hullContact } from './navigation';
import {
  LEVEL_Y,
  FUNNEL_POSITIONS,
  BOAT_DECK_FRONT,
  BOAT_DECK_BACK,
  DECK_HOUSES,
  DECK_OPENINGS,
  BOAT_POSITIONS,
  PASSENGER_FURNITURE,
  PLAN_WALLS,
  BOILERS,
  passengerRoute,
  aftPassengerRoute,
  machineryRoute,
  foreRoute,
  aftRoute,
  type PlanWall,
} from './layout';
export {
  LEVEL_Y,
  FUNNEL_POSITIONS,
  BOAT_DECK_FRONT,
  BOAT_DECK_BACK,
  DECK_HOUSES,
  DECK_OPENINGS,
  BOAT_POSITIONS,
  PASSENGER_FURNITURE,
};
export type Wall = PlanWall;
export const WALLS: Wall[] = [...PLAN_WALLS];
const mastRoute = [
  { x: NEST_ENTRY.x, z: NEST_ENTRY.z, y: LEVEL_Y[2] },
  { x: 0, y: LEVEL_Y[2], z: NEST.z },
  { x: 0, y: LEVEL_Y[1], z: NEST.z },
  { x: NEST_EXIT.x, z: NEST_EXIT.z, y: LEVEL_Y[1] },
];
function passage(
  id: string,
  name: string,
  level: Level,
  destination: Position,
  route: { x: number; y: number; z: number }[],
  seconds: number,
): Station {
  const path = [...route];
  const end = path.at(-1)!;
  if (end.x !== destination.x || end.z !== destination.z || end.y !== LEVEL_Y[destination.level])
    path.push({ x: destination.x, z: destination.z, y: LEVEL_Y[destination.level] });
  return {
    id,
    name,
    kind: 'ladder',
    x: route[0].x,
    z: route[0].z,
    level,
    destination,
    route: path,
    travelSeconds: seconds,
  };
}
export const STATIONS: Station[] = [
  {
    id: 'wheel',
    name: 'Ship’s wheel',
    kind: 'wheel',
    machine: 'steering',
    ...BRIDGE.wheel,
    level: 0,
  },
  {
    id: 'chart',
    name: 'Navigation chart',
    kind: 'chart',
    machine: 'compass',
    ...BRIDGE.chart,
    level: 0,
  },
  { id: 'telegraph', name: 'Engine telegraph', kind: 'telegraph', ...BRIDGE.telegraph, level: 0 },
  {
    id: 'bridge-phone',
    name: 'Bridge telephone',
    kind: 'phone',
    phoneRoom: 'bridge',
    ...BRIDGE.phone,
    level: 0,
  },
  {
    id: 'wireless',
    name: 'Marconi receiver',
    kind: 'wireless',
    machine: 'wireless',
    x: -2.6,
    z: -8,
    level: 0,
  },
  { id: 'command', name: 'Captain’s order desk', kind: 'command', ...BRIDGE.command, level: 0 },
  {
    id: 'wireless-copy',
    name: 'Marconi second desk',
    kind: 'wireless',
    machine: 'wireless',
    x: -4.5,
    z: -8.85,
    level: 0,
  },
  { id: 'cabinet', name: 'Binocular cabinet', kind: 'cabinet', x: 4.4, z: -10.2, level: 0 },
  {
    id: 'wireless-phone',
    name: 'Ship telephone',
    kind: 'phone',
    phoneRoom: 'wireless',
    x: -4.5,
    z: -7.65,
    level: 0,
  },
  { id: 'storage', name: 'Equipment locker', kind: 'storage', x: 0, z: -10, level: 0 },
  passage(
    'deck-passengers',
    'Descend · A Deck',
    0,
    { x: 0, z: -2.4, level: -2 },
    passengerRoute,
    3.6,
  ),
  passage(
    'passengers-deck',
    'Climb · Boat Deck',
    -2,
    { x: 0, z: -5.45, level: 0 },
    [...passengerRoute].reverse(),
    3.6,
  ),
  passage(
    'deck-aft-passengers',
    'Descend · aft passenger stair',
    0,
    { x: 0, z: 17.4, level: -2 },
    aftPassengerRoute,
    3.6,
  ),
  passage(
    'aft-passengers-deck',
    'Climb · aft Boat Deck entrance',
    -2,
    { x: 0, z: 14.5, level: 0 },
    [...aftPassengerRoute].reverse(),
    3.6,
  ),
  passage(
    'deck-engine',
    'Descend · machinery casing',
    0,
    { x: -4.75, z: 6.35, level: -1 },
    machineryRoute,
    14,
  ),
  passage(
    'engine-deck',
    'Climb · Boat Deck',
    -1,
    { x: -4.75, z: 6.35, level: 0 },
    [...machineryRoute].reverse(),
    14,
  ),
  passage(
    'deck-forecastle',
    'Descend · forecastle',
    0,
    { x: 7.7, z: -25, level: 2 },
    foreRoute,
    4.5,
  ),
  passage(
    'forecastle-deck',
    'Climb · Boat Deck',
    2,
    { x: 7.7, z: -20, level: 0 },
    [...foreRoute].reverse(),
    4.5,
  ),
  passage('deck-poop', 'Descend · aft well deck', 0, { x: 4.5, z: 27.5, level: 2 }, aftRoute, 4.5),
  passage(
    'poop-deck',
    'Climb · Boat Deck',
    2,
    { x: 4.5, z: 23.3, level: 0 },
    [...aftRoute].reverse(),
    4.5,
  ),
  passage('deck-nest', 'Climb · foremast ladder', 2, NEST_EXIT, mastRoute, 7.5),
  passage('nest-deck', 'Descend · forecastle', 1, NEST_ENTRY, [...mastRoute].reverse(), 7.5),
  {
    id: 'nest-phone',
    name: 'Bridge telephone',
    kind: 'phone',
    phoneRoom: 'nest',
    ...NEST_PHONE,
  },
  { id: 'bell', name: 'Lookout bell', kind: 'bell', ...NEST_BELL },
  {
    id: 'engines',
    name: 'Engine control stand',
    kind: 'engine',
    machine: 'engines',
    x: 0,
    z: 16,
    level: -1,
  },
  {
    id: 'engine-phone',
    name: 'Engine room telephone',
    kind: 'phone',
    phoneRoom: 'engine',
    x: 7,
    z: 5,
    level: -1,
  },
  {
    id: 'steering',
    name: 'Steering linkage',
    kind: 'machine',
    machine: 'steering',
    x: 6,
    z: 25,
    level: -1,
  },
  {
    id: 'valve',
    name: 'Main steam valve',
    kind: 'machine',
    machine: 'valve',
    x: -1.75,
    z: -3,
    level: -1,
  },
  {
    id: 'gauge',
    name: 'Steam pressure gauge',
    kind: 'machine',
    machine: 'gauge',
    x: 1.75,
    z: -3,
    level: -1,
  },
  ...BOILERS.map((b) => ({
    id: b.id,
    name: 'Boiler ' + (b.index + 1),
    kind: 'boiler' as const,
    x: b.stationX,
    z: b.stationZ,
    level: -1 as Level,
  })),
  {
    id: 'boiler-phone',
    name: 'Boiler room telephone',
    kind: 'phone',
    phoneRoom: 'boiler',
    x: -1.75,
    z: -6.7,
    level: -1,
  },
  { id: 'passenger-lounge', name: 'A Deck lounge', kind: 'scenery', x: 0, z: 5, level: -2 },
];
for (const [index, z] of BOAT_POSITIONS.entries())
  for (const side of [-1, 1])
    STATIONS.push({
      id: 'boat-' + side + '-' + index,
      name: 'Lifeboat ' + (side === 1 ? 3 + index * 2 : 4 + index * 2),
      kind: 'lifeboat',
      x: side * 7.5,
      z,
      level: 0,
    });
for (const station of STATIONS.filter((s) => s.kind === 'machine'))
  WALLS.push({ x: station.x, z: station.z, w: 0.8, d: 0.55, level: station.level, prop: true });
for (const s of STATIONS.filter((s) => s.kind === 'phone' && s.level !== 1))
  WALLS.push({ x: s.x, z: s.z, w: 0.5, d: 0.35, level: s.level, prop: true });
export const KEY_SPOTS: Position[] = [
  { x: 6, z: 7, level: 0 },
  { x: -6, z: -18, level: 0 },
  { x: 6, z: 22, level: 0 },
];
export function distance(a: Position, b: Position) {
  return a.level === b.level ? Math.hypot((a.x - b.x) * W, (a.z - b.z) * L) : Infinity;
}
export function roomAt(p: Position) {
  if (p.level === 1) return 'nest';
  if (p.level === 2) return p.z < 0 ? 'forecastle' : 'poop';
  if (p.level === -2) return 'passengers';
  if (p.level === -1) return p.z > 0 ? 'engine' : 'boiler';
  if (p.z < -16.3 && Math.abs(p.x) < 6.55) return p.x > 1 ? 'bridge' : 'chart';
  if (Math.abs(p.x) < 5.5 && p.z > -9.25 && p.z < -6.9) return 'wireless';
  if (Math.abs(p.x) < 5.5 && p.z > -16.3 && p.z < -9.25) return 'quarters';
  return 'deck';
}
export function areaName(p: Position) {
  return (
    {
      nest: 'Crow’s nest',
      engine: 'Engine room',
      boiler: 'Boiler room',
      bridge: 'Captain’s bridge',
      chart: 'Officer’s wheelhouse',
      wireless: 'Wireless room',
      quarters: 'Officers’ quarters',
      deck: 'Boat Deck',
      passengers: 'A Deck · promenade',
      forecastle: 'Forecastle',
      poop: 'Aft well deck',
    } as Record<string, string>
  )[roomAt(p)];
}
export function spawnFor(role: string): Position {
  if (role.includes('Lookout')) return lookoutSpawn(role.includes('Second'));
  if (role.includes('Boiler'))
    return { x: role.includes('Second') ? 4.2 : -4.2, z: -8.8, level: -1 };
  if (role.includes('Engineer'))
    return { x: role.includes('Second') ? 5 : 0, z: role.includes('Second') ? 5 : 10, level: -1 };
  if (role.includes('Wireless'))
    return {
      x: role.includes('Second') ? -4.5 : -2.6,
      z: role.includes('Second') ? -8.55 : -7.3,
      level: 0,
    };
  if (role === 'Helmsman') return { x: BRIDGE.wheel.x, z: -19.5, level: 0 };
  return role === 'Deck Officer' ? { x: -3.2, z: -18, level: 0 } : { x: 3.4, z: -18.1, level: 0 };
}
export function canOccupy(p: Position) {
  const rx = 0.24 / W,
    rz = 0.24 / L;
  if (p.level === 1) return insideNest(p);
  if (p.level === 2) {
    const limit =
      p.z < 0
        ? Math.min(9.4, Math.max(0, (p.z + 38) * 1.1))
        : Math.min(9.4, Math.max(0, (35 - p.z) * 1.8));
    if (
      !((p.z < -22 && p.z > -37.5) || (p.z > 26 && p.z < 33.7)) ||
      Math.abs(p.x) > limit - rx ||
      hullContact({ x: p.x * W, z: p.z * L }, 0).gap > -0.24
    )
      return false;
  } else if (
    Math.abs(p.x) > 9.8 - rx ||
    p.z < (p.level === 0 ? BOAT_DECK_FRONT : p.level === -2 ? -20.95 : -14.2) + rz ||
    p.z > (p.level === 0 ? BOAT_DECK_BACK : p.level === -2 ? 24.3 : 29.3) - rz
  )
    return false;
  return !WALLS.some(
    (w) =>
      w.level === p.level &&
      Math.abs(p.x - w.x) < w.w / 2 + rx &&
      Math.abs(p.z - w.z) < w.d / 2 + rz,
  );
}
export function moveWithCollision(p: Position, dx: number, dz: number) {
  const next = { ...p },
    steps = Math.max(1, Math.ceil(Math.hypot(dx * W, dz * L) / 0.16));
  for (let i = 0; i < steps; i++) {
    if (canOccupy({ ...next, x: next.x + dx / steps })) next.x += dx / steps;
    if (canOccupy({ ...next, z: next.z + dz / steps })) next.z += dz / steps;
  }
  return next;
}
export function wallsBetween(a: Position, b: Position) {
  if (a.level !== b.level) return 100;
  let count = 0;
  for (const w of WALLS) {
    if (w.level !== a.level || w.prop) continue;
    let lo = 0,
      hi = 1;
    for (const [o, d, min, max] of [
      [a.x, b.x - a.x, w.x - w.w / 2, w.x + w.w / 2],
      [a.z, b.z - a.z, w.z - w.d / 2, w.z + w.d / 2],
    ]) {
      if (Math.abs(d) < 1e-8) {
        if (o < min || o > max) {
          hi = -1;
          break;
        }
      } else {
        const t1 = (min - o) / d,
          t2 = (max - o) / d;
        lo = Math.max(lo, Math.min(t1, t2));
        hi = Math.min(hi, Math.max(t1, t2));
      }
    }
    if (lo <= hi && hi >= 0 && lo <= 1) count++;
  }
  return count;
}
export function travelPoint(station: Station, t: number) {
  const route = station.route ?? [];
  if (route.length < 2) return { x: station.x, y: LEVEL_Y[station.level], z: station.z };
  if (t >= 1) return { ...route.at(-1)! };
  if (t <= 0) return { ...route[0] };
  const lengths = route
      .slice(1)
      .map((p, i) =>
        Math.hypot((p.x - route[i].x) * W, (p.y - route[i].y) * 1.15, (p.z - route[i].z) * L),
      ),
    total = lengths.reduce((a, b) => a + b, 0);
  let remaining = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const f = Math.min(1, remaining / lengths[i]);
      return {
        x: route[i].x + (route[i + 1].x - route[i].x) * f,
        y: route[i].y + (route[i + 1].y - route[i].y) * f,
        z: route[i].z + (route[i + 1].z - route[i].z) * f,
      };
    }
    remaining -= lengths[i];
  }
  return route.at(-1)!;
}
