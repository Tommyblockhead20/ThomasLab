import { SINK_DURATION } from './sinking';
import { SHIP_SCALE, HULL_BOW, HULL_STERN, HULL_HALF_WIDTH } from './navigation';
// Time is seconds; navigation uses metres, crew positions use deck coordinates.
// Development speed-up is selected by the host only when ALLOW_DEV_TOOLS=1.
export const BALANCE = {
  minPlayers: 4,
  maxPlayers: 10,
  tickRate: 20,
  snapshotRate: 10,
  voyageMin: 180,
  voyageMax: 600,
  encounterLead: 52,
  evacuationSeconds: 40,
  abandonDelay: 10,
  sinkTotalSeconds: SINK_DURATION,
  voteSeconds: 120,
  walkSpeed: 4.4,
  sprintSpeed: 6.9,
  interactDistance: 3.3,
  proximityRadius: 15,
  corridorHalfWidth: 225,
  routeWarningOffset: 150,
  routeHardLimit: 450,
  routeGraceSeconds: 90,
  scheduleBudget: 95,
  scheduleWarning: 22.5,
  scheduleUrgent: 60,
  cruiseKnots: 20,
  maxKnots: 25,
  hullLength: HULL_BOW + HULL_STERN,
  hullWidth: HULL_HALF_WIDTH * 2,
  sabotageSeconds: 8,
  sabotageCooldown: 42,
  sabotageCharges: 4,
  repairSeconds: 9,
  basicRepairSeconds: 30,
  horizonDistance: 3800,
};

export const ROLE_ORDER = [
  'Captain',
  'Deck Officer',
  'Engineer',
  'Boiler Operator',
  'Wireless Operator',
  'Lookout',
  'Second Boiler Operator',
  'Helmsman',
  'Second Engineer',
  'Second Wireless Operator',
] as const;
export type Role = (typeof ROLE_ORDER)[number] | 'Second Lookout';
export const ROLE_INFO: Record<Role, { area: string; duty: string; tip: string }> = {
  Captain: {
    area: 'Captain’s bridge',
    duty: 'Choose speed and heading orders, weigh reports and coordinate the departments.',
    tip: 'Cover wireless until five crew and the bridge lookout until six. Engineering executes speed orders.',
  },
  'Deck Officer': {
    area: 'Officer’s wheelhouse',
    duty: 'Plot reported ice, recommend a passage and monitor the ship’s course.',
    tip: 'Steer until eight crew. Marks on the chart are estimates; check source, time and confidence.',
  },
  Lookout: {
    area: 'Crow’s nest',
    duty: 'Track ice bearings, estimate ranges and check that the chosen passage is clear.',
    tip: 'Press L while watching to log a bearing. Compare successive sightings and telephone the bridge.',
  },
  'Boiler Operator': {
    area: 'Boiler room',
    duty: 'Balance the fires and maintain enough steam for the engines.',
    tip: 'Spread the coal, clear the grates and close fire doors.',
  },
  'Wireless Operator': {
    area: 'Wireless room',
    duty: 'Read ice positions, compare sighting times and relay useful reports to the bridge.',
    tip: 'Use the ship telephone for read-back, or take the report to the chart.',
  },
  Engineer: {
    area: 'Engine room',
    duty: 'Execute engine orders, inspect faults, and repair machinery.',
    tip: 'You repair faster than the rest of the crew.',
  },
  Helmsman: {
    area: 'Bridge',
    duty: 'Execute bridge heading orders, anticipate turning momentum and read orders back.',
    tip: 'The Officer plots passages; the Captain chooses the order. Counter-steer before reaching the heading.',
  },
  'Second Lookout': {
    area: 'Crow’s nest',
    duty: 'Share the horizon with the first Lookout and fetch binoculars.',
    tip: 'Share the binoculars; divide port and starboard.',
  },
  'Second Boiler Operator': {
    area: 'Boiler room',
    duty: 'Manage the second bank of boilers and coordinate steam production.',
    tip: 'Take primary care of banks 3 and 4. Coordinate pressure with the first operator.',
  },
  'Second Engineer': {
    area: 'Engine room',
    duty: 'Take the maintenance watch: inspect, service and repair while the first Engineer executes orders.',
    tip: 'Compare inspections with your colleague.',
  },
  'Second Wireless Operator': {
    area: 'Wireless room',
    duty: 'Share transcription, review telegrams, and deliver warnings.',
    tip: 'Use the second desk, assess positions and ages, and relay reports while your colleague receives.',
  },
};

export const COLORS = [
  '#d5b67a',
  '#7faaba',
  '#b77b69',
  '#8ba68e',
  '#b69ac2',
  '#c39d70',
  '#7398a1',
  '#c2bb8b',
  '#929dbe',
  '#b88c9f',
];
