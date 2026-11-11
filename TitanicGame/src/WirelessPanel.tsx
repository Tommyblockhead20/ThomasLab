import { useState, useEffect, useRef } from 'react';
import { Check, Volume2, Radio, Clipboard } from 'lucide-react';
import type { Snapshot, Station, Action } from '../shared/types';
import { MORSE } from '../shared/morse';
import { reportSummary, watchTime } from '../shared/radio';
import { workSeconds } from '../shared/voyage';
import { STATIONS, distance } from '../shared/world';
import { shipAudio } from './audio';
import { NavigationChart } from './NavigationChart';
import { TelephonePanel } from './TelephonePanel';

export function WirelessPanel({
  state,
  station,
  act,
}: {
  state: Snapshot;
  station: Station;
  act: (a: Action) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(''),
    [transcription, setTranscription] = useState(''),
    [tab, setTab] = useState<'receiver' | 'line' | 'chart'>('receiver');
  const selected = state.telegrams.find((t) => t.id === selectedId) ?? state.telegrams.at(-1);
  const [playing, setPlaying] = useState(false),
    soundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selected?.id]);
  useEffect(() => {
    shipAudio.stopMorse();
    setPlaying(false);
    return () => {
      shipAudio.stopMorse();
      if (soundTimer.current) clearTimeout(soundTimer.current);
    };
  }, [selected?.id, tab]);
  const listen = () => {
    if (playing) {
      shipAudio.stopMorse();
      setPlaying(false);
      return;
    }
    void shipAudio.start().then(() => {
      const duration = shipAudio.morse(selected!.code);
      setPlaying(true);
      soundTimer.current = setTimeout(() => setPlaying(false), duration * 1000);
    });
  };
  const me = state.players.find((p) => p.id === state.self.id)!,
    phone = STATIONS.find((s) => s.id === 'wireless-phone')!;
  const send = (verb: string, value?: unknown) => act({ station: station.id, verb, value });
  const ringing = state.phones.some((c) => c.to === 'wireless' && !c.answerer);
  return (
    <div className="wireless-panel">
      <div className="wireless-mode">
        <button className={tab === 'receiver' ? 'selected' : ''} onClick={() => setTab('receiver')}>
          Marconi receiver
        </button>
        <button
          className={tab === 'chart' ? 'selected' : ''}
          disabled={!state.telegrams.some((t) => t.decoded && t.report)}
          onClick={() => setTab('chart')}
        >
          Report chart
        </button>
        <button className={tab === 'line' ? 'selected' : ''} onClick={() => setTab('line')}>
          Ship telephone {ringing ? '· Ringing' : ''}
        </button>
      </div>
      {tab === 'line' ? (
        distance(me, phone) < 3.3 ? (
          <TelephonePanel
            state={state}
            station={phone}
            act={act}
            reportId={selected?.decoded ? selected.id : undefined}
          />
        ) : (
          <p className="small">The ship’s handset is beside the receiver.</p>
        )
      ) : tab === 'chart' ? (
        <NavigationChart state={state} reports={state.telegrams.filter((t) => t.decoded)} />
      ) : (
        <>
          <div className="telegram-tabs">
            {state.telegrams.slice(-6).map((t) => (
              <button
                key={t.id}
                className={t.id === selected?.id ? 'selected' : ''}
                onClick={() => {
                  setSelectedId(t.id);
                  setTranscription('');
                }}
              >
                {t.sender} {watchTime(t.at)}
                {t.decoded && <Check size={12} />}
              </button>
            ))}
          </div>
          {selected ? (
            <>
              <div className="telegram-slip">
                <span>
                  {selected.sender} · RECEIVED {watchTime(selected.at)}
                  {selected.receivedBy ? ' · ' + selected.receivedBy : ''}
                </span>
                {!selected.decoded ? (
                  <code>{selected.code}</code>
                ) : (
                  <>
                    {!selected.report && <p>{selected.text}</p>}
                    {selected.report && (
                      <div className="radio-position">
                        <b>{reportSummary(selected.report)}</b>
                        <small>
                          Sighting{' '}
                          {Math.max(
                            0,
                            Math.floor((state.elapsed - selected.report.observedAt) / 60),
                          )}{' '}
                          min old · sighted {watchTime(selected.report.observedAt)}
                        </small>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="station-buttons">
                <button className="button secondary" onClick={listen}>
                  <Volume2 size={16} />
                  {playing ? 'Stop listening' : 'Listen to Morse'}
                </button>
                {!selected.decoded && (
                  <button
                    className="button secondary"
                    onClick={() => void send('assist', { id: selected.id })}
                  >
                    Transcribe · {workSeconds(state.self.role, 'decode')}s
                  </button>
                )}
              </div>
              {!selected.decoded ? (
                <>
                  <label className="field">
                    YOUR TRANSCRIPTION
                    <input
                      placeholder="TYPE THE MESSAGE…"
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value.toUpperCase())}
                    />
                  </label>
                  <button
                    className="button"
                    onClick={() => void send('decode', { id: selected.id, text: transcription })}
                  >
                    Check transcription <Check size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button"
                    disabled={state.self.inventory.includes(`Telegram:${selected.id}`)}
                    onClick={() => void send('carry', { id: selected.id })}
                  >
                    <Clipboard size={16} />
                    {state.self.inventory.includes(`Telegram:${selected.id}`)
                      ? 'In your pocket'
                      : 'Take report to bridge'}
                  </button>
                  {selected.report && (
                    <button className="button secondary" onClick={() => setTab('chart')}>
                      View report on chart
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="empty-crew">
              <Radio />
              Listening…
            </div>
          )}
          <button
            className="button secondary radio-request"
            disabled={!!state.radio?.pending || !!state.radio?.readyIn}
            onClick={() => void send('request')}
          >
            {state.radio?.pending
              ? 'Waiting for a reply…'
              : state.radio?.readyIn
                ? `Working traffic · ${state.radio.readyIn}s`
                : 'Request a fresh ice position'}
          </button>
          <details className="morse-reference">
            <summary>Morse reference</summary>
            <div>
              {Object.entries(MORSE).map(([letter, code]) => (
                <span key={letter}>
                  <b>{letter}</b>
                  <code>{code}</code>
                </span>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
