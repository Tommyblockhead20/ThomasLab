import type { ShipState } from './types';
import { firebed, setBeds } from './firing';
export const BOILER_COUNT = 4;
export const boilerIndex = (id: string) =>
  'abcd'.indexOf(id.match(/^boiler-([abcd])(?:-rear)?$/)?.[1] ?? '?');
export const steamPsi = (pressure: number) => (pressure * 215) / 76;
export const fullPowerStrain = (setting: number) => Math.max(0, Math.min(1, (setting - 20) / 5));
// Compressed game load curve: faster passage needs disproportionate steam.
export const steamDemand = (setting: number) => 17 * Math.pow(Math.max(0, setting) / 20, 2.4);
export function stepPlant(
  ship: ShipState,
  dt: number,
  valveEfficiency = 1,
  tendingRate = 1,
  engineEfficiency = 1,
) {
  const load = 1 + fullPowerStrain(ship.throttle) * 0.22;
  for (let i = 0; i < ship.fires.length; i++) {
    const heat = ship.fireHeat[i] ?? ship.fires[i];
    const beds = [0, 1, 2].map((z) => firebed(ship, i, z));
    for (const [z, b] of beds.entries()) {
      b.coal = Math.max(0, b.coal - dt * tendingRate * load * (0.0005 + heat * 0.003));
      b.ash = Math.min(1, b.ash + heat * dt * tendingRate * load * 0.0028);
      ship.clinker[i][z] = Math.min(
        1,
        ship.clinker[i][z] + dt * tendingRate * load * heat * ship.fires[i] * 0.0014,
      );
    }
    setBeds(
      ship,
      i,
      beds.map((b) => b.coal),
      beds.map((b) => b.ash),
    );
    const efficiency =
      beds.reduce(
        (sum, b, z) =>
          sum +
          Math.min(1, b.coal / 0.32) *
            (1 - Math.max(0, b.coal - 0.78) * 1.9) *
            (1 - b.ash * 0.62) *
            (1 - ship.clinker[i][z] * 0.55) *
            (b.open ? 0.66 : 1),
        0,
      ) / 3;
    const target = ship.fires[i] * efficiency;
    ship.fireHeat[i] = heat + (target - heat) * Math.min(1, dt / (target < heat ? 5 : 8));
  }
  const fire = ship.fireHeat.reduce((a, b) => a + b, 0) / ship.fireHeat.length;
  const connected = ship.boilerConnected.filter(Boolean).length;
  const valve = ship.mainSteamValve * valveEfficiency;
  const headerMean = connected
    ? ship.boilerPressure.reduce((sum, p, i) => sum + (ship.boilerConnected[i] ? p : 0), 0) /
      connected
    : 0;
  for (let i = 0; i < BOILER_COUNT; i++) {
    // Each shell stores steam separately. Connected boilers share engine demand;
    // an isolated boiler still fires and must be cooled or eased deliberately.
    const draw =
      ship.boilerConnected[i] && connected
        ? ((steamDemand(ship.throttle) * 4) / connected) * valve
        : 0;
    const target = Math.max(0, ship.fireHeat[i] * 143 - draw);
    let pressure = ship.boilerPressure[i];
    pressure += (target - pressure) * Math.min(1, dt / 9);
    if (ship.boilerConnected[i]) pressure += (headerMean - pressure) * Math.min(1, dt / 2);
    ship.reliefUntil[i] = Math.max(0, ship.reliefUntil[i] - dt);
    if (steamPsi(pressure) >= 226) ship.safetyLifted[i] = true;
    if (steamPsi(pressure) <= 218) ship.safetyLifted[i] = false;
    if (ship.safetyLifted[i] || ship.reliefUntil[i] > 0) pressure -= dt * 4.2;
    if (ship.boilerConnected[i]) pressure -= ship.steamLeak * dt * 1.25;
    ship.boilerPressure[i] = Math.max(0, pressure);
  }
  const supply =
    (ship.boilerPressure.reduce((sum, p, i) => sum + (ship.boilerConnected[i] ? p : 0), 0) /
      BOILER_COUNT) *
    valve * (1 - ship.steamLeak * 0.12);
  ship.steam += (supply - ship.steam) * Math.min(1, dt / 3);
  const revs = ship.throttle * 3.2 * Math.min(1, ship.steam / 63) * engineEfficiency;
  ship.engineRevs += (revs - ship.engineRevs) * Math.min(1, dt / 3);
  return fire;
}
