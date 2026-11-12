import { inquirySeat } from '../shared/inquiry';
import { readChartMark } from '../shared/chart';
import { METRES_PER_NM, chartPosition } from '../shared/units';
import type { ChartMark } from '../shared/types';
import { PHONE_LINKS, iceReport, iceMessage, type LineMessage } from '../shared/radio';
import { BOILER_COUNT, boilerIndex, stepPlant, steamPsi, fullPowerStrain } from '../shared/plant';
import { randomBytes, randomUUID } from 'node:crypto';
import { BALANCE, COLORS, ROLE_INFO, ROLE_ORDER, type Role } from '../shared/config';
import type {
  Action,
  Iceberg,
  InquiryCause,
  Input,
  Job,
  Machine,
  MachineId,
  Phase,
  Phone,
  Position,
  PublicPlayer,
  Result,
  ShipState,
  Snapshot,
  Telegram,
  VoicePath,
} from '../shared/types';
import {
  distance,
  KEY_SPOTS,
  moveWithCollision,
  roomAt,
  spawnFor,
  STATIONS,
  wallsBetween,
} from '../shared/world';
import { encodeMorse, normalizeTelegram } from '../shared/morse';
import type { PracticeAction, PracticeSettings, StartOptions } from '../shared/types';
import { canOccupy } from '../shared/world';
import { cabinetAligned, makeCabinet, turnCabinet } from '../shared/cabinet';
import { FAULTS, serviceSeconds } from '../shared/machinery';
import { FIRING_RACK, FIRING_TOOLS, toolName } from '../shared/stokehold';
import {
  CHART_SCALE,
  HULL_BOW,
  HULL_STERN,
  HULL_HALF_WIDTH,
  NAVIGATION_RATE,
  hullContact,
  iceRelative,
  SHIP_WIDTH_SCALE,
  SHIP_LENGTH_SCALE,
} from '../shared/navigation';

