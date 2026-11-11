import { useState } from 'react';
import type { Action, Snapshot } from '../shared/types';
import { nm } from '../shared/units';
import { watchTime } from '../shared/radio';

type Props = { state: Snapshot; act: (a: Action) => Promise<void> };
export function CommandPanel({ state, act }: Props) {
  const [heading, setHeading] = useState(state.command.heading);
  const me = state.players.find((p) => p.id === state.self.id)!;
  return (
    <div className="watch-panel">
      <div className="instrument-row">
        <div>
          <small>ACTUAL SPEED</small>
          <b>{state.ship.speed.toFixed(1)} kn</b>
        </div>
        <div>
          <small>SCHEDULE DELAY</small>
          <b>{Math.round(state.ship.delay)} s</b>
        </div>
        <div>
          <small>OFF TRACK</small>
          <b>{nm(state.ship.north)}</b>
        </div>
      </div>
      <label className="field">
        Heading order °
        <input
          aria-label="Heading order"
          type="number"
          min="0"
          max="359"
          value={heading}
          onChange={(e) => setHeading(Number(e.target.value))}
        />
      </label>
      <button
        className="button"
        onClick={() => void act({ station: 'command', verb: 'heading', value: heading })}
      >
        Issue heading order
      </button>
      <p className="small">
        {state.command.acknowledgedBy
          ? `Read back by ${state.command.acknowledgedBy}`
          : 'Awaiting read-back at the wheel'}
      </p>
      <div className="notes-list">
        <p>
          Wireless · <b>{state.wirelessWaiting}</b> awaiting transcription
        </p>
        <p>
          Engines ordered <b>{state.ship.order} kn</b> · setting <b>{state.ship.throttle} kn</b>
        </p>
        <p>
          Forward watch bearing{' '}
          <b>{((state.ship.heading + (me.yaw * 180) / Math.PI + 360) % 360).toFixed(0)}°</b>
        </p>
      </div>
    </div>
  );
}

export function ObservationPanel({ state, act }: Props) {
  const [range, setRange] = useState(0),
    [note, setNote] = useState(''),
    me = state.players.find((p) => p.id === state.self.id)!,
    bearing = (state.ship.heading + (me.yaw * 180) / Math.PI + 360) % 360,
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
