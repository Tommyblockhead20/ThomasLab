import { useId, useRef, useState } from 'react';
import type { Action, ChartMark, Snapshot, Telegram } from '../shared/types';
import { BALANCE } from '../shared/config';
import { METRES_PER_NM as NM, nm, chartPosition } from '../shared/units';
import { projectCourse } from '../shared/voyage';
import { watchTime } from '../shared/radio';

type Point = { west: number; north: number };
type Tool = ChartMark['kind'] | 'pan' | 'move';
export function NavigationChart({
  state,
  reports = state.delivered,
  act,
}: {
  state: Snapshot;
  reports?: Telegram[];
  act?: (a: Action) => Promise<void>;
}) {
  const [width, setWidth] = useState(25 / 6),
    [center, setCenter] = useState<Point>({ west: state.ship.west + NM, north: 0 }),
    [tool, setTool] = useState<Tool>('ice'),
    [draft, setDraft] = useState<Point[]>([]),
    [label, setLabel] = useState(''),
    [source, setSource] = useState('Lookout'),
    [confidence, setConfidence] = useState<ChartMark['confidence']>('medium'),
    [selected, setSelected] = useState(''),
    [cursor, setCursor] = useState<Point | null>(null),
    [entry, setEntry] = useState({ west: '', north: '' }),
    [error, setError] = useState('');
  const drawing = useRef(false),
    origin = useRef<Point | null>(null),
    id = useId().replace(/:/g, ''),
    scale = 540 / (width * NM);
  const x = (p: Point) => 300 - (p.west - center.west) * scale,
    y = (p: Point) => 140 - (p.north - center.north) * scale;
  const at = (e: React.PointerEvent<SVGSVGElement>): Point => {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      west: center.west - (((e.clientX - b.left) * 600) / b.width - 300) / scale,
      north: center.north - (((e.clientY - b.top) * 280) / b.height - 140) / scale,
    };
  };
  const send = async (verb: string, value?: unknown) => {
    setError('');
    try {
      await act?.({ station: 'chart', verb, value });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const mark = (points: Point[], radius = 0) =>
    send('mark', { kind: tool, points, radius, label, source, confidence });
  const finish = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    const p = at(e),
      start = origin.current!;
    if (tool === 'pan') {
      setCenter((c) => ({
        west: c.west + start.west - p.west,
        north: c.north + start.north - p.north,
      }));
    } else if (act) {
      if (tool === 'move') {
        const m = state.chartMarks.find((m) => m.id === selected);
        if (m)
          void send('move', {
            id: m.id,
            west: p.west - m.points[0].west,
            north: p.north - m.points[0].north,
          });
      } else if (tool === 'ice') void mark([p]);
      else if (tool === 'area')
        void mark([start], Math.min(NM, Math.hypot(p.west - start.west, p.north - start.north)));
      else if (Math.hypot(p.west - start.west, p.north - start.north) > 10)
        void mark([start, ...draft.slice(1, 61), p]);
    }
    setDraft([]);
  };
  const path = (points: Point[]) =>
      points.map((p, i) => `${i ? 'L' : 'M'}${x(p)},${y(p)}`).join(' '),
    marks = state.chartMarks ?? [],
    ship = state.ship,
    future = [ship, ...Array.from({ length: 7 }, (_, i) => projectCourse(ship, (i + 1) * 8))],
    step = width <= 1 ? 0.1 : width <= 2 ? 0.25 : 0.5,
    grid = Array.from({ length: 81 }, (_, i) => (i - 40) * step * NM);
  return (
    <div className="navigation-chart chart-v9">
      <div className="chart-range">
        <span>{chartPosition(ship.west, ship.north)}</span>
        <label>
          Width{' '}
          <select
            aria-label="Chart width"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          >
            {[0.5, 1, 2, 25 / 6, 8].map((n) => (
              <option key={n} value={n}>
                {n.toFixed(n === 25 / 6 ? 2 : 1)} NM
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setCenter({ west: ship.west + NM, north: ship.north })}>
          Find ship
        </button>
      </div>
      {act && (
        <div className="chart-tools" aria-label="Chart tools">
          {(['ice', 'area', 'bearing', 'route', 'pan'] as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'selected' : ''} onClick={() => setTool(t)}>
              {t === 'ice'
                ? 'Ice point'
                : t === 'area'
                  ? 'Uncertain area'
                  : t === 'bearing'
                    ? 'Bearing line'
                    : t === 'route'
                      ? 'Course line'
                      : 'Pan'}
            </button>
          ))}
        </div>
      )}
      <svg
        viewBox="0 0 600 280"
        role="img"
        aria-label="Crew chart with estimated ice positions, bearings and course lines"
        style={{ touchAction: 'none', cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
        onPointerDown={(e) => {
          if (!act && tool !== 'pan') return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          origin.current = at(e);
          setDraft([at(e)]);
        }}
        onPointerMove={(e) => {
          const p = at(e);
          setCursor(p);
          if (drawing.current) setDraft((d) => (d.length < 62 ? [...d, p] : d));
        }}
        onPointerUp={finish}
        onPointerCancel={() => {
          drawing.current = false;
          setDraft([]);
        }}
      >
        <defs>
          <clipPath id={id}>
            <rect x="30" y="25" width="540" height="230" />
          </clipPath>
        </defs>
        <rect width="600" height="280" fill="#c5b998" />
        <g clipPath={`url(#${id})`}>
          <rect
            x="30"
            y={y({ west: 0, north: BALANCE.corridorHalfWidth })}
            width="540"
            height={BALANCE.corridorHalfWidth * 2 * scale}
            fill="#879478"
            opacity=".18"
          />
          {grid.map((v, i) => (
            <g key={i} stroke="#8c9279" strokeWidth=".45">
              <path d={`M${x({ west: v, north: 0 })} 25V255`} />
              <path d={`M30 ${y({ west: 0, north: v })}H570`} />
            </g>
          ))}
          {[0, BALANCE.corridorHalfWidth, -BALANCE.corridorHalfWidth].map((n) => (
            <path
              key={n}
              d={`M30 ${y({ west: 0, north: n })}H570`}
              stroke={n ? '#8d5b42' : '#52664e'}
              strokeDasharray="6 4"
            />
          ))}
          {marks.map((m) => (
            <g
              key={m.id}
              stroke={
                m.kind === 'route' ? '#365c55' : m.confidence === 'high' ? '#7b352d' : '#865c3f'
              }
              strokeWidth={selected === m.id ? 3 : 1.5}
              strokeDasharray={m.confidence === 'low' ? '4 4' : undefined}
              fill="none"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(m.id);
              }}
            >
              {m.kind === 'ice' ? (
                <path d={`M${x(m.points[0]) - 5} ${y(m.points[0]) - 5}l10 10m-10 0l10 -10`} />
              ) : m.kind === 'area' ? (
                <circle
                  cx={x(m.points[0])}
                  cy={y(m.points[0])}
                  r={m.radius * scale}
                  fill="#965c4120"
                />
              ) : (
                <path d={path(m.points)} />
              )}
              <text
                x={x(m.points[0]) + 8}
                y={y(m.points[0]) - 8}
                fontSize="9"
                fill="#673f2e"
                stroke="none"
              >
                {m.label || m.source} · {watchTime(m.at)}
              </text>
            </g>
          ))}
          <path
            d={path(future)}
            stroke="#385956"
            strokeWidth="2"
            strokeDasharray="3 4"
            fill="none"
          />
          <path
            d="M0 -10L-5 8L0 4L5 8Z"
            transform={`translate(${x(ship)} ${y(ship)}) rotate(${ship.heading})`}
            fill="#953f2b"
          />
          {draft.length > 0 && tool === 'area' && (
            <circle
              cx={x(draft[0])}
              cy={y(draft[0])}
              r={
                Math.hypot(
                  draft.at(-1)!.west - draft[0].west,
                  draft.at(-1)!.north - draft[0].north,
                ) * scale
              }
              fill="#965c4120"
              stroke="#70442c"
            />
          )}
          {draft.length > 1 && tool !== 'area' && (
            <path d={path(draft)} stroke="#70442c" fill="none" />
          )}
        </g>
        <g fill="#555945" fontFamily="monospace" fontSize="9">
          <text x="30" y="15">
            N ↑ · CREW ESTIMATES
          </text>
          <text x="370" y="15">
            {step} NM GRID · W ←
          </text>
          {grid
            .filter((v) => x({ west: v, north: 0 }) > 40 && x({ west: v, north: 0 }) < 550)
            .map((v) => (
              <text key={v} x={x({ west: v, north: 0 })} y="273" textAnchor="middle">
                {(v / NM).toFixed(1)} W
              </text>
            ))}
          {grid
            .filter((v) => y({ west: 0, north: v }) > 40 && y({ west: 0, north: v }) < 240)
            .map((v) => (
              <text key={v} x="33" y={y({ west: 0, north: v }) - 3}>
                {(v / NM).toFixed(1)} N
              </text>
            ))}
        </g>
      </svg>
      <div className="chart-readings">
        <span>
          Heading <b>{ship.indicatedHeading.toFixed(0)}°</b>
        </span>
        <span>
          Off track{' '}
          <b>
            {nm(ship.north)} {ship.north >= 0 ? 'N' : 'S'}
          </b>
        </span>
        <span>
          {cursor ? chartPosition(cursor.west, cursor.north) : '4.17 NM = 10 min at 25 kn'}
        </span>
      </div>
      {act && (
        <>
          <div className="chart-estimate-fields">
            <label>
              Label
              <input
                aria-label="Mark label"
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label>
              Source
              <select
                aria-label="Mark source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {['Lookout', 'Wireless', 'Bridge', 'Own estimate'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Confidence
              <select
                aria-label="Mark confidence"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value as ChartMark['confidence'])}
              >
                {['low', 'medium', 'high'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <details>
            <summary>Plot by grid coordinates</summary>
            <div className="chart-coordinate-entry">
              <label>
                West NM
                <input
                  aria-label="West nautical miles"
                  type="number"
                  step="0.01"
                  value={entry.west}
                  onChange={(e) => setEntry({ ...entry, west: e.target.value })}
                />
              </label>
              <label>
                North NM
                <input
                  aria-label="North nautical miles"
                  type="number"
                  step="0.01"
                  value={entry.north}
                  onChange={(e) => setEntry({ ...entry, north: e.target.value })}
                />
              </label>
              <button
                disabled={!entry.west || !entry.north}
                onClick={() =>
                  void send('mark', {
                    kind: 'ice',
                    points: [{ west: Number(entry.west) * NM, north: Number(entry.north) * NM }],
                    radius: 0,
                    label,
                    source,
                    confidence,
                  })
                }
              >
                Place estimate
              </button>
            </div>
          </details>
          {marks.length > 0 && (
            <div className="chart-mark-list">
              <select
                aria-label="Selected chart mark"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Choose a mark</option>
                {marks.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.label || m.kind} · {m.source} · {m.by} · {watchTime(m.at)}
                  </option>
                ))}
              </select>
              <button disabled={!selected} onClick={() => setTool('move')}>
                Move · click new position
              </button>
              <button
                disabled={!selected}
                onClick={() => {
                  void send('erase', selected);
                  setSelected('');
                  setTool('ice');
                }}
              >
                Erase
              </button>
            </div>
          )}
          <small>
            {tool === 'move'
              ? 'Click a new position for the selected mark.'
              : 'Click an ice point; drag an area or line. Marks are shared crew estimates.'}
          </small>
        </>
      )}
      {error && <p className="error">{error}</p>}
      {reports.some((t) => t.report) && (
        <details>
          <summary>Reported positions</summary>
          <div className="notes-list">
            {reports
              .filter((t) => t.decoded && t.report)
              .map((t) => (
                <p key={t.id}>
                  <b>{t.sender}</b> · {chartPosition(t.report!.west, t.report!.north)} ·{' '}
                  {watchTime(t.report!.observedAt)}
                  <br />
                  {nm(t.report!.radiusWest * 2)} × {nm(t.report!.radiusNorth * 2)} ·{' '}
                  {Math.max(0, Math.round((state.elapsed - t.report!.observedAt) / 60))} min old
                  {act && (
                    <button
                      onClick={() =>
                        void send('mark', {
                          kind: 'area',
                          points: [{ west: t.report!.west, north: t.report!.north }],
                          radius: Math.max(t.report!.radiusWest, t.report!.radiusNorth),
                          label: t.sender + ' ' + watchTime(t.report!.observedAt),
                          source: 'Wireless',
                          confidence: 'low',
                        })
                      }
                    >
                      Plot reported area
                    </button>
                  )}
                </p>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
