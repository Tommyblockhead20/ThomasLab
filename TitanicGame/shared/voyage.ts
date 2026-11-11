import { BALANCE, type Role } from './config';
import { NAVIGATION_RATE } from './navigation';
import { KNOT_IN_METRES_PER_SECOND } from './units';
import type { ShipState } from './types';
export type Motion = Pick<
  ShipState,
  | 'west'
  | 'north'
  | 'heading'
  | 'speed'
  | 'rudder'
  | 'rudderTarget'
  | 'throttle'
  | 'steam'
  | 'yawRate'
>;
export function advanceMotion(ship: Motion, dt: number, steering = 1, engines = 1) {
  const turnLoad = Math.min(1, Math.abs(ship.yawRate) / Math.max(0.05, (0.84 * ship.speed) / 20));
  const target =
    (ship.throttle * Math.min(1, ship.steam / 63) * engines) / (1 + 0.12 * turnLoad * turnLoad);
  ship.speed += (target - ship.speed) * (1 - Math.exp(-dt * 0.045));
  ship.rudder += (ship.rudderTarget * steering - ship.rudder) * (1 - Math.exp(-dt * 0.22));
  const targetYaw = 0.84 * ship.rudder * Math.pow(Math.max(0, ship.speed) / 20, 1.1);
  ship.yawRate += (targetYaw - ship.yawRate) * (1 - Math.exp(-dt / 2.4));
  ship.heading = (ship.heading + ship.yawRate * dt + 360) % 360;
  const angle = ((ship.heading - 270) * Math.PI) / 180,
    metres = ship.speed * KNOT_IN_METRES_PER_SECOND * NAVIGATION_RATE * dt;
  ship.west += Math.cos(angle) * metres;
  ship.north += Math.sin(angle) * metres;
}
export function projectCourse(ship: Motion, seconds: number, steering = 1, engines = 1) {
  const future = { ...ship };
  for (let t = 0; t < seconds; ) {
    const dt = Math.min(0.05, seconds - t);
    advanceMotion(future, dt, steering, engines);
    t += dt;
  }
  return future;
}
export function workSeconds(role: Role | null, kind: 'repair' | 'inspect' | 'decode') {
  const engineer = role?.includes('Engineer'),
    wireless = role?.includes('Wireless');
  if (kind === 'repair') return engineer ? BALANCE.repairSeconds : BALANCE.basicRepairSeconds;
  if (kind === 'inspect') return engineer ? 3 : 7;
  return wireless ? 14 : 38;
}
export function navigationWarnings(ship: Pick<ShipState, 'delay' | 'north' | 'offRouteTime'>) {
  return {
    schedule:
      ship.delay >= BALANCE.scheduleUrgent
        ? 'urgent'
        : ship.delay >= BALANCE.scheduleWarning
          ? 'caution'
          : null,
    route:
      Math.abs(ship.north) >= BALANCE.corridorHalfWidth
        ? 'urgent'
        : Math.abs(ship.north) >= BALANCE.routeWarningOffset
          ? 'caution'
          : null,
    scheduleRemaining: Math.max(0, BALANCE.scheduleBudget - ship.delay),
    routeRemaining: Math.max(0, BALANCE.routeGraceSeconds - ship.offRouteTime),
  } as const;
}
