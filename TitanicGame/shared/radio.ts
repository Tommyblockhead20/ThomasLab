import { NAVIGATION_RATE } from './navigation';
import { KNOT_IN_METRES_PER_SECOND } from './units';
import { chartCoordinates, chartPosition, METRES_PER_NM } from './units';
export interface IceReport {
  west: number;
  north: number;
  radiusWest: number;
  radiusNorth: number;
  observedAt: number;
  kind: 'ice';
  count?: number;
  passage?: 'north' | 'south';
  replaces?: string;
  repeat?: boolean;
}
export interface LineMessage {
  id: string;
  from: string;
  text: string;
  at: number;
}
export const PHONE_LINKS: Record<string, string[]> = {
  bridge: ['nest', 'engine', 'wireless', 'steering'],
  nest: ['bridge', 'wireless'],
  engine: ['bridge', 'boiler', 'wireless', 'auxiliary', 'dynamo', 'steering'],
  boiler: ['engine', 'wireless', 'auxiliary'],
  wireless: ['bridge', 'nest', 'engine', 'boiler', 'dynamo'],
  auxiliary: ['boiler', 'engine', 'dynamo'],
  dynamo: ['auxiliary', 'engine', 'wireless'],
  steering: ['bridge', 'engine'],
};
export const DEPARTMENTS: Record<string, string> = {
  bridge: 'Bridge',
  nest: 'Crow’s nest',
  engine: 'Engine room',
  auxiliary: 'Feedwater',
  dynamo: 'Dynamo room',
  steering: 'Steering',
  boiler: 'Stokehold',
  wireless: 'Wireless room',
};
export function watchTime(seconds: number) {
  const m = (23 * 60 + 30 + Math.floor(seconds / 60) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;
}
export function iceReport(west: number, north: number, observedAt: number): IceReport {
  // Round to the precision actually transmitted: one tenth of a minute.
  const c = chartCoordinates(west, north),
    lat = Math.round(c.lat * 600) / 600,
    lon = Math.round(c.lon * 600) / 600;
  const datum = chartCoordinates(0, 0);
  return {
    kind: 'ice',
    west: (datum.lon - lon) * METRES_PER_NM * 60 * Math.cos((datum.lat * Math.PI) / 180),
    north: (lat - datum.lat) * METRES_PER_NM * 60,
    radiusWest: 0.16 * METRES_PER_NM,
    radiusNorth: 0.1 * METRES_PER_NM,
    observedAt,
  };
}
export function iceMessage(r: IceReport) {
  const p = chartCoordinates(r.west, r.north);
  const pos = (n: number, axis: boolean) =>
    `${Math.floor(Math.abs(n))} ${((Math.abs(n) % 1) * 60).toFixed(1)} ${axis ? (n >= 0 ? 'N' : 'S') : n >= 0 ? 'E' : 'W'}`;
  return `${r.count ? `${r.count} BERGS REPORTED ` : ''}ICE ${pos(p.lat, true)} ${pos(p.lon, false)} EXTENT ${((r.radiusWest * 2) / METRES_PER_NM).toFixed(2)} BY ${((r.radiusNorth * 2) / METRES_PER_NM).toFixed(2)} NM SIGHTED ${watchTime(r.observedAt)}${r.passage ? ` POSSIBLE PASSAGE ${r.passage.toUpperCase()} OF REPORTED GROUP` : ''}${r.replaces ? (r.repeat ? ' REPEAT OF PREVIOUS REPORT' : ' CORRECTION TO PREVIOUS POSITION') : ''}`;
}
export function reportSummary(r: IceReport) {
  return `${chartPosition(r.west, r.north)} · ${((r.radiusWest * 2) / METRES_PER_NM).toFixed(2)} × ${((r.radiusNorth * 2) / METRES_PER_NM).toFixed(2)} NM`;
}

// Uses the transmitted area and observed instruments only, never hidden ice.
export function assessReport(
  r: IceReport,
  ship: { west: number; north: number; indicatedHeading: number; speed: number },
  now: number,
) {
  const a = ((ship.indicatedHeading - 270) * Math.PI) / 180,
    dx = r.west - ship.west,
    dy = r.north - ship.north;
  const along = dx * Math.cos(a) + dy * Math.sin(a),
    across = -dx * Math.sin(a) + dy * Math.cos(a);
  const extent = Math.abs(Math.sin(a)) * r.radiusWest + Math.abs(Math.cos(a)) * r.radiusNorth;
  const speed = ship.speed * KNOT_IN_METRES_PER_SECOND * NAVIGATION_RATE;
  return {
    distanceNm: Math.hypot(dx, dy) / METRES_PER_NM,
    minutes: along > 0 && speed > 0.1 ? along / speed / 60 : null,
    crossesCourse: along > 0 && Math.abs(across) < extent + 100,
    ageMinutes: Math.max(0, (now - r.observedAt) / 60),
  };
}
