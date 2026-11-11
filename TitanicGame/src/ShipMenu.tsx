import {
  ArrowRight,
  BookOpen,
  Compass,
  FlaskConical,
  Mic,
  MicOff,
  Settings2,
  X,
  Wrench,
} from 'lucide-react';
export function ShipMenu({
  role,
  area,
  practice,
  mic,
  job,
  resume,
  open,
  toggleMic,
  cancel,
  leave,
}: {
  role: string;
  area: string;
  practice: boolean;
  mic: boolean;
  job: boolean;
  resume: () => void;
  open: (name: 'notebook' | 'help' | 'settings' | 'practice') => void;
  toggleMic: () => void;
  cancel: () => void;
  leave: () => void;
}) {
  return (
    <div className="pause-scrim">
      <section className="pause-card ship-menu" aria-label="Ship menu">
        <div className="menu-heading">
          <Compass size={27} />
          <div>
            <h2>Ship’s menu</h2>
            <p>
              {role} · {area}
            </p>
          </div>
        </div>
        <button className="button menu-resume" onClick={resume}>
          Resume<kbd>Esc</kbd>
          <ArrowRight size={17} />
        </button>
        <div className="pause-actions">
          <button onClick={() => open('notebook')}>
            <BookOpen />
            <span>Notebook</span>
            <kbd>Tab</kbd>
          </button>
          <button onClick={() => open('help')}>
            <Compass />
            <span>Controls &amp; duties</span>
          </button>
          <button onClick={() => open('settings')}>
            <Settings2 />
            <span>Settings</span>
          </button>
          <button onClick={toggleMic}>
            {mic ? <Mic /> : <MicOff />}
            <span>Microphone</span>
            <small>{mic ? 'On' : 'Off'}</small>
          </button>
          {practice && (
            <button onClick={() => open('practice')}>
              <FlaskConical />
              <span>Test controls</span>
              <kbd>P</kbd>
            </button>
          )}
          {job && (
            <button onClick={cancel}>
              <Wrench />
              <span>Cancel task</span>
              <kbd>X</kbd>
            </button>
          )}
        </div>
        <div className="pause-keys">
          <span>
            <kbd>WASD</kbd>Move
          </span>
          <span>
            <kbd>E</kbd>Use
          </span>
          <span>
            <kbd>V</kbd>Talk
          </span>
          <span>
            <kbd>RMB</kbd>Zoom
          </span>
        </div>
        <button className="text-button leave-ship" onClick={leave}>
          <X size={14} />
          Leave voyage
        </button>
      </section>
    </div>
  );
}
