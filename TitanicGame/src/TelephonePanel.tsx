import { useState } from 'react';
import { Headphones, Send } from 'lucide-react';
import type { Snapshot, Station, Action } from '../shared/types';
import { PHONE_LINKS, DEPARTMENTS } from '../shared/radio';

export function TelephonePanel({
  state,
  station,
  act,
  reportId,
}: {
  state: Snapshot;
  station: Station;
  act: (a: Action) => Promise<void>;
  reportId?: string;
}) {
  const [message, setMessage] = useState('');
  const incoming = state.phones.find((c) => c.to === station.phoneRoom && !c.answerer);
  const call = state.phones.find((c) => c.caller === state.self.id || c.answerer === state.self.id);
  const send = (verb: string, value?: unknown) => act({ station: station.id, verb, value });
  return (
    <div className="ship-telephone">
      <div className="telephone-status">
        <Headphones size={30} />
        <h3>
          {call
            ? call.answerer
              ? 'Line connected'
              : 'Ringing…'
            : incoming
              ? 'Incoming call'
              : 'Ship telephone'}
        </h3>
        {call?.answerer && <p>Hold V to speak.</p>}
      </div>
      {call ? (
        <>
          {call.answerer && (
            <>
              <div className="line-messages" role="log">
                {state.self.lineMessages.slice(-5).map((m, i) => (
                  <p key={i}>
                    <b>{m.from}</b> {m.text}
                  </p>
                ))}
              </div>
              <form
                className="line-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send('message', message).then(() => setMessage(''));
                }}
              >
                <input
                  aria-label="Telephone message"
                  maxLength={180}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Pass a message over this line…"
                />
                <button className="button secondary" disabled={!message.trim()}>
                  <Send size={15} />
                  Send
                </button>
              </form>
              {reportId && (
                <button className="button secondary" onClick={() => void send('relay', reportId)}>
                  Read this report down the line
                </button>
              )}
            </>
          )}
          <button className="button secondary" onClick={() => void send('hangup')}>
            Replace handset
          </button>
        </>
      ) : incoming ? (
        <button className="button" onClick={() => void send('answer')}>
          Answer telephone
        </button>
      ) : (
        <div className="station-buttons">
          {(PHONE_LINKS[station.phoneRoom!] ?? []).map((room) => (
            <button className="button secondary" key={room} onClick={() => void send('call', room)}>
              Call {DEPARTMENTS[room]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
