import { useEffect, useState } from 'react';
import type { Action, Snapshot, Station } from '../shared/types';
import { electricSupply, type PowerCircuit } from '../shared/auxiliary';

export function AuxiliaryPanel({
  state,
  station: s,
  act,
}: {
  state: Snapshot;
  station: Station;
  act: (a: Action) => Promise<void>;
}) {
  const a = state.ship.auxiliary,
    i = Number(s.id.at(-1)) - 1;
  const send = (verb: string, value?: unknown) => void act({ station: s.id, verb, value });
  const instrument = (label: string, value: string, warning = false) => (
    <div className={warning ? 'aux-warning' : ''}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
  const adjustment = (label: string, value: number, verb: string) => (
    <LocalValve label={label} value={value} apply={(value) => send(verb, value)} />
  );
  const waters = (
    <div className="water-glasses" aria-label="Boiler water levels">
      {a.boilerWater.map((v, n) => (
        <div key={n} className={v < 0.3 || v > 0.85 ? 'aux-warning' : ''}>
          <small>BOILER {n + 1}</small>
          <div className="water-glass">
            <i style={{ height: `${v * 100}%` }} />
            <span className="water-low" />
            <span className="water-high" />
          </div>
          <b>{Math.round(v * 100)}%</b>
        </div>
      ))}
    </div>
  );
  return (
    <div className="auxiliary-panel">
      {s.id.startsWith('feed-pump-') && (
        <>
          <div className="aux-instruments">
            {instrument(
              'DELIVERY',
              `${Math.round(a.pumpRevs[i] * (1 - a.strainers[i] * 0.65) * 100)}%`,
              a.feedPumps[i] && a.pumpRevs[i] < 0.5,
            )}
            {instrument(
              'STRAINER',
              `${Math.round(a.strainers[i] * 100)}% obstructed`,
              a.strainers[i] > 0.6,
            )}
          </div>
          {waters}
          <div className="station-buttons">
            <button onClick={() => send('pump', !a.feedPumps[i])}>
              {a.feedPumps[i] ? 'Stop pump' : 'Start pump'}
            </button>
            <button
              disabled={
                a.feedPumps[i] ||
                a.strainers[i] < 0.01 ||
                !!state.players.find((p) => p.id === state.self.id)?.job
              }
              onClick={() => send('clean-strainer')}
            >
              Clean strainer
            </button>
          </div>
          <p className="station-hint">
            Change to the other pump before opening a strainer. Feed wheels control each boiler’s
            water supply.
          </p>
        </>
      )}
      {s.id.startsWith('feed-valve-') && (
        <>
          {waters}
          {adjustment(`Boiler ${i + 1} feedwater`, a.feedValves[i], 'feed')}
          <p className="station-hint">
            Keep water between the brass marks. Increase feed as steam demand rises; avoid
            overfilling.
          </p>
        </>
      )}
      {s.id.startsWith('condenser-') && (
        <>
          <div className="aux-instruments">
            {instrument('CONDENSER VACUUM', `${(a.vacuum * 30).toFixed(1)} inHg`, a.vacuum < 0.75)}
            {instrument('ENGINE REVOLUTIONS', `${state.ship.engineRevs.toFixed(0)} rpm`)}
          </div>
          {adjustment('Cooling-water valve', a.coolingValves[i], 'cooling')}
          <p className="station-hint">
            Low vacuum reduces engine power. Compare both cooling valves; inspect for an air leak if
            flow is normal.
          </p>
        </>
      )}
      {s.id.startsWith('dynamo-') && (
        <>
          <div className="aux-instruments">
            {instrument('MAIN BUS', `${a.voltage.toFixed(0)} V`, a.voltage < 85)}
            {instrument('SHIP LOAD', `${Math.round(a.electricalLoad * 400)} kW`)}
            {instrument(
              'THIS SET',
              a.generators[i] ? `${Math.round(a.generatorRevs[i] * 325)} rpm` : 'Standby',
            )}
          </div>
          <button className="button" onClick={() => send('generator', !a.generators[i])}>
            {a.generators[i] ? 'Stop generating set' : 'Bring set online'}
          </button>
          {adjustment('Steam admission', a.governors[i], 'governor')}
          <p className="station-hint">
            Give the set time to run up. Keep the bus near 100 V; a second running set uses
            additional steam.
          </p>
        </>
      )}
      {s.id.startsWith('circuit-') &&
        (() => {
          const c = s.id.slice(8) as PowerCircuit;
          return (
            <>
              <div className="aux-instruments">
                {instrument('MAIN BUS', `${a.voltage.toFixed(0)} V`, a.voltage < 85)}
                {instrument(
                  'FEEDER',
                  !a.circuits[c]
                    ? 'Isolated'
                    : electricSupply(a, c) > 0.8
                      ? 'Supplied'
                      : 'Weak supply',
                )}
              </div>
              <button className="button" onClick={() => send('circuit', !a.circuits[c])}>
                {a.circuits[c] ? 'Isolate feeder' : 'Connect feeder'}
              </button>
              {c === 'wireless' && (
                <p className="station-hint">
                  Wireless reserve battery · {Math.round(a.wirelessBattery * 100)}%
                </p>
              )}
              {c === 'ventilation' && (
                <p className="station-hint">
                  Stokehold ventilation supports the fires. Main feed pumps use steam.
                </p>
              )}
            </>
          );
        })()}
      {s.id === 'bearing-oil' && (
        <>
          <div className="aux-instruments">
            {instrument(
              'OIL RESERVOIR',
              `${Math.round(a.lubrication * 100)}%`,
              a.lubrication < 0.35,
            )}
            {instrument(
              'BEARINGS',
              a.bearingHeat > 0.7 ? 'Running hot' : a.bearingHeat > 0.5 ? 'Warming' : 'Normal',
              a.bearingHeat > 0.7,
            )}
          </div>
          <button
            className="button"
            disabled={!!state.players.find((p) => p.id === state.self.id)?.job}
            onClick={() => send('lubricate')}
          >
            Fill oil reservoir
          </button>
          <p className="station-hint">
            Oil prevents bearing heat building up. Reduce engine load if hot bearings need time to
            cool.
          </p>
        </>
      )}
    </div>
  );
}

function LocalValve({
  label,
  value,
  apply,
}: {
  label: string;
  value: number;
  apply: (value: number) => void;
}) {
  const [pending, setPending] = useState(value);
  useEffect(() => setPending(value), [value]);
  return (
    <label className="aux-adjust">
      <span>
        {label}
        <b>{Math.round(pending * 100)}%</b>
      </span>
      <input
        aria-label={label}
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={pending}
        onChange={(e) => setPending(Number(e.target.value))}
        onPointerUp={(e) => apply(Number(e.currentTarget.value))}
        onKeyUp={(e) => apply(Number(e.currentTarget.value))}
      />
    </label>
  );
}
