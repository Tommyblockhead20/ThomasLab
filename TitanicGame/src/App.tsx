import { CommandPanel, ObservationPanel } from './WatchPanels';
import { NavigationChart } from './NavigationChart';
import { WirelessPanel } from './WirelessPanel';
import { TelephonePanel } from './TelephonePanel';
import { nm } from '../shared/units';
import { reportSummary, watchTime } from '../shared/radio';
import { BoilerPanel } from './BoilerPanel';
import { boilerIndex, steamPsi } from '../shared/plant';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Anchor,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Compass,
  Copy,
  DoorOpen,
  Gauge,
  FlaskConical,
  UserRound,
  Headphones,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mic,
  MicOff,
  Radio,
  Settings2,
  Ship,
  ShieldCheck,
  Telescope,
  Users,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import { BALANCE, ROLE_INFO, ROLE_ORDER, type Role } from '../shared/config';
import type { Action, Snapshot, Station } from '../shared/types';
import { areaName, distance, STATIONS, WALLS } from '../shared/world';
import { HULL_OUTLINE, SHIP_LENGTH_SCALE } from '../shared/navigation';
import { defaultServer, network } from './network';
import { VoiceClient } from './voice';
import { OceanWorld } from './world';
import { shipAudio } from './audio';
import { PracticePanel } from './PracticePanel';
import { JobDemos } from './JobDemos';
import type { DemoId } from '../shared/demos';
import { Cabinet } from './Cabinet';
import { ShipMenu } from './ShipMenu';
import { navigationWarnings, workSeconds } from '../shared/voyage';

