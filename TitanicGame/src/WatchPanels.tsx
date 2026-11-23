import { useEffect, useState } from 'react';
import type { Action, Snapshot } from '../shared/types';
import { nm } from '../shared/units';
import { watchTime } from '../shared/radio';
import { BALANCE } from '../shared/config';
import { navigationWarnings } from '../shared/voyage';

type Props = { state: Snapshot; act: (a: Action) => Promise<void> };
export function CommandPanel({ state, act }: Props) {
  const [heading, setHeading] = useState(state.command.heading);
  useEffect(() => setHeading(state.command.heading), [state.command.heading]);
  const warning = navigationWarnings(state.ship),
    answered = state.ship.order === state.ship.throttle;
  return (
    <div className="watch-panel command-desk">
      <div className="command-course">
        <svg
          viewBox="0 0 140 140"
          role="img"
          aria-label={`Heading ${state.ship.indicatedHeading.toFixed(0)} degrees, ordered ${state.command.heading} degrees`}
        >
          <circle cx="70" cy="70" r="54" fill="none" stroke="#b29c71" />
          {Array.from({ length: 24 }, (_, n) => (
            <path key={n} d="M70 17v5" stroke="#8a8d7b" transform={`rotate(${n * 15} 70 70)`} />
          ))}
          <g fill="#d8c8a5" fontFamily="Georgia" fontSize="12" textAnchor="middle">
            <text x="70" y="12">
              N
            </text>
            <text x="132" y="74">
              E
            </text>
            <text x="70" y="137">
              S
            </text>
            <text x="8" y="74">
              W
            </text>
          </g>
          <path
            d="M70 70V26"
            stroke="#d5b66d"
            strokeDasharray="4 3"
            transform={`rotate(${state.command.heading} 70 70)`}
          />
          <path
            d="M70 30l-6 43 6-5 6 5Z"
            fill="#b76c4c"
            transform={`rotate(${state.ship.indicatedHeading} 70 70)`}
          />
        </svg>
        <div>
          <small>HEADING</small>
          <strong>{state.ship.indicatedHeading.toFixed(0)}°</strong>
          <span>Ordered {state.command.heading}°</span>
          <span className={state.command.acknowledgedBy ? 'answered' : ''}>
            {state.command.acknowledgedBy
              ? `Read back · ${state.command.acknowledgedBy}`
              : 'Awaiting wheel read-back'}
          </span>
        </div>
      </div>
      <form
        className="command-order"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ station: 'command', verb: 'heading', value: heading });
        }}
      >
        <label htmlFor="course-order">Course order</label>
        <div>
          <button
            type="button"
            aria-label="Five degrees to port"
            onClick={() => setHeading((heading + 355) % 360)}
          >
            −5°
          </button>
          <input
            id="course-order"
            aria-label="Heading order"
            type="number"
            min="0"
            max="359"
            value={heading}
            onChange={(e) => setHeading(Number(e.target.value))}
          />
          <button
            type="button"
            aria-label="Five degrees to starboard"
            onClick={() => setHeading((heading + 5) % 360)}
          >
            +5°
          </button>
          <button className="button" type="submit">
            Issue order
          </button>
        </div>
      </form>
      <div className="instrument-row">
        <div>
          <small>ACTUAL SPEED</small>
          <b>{state.ship.speed.toFixed(1)} kn</b>
        </div>
        <div>
          <small>DELAY</small>
          <b className={warning.schedule ? 'command-warning' : ''}>
            {Math.round(state.ship.delay)} s
          </b>
          <progress value={state.ship.delay} max={BALANCE.scheduleBudget} />
        </div>
        <div>
          <small>OFF TRACK</small>
          <b className={warning.route ? 'command-warning' : ''}>
            {nm(Math.abs(state.ship.north))} {state.ship.north >= 0 ? 'N' : 'S'}
          </b>
        </div>
      </div>
      <div className="command-engine">
        <span>
          Engine order <b>{state.ship.order ? state.ship.order + ' kn' : 'Stop'}</b>
        </span>
        <span>
          Applied <b>{state.ship.throttle ? state.ship.throttle + ' kn' : 'Stop'}</b>
        </span>
        <small className={answered ? 'answered' : 'command-warning'}>
          {answered ? 'Answering' : 'Awaiting engine room'}
        </small>
      </div>
      {state.wirelessWaiting > 0 && (
        <p className="command-wireless">
          Wireless · {state.wirelessWaiting} awaiting transcription
        </p>
      )}
    </div>
  );
}

export function ObservationPanel({ state, act }: Props) {
  const [range, setRange] = useState(0),
    [note, setNote] = useState(''),
    me = state.players.find((p) => p.id === state.self.id)!,
    bearing = (state.ship.indicatedHeading + (me.yaw * 180) / Math.PI + 360) % 360,
    observations = state.self.notes.filter((n) => n.startsWith('Lookout '));
  return (
    <div className="watch-panel">
      <div className="instrument-row">
        <div>
          <small>SIGHTING BEARING</small>
          <b>{bearing.toFixed(0)}°</b>
        </div>
        <div>
          <small>WATCH</small>
          <b>{watchTime(state.elapsed)}</b>
        </div>
      </div>
      <label className="field">
        Estimated range · NM (0 = uncertain)
        <input
          aria-label="Estimated ice range"
          type="number"
          min="0"
          max="5"
          step="0.05"
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
        />
      </label>
      <label className="field">
        Observation
        <input
          aria-label="Lookout observation"
          maxLength={120}
          placeholder="Port contact, bearing steady, growing larger…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        className="button secondary"
        onClick={() => void act({ station: 'bell', verb: 'observe', value: { range, note } })}
      >
        Record bearing
      </button>
      <div className="notes-list">
        {observations.slice(-3).map((n, i) => (
          <p key={i}>{n}</p>
        ))}
      </div>
      <small>These are your observations. Read them to the bridge by telephone.</small>
    </div>
  );
}
