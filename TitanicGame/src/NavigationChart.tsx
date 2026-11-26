import { useId, useMemo, useRef, useState, useEffect } from 'react';
import type { Action, ChartMark, Snapshot, Telegram } from '../shared/types';
import { BALANCE } from '../shared/config';
import {
  METRES_PER_NM as NM,
  nm,
  chartPosition,
  chartCoordinates,
  coordinate,
  metresFromCoordinates,
} from '../shared/units';
import { projectTrack } from '../shared/voyage';
import { watchTime } from '../shared/radio';

type Point = { west: number; north: number };
type Tool = ChartMark['kind'] | 'view' | 'move' | 'erase';
export function NavigationChart({
  state,
  reports = state.delivered,
  act,
}: {
  state: Snapshot;
  reports?: Telegram[];
  act?: (a: Action) => Promise<void>;
}) {
  const [tool, setTool] = useState<Tool>('view'),
    [draft, setDraft] = useState<Point[]>([]),
    [label, setLabel] = useState(''),
    [source, setSource] = useState('Lookout'),
    [confidence, setConfidence] = useState<ChartMark['confidence']>('medium'),
    [selected, setSelected] = useState(''),
    [cursor, setCursor] = useState<Point | null>(null),
    [entry, setEntry] = useState({ lat: '', lon: '' }),
    [error, setError] = useState('');
  const fixes = useRef<{ west: number; north: number; at: number }[]>([]);
  const [trackCourse, setTrackCourse] = useState<number | null>(null);
  useEffect(() => {
    const at = state.elapsed,
      history = fixes.current;
    if (history.length && at < history[history.length - 1].at) {
      history.length = 0;
      setTrackCourse(null);
    }
    if (!history.length || at - history[history.length - 1].at >= 1)
      history.push({ west: state.ship.west, north: state.ship.north, at });
    while (history.length > 1 && at - history[0].at > 30) history.shift();
    const old = history[0],
      dw = state.ship.west - old.west,
      dn = state.ship.north - old.north;
    setTrackCourse(
      at - old.at >= 15 && Math.hypot(dw, dn) > 100
        ? (270 + (Math.atan2(dn, dw) * 180) / Math.PI + 360) % 360
        : null,
    );
  }, [state.elapsed, state.ship.west, state.ship.north]);
  const drawing = useRef(false),
    origin = useRef<Point | null>(null),
    id = useId().replace(/:/g, ''),
    finishWest = state.finishWest,
    scale = 540 / finishWest;
  const x = (p: Point) => 570 - p.west * scale,
    y = (p: Point) => 140 - p.north * scale;
  const at = (e: React.PointerEvent<SVGSVGElement>): Point => {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      west: (570 - Math.max(30, Math.min(570, ((e.clientX - b.left) * 600) / b.width))) / scale,
      north: (140 - Math.max(25, Math.min(255, ((e.clientY - b.top) * 280) / b.height))) / scale,
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
    if (act && tool !== 'view') {
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
    future = useMemo(
      () => projectTrack({ ...ship, heading: ship.indicatedHeading }),
      [
        ship.west,
        ship.north,
        ship.indicatedHeading,
        ship.speed,
        ship.rudder,
        ship.rudderTarget,
        ship.throttle,
        ship.steam,
        ship.yawRate,
      ],
    ),
    westGrid = Array.from({ length: 6 }, (_, i) => (finishWest * i) / 5),
    northGrid = [-96, -48, 0, 48, 96].map((pixels) => pixels / scale);
  return (
    <div className="navigation-chart chart-v9">
      <div className="chart-range">
        <span>{chartPosition(ship.west, ship.north)}</span>
        <span aria-live="polite">
          {tool === 'erase'
            ? 'Click a mark or course to erase it.'
            : `${nm(finishWest)} · Start to finish`}
        </span>
      </div>
      {act && (
        <div className="chart-tools" aria-label="Chart tools">
          {(
            [
              ['view', 'Select'],
              ['ice', 'Mark ice'],
              ['route', 'Draw course'],
              ['erase', 'Erase'],
            ] as const
          ).map(([key, text]) => (
            <button
              key={key}
              aria-pressed={tool === key}
              className={tool === key ? 'selected' : ''}
              onClick={() => {
                setTool(key);
                setSelected('');
              }}
            >
              {text}
            </button>
          ))}
          <button
            disabled={!state.chartUndoId}
            title="Remove your most recent mark"
            onClick={() => {
              setSelected('');
              void send('undo', state.chartUndoId);
            }}
          >
            Undo
          </button>
        </div>
      )}
      <svg
        viewBox="0 0 600 280"
        role="img"
        aria-label="Shipmates’ chart with estimated ice positions and course lines"
        style={{
          touchAction: 'none',
          cursor: tool === 'view' ? 'default' : tool === 'erase' ? 'pointer' : 'crosshair',
        }}
        onPointerDown={(e) => {
          if (!act) return;
          if (tool === 'view' || tool === 'erase') {
            setSelected('');
            return;
          }
          if (tool !== 'move') setSelected('');
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
          {westGrid.map((v) => (
            <path
              key={'w' + v}
              d={`M${x({ west: v, north: 0 })} 25V255`}
              stroke="#8c9279"
              strokeWidth=".45"
            />
          ))}
          {northGrid.map((v) => (
            <path
              key={'n' + v}
              d={`M30 ${y({ west: 0, north: v })}H570`}
              stroke="#8c9279"
              strokeWidth=".45"
            />
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
              pointerEvents={tool === 'view' || tool === 'erase' ? 'visiblePainted' : 'none'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (tool === 'erase' && act) void send('erase', m.id);
                else setSelected(m.id);
              }}
            >
              {m.kind === 'ice' ? (
                <circle
                  cx={x(m.points[0])}
                  cy={y(m.points[0])}
                  r="10"
                  fill="transparent"
                  stroke="none"
                />
              ) : (
                m.kind !== 'area' && (
                  <path
                    d={path(m.points)}
                    stroke="transparent"
                    strokeWidth="15"
                    strokeDasharray="none"
                  />
                )
              )}
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
                {selected === m.id ? `${m.label || m.source} · ${watchTime(m.at)}` : m.label}
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
            transform={`translate(${Math.max(38, Math.min(562, x(ship)))} ${y(ship)}) rotate(${ship.indicatedHeading})`}
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
          <text x="30" y="245">
            FINISH
          </text>
          <text x="570" y="245" textAnchor="end">
            START
          </text>
          {westGrid.map((v) => (
            <text
              key={v}
              x={Math.max(33, Math.min(567, x({ west: v, north: 0 })))}
              y="273"
              textAnchor="middle"
            >
              {coordinate(chartCoordinates(v, 0).lon, false)}
            </text>
          ))}
          {northGrid
            .filter((v) => y({ west: 0, north: v }) > 40 && y({ west: 0, north: v }) < 240)
            .map((v) => (
              <text key={v} x="33" y={y({ west: 0, north: v }) - 3}>
                {coordinate(chartCoordinates(0, v).lat, true)}
              </text>
            ))}
        </g>
      </svg>
      <div className="chart-readings">
        <span>
          Track between fixes{' '}
          <b>{trackCourse === null ? 'Collecting fixes…' : `${trackCourse.toFixed(0)}°`}</b>
        </span>
        <span>
          Heading <b>{ship.indicatedHeading.toFixed(0)}°</b>
        </span>
        <span>
          Off track{' '}
          <b>
            {nm(ship.north)} {ship.north >= 0 ? 'N' : 'S'}
          </b>
        </span>
        <span>{cursor ? chartPosition(cursor.west, cursor.north) : ''}</span>
      </div>
      {act && (
        <>
          <details className="chart-details">
            <summary>Plot details</summary>
            <div className="chart-tools">
              <button className={tool === 'area' ? 'selected' : ''} onClick={() => setTool('area')}>
                Mark area
              </button>
              <button
                className={tool === 'bearing' ? 'selected' : ''}
                onClick={() => setTool('bearing')}
              >
                Draw bearing
              </button>
            </div>
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
              <summary>Plot by latitude and longitude</summary>
              <div className="chart-coordinate-entry">
                <label>
                  Longitude (decimal degrees)
                  <input
                    aria-label="Longitude"
                    type="number"
                    step="0.0001"
                    value={entry.lon}
                    onChange={(e) => setEntry({ ...entry, lon: e.target.value })}
                  />
                </label>
                <label>
                  Latitude (decimal degrees)
                  <input
                    aria-label="Latitude"
                    type="number"
                    step="0.0001"
                    value={entry.lat}
                    onChange={(e) => setEntry({ ...entry, lat: e.target.value })}
                  />
                </label>
                <button
                  disabled={
                    !entry.lon ||
                    !entry.lat ||
                    Math.abs(Number(entry.lat)) > 90 ||
                    Math.abs(Number(entry.lon)) > 180
                  }
                  onClick={() =>
                    void send('mark', {
                      kind: 'ice',
                      points: [metresFromCoordinates(Number(entry.lat), Number(entry.lon))],
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
          </details>
          {selected && marks.length > 0 && (
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
                {tool === 'move' ? 'Click new position' : 'Move mark'}
              </button>
              <button
                disabled={!selected}
                onClick={() => {
                  void send('erase', selected);
                  setSelected('');
                  setTool('ice');
                }}
              >
                Erase selected
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
      {reports.some((t) => t.report) && (
        <details open className="chart-reports">
          <summary>
            Wireless reports · {reports.filter((t) => t.decoded && t.report).length}
          </summary>
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
