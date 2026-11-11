import type { Action, ShipState } from './types';
import type { FiringTool } from './firing';
import { firebed } from './firing';
import { steamPsi } from './plant';

export interface BoilerControl {
  bank: number;
  kind: 'door' | 'fire' | 'ash' | 'draught' | 'stop' | 'relief' | 'gauge' | 'coal' | 'tool';
  zone?: number;
  tool?: FiringTool;
}
export const heldFiringTool = (inventory: string[]) =>
  inventory.find((i) => i.startsWith('Firing tool:'))?.split(':')[1] as FiringTool | undefined;
export const visibleClinker = (amount: number) =>
  amount < 0.06 ? 0 : Math.min(8, Math.ceil((amount - 0.05) * 8));

export function boilerHint(c: BoilerControl, ship: ShipState, inventory: string[]) {
  const i = c.bank,
    tool = heldFiringTool(inventory);
  switch (c.kind) {
    case 'door':
      return `${ship.fireDoors[i][c.zone!] ? 'Close' : 'Open'} fire door ${c.zone! + 1}`;
    case 'fire':
      return tool === 'coal'
        ? inventory.includes('Coal load')
          ? 'Spread shovel load'
          : 'Shovel empty · refill at coal basket'
        : tool === 'slice'
          ? visibleClinker(ship.clinker[i][c.zone!])
            ? 'Work slice bar · hold E'
            : 'Grate clear'
          : 'Open fire · take shovel or slice bar';
    case 'ash':
      return tool === 'rake'
        ? firebed(ship, i, c.zone!).ash > 0.06
          ? 'Rake ashpan · hold E'
          : 'Ashpan clear'
        : 'Ashpan · take ash rake';
    case 'tool':
      return `Take ${c.tool === 'coal' ? 'shovel' : c.tool === 'slice' ? 'slice bar' : 'ash rake'}`;
    case 'coal':
      return 'Fill shovel';
    case 'draught':
      return `Draught ${Math.round(ship.fires[i] * 100)}% · E + / Shift E −`;
    case 'stop':
      return `Steam stop valve · ${ship.boilerConnected[i] ? 'Open' : 'Shut'} · E turn`;
    case 'relief':
      return `Safety valve · ${ship.reliefUntil[i] > 0 ? 'Easing' : ship.safetyLifted[i] ? 'Lifting' : 'Seated'} · E ease briefly`;
    case 'gauge':
      return `Boiler ${i + 1} · ${steamPsi(ship.boilerPressure[i]).toFixed(0)} psi · B guide`;
  }
}

export function boilerAction(
  c: BoilerControl,
  ship: ShipState,
  inventory: string[],
  reduce = false,
): Action | null {
  const station = 'boiler-' + 'abcd'[c.bank],
    tool = heldFiringTool(inventory);
  const action = (verb: string, value?: unknown) => ({ station, verb, value });
  switch (c.kind) {
    case 'door':
      return action('door', { zone: c.zone, open: !ship.fireDoors[c.bank][c.zone!] });
    case 'fire':
      if (tool === 'slice' && !visibleClinker(ship.clinker[c.bank][c.zone!])) return null;
      return tool && tool !== 'rake'
        ? action('tend', { zone: c.zone, tool, physical: true })
        : null;
    case 'ash':
      if (firebed(ship, c.bank, c.zone!).ash <= 0.06) return null;
      return tool === 'rake' ? action('tend', { zone: c.zone, tool, physical: true }) : null;
    case 'tool':
      return action('equip', c.tool);
    case 'coal':
      return action('scoop');
    case 'draught':
      return action('fire', Math.max(0, Math.min(1, ship.fires[c.bank] + (reduce ? -0.05 : 0.05))));
    case 'stop':
      return action('connect', !ship.boilerConnected[c.bank]);
    case 'relief':
      return action('ease');
    default:
      return null;
  }
}
