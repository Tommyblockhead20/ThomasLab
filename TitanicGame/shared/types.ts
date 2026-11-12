import type { Role } from './config';
import type { DemoId, DemoState } from './demos';
import type { IceReport, LineMessage } from './radio';
export type Phase = 'lobby' | 'voyage' | 'sinking' | 'lifeboat' | 'inquiry' | 'ended';
export type InquiryCause = 'sinking' | 'schedule' | 'route';
export type Level = -2 | -1 | 0 | 1 | 2;
export type MachineId = 'steering' | 'engines' | 'valve' | 'wireless' | 'compass' | 'gauge';
export interface Position {
  x: number;
  z: number;
  level: Level;
}
export interface Input {
  forward: number;
  right: number;
  yaw: number;
  pitch: number;
  sprint: boolean;
  zoom: number;
  seq: number;
}
export interface Job {
  kind: string;
  station: string;
  elapsed: number;
  duration: number;
}
export interface PublicPlayer extends Position {
  evacuated: boolean;
  id: string;
  name: string;
  color: string;
  connected: boolean;
  ready: boolean;
  yaw: number;
  pitch: number;
  talking: boolean;
  job: Job | null;
  binoculars: boolean;
}
export interface VoicePath {
  id: string;
  gain: number;
  phone: boolean;
}
export interface Machine {
  id: MachineId;
  condition: number;
  fault: string | null;
  evidence: string[];
}
export interface Iceberg {
  id: string;
  west: number;
  north: number;
  radius: number;
  height: number;
  shape: number;
}
export interface Telegram {
  receivedBy?: string;
  report?: IceReport;
  id: string;
  sender: string;
  code: string;
  text?: string;
  decoded: boolean;
  delivered: boolean;
  at: number;
  urgent: boolean;
}
export interface Phone {
  id: string;
  from: string;
  to: string;
  caller: string;
  answerer: string | null;
  at: number;
}
export interface ShipState {
  impact: null | {
    id: number;
    at: number;
    point: { x: number; z: number };
    normal: { x: number; z: number };
    strength: number;
    speed: number;
  };
  west: number;
  north: number;
  heading: number;
  rudder: number;
  yawRate: number;
  rudderTarget: number;
  speed: number;
  order: number;
  throttle: number;
  steam: number;
  boilerPressure: number[];
  boilerConnected: boolean[];
  reliefUntil: number[];
  safetyLifted: boolean[];
  mainSteamValve: number;
  engineRevs: number;
  steamLeak: number;
  fires: number[];
  coal: number[];
  bedBalance: number[][];
  ashBalance: number[][];
  clinker: number[][];
  fireDoors: boolean[][];
  fireHeat: number[];
  ash: number[];
  hull: number;
  compartments: number[];
  delay: number;
  offRouteTime: number;
  visibility: number;
  weather: string;
  indicatedHeading: number;
  indicatedSteam: number;
}
export interface Result {
  cause: InquiryCause | null;
  revealed: boolean;
  outcome: 'crew' | 'saboteur' | 'draw' | 'dismissed';
  title: string;
  description: string;
  saboteur: string;
  roles: { id: string; name: string; role: Role; saboteur: boolean }[];
  events: { at: number; text: string }[];
  seed: number;
}
export interface PracticeSettings {
  paused: boolean;
  assistance: boolean;
  tools: boolean;
}
export interface PracticeAction {
  verb:
    | 'pause'
    | 'assistance'
    | 'tools'
    | 'travel'
    | 'post'
    | 'ice'
    | 'sinking'
    | 'inquiry'
    | 'schedule'
    | 'route'
    | 'restore'
    | 'demo'
    | 'restart';
  value?: unknown;
}
export interface StartOptions {
  difficulty?: 'standard' | 'experienced';
  demo?: DemoId;
  practice?: boolean;
  fast?: boolean;
  alternativeWireless?: boolean;
  post?: Role;
  paused?: boolean;
  assistance?: boolean;
  tools?: boolean;
}
export interface Snapshot {
  firingTools: Record<'coal' | 'slice' | 'rake', string | null>;
  wirelessWaiting: number;
  chartMarks: ChartMark[];
  command: { heading: number; acknowledgedBy: string | null };
  crewSize: number;
  radio: { pending: boolean; readyIn: number } | null;
  demo: DemoState | null;
  sinkingElapsed: number | null;
  inquiryCause: InquiryCause | null;
  code: string;
  phase: Phase;
  host: string;
  players: PublicPlayer[];
  ship: ShipState;
  machines: Machine[];
  icebergs: Iceberg[];
  phones: Phone[];
  telegrams: Telegram[];
  delivered: Telegram[];
  binocularOwner: string | null;
  cabinetOpen: boolean;
  elapsed: number;
  phaseRemaining: number | null;
  phaseElapsed: number;
  notice: string;
  noticeVersion: number;
  votes: Record<string, string>;
  result: Result | null;
  practice: boolean;
  practiceSettings: PracticeSettings | null;
  alternativeWireless: boolean;
  self: {
    id: string;
    role: Role | null;
    saboteur: boolean;
    inventory: string[];
    notes: string[];
    lineMessages: LineMessage[];
    sabotageCharges: number;
    sabotageReadyIn: number;
    voice: VoicePath[];
    audience: string[];
    relocation: number;
    inspections: Record<string, string>;
    puzzle?: number[];
    keyPosition?: Position;
  };
}
export interface Station extends Position {
  route?: { x: number; y: number; z: number }[];
  travelSeconds?: number;
  id: string;
  name: string;
  kind:
    | 'lifeboat'
    | 'scenery'
    | 'wheel'
    | 'chart'
    | 'command'
    | 'telegraph'
    | 'engine'
    | 'boiler'
    | 'firing'
    | 'machine'
    | 'phone'
    | 'wireless'
    | 'cabinet'
    | 'key'
    | 'ladder'
    | 'bell'
    | 'storage';
  machine?: MachineId;
  destination?: Position;
  phoneRoom?: string;
}
export interface Action {
  station: string;
  verb: string;
  value?: unknown;
}
export interface ChartMark {
  id: string;
  kind: 'ice' | 'area' | 'bearing' | 'route';
  points: { west: number; north: number }[];
  radius: number;
  label: string;
  source: string;
  confidence: 'low' | 'medium' | 'high';
  by: string;
  at: number;
}
export interface Reply {
  ok: boolean;
  error?: string;
  code?: string;
  id?: string;
  token?: string;
}
