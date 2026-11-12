import type { ShipState } from './types';
export type FiringTool = 'coal' | 'slice' | 'rake';
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
export const emptyFireZones = () => Array.from({ length: 4 }, () => [0, 0, 0]);
export const closedFireDoors = () => Array.from({ length: 4 }, () => [false, false, false]);
export function firebed(ship: ShipState, bank: number, zone: number) {
  return {
    coal: clamp(ship.coal[bank] + ship.bedBalance[bank][zone]),
    ash: clamp(ship.ash[bank] + ship.ashBalance[bank][zone]),
    clinker: ship.clinker[bank][zone],
    open: ship.fireDoors[bank][zone],
  };
}
export function setBeds(ship: ShipState, bank: number, coal: number[], ash: number[]) {
  ship.coal[bank] = mean(coal);
  ship.ash[bank] = mean(ash);
  ship.bedBalance[bank] = coal.map((v) => v - ship.coal[bank]);
  ship.ashBalance[bank] = ash.map((v) => v - ship.ash[bank]);
}
export function tendFire(
  ship: ShipState,
  bank: number,
  zone: number,
  tool: FiringTool,
  trained: boolean,
  draw = false,
) {
  const beds = [0, 1, 2].map((z) => firebed(ship, bank, z)),
    b = beds[zone];
  if ((tool !== 'rake' || draw) && !b.open) throw Error('Open the fire door first.');
  if (draw) {
    if (tool !== 'rake') throw Error('Use the rake to draw a fire.');
    b.coal = clamp(b.coal - (trained ? 0.14 : 0.08));
    b.ash = clamp(b.ash + 0.04);
    ship.fireHeat[bank] *= 0.93;
    setBeds(ship, bank, beds.map(b => b.coal), beds.map(b => b.ash));
    return;
  }
  if (tool === 'coal') {
    b.coal = clamp(b.coal + (trained ? 0.16 : 0.09));
    ship.fireHeat[bank] *= 0.97;
  }
  if (tool === 'slice') {
    ship.clinker[bank][zone] = clamp(b.clinker - (trained ? 0.26 : 0.14));
    b.coal = clamp(b.coal - 0.018);
  }
  if (tool === 'rake') b.ash = clamp(b.ash - (trained ? 0.24 : 0.12));
  setBeds(
    ship,
    bank,
    beds.map((b) => b.coal),
    beds.map((b) => b.ash),
  );
}
