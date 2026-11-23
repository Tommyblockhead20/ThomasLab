import type { Station } from './types';
import { SHIP_LENGTH_SCALE as L, SHIP_WIDTH_SCALE as W } from './navigation';
export const AFT_HATCH = { x: -1.7, z: 28.5, w: 1.2, d: 0.7 };
export const FEED_PUMPS = [-6.8, 6.8].map((x, i) => ({
  id: `feed-pump-${i + 1}`,
  x,
  z: 3.5,
  index: i,
}));
export const CONDENSERS = [-6.8, 6.8].map((x, i) => ({
  id: `condenser-${i + 1}`,
  x,
  z: 10,
  index: i,
}));
export const DYNAMOS = [-5, 5].map((x, i) => ({ id: `dynamo-${i + 1}`, x, z: 24, index: i }));
export const AUXILIARY_STATIONS: Station[] = [
  ...FEED_PUMPS.map((p) => ({
    id: p.id,
    name: `Feed pump ${p.index + 1}`,
    x: p.x,
    z: p.z + 1.65 / L,
    level: -1 as const,
    kind: 'auxiliary' as const,
    ...(p.index === 0 ? { machine: 'feedwater' as const } : {}),
  })),
  ...[-2.1, -0.7, 0.7, 2.1].map((x, i) => ({
    id: `feed-valve-${i + 1}`,
    name: `Boiler ${i + 1} feedwater`,
    x,
    z: 1.2,
    level: -1 as const,
    kind: 'auxiliary' as const,
  })),
  ...CONDENSERS.map((p) => ({
    id: p.id,
    name: `${p.index ? 'Starboard' : 'Port'} condenser`,
    x: p.x,
    z: p.z + 1.65 / L,
    level: -1 as const,
    kind: 'auxiliary' as const,
    ...(p.index === 0 ? { machine: 'condenser' as const } : {}),
  })),
  ...DYNAMOS.map((p) => ({
    id: p.id,
    name: `Dynamo ${p.index + 1}`,
    x: p.x,
    z: p.z + 2 / L,
    level: -1 as const,
    kind: 'auxiliary' as const,
    ...(p.index === 0 ? { machine: 'dynamos' as const } : {}),
  })),
  ...(['lighting', 'ventilation', 'wireless'] as const).map((c, i) => ({
    id: `circuit-${c}`,
    name: `${c[0].toUpperCase() + c.slice(1)} feeder`,
    x: -1.2 + i * 1.2,
    z: 22.5,
    level: -1 as const,
    kind: 'auxiliary' as const,
  })),
  {
    id: 'bearing-oil',
    name: 'Bearing oil reservoir',
    x: 2.3,
    z: 18.7,
    level: -1,
    kind: 'auxiliary',
  },
];
export const AUXILIARY_FOOTPRINTS = [
  ...DYNAMOS.map((p) => ({
    x: p.x,
    z: p.z,
    w: 3.2 / W,
    d: 3.8 / L,
    level: -1 as const,
    prop: true,
  })),
  ...AUXILIARY_STATIONS.filter(
    (s) => s.id.startsWith('feed-valve-') || s.id.startsWith('circuit-') || s.id === 'bearing-oil',
  ).map((s) => ({
    x: s.x,
    z: s.z - 0.16 / L,
    w: 0.75 / W,
    d: 0.5 / L,
    level: -1 as const,
    prop: true,
  })),
  { ...AFT_HATCH, level: -1 as const, prop: true },
  { ...AFT_HATCH, level: 2 as const, prop: true },
  { x: 1.2, z: 29.7, w: 2.8 / W, d: 2.2 / L, level: 2 as const, prop: true },
];
