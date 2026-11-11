import { Room } from '../server/game';
import { HULL_BOW, NAVIGATION_RATE } from '../shared/navigation';
import { nm, KNOT_IN_METRES_PER_SECOND } from '../shared/units';
for (const lead of [60, 50, 42, 34, 26, 18]) {
  const r = new Room('BALANC', 101);
  for (let i = 0; i < 4; i++) r.addPlayer('Crew' + i, 's' + i).ready = true;
  r.start(r.host);
  r.icebergs = [];
  r.nextEvent = r.nextTelegram = Infinity;
  r.mainResolved = true;
  r.ship.speed = 21;
  r.addIce(HULL_BOW + 46 + 21 * KNOT_IN_METRES_PER_SECOND * NAVIGATION_RATE * lead, 0, 46, true);
  r.ship.rudderTarget = 1;
  let counter = false,
    amidships = false;
  for (let t = 0; t < 180 && r.phase === 'voyage'; t += 0.05) {
    r.ship.coal.fill(0.7);
    r.ship.ash.fill(0);
    r.ship.clinker.forEach((a) => a.fill(0));
    if (!counter && r.ship.heading >= 285) {
      r.ship.rudderTarget = -1;
      counter = true;
    }
    if (counter && !amidships && r.ship.heading <= 270) {
      r.ship.rudderTarget = 0;
      amidships = true;
    }
    r.tick(0.05);
  }
  const hit = r.icebergs[0].hit;
  console.log(
    `${lead}s: ${hit ? 'CONTACT' : 'CLEAR'} ${r.phase} ${r.result?.outcome ?? ''} hull=${r.ship.hull.toFixed(0)} off track=${nm(r.ship.north)}`,
  );
  if (lead >= 26 && (hit || r.result?.outcome !== 'crew'))
    throw Error('Timely controlled evasion failed');
  if (lead === 18 && !hit) throw Error('Late reaction no longer contacts ice');
}
