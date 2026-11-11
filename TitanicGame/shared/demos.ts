import type { Role } from './config';
import { BALANCE } from './config';

export const JOB_DEMOS = [
  {
    id: 'captain',
    title: 'Captain',
    role: 'Captain',
    station: 'telegraph',
    live: true,
    detail: 'Bridge telegraph · engines standing by',
    objective: 'Order 25 knots at the telegraph.',
  },
  {
    id: 'navigation',
    title: 'Navigation',
    role: 'Deck Officer',
    station: 'chart',
    live: false,
    detail: 'Officer’s chart · decoded report in hand',
    objective: 'File the report, then plot its uncertain area on the chart.',
  },
  {
    id: 'lookout',
    title: 'Lookout',
    role: 'Lookout',
    station: 'bell',
    live: true,
    detail: 'Crow’s nest · binoculars ready · ice ahead',
    objective: 'Record a sighting bearing, then ring the lookout bell.',
  },
  {
    id: 'helmsman',
    title: 'Helmsman',
    role: 'Helmsman',
    station: 'wheel',
    live: true,
    detail: 'Wheelhouse · an ice hazard on course',
    objective: 'Turn 8° to starboard, then return the rudder amidships.',
  },
  {
    id: 'boilers',
    title: 'Boiler crew',
    role: 'Boiler Operator',
    station: 'boiler-a',
    live: false,
    detail: 'Stokehold · uneven firebeds and obstructed airflow',
    objective: 'Restore an even, clean fire and hold 190–215 psi.',
  },
  {
    id: 'engineer',
    title: 'Engineer',
    role: 'Engineer',
    station: 'engines',
    live: false,
    detail: 'Engine stand · a fault and a waiting order',
    objective: 'Repair the engines, then execute the 25-knot order.',
  },
  {
    id: 'wireless',
    title: 'Wireless',
    role: 'Wireless Operator',
    station: 'wireless',
    live: false,
    detail: 'Marconi room · an ice position to chart and relay',
    objective: 'Decode the ice report. Check its position, extent and age.',
  },
  {
    id: 'schedule',
    title: 'Stopped ship',
    role: 'Captain',
    station: 'telegraph',
    live: true,
    detail: 'Live clock · stopped engines · no ice',
    objective: `Leave the ship stopped. The first schedule warning arrives at ${Math.ceil(BALANCE.scheduleWarning)} seconds.`,
  },
] as const satisfies readonly {
  id: string;
  title: string;
  role: Role;
  station: string;
  live: boolean;
  detail: string;
  objective: string;
}[];

export type DemoId = (typeof JOB_DEMOS)[number]['id'];
export const findDemo = (id: unknown) => JOB_DEMOS.find((d) => d.id === id);
export interface DemoState {
  id: DemoId;
  title: string;
  objective: string;
  complete: boolean;
}
