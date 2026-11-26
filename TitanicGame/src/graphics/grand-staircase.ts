import * as T from 'three';
import { GRAND_HALL, GRAND_STAIR as S, LEVEL_Y } from '../../shared/layout';
import {
  SHIP_HEIGHT_SCALE as H,
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
} from '../../shared/navigation';
import { bar, box, cyl, light, metric } from './building';
import type { ShipMaterials } from './materials';

const floor = LEVEL_Y[-2] * H;
const landing = S.landingY * H;
const guardHeight = 1.06;
const domeHeight = 1.52;
const roofY = 3.41;
const runner = new T.MeshStandardMaterial({ color: 0x652536, roughness: 0.91 });

function balustrade(
  g: T.Group,
  a: T.Vector3,
  b: T.Vector3,
  m: ShipMaterials,
  ends: readonly [boolean, boolean] = [true, true],
) {
  const along = b.clone().sub(a).setY(0);
  const run = along.length();
  const rise = b.y - a.y;
  along.divideScalar(run);
  const top = new T.Vector3(0, guardHeight, 0);
  const rail = bar(g, a.clone().add(top), b.clone().add(top), 0.067, m.wood);
  rail.name = 'grand-handrail';
  const profile = new T.Shape();
  profile.moveTo(0, -0.205);
  profile.lineTo(run, rise - 0.205);
  profile.lineTo(run, rise + 0.63);
  profile.lineTo(0, 0.63);
  profile.closePath();
  const body = new T.Mesh(
    new T.ExtrudeGeometry(profile, { depth: 0.13, bevelEnabled: false }),
    m.wood,
  );
  body.rotation.y = Math.atan2(-along.z, along.x);
  body.position.copy(a).addScaledVector(new T.Vector3(-along.z, 0, along.x), -0.065);
  body.castShadow = body.receiveShadow = true;
  body.name = 'grand-solid-guard';
  g.add(body);
  const cap = new T.Vector3(0, 0.622, 0);
  bar(g, a.clone().add(cap), b.clone().add(cap), 0.073, m.darkWood);
  const count = Math.ceil(run / 0.25);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = a.clone().lerp(b, t);
    const end = i === 0 || i === count;
    if (end && ends[i === 0 ? 0 : 1]) {
      box(g, p.x, p.y + 0.48, p.z, 0.24, 1.18, 0.24, m.darkWood, 'grand-newel');
      box(g, p.x, p.y + 0.045, p.z, 0.29, 0.13, 0.29, m.wood);
      cyl(g, p.x, p.y + 1.08, p.z, 0.14, 0.065, m.brass, 0.11);
    } else if (!end) {
      box(g, p.x, p.y + 0.84, p.z, 0.038, 0.44, 0.038, m.black);
    }
    if (i % 2 === 1 && !end) {
      const center = p.clone().add(new T.Vector3(0, 0.84, 0));
      const curve = new T.CatmullRomCurve3(
        Array.from({ length: 20 }, (_, k) => {
          const angle = (k * Math.PI) / 10;
          return center
            .clone()
            .addScaledVector(along, Math.sin(angle) * 0.095)
            .add(new T.Vector3(0, Math.cos(angle) * 0.135, 0));
        }),
        true,
      );
      g.add(new T.Mesh(new T.TubeGeometry(curve, 20, 0.012, 5, true), m.black));
      const stud = new T.Mesh(new T.SphereGeometry(0.034, 8, 6), m.brass);
      stud.position.copy(center);
      g.add(stud);
    }
  }
}

function flight(
  g: T.Group,
  x: number,
  width: number,
  fromZ: number,
  toZ: number,
  fromY: number,
  toY: number,
  m: ShipMaterials,
  carpetWidth: number,
) {
  const topZ = fromZ * L;
  const length = (toZ - fromZ) * L;
  const steps = Math.ceil((fromY - toY) / 0.166);
  const height = (t: number) =>
    fromY - (Math.min(steps, Math.floor(t * steps) + 1) * (fromY - toY)) / steps;
  const profile = new T.Shape();
  profile.moveTo(topZ, floor);
  for (let i = 0; i < steps; i++) {
    const y = height(i / steps + 0.000001);
    // The last A Deck tread is the room floor itself.
    if (y <= floor + 0.00001) break;
    profile.lineTo(topZ + (length * i) / steps, y);
    profile.lineTo(topZ + (length * (i + 1)) / steps, y);
  }
  const lastZ = topZ + (length * (toY === floor ? steps - 1 : steps)) / steps;
  profile.lineTo(lastZ, floor);
  profile.closePath();
  const body = new T.Mesh(
    new T.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false }),
    m.wood,
  );
  body.name = 'stair-stringer';
  body.rotation.y = -Math.PI / 2;
  body.position.x = x + width / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // The runner wraps over every nose and meets the next tread at its riser.
  const run = length / steps;
  for (let i = 0; i < steps; i++) {
    const z = topZ + run * (i + 0.5);
    const y = height((i + 0.5) / steps);
    if (y > floor + 0.00001) {
      box(g, x, y + 0.004, z, carpetWidth, 0.012, Math.abs(run), runner, 'grand-runner');
      const pitch = (fromY - toY) / steps;
      if (i > 0) box(g, x, y + pitch / 2, z - run / 2, carpetWidth, pitch, 0.009, runner);
    }
  }
  for (const side of [-1, 1]) {
    const railX = x + side * (width / 2 - 0.077);
    balustrade(g, new T.Vector3(railX, fromY, topZ), new T.Vector3(railX, toY, topZ + length), m);
  }
}

