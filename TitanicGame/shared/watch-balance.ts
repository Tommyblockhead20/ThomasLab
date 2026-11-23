import type { Machine, ShipState } from './types';
import { fullPowerStrain } from './plant';
export function naturalFailureChance(machine: Machine, ship: ShipState, sustainedSeconds: number) {
  const machinery = ['engines', 'valve', 'feedwater', 'condenser', 'dynamos'].includes(machine.id);
  const load = fullPowerStrain(ship.throttle) * Math.min(1, sustainedSeconds / 45);
  const neglected =
    (Math.max(0, 0.55 - ship.auxiliary.lubrication) / 0.55 +
      Math.max(0, 0.8 - ship.auxiliary.vacuum) / 0.8) /
    2;
  return Math.min(
    0.7,
    0.16 + (1 - machine.condition / 100) * 0.4 + (machinery ? load * (0.1 + 0.14 * neglected) : 0),
  );
}
export const firingRate = (crew: number) => (crew === 5 || crew === 6 ? 0.55 : crew < 9 ? 0.65 : 1);
