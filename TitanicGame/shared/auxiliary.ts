import type { MachineId, ShipState } from './types';

export type PowerCircuit = 'lighting' | 'ventilation' | 'wireless';
export interface AuxiliaryState {
  boilerWater: number[];
  feedValves: number[];
  feedPumps: boolean[];
  pumpRevs: number[];
  strainers: number[];
  feedFlow: number;
  coolingValves: number[];
  vacuum: number;
  generators: boolean[];
  generatorRevs: number[];
  governors: number[];
  voltage: number;
  electricalLoad: number;
  circuits: Record<PowerCircuit, boolean>;
  wirelessBattery: number;
  lubrication: number;
  bearingHeat: number;
  steeringSet: number;
  steeringSteam: number;
}
export const newAuxiliaries = (): AuxiliaryState => ({
  boilerWater: [0.6, 0.6, 0.6, 0.6],
  feedValves: [0.55, 0.55, 0.55, 0.55],
  feedPumps: [true, false],
  pumpRevs: [1, 0],
  strainers: [0.04, 0.04],
  feedFlow: 1,
  coolingValves: [0.85, 0.85],
  vacuum: 0.95,
  generators: [true, false],
  generatorRevs: [1, 0],
  governors: [1, 1],
  voltage: 100,
  electricalLoad: 0.84,
  circuits: { lighting: true, ventilation: true, wireless: true },
  wirelessBattery: 1,
  lubrication: 0.85,
  bearingHeat: 0.2,
  steeringSet: 0,
  steeringSteam: 1,
});
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const approach = (a: number, b: number, dt: number, seconds: number) =>
  a + (b - a) * (1 - Math.exp(-dt / seconds));
export const electricSupply = (a: AuxiliaryState, circuit: PowerCircuit) =>
  a.circuits[circuit] ? clamp(a.voltage / 100) : 0;
export const wirelessPowered = (a: AuxiliaryState) =>
  electricSupply(a, 'wireless') > 0.65 || a.wirelessBattery > 0;
export const auxiliaryEngineEfficiency = (a: AuxiliaryState) =>
  (0.55 + clamp(a.vacuum / 0.85) * 0.45) * (1 - Math.max(0, a.bearingHeat - 0.65) * 0.7);
export const auxiliarySteeringEfficiency = (a: AuxiliaryState, fault: boolean) =>
  a.steeringSteam * (fault && a.steeringSet === 0 ? 0.24 : 1);

// Rates are compressed for a short crossing, but the causal paths are physical:
// steam -> engines -> condenser -> boiler feed, and steam -> dynamos -> services.
// Main feed/circulating pumps and steering engines use steam, not ship electricity.
export function stepAuxiliaries(
  ship: ShipState,
  dt: number,
  fault: (id: MachineId) => boolean,
  crewSize = 4,
) {
  const a = ship.auxiliary;
  const steam = clamp(ship.steam / 58);
  const demand = Math.pow(Math.max(0, ship.throttle) / 20, 2.4);
  for (let i = 0; i < 2; i++) {
    a.pumpRevs[i] = approach(
      a.pumpRevs[i],
      a.feedPumps[i] ? steam * (i === 0 && fault('feedwater') ? 0.24 : 1) : 0,
      dt,
      2.5,
    );
    a.strainers[i] = clamp(
      a.strainers[i] + dt * a.pumpRevs[i] * (crewSize < 7 ? 0.00008 : 0.00055),
    );
    a.generatorRevs[i] = approach(
      a.generatorRevs[i],
      a.generators[i] ? steam * a.governors[i] * (i === 0 && fault('dynamos') ? 0.35 : 1) : 0,
      dt,
      5,
    );
  }
  const pumping = a.pumpRevs.reduce((n, rev, i) => n + rev * (1 - a.strainers[i] * 0.65), 0);
  a.feedFlow = pumping;
  a.vacuum = approach(
    a.vacuum,
    clamp((a.coolingValves[0] + a.coolingValves[1]) / 1.7) * (fault('condenser') ? 0.48 : 0.95),
    dt,
    14,
  );
  for (let i = 0; i < 4; i++) {
    const use = 0.0003 + 0.0015 * demand * (ship.boilerConnected[i] ? 1 : 0.15);
    a.boilerWater[i] = clamp(
      a.boilerWater[i] + dt * (pumping * 0.0034 * a.feedValves[i] - use - ship.steamLeak * 0.00045),
    );
  }
  a.electricalLoad =
    0.16 +
    (a.circuits.lighting ? 0.22 : 0) +
    (a.circuits.ventilation ? 0.36 + Math.max(0, demand - 1) * 0.06 : 0) +
    (a.circuits.wireless ? 0.1 : 0);
  const capacity = a.generatorRevs.reduce((n, r) => n + r, 0) * 0.95;
  a.voltage = approach(a.voltage, Math.min(100, (100 * capacity) / a.electricalLoad), dt, 3);
  const normalRadio = electricSupply(a, 'wireless') > 0.65;
  a.wirelessBattery = clamp(a.wirelessBattery + dt * (normalRadio ? 1 / 180 : -1 / 90));
  a.lubrication = clamp(
    a.lubrication - dt * (0.00006 + demand * (crewSize < 7 ? 0.00012 : 0.0004)),
  );
  a.bearingHeat = approach(
    a.bearingHeat,
    clamp(0.2 + Math.max(0, demand - 1) * 0.12 + Math.max(0, 0.55 - a.lubrication) * 1.8),
    dt,
    32,
  );
}