function dome(ship: T.Group, m: ShipMaterials) {
  const g = metric(ship, 0, roofY, S.dome.z);
  const x = S.dome.width,
    z = S.dome.length,
    h = domeHeight;
  const glass = new T.Mesh(
    new T.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new T.MeshStandardMaterial({
      color: 0xc1d6d4,
      roughness: 0.48,
      opacity: 0.64,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  );
  glass.scale.set(x, h, z);
  glass.name = 'entrance-skylight';
  g.add(glass);
  for (const elevation of [0, Math.PI / 5, Math.PI / 3]) {
    const ring = new T.CatmullRomCurve3(
      Array.from({ length: 48 }, (_, i) => {
        const a = (i * Math.PI) / 24;
        return new T.Vector3(
          x * Math.cos(a) * Math.cos(elevation),
          h * Math.sin(elevation),
          z * Math.sin(a) * Math.cos(elevation),
        );
      }),
      true,
    );
    g.add(
      new T.Mesh(new T.TubeGeometry(ring, 64, elevation === 0 ? 0.065 : 0.024, 6, true), m.black),
    );
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const rib = new T.CatmullRomCurve3(
      Array.from({ length: 13 }, (_, j) => {
        const e = (j * Math.PI) / 24;
        return new T.Vector3(
          x * Math.cos(a) * Math.cos(e),
          h * Math.sin(e),
          z * Math.sin(a) * Math.cos(e),
        );
      }),
    );
    g.add(new T.Mesh(new T.TubeGeometry(rib, 16, 0.026, 6, false), m.black));
  }
  cyl(g, 0, h, 0, 0.12, 0.09, m.brass);
}

export function buildGrandStaircase(ship: T.Group, m: ShipMaterials) {
  const g = metric(ship);
  g.name = 'deck-passengers-structure';
  const span = S.wellWidth * W;
  const length = (S.landingBack - S.landingFront) * L;
  const back = S.landingBack * L;
  box(
    g,
    0,
    (floor + landing) / 2,
    back - length / 2,
    span,
    landing - floor,
    length,
    m.darkWood,
    'grand-landing',
  );
  const wallHeight = 3.25 * H;
  box(
    g,
    0,
    (landing + wallHeight) / 2,
    back + 0.085,
    span,
    wallHeight - landing,
    0.23,
    m.wood,
    'grand-clock-bulkhead',
  );
  const topZ = S.top * L;
  const mainRail = S.mainWidth / 2 - 0.077;
  const front = S.landingFront * L;
  box(
    g,
    0,
    landing + 0.004,
    front + 0.97,
    span - 0.28,
    0.012,
    1.94,
    runner,
    'grand-landing-runner',
  );
  flight(g, 0, S.mainWidth, S.top, S.landingFront, 0, landing, m, 3.12);
  // The foot of the central flight reads as a paneled A Deck bulkhead, with
  // real openings on either side for the returns.
  box(g, 0, floor + 1.32, topZ - 0.028, S.mainWidth - 0.11, 2.64, 0.09, m.darkWood);
  box(g, 0, floor + 0.11, topZ - 0.074, S.mainWidth - 0.1, 0.22, 0.08, m.wood);
  for (const x of [-1.49, 0, 1.49]) {
    box(g, x, floor + 1.43, topZ - 0.081, 1.35, 2.14, 0.061, m.wood);
    box(g, x, floor + 1.43, topZ - 0.12, 1.16, 1.94, 0.043, m.darkWood);
  }
  for (const side of [-1, 1]) {
    flight(g, side * S.wingX * W, S.wingWidth, S.landingFront, S.foot, landing, floor, m, 1.02);
    const x = side * (span / 2 + 0.028);
    // The gallery is carried by continuous paneled walls down to A Deck.
    box(
      g,
      x,
      (floor - 0.02) / 2,
      (topZ + back) / 2,
      0.19,
      -floor - 0.02,
      back - topZ,
      m.darkWood,
      'grand-gallery-support',
    );
    balustrade(g, new T.Vector3(x, 0, topZ), new T.Vector3(x, 0, back - 0.04), m);
    // Close the transverse edges above both returns while leaving the central entry open.
    balustrade(g, new T.Vector3(side * mainRail, 0, topZ), new T.Vector3(x, 0, topZ), m, [
      false,
      false,
    ]);
    const innerWing = S.wingX * W - S.wingWidth / 2 + 0.077;
    balustrade(
      g,
      new T.Vector3(side * mainRail, landing, front),
      new T.Vector3(side * innerWing, landing, front),
      m,
      [false, false],
    );
  }
  const rearGuardZ = back + 0.05;
  box(g, 0, (floor + landing) / 2, rearGuardZ, span, landing - floor, 0.23, m.darkWood);
  for (const x of [-span / 2 + 0.11, -1.44, 1.44, span / 2 - 0.11]) {
    box(
      g,
      x,
      (landing + wallHeight) / 2,
      back - 0.065,
      0.15,
      wallHeight - landing,
      0.13,
      m.darkWood,
    );
    for (const y of [landing + 0.12, 1.18, 3.45])
      box(g, x, y, back - 0.09, 0.23, 0.13, 0.18, m.wood);
  }
  for (const x of [-2.67, 0, 2.67]) {
    box(g, x, 1.82, back - 0.052, x === 0 ? 2.65 : 2.22, 2.65, 0.048, m.darkWood);
    box(g, x, 1.82, back - 0.086, x === 0 ? 2.43 : 2, 2.42, 0.04, m.wood);
  }
  const pediment = new T.Shape();
  pediment.moveTo(-1.36, 0);
  pediment.lineTo(1.36, 0);
  pediment.absarc(0, 0, 1.36, 0, Math.PI, false);
  const crest = new T.Mesh(
    new T.ExtrudeGeometry(pediment, { depth: 0.18, bevelEnabled: false }),
    m.darkWood,
  );
  crest.position.set(0, 1.98, back - 0.24);
  crest.castShadow = crest.receiveShadow = true;
  g.add(crest);
  const archivolt = new T.Mesh(new T.TorusGeometry(1.34, 0.036, 8, 48, Math.PI), m.brass);
  archivolt.position.set(0, 1.98, back - 0.256);
  g.add(archivolt);
  box(g, 0, 1.95, back - 0.155, 2.8, 0.11, 0.22, m.darkWood);
  const clock = cyl(g, 0, 2.51, back - 0.27, 0.51, 0.11, m.brass);
  clock.rotation.x = Math.PI / 2;
  cyl(g, 0, 2.51, back - 0.332, 0.441, 0.02, m.ivory).rotation.x = Math.PI / 2;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    box(
      g,
      0.37 * Math.sin(angle),
      2.51 + 0.37 * Math.cos(angle),
      back - 0.343,
      0.021,
      0.061,
      0.009,
      m.black,
    ).rotation.z = -angle;
  }
  for (const tip of [
    [-0.14, 2.68],
    [0.21, 2.34],
  ]) {
    bar(
      g,
      new T.Vector3(0, 2.51, back - 0.353),
      new T.Vector3(tip[0], tip[1], back - 0.353),
      0.009,
      m.black,
    );
  }
  for (const x of [-2.67, 2.67])
    light(g, x, 2.18, back - 0.35, 2.6, 0xffd5a0, new T.Vector3(x, 2.18, back - 0.11));
  const sideWall = (GRAND_HALL.w / 2 - 0.075) * W;
  for (const side of [-1, 1]) {
    const x = side * sideWall;
    const pilasterZ = [-5.64, -4.91, -4.13, -3.39].map((z) => z * L);
    for (const z of pilasterZ) {
      box(g, x - side * 0.041, wallHeight / 2, z, 0.19, wallHeight, 0.24, m.darkWood);
      for (const y of [0.1, 1.18, wallHeight - 0.13])
        box(g, x - side * 0.073, y, z, 0.24, 0.14, 0.33, m.wood);
    }
    for (let i = 1; i < pilasterZ.length; i++) {
      const a = pilasterZ[i - 1] + 0.25;
      const b = pilasterZ[i] - 0.25;
      box(g, x - side * 0.018, 2.26, (a + b) / 2, 0.055, 1.82, b - a, m.darkWood);
      box(g, x - side * 0.048, 2.26, (a + b) / 2, 0.03, 1.64, b - a - 0.17, m.wood);
    }
  }
  const chandelierZ = S.dome.z * L;
  const chandelierLight = new T.PointLight(0xffe3bb, 11, 12, 2);
  chandelierLight.position.set(0, 2.82, chandelierZ);
  g.add(chandelierLight);
  bar(
    g,
    new T.Vector3(0, roofY * H + domeHeight, chandelierZ),
    new T.Vector3(0, 2.99, chandelierZ),
    0.028,
    m.brass,
  );
  cyl(g, 0, 2.98, chandelierZ, 0.2, 0.12, m.brass);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const x = Math.sin(angle) * 0.53,
      z = chandelierZ + Math.cos(angle) * 0.53;
    bar(g, new T.Vector3(0, 2.98, chandelierZ), new T.Vector3(x, 2.86, z), 0.024, m.brass);
    cyl(g, x, 2.94, z, 0.081, 0.15, m.ivory, 0.037);
  }
  dome(ship, m);
}
