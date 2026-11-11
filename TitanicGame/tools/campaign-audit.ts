import { Room } from '../server/game';
for (let seed = 1; seed <= 12; seed++) {
  const r = new Room('AUDIT9', seed);
  for (let n = 0; n < 8; n++) r.addPlayer('Crew' + n, 's' + n).ready = true;
  r.start(r.host);
  r.nextEvent = r.nextTelegram = Infinity;
  let max = 0;
  for (let t = 0; t < 900 && r.phase === 'voyage'; t += 0.05) {
    r.ship.coal.fill(0.65);
    r.ship.ash.fill(0);
    r.ship.clinker.forEach((a) => a.fill(0));
    r.machines.forEach((m) => (m.condition = 100));
    r.ship.order = r.ship.throttle = 25;
    const next = r.icebergs.filter((i) => i.main && !i.passed).sort((a, b) => a.west - b.west)[0];
    let target = 0;
    if (next && next.west - r.ship.west < 1050) target = next.north >= 0 ? -125 : 125;
    const desired = 270 + (Math.atan2(target - r.ship.north, 380) * 180) / Math.PI;
    r.ship.rudderTarget = Math.max(
      -1,
      Math.min(1, (desired - r.ship.heading) * 0.12 - r.ship.yawRate * 1.4),
    );
    r.tick(0.05);
    max = Math.max(max, Math.abs(r.ship.north));
  }
  console.log(
    seed,
    r.icebergs.filter((i) => i.main).length,
    r.result?.outcome ?? r.phase,
    r.inquiryCause,
    'hits',
    r.icebergs.filter((i) => i.hit).length,
    'north',
    max.toFixed(0),
    'delay',
    r.ship.delay.toFixed(0),
  );
}
