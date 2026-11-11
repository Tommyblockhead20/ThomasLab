import { chartCoordinates, chartPosition, METRES_PER_NM } from './units';
export interface IceReport {
  west: number;
  north: number;
  radiusWest: number;
  radiusNorth: number;
  observedAt: number;
  kind: 'ice';
}
export interface LineMessage {
  id: string;
  from: string;
  text: string;
  at: number;
}
export const PHONE_LINKS: Record<string, string[]> = {
  bridge: ['nest', 'engine', 'wireless'],
  nest: ['bridge', 'wireless'],
  engine: ['bridge', 'boiler', 'wireless'],
  boiler: ['engine', 'wireless'],
  wireless: ['bridge', 'nest', 'engine', 'boiler'],
};
export const DEPARTMENTS: Record<string, string> = {
  bridge: 'Bridge',
  nest: 'Crow’s nest',
  engine: 'Engine room',
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
  return `ICE ${pos(p.lat, true)} ${pos(p.lon, false)} EXTENT ${((r.radiusWest * 2) / METRES_PER_NM).toFixed(2)} BY ${((r.radiusNorth * 2) / METRES_PER_NM).toFixed(2)} NM SIGHTED ${watchTime(r.observedAt)}`;
}
export function reportSummary(r: IceReport) {
  return `${chartPosition(r.west, r.north)} · ${((r.radiusWest * 2) / METRES_PER_NM).toFixed(2)} × ${((r.radiusNorth * 2) / METRES_PER_NM).toFixed(2)} NM`;
}
