import { Room } from '../server/game';
import { advanceMotion } from '../shared/voyage';
import { NAVIGATION_RATE } from '../shared/navigation';
import { KNOT_IN_METRES_PER_SECOND } from '../shared/units';

const contacts: number[] = [];
for (let seed = 1; seed <= 20; seed++) {
  for (const setting of [20, 25]) {
    const r = new Room('TIMING', seed);
    for (let i = 0; i < 4; i++) r.addPlayer('Crew' + i, 's' + i).ready = true;
    r.start(r.host);
    r.nextEvent = r.nextTelegram = Infinity;
    r.ship.order = r.ship.throttle = setting;
    r.ship.fires.fill(setting === 25 ? 0.74 : 0.65);
    while (!r.ship.impact && r.phase === 'voyage' && r.elapsed < 450) {
      r.ship.coal.fill(0.65);
      r.ship.ash.fill(0);
      r.ship.clinker.forEach((a) => a.fill(0));
      r.machines.forEach((m) => (m.condition = 100));
      r.tick(0.1);
    }
    if (!r.ship.impact) throw Error(`No first contact: ${seed}/${setting}/${r.phase}`);
    contacts.push(r.elapsed);
  }
}
const range = [Math.min(...contacts), Math.max(...contacts)].map((v) => Math.round(v));
console.log('Maintained Standard first contact, 20 seeds at 20 and 25 kn:', range, 'seconds');
if (range[0] < 180 || range[1] > 365)
  throw Error('Standard first-contact timing is outside 3–6 minutes.');

const distance = 20 * KNOT_IN_METRES_PER_SECOND * NAVIGATION_RATE * 30;
for (const setting of [0, 10, 15, 20, 25]) {
  const s = new Room('TURN').newShip();
  s.rudderTarget = 1;
  s.throttle = setting;
  let elapsed = 0;
  while (s.west < distance && elapsed < 120) {
    advanceMotion(s, 0.05);
    elapsed += 0.05;
  }
  console.log(
    JSON.stringify({
      setting,
      seconds: +elapsed.toFixed(1),
      reached: s.west >= distance,
      lateralNm: +(s.north / 1852).toFixed(3),
      heading: +s.heading.toFixed(1),
      speed: +s.speed.toFixed(1),
    }),
  );
}