const voice: VoiceClient = import.meta.hot?.data.voice ?? new VoiceClient(network);
if (import.meta.hot) import.meta.hot.data.voice = voice;
type Modal =
  | 'pause'
  | 'create'
  | 'join'
  | 'solo'
  | 'demos'
  | 'practice'
  | 'settings'
  | 'help'
  | 'station'
  | 'notebook'
  | null;
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const cn = (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(' ');
const params = new URLSearchParams(location.search);
const serverLabel = (address: string) => {
  try {
    return new URL(address).host;
  } catch {
    return 'Set server in Settings';
  }
};
function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  className = '',
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={cn('button', secondary && 'secondary', className)}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Crest({ small = false }: { small?: boolean }) {
  return (
    <div className={cn('crest', small && 'small')}>
      <span>★</span>
      <div>
        <b>WHITE STAR LINE</b>
        <small>AN ALTERED HISTORY</small>
      </div>
    </div>
  );
}
export default function App() {
  const returnToMenu = useRef(false);
  const escapeHeld = useRef(false);
  const mount = useRef<HTMLDivElement>(null),
    world = useRef<OceanWorld | null>(null),
    stateRef = useRef<Snapshot | null>(null);
  const [state, setState] = useState<Snapshot | null>(null),
    [modal, setModal] = useState<Modal>(params.has('room') ? 'join' : null),
    [station, setStation] = useState<Station | null>(null),
    [nearest, setNearest] = useState<Station | null>(null);
  const [name, setName] = useState(localStorage.getItem('titanic-name') ?? ''),
    [code, setCode] = useState(params.get('room') ?? ''),
    [server, setServer] = useState(
      localStorage.getItem('titanic-server') ?? params.get('server') ?? defaultServer,
    );
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [locked, setLocked] = useState(false),
    [intro, setIntro] = useState(false),
    [copied, setCopied] = useState(false),
    [webglError, setWebglError] = useState('');
  const [voiceTick, setVoiceTick] = useState(0),
    [fast, setFast] = useState(false),
    [alternative] = useState(false);
  const [soloPost, setSoloPost] = useState<Role>('Captain');
  const [difficulty, setDifficulty] = useState<'standard' | 'experienced'>('standard');
  const [boilerPrompt, setBoilerPrompt] = useState('');
  const [firstWatch, setFirstWatch] = useState(!localStorage.getItem('titanic-briefed-v2'));
  const evacuated = !!state?.players.find((p) => p.id === state.self.id)?.evacuated;
  const [notice, setNotice] = useState('');
  const [lineNotice, setLineNotice] = useState<{ from: string; text: string } | null>(null);
  const latestLine = state?.self.lineMessages?.at(-1);
  useEffect(() => {
    if (!latestLine || latestLine.from === state?.players.find((p) => p.id === state.self.id)?.name)
      return;
    setLineNotice(latestLine);
    const timer = setTimeout(() => setLineNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [latestLine?.id]);

  useEffect(() => {
    setNotice(state?.notice ?? '');
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [state?.notice, state?.noticeVersion]);
  const [volume, setVolume] = useState(Number(localStorage.getItem('titanic-volume') ?? '.35')),
    [sensitivity, setSensitivity] = useState(
      Number(localStorage.getItem('titanic-sensitivity') ?? '1'),
    ),
    [quality, setQuality] = useState(localStorage.getItem('titanic-quality') ?? 'high');
  const showError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 8000);
    return () => clearTimeout(timer);
  }, [error]);
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      showError(e);
    }
  };
  useEffect(() => {
    try {
      const game = new OceanWorld(mount.current!);
      world.current = game;
      game.setQuality(quality);
      game.onNearest = setNearest;
      game.onBoilerPrompt = setBoilerPrompt;
      game.onBoilerGuide = () => {
        const current = game.boilerTarget?.bank;
        const boiler =
          current !== undefined
            ? STATIONS.find((s) => s.id === 'boiler-' + 'abcd'[current])
            : game.nearest?.kind === 'boiler'
              ? game.nearest
              : STATIONS.filter((s) => s.kind === 'boiler').sort(
                  (a, b) => distance(game.local, a) - distance(game.local, b),
                )[0];
        if (boiler?.kind === 'boiler') {
          setStation(boiler);
          setModal('station');
        }
      };
      game.onLock = setLocked;
      game.onPause = () => {
        if (stateRef.current && ['voyage', 'sinking'].includes(stateRef.current.phase))
          setModal((current) => current ?? 'pause');
      };
      game.onInteract = (s) => {
        if (s.kind === 'lifeboat') {
          void run(() => network.action({ station: s.id, verb: 'board' }));
        } else if (s.kind === 'ladder') {
          void run(() => network.action({ station: s.id, verb: 'travel' }));
        } else {
          setStation(s);
          setModal('station');
        }
      };
      game.onCancel = () => {
        const state = stateRef.current,
          job = state?.players.find((p) => p.id === state.self.id)?.job;
        if (job) void run(() => network.action({ station: job.station, verb: 'cancel' }));
      };
      game.onNotebook = () => setModal('notebook');
      game.onPractice = () => setModal('practice');
      game.onDemoRetry = () => void run(() => network.request('practice', { verb: 'restart' }));
    } catch (e) {
      setWebglError(
        '3D graphics could not start. Enable WebGL and hardware acceleration in your browser, then reload.',
      );
      console.error(e);
    }
    network.onState = (s) => {
      const before = stateRef.current;
      stateRef.current = s;
      setState(s);
      world.current?.update(s);
      voice.update(s);
      if (s.phase === 'voyage' && before?.phase !== 'voyage') {
        setIntro(!s.demo);
        setModal(null);
        if (s.demo) world.current?.enter();
      }
      if (
        ['sinking', 'lifeboat', 'inquiry', 'ended'].includes(s.phase) &&
        before?.phase !== s.phase
      ) {
        if (s.phase !== 'sinking') setModal(null);
        setIntro(false);
      }
    };
    network.onConnection = (value) => {
      setConnected(value);
    };
    network.onReset = () => {
      world.current?.resetState();
      stateRef.current = null;
      setState(null);
      setIntro(false);
      setModal(null);
      void voice.disable();
    };
    network.onResumed = () => {
      if (voice.enabled) void voice.reconnect();
    };
    network.onError = showError;
    voice.onChange = () => setVoiceTick((t) => t + 1);
    shipAudio.setVolume(volume);
    const saved = sessionStorage.getItem('titanic-session');
    if (network.socket?.connected && network.state) network.onState(network.state);
    else if (saved)
      void network
        .connect(server)
        .then(() => network.resume())
        .catch((e) => {
          sessionStorage.removeItem('titanic-session');
          showError(e);
        });
    const pushDown = (e: KeyboardEvent) => {
      if (
        e.code === 'KeyV' &&
        !(e.target as HTMLElement)?.closest('input,textarea,select') &&
        !e.repeat
      ) {
        void shipAudio.start();
        voice.push(true);
      }
    };
    const pushUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyV') voice.push(false);
    };
    window.addEventListener('keydown', pushDown);
    window.addEventListener('keyup', pushUp);
    return () => {
      world.current?.dispose();
      window.removeEventListener('keydown', pushDown);
      window.removeEventListener('keyup', pushUp);
    };
  }, []);
  useEffect(() => {
    world.current?.setOverlay(
      !!modal || intro || !state || !['voyage', 'sinking'].includes(state.phase) || evacuated,
    );
  }, [modal, intro, state?.phase, evacuated]);
  useEffect(() => {
    localStorage.setItem('titanic-volume', String(volume));
    shipAudio.setVolume(volume);
  }, [volume]);
  useEffect(() => {
    localStorage.setItem('titanic-sensitivity', String(sensitivity));
  }, [sensitivity]);
  useEffect(() => {
    localStorage.setItem('titanic-quality', quality);
    world.current?.setQuality(quality);
  }, [quality]);
  const close = () => {
    setError('');
    if (returnToMenu.current) {
      returnToMenu.current = false;
      setModal('pause');
      return;
    }
    setModal(null);
    if (state && ['voyage', 'sinking'].includes(state.phase) && !evacuated && !intro)
      world.current?.enter();
  };
  const open = (m: Modal) => {
    setError('');
    setModal(m);
    void shipAudio.start();
  };
  const resume = () => {
    returnToMenu.current = false;
    setModal(null);
    if (state && ['voyage', 'sinking'].includes(state.phase) && !evacuated) world.current?.enter();
  };
  const openMenuPage = (m: Modal) => {
    returnToMenu.current = true;
    open(m);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.code === 'KeyL' &&
        !e.repeat &&
        !intro &&
        !modal &&
        state?.players.find((p) => p.id === state.self.id)?.level === 1
      ) {
        e.preventDefault();
        setStation(STATIONS.find((s) => s.id === 'bell')!);
        setModal('station');
      }
      if (e.code === 'Escape' && !intro) {
        if (e.repeat || escapeHeld.current) return;
        escapeHeld.current = true;
        world.current?.cancelPendingPause();
        if (modal === 'pause') {
          e.preventDefault();
          resume();
        } else if (modal) {
          e.preventDefault();
          close();
        } else if (state && ['voyage', 'sinking', 'lifeboat', 'inquiry'].includes(state.phase)) {
          e.preventDefault();
          setModal('pause');
        }
      }
    };
    const release = (e: KeyboardEvent) => {
      if (e.code === 'Escape') escapeHeld.current = false;
    };
    const blur = () => {
      escapeHeld.current = false;
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', release);
      window.removeEventListener('blur', blur);
    };
  }, [modal, intro, state?.phase]);
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    localStorage.setItem('titanic-name', name.trim());
    localStorage.setItem('titanic-server', server);
    try {
      await network.join(name, server, modal === 'join' ? code.toUpperCase() : undefined);
      setModal(null);
      void shipAudio.start();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  const act = (action: Action) => run(() => network.action(action));
  const startSolo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const crewName = name.trim() || 'Test Captain';
      localStorage.setItem('titanic-name', crewName);
      localStorage.setItem('titanic-server', server);
      await network.solo(crewName, server, {
        post: soloPost,
        difficulty,
        paused: false,
        tools: true,
        assistance: true,
      });
      setModal(null);
      void shipAudio.start();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  const startDemo = async (demo: DemoId) => {
    setBusy(true);
    setError('');
    try {
      await network.solo(name.trim() || 'Test Crew', server, { demo });
      setIntro(false);
      setModal(null);
      void shipAudio.start();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  const leave = () =>
    run(async () => {
      await voice.disable();
      await network.leave();
      stateRef.current = null;
      setState(null);
      setModal(null);
      setIntro(false);
    });
  const copy = () =>
    run(async () => {
      if (!state) return;
      const url = new URL(location.href);
      url.search = '';
      url.searchParams.set('room', state.code);
      url.searchParams.set('server', server);
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  const me = state?.players.find((p) => p.id === state.self.id),
    inGame = state && ['voyage', 'sinking', 'lifeboat', 'inquiry'].includes(state.phase),
    isHost = state?.host === state?.self.id;
  const actionPanel = modal === 'station' && station && state;
  void voiceTick;
  return (
    <>
      <div className="world" ref={mount} aria-label="3D North Atlantic and explorable Titanic" />
      {!inGame && <div className="cinematic-shade" />}
      {!inGame && (
        <header className="masthead">
          <a className="brand" href="https://thomaslab.me/" aria-label="Return to ThomasLab">
            <Anchor size={25} />
            <span>
              TITANIC
              <span className="brand-divider" />
              ALTERED HISTORY
            </span>
          </a>
          <button
            className="icon-button settings-button"
            onClick={() => open('settings')}
            aria-label="Settings"
          >
            <Settings2 size={19} />
            <span>Settings</span>
          </button>
        </header>
      )}
      {!state && (
        <main className="main-menu">
          <div className="menu-copy">
            <p className="date-label">NORTH ATLANTIC · 14 APRIL 1912 · V11</p>
            <h1>
              TITANIC<span>THE CROSSING</span>
            </h1>
            <p className="menu-lead">Take your watch. Keep the crossing on course.</p>

            <div className="play-actions">
              <Button onClick={() => open('solo')}>
                <UserRound size={18} />
                Single player
                <ArrowRight size={17} />
              </Button>
              <Button secondary onClick={() => open('create')}>
                <Ship size={19} />
                Host multiplayer
                <ArrowRight size={18} />
              </Button>
              <Button secondary onClick={() => open('join')}>
                Join with a code
                <ChevronRight size={16} />
              </Button>
              <Button secondary onClick={() => open('demos')}>
                <FlaskConical size={18} />
                Job demos
                <ArrowRight size={17} />
              </Button>
            </div>
            <div className="menu-specs">
              <span>
                <Users size={14} />
                4–10 crew
              </span>
              <i />
              <span>
                <Compass size={14} />
                5–12 minute crossings
              </span>
              <i />
              <span>
                <Mic size={14} />
                Voice
              </span>
            </div>
          </div>

          <div className="menu-bottom">
            <Crest />
            <button className="text-button" onClick={() => open('help')}>
              <CircleHelp size={16} />
              Briefing <ArrowRight size={14} />
            </button>
          </div>
        </main>
      )}
      {state?.phase === 'lobby' && (
        <main className="lobby-layout">
          <section className="lobby-copy">
            <h2>Crew</h2>

            <div className="room-code">
              <span>ROOM CODE</span>
              <button onClick={() => void copy()} title="Copy invitation">
                <strong>{state.code}</strong>
                {copied ? <Check size={19} /> : <Copy size={19} />}
              </button>
              <small>{copied ? 'Copied' : ''}</small>
            </div>
            <div className="lobby-voice">
              <button
                className={cn('mic-toggle', voice.enabled && 'enabled')}
                onClick={() => void run(() => (voice.enabled ? voice.disable() : voice.enable()))}
              >
                {voice.enabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <div>
                <b>{voice.enabled ? 'Voice connected' : 'Check your microphone'}</b>
                <span>{voice.status}</span>
                <div className="mic-meter">
                  <i style={{ width: `${voice.level * 100}%` }} />
                </div>
              </div>
            </div>
            <span className="tiny-text">
              <kbd>V</kbd> · mic test
            </span>
          </section>
          <section className="manifest panel">
            <div className="panel-eyebrow">
              <span>CREW MANIFEST</span>
              <span>{state.players.filter((p) => p.connected).length} / 10 ABOARD</span>
            </div>

            <div className="crew-list">
              {state.players.map((p) => (
                <div className="crew-row" key={p.id}>
                  <span
                    className="crew-avatar"
                    style={{ '--crew': p.color } as React.CSSProperties}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <b>
                      {p.name}
                      {p.id === state.self.id && <small> YOU</small>}
                    </b>
                    <span>
                      {!p.connected ? 'Reconnecting…' : p.id === state.host ? 'Host' : 'Crew'}
                    </span>
                  </div>
                  <span className={cn('ready-badge', p.ready && 'yes')}>
                    {p.ready ? (
                      <>
                        <Check size={13} />
                        Ready
                      </>
                    ) : p.connected ? (
                      'Not ready'
                    ) : (
                      'Away'
                    )}
                  </span>
                </div>
              ))}
              {state.players.length < 4 && (
                <div className="empty-crew">
                  <Users size={18} />
                  <span>Waiting for {4 - state.players.length} more crew to begin.</span>
                </div>
              )}
            </div>
            <div className="lobby-controls">
              <Button
                secondary
                onClick={() => void run(() => network.request('room:ready', !me?.ready))}
              >
                {me?.ready ? (
                  <>
                    <Check size={17} />
                    Ready
                  </>
                ) : (
                  'Ready'
                )}
              </Button>
              {isHost && (
                <Button
                  disabled={
                    state.players.filter((p) => p.connected).length < 4 ||
                    state.players.some((p) => p.connected && !p.ready)
                  }
                  onClick={() =>
                    void run(() =>
                      network.request('room:start', {
                        fast,
                        difficulty,
                        alternativeWireless: alternative,
                      }),
                    )
                  }
                >
                  Cast off
                  <ArrowRight size={17} />
                </Button>
              )}
            </div>
            {isHost && (
              <label className="field">
                CROSSING
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                >
                  <option value="standard">Standard · first ice about 3–6 min</option>
                  <option value="experienced">Experienced · earlier ice</option>
                </select>
              </label>
            )}
            {isHost && state.players.length === 1 && (
              <button
                className="text-button practice-link"
                onClick={() =>
                  void run(() =>
                    network.request('room:start', { practice: true, fast, difficulty }),
                  )
                }
              >
                Single player <ArrowRight size={14} />
              </button>
            )}
            {network.devTools && isHost && (
              <label className="check-option">
                <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} />
                Development: shorter 65–90 second encounter
              </label>
            )}
            <div className="panel-footer">
              <ShieldCheck size={14} />
              <span>Watch assignments · issued at departure</span>
              <button onClick={() => void leave()}>Leave lobby</button>
            </div>
          </section>
        </main>
      )}
      {inGame && (
        <>
          <header className="game-header">
            <div>
              <Anchor size={19} />
              <b>TITANIC</b>
            </div>
          </header>
          {['voyage', 'sinking'].includes(state.phase) && !evacuated && locked && (
            <div className="key-ribbon">
              <span>
                <kbd>Esc</kbd>Menu
              </span>
              <span>
                <kbd>Tab</kbd>Notes
              </span>
              <span>
                <kbd>V</kbd>Talk
              </span>
              {state.practice && (
                <span>
                  <kbd>P</kbd>Test
                </span>
              )}
            </div>
          )}
          {['voyage', 'sinking'].includes(state.phase) && (
            <>
              {state.practice && (
                <div className="practice-state">
                  <span className="small-dot" />
                  {state.practiceSettings?.paused ? 'CLOCK HELD' : 'LIVE VOYAGE'}
                  <kbd>P</kbd>
                </div>
              )}
              {state.demo && !intro && (
                <div className="demo-hud" role="status">
                  <b>
                    {state.demo.title} demo {state.demo.complete && <span>· Complete</span>}
                  </b>
                  <p>
                    {state.demo.complete
                      ? 'Try again or choose another job.'
                      : state.demo.objective}
                  </p>
                  <small>
                    <kbd>R</kbd> Retry <kbd>P</kbd> Jobs
                    {state.practiceSettings?.paused && ' · Voyage clock held'}
                  </small>
                </div>
              )}
              {(me?.level === 1 || (me?.level === 0 && me.z < -16.3)) && (
                <div className="bearing-hud">
                  HORIZON ·{' '}
                  {((state.ship.heading + (me.yaw * 180) / Math.PI + 360) % 360).toFixed(0)}° ·{' '}
                  {state.ship.weather}
                  {me?.level === 1 && ' · L Sighting log'}
                </div>
              )}
              <div className={cn('crosshair', nearest && 'interactable')} />
              {locked && (nearest || boilerPrompt) && (
                <div className="interaction-prompt">
                  <kbd>E</kbd>
                  <div>
                    <b>
                      {boilerPrompt ||
                        (nearest?.kind === 'boiler' ? 'Boiler guide · B' : nearest?.name)}
                    </b>
                  </div>
                </div>
              )}
              {locked && me?.level === -1 && me.z < -6 && (
                <div className={cn('firing-tool-hud', !!state.demo && 'with-demo')}>
                  {state.self.inventory.includes('Firing tool:coal')
                    ? `Shovel · ${state.self.inventory.includes('Coal load') ? 'loaded' : 'empty'}`
                    : state.self.inventory.includes('Firing tool:slice')
                      ? 'Slice bar'
                      : state.self.inventory.includes('Firing tool:rake')
                        ? 'Ash rake'
                        : 'Take a tool from the boiler rack'}
                  <span>
                    <kbd>B</kbd> Guide
                  </span>
                </div>
              )}

              <div className={notice ? 'voyage-notice' : 'voyage-notice hidden'}>
                <span className="small-dot" />
                {notice}
              </div>
              {me?.job && !modal && (
                <div className="task-progress">
                  <div>
                    <Wrench size={16} />
                    <span>
                      {me.job.kind === 'maintenance'
                        ? 'Working on equipment'
                        : me.job.kind === 'travel'
                          ? (STATIONS.find((s) => s.id === me.job!.station)?.name ??
                            'Changing decks')
                          : `${me.job.kind} in progress`}
                    </span>
                    <b>{Math.ceil(me.job.duration - me.job.elapsed)}s</b>
                  </div>
                  <progress value={me.job.elapsed} max={me.job.duration} />
                  <span className="cancel-key">
                    <kbd>X</kbd> Cancel
                  </span>
                </div>
              )}
            </>
          )}
          <div
            className="voice-hud"
            aria-label={voice.enabled ? 'Microphone ready' : 'Microphone off · enable in menu'}
          >
            {voice.enabled ? <Mic size={17} /> : <MicOff size={17} />}
            <kbd>V</kbd>
            {voice.talking && (
              <span>
                {state.self.audience
                  .map((id) => state.players.find((p) => p.id === id)?.name)
                  .join(', ')}
              </span>
            )}
          </div>
        </>
      )}
      {inGame && modal === 'pause' && !intro && (
        <ShipMenu
          role={state.self.role ?? 'Crew'}
          area={evacuated ? 'Lifeboat' : me ? areaName(me) : 'Aboard'}
          practice={state.practice}
          mic={voice.enabled}
          job={!!me?.job}
          resume={resume}
          open={openMenuPage}
          toggleMic={() => void run(() => (voice.enabled ? voice.disable() : voice.enable()))}
          cancel={() => {
            if (me?.job) void act({ station: me.job.station, verb: 'cancel' });
          }}
          leave={() => void leave()}
        />
      )}
      {intro && state && (
        <div className="modal-backdrop">
          <section
            className={cn('modal-card', 'role-card', state.self.saboteur && 'traveler-card')}
          >
            <div className="role-icon">
              {state.self.role?.includes('Lookout') ? (
                <Telescope size={38} />
              ) : state.self.saboteur ? (
                <LockKeyhole size={38} />
              ) : (
                <Compass size={38} />
              )}
            </div>
            <h2>{state.self.role}</h2>
            <p>{ROLE_INFO[state.self.role!]?.duty}</p>
            <div className="assignment-detail">
              <span>REPORT TO</span>
              <strong>{ROLE_INFO[state.self.role!]?.area}</strong>
            </div>
            {state.self.saboteur ? (
              <div className="secret-box">
                <b>Private orders</b>
                <p>
                  You are a time traveler. Titanic must sink to preserve history. Keep your role
                  secret. Cause the disaster without getting caught. You have{' '}
                  {BALANCE.sabotageCharges} tools. A recalled crossing will also prompt an inquiry.
                </p>
              </div>
            ) : (
              <></>
            )}

            {firstWatch && (
              <div className="first-watch">
                <div className="briefing-flow compact">
                  <span>Bridge</span>
                  <ArrowRight />
                  <span>Engines</span>
                  <ArrowRight />
                  <span>Boilers</span>
                </div>
                <div className="briefing-channels">
                  <span>
                    <kbd>V</kbd>Nearby voice
                  </span>
                  <span>
                    <AudioLines size={15} />
                    Phones link decks
                  </span>
                  <span>
                    <Clipboard size={15} />
                    Telegrams → bridge
                  </span>
                </div>
                <p>
                  {state.practice
                    ? 'P · Jobs and test controls.'
                    : 'Hold the westbound course. Pass orders between departments and keep a lookout.'}
                </p>
                <div className="handbook-controls">
                  {[
                    ['WASD', 'Move'],
                    ['Mouse', 'Look'],
                    ['Shift', 'Sprint'],
                    ['E', 'Use'],
                    ['RMB', 'Zoom'],
                    ['V', 'Talk'],
                    ['Tab', 'Notes'],
                    ['Esc', 'Menu'],
                  ].map(([key, label]) => (
                    <span key={key}>
                      <kbd>{key}</kbd>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <Button
              onClick={() => {
                localStorage.setItem('titanic-briefed-v2', '1');
                setFirstWatch(false);
                setModal(null);
                setIntro(false);
                world.current?.enter();
              }}
            >
              Aboard
              <ArrowRight size={17} />
            </Button>
          </section>
        </div>
      )}
      {state?.phase === 'voyage' && !intro && (!modal || !state.practiceSettings?.paused) && (
        <NavigationWarnings state={state} />
      )}
      {state?.phase === 'sinking' &&
        state.sinkingElapsed !== null &&
        state.sinkingElapsed >= BALANCE.abandonDelay && (
          <div className="evacuation-call">
            <Anchor size={17} />
            <strong>{evacuated ? 'In the lifeboat' : 'Get to the lifeboats'}</strong>
            <span>
              {time(Math.ceil(Math.max(0, BALANCE.evacuationSeconds - state.sinkingElapsed)))}
            </span>
          </div>
        )}
      {state && ['lifeboat', 'inquiry'].includes(state.phase) && (
        <section className="lifeboat-panel panel">
          <div className="panel-eyebrow">
            <span>
              {state.phase === 'inquiry'
                ? 'COMPANY INQUIRY'
                : state.practice
                  ? 'LIFEBOAT TEST'
                  : 'VOTE'}
            </span>
            <span>{time(state.phaseRemaining ?? 0)} REMAINING</span>
          </div>
          <h2>
            {state.phase === 'inquiry'
              ? 'The crew is suspended.'
              : state.practice
                ? 'Lifeboat'
                : 'Who do you suspect?'}
          </h2>
          {(!state.practice || state.phase === 'inquiry') && (
            <p>
              {state.inquiryCause === 'schedule'
                ? 'The company recalled the crossing for excessive delay. Was someone deliberately holding the ship back?'
                : state.inquiryCause === 'route'
                  ? 'The company recalled the crossing for leaving the route. Did someone deliberately lead you off course?'
                  : 'Some of the damage looks deliberate.'}{' '}
              Discuss what you saw, then choose one crewmate.
            </p>
          )}
          <div className="vote-list">
            {state.practice ? (
              <Button onClick={() => void run(() => network.request('vote', state.self.id))}>
                Finish test
                <Check size={16} />
              </Button>
            ) : (
              state.players.map((p) => (
                <button
                  className={cn('vote-person', state.votes[state.self.id] === p.id && 'selected')}
                  key={p.id}
                  onClick={() => void run(() => network.request('vote', p.id))}
                >
                  <span className="small-dot" style={{ background: p.color }} />
                  <b>{p.name}</b>
                  <span>{Object.values(state.votes).filter((id) => id === p.id).length} votes</span>
                  {state.votes[state.self.id] === p.id ? (
                    <Check size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              ))
            )}
          </div>
          <small>{state.practice ? '' : 'Majority vote'}</small>
        </section>
      )}
      {state?.phase === 'ended' && state.result && (
        <main className="result-layout">
          <section className="result-copy">
            <h2>{state.result.title}</h2>
            <p>{state.result.description}</p>
            <div className="outcome-seal">
              <Anchor size={22} />
              <span>
                {state.practice
                  ? 'SINGLE-PLAYER TEST'
                  : state.result.outcome === 'crew'
                    ? 'THE CREW WINS'
                    : state.result.outcome === 'draw'
                      ? 'NOBODY WINS'
                      : state.result.outcome === 'dismissed'
                        ? 'VOYAGE FAILED'
                        : 'THE TIME TRAVELER WINS'}
              </span>
            </div>
            <div className="result-actions">
              {isHost ? (
                <Button
                  onClick={() =>
                    void run(() =>
                      network.request(
                        state.practice ? 'practice' : 'room:return',
                        state.practice ? { verb: 'restart' } : null,
                      ),
                    )
                  }
                >
                  {state.practice ? 'Restart single player' : 'Another crossing'}
                  <ArrowRight size={17} />
                </Button>
              ) : (
                <span>Waiting for the host to return to the lobby.</span>
              )}
              <Button secondary onClick={() => void leave()}>
                Leave ship
              </Button>
            </div>
          </section>
          <section className="result-report panel">
            <div className="panel-eyebrow">
              <span>THE SHIP’S INQUIRY</span>
              <span>SEED {state.result.seed}</span>
            </div>
            <h3>{state.result.revealed ? 'The inquiry' : 'Crew manifest'}</h3>
            {state.result.roles.map((p) => (
              <div className={cn('reveal-row', p.saboteur && 'is-traveler')} key={p.id}>
                <span>{p.saboteur ? <LockKeyhole size={18} /> : <ShieldCheck size={18} />}</span>
                <div>
                  <b>{p.name}</b>
                  <small>{p.role}</small>
                </div>
                <strong>
                  {state.result!.revealed ? (p.saboteur ? 'TIME TRAVELER' : 'CREW') : ''}
                </strong>
              </div>
            ))}
            <h4>Voyage record</h4>
            <div className="event-log">
              {state.result.events.map((event, i) => (
                <p key={i}>
                  <time>{time(event.at)}</time>
                  <span>{event.text}</span>
                </p>
              ))}
            </div>
          </section>
        </main>
      )}
      {modal && modal !== 'pause' && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <section
            className={cn(
              'modal-card',
              modal === 'help' && 'wide',
              actionPanel && 'station-card',
              modal === 'notebook' && 'wide',
              (modal === 'demos' || modal === 'practice') && 'demo-modal',
            )}
            role="dialog"
            aria-modal="true"
            aria-label={modal === 'station' ? station?.name : modal}
          >
            <button className="modal-close" onClick={close} aria-label="Close">
              <X size={21} />
            </button>
            {modal === 'solo' && (
              <form onSubmit={startSolo}>
                <h2>Single player</h2>

                <label className="field">
                  YOUR NAME
                  <input
                    autoFocus
                    maxLength={20}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Test Captain"
                  />
                </label>
                <label className="field">
                  STARTING ASSIGNMENT
                  <select value={soloPost} onChange={(e) => setSoloPost(e.target.value as Role)}>
                    {ROLE_ORDER.filter((role) => !role.startsWith('Second')).map((role) => (
                      <option key={role} value={role}>
                        {role} · {ROLE_INFO[role].area}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  CROSSING
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                  >
                    <option value="standard">Standard · first ice about 3–6 min</option>
                    <option value="experienced">Experienced · earlier ice</option>
                  </select>
                </label>
                <Button type="submit" disabled={busy || !!webglError}>
                  {busy ? <LoaderCircle size={18} className="spin" /> : <UserRound size={18} />}{' '}
                  {busy ? 'Starting…' : 'Start single player'}
                  <ArrowRight size={17} />
                </Button>
              </form>
            )}
            {modal === 'demos' && (
              <>
                <div className="eyebrow">SINGLE PLAYER</div>
                <h2>Choose a watch</h2>
                <JobDemos disabled={busy} choose={(id) => void startDemo(id)} />
              </>
            )}
            {modal === 'practice' && state?.practice && (
              <PracticePanel
                state={state}
                command={(action) =>
                  run(async () => {
                    await network.request('practice', action);
                    if (
                      ['ice', 'sinking', 'schedule', 'route', 'demo', 'restart'].includes(
                        action.verb,
                      )
                    ) {
                      returnToMenu.current = false;
                      close();
                    }
                  })
                }
                travel={(station) =>
                  run(async () => {
                    await network.request('practice', { verb: 'travel', value: station });
                    close();
                  })
                }
              />
            )}
            {(modal === 'create' || modal === 'join') && (
              <form onSubmit={join}>
                <h2>{modal === 'create' ? 'Gather your crew.' : 'Welcome aboard.'}</h2>
                <label className="field">
                  CREW NAME
                  <input
                    autoFocus
                    maxLength={20}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What should the crew call you?"
                    autoComplete="nickname"
                  />
                </label>
                {modal === 'join' && (
                  <label className="field">
                    ROOM CODE
                    <input
                      className="code-input"
                      maxLength={6}
                      minLength={6}
                      required
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                      }
                      placeholder="ABC123"
                    />
                  </label>
                )}

                <Button type="submit" disabled={busy || !!webglError}>
                  {busy ? <LoaderCircle className="spin" size={18} /> : <Ship size={18} />}{' '}
                  {busy
                    ? 'Connecting…'
                    : modal === 'create'
                      ? 'Create private lobby'
                      : 'Join the crew'}
                  <ArrowRight size={17} />
                </Button>
              </form>
            )}
            {modal === 'settings' && (
              <>
                <h2>Settings</h2>
                <label className="field">
                  GAME SERVER ADDRESS
                  <input
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    onBlur={() => localStorage.setItem('titanic-server', server)}
                    placeholder="https://titanic.your-domain.com"
                  />
                </label>
                <p className="setting-note">
                  For local play: http://localhost:3001. For friends on other computers, use a
                  publicly hosted server with HTTPS.
                </p>
                <label className="range-setting">
                  <span>
                    <Volume2 size={17} />
                    Ship ambience<b>{Math.round(volume * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                  />
                </label>
                <label className="range-setting">
                  <span>
                    <Headphones size={17} />
                    Crew voice<b>{Math.round(voice.volume * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step=".05"
                    defaultValue={voice.volume}
                    onChange={(e) => {
                      voice.volume = Number(e.target.value);
                      setVoiceTick((t) => t + 1);
                    }}
                  />
                </label>
                <label className="range-setting">
                  <span>
                    Mouse sensitivity<b>{sensitivity.toFixed(1)}×</b>
                  </span>
                  <input
                    type="range"
                    min=".3"
                    max="2.5"
                    step=".1"
                    value={sensitivity}
                    onChange={(e) => setSensitivity(Number(e.target.value))}
                  />
                </label>
                <label className="field inline-field">
                  GRAPHICS
                  <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                    <option value="high">Cinematic · shadows & lamp glow</option>
                    <option value="low">Performance · shadows off</option>
                  </select>
                </label>
                <div className="mic-setting">
                  <Button
                    secondary
                    onClick={() =>
                      void run(() => (voice.enabled ? voice.disable() : voice.enable()))
                    }
                  >
                    {voice.enabled ? <Mic size={18} /> : <MicOff size={18} />}{' '}
                    {voice.enabled ? 'Disable microphone' : 'Enable & test microphone'}
                  </Button>
                  <p>{voice.status}</p>
                  <div className="mic-meter">
                    <i style={{ width: `${voice.level * 100}%` }} />
                  </div>
                  <small>Hold V to test.</small>
                </div>
                <Button onClick={close}>
                  {returnToMenu.current ? 'Ship menu' : state ? 'Back aboard' : 'Back'}
                  <ArrowRight size={17} />
                </Button>
                {state && (
                  <button className="text-button leave-ship" onClick={() => void leave()}>
                    <DoorOpen size={14} />
                    Leave this voyage
                  </button>
                )}
              </>
            )}
            {modal === 'help' && <Handbook />}
            {modal === 'notebook' && state && (
              <>
                <h2>Notebook</h2>
                <div className="notebook-grid">
                  <div>
                    <h4>{state.self.role}</h4>
                    <p>{ROLE_INFO[state.self.role!]?.duty ?? 'Prepare for departure.'}</p>
                    <p className="role-tip">{ROLE_INFO[state.self.role!]?.tip}</p>
                    <h4>Your pockets</h4>
                    <p>
                      {state.self.inventory
                        .map((item) =>
                          item.startsWith('Telegram:') ? 'A transcribed telegram' : item,
                        )
                        .join(' · ') || '—'}
                    </p>
                    <h4>Personal observations</h4>
                    <div className="notes-list">
                      {state.self.notes.length ? (
                        state.self.notes.map((note, i) => <p key={i}>{note}</p>)
                      ) : (
                        <p>—</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <ShipMap state={state} />
                  </div>
                </div>
              </>
            )}
            {actionPanel && (
              <StationPanel
                key={station.id}
                station={station}
                state={state}
                act={act}
                close={close}
              />
            )}
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
          </section>
        </div>
      )}
      {lineNotice && inGame && (
        <div className="line-notice" role="status">
          <b>{lineNotice.from} · telephone</b>
          <p>{lineNotice.text}</p>
        </div>
      )}
      {error && !modal && (
        <div className="toast" role="alert">
          <span>{error}</span>
          {!locked && (
            <button onClick={() => setError('')} aria-label="Dismiss">
              <X size={16} />
            </button>
          )}
        </div>
      )}
      {webglError && (
        <div className="toast critical">
          <span>{webglError}</span>
        </div>
      )}
      {state && !connected && (
        <div className="connection-banner">
          <LoaderCircle size={16} className="spin" />
          Connection interrupted. Reconnecting to your crew…
        </div>
      )}
    </>
  );
}

function NavigationWarnings({ state }: { state: Snapshot }) {
  const n = navigationWarnings(state.ship);
  if (state.practiceSettings?.paused)
    return (
      <div className="navigation-warnings held-clock" role="status">
        <div>
          Voyage clock held<small>Schedule checks paused · resume in P</small>
        </div>
      </div>
    );
  if (state.ship.speed < 0.5 && state.ship.delay < BALANCE.scheduleWarning)
    return (
      <div className="navigation-warnings" role="status">
        <div>
          <Compass size={15} />
          <span>
            Ship stopped
            <small>
              Schedule warning in {time(Math.ceil(BALANCE.scheduleWarning - state.ship.delay))}
            </small>
          </span>
        </div>
      </div>
    );
  if (!n.schedule && !n.route) return null;
  return (
    <div className="navigation-warnings" role="status">
      {n.schedule && (
        <div className={n.schedule}>
          <Compass size={15} />
          <span>
            Schedule +{time(Math.floor(state.ship.delay))}
            <small>Recall in {time(Math.ceil(n.scheduleRemaining))}</small>
          </span>
        </div>
      )}
      {n.route && (
        <div className={n.route}>
          <Compass size={15} />
          <span>
            {nm(state.ship.north)} off track
            <small>
              {n.route === 'urgent'
                ? 'Return within ' + time(Math.ceil(n.routeRemaining))
                : 'Route boundary ahead'}
            </small>
          </span>
        </div>
      )}
    </div>
  );
}

function ShipMap({ state }: { state: Snapshot }) {
  const me = state.players.find((p) => p.id === state.self.id)!,
    level = me.level;
  const title =
    level === -2
      ? 'A DECK'
      : level === -1
        ? 'MACHINERY'
        : level === 1
          ? 'FOREMAST'
          : level === 2
            ? 'WELL DECKS'
            : 'BOAT DECK';
  const x = (v: number) => 120 + v * 5.5,
    z = (v: number) => 195 + v * 4.5;
  const labels =
    level === 0
      ? [
          ['BRIDGE', 0, -19],
          ['CHART', 0, -15.8],
          ['WIRELESS', -2.6, -8],
          ['OFFICERS', 3.8, -12],
          ['↓ FIRST CLASS', 0, -4.8],
          ['↓ ENGINES', -4, 8.9],
          ['↓ AFT ENTRANCE', 0, 15.5],
        ]
      : level === -2
        ? [
            ['LOUNGE', 0, 4],
            ['CABINS', 0, -14],
            ['DINING', 0, 17],
            ['PROMENADE', -8, 0],
          ]
        : level === -1
          ? [
              ['BOILERS', 0, -10.6],
              ['ENGINES', 0, 19],
              ['↑ BOAT DECK', -4.75, 6.35],
            ]
          : [
              ['LOOKOUT', 0, -31],
              ['FORECASTLE', 0, -34],
              ['AFT WELL', 0, 31],
            ];
  return (
    <div className="ship-map">
      <div className="panel-eyebrow">
        <span>{title}</span>
        <Compass size={14} />
      </div>
      <svg viewBox="0 0 240 390" role="img" aria-label={title + ' plan and your position'}>
        <polygon
          points={HULL_OUTLINE.map((p) => x(p.x) + ',' + z(p.z)).join(' ')}
          fill="#283c42"
          stroke="#8b957e"
          strokeWidth="1.5"
        />
        {WALLS.filter((w) => w.level === level).map((w, i) => (
          <rect
            key={i}
            x={x(w.x - w.w / 2)}
            y={z(w.z - w.d / 2)}
            width={w.w * 5.5}
            height={Math.max(0.8, w.d * 4.5)}
            fill={w.prop ? '#667164' : '#bcaf86'}
            opacity={w.prop ? 0.5 : 0.9}
          />
        ))}
        <g fill="#ded0ac" fontSize="9" textAnchor="middle" fontFamily="monospace">
          {labels.map(([label, px, pz]) => (
            <text key={label} x={x(Number(px))} y={z(Number(pz))}>
              {label}
            </text>
          ))}
          <text x="120" y="10">
            BOW ↑
          </text>
        </g>
        {STATIONS.filter((s) => s.level === level && s.kind === 'ladder').map((s) => (
          <circle key={s.id} cx={x(s.x)} cy={z(s.z)} r="3.5" fill="none" stroke="#d9ba77" />
        ))}
        <circle cx={x(me.x)} cy={z(me.z)} r="5" fill="#ead09a" stroke="#172d35" strokeWidth="2" />
      </svg>
      <small>● YOU</small>
    </div>
  );
}

function StationPanel({
  station: s,
  state,
  act,
  close,
}: {
  station: Station;
  state: Snapshot;
  act: (a: Action) => Promise<void>;
  close: () => void;
}) {
  const [setting, setSetting] = useState(
    s.kind === 'engine'
      ? state.ship.throttle
      : s.kind === 'telegraph'
        ? state.ship.order
        : s.kind === 'boiler'
          ? (state.ship.fires[boilerIndex(s.id)] ?? 0.67)
          : state.ship.rudderTarget,
  );
  const machine = s.machine ? state.machines.find((m) => m.id === s.machine) : null,
    me = state.players.find((p) => p.id === state.self.id)!;
  const send = (verb: string, value?: unknown) => act({ station: s.id, verb, value });
  const Equipment = 'details';
  const unavailable =
    Math.min(
      distance(me, s),
      s.kind === 'boiler' ? distance(me, { ...s, z: s.z - 6.4 / SHIP_LENGTH_SCALE }) : Infinity,
    ) > BALANCE.interactDistance;
  return (
    <>
      <div className="eyebrow">
        {s.kind === 'phone' ? (
          <AudioLines size={15} />
        ) : s.kind === 'wireless' ? (
          <Radio size={15} />
        ) : (
          <Gauge size={15} />
        )}{' '}
        {areaName(s).toUpperCase()}
      </div>
      <h2>{s.name}</h2>
      {unavailable ? (
        <p>Out of reach.</p>
      ) : (
        <>
          {s.kind === 'command' && <CommandPanel state={state} act={act} />}
          {s.kind === 'wheel' && (
            <>
              <div className="heading-order">
                <span>
                  Ordered heading <b>{state.command.heading}°</b>
                </span>
                <button onClick={() => void send('acknowledge')}>
                  {state.command.acknowledgedBy
                    ? 'Read back by ' + state.command.acknowledgedBy
                    : 'Read back heading'}
                </button>
              </div>
              <div className="instrument-row">
                <Instrument label="COMPASS" value={`${state.ship.indicatedHeading.toFixed(0)}°`} />
                <Instrument label="RUDDER" value={`${(state.ship.rudder * 35).toFixed(0)}°`} />
                <Instrument label="SPEED" value={`${state.ship.speed.toFixed(1)} kn`} />
              </div>
              <label className="range-setting">
                <span>
                  PORT <b>HELM</b> STARBOARD
                </span>
                <input
                  aria-label="Rudder target"
                  type="range"
                  min="-1"
                  max="1"
                  step=".1"
                  value={setting}
                  onChange={(e) => setSetting(Number(e.target.value))}
                />
              </label>
              <div className="station-buttons">
                <Button
                  secondary
                  onClick={() => {
                    setSetting(-1);
                    void send('rudder', -1);
                  }}
                >
                  <ArrowLeft size={16} />
                  Hard port
                </Button>
                <Button
                  secondary
                  onClick={() => {
                    setSetting(0);
                    void send('rudder', 0);
                  }}
                >
                  Midships
                </Button>
                <Button
                  secondary
                  onClick={() => {
                    setSetting(1);
                    void send('rudder', 1);
                  }}
                >
                  Hard starboard
                  <ArrowRight size={16} />
                </Button>
              </div>
              <Button onClick={() => void send('rudder', setting)}>
                Set wheel · {Math.round(setting * 35)}°
              </Button>
            </>
          )}
          {(s.kind === 'telegraph' || s.kind === 'engine') && (
            <>
              <div className="instrument-row">
                <Instrument label="BRIDGE ORDER" value={`${state.ship.order} kn`} />
                <Instrument label="SHIP SPEED" value={`${state.ship.speed.toFixed(1)} kn`} />
                <Instrument
                  label="STEAM"
                  value={`${steamPsi(state.ship.indicatedSteam).toFixed(0)} psi`}
                />
              </div>
              {s.kind === 'engine' && (
                <>
                  <div className="instrument-row">
                    <Instrument
                      label="APPLIED SETTING"
                      value={state.ship.throttle ? `${state.ship.throttle} kn` : 'Stop'}
                    />
                    <Instrument
                      label="ENGINE REVOLUTIONS"
                      value={`${state.ship.engineRevs.toFixed(0)} rpm`}
                    />
                  </div>
                  <Button
                    disabled={state.ship.throttle === state.ship.order}
                    onClick={() => void send('execute')}
                  >
                    {state.ship.throttle === state.ship.order
                      ? 'Answering'
                      : 'Execute bridge order'}{' '}
                    · {state.ship.order ? state.ship.order + ' kn' : 'Stop'}
                  </Button>
                  {state.practiceSettings?.assistance && (
                    <p className="station-hint">
                      Crew assistance answers engine orders.{' '}
                      <button
                        className="text-button"
                        onClick={() =>
                          void network.request('practice', { verb: 'assistance', value: false })
                        }
                      >
                        Take manual control
                      </button>
                    </p>
                  )}
                </>
              )}
              <label className="range-setting">
                <span>
                  {s.kind === 'telegraph' ? 'Desired speed' : 'Manual engine setting'}
                  <b>{setting.toFixed(0)} knots</b>
                </span>
                <input
                  aria-label="Engine speed"
                  type="range"
                  min="0"
                  max={BALANCE.maxKnots}
                  step="1"
                  value={setting}
                  onChange={(e) => setSetting(Number(e.target.value))}
                />
              </label>
              <div className="station-buttons">
                {[0, 10, 15, BALANCE.cruiseKnots, BALANCE.maxKnots].map((n) => (
                  <button
                    className={setting === n ? 'selected' : ''}
                    key={n}
                    onClick={() => setSetting(n)}
                  >
                    {n === 0 ? 'Stop' : `${n} kn`}
                  </button>
                ))}
              </div>
              <Button
                disabled={s.kind === 'engine' && !!state.practiceSettings?.assistance}
                onClick={() => void send(s.kind === 'telegraph' ? 'order' : 'throttle', setting)}
              >
                {s.kind === 'telegraph'
                  ? 'Ring engine order'
                  : `Apply manual setting · ${setting ? setting + ' kn' : 'Stop'}`}
                <Check size={16} />
              </Button>
            </>
          )}
          {s.kind === 'boiler' && (
            <>
              <p>
                Work on the boiler itself. Aim at a part and press <kbd>E</kbd>.
              </p>
              <div className="boiler-guide">
                <p>
                  <b>Fire:</b> take the shovel, fill it at the coal basket, open a thin fire and
                  place a load. Close its door.
                </p>
                <p>
                  <b>Grey clinker / ash:</b> take the slice bar for the open fire, or the rake for
                  its ashpan. Hold E to work.
                </p>
                <p>
                  <b>Draught = air:</b> E raises the lever; Shift E lowers it. Small changes, then
                  watch the gauge.
                </p>
                <p>
                  <b>190–215 psi:</b> each boiler has its own pressure. Too high? Reduce air and
                  stop adding coal. The easing handle releases steam briefly; the safety valve also
                  opens automatically.
                </p>
                <p>
                  <b>Steam stop wheel:</b> connects this boiler to the engines. Shutting it does not
                  cool the fire.
                </p>
              </div>
              <Button onClick={close}>Back to boiler</Button>
              <details className="machine-panel">
                <summary>Accessible firing controls</summary>
                <BoilerPanel state={state} station={s} act={act} />
              </details>
            </>
          )}
          {s.machine === 'valve' && (
            <>
              <p>Steam from the boilers passes through this valve to the engines.</p>
              <label className="range-setting">
                <span>
                  Main steam valve <b>{Math.round(state.ship.mainSteamValve * 100)}% open</b>
                </span>
                <input
                  aria-label="Main steam valve opening"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={state.ship.mainSteamValve}
                  onChange={(e) => void send('steam-valve', Number(e.target.value))}
                />
              </label>
              <Instrument
                label="ENGINE STEAM HEADER"
                value={`${steamPsi(state.ship.indicatedSteam).toFixed(0)} psi`}
              />
            </>
          )}
          {s.machine === 'gauge' && (
            <>
              <Instrument
                label="ENGINE STEAM HEADER"
                value={`${steamPsi(state.ship.indicatedSteam).toFixed(0)} psi`}
              />
              <p>
                This gauge measures pressure; it does not control it. Compare it with the four
                boiler gauges if its reading seems wrong.
              </p>
            </>
          )}
          {s.kind === 'chart' && (
            <>
              {state.self.inventory.some((i) => i.startsWith('Telegram:')) && (
                <Button onClick={() => void send('deliver')}>
                  <Clipboard size={16} />
                  File carried reports
                </Button>
              )}
              <NavigationChart state={state} act={act} />
            </>
          )}
          {s.kind === 'phone' && <TelephonePanel state={state} station={s} act={act} />}
          {s.kind === 'wireless' && <WirelessPanel state={state} station={s} act={act} />}
          {s.kind === 'cabinet' && <Cabinet state={state} send={send} />}
          {s.kind === 'ladder' && (
            <>
              <div className="telephone-status">
                <ArrowDown size={38} />
                <h3>
                  {s.destination?.level === 1
                    ? 'Crow’s nest'
                    : s.destination?.level === -1
                      ? 'Machinery deck'
                      : 'Boat deck'}
                </h3>
              </div>
              <Button
                disabled={!!me.job}
                onClick={() => {
                  void send('travel');
                }}
              >
                Use passage
                <ArrowRight size={17} />
              </Button>
            </>
          )}
          {s.kind === 'key' && (
            <>
              <Button onClick={() => void send('take')}>
                <KeyRound size={17} />
                Take key
              </Button>
            </>
          )}
          {s.kind === 'storage' && (
            <>
              <Button onClick={() => void send('note')}>
                <BookOpen size={17} />
                Read maintenance card
              </Button>
            </>
          )}
          {s.kind === 'bell' && (
            <>
              <ObservationPanel state={state} act={act} />
              <Button
                onClick={() => {
                  shipAudio.tone(760, 1.4, 0.7);
                  void send('ring');
                }}
              >
                Ring three bells
              </Button>
            </>
          )}
          {machine && (
            <Equipment open className="machine-panel">
              <summary>{machine.fault ? 'Equipment needs attention' : 'Equipment'}</summary>
              <div className="machine-status">
                <span className={cn('small-dot', !machine.fault && 'online')} />
                <b>{machine.fault ?? 'Operational'}</b>
                <span>{Math.round(machine.condition)}%</span>
              </div>
              <div className="station-buttons">
                <Button secondary disabled={!!me.job} onClick={() => void send('inspect')}>
                  Inspect · {workSeconds(state.self.role, 'inspect')}s
                </Button>
                <Button
                  secondary
                  disabled={!!me.job || !!machine.fault || machine.condition > 94}
                  onClick={() => void send('service')}
                >
                  Service · {state.self.role?.includes('Engineer') ? 12 : 35}s
                </Button>
                <Button
                  secondary
                  disabled={!!me.job || !machine.fault}
                  onClick={() => void send('repair')}
                >
                  Repair · {workSeconds(state.self.role, 'repair')}s
                </Button>
              </div>

              {(state.self.saboteur || (state.practice && state.practiceSettings?.tools)) && (
                <div className="tamper-section">
                  <div>
                    <LockKeyhole size={14} />
                    <span>{state.practice ? 'TEST TOOLS' : 'YOUR TOOLS'}</span>
                    <b>{state.self.sabotageCharges} left</b>
                  </div>
                  <Button
                    secondary
                    disabled={
                      !!me.job ||
                      !!machine.fault ||
                      state.self.sabotageReadyIn > 0 ||
                      state.self.sabotageCharges === 0
                    }
                    onClick={() => void send('sabotage')}
                  >
                    {state.self.sabotageReadyIn > 0
                      ? `Tools cooling · ${state.self.sabotageReadyIn}s`
                      : state.practice
                        ? 'Simulate fault · 8s'
                        : 'Tamper · 8s'}
                  </Button>
                </div>
              )}
            </Equipment>
          )}
        </>
      )}
      {me.job && (
        <div className="station-task">
          <span>Working · {Math.ceil(me.job.duration - me.job.elapsed)}s remaining</span>
          <progress value={me.job.elapsed} max={me.job.duration} />
          <button onClick={() => void send('cancel')}>Cancel</button>
        </div>
      )}
      <button className="text-button station-exit" onClick={close}>
        <ArrowLeft size={14} />
        Back
      </button>
    </>
  );
}
function Instrument({ label, value }: { label: string; value: string }) {
  return (
    <div className="instrument">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Handbook() {
  return (
    <>
      <h2>Briefing</h2>
      <p>Keep the ship on course and the machinery running.</p>
      <div className="briefing-flow">
        <span>
          Bridge
          <br />
          <small>Order &amp; steer</small>
        </span>
        <ArrowRight />
        <span>
          Engines
          <br />
          <small>Execute orders</small>
        </span>
        <ArrowRight />
        <span>
          Boilers
          <br />
          <small>Supply steam</small>
        </span>
      </div>
      <div className="handbook-grid">
        <article>
          <Mic />
          <h3>Voice</h3>
          <p>V speaks nearby. Fixed telephones link decks.</p>
        </article>
        <article>
          <Telescope />
          <h3>Lookout</h3>
          <p>
            Right mouse magnifies. Press L to log a bearing without turning away; report it by
            telephone.
          </p>
        </article>
        <article>
          <Radio />
          <h3>Wireless</h3>
          <p>Transcribe Morse; carry telegrams to the bridge.</p>
        </article>
        <article>
          <Wrench />
          <h3>Machinery</h3>
          <p>Inspect and repair. Ordinary failures happen too.</p>
        </article>
      </div>
      <div className="handbook-controls">
        {[
          ['WASD', 'Move'],
          ['Mouse', 'Look'],
          ['Shift', 'Sprint'],
          ['E', 'Use'],
          ['RMB', 'Zoom'],
          ['V', 'Talk'],
          ['Tab', 'Notes'],
          ['Esc', 'Menu'],
        ].map(([key, label]) => (
          <span key={key}>
            <kbd>{key}</kbd>
            {label}
          </span>
        ))}
      </div>
    </>
  );
}
