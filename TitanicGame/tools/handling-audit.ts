import { Room } from '../server/game';
import { BALANCE } from '../shared/config';
for (const throttle of [20, 25]) {
  const r = new Room('AUDIT8', 91);
  for (let i = 0; i < 4; i++) r.addPlayer('Crew' + i, 's' + i).ready = true;
  r.start(r.host);
  r.icebergs = [];
  r.mainResolved = true;
  r.nextEvent = r.nextTelegram = Infinity;
  r.ship.rudderTarget = 1;
  let time = 0,
    max = 0,
    reversed = false,
    cut = {};
  while (time < 220 && r.phase === 'voyage') {
    r.machines.find((m) => m.id === 'engines')!.condition = 100;
    r.ship.coal.fill(0.7);
    r.ship.ash.fill(0);
    r.ship.clinker.forEach((a) => a.fill(0));
    if (!reversed && r.ship.north >= BALANCE.routeWarningOffset) {
      cut = { time, north: r.ship.north, heading: r.ship.heading, yaw: r.ship.yawRate };
      reversed = true;
      r.ship.rudderTarget = -1;
      r.ship.order = r.ship.throttle = throttle;
    }
    r.tick(0.05);
    time += 0.05;
    max = Math.max(max, r.ship.north);
    if (reversed && r.ship.north < BALANCE.corridorHalfWidth && max > BALANCE.corridorHalfWidth)
      break;
  }
  console.log(
    JSON.stringify({
      throttle,
      cut,
      time,
      max,
      north: r.ship.north,
      outside: r.ship.offRouteTime,
      phase: r.phase,
      cause: r.inquiryCause,
      delay: r.ship.delay,
    }),
  );
}
