import { ArrowRight } from 'lucide-react';
import { JOB_DEMOS, type DemoId } from '../shared/demos';

export function JobDemos({
  choose,
  disabled = false,
}: {
  choose: (id: DemoId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="job-demos">
      {JOB_DEMOS.map((d) => (
        <button key={d.id} disabled={disabled} onClick={() => choose(d.id)}>
          <span>
            <b>{d.title}</b>
            <small>{d.detail}</small>
          </span>
          <ArrowRight size={17} />
        </button>
      ))}
    </div>
  );
}