export interface AuxiliaryControl {
  station: string;
  label: string;
  verb:
    | 'feed'
    | 'pump'
    | 'clean-strainer'
    | 'cooling'
    | 'generator'
    | 'governor'
    | 'circuit'
    | 'lubricate'
    | 'steering-set'
    | 'steering-steam';
  index?: number;
  circuit?: PowerCircuit;
}
export function auxiliaryAction(c: AuxiliaryControl, a: AuxiliaryState, reverse = false) {
  const i = c.index ?? 0;
  const step = (n: number) => Math.round(clamp(n + (reverse ? -0.1 : 0.1)) * 100) / 100;
  switch (c.verb) {
    case 'pump':
      return { station: c.station, verb: c.verb, value: !a.feedPumps[i] };
    case 'generator':
      return { station: c.station, verb: c.verb, value: !a.generators[i] };
    case 'feed':
      return { station: c.station, verb: c.verb, value: step(a.feedValves[i]) };
    case 'cooling':
      return { station: c.station, verb: c.verb, value: step(a.coolingValves[i]) };
    case 'governor':
      return { station: c.station, verb: c.verb, value: step(a.governors[i]) };
    case 'circuit':
      return { station: c.station, verb: c.verb, value: !a.circuits[c.circuit!] };
    case 'steering-set':
      return { station: c.station, verb: c.verb, value: 1 - a.steeringSet };
    case 'steering-steam':
      return { station: c.station, verb: c.verb, value: step(a.steeringSteam) };
    default:
      return { station: c.station, verb: c.verb };
  }
}
export function auxiliaryHint(c: AuxiliaryControl, a: AuxiliaryState) {
  const i = c.index ?? 0;
  switch (c.verb) {
    case 'pump':
      return `${c.label} · ${a.feedPumps[i] ? 'Stop' : 'Start'}`;
    case 'generator':
      return `${c.label} · ${a.generators[i] ? 'Stop' : 'Start'}`;
    case 'feed':
      return `${c.label} · ${Math.round(a.feedValves[i] * 100)}% · E + / Shift E −`;
    case 'cooling':
      return `${c.label} · ${Math.round(a.coolingValves[i] * 100)}% · E + / Shift E −`;
    case 'governor':
      return `${c.label} · ${Math.round(a.governors[i] * 100)}% · E + / Shift E −`;
    case 'circuit':
      return `${c.label} · ${a.circuits[c.circuit!] ? 'Isolate' : 'Connect'}`;
    case 'clean-strainer':
      return `${c.label} · ${a.feedPumps[i] ? 'Stop this pump first' : 'Clean basket'}`;
    case 'steering-set':
      return `Steering engine ${a.steeringSet + 1} · Change over`;
    case 'steering-steam':
      return `Steering steam · ${Math.round(a.steeringSteam * 100)}% · E + / Shift E −`;
    default:
      return 'Fill bearing oil pot';
  }
}
