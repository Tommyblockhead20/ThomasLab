import {
  ArrowRight,
  Compass,
  FlaskConical,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Snowflake,
  Wrench,
  Users,
} from 'lucide-react';
import { ROLE_INFO, ROLE_ORDER } from '../shared/config';
import type { PracticeAction, Snapshot } from '../shared/types';
import { STATIONS, areaName } from '../shared/world';
import { useState } from 'react';
import { JobDemos } from './JobDemos';

export function PracticePanel({
  state,
  command,
  travel,
}: {
  state: Snapshot;
  command: (action: PracticeAction) => Promise<unknown>;
  travel: (station: string) => Promise<unknown>;
}) {
  const [station, setStation] = useState('wheel');
  const settings = state.practiceSettings!;
  const underway = state.phase === 'voyage';
  return (
    <>
      <div className="eyebrow">
        <FlaskConical size={15} />
        SINGLE PLAYER
      </div>
      <h2>Jobs &amp; test controls</h2>
      <JobDemos choose={(id) => void command({ verb: 'demo', value: id })} />
      <div className="practice-summary">
        <span>
          <Compass size={16} />
          {state.ship.speed.toFixed(1)} kn
        </span>
        <span>{state.ship.heading.toFixed(0)}° heading</span>
        <span>Hull {state.ship.hull.toFixed(0)}%</span>
        <span>
          {Math.floor(state.elapsed / 60)}:{String(Math.floor(state.elapsed % 60)).padStart(2, '0')}
        </span>
      </div>
      {underway && (
        <>
          <button
            className="practice-pause"
            onClick={() => void command({ verb: 'pause', value: !settings.paused })}
          >
            {settings.paused ? <Play size={20} /> : <Pause size={20} />}
            <div>
              <b>
                {settings.paused ? 'Clock held · schedule checks paused' : 'Voyage clock running'}
              </b>
              <small>Machinery and jobs stay active.</small>
            </div>
            <span>{settings.paused ? 'Run clock' : 'Hold clock'}</span>
          </button>
          <label className="field">
            CREW ASSIGNMENT
            <select
              value={state.self.role!}
              onChange={(e) => void command({ verb: 'post', value: e.target.value })}
            >
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {role} · {ROLE_INFO[role].area}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            QUICK TRAVEL
            <div className="practice-travel">
              <select value={station} onChange={(e) => setStation(e.target.value)}>
                {STATIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {areaName(s)}
                  </option>
                ))}
              </select>
              <button className="button" onClick={() => void travel(station)}>
                Go
                <ArrowRight size={15} />
              </button>
            </div>
          </label>
          <div className="practice-options">
            <label>
              <input
                type="checkbox"
                checked={settings.assistance}
                onChange={(e) => void command({ verb: 'assistance', value: e.target.checked })}
              />
              <div>
                <b>Coal assistance &amp; engine orders</b>
              </div>
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.tools}
                onChange={(e) => void command({ verb: 'tools', value: e.target.checked })}
              />
              <div>
                <b>Fault testing</b>
              </div>
            </label>
          </div>
          <h4>Scenarios</h4>
          <div className="practice-scenarios">
            <button onClick={() => void command({ verb: 'ice' })}>
              <Snowflake size={19} />
              <b>Ice ahead</b>
            </button>
            <button onClick={() => void command({ verb: 'sinking' })}>
              <ShieldCheck size={19} />
              <b>Test sinking</b>
            </button>
            <button onClick={() => void command({ verb: 'inquiry' })}>
              <Users size={19} />
              <b>Test inquiry</b>
            </button>
            <button onClick={() => void command({ verb: 'restore' })}>
              <Wrench size={19} />
              <b>Restore ship</b>
            </button>
            <button onClick={() => void command({ verb: 'schedule' })}>
              <Compass size={19} />
              <b>Late crossing</b>
            </button>
            <button onClick={() => void command({ verb: 'route' })}>
              <Compass size={19} />
              <b>Off route</b>
            </button>
          </div>
        </>
      )}
      <button
        className="button secondary practice-restart"
        onClick={() => void command({ verb: 'restart' })}
      >
        <RotateCcw size={16} />
        {state.demo ? 'Retry this demo' : 'Restart voyage'}
      </button>
    </>
  );
}
