import { Check, KeyRound, LockKeyhole, Telescope } from 'lucide-react';
import type { Snapshot } from '../shared/types';
import { cabinetAligned } from '../shared/cabinet';
export function Cabinet({
  state,
  send,
}: {
  state: Snapshot;
  send: (verb: string, value?: unknown) => Promise<void>;
}) {
  if (state.cabinetOpen)
    return (
      <div className="cabinet-content">
        <Telescope size={45} />
        {state.binocularOwner === state.self.id ? (
          <button className="button secondary" onClick={() => void send('return')}>
            Return binoculars
          </button>
        ) : (
          <button
            className="button"
            disabled={!!state.binocularOwner}
            onClick={() => void send('take')}
          >
            {state.binocularOwner ? 'In use' : 'Take binoculars'}
          </button>
        )}
      </div>
    );
  const dials = state.self.puzzle ?? [1, 1, 1];
  const working = state.players.some((p) => p.job?.station === 'cabinet');
  const aligned = cabinetAligned(dials),
    key = state.self.inventory.includes('Cabinet key');
  return (
    <div className="cabinet-lock">
      <div className="lock-label">
        <LockKeyhole size={16} />
        <span>ALIGN THE NOTCHES</span>
      </div>
      <div className="coupled-dials">
        {dials.map((value, i) => (
          <div className="dial-unit" key={i}>
            <span className="dial-target" />
            <button
              aria-label={`Turn cabinet dial ${i + 1}`}
              disabled={working}
              onClick={() => void send('turn', i)}
            >
              <span className="dial-disc" style={{ transform: `rotate(${value * 60}deg)` }}>
                <i />
              </span>
              <span className="dial-hub">{i + 1}</span>
            </button>
            <span className={value === 0 ? 'dial-light aligned' : 'dial-light'} />
          </div>
        ))}
      </div>
      <div className="station-buttons">
        <button
          className="button"
          disabled={working || (!aligned && !key)}
          onClick={() => void send('unlock')}
        >
          {key ? <KeyRound size={16} /> : <Check size={16} />}
          {key ? 'Use key' : 'Release latch'}
        </button>
      </div>
    </div>
  );
}
