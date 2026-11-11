import { useRef, useState, useEffect } from 'react';
import type { Action, Snapshot, Station } from '../shared/types';
import { boilerIndex, steamPsi } from '../shared/plant';
import { firebed, type FiringTool } from '../shared/firing';
import { visibleClinker } from '../shared/boiler-controls';

type Drag = {
  tool: FiringTool;
  x: number;
  y: number;
  travel: number;
  work: number;
  zone: number | null;
};
const centers = [245, 425, 605],
  mouthY = 112;
const BASICS = [
  [
    'Steam',
    'Aim for 190–215 psi in this boiler. Its steam stop wheel connects it to the common engine supply.',
  ],
  [
    'Coal',
    'Thin fire? Open its round door, drag a small shovel load from COAL into it, then close the door.',
  ],
  [
    'Clear the airways',
    'Grey lumps: work the SLICE BAR across the open fire. Ash below the fire: pull the ASH RAKE through the pan.',
  ],
  [
    'Draught',
    'Draught is airflow. High pressure? Reduce air and stop adding coal. The safety valve releases excess steam; easing it is a temporary measure.',
  ],
];
export function BoilerPanel({
  state,
  station,
  act,
}: {
  state: Snapshot;
  station: Station;
  act: (a: Action) => Promise<void>;
}) {
  const bank = boilerIndex(station.id),
    svg = useRef<SVGSVGElement>(null),
    drag = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<Drag | null>(null),
    [help, setHelp] = useState(false),
    [hint, setHint] = useState(''),
    [selected, setSelected] = useState(0),
    [tool, setTool] = useState<FiringTool>('coal');
  const [draft, setDraft] = useState(state.ship.fires[bank]),
    draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lesson, setLesson] = useState<number | null>(() =>
    localStorage.getItem('titanic-boiler-basics') ? null : 0,
  );
  const finishBasics = () => {
    localStorage.setItem('titanic-boiler-basics', 'seen');
    setLesson(null);
  };
  const beds = [0, 1, 2].map((z) => firebed(state.ship, bank, z));
  useEffect(
    () => () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    },
    [],
  );
  const send = (verb: string, value: unknown) => act({ station: station.id, verb, value });
  const point = (e: React.PointerEvent) => {
    const b = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - b.left) * 750) / b.width, y: ((e.clientY - b.top) * 370) / b.height };
  };
  const begin = (e: React.PointerEvent, kind: FiringTool) => {
    e.preventDefault();
    svg.current?.setPointerCapture(e.pointerId);
    const p = point(e);
    drag.current = { tool: kind, ...p, travel: 0, work: 0, zone: null };
    setGhost({ ...drag.current });
    setHint('');
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e),
      dist = Math.hypot(p.x - d.x, p.y - d.y);
    const z = centers.findIndex(
      (x) =>
        Math.abs(p.x - x) < 62 &&
        Math.abs(p.y - (d.tool === 'rake' ? 219 : mouthY)) < (d.tool === 'rake' ? 30 : 57),
    );
    if (z >= 0) {
      d.zone = z;
      d.work += dist;
    }
    d.travel += dist;
    d.x = p.x;
    d.y = p.y;
    setGhost({ ...d });
  };
  const finish = () => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    if (
      d.zone === null ||
      d.travel < 65 ||
      (d.tool === 'coal' &&
        (Math.abs(d.x - centers[d.zone]) > 62 || Math.abs(d.y - mouthY) > 57)) ||
      (d.tool !== 'coal' && d.work < 30)
    ) {
      setHint('Work the tool across a firebed or ashpan.');
      return;
    }
    if (d.tool !== 'rake' && !beds[d.zone].open) {
      setHint('Open that fire door.');
      return;
    }
    setSelected(d.zone);
    setTool(d.tool);
    void send('tend', { zone: d.zone, tool: d.tool });
  };
  const door = (zone: number) => void send('door', { zone, open: !beds[zone].open });
  const changeDraft = (value: number) => {
    setDraft(value);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => void send('fire', value), 180);
  };
  return (
    <div className="firing-panel">
      <div className="firing-instruments">
        <div>
          <small>THIS BOILER</small>
          <b className={steamPsi(state.ship.boilerPressure[bank]) > 220 ? 'too-hot' : ''}>
            {steamPsi(state.ship.boilerPressure[bank]).toFixed(0)} <em>psi</em>
          </b>
          <span className="steam-band">
            <i
              style={{
                left: `${Math.min(100, (steamPsi(state.ship.boilerPressure[bank]) / 250) * 100)}%`,
              }}
            />
          </span>
        </div>
        <div>
          <small>ENGINE ORDER</small>
          <b>
            {state.ship.order}
            <em> kn</em>
          </b>
          <span>{state.ship.speed.toFixed(1)} kn making</span>
        </div>
        <div>
          <small>FIRE</small>
          <b>
            {Math.round(state.ship.fireHeat[bank] * 100)}
            <em>%</em>
          </b>
          <span>
            {state.ship.safetyLifted[bank]
              ? 'Safety valve lifting'
              : state.ship.fireDoors[bank].filter(Boolean).length > 1
                ? 'Draught escaping'
                : 'Firing naturally'}
          </span>
        </div>
      </div>
      {lesson !== null && (
        <div className="boiler-basics" role="note" aria-label="Boiler basics">
          <div>
            <small>
              {lesson + 1} / {BASICS.length} · {BASICS[lesson][0]}
            </small>
            <p>{BASICS[lesson][1]}</p>
          </div>
          <button
            onClick={() => (lesson === BASICS.length - 1 ? finishBasics() : setLesson(lesson + 1))}
          >
            {lesson === BASICS.length - 1 ? 'Got it' : 'Next'}
          </button>
          <button className="basics-skip" onClick={finishBasics}>
            Skip
          </button>
        </div>
      )}
      <svg
        ref={svg}
        className="firing-floor"
        viewBox="0 0 750 370"
        role="group"
        aria-label="Boiler firing floor"
        tabIndex={0}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => {
          drag.current = null;
          setGhost(null);
        }}
        onKeyDown={(e) => {
          if (['1', '2', '3'].includes(e.key)) setSelected(Number(e.key) - 1);
          if (e.key.toLowerCase() === 'c') setTool('coal');
          if (e.key.toLowerCase() === 's') setTool('slice');
          if (e.key.toLowerCase() === 'r') setTool('rake');
          if (e.key.toLowerCase() === 'o') door(selected);
          if (e.key === 'Enter') {
            e.preventDefault();
            void send('tend', { zone: selected, tool });
          }
        }}
      >
        <defs>
          <radialGradient id="ember">
            <stop stopColor="#ffe080" />
            <stop offset=".4" stopColor="#dc641c" />
            <stop offset="1" stopColor="#351a10" />
          </radialGradient>
          <linearGradient id="iron">
            <stop stopColor="#4a4f47" />
            <stop offset=".5" stopColor="#242a26" />
            <stop offset="1" stopColor="#151d1c" />
          </linearGradient>
        </defs>
        <rect
          x="153"
          y="16"
          width="572"
          height="249"
          rx="18"
          fill="url(#iron)"
          stroke="#6d705e"
          strokeWidth="3"
        />
        {Array.from({ length: 20 }, (_, i) => (
          <circle key={i} cx={170 + i * 28} cy={29} r="3" fill="#8b8469" />
        ))}
        <g
          role="button"
          aria-label="Coal bunker — drag a shovel load"
          tabIndex={0}
          onPointerDown={(e) => begin(e, 'coal')}
        >
          <path d="M14 58L128 58L135 218L7 218Z" fill="#202521" stroke="#797562" strokeWidth="3" />
          {Array.from({ length: 35 }, (_, i) => (
            <path
              key={i}
              d={`M${15 + ((i * 23) % 102)} ${95 + ((i * 17) % 110)}l12 -7l11 9l-8 13l-17 -4Z`}
              fill={i % 3 === 0 ? '#3d433a' : '#111a18'}
              stroke="#505144"
            />
          ))}
          <path d="M49 190l27 -15l23 14l-5 24H58Z" fill="#717362" />
          <path d="M77 184L101 69" stroke="#9b7850" strokeWidth="8" />
          <text x="70" y="242" textAnchor="middle">
            COAL
          </text>
        </g>
        {beds.map((b, z) => {
          const x = centers[z],
            glow = 0.3 + state.ship.fireHeat[bank] * 0.7;
          return (
            <g key={z}>
              <circle
                cx={x}
                cy={mouthY}
                r="65"
                fill="#101713"
                stroke={selected === z ? '#c8ac70' : '#6e6b58'}
                strokeWidth="4"
              />
              <circle cx={x} cy={mouthY} r="55" fill="url(#ember)" opacity={glow} />
              {Array.from({ length: 18 }, (_, i) => {
                const yy = 145 - ((i * 13) % Math.max(10, 60 * b.coal));
                return (
                  <path
                    key={i}
                    d={`M${x - 49 + ((i * 19) % 88)} ${yy}l10 -6l10 6l-3 9l-14 2Z`}
                    fill={b.coal > 0.78 ? '#181b18' : '#3e2317'}
                    stroke="#a8521c"
                    strokeWidth=".8"
                  />
                );
              })}
              {Array.from({ length: visibleClinker(b.clinker) }, (_, i) => (
                <ellipse
                  key={i}
                  cx={x - 41 + ((i * 17) % 80)}
                  cy={112 + ((i * 11) % 30)}
                  rx="10"
                  ry="5"
                  fill="#77786a"
                  stroke="#bbb49b"
                />
              ))}
              <rect
                x={x - 49}
                y={198}
                width="98"
                height="38"
                rx="3"
                fill="#121b18"
                stroke="#717365"
              />
              <rect x={x - 40} y="182" width="80" height="5" fill="#101713" />
              <rect
                x={x - 40}
                y="182"
                width={80 * b.coal}
                height="5"
                fill={b.coal < 0.32 || b.coal > 0.78 ? '#b59359' : '#8e9b72'}
              />
              <text x={x} y="265" textAnchor="middle" className="firebed-state">
                {b.coal < 0.32 ? 'THIN' : b.coal > 0.78 ? 'HEAPED' : 'EVEN'}
              </text>
              <rect
                x={x - 46}
                y={233 - b.ash * 29}
                width="92"
                height={b.ash * 29}
                fill="#77786b"
                opacity=".9"
              />
              <path d={`M${x - 52} 242h104`} stroke="#a49c7a" strokeWidth="4" />
              <g
                role="button"
                aria-label={`${b.open ? 'Close' : 'Open'} furnace ${z + 1}`}
                tabIndex={0}
                onClick={() => door(z)}
                onKeyDown={(e) => {
                  if (e.key === ' ') {
                    e.preventDefault();
                    door(z);
                  }
                }}
              >
                {!b.open ? (
                  <>
                    <circle
                      cx={x}
                      cy={mouthY}
                      r="56"
                      fill="#2a302a"
                      stroke="#84816b"
                      strokeWidth="3"
                    />
                    <rect
                      x={x - 21}
                      y="87"
                      width="42"
                      height="31"
                      rx="8"
                      fill="url(#ember)"
                      opacity={glow}
                    />
                    <path
                      d={`M${x - 22} 98h44M${x - 22} 108h44`}
                      stroke="#232c25"
                      strokeWidth="4"
                    />
                    <path d={`M${x + 22} 129l25 -6`} stroke="#aaa083" strokeWidth="6" />
                  </>
                ) : (
                  <>
                    <path
                      d={`M${x - 64} 62l-27 15v86l27 -7Z`}
                      fill="#3c4135"
                      stroke="#9c9170"
                      strokeWidth="2"
                    />
                    <path d={`M${x - 65} 90v32`} stroke="#c2af79" strokeWidth="5" />
                  </>
                )}
              </g>
              <text x={x} y="283" textAnchor="middle">
                FIRE {z + 1}
              </text>
            </g>
          );
        })}
        <g
          role="button"
          aria-label="Slice bar — work across clinker"
          tabIndex={0}
          onPointerDown={(e) => begin(e, 'slice')}
        >
          <rect x="160" y="303" width="235" height="48" rx="4" fill="#172521" stroke="#5d695b" />
          <path d="M180 329h174l23 -9" stroke="#aaa58a" strokeWidth="6" />
          <text x="278" y="365" textAnchor="middle">
            SLICE BAR
          </text>
        </g>
        <g
          role="button"
          aria-label="Ash rake — pull through an ashpan"
          tabIndex={0}
          onPointerDown={(e) => begin(e, 'rake')}
        >
          <rect x="416" y="303" width="300" height="48" rx="4" fill="#172521" stroke="#5d695b" />
          <path d="M440 329h210v-13m-5 0v15m-8 -15v15" stroke="#a59d7c" strokeWidth="6" />
          <text x="568" y="365" textAnchor="middle">
            ASH RAKE
          </text>
        </g>
        {ghost && (
          <g pointerEvents="none" transform={`translate(${ghost.x},${ghost.y}) rotate(-35)`}>
            <path d="M0 0v-75" stroke="#a38050" strokeWidth="7" />
            {ghost.tool === 'coal' ? (
              <>
                <path d="M-14 -5l28 0l-3 27h-21Z" fill="#96977c" />
                <path d="M-12 0l9 -11l10 3l7 12Z" fill="#202822" />
              </>
            ) : (
              <path d="M-17 2h34" stroke="#c2b78e" strokeWidth="6" />
            )}
          </g>
        )}
      </svg>
      <label className="range-setting draught-control">
        <span>
          Draught <b>{Math.round(draft * 100)}%</b>
        </span>
        <input
          type="range"
          aria-label="Boiler draught"
          min="0"
          max="1"
          step=".01"
          value={draft}
          onChange={(e) => changeDraft(Number(e.target.value))}
        />
      </label>
      <div className="firing-foot">
        <span role="status">{hint || ' '}</span>
        <button onClick={() => setLesson(0)}>Boiler basics</button>
        <button onClick={() => setHelp(!help)}>Firing controls</button>
      </div>
      {help && (
        <p className="firing-help">
          Drag a shovel from the bunker into an open fire. Work the slice bar across clinker; pull
          the rake through an ashpan. Spread small loads, close doors and watch steam against the
          engine order. Keyboard: 1–3 selects a fire, C/S/R selects a tool, O opens its door, Enter
          works one stroke.
        </p>
      )}
    </div>
  );
}