import { advanceMotion, projectCourse, workSeconds, navigationWarnings } from '../shared/voyage';
import { findDemo, type DemoId, type DemoState } from '../shared/demos';
import { lookoutSpawn } from '../shared/lookout';
import {
  emptyFireZones,
  closedFireDoors,
  tendFire,
  firebed,
  type FiringTool,
} from '../shared/firing';

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export class Random {
  constructor(public seed: number) {}
  next() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  between(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  pick<T>(a: readonly T[]) {
    return a[Math.floor(this.next() * a.length)];
  }
  shuffle<T>(a: readonly T[]) {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }
}
export interface Player extends PublicPlayer {
  relocation: number;
  token: string;
  socket: string | null;
  role: Role | null;
  saboteur: boolean;
  inventory: string[];
  notes: string[];
  input: Input;
  inputAt: number;
  lastSeq: number;
  charges: number;
  cooldown: number;
  jobValue: unknown;
  disconnectedAt: number | null;
  resumeUntil: number;
  lastAction: number;
  talkUntil: number;
  lastTend: number;
  lineMessages: LineMessage[];
  inspections: Record<string, { fault: string | null; result: string }>;
}
interface HiddenIceberg extends Iceberg {
  main: boolean;
  hit: boolean;
  passed: boolean;
}
export class GameError extends Error {}
export class Room {
  code: string;
  players = new Map<string, Player>();
  host = '';
  phase: Phase = 'lobby';
  elapsed = 0;
  phaseTime = 0;
  sinkingElapsed: number | null = null;
  inquiryCause: InquiryCause | null = null;
  warningKey = '';
  ship: ShipState = this.newShip();
  machines: Machine[] = this.newMachines();
  icebergs: HiddenIceberg[] = [];
  phones: Phone[] = [];
  telegrams: Telegram[] = [];
  votes: Record<string, string> = {};
  result: Result | null = null;
  private currentNotice = '';
  noticeVersion = 0;
  get notice() {
    return this.currentNotice;
  }
  set notice(value: string) {
    this.currentNotice = value;
    this.noticeVersion++;
  }
  events: { at: number; text: string }[] = [];
  seed: number;
  rng: Random;
  encounterAt = 0;
  nextEvent = 0;
  nextTelegram = 0;
  radioReplyAt: number | null = null;
  radioReadyAt = 0;
  chartMarks: ChartMark[] = [];
  command = { heading: 270, acknowledgedBy: null as string | null };
  crewSize = 1;
  mainResolved = false;
  hazardNorth = 0;
  mainPassedAt: number | null = null;
  cabinetOpen = false;
  binocularOwner: string | null = null;
  keyPosition: Position = { ...KEY_SPOTS[0] };
  puzzle: number[] = [];
  practice = false;
  activeDemo: DemoId | null = null;
  demoCompleted = false;
  pausedTime = 0;
  practiceSettings: PracticeSettings = { paused: false, assistance: true, tools: true };
  alternativeWireless = false;
  createdAt = Date.now();
  emptySince: number | null = null;
  fast = false;
  difficulty: 'standard' | 'experienced' = 'standard';
  equipmentViews = new Map<string, { station: string; until: number }>();
  constructor(code: string, seed = randomBytes(4).readUInt32LE()) {
    this.code = code;
    this.seed = seed;
    this.rng = new Random(seed);
  }
  newShip(): ShipState {
    return {
      impact: null,
      west: 0,
      north: 0,
      heading: 270,
      indicatedHeading: 270,
      indicatedSteam: 76,
      rudder: 0,
      yawRate: 0,
      rudderTarget: 0,
      speed: BALANCE.cruiseKnots,
      order: BALANCE.cruiseKnots,
      throttle: BALANCE.cruiseKnots,
      steam: 76,
      boilerPressure: Array(BOILER_COUNT).fill(76),
      boilerConnected: Array(BOILER_COUNT).fill(true),
      reliefUntil: Array(BOILER_COUNT).fill(0),
      safetyLifted: Array(BOILER_COUNT).fill(false),
      mainSteamValve: 1,
      engineRevs: BALANCE.cruiseKnots * 3.2,
      steamLeak: 0,
      fires: Array(BOILER_COUNT).fill(0.67),
      coal: Array(BOILER_COUNT).fill(0.62),
      bedBalance: emptyFireZones(),
      ashBalance: emptyFireZones(),
      clinker: emptyFireZones(),
      fireDoors: closedFireDoors(),
      fireHeat: Array(BOILER_COUNT).fill(0.67),
      ash: Array(BOILER_COUNT).fill(0),
      hull: 100,
      compartments: [0, 0, 0, 0, 0, 0],
      delay: 0,
      offRouteTime: 0,
      visibility: 1,
      weather: 'Clear skies',
    };
  }
  newMachines(): Machine[] {
    return (['steering', 'engines', 'valve', 'wireless', 'compass', 'gauge'] as MachineId[]).map(
      (id) => ({ id, condition: 100, fault: null, evidence: [] }),
    );
  }
  addPlayer(name: string, socket: string) {
    if (this.phase !== 'lobby')
      throw new GameError(
        'This voyage has departed. Reconnect with your original browser, or wait for the next lobby.',
      );
    if (this.players.size >= BALANCE.maxPlayers)
      throw new GameError('This room has its full crew of ten.');
    const id = randomUUID(),
      token = randomBytes(32).toString('hex');
    const p: Player = {
      id,
      token,
      socket,
      name: name.trim().slice(0, 20) || 'Crewmate',
      color: COLORS[this.players.size],
      connected: true,
      evacuated: false,
      ready: false,
      x: (this.players.size % 4) * 1.2 - 2,
      z: -18 + Math.floor(this.players.size / 4) * 1.4,
      level: 0,
      yaw: 0,
      pitch: 0,
      talking: false,
      job: null,
      binoculars: false,
      role: null,
      saboteur: false,
      inventory: [],
      notes: [],
      input: { forward: 0, right: 0, yaw: 0, pitch: 0, sprint: false, zoom: 0, seq: 0 },
      inputAt: 0,
      lastSeq: -1,
      charges: BALANCE.sabotageCharges,
      cooldown: 0,
      jobValue: null,
      disconnectedAt: null,
      resumeUntil: 0,
      lastAction: -Infinity,
      relocation: 0,
      talkUntil: 0,
      lastTend: -Infinity,
      lineMessages: [],
      inspections: {},
    };
    this.players.set(id, p);
    if (!this.host) this.host = id;
    this.emptySince = null;
    return p;
  }
  reconnect(id: string, token: string, socket: string) {
    const p = this.players.get(id);
    if (!p || p.token !== token)
      throw new GameError('The reconnect pass has expired. Join the room again.');
    if (p.connected && p.socket !== socket)
      throw new GameError('This crew pass is already connected in another tab.');
    p.socket = socket;
    p.connected = true;
    p.disconnectedAt = null;
    p.inputAt = 0;
    p.lastSeq = -1;
    this.emptySince = null;
    if (!this.players.get(this.host)?.connected) this.host = id;
    return p;
  }
  disconnect(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.socket = null;
    p.connected = false;
    p.disconnectedAt = Date.now();
    p.inputAt = 0;
    p.talking = false;
    p.job = null;
    this.equipmentViews.delete(id);
    p.inventory = p.inventory.filter(i => !i.startsWith('Firing tool:') && i !== 'Coal load');
    this.hangup(id);
    if (p.binoculars) {
      p.binoculars = false;
      this.binocularOwner = null;
      this.cabinetOpen = true;
      p.inventory = p.inventory.filter((i) => i !== 'Binoculars');
    }
    this.electHost();
  }
  leave(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.disconnect(id);
    if (this.phase === 'lobby' || this.phase === 'ended') this.players.delete(id);
    else {
      p.token = '';
      p.name += ' (left)';
    }
    this.electHost();
  }
  electHost() {
    if (!this.players.get(this.host)?.connected)
      this.host = [...this.players.values()].find((p) => p.connected)?.id ?? '';
  }
  log(text: string) {
    this.events.push({ at: Math.round(this.elapsed), text });
    if (this.events.length > 200) this.events.shift();
  }
  machine(id: MachineId) {
    return this.machines.find((m) => m.id === id)!;
  }
  start(hostId: string, options: StartOptions = {}, allowDev = false) {
    if (this.host !== hostId) throw new GameError('Only the host can cast off.');
    if (this.phase !== 'lobby')
      throw new GameError('Return to the lobby before starting another voyage.');
    const crew = [...this.players.values()].filter((p) => p.connected);
    this.practice = options.practice === true && crew.length === 1;
    this.practiceSettings = {
      paused: options.paused === true,
      assistance: options.assistance !== false,
      tools: options.tools !== false,
    };
    if (!this.practice && (crew.length < BALANCE.minPlayers || crew.some((p) => !p.ready)))
      throw new GameError('You need at least four connected crew, all marked ready.');
    this.fast = allowDev && options.fast === true;
    this.difficulty = options.difficulty === 'experienced' ? 'experienced' : 'standard';
    this.alternativeWireless = false; // The tenth post is always Second Wireless Operator.
    this.crewSize = crew.length;
    this.chartMarks = [];
    this.equipmentViews.clear();
    this.command = { heading: 270, acknowledgedBy: null };
    this.phase = 'voyage';
    this.elapsed = 0;
    this.pausedTime = 0;
    this.sinkingElapsed = null;
    this.inquiryCause = null;
    this.warningKey = '';
    this.phaseTime = 0;
    this.ship = this.newShip();
    this.machines = this.newMachines();
    this.events = [];
    this.activeDemo = null;
    this.demoCompleted = false;
    this.icebergs = [];
    this.phones = [];
    this.telegrams = [];
    this.radioReplyAt = null;
    this.radioReadyAt = 0;
    this.votes = {};
    this.result = null;
    this.mainResolved = false;
    this.mainPassedAt = null;
    this.cabinetOpen = false;
    this.binocularOwner = null;
    this.rng = new Random(this.seed);
    // The field is fixed at departure. Even sailing at 25 kn, the first main
    // encounter is at least about three minutes away in Standard.
    this.encounterAt = this.fast
      ? this.rng.between(65, 90)
      : this.difficulty === 'experienced'
        ? this.rng.between(110, 180)
        : this.rng.between(180, 360);
    this.hazardNorth = this.rng.between(-24, 24);
    this.nextEvent = this.rng.between(12, 42);
    this.nextTelegram = this.rng.between(10, 24);
    this.keyPosition = { ...this.rng.pick(KEY_SPOTS) };
    this.puzzle = makeCabinet(() => this.rng.next());
    const shuffled = this.rng.shuffle(crew),
      saboteur = this.rng.pick(shuffled);
    for (let i = 0; i < shuffled.length; i++) {
      const p = shuffled[i];
      p.role =
        this.practice && options.post && Object.hasOwn(ROLE_INFO, options.post)
          ? options.post
          : ROLE_ORDER[i];
      p.saboteur = !this.practice && p.id === saboteur.id;
      p.evacuated = false;
      p.inventory = [];
      p.inspections = {};
      p.notes = [];
      p.charges = BALANCE.sabotageCharges;
      p.cooldown = 0;
      p.job = null;
      p.binoculars = false;
      p.lastSeq = -1;
      p.yaw = p.pitch = 0;
      p.lastAction = -Infinity;
      p.lastTend = -Infinity;
      p.lineMessages = [];
      p.inputAt = 0;
      p.talking = false;
      p.talkUntil = 0;
      p.input = { forward: 0, right: 0, yaw: 0, pitch: 0, sprint: false, zoom: 0, seq: 0 };
      p.relocation++;
      Object.assign(p, spawnFor(p.role));
      p.x += this.rng.between(-0.05, 0.05);
    }
    this.notice = '';
    this.seedVoyage();
    this.log('The Titanic departed on a westbound course.');
    if (options.demo && this.practice) this.prepareDemo(hostId, options.demo);
  }
  setInput(p: Player, data: unknown) {
    if (!data || typeof data !== 'object') return;
    const d = data as Input;
    if (![d.forward, d.right, d.yaw, d.pitch, d.seq].every(Number.isFinite) || d.seq <= p.lastSeq)
      return;
    p.lastSeq = d.seq;
    p.input = {
      forward: clamp(d.forward, -1, 1),
      right: clamp(d.right, -1, 1),
      yaw: d.yaw % (Math.PI * 2),
      pitch: clamp(d.pitch, -1.45, 1.45),
      sprint: !!d.sprint,
      zoom: clamp(Number(d.zoom) || 0, 0, p.binoculars ? 2 : 1),
      seq: d.seq,
    };
    p.inputAt = Date.now();
    p.yaw = p.input.yaw;
    p.pitch = p.input.pitch;
  }
  stationFor(p: Player, id: string) {
    const station =
      id === 'key'
        ? { ...this.keyPosition, id: 'key', name: 'Cabinet key', kind: 'key' as const }
        : STATIONS.find((s) => s.id === id);
    const rear =
      station?.kind === 'boiler' ? { ...station, z: station.z - 6.4 / SHIP_LENGTH_SCALE } : null;
    const access = rear && distance(p, rear) < distance(p, station!) ? rear : station;
    if (!access || distance(p, access) > BALANCE.interactDistance || wallsBetween(p, access) > 0)
      throw new GameError('Move closer to the equipment.');
    return station!;
  }
  viewEquipment(id: string, stationId: string | null) {
    this.equipmentViews.delete(id);
    if (!stationId) return;
    const p = this.players.get(id);
    if (!p?.connected || !['voyage', 'sinking'].includes(this.phase)) return;
    const station = this.stationFor(p, stationId);
    if (!station.machine) return;
    this.equipmentViews.set(id, { station: stationId, until: Date.now() + 2500 });
  }
  machineViewed(machine: MachineId, except = '') {
    for (const [id, view] of this.equipmentViews) {
      const p = this.players.get(id), s = STATIONS.find(s => s.id === view.station);
      if (!p?.connected || view.until < Date.now() || !s || distance(p, s) > BALANCE.interactDistance) {
        this.equipmentViews.delete(id); continue;
      }
      if (id !== except && s.machine === machine) return true;
    }
    return false;
  }
  failMachine(id: MachineId, deliberate = false) {
    const m = this.machine(id);
    m.fault = FAULTS[id];
    m.condition = Math.max(12, m.condition - (deliberate ? 48 : 23));
    for (const p of this.players.values()) delete p.inspections[id];
  }
  action(id: string, a: Action) {
    const p = this.players.get(id);
    if (!p || !p.connected) throw new GameError('Crew member disconnected.');
    if (!['voyage', 'sinking'].includes(this.phase) || p.evacuated)
      throw new GameError('The machinery is only available aboard the ship.');
    if (!a || typeof a.station !== 'string' || typeof a.verb !== 'string')
      throw new GameError('Invalid interaction.');
    const s = this.stationFor(p, a.station);
    if (a.verb === 'cancel') {
      p.job = null;
      return;
    }
    if (p.job) throw new GameError('Finish or cancel the current task first.');
    if (this.elapsed + this.pausedTime - p.lastAction < 0.12)
      throw new GameError('Give the mechanism a moment.');
    p.lastAction = this.elapsed + this.pausedTime;
    const num = (min: number, max: number) => {
      if (typeof a.value !== 'number' || !Number.isFinite(a.value))
        throw new GameError('Invalid setting.');
      return clamp(a.value, min, max);
    };
    const occupy = () => {
      if (
        [...this.players.values()].some((other) => other.id !== id && other.job?.station === s.id)
      )
        throw new GameError('Someone is already working here.');
    };
    if (a.verb === 'sabotage') {
      if ((!p.saboteur && !(this.practice && this.practiceSettings.tools)) || !s.machine)
        throw new GameError('This action is unavailable.');
      if (p.charges <= 0 || p.cooldown > 0)
        throw new GameError('Your tools need time, or you have no charges left.');
      if (this.machine(s.machine).fault)
        throw new GameError('This machine is already malfunctioning.');
      if (this.machineViewed(s.machine, id)) throw new GameError('A shipmate is watching this equipment.');
      occupy();
      return this.job(p, 'tamper', s.id, BALANCE.sabotageSeconds);
    }
    if (a.verb === 'inspect' && s.machine) {
      occupy();
      return this.job(p, 'inspect', s.id, workSeconds(p.role, 'inspect'));
    }
    if (a.verb === 'service' && s.machine) {
      const m = this.machine(s.machine);
      if (m.fault) throw new GameError('Repair the fault before routine servicing.');
      if (m.condition > 94) throw new GameError('This equipment does not need servicing yet.');
      occupy();
      return this.job(p, 'service', s.id, serviceSeconds(p.role));
    }
    if (a.verb === 'repair' && s.machine) {
      if (!this.machine(s.machine).fault)
        throw new GameError('No active fault. Use routine service for wear.');
      occupy();
      return this.job(p, 'repair', s.id, workSeconds(p.role, 'repair'));
    }
    switch (s.kind) {
      case 'firing': {
        if (s.id === FIRING_RACK.id && (a.verb === 'equip' || a.verb === 'return-tool')) {
          const tool = String(a.value) as FiringTool;
          if (!FIRING_TOOLS.includes(tool)) throw new GameError('Choose a tool.');
          const held = p.inventory.find(i => i.startsWith('Firing tool:'));
          if (a.verb === 'return-tool') {
            if (held !== 'Firing tool:' + tool) throw new GameError('You are not carrying that tool.');
            p.inventory = p.inventory.filter(i => !i.startsWith('Firing tool:') && i !== 'Coal load');
            return;
          }
          if (held) throw new GameError('Put your tool back before taking another.');
          const owner = [...this.players.values()].find(q => q.inventory.includes('Firing tool:' + tool));
          if (owner) throw new GameError(`${owner.name} has the ${toolName(tool)}.`);
          p.inventory.push('Firing tool:' + tool);
          return;
        }
        if (s.id.startsWith('coal-') && a.verb === 'scoop') {
          if (!p.inventory.includes('Firing tool:coal')) throw new GameError('Take the shovel first.');
          if (!p.inventory.includes('Coal load')) p.inventory.push('Coal load');
          return;
        }
        break;
      }
      case 'command':
        if (a.verb === 'heading') {
          this.command = { heading: Math.round(num(0, 359)), acknowledgedBy: null };
          this.log(`${p.name} ordered heading ${this.command.heading}°.`);
          return;
        }
        break;
      case 'wheel':
        if (a.verb === 'acknowledge') {
          this.command.acknowledgedBy = p.name;
          this.log(`${p.name} read back heading ${this.command.heading}°.`);
          return;
        }
        if (a.verb === 'rudder') {
          this.ship.rudderTarget = num(-1, 1);
          this.log(`${p.name} set the rudder to ${Math.round(this.ship.rudderTarget * 35)}°.`);
          return;
        }
        break;
      case 'telegraph':
        if (a.verb === 'order') {
          this.ship.order = num(0, BALANCE.maxKnots);
          this.log(`${p.name} ordered ${this.ship.order} knots.`);
          this.notice = `Engine order · ${this.ship.order} kn`;
          return;
        }
        break;
      case 'engine':
        if (a.verb === 'execute') {
          this.ship.throttle = this.ship.order;
          this.notice = `Engines answering · ${this.ship.throttle ? this.ship.throttle + ' kn' : 'Stop'}`;
          this.log(`${p.name} answered the bridge order: ${this.ship.throttle} knots.`);
          return;
        }
        if (a.verb === 'throttle') {
          this.ship.throttle = num(0, BALANCE.maxKnots);
          this.notice = `Engine setting · ${this.ship.throttle ? this.ship.throttle + ' kn' : 'Stop'}`;
          this.log(`${p.name} executed ${this.ship.throttle} knots at the engines.`);
          return;
        }
        break;
      case 'boiler': {
        const bank = boilerIndex(s.id);
        if (bank < 0 || bank >= this.ship.fires.length) throw new GameError('Unknown boiler.');
        if (a.verb === 'connect') {
          if (typeof a.value !== 'boolean') throw new GameError('Choose a valve position.');
          this.ship.boilerConnected[bank] = a.value;
          return;
        }
        if (a.verb === 'ease') {
          this.ship.reliefUntil[bank] = 2;
          return;
        }
        if (a.verb === 'fire') {
          this.ship.fires[bank] = num(0, 1);
          this.log(
            `${p.name} adjusted boiler ${bank + 1} to ${Math.round(this.ship.fires[bank] * 100)}%.`,
          );
          return;
        }
        if (a.verb === 'door' || a.verb === 'tend') {
          const v = a.value as {
            zone?: number;
            open?: boolean;
            tool?: FiringTool;
            physical?: boolean;
            draw?: boolean;
          } | null;
          if (!v || !Number.isInteger(v.zone) || v.zone! < 0 || v.zone! > 2)
            throw new GameError('Choose a furnace.');
          if (a.verb === 'door') {
            if (typeof v.open !== 'boolean') throw new GameError('Choose a door position.');
            this.ship.fireDoors[bank][v.zone!] = v.open;
            return;
          }
          if (!['coal', 'slice', 'rake'].includes(v.tool ?? ''))
            throw new GameError('Choose a firing tool.');
          if (!p.inventory.includes('Firing tool:' + v.tool))
            throw new GameError('Take the tool from the rack.');
          if (v.tool === 'coal' && !p.inventory.includes('Coal load'))
            throw new GameError('Fill the shovel at a coal bunker.');
          const trained = p.role?.includes('Boiler') ?? false,
            clock = this.elapsed + this.pausedTime;
          if (clock - p.lastTend < (trained ? 0.45 : 0.9))
            throw new GameError('Finish your stroke before starting another.');
          try {
            tendFire(this.ship, bank, v.zone!, v.tool!, trained, v.draw === true);
          } catch (e) {
            throw new GameError((e as Error).message);
          }
          p.lastTend = clock;
          if (v.tool === 'coal')
            p.inventory = p.inventory.filter((i) => i !== 'Coal load');
          this.log(`${p.name} worked boiler ${bank + 1}, fire ${v.zone! + 1}: ${v.tool}.`);
          return;
        }
        break;
      }
      case 'machine':
        if (s.machine === 'valve' && a.verb === 'steam-valve') {
          this.ship.mainSteamValve = num(0, 1);
          return;
        }
        break;
      case 'lifeboat':
        if (a.verb === 'board') {
          if (this.sinkingElapsed === null || this.sinkingElapsed < BALANCE.abandonDelay)
            throw new GameError('Wait for the evacuation order.');
          this.board(p);
          return;
        }
        break;
      case 'ladder':
        if (a.verb === 'travel') {
          return this.job(p, 'travel', s.id, s.travelSeconds ?? 3);
        }
        break;
      case 'cabinet':
        if (a.verb === 'turn' && !this.cabinetOpen) {
          occupy();
          if (!Number.isInteger(a.value) || Number(a.value) < 0 || Number(a.value) > 2)
            throw new GameError('Invalid dial.');
          this.puzzle = turnCabinet(this.puzzle, Number(a.value));
          return;
        }
        if (a.verb === 'unlock') {
          if (p.inventory.includes('Cabinet key')) {
            this.cabinetOpen = true;
            this.log(`${p.name} unlocked the binocular cabinet.`);
            return;
          }
          if (!cabinetAligned(this.puzzle)) throw new GameError('The dial notches are misaligned.');
          occupy();
          return this.job(p, 'unlock', s.id, 3);
        }
        if (a.verb === 'take' && this.cabinetOpen && !this.binocularOwner) {
          p.binoculars = true;
          this.binocularOwner = id;
          p.inventory.push('Binoculars');
          this.log(`${p.name} collected the binoculars.`);
          return;
        }
        if (a.verb === 'return' && p.binoculars) {
          p.binoculars = false;
          this.binocularOwner = null;
          p.inventory = p.inventory.filter((i) => i !== 'Binoculars');
          return;
        }
        break;
      case 'key':
        if (a.verb === 'take' && !this.cabinetOpen) {
          p.inventory.push('Cabinet key');
          p.notes.push('The cabinet key was on the ship.');
          return;
        }
        break;
      case 'storage':
        if (a.verb === 'note') {
          p.notes.push('Cabinet service record: the three dial shafts are coupled in a loop.');
          return;
        }
        break;
      case 'bell':
        if (a.verb === 'observe') {
          const v = a.value as { range?: number; note?: string } | null;
          if (
            !v ||
            typeof v.range !== 'number' ||
            !Number.isFinite(v.range) ||
            v.range < 0 ||
            v.range > 5 ||
            typeof v.note !== 'string'
          )
            throw new GameError('Enter an estimated range and observation.');
          const bearing = (this.ship.heading + (p.yaw * 180) / Math.PI + 360) % 360;
          p.notes.push(
            `Lookout ${Math.round(this.elapsed)}s: ${bearing.toFixed(0)}° from ${chartPosition(this.ship.west, this.ship.north)}; ${v.range ? v.range.toFixed(2) + ' NM estimated' : 'range uncertain'}. ${v.note.slice(0, 120)}`,
          );
          return;
        }
        if (a.verb === 'ring') {
          this.notice = 'Three bells · crow’s nest';
          this.log(`${p.name} rang the lookout bell.`);
          return;
        }
        break;
      case 'phone':
        if (a.verb === 'message' || a.verb === 'relay') {
          const call = this.phones.find(
            (c) => c.answerer && (c.caller === id || c.answerer === id),
          );
          if (!call) throw new GameError('Wait for someone to answer the line.');
          const other = this.players.get(call.caller === id ? call.answerer! : call.caller)!;
          let text: string;
          if (a.verb === 'relay') {
            const t = this.telegrams.find((t) => t.id === a.value && t.decoded);
            if (
              !t ||
              (!p.inventory.includes(`Telegram:${t.id}`) &&
                distance(p, STATIONS.find((s) => s.id === 'wireless')!) > 4)
            )
              throw new GameError('Read a decoded report from your desk or pocket.');
            text = `${t.sender}: ${t.text}`;
            if (!other.inventory.includes(`Telegram:${t.id}`))
              other.inventory.push(`Telegram:${t.id}`);
          } else {
            if (typeof a.value !== 'string' || !a.value.trim())
              throw new GameError('Write a message.');
            text = a.value.trim().slice(0, 180);
          }
          const message = { id: randomUUID(), from: p.name, text, at: Math.round(this.elapsed) };
          for (const crew of [p, other]) {
            crew.lineMessages.push(message);
            crew.lineMessages = crew.lineMessages.slice(-12);
          }
          other.notes.push(`Telephone — ${p.name}: ${text}`);
          return;
        }
        if (a.verb === 'hangup') {
          this.hangup(id);
          return;
        }
        if (a.verb === 'answer') {
          const call = this.phones.find((c) => c.to === s.phoneRoom && !c.answerer);
          if (!call) throw new GameError('There is no incoming call.');
          this.hangup(id);
          call.answerer = id;
          this.log(`${p.name} answered the ${s.phoneRoom} telephone.`);
          return;
        }
        if (a.verb === 'call') {
          const links = PHONE_LINKS;
          if (typeof a.value !== 'string' || !links[s.phoneRoom!]?.includes(a.value))
            throw new GameError('This line does not connect those departments.');
          if (
            this.phones.some(
              (c) =>
                [c.to, c.from].includes(a.value as string) || [c.to, c.from].includes(s.phoneRoom!),
            )
          )
            throw new GameError('The line is engaged.');
          this.phones.push({
            id: randomUUID(),
            from: s.phoneRoom!,
            to: a.value,
            caller: id,
            answerer: null,
            at: this.elapsed,
          });
          return;
        }
        break;
      case 'wireless': {
        if (this.machine('wireless').fault) throw new GameError('The receiver needs repair.');
        if (a.verb === 'request') {
          const clock = this.elapsed + this.pausedTime;
          if (clock < this.radioReadyAt)
            throw new GameError('The other station is still working your request.');
          this.radioReplyAt = clock + 8;
          this.radioReadyAt = clock + 40;
          p.notes.push('Requested a fresh ice position over Marconi wireless.');
          return;
        }
        if (!a.value || typeof a.value !== 'object') throw new GameError('Select a telegram.');
        const v = a.value as { id: string; text?: string };
        const telegram = this.telegrams.find((t) => t.id === v.id);
        if (!telegram) throw new GameError('That transmission has ended.');
        if (a.verb === 'assist') {
          occupy();
          if (
            [...this.players.values()].some(
              (other) => other.job?.kind === 'decode' && other.jobValue === v.id,
            )
          )
            throw new GameError('A colleague is already transcribing this report.');
          return this.job(p, 'decode', s.id, workSeconds(p.role, 'decode'), v.id);
        }
        if (a.verb === 'decode') {
          if (normalizeTelegram(v.text ?? '') !== normalizeTelegram(telegram.text!))
            throw new GameError(
              'The transcription does not match. Compare the Morse chart or use assistance.',
            );
          telegram.decoded = true;
          telegram.receivedBy = p.name;
          p.notes.push(`${telegram.sender}: ${telegram.text}`);
          this.log(`${p.name} transcribed a message from ${telegram.sender}.`);
          return;
        }
        if (a.verb === 'carry' && telegram.decoded) {
          if (!p.inventory.includes(`Telegram:${telegram.id}`))
            p.inventory.push(`Telegram:${telegram.id}`);
          return;
        }
        break;
      }
      case 'chart':
        if (a.verb === 'move') {
          const v = a.value as { id?: string; west?: number; north?: number } | null;
          const m = this.chartMarks.find((m) => m.id === v?.id);
          if (!m || !Number.isFinite(v?.west) || !Number.isFinite(v?.north))
            throw new GameError('Choose a mark and position.');
          try {
            const updated = readChartMark(
              {
                ...m,
                points: m.points.map((p) => ({
                  west: p.west + v!.west!,
                  north: p.north + v!.north!,
                })),
              },
              this.ship,
            );
            Object.assign(m, updated);
          } catch (e) {
            throw new GameError((e as Error).message);
          }
          return;
        }
        if (a.verb === 'mark') {
          if (this.chartMarks.length >= 100)
            throw new GameError('Erase an old mark before adding another.');
          try {
            this.chartMarks.push({
              ...readChartMark(a.value, this.ship),
              id: randomUUID(),
              by: p.name,
              at: Math.round(this.elapsed),
            });
          } catch (e) {
            throw new GameError((e as Error).message);
          }
          return;
        }
        if (a.verb === 'erase') {
          if (typeof a.value !== 'string') throw new GameError('Choose a mark.');
          this.chartMarks = this.chartMarks.filter((m) => m.id !== a.value);
          return;
        }
        if (a.verb === 'deliver') {
          const carried = p.inventory.filter((i) => i.startsWith('Telegram:'));
          if (!carried.length)
            throw new GameError('Carry a decoded telegram from the wireless room first.');
          for (const item of carried) {
            const t = this.telegrams.find((t) => `Telegram:${t.id}` === item);
            if (t) t.delivered = true;
          }
          p.inventory = p.inventory.filter((i) => !i.startsWith('Telegram:'));
          this.log(`${p.name} delivered ${carried.length} telegram(s) to the bridge.`);
          return;
        }
        if (a.verb === 'note' && typeof a.value === 'string') {
          p.notes.push(a.value.slice(0, 160));
          return;
        }
    }
    throw new GameError('That action is unavailable here.');
  }
  job(p: Player, kind: string, station: string, duration: number, value?: unknown) {
    p.job = { kind, station, elapsed: 0, duration };
    p.jobValue = value;
  }
  completeJob(p: Player, job: Job) {
    const s = STATIONS.find((s) => s.id === job.station)!;
    if (!s) return;
    switch (job.kind) {
      case 'travel':
        if (s.destination) Object.assign(p, s.destination);
        p.relocation++;
        p.inputAt = 0;
        break;
      case 'unlock':
        this.cabinetOpen = true;
        this.log(`${p.name} opened the binocular cabinet using its maintenance lock.`);
        break;
      case 'tamper': {
        const m = this.machine(s.machine!);
        if (this.machineViewed(m.id)) { p.notes.push('Work interrupted: a shipmate was at the equipment.'); return; }
        this.failMachine(m.id, true);
        m.evidence.push(
          this.rng.pick([
            'Fresh tool marks around the mounting bolts.',
            'The seal is damaged.',
            'The retaining screw is unusually loose.',
          ]),
        );
        p.charges--;
        p.cooldown = BALANCE.sabotageCooldown;
        this.log(`${p.name} secretly tampered with ${m.id}.`);
        break;
      }
      case 'service': {
        const m = this.machine(s.machine!);
        m.condition = Math.min(100, m.condition + 18);
        this.log(`${p.name} serviced ${m.id}.`);
        break;
      }
      case 'repair': {
        const m = this.machine(s.machine!);
        m.condition = 100;
        m.fault = null;
        p.inspections[m.id] = { fault: null, result: 'Operational' };
        this.log(`${p.name} repaired ${m.id}.`);
        break;
      }
      case 'inspect': {
        const m = this.machine(s.machine!);
        p.inspections[m.id] = { fault: m.fault, result: m.fault ?? 'Operational' };
        p.notes.push(
          `${m.id}: ${Math.round(m.condition)}%. ${m.fault ?? 'No active fault.'} ${m.evidence.join(' ') || 'No unusual physical evidence.'}`,
        );
        break;
      }
      case 'decode': {
        const t = this.telegrams.find((t) => t.id === p.jobValue);
        if (t) {
          t.decoded = true;
          t.receivedBy = p.name;
          p.notes.push(`${t.sender}: ${t.text}`);
          this.log(`${p.name} completed assisted transcription from ${t.sender}.`);
        }
        break;
      }
    }
  }
  hangup(id: string) {
    this.phones = this.phones.filter((c) => c.caller !== id && c.answerer !== id);
  }
  phoneStation(room: string) {
    return STATIONS.find((s) => s.phoneRoom === room)!;
  }
  practiceAction(id: string, action: PracticeAction) {
    const p = this.players.get(id);
    if (!this.practice || this.players.size !== 1 || this.host !== id || !p?.connected)
      throw new GameError('Test controls are available only in your own single-player voyage.');
    if (!action || typeof action.verb !== 'string') throw new GameError('Invalid test control.');
    if (action.verb === 'demo' && !findDemo(action.value))
      throw new GameError('Choose an existing job demo.');
    if (action.verb === 'restart' || action.verb === 'demo') {
      const settings = { ...this.practiceSettings };
      const post = p.role ?? 'Captain';
      const demo =
        action.verb === 'demo' ? (action.value as DemoId) : (this.activeDemo ?? undefined);
      this.phase = 'lobby';
      this.seed = randomBytes(4).readUInt32LE();
      this.start(id, { practice: true, post, ...settings, demo, difficulty: this.difficulty });
      return;
    }
    if (this.phase !== 'voyage')
      throw new GameError('Restart the test voyage to use that control.');
    if (action.verb === 'pause' || action.verb === 'assistance' || action.verb === 'tools') {
      if (typeof action.value !== 'boolean') throw new GameError('Choose an on or off setting.');
      const key = action.verb === 'pause' ? 'paused' : action.verb;
      this.practiceSettings[key] = action.value;
      return;
    }
    if (action.verb === 'travel' || action.verb === 'post') {
      let destination: Position;
      if (action.verb === 'post') {
        if (typeof action.value !== 'string' || !Object.hasOwn(ROLE_INFO, action.value))
          throw new GameError('Choose a crew assignment.');
        p.role = action.value as Role;
        destination = spawnFor(p.role);
      } else {
        const station = STATIONS.find((s) => s.id === action.value);
        if (!station) throw new GameError('Choose an existing ship station.');
        const first = station.route?.[0],
          second = station.route?.[1];
        const dx = first && second ? (second.x - first.x) * SHIP_WIDTH_SCALE : 0,
          dz = first && second ? (second.z - first.z) * SHIP_LENGTH_SCALE : 0;
        const length = Math.hypot(dx, dz);
        const approach =
          length > 0.01
            ? [
                [
                  ((-dx / length) * 1.8) / SHIP_WIDTH_SCALE,
                  ((-dz / length) * 1.8) / SHIP_LENGTH_SCALE,
                ],
              ]
            : [];
        const candidates = [
          ...(station.level === 1
            ? [false, true].map((second) => {
                const q = lookoutSpawn(second);
                return [q.x - station.x, q.z - station.z];
              })
            : []),
          ...(station.id === 'engines' ? [[0, -2.1 / SHIP_LENGTH_SCALE]] : []),
          ...approach,
          [0, 2.1 / SHIP_LENGTH_SCALE],
          [2.9 / SHIP_WIDTH_SCALE, 0],
          [-2.9 / SHIP_WIDTH_SCALE, 0],
          [0, -2.1 / SHIP_LENGTH_SCALE],
          [0, 0.5 / SHIP_LENGTH_SCALE],
          [0.5 / SHIP_WIDTH_SCALE, 0],
          [-0.5 / SHIP_WIDTH_SCALE, 0],
          [0, -0.5 / SHIP_LENGTH_SCALE],
          [0, 0],
        ].map(([x, z]) => ({ x: station.x + x, z: station.z + z, level: station.level }));
        const spot = candidates.find(
          (pos) =>
            canOccupy(pos) &&
            distance(pos, station) < BALANCE.interactDistance &&
            wallsBetween(pos, station) === 0,
        );
        if (!spot) throw new GameError('There is no clear standing space at that station.');
        destination = spot;
        p.yaw = Math.atan2(
          (station.x - spot.x) * SHIP_WIDTH_SCALE,
          (spot.z - station.z) * SHIP_LENGTH_SCALE,
        );
      }
      this.hangup(id);
      p.job = null;
      p.inputAt = 0;
      p.input.forward = 0;
      p.input.right = 0;
      Object.assign(p, destination);
      p.relocation++;
      this.activeDemo = null;
      return;
    }
    if (action.verb === 'restore') {
      this.activeDemo = null;
      this.machines = this.newMachines();
      this.ship.hull = 100;
      this.ship.compartments.fill(0);
      this.ship.impact = null;
      this.ship.steam = 76;
      this.ship.boilerPressure.fill(76);
      this.ship.boilerConnected.fill(true);
      this.ship.reliefUntil.fill(0);
      this.ship.safetyLifted.fill(false);
      this.ship.mainSteamValve = 1;
      this.ship.engineRevs = this.ship.throttle * 3.2;
      this.ship.steamLeak = 0;
      this.ship.indicatedSteam = 76;
      this.ship.coal.fill(0.62);
      this.ship.bedBalance = emptyFireZones();
      this.ship.ashBalance = emptyFireZones();
      this.ship.clinker = emptyFireZones();
      this.ship.fireDoors = closedFireDoors();
      this.ship.fires.fill(0.67);
      this.ship.fireHeat.fill(0.67);
      this.ship.ash.fill(0);
      this.ship.delay = 0;
      this.ship.offRouteTime = 0;
      this.ship.north = 0;
      this.ship.heading = 270;
      this.ship.rudder = this.ship.rudderTarget = 0;
      this.ship.yawRate = 0;
      p.charges = BALANCE.sabotageCharges;
      p.cooldown = 0;
      p.job = null;
      this.notice = 'Ship restored';
      this.log('Single-player test: restored ship condition.');
      return;
    }
    if (action.verb === 'schedule' || action.verb === 'route') {
      this.activeDemo = null;
      this.icebergs = [];
      this.mainResolved = true;
      this.mainPassedAt = null;
      this.ship.hull = 100;
      this.ship.compartments.fill(0);
      this.ship.impact = null;
      if (action.verb === 'schedule') {
        this.ship.delay = BALANCE.scheduleUrgent + 10;
        this.ship.speed = this.ship.throttle = this.ship.order = 0;
        this.ship.north = 0;
        this.ship.offRouteTime = 0;
      } else {
        this.ship.north = BALANCE.corridorHalfWidth + 50;
        this.ship.offRouteTime = BALANCE.routeGraceSeconds / 2;
        this.ship.delay = 0;
        this.ship.speed = this.ship.throttle = this.ship.order = BALANCE.cruiseKnots;
        this.ship.heading = 270;
        this.ship.rudder = this.ship.rudderTarget = 0;
        this.ship.yawRate = 0;
      }
      this.practiceSettings.paused = false;
      this.log(
        'Single-player test: ' +
          (action.verb === 'schedule' ? 'late crossing' : 'route departure') +
          '.',
      );
      return;
    }
    if (action.verb === 'ice') {
      this.activeDemo = null;
      this.icebergs = [];
      this.mainResolved = true;
      this.mainPassedAt = null;
      this.ship.visibility = 1;
      this.ship.weather = 'Clear moonlight';
      const spot = this.projectedIce(70);
      this.addIce(spot.west, spot.north, 46, true);
      this.seedIceField(this.icebergs[0].west, this.icebergs[0].north);
      this.practiceSettings.paused = false;
      this.notice = '';
      this.log('Single-player test: placed an ice hazard on the projected course.');
      return;
    }
    if (action.verb === 'inquiry') {
      this.activeDemo = null;
      this.beginInquiry('schedule');
      return;
    }
    if (action.verb === 'sinking') {
      this.activeDemo = null;
      this.ship.compartments.fill(0.84, 0, 5);
      this.ship.hull = 16;
      this.practiceSettings.paused = false;
      this.beginSinking();
      this.log('Single-player test: initiated flooding and evacuation.');
      return;
    }
    throw new GameError('Unknown test control.');
  }
  private prepareDemo(id: string, demoId: DemoId) {
    const demo = findDemo(demoId);
    if (!demo || !this.practice) return;
    this.icebergs = [];
    this.chartMarks = [];
    this.mainResolved = true;
    this.mainPassedAt = null;
    this.nextEvent = this.nextTelegram = Infinity;
    this.practiceSettings = {
      paused: !demo.live,
      assistance: demo.id !== 'boilers' && demo.id !== 'engineer',
      tools: true,
    };
    const p = this.players.get(id)!;
    p.role = demo.role;
    this.practiceAction(id, { verb: 'travel', value: demo.station });
    if (demo.id === 'lookout') {
      Object.assign(p, lookoutSpawn());
      p.yaw = 0;
      p.binoculars = true;
      p.inventory.push('Binoculars');
      this.cabinetOpen = true;
      this.binocularOwner = id;
    }
    if (demo.id === 'lookout' || demo.id === 'helmsman') {
      const spot = this.projectedIce(70);
      this.addIce(spot.west, spot.north, 46, true);
      this.seedIceField(spot.west, spot.north);
    }
    if (demo.id === 'helmsman') this.command = { heading: 278, acknowledgedBy: null };
    if (demo.id === 'boilers') {
      this.ship.coal[0] = 0.32;
      this.ship.bedBalance[0] = [-0.16, 0.17, -0.01];
      this.ship.ash[0] = 0.35;
      this.ship.ashBalance[0] = [0.25, -0.15, -0.1];
      this.ship.clinker[0] = [0.75, 0.2, 0.1];
      this.ship.fires[0] = 0.65;
      this.ship.fireHeat[0] = 0.42;
    }
    if (demo.id === 'engineer') {
      this.ship.order = 25;
      this.ship.speed = this.ship.throttle = 10;
      this.machine('engines').condition = 40;
      this.machine('engines').fault = 'Drive assembly sticking';
    }
    if (demo.id === 'navigation' || demo.id === 'wireless') {
      const spot = this.projectedIce(70);
      this.addIce(spot.west, spot.north, 46, true);
      this.seedIceField(spot.west, spot.north);
      const t = this.generateTelegram(true);
      t.decoded = demo.id === 'navigation';
      if (t.decoded) p.inventory.push(`Telegram:${t.id}`);
    }
    if (demo.id === 'schedule') this.ship.speed = this.ship.throttle = this.ship.order = 0;
    this.activeDemo = demo.id;
    this.notice = '';
  }
  private demoSnapshot(): DemoState | null {
    const d = findDemo(this.activeDemo);
    if (!d) return null;
    const complete = {
      captain: this.ship.order === 25,
      navigation:
        this.telegrams.some((t) => t.delivered) &&
        this.chartMarks.some((m) => m.source === 'Wireless'),
      lookout:
        [...this.players.values()].some((p) => p.notes.some((n) => n.startsWith('Lookout '))) &&
        this.events.some((e) => e.text.endsWith('rang the lookout bell.')),
      helmsman: this.ship.heading >= 278 && Math.abs(this.ship.rudderTarget) < 0.01,
      boilers:
        [0, 1, 2].every((z) => {
          const b = firebed(this.ship, 0, z);
          return b.coal > 0.35 && b.coal < 0.78 && b.ash < 0.35 && b.clinker < 0.35 && !b.open;
        }) &&
        steamPsi(this.ship.steam) >= 190 &&
        steamPsi(this.ship.steam) <= 215,
      engineer: !this.machine('engines').fault && this.ship.throttle === 25,
      wireless: this.telegrams.some((t) => t.decoded),
      schedule: this.ship.delay >= BALANCE.scheduleWarning,
    }[d.id];
    this.demoCompleted ||= complete;
    return { id: d.id, title: d.title, objective: d.objective, complete: this.demoCompleted };
  }
  voicePaths(listener: Player): VoicePath[] {
    if (!listener.connected) return [];
    const paths: VoicePath[] = [];
    for (const speaker of this.players.values()) {
      if (speaker.id === listener.id || !speaker.connected) continue;
      if (
        this.phase === 'lobby' ||
        this.phase === 'lifeboat' ||
        this.phase === 'inquiry' ||
        this.phase === 'ended'
      ) {
        paths.push({ id: speaker.id, gain: 1, phone: false });
        continue;
      }
      if (listener.evacuated || speaker.evacuated) {
        if (listener.evacuated && speaker.evacuated)
          paths.push({ id: speaker.id, gain: 1, phone: false });
        continue;
      }
      let gain = 0,
        phone = false;
      const d = distance(listener, speaker);
      if (d < BALANCE.proximityRadius) {
        const walls = wallsBetween(listener, speaker);
        gain = Math.pow(1 - d / BALANCE.proximityRadius, 1.25) * Math.pow(0.2, walls);
        if (listener.level === -1) gain *= 0.72;
      }
      for (const call of this.phones) {
        if (!call.answerer) continue;
        // A held handset carries its owner's voice. People next to the receiving
        // handset can overhear it, but cannot broadcast through an unheld phone.
        const other =
          call.caller === speaker.id
            ? this.players.get(call.answerer)
            : call.answerer === speaker.id
              ? this.players.get(call.caller)
              : null;
        if (other && distance(listener, other) < 3 && wallsBetween(listener, other) === 0) {
          gain = Math.max(gain, 0.9 * (1 - distance(listener, other) / 4));
          phone = true;
        }
      }
      if (gain > 0.015) paths.push({ id: speaker.id, gain: clamp(gain, 0, 1), phone });
    }
    return paths;
  }
  board(p: Player) {
    const index = [...this.players.keys()].indexOf(p.id),
      angle = (index * Math.PI * 2) / this.players.size;
    Object.assign(p, { x: Math.cos(angle) * 2, z: Math.sin(angle) * 2, level: 0, evacuated: true });
    p.job = null;
    p.inputAt = 0;
    p.relocation++;
    this.hangup(p.id);
  }
  beginSinking() {
    if (this.sinkingElapsed !== null) return;
    this.sinkingElapsed = 0;
    this.inquiryCause = 'sinking';
    this.phase = 'sinking';
    this.phaseTime = 0;
    this.ship.order = this.ship.throttle = 0;
    this.practiceSettings.paused = false;
    this.log('The forward flooding could no longer be contained.');
  }
  beginInquiry(cause: InquiryCause) {
    this.phase = cause === 'sinking' ? 'lifeboat' : 'inquiry';
    this.phaseTime = 0;
    this.inquiryCause = cause;
    this.votes = {};
    if (cause !== 'sinking') {
      this.ship.order = this.ship.throttle = this.ship.speed = 0;
      this.notice = 'Crossing recalled';
    } else this.notice = '';
    for (const [index, p] of [...this.players.values()].entries()) {
      if (cause === 'sinking') {
        if (!p.evacuated) this.board(p);
      } else {
        Object.assign(p, inquirySeat(index), { level: 0, evacuated: false });
        p.job = null;
        p.inputAt = 0;
        p.relocation++;
        p.talking = false;
      }
    }
    this.phones = [];
    this.log(
      cause === 'sinking'
        ? 'The surviving crew gathered in the lifeboats.'
        : cause === 'route'
          ? 'The crossing was recalled after leaving the safe route.'
          : 'The crossing was recalled after exhausting the schedule allowance.',
    );
  }
  tickCrew(dt: number) {
    for (const p of this.players.values()) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.talking = p.connected && Date.now() < p.talkUntil;
      if (!p.connected || p.evacuated) continue;
      if (p.job) {
        const station = STATIONS.find((s) => s.id === p.job!.station);
        if (!station || distance(p, station) > BALANCE.interactDistance) {
          p.job = null;
          continue;
        }
        p.job.elapsed += dt;
        if (p.job.elapsed >= p.job.duration) {
          const job = p.job;
          p.job = null;
          this.completeJob(p, job);
        }
        continue;
      }
      if (Date.now() - p.inputAt > 300) continue;
      let f = p.input.forward,
        r = p.input.right;
      const n = Math.hypot(f, r);
      if (n > 1) {
        f /= n;
        r /= n;
      }
      const speed = (p.input.sprint ? BALANCE.sprintSpeed : BALANCE.walkSpeed) * dt;
      const dx = ((Math.sin(p.yaw) * f + Math.cos(p.yaw) * r) * speed) / SHIP_WIDTH_SCALE,
        dz = ((-Math.cos(p.yaw) * f + Math.sin(p.yaw) * r) * speed) / SHIP_LENGTH_SCALE;
      Object.assign(p, moveWithCollision(p, dx, dz));
    }
    this.phones = this.phones.filter((c) => {
      const a = this.players.get(c.caller),
        b = c.answerer ? this.players.get(c.answerer) : null;
      return (
        a?.connected &&
        distance(a, this.phoneStation(c.from)) < 3.5 &&
        (!b || (b.connected && distance(b, this.phoneStation(c.to)) < 3.5)) &&
        (c.answerer || this.elapsed - c.at < 35)
      );
    });
  }
  tick(dt: number) {
    if (this.phase === 'lobby') return;
    if (this.sinkingElapsed !== null) this.sinkingElapsed += dt;
    if (this.phase === 'ended') return;
    const paused = this.phase === 'voyage' && this.practice && this.practiceSettings.paused;
    if (paused) this.pausedTime += dt;
    else this.elapsed += dt;
    this.phaseTime += dt;
    for (const p of this.players.values()) p.talking = p.connected && Date.now() < p.talkUntil;
    if (this.phase === 'lifeboat' || this.phase === 'inquiry') {
      if (this.phaseTime >= BALANCE.voteSeconds) this.resolveVote();
      return;
    }
    this.tickCrew(dt);
    if (this.radioReplyAt !== null && this.elapsed + this.pausedTime >= this.radioReplyAt) {
      this.radioReplyAt = null;
      this.generateTelegram(true);
    }
    if (this.phase === 'sinking') {
      this.ship.order = this.ship.throttle = 0;
      this.simulateShip(dt);
      this.checkIcebergs();
      if (
        this.sinkingElapsed! - dt < BALANCE.abandonDelay &&
        this.sinkingElapsed! >= BALANCE.abandonDelay
      ) {
        this.notice = 'Get to the lifeboats';
        this.log('The order was given to abandon ship.');
      }
      if (this.sinkingElapsed! >= BALANCE.evacuationSeconds) this.beginInquiry('sinking');
      return;
    }
    if (paused) {
      this.updateSteamLeak(dt);
      if (this.activeDemo === 'boilers')
        for (let i = 1; i < 4; i++) {
          this.ship.coal[i] = 0.7;
          this.ship.ash[i] = 0.02;
          this.ship.clinker[i].fill(0.02);
        }
      if (this.practiceSettings.assistance)
        this.ship.coal = this.ship.coal.map((c) => Math.max(0.62, c));
      const engine = this.machine('engines').fault
        ? 0.48
        : Math.max(0.75, this.machine('engines').condition / 100);
      stepPlant(
        this.ship,
        dt,
        1,
        this.activeDemo === 'boilers' ? 1 : this.crewSize < 7 ? 0.65 : 1,
        engine,
      );
      this.ship.speed +=
        (this.ship.throttle * Math.min(1, this.ship.steam / 63) * engine - this.ship.speed) *
        Math.min(1, dt * 0.045);
      this.ship.indicatedSteam = this.ship.steam + (this.machine('gauge').fault ? 18 : 0);
      return;
    }
    if (this.practice && this.practiceSettings.assistance) {
      this.ship.throttle = this.ship.order;
      this.ship.coal = this.ship.coal.map((c) => Math.max(0.62, c));
    }
    this.simulateShip(dt);
    if (this.elapsed >= this.nextEvent) {
      this.randomEvent();
      this.nextEvent = this.elapsed + this.rng.between(17, 53);
    }
    if (this.elapsed >= this.nextTelegram) {
      this.generateTelegram();
      this.nextTelegram =
        this.elapsed +
        this.rng.between(
          this.crewSize < 5 ? 55 : this.crewSize === 10 ? 18 : 30,
          this.crewSize < 5 ? 85 : this.crewSize === 10 ? 30 : 48,
        );
    }
    if (!this.mainResolved && this.elapsed >= this.encounterAt - BALANCE.encounterLead)
      this.resolveEncounter();
    this.checkIcebergs();
    if (this.sinkingElapsed !== null) return;
    if (this.ship.hull <= 0 || this.ship.compartments.filter((n) => n > 0.72).length >= 4) {
      this.beginSinking();
      return;
    }
    const nav = navigationWarnings(this.ship),
      key = nav.schedule + ':' + nav.route;
    if (key !== this.warningKey) {
      this.warningKey = key;
      if (nav.route === 'urgent') this.notice = 'Off route · return to the corridor';
      else if (nav.schedule === 'urgent') this.notice = 'Schedule allowance running out';
      else if (nav.route) this.notice = 'Approaching the route boundary';
      else if (nav.schedule) this.notice = 'Falling behind schedule';
    }
    if (
      Math.abs(this.ship.north) >= BALANCE.routeHardLimit ||
      this.ship.offRouteTime >= BALANCE.routeGraceSeconds
    ) {
      this.beginInquiry('route');
      return;
    }
    if (this.ship.delay >= BALANCE.scheduleBudget) {
      this.beginInquiry('schedule');
      return;
    }
    if (
      this.mainPassedAt !== null &&
      this.elapsed - this.mainPassedAt > 35 &&
      this.ship.compartments.every((n) => n < 0.35)
    )
      this.finish('crew');
    if (
      this.phase === 'voyage' &&
      this.mainPassedAt !== null &&
      this.elapsed - this.mainPassedAt > 85 &&
      this.ship.hull > 0
    )
      this.finish('crew');
  }
  simulateShip(dt: number) {
    const ship = this.ship;
    this.updateSteamLeak(dt);
    const efficiency = 1;
    const engineEfficiency = this.machine('engines').fault
      ? 0.48
      : Math.max(0.75, this.machine('engines').condition / 100);
    const fire = stepPlant(ship, dt, efficiency, this.crewSize < 7 ? 0.65 : 1, engineEfficiency);
    const steerEfficiency = this.machine('steering').fault ? 0.24 : 1;
    advanceMotion(ship, dt, steerEfficiency, engineEfficiency);
    ship.indicatedHeading = ship.heading + (this.machine('compass').fault ? 6 : 0);
    ship.indicatedSteam = ship.steam + (this.machine('gauge').fault ? 18 : 0);
    if (this.phase === 'voyage') {
      const progress = ship.speed * Math.cos(((ship.heading - 270) * Math.PI) / 180);
      ship.delay = clamp(
        ship.delay + ((BALANCE.cruiseKnots - progress) / BALANCE.cruiseKnots) * dt,
        0,
        10000,
      );
      ship.offRouteTime =
        Math.abs(ship.north) >= BALANCE.corridorHalfWidth ? ship.offRouteTime + dt : 0;
    }
    for (const m of this.machines)
      m.condition = Math.max(
        12,
        m.condition -
          dt *
            (m.id === 'engines' ? 0.025 + ship.speed * 0.001 : 0.009) *
            (['engines', 'valve'].includes(m.id) ? 1 + fullPowerStrain(ship.throttle) * 0.35 : 1) *
            (fire > 0.92 ? 3 : 1),
      );
    for (let i = 0; i < ship.compartments.length; i++) {
      let water = ship.compartments[i];
      if (water > 0) {
        const pump = ship.steam > 48 && !this.machine('engines').fault ? 0.0017 : 0.0005;
        water += dt * (water > 0.28 ? 0.0085 : -pump);
        ship.compartments[i] = clamp(water, 0, 1);
      }
    }
    const flooded = ship.compartments.reduce((a, n) => a + n, 0);
    if (flooded > 1.4) ship.hull = Math.max(0, ship.hull - dt * (flooded - 1.3) * 1.5);
  }
  randomEvent() {
    const event = this.rng.next(),
      m = this.rng.pick(this.machines);
    const failureChance =
      0.16 + (1 - m.condition / 100) * 0.4 + (this.ship.throttle > 21 ? 0.06 : 0);
    if (event < failureChance && !m.fault && !this.machineViewed(m.id)) {
      this.failMachine(m.id);
      this.log(`A natural ${m.id} malfunction developed.`);
    } else if (event < 0.55) {
      this.ship.visibility = this.rng.between(0.77, 1.13);
      this.ship.weather = this.ship.visibility < 0.9 ? 'Drifting sea mist' : 'Clear moonlight';
    } else this.ship.visibility = 1.12;
  }
  updateSteamLeak(dt: number) {
    const target = this.machine('valve').fault ? 0.85 : 0;
    const rate = target > this.ship.steamLeak ? 0.018 : 0.15;
    this.ship.steamLeak += Math.sign(target - this.ship.steamLeak) * Math.min(Math.abs(target - this.ship.steamLeak), dt * rate);
  }
  addIce(west: number, north: number, radius: number, main = false) {
    this.icebergs.push({
      id: randomUUID(),
      west,
      north,
      radius,
      height: this.rng.between(12, 31),
      shape: Math.floor(this.rng.next() * 10000),
      main,
      hit: false,
      passed: false,
    });
  }
  seedIceField(west: number, north: number) {
    const random = new Random(this.seed ^ 0x19420414);
    const angle = ((this.ship.heading - 270) * Math.PI) / 180;
    const mainAlong =
      (west - this.ship.west) * Math.cos(angle) + (north - this.ship.north) * Math.sin(angle);
    for (let i = 0; i < 18; i++)
      this.addIce(
        this.ship.west + random.between(350, Math.max(1700, west - this.ship.west + 1000)),
        this.ship.north + (i % 2 ? 1 : -1) * random.between(260, 1800),
        random.between(18, 66),
        false,
      );
    for (let i = 0; i < 6; i++) {
      const radius = random.between(25, 54),
        side = i % 2 ? 1 : -1;
      const along = mainAlong + [-650, -370, -130, 160, 390, 670][i],
        across = side * (HULL_HALF_WIDTH + radius + random.between(12, 32));
      this.addIce(
        this.ship.west + Math.cos(angle) * along - Math.sin(angle) * across,
        this.ship.north + Math.sin(angle) * along + Math.cos(angle) * across,
        radius,
        false,
      );
    }
  }
  projectedIce(seconds: number, offset = 0) {
    const future = projectCourse(
      this.ship,
      seconds,
      this.machine('steering').fault ? 0.24 : 1,
      this.machine('engines').fault
        ? 0.48
        : Math.max(0.75, this.machine('engines').condition / 100),
    );
    const a = ((future.heading - 270) * Math.PI) / 180,
      reach = HULL_BOW + 46;
    return {
      west: future.west + Math.cos(a) * reach - Math.sin(a) * offset,
      north: future.north + Math.sin(a) * reach + Math.cos(a) * offset,
    };
  }
  seedVoyage() {
    const count = 2 + Math.floor(this.rng.next() * 3);
    const first = this.projectedIce(this.encounterAt, this.hazardNorth);
    const spacing = 20 * (METRES_PER_NM / 3600) * NAVIGATION_RATE;
    let west = first.west;
    this.mainResolved = true;
    for (let n = 0; n < count; n++) {
      const north = n === 0 ? first.north : this.rng.between(-38, 38);
      this.addIce(west, north, this.rng.between(35, 46), true);
      // A nearby off-track contact makes the choice of passing side meaningful.
      const side = north >= 0 ? 1 : -1;
      this.addIce(
        west + this.rng.between(-130, 160),
        side * this.rng.between(150, 195),
        this.rng.between(22, 34),
      );
      for (let i = 0; i < 7; i++)
        this.addIce(
          west + this.rng.between(-450, 550),
          (i % 2 ? 1 : -1) * this.rng.between(320, 1800),
          this.rng.between(18, 60),
        );
      west += spacing * this.rng.between(85, 110);
    }
  }
  resolveEncounter(initial = false) {
    if (this.mainResolved && this.icebergs.some((i) => i.main)) return;
    const spot = this.projectedIce(
      initial ? this.encounterAt : BALANCE.encounterLead,
      this.hazardNorth,
    );
    this.mainResolved = true;
    this.addIce(spot.west, spot.north, 46, true);
    if (initial) this.seedIceField(spot.west, spot.north);
  }
  checkIcebergs() {
    const ship = this.ship,
      angle = ((ship.heading - 270) * Math.PI) / 180;
    for (const ice of this.icebergs) {
      const dw = ice.west - ship.west,
        dn = ice.north - ship.north;
      const along = dw * Math.cos(angle) + dn * Math.sin(angle),
        across = -dw * Math.sin(angle) + dn * Math.cos(angle);
      const contact = hullContact(iceRelative(ice, ship), ice.radius * CHART_SCALE);
      if (contact.gap < 0) {
        // Project the hull out of the solid ice on every tick, including after
        // the first strike. Engines cannot drive the hull through the obstacle.
        const correction = (contact.penetration + 0.002) / CHART_SCALE;
        const dx = -contact.normal.x * correction,
          forward = contact.normal.z * correction;
        ship.west += forward * Math.cos(angle) - dx * Math.sin(angle);
        ship.north += forward * Math.sin(angle) + dx * Math.cos(angle);
        const closing = Math.max(0, -contact.normal.z);
        if (!ice.hit) {
          ice.hit = true;
          const bow = along > HULL_BOW * 0.65;
          // Bow contact at high speed is severe; low speed or a glancing blow can
          // flood only one or two compartments and remain survivable.
          const impact = (ship.speed / 22) * (0.55 + 0.48 * closing);
          const count = impact > 0.78 ? 5 : impact > 0.6 ? 4 : impact > 0.43 ? 3 : 2;
          for (let i = 0; i < count; i++)
            ship.compartments[i] = Math.max(ship.compartments[i], impact > 0.6 ? 0.42 : 0.19);
          ship.hull = Math.max(8, ship.hull - impact * 43);
          ship.impact = {
            id: (ship.impact?.id ?? 0) + 1,
            at: this.elapsed,
            point: {
              x: contact.point.x / SHIP_WIDTH_SCALE,
              z: contact.point.z / SHIP_LENGTH_SCALE,
            },
            normal: (() => {
              const x = contact.normal.x * SHIP_WIDTH_SCALE,
                z = contact.normal.z * SHIP_LENGTH_SCALE,
                n = Math.hypot(x, z);
              return { x: x / n, z: z / n };
            })(),
            strength: clamp(impact, 0.15, 1),
            speed: ship.speed,
          };
          if (impact > 0.6) this.beginSinking();
          const contactSpeed = ship.speed;
          ship.speed *= Math.max(0.025, 1 - closing * 0.975);
          this.notice = `Ice contact · ${count} compartments flooding`;
          this.log(
            `Ice contact at ${Math.round(contactSpeed)} knots, ${bow ? 'forward' : 'alongside'}. ${count} compartments breached.`,
          );
        } else ship.speed *= 1 - closing * 0.22;
      }
      if (
        !ice.passed &&
        (ice.main
          ? ship.west > ice.west + HULL_STERN + ice.radius + 20
          : along < -HULL_STERN - ice.radius - 20)
      ) {
        ice.passed = true;
        if (ice.main) {
          if (this.icebergs.filter((i) => i.main).every((i) => i.passed)) {
            this.mainPassedAt = this.elapsed;
            this.notice = 'Reported ice field astern · hold a safe course';
          }
          this.log(
            ice.hit
              ? 'An ice hazard passed astern after contact.'
              : 'The crew cleared an ice hazard without contact.',
          );
        }
      }
    }
    this.icebergs = this.icebergs.filter(
      (i) => i.main || this.ship.west - i.west < BALANCE.horizonDistance + 400,
    );
  }
  generateTelegram(fresh = false) {
    const ahead = this.icebergs
      .filter((i) => !i.passed && i.west > this.ship.west + 100)
      .sort((a, b) => a.west - b.west);
    const source = fresh
      ? (ahead.find((i) => i.main) ?? ahead[0])
      : this.rng.pick(ahead.slice(0, 8));
    const useful =
      !!source && (fresh || !this.telegrams.some((t) => t.report) || this.rng.next() < 0.75);
    const report = useful
      ? iceReport(source.west, source.north, this.elapsed - (fresh ? 0 : this.rng.between(40, 220)))
      : undefined;
    const text = report
      ? iceMessage(report)
      : this.rng.pick([
          'FOR CAPE RACE PASSENGER TRAFFIC HELD UNTIL ICE REPORTS CLEAR',
          'CARPATHIA ACKNOWLEDGES YOUR SIGNAL',
          'BALTIC REQUESTS ACKNOWLEDGMENT OF LAST ICE POSITION',
        ]);
    const t: Telegram = {
      id: randomUUID(),
      sender: fresh ? 'CALIFORNIAN' : this.rng.pick(['BALTIC', 'MESABA', 'CARONIA', 'CALIFORNIAN']),
      code: encodeMorse(text),
      text,
      decoded: false,
      delivered: false,
      at: Math.round(this.elapsed),
      urgent: !!report,
      ...(report ? { report } : {}),
    };
    this.telegrams.push(t);
    if (this.telegrams.length > 30) this.telegrams.shift();
    return t;
  }
  vote(id: string, target: string) {
    if (!['lifeboat', 'inquiry'].includes(this.phase))
      throw new GameError('Voting opens during the crew inquiry.');
    if (!this.players.get(id)?.connected || !this.players.has(target))
      throw new GameError('Choose a crewmate in this voyage.');
    this.votes[id] = target;
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.every((p) => this.votes[p.id])) this.resolveVote();
  }
  resolveVote() {
    if (this.practice) {
      this.log('Single-player test: crew vote completed.');
      this.finish('draw');
      return;
    }
    const counts: Record<string, number> = {};
    for (const target of Object.values(this.votes)) counts[target] = (counts[target] ?? 0) + 1;
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const majority =
      ranked[0] && ranked[0][1] > this.players.size / 2 && ranked[0][1] > (ranked[1]?.[1] ?? 0);
    const caught = majority && this.players.get(ranked[0][0])?.saboteur;
    this.log(
      majority
        ? `The crew cast ${ranked[0][1]} votes against ${this.players.get(ranked[0][0])!.name}.`
        : 'The crew failed to reach a majority decision.',
    );
    this.finish(caught ? 'draw' : 'saboteur');
  }
  finish(outcome: Result['outcome']) {
    const sab = [...this.players.values()].find((p) => p.saboteur);
    const text = {
      crew: [
        'A different history.',
        'The Titanic cleared the ice. You gave history a better ending.',
      ],
      saboteur: [
        'History repeats itself.',
        'The ship is lost, and the time traveler escaped the lifeboat’s judgment.',
      ],
      draw: [
        'A very cold compromise.',
        'You found the time traveler. The Titanic is still at the bottom. Nobody wins.',
      ],
      dismissed: [
        'Crossing cancelled.',
        'The ship survived. The crew was dismissed for missing the schedule.',
      ],
    }[outcome];
    const recalled = this.inquiryCause === 'schedule' || this.inquiryCause === 'route';
    if (recalled && ['draw', 'saboteur'].includes(outcome)) {
      text[0] = outcome === 'draw' ? 'Interference exposed.' : 'Crossing abandoned.';
      text[1] =
        outcome === 'draw'
          ? 'You identified the time traveler, but the crossing was recalled. Nobody wins.'
          : 'The company dismissed the crew. The time traveler escaped the inquiry’s judgment.';
    }
    this.result = {
      cause: this.inquiryCause,
      revealed: ['draw', 'saboteur'].includes(outcome),
      outcome,
      title: this.practice ? 'Test voyage complete.' : text[0],
      description: this.practice ? 'Voyage record ready.' : text[1],
      saboteur: ['draw', 'saboteur'].includes(outcome) ? (sab?.id ?? '') : '',
      roles: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role!,
        saboteur: ['draw', 'saboteur'].includes(outcome) && p.saboteur,
      })),
      events: this.events.filter(
        (e) => ['draw', 'saboteur'].includes(outcome) || !e.text.includes('secretly tampered'),
      ),
      seed: this.seed,
    };
    this.phase = 'ended';
    this.phaseTime = 0;
    this.phones = [];
    for (const p of this.players.values()) {
      p.job = null;
      p.talking = false;
    }
  }
  returnToLobby(id: string) {
    if (id !== this.host || this.phase !== 'ended')
      throw new GameError('The host can return everyone after the result.');
    for (const [key, p] of this.players) {
      if (!p.connected) {
        this.players.delete(key);
        continue;
      }
      p.role = null;
      p.saboteur = false;
      p.evacuated = false;
      p.ready = false;
      p.job = null;
      p.inputAt = 0;
      p.inventory = [];
      p.notes = [];
      p.binoculars = false;
      p.x = 0;
      p.z = -18;
      p.level = 0;
    }
    this.phase = 'lobby';
    this.sinkingElapsed = null;
    this.activeDemo = null;
    this.demoCompleted = false;
    this.inquiryCause = null;
    this.elapsed = 0;
    this.phaseTime = 0;
    this.result = null;
    this.seed = randomBytes(4).readUInt32LE();
    this.ship = this.newShip();
    this.notice = '';
    this.icebergs = [];
    this.telegrams = [];
    this.radioReplyAt = null;
    this.radioReadyAt = 0;
    this.phones = [];
    this.votes = {};
    this.electHost();
  }
  snapshot(id: string): Snapshot {
    const me = this.players.get(id)!;
    const nearWireless =
      Math.min(...STATIONS.filter((s) => s.kind === 'wireless').map((s) => distance(me, s))) < 4;
    const range = BALANCE.horizonDistance;
    const players = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      evacuated: p.evacuated,
      color: p.color,
      connected: p.connected,
      ready: p.ready,
      x: p.x,
      z: p.z,
      level: p.level,
      yaw: p.yaw,
      pitch: p.pitch,
      talking: p.talking,
      job: p.job ? { ...p.job, kind: p.job.kind === 'tamper' ? 'maintenance' : p.job.kind } : null,
      binoculars: p.binoculars,
    }));
    const publicTelegram = (t: Telegram): Telegram => ({
      id: t.id,
      sender: t.sender,
      code: t.code,
      at: t.at,
      decoded: t.decoded,
      delivered: t.delivered,
      urgent: t.decoded ? t.urgent : false,
      ...(t.decoded
        ? { receivedBy: t.receivedBy, text: t.text, ...(t.report ? { report: t.report } : {}) }
        : {}),
    });
    return {
      wirelessWaiting: this.telegrams.filter((t) => !t.decoded).length,
      chartMarks: this.chartMarks.map((m) => ({ ...m, points: m.points.map((p) => ({ ...p })) })),
      command: { ...this.command },
      firingTools: Object.fromEntries(FIRING_TOOLS.map(tool => [tool,
        [...this.players.values()].find(p => p.inventory.includes('Firing tool:' + tool))?.name ?? null,
      ])) as Snapshot['firingTools'],
      crewSize: this.crewSize,
      demo: this.demoSnapshot(),
      radio: nearWireless
        ? {
            pending: this.radioReplyAt !== null,
            readyIn: Math.max(0, Math.ceil(this.radioReadyAt - this.elapsed - this.pausedTime)),
          }
        : null,
      sinkingElapsed: this.sinkingElapsed,
      inquiryCause: this.inquiryCause,
      code: this.code,
      phase: this.phase,
      host: this.host,
      players,
      ship: { ...this.ship },
      machines: this.machines.map((m) => ({
        id: m.id,
        condition: m.condition,
        fault: m.fault,
        evidence: [],
      })),
      icebergs: ['voyage', 'sinking', 'lifeboat', 'ended'].includes(this.phase)
        ? this.icebergs
            .filter((i) => Math.hypot(i.west - this.ship.west, i.north - this.ship.north) < range)
            .map(({ main, hit, passed, ...i }) => i)
            .sort((a, b) => a.id.localeCompare(b.id))
        : [],
      phones: this.phones,
      telegrams: nearWireless
        ? this.telegrams.map(publicTelegram)
        : this.telegrams
            .filter((t) => me.inventory.includes(`Telegram:${t.id}`))
            .map(publicTelegram),
      delivered: this.telegrams.filter((t) => t.delivered).map(publicTelegram),
      elapsed: Math.round(this.elapsed),
      phaseElapsed: this.phaseTime,
      phaseRemaining: ['lifeboat', 'inquiry'].includes(this.phase)
        ? Math.ceil(BALANCE.voteSeconds - this.phaseTime)
        : this.phase === 'sinking'
          ? Math.ceil(BALANCE.evacuationSeconds - this.phaseTime)
          : null,
      notice: this.notice,
      noticeVersion: this.noticeVersion,
      votes: ['lifeboat', 'inquiry'].includes(this.phase) ? this.votes : {},
      result: this.result,
      practice: this.practice,
      practiceSettings: this.practice ? { ...this.practiceSettings } : null,
      alternativeWireless: this.alternativeWireless,
      binocularOwner: this.binocularOwner,
      cabinetOpen: this.cabinetOpen,
      self: {
        id: me.id,
        inspections: Object.fromEntries(Object.entries(me.inspections).filter(([id, record]) => record.fault === this.machine(id as MachineId).fault).map(([id, record]) => [id, record.result])),
        role: me.role,
        relocation: me.relocation,
        saboteur: me.saboteur,
        inventory: me.inventory,
        notes: me.notes.slice(-20),
        lineMessages: me.lineMessages,
        sabotageCharges: me.charges,
        sabotageReadyIn: Math.ceil(me.cooldown),
        voice: this.voicePaths(me),
        audience: [...this.players.values()]
          .filter((p) => p.id !== id && this.voicePaths(p).some((path) => path.id === id))
          .map((p) => p.id),
        ...(distance(me, STATIONS.find((s) => s.id === 'cabinet')!) < 4
          ? { puzzle: this.puzzle }
          : {}),
        ...(distance(me, this.keyPosition) < 5 && !this.cabinetOpen
          ? { keyPosition: this.keyPosition }
          : {}),
      },
    };
  }
}
