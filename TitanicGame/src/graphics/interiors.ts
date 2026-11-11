import * as T from 'three';
import type { ShipMaterials } from './materials';
import { gaugeFace } from './materials';
import type { BoilerControl } from '../../shared/boiler-controls';
import { buildFiringTool } from './firing-tool';
import { box, cyl, bar, metric, point, plaque, light } from './building';
import {
  LEVEL_Y,
  SHAFT,
  CABIN_DOORS,
  OFFICER_DOORS,
  BOILERS,
  MACHINERY_CEILING,
  STAIR_WIDTH,
  AUXILIARY_PUMPS,
  DOORWAYS,
  VENTILATORS,
} from '../../shared/layout';
import { STATIONS, WALLS } from '../../shared/world';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_HEIGHT_SCALE as H,
  SHIP_LENGTH_SCALE as L,
} from '../../shared/navigation';

export function buildStairways(g: T.Group, m: ShipMaterials) {
  const root = metric(g);
  root.name = 'v7-stairways';
  for (const station of STATIONS.filter((s) =>
    [
      'deck-passengers',
      'deck-aft-passengers',
      'deck-engine',
      'deck-forecastle',
      'deck-poop',
    ].includes(s.id),
  )) {
    const p = new T.Group();
    p.name = station.id + '-structure';
    root.add(p);
    const passenger = station.id.includes('passengers'),
      machinery = station.id === 'deck-engine';
    const width = passenger ? 2.45 : STAIR_WIDTH,
      paint = passenger ? m.darkWood : m.steel;
    const route = station.route!.map(point);
    if (station.id === 'deck-forecastle' || station.id === 'deck-poop') {
      const top = route[1],
        direction = station.id === 'deck-forecastle' ? -1 : 1;
      for (const side of [-1, 1]) {
        const x = top.x + side * (width / 2 - 0.08);
        box(
          p,
          x,
          -0.32,
          top.z + direction * 0.045,
          0.2,
          0.65,
          0.09,
          m.steel,
          'stair-mounting-plate',
        );
        for (const y of [-0.53, -0.14])
          cyl(p, x, y, top.z + direction * 0.1, 0.035, 0.04, m.brass).rotation.x = Math.PI / 2;
      }
    }

    const railPosts = new Set<string>();
    // End decks already provide their landings. Only intermediate machinery
    // turns need new plates. Merge each U turn into one non-overlapping slab.
    if (machinery)
      for (let i = 1; i < route.length; ) {
        if (Math.abs(route[i].y - route[i - 1].y) > 0.01) {
          i++;
          continue;
        }
        const start = i - 1,
          y = route[start].y;
        while (i < route.length && Math.abs(route[i].y - y) < 0.01) i++;
        if (y <= SHAFT.floor * H + 0.01) continue;
        const flat = route.slice(start, i);
        let x0 = Math.min(...flat.map((v) => v.x)) - width / 2,
          x1 = Math.max(...flat.map((v) => v.x)) + width / 2;
        let z0 = Math.min(...flat.map((v) => v.z)) - width / 2,
          z1 = Math.max(...flat.map((v) => v.z)) + width / 2;
        for (const [edge, near] of [
          [route[start], route[start - 1]],
          [route[i - 1], route[i]],
        ] as const) {
          if (!near) continue;
          if (near.z > edge.z + 0.01) z1 = Math.min(z1, edge.z);
          if (near.z < edge.z - 0.01) z0 = Math.max(z0, edge.z);
        }
        const slab = box(
          p,
          (x0 + x1) / 2,
          y - 0.1 + (y === 0 ? 0.04 : 0),
          (z0 + z1) / 2,
          x1 - x0,
          0.2,
          z1 - z0,
          paint,
          'stair-landing',
        );
        slab.userData.floorHeight = y;
        // Outer turn guard; the inner side stays open to the next flight.
        if (start > 0) {
          const outer = flat.some((v) => v.z > 9 * L) ? z1 : z0;
          bar(p, new T.Vector3(x0, y + 1, outer), new T.Vector3(x1, y + 1, outer), 0.032, m.steel);
          for (const x of [x0, x1])
            bar(p, new T.Vector3(x, y, outer), new T.Vector3(x, y + 1, outer), 0.026, m.black);
        }
      }
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i],
        rise = b.y - a.y,
        run = Math.hypot(b.x - a.x, b.z - a.z);
      if (a.distanceTo(b) < 0.01) continue;
      const normal = new T.Vector3(b.z - a.z, 0, a.x - b.x)
        .normalize()
        .multiplyScalar(width / 2 - 0.04);
      if (Math.abs(rise) > 0.01) {
        const steps = Math.ceil(Math.abs(rise) / 0.175);
        for (let k = 0; k < steps; k++) {
          if (!machinery && k === steps - 1 && b.y === route.at(-1)!.y) continue; // Only the final wooden deck replaces a tread.
          const c = a.clone().lerp(b, (k + 0.5) / steps),
            top = a.y + (rise * (k + 1)) / steps;
          const tread = box(
            p,
            c.x,
            top - 0.085,
            c.z,
            width,
            0.17,
            run / steps,
            paint,
            'stair-tread',
          );
          tread.rotation.y = -Math.atan2(b.x - a.x, b.z - a.z);
          const edge = c
            .clone()
            .addScaledVector(
              new T.Vector3(b.x - a.x, 0, b.z - a.z).normalize(),
              (-run / steps) * 0.46,
            );
          const nosing = box(
            p,
            edge.x,
            top + 0.008,
            edge.z,
            width,
            0.016,
            0.028,
            m.brass,
            'tread-nosing',
          );
          nosing.rotation.y = tread.rotation.y;
        }
        for (const side of [-1, 1]) {
          const c = a
            .clone()
            .addScaledVector(normal, side)
            .add(new T.Vector3(0, -0.2, 0));
          const d = b
            .clone()
            .addScaledVector(normal, side)
            .add(new T.Vector3(0, -0.2, 0));
          const beam = box(
            p,
            (c.x + d.x) / 2,
            (c.y + d.y) / 2,
            (c.z + d.z) / 2,
            0.12,
            c.distanceTo(d),
            0.24,
            m.black,
            'stair-stringer',
          );
          beam.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().sub(c).normalize());
        }
      }
      if (
        station.id === 'deck-forecastle' &&
        Math.abs(rise) < 0.01 &&
        a.y < -0.1 &&
        a.y > LEVEL_Y[2] * H + 0.1
      ) {
        box(
          p,
          a.x,
          a.y - 0.085,
          (a.z + b.z) / 2,
          width,
          0.17,
          run,
          m.steel,
          'external-stair-landing',
        );
        const floor = LEVEL_Y[2] * H,
          height = a.y - 0.17 - floor;
        for (const side of [-1, 1]) {
          const x = a.x + side * (width / 2 - 0.13),
            z = (a.z + b.z) / 2;
          box(p, x, floor + height / 2, z, 0.12, height, 0.14, m.steel, 'stair-support-column');
          box(p, x, floor + 0.06, z, 0.28, 0.12, 0.33, m.steel, 'stair-support-foot');
        }
      }
      if (machinery && Math.abs(rise) < 0.01) continue;
      for (const side of [-1, 1]) {
        const c = a.clone().addScaledVector(normal, side),
          d = b.clone().addScaledVector(normal, side);
        bar(
          p,
          c.clone().add(new T.Vector3(0, 1, 0)),
          d.clone().add(new T.Vector3(0, 1, 0)),
          0.032,
          passenger ? m.darkWood : m.steel,
        );
        const posts = Math.max(1, Math.ceil(c.distanceTo(d) / (passenger ? 0.4 : 2)));
        for (let n = 0; n <= posts; n++) {
          const v = c.clone().lerp(d, n / posts);
          const key = v
            .toArray()
            .map((n) => Math.round(n * 1000))
            .join(',');
          if (railPosts.has(key)) continue;
          railPosts.add(key);
          if (passenger) {
            const end = n === 0 || n === posts;
            box(
              p,
              v.x,
              v.y + 0.5,
              v.z,
              end ? 0.11 : 0.045,
              1,
              end ? 0.11 : 0.045,
              m.darkWood,
              'stair-rail-post',
            );
            if (end) cyl(p, v.x, v.y + 1.035, v.z, 0.075, 0.07, m.brass);
          } else
            bar(p, v, v.clone().add(new T.Vector3(0, 1, 0)), 0.026, m.black).name =
              'stair-rail-post';
        }
      }
    }
  }
  // A continuous casing closes every intermediate floor. Only the top and
  // bottom landings have doorways; the entire camera path stays inside it.
  const x0 = (SHAFT.x - SHAFT.w / 2) * W,
    x1 = (SHAFT.x + SHAFT.w / 2) * W;
  const z0 = (SHAFT.z - SHAFT.d / 2) * L,
    z1 = (SHAFT.z + SHAFT.d / 2) * L;
  const bottom = SHAFT.floor * H,
    top = SHAFT.roof * H;
  const paint = new T.MeshStandardMaterial({ color: 0x5b665f, roughness: 0.89, metalness: 0.17 });
  box(
    root,
    x0,
    (bottom + top) / 2,
    (z0 + z1) / 2,
    0.15,
    top - bottom,
    z1 - z0,
    paint,
    'stair-casing-port',
  );
  box(
    root,
    x1,
    (bottom + top) / 2,
    (z0 + z1) / 2,
    0.15,
    top - bottom,
    z1 - z0,
    paint,
    'stair-casing-starboard',
  );
  box(
    root,
    (x0 + x1) / 2,
    (bottom + top) / 2,
    z1,
    x1 - x0,
    top - bottom,
    0.15,
    paint,
    'stair-casing-aft',
  );
  const doorX = -4.75 * W,
    doorW = 1.65,
    doorH = 2.45;
  for (const [a, b] of [
    [x0, doorX - doorW / 2],
    [doorX + doorW / 2, x1],
  ])
    box(
      root,
      (a + b) / 2,
      (bottom + top) / 2,
      z0,
      b - a,
      top - bottom,
      0.15,
      paint,
      'stair-casing-front',
    );
  for (const [a, b] of [
    [bottom + doorH, 0],
    [doorH, top],
  ])
    box(root, doorX, (a + b) / 2, z0, doorW, b - a, 0.15, paint, 'stair-door-header');
  box(root, (x0 + x1) / 2, top, (z0 + z1) / 2, x1 - x0, 0.15, z1 - z0, m.roof, 'stair-casing-roof');
  for (let i = 0; i <= 6; i++) {
    const y = (bottom * i) / 6;
    light(root, doorX, y + 2.7, i % 2 ? z1 - 0.65 : z0 + 0.65, 22);
    if (i === 6) plaque(root, 'BOAT DECK', doorX, y + 2.15, z0 + 0.09, 1.35);
  }
  plaque(root, 'ENGINE ROOM', doorX, 2.8, z0 - 0.09, 1.8);
  // Passenger stair entrance is a complete house, with a small framed skylight.
  const dome = metric(g, 0, 3.41, -4.65);
  const glass = new T.Mesh(
    new T.SphereGeometry(1.35, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    m.glass,
  );
  glass.scale.z = 1.8;
  glass.name = 'entrance-skylight';
  dome.add(glass);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2,
      b = ((i + 1) / 48) * Math.PI * 2;
    bar(
      dome,
      new T.Vector3(Math.cos(a) * 1.35, 0, Math.sin(a) * 2.43),
      new T.Vector3(Math.cos(b) * 1.35, 0, Math.sin(b) * 2.43),
      0.035,
      m.brass,
    );
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const path = new T.CatmullRomCurve3(
      Array.from({ length: 13 }, (_, j) => {
        const t = (j * Math.PI) / 24;
        return new T.Vector3(
          Math.cos(a) * 1.35 * Math.cos(t),
          1.35 * Math.sin(t),
          Math.sin(a) * 2.43 * Math.cos(t),
        );
      }),
    );
    dome.add(new T.Mesh(new T.TubeGeometry(path, 12, 0.018, 5, false), m.brass));
  }
  for (const side of [-1, 1]) {
    const entrance = metric(g, side * 3, 0, -5.325);
    entrance.rotation.y = (side * Math.PI) / 2;
    plaque(entrance, 'FIRST CLASS ENTRANCE', 0, 2.75, 0.11, 2.2);
    const aft = metric(g, side * 2.4, 0, 14.625);
    aft.rotation.y = (side * Math.PI) / 2;
    plaque(aft, 'AFT ENTRANCE', 0, 2.75, 0.11, 1.8);
  }
}

function closedDoor(
  g: T.Object3D,
  z: number,
  x: number,
  y: number,
  m: ShipMaterials,
  label: string,
) {
  const p = metric(g, x, y, z);
  p.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
  box(p, 0, 1.05, -0.015, 1.05, 2.1, 0.1, m.darkWood, 'closed-cabin-door');
  for (const side of [-1, 1])
    box(p, side * 0.59, 1.12, 0.015, 0.09, 2.24, 0.13, m.ivory, 'door-jamb');
  box(p, 0, 2.22, 0.015, 1.27, 0.1, 0.13, m.ivory, 'door-lintel');
  for (const h of [0.55, 1.5]) box(p, 0, h, 0.045, 0.78, 0.67, 0.028, m.wood, 'door-panel');
  cyl(p, 0.37, 1.03, 0.13, 0.045, 0.08, m.brass).rotation.x = Math.PI / 2;
  plaque(p, label, 0, 1.91, 0.064, 0.45);
}
export function buildPassengerDetails(g: T.Group, m: ShipMaterials) {
  const y = LEVEL_Y[-2];
  for (const side of [-1, 1])
    for (const [i, z] of CABIN_DOORS.entries())
      closedDoor(g, z, side * 1.59, y, m, 'A' + (side < 0 ? 20 : 30) + (i + 1));
  const carpet = new T.MeshStandardMaterial({ color: 0x6a302b, roughness: 1 });
  box(g, 0, y + 0.004, -13.5, 2.6, 0.012, 14.2, carpet, 'corridor-runner');
  for (const x of [-1.25, 1.25]) box(g, x, y + 0.014, -13.5, 0.035, 0.008, 14.2, m.brass);
  // Rooms have full walls above the dado, adjoining at edges rather than
  // two overlapping opaque boxes. Closed cabins need no empty interiors.
  for (const wall of WALLS.filter((w) => w.level === -2 && !w.prop)) {
    box(g, wall.x, y + 0.43, wall.z, wall.w, 0.86, wall.d, m.darkWood, 'passenger-dado');
    box(g, wall.x, y + 0.88, wall.z, wall.w, 0.04, wall.d, m.brass);
    box(g, wall.x, y + 1.7, wall.z, wall.w, 1.6, wall.d, m.ivory, 'passenger-wall');
  }
  for (const z of [-18, -13, -8, -3, 2, 7, 12, 17, 22]) {
    const p = metric(g, 0, y, z);
    cyl(p, 0, 2.55, 0, 0.16, 0.08, m.brass);
    light(p, 0, 2.45, 0, 30);
  }
  for (const [z, text] of [
    [-6.3, 'STATEROOMS'],
    [9.8, 'DINING SALOON'],
  ] as const)
    plaque(metric(g, 0, y, z), text, 0, 2.35, 0.12, 1.9);
  // A quiet reading corner with filled bookshelves and period panelling.
  for (const side of [-1, 1]) {
    const p = metric(g, side * 6.12, y, 4.4);
    p.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    box(p, 0, 1.05, 0, 4.1, 2.1, 0.38, m.darkWood);
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 22; i++) {
        const cover = new T.MeshStandardMaterial({
          color: [0x3c4c41, 0x633e31, 0x3c4655, 0x7d6241][i % 4],
          roughness: 0.9,
        });
        box(p, -1.85 + i * 0.17, 0.4 + row * 0.55, 0.2, 0.12, 0.4 + (i % 3) * 0.025, 0.15, cover);
      }
    for (const z of [-4.8, 10.6, 21.1]) {
      const p = metric(g, side * 6.4, y, z - 0.05);
      plaque(p, z < 0 ? 'PROMENADE' : 'A DECK', 0, 2.3, 0.05, 1.3);
    }
  }
}

export function buildOfficerDetails(g: T.Group, m: ShipMaterials) {
  // Wall-mounted lifebelts, rope lashings and hose cases stay out of the walkways.
  for (const side of [-1, 1])
    for (const z of [-17.5, -10.8]) {
      const p = metric(g, side * (z < -16 ? 6.69 : 5.64), 0, z);
      p.rotation.y = (side * Math.PI) / 2;
      box(p, 0, 1.65, -0.03, 0.62, 0.78, 0.09, m.darkWood, 'life-ring-backboard');
      for (let i = 0; i < 8; i++) {
        const ring = new T.Mesh(
          new T.TorusGeometry(0.27, 0.065, 7, 6, Math.PI / 4),
          i % 2 ? m.ivory : m.red,
        );
        ring.position.set(0, 1.68, 0.045);
        ring.rotation.z = (i * Math.PI) / 4;
        p.add(ring);
      }
      const rope = new T.Mesh(new T.TorusGeometry(0.37, 0.012, 5, 32), m.rope);
      rope.position.set(0, 1.68, 0.04);
      p.add(rope);
      bar(p, new T.Vector3(-0.25, 1.38, 0.05), new T.Vector3(-0.25, 1.98, 0.05), 0.01, m.rope);
      bar(p, new T.Vector3(0.25, 1.38, 0.05), new T.Vector3(0.25, 1.98, 0.05), 0.01, m.rope);
    }

  // Real door openings have headers and frames, instead of ending in the sky.
  for (const door of DOORWAYS) {
    const p = metric(g, door.x, 0, door.z),
      width = door.w > door.d ? door.w * W : door.d * L,
      depth = door.w > door.d ? door.d * L : door.w * W;
    if (door.d > door.w) p.rotation.y = Math.PI / 2;
    box(p, 0, (2.32 + 3.16 * H) / 2, 0, width, 3.16 * H - 2.32, depth, m.ivory, 'doorway-header');
    box(p, 0, 3.205 * H, 0, width, 0.09 * H, depth + 0.04, m.darkWood, 'doorway-cornice');
    for (const side of [-1, 1])
      box(
        p,
        side * (width / 2 - 0.035),
        1.16,
        0,
        0.07,
        2.32,
        depth + 0.04,
        m.darkWood,
        'open-door-jamb',
      );
    box(p, 0, 2.32, 0, width, 0.07, depth + 0.04, m.darkWood, 'open-door-lintel');
  }
  for (const vent of VENTILATORS) {
    const p = metric(g, vent.x, 0, vent.z);
    p.name = 'aft-ventilator';
    box(p, 0, 0.65, 0, vent.w * W, 1.3, vent.d * L, m.ivory);
    box(p, 0, 1.36, 0, vent.w * W + 0.16, 0.12, vent.d * L + 0.16, m.roof);
    for (let i = 0; i < 8; i++)
      for (const side of [-1, 1])
        box(
          p,
          0,
          0.2 + i * 0.12,
          side * ((vent.d * L) / 2 + 0.012),
          vent.w * W - 0.25,
          0.045,
          0.025,
          m.black,
          'vent-louvre',
        );
  }
  for (const side of [-1, 1])
    for (const [i, z] of OFFICER_DOORS.entries())
      closedDoor(g, z, side * 3.7, 0, m, side > 0 ? (i ? 'OFFICER' : 'CAPTAIN') : 'OFFICER');
  // Wireless: working room to port, separate apparatus room to starboard,
  // and a passage behind both, with every door opening into that passage.
  const p = metric(g, -2.6, 0, -8);
  box(p, 0, 0.5, 0, 3.65, 1, 0.95, m.darkWood, 'wireless-desk');
  for (const x of [-1.1, 0.1, 1.2]) {
    box(p, x, 1.28, -0.15, 0.85, 0.56, 0.35, m.black, 'wireless-instrument');
    for (const dx of [-0.23, 0.23]) {
      const dial = cyl(p, x + dx, 1.29, 0.045, 0.09, 0.04, m.brass);
      dial.rotation.x = Math.PI / 2;
    }
  }
  for (const x of [-1.4, -0.7]) cyl(p, x, 1.75, -0.22, 0.06, 0.33, m.brass);
  box(p, 0.8, 1.03, 0.3, 0.45, 0.035, 0.2, m.ivory);
  box(p, 1.3, 1.09, 0.29, 0.27, 0.06, 0.1, m.black);
  plaque(p, 'MARCONI', 0, 1.86, -0.1, 1.15);
  light(p, 0, 2.75, 0.3, 22);
  const copy = metric(g, -4.5, 0, -8.85);
  box(copy, 0, 0.85, 0, 1.4, 0.12, 0.55, m.darkWood, 'second-wireless-desk');
  for (const x of [-0.55, 0.55]) box(copy, x, 0.4, 0, 0.1, 0.8, 0.4, m.darkWood);
  box(copy, -0.15, 0.93, 0, 0.55, 0.025, 0.36, m.ivory, 'copy-slips');
  cyl(copy, 0.4, 1.02, 0, 0.08, 0.17, m.brass);
  plaque(copy, 'COPY', 0, 1.2, -0.12, 0.55);
  light(copy, 0, 2.7, 0, 12);
  const apparatus = metric(g, 2.8, 0, -8);
  box(apparatus, 0, 1.1, 0, 2.6, 2.2, 0.6, m.darkWood, 'wireless-apparatus');
  for (const x of [-0.85, 0, 0.85]) {
    cyl(apparatus, x, 1.4, 0.4, 0.2, 0.75, m.brass);
    for (let i = 0; i < 12; i++) {
      const coil = new T.Mesh(new T.TorusGeometry(0.22, 0.018, 5, 16), m.wood);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(x, 1.08 + i * 0.055, 0.4);
      apparatus.add(coil);
    }
  }
  plaque(apparatus, 'APPARATUS', 0, 2, 0.34, 1.4);
  light(apparatus, 0, 2.8, 1, 18);
  for (const [x, z, text, width, height] of [
    [4.4, -10.2, 'BINOCULARS', 1.6, 2],
    [0, -10, 'WATCH STORES', 1.6, 1.6],
  ] as const) {
    box(g, x, height / 2, z, width, height, 0.4, m.darkWood);
    box(g, x, height / 2, z + 0.215, width - 0.15, height - 0.15, 0.025, m.wood);
    plaque(metric(g, x, 0, z + 0.25), text, 0, height * H - 0.3, 0.04, width * W - 0.2);
  }
  for (const [x, z, text] of [
    [-2.6, -7.5, 'WIRELESS'],
    [2.6, -7.5, 'APPARATUS'],
    [4.4, -9.1, 'WATCH ROOM'],
  ] as const)
    plaque(metric(g, x, 0, z), text, 0, 2.6, 0.31, 1.55);
  for (const x of [-2.85, 2.85])
    for (const z of [-15.5, -11.5]) light(metric(g, x, 0, z), 0, 2.85, 0, 20);
}

export function buildBoilerRoom(g: T.Group, m: ShipMaterials) {
  const root = metric(g, 0, LEVEL_Y[-1], 0);
  root.name = 'v6-no6-stokehold';
  const iron = new T.MeshStandardMaterial({ color: 0x232924, metalness: 0.62, roughness: 0.79 });
  const rust = new T.MeshStandardMaterial({ color: 0x634431, metalness: 0.4, roughness: 0.94 });
  const coal = new T.MeshStandardMaterial({ color: 0x10120f, roughness: 1 });
  const lagging = new T.MeshStandardMaterial({ color: 0x8d8c72, roughness: 1 });
  const clinkerPaint = new T.MeshStandardMaterial({ color: 0x686c64, roughness: 1 });
  const fire: T.Mesh[] = [],
    lamps: T.PointLight[] = [],
    dampers: T.Object3D[] = [],
    gauges: T.Object3D[] = [],
    doors: T.Object3D[] = [];
  const controls: T.Object3D[] = [],
    occluders: T.Object3D[] = [],
    clinkers: T.Object3D[] = [],
    ashMounds: T.Object3D[] = [],
    stopWheels: T.Object3D[] = [],
    steamJets: T.Object3D[] = [],
    fuelBeds: T.Object3D[] = [];
  const tag = <O extends T.Object3D>(object: O, control: BoilerControl) => {
    object.userData.boilerControl = control;
    controls.push(object);
    return object;
  };
  for (const b of BOILERS) {
    const p = new T.Group();
    p.position.set(b.x * W, 0, b.z * L);
    p.name = b.id + '-shell';
    root.add(p);
    const barrel = cyl(p, 0, 2.5, 0, b.radius, b.length, iron);
    barrel.rotation.x = Math.PI / 2;
    barrel.name = 'scotch-boiler';
    occluders.push(barrel);
    for (const z of [-2, 2]) box(p, 0, 0.32, z, 4.3, 0.5, 0.5, m.black, 'boiler-saddle');
    for (const z of [-3.08, 3.08]) {
      const rim = new T.Mesh(new T.TorusGeometry(2.34, 0.065, 8, 48), rust);
      rim.position.set(0, 2.5, z);
      p.add(rim);
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI) / 12;
        const bolt = new T.Mesh(new T.SphereGeometry(0.045, 6, 4), iron);
        bolt.position.set(Math.cos(a) * 2.2, 2.5 + Math.sin(a) * 2.2, z + (z > 0 ? 0.025 : -0.025));
        p.add(bolt);
      }
      for (const x of [-1.15, 0, 1.15]) {
        const mouth = cyl(p, x, 1.25, z, 0.46, 0.08, m.black);
        mouth.rotation.x = Math.PI / 2;
        const glow = cyl(
          p,
          x,
          1.25,
          z + (z > 0 ? 0.055 : -0.055),
          0.365,
          0.03,
          new T.MeshStandardMaterial({ color: 0x6e260c, emissive: 0xff6a12, emissiveIntensity: 2 }),
        );
        glow.rotation.x = Math.PI / 2;
        glow.userData.bank = b.index;
        glow.userData.zone = [-1.15, 0, 1.15].indexOf(x);
        fire.push(glow);
        const zone = glow.userData.zone;
        tag(glow, { bank: b.index, kind: 'fire', zone });
        for (let n = 0; n < 8; n++) {
          const lump = new T.Mesh(
            new T.IcosahedronGeometry(0.075 + (n % 3) * 0.015, 0),
            clinkerPaint,
          );
          lump.position.set(
            x - 0.23 + (n % 4) * 0.145,
            1.12 + Math.floor(n / 4) * 0.12,
            z + Math.sign(z) * 0.12,
          );
          lump.userData = { bank: b.index, zone, lump: n };
          tag(lump, { bank: b.index, kind: 'fire', zone });
          p.add(lump);
          clinkers.push(lump);
        }
        for (let n = 0; n < 12; n++) {
          const chunk = new T.Mesh(
            new T.IcosahedronGeometry(0.075, 0),
            new T.MeshStandardMaterial({
              color: 0x201d17,
              emissive: 0x962e07,
              emissiveIntensity: 0.35,
              roughness: 1,
            }),
          );
          chunk.position.set(
            x - 0.23 + (n % 4) * 0.15,
            1.01 + Math.floor(n / 4) * 0.075,
            z + Math.sign(z) * 0.1,
          );
          chunk.userData = { bank: b.index, zone, piece: n };
          tag(chunk, { bank: b.index, kind: 'fire', zone });
          p.add(chunk);
          fuelBeds.push(chunk);
        }
        for (const dx of [-0.19, 0, 0.19])
          box(p, x + dx, 0.99, z, 0.035, 0.035, 0.55, iron, 'furnace-grate');
        const hinge = new T.Group();
        hinge.position.set(x - 0.43, 1.25, z + (z > 0 ? 0.14 : -0.14));
        hinge.userData.bank = b.index;
        hinge.userData.zone = [-1.15, 0, 1.15].indexOf(x);
        hinge.userData.sign = z > 0 ? -1 : 1;
        p.add(hinge);
        doors.push(hinge);
        const shield = new T.Shape();
        shield.absarc(0, 0, 0.43, 0, Math.PI * 2, false);
        const peep = new T.Path();
        peep.absarc(0, 0.12, 0.085, 0, Math.PI * 2, true);
        shield.holes.push(peep);
        const door = new T.Mesh(
          new T.ExtrudeGeometry(shield, { depth: 0.07, bevelEnabled: false, curveSegments: 16 }),
          iron,
        );
        door.position.set(0.43, 0, z > 0 ? 0 : -0.07);
        door.name = 'furnace-door';
        hinge.add(door);
        tag(door, { bank: b.index, kind: 'door', zone });
        bar(
          hinge,
          new T.Vector3(0.64, -0.14, z > 0 ? 0.1 : -0.1),
          new T.Vector3(0.84, -0.1, z > 0 ? 0.1 : -0.1),
          0.025,
          m.brass,
        );
        tag(box(p, x, 0.67, z + Math.sign(z) * 0.12, 0.82, 0.25, 0.18, m.black, 'ashpan'), {
          bank: b.index,
          kind: 'ash',
          zone,
        });
        const ash = box(
          p,
          x,
          0.72,
          z + Math.sign(z) * 0.23,
          0.7,
          0.18,
          0.08,
          lagging,
          'ash-in-pan',
        );
        ash.userData = { bank: b.index, zone };
        tag(ash, { bank: b.index, kind: 'ash', zone });
        ashMounds.push(ash);
      }
      const lamp = new T.PointLight(0xff721e, 42, 8, 2);
      lamp.position.set(0, 1.5, z + (z > 0 ? 0.8 : -0.8));
      lamp.userData.bank = b.index;
      p.add(lamp);
      lamps.push(lamp);
      for (const [n, tool] of (['coal', 'slice', 'rake'] as const).entries()) {
        const rackTool = buildFiringTool(tool, m);
        rackTool.position.set(-1.8 + n * 0.28, 0.25, z + Math.sign(z) * 0.7);
        tag(rackTool, { bank: b.index, kind: 'tool', tool });
        p.add(rackTool);
        tag(
          box(
            p,
            -1.8 + n * 0.28,
            0.95,
            z + Math.sign(z) * 0.67,
            0.21,
            0.9,
            0.05,
            m.darkWood,
            'tool-rack-back',
          ),
          { bank: b.index, kind: 'tool', tool },
        );
      }
      // A small replenished coal basket makes each shovel load a physical trip.
      const basket = tag(
        box(p, 1.85, 0.35, z + Math.sign(z) * 1, 0.7, 0.7, 0.7, iron, 'firing-coal-basket'),
        { bank: b.index, kind: 'coal' },
      );
      for (let n = 0; n < 9; n++) {
        const chunk = new T.Mesh(new T.IcosahedronGeometry(0.13, 0), coal);
        chunk.position.set(((n % 3) - 1) * 0.18, 0.4, (Math.floor(n / 3) - 1) * 0.18);
        basket.add(chunk);
      }
    }
    // Steam pipe, local gauge, damper lever and smoke uptake all meet the shell.
    cyl(p, 0, 5.05, 0, 0.23, 0.8, lagging);
    box(p, 0, 5.3, 0, 1.15, 1.3, 2.3, m.black, 'boiler-uptake');
    bar(p, new T.Vector3(0, 4.7, 0), new T.Vector3(0, 5.65, 2.6), 0.13, lagging);
    const dial = cyl(p, 1.1, 2.18, 3.25, 0.31, 0.08, m.brass);
    dial.rotation.x = Math.PI / 2;
    tag(dial, { bank: b.index, kind: 'gauge' });
    const face = new T.Mesh(
      new T.CircleGeometry(0.285, 40),
      typeof document === 'undefined' ? m.ivory : gaugeFace('PSI', 300),
    );
    face.position.set(1.1, 2.18, 3.298);
    p.add(face);
    tag(face, { bank: b.index, kind: 'gauge' });
    const needle = new T.Group();
    needle.position.set(1.1, 2.18, 3.31);
    box(needle, 0, 0.09, 0, 0.018, 0.2, 0.018, m.black, 'boiler-pressure-needle');
    p.add(needle);
    needle.userData.bank = b.index;
    gauges.push(needle);
    const lever = new T.Group();
    lever.position.set(-1.8, 1.1, 3.3);
    p.add(lever);
    box(lever, 0, 0.28, 0, 0.045, 0.6, 0.045, m.brass);
    cyl(lever, 0, 0.6, 0, 0.07, 0.18, m.darkWood);
    lever.userData.bank = b.index;
    dampers.push(lever);
    tag(lever, { bank: b.index, kind: 'draught' });
    plaque(p, 'AIR', -1.8, 0.94, 3.32, 0.5);
    const stop = new T.Mesh(new T.TorusGeometry(0.22, 0.035, 8, 24), m.brass);
    stop.position.set(0, 2.65, 3.3);
    p.add(stop);
    for (const a of [0, Math.PI / 2]) {
      const spoke = box(stop, 0, 0, 0, 0.43, 0.026, 0.026, m.brass);
      spoke.rotation.z = a;
    }
    stop.userData.bank = b.index;
    tag(stop, { bank: b.index, kind: 'stop' });
    stopWheels.push(stop);
    plaque(p, 'STEAM', 0, 2.28, 3.32, 0.7);
    const relief = tag(box(p, 0.52, 2.45, 3.32, 0.12, 0.45, 0.1, m.brass, 'safety-easing-handle'), {
      bank: b.index,
      kind: 'relief',
    });
    bar(p, new T.Vector3(0.52, 2.65, 3.32), new T.Vector3(0.52, 4.7, 0.3), 0.018, m.steel);
    relief.userData.bank = b.index;
    const jet = new T.Mesh(
      new T.ConeGeometry(0.22, 1.3, 8),
      new T.MeshBasicMaterial({
        color: 0xdde6df,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    jet.position.set(0.52, 5.15, 0.3);
    jet.userData.bank = b.index;
    jet.visible = false;
    p.add(jet);
    steamJets.push(jet);
    plaque(p, 'BOILER ' + (b.index + 1), 0, 3.75, 3.17, 1.35);
  }
  for (const z of [-13.6, -6.6])
    for (const x of [-6.3, 0, 6.3]) {
      if (z === -6.6 && x === 0) continue;
      const p = new T.Group();
      p.position.set(x * W, 0, z * L);
      root.add(p);
      box(p, 0, 0.3, 0, 3.6, 0.6, 1.4, iron, 'coal-bunker-lip');
      for (let i = 0; i < 24; i++) {
        const chunk = new T.Mesh(new T.IcosahedronGeometry(0.16 + (i % 3) * 0.04, 0), coal);
        chunk.position.set(
          ((i * 13) % 23) / 7 - 1.55,
          0.64 + Math.sin(i) * 0.13,
          ((i * 7) % 11) / 11 - 0.5,
        );
        chunk.rotation.set(i, i * 0.7, i * 0.31);
        p.add(chunk);
      }
    }
  for (const z of [-13.5, -11.7, -9.8, -7.5]) {
    const zz = z * L;
    box(root, 0, 5.95, zz, 24.8, 0.24, 0.3, iron, 'stokehold-beam');
    for (const side of [-1, 1]) box(root, side * 12.25, 3, zz, 0.2, 6, 0.3, iron, 'stokehold-rib');
  }
  for (const side of [-1, 1]) {
    bar(
      root,
      new T.Vector3(side * 11.85, 5.35, -14 * L),
      new T.Vector3(side * 11.85, 5.35, 0),
      0.18,
      lagging,
    );
    for (let i = 0; i < 38; i++) {
      const rivet = new T.Mesh(new T.SphereGeometry(0.03, 5, 4), iron);
      rivet.position.set(side * 12.3, 1.1 + (i % 3) * 1.45, -47 + i * 0.7);
      root.add(rivet);
    }
  }
  for (const x of [-10, 10]) light(root, x, 4.5, -8 * L, 20, 0xffbc75);
  plaque(root, 'NO. 6 STOKEHOLD', 0, 4.5, -6 * L - 0.13, 2.5);
  // Service alley is a narrow industrial passage, not an empty second room.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) box(root, side * 3.32, 1.2, (-5.5 + i) * L, 0.12, 2.4, 0.09, rust);
  }
  return {
    fires: fire,
    lights: lamps,
    dampers,
    gauges,
    doors,
    controls,
    occluders,
    clinkers,
    ashMounds,
    stopWheels,
    steamJets,
    fuelBeds,
  };
}

export function buildMachineryWalls(g: T.Group, m: ShipMaterials) {
  const iron = new T.MeshStandardMaterial({ color: 0x353a32, roughness: 0.93, metalness: 0.32 });
  for (const w of WALLS.filter((w) => w.level === -1 && !w.prop)) {
    box(g, w.x, LEVEL_Y[-1] + 2.7, w.z, w.w, 5.4, w.d, iron, 'riveted-bulkhead');
  }
  // Junction headers complete every wall opening above its walk-through door.
  for (const z of [-6, 0])
    box(g, 0, LEVEL_Y[-1] + 3.7, z, 2.4, 3.4, 0.2, iron, 'watertight-door-header');
  for (const unit of AUXILIARY_PUMPS) {
    const p = metric(g, unit.x, LEVEL_Y[-1], unit.z);
    p.name = 'auxiliary-feed-pump';
    box(p, 0, 0.16, 0, 2.8, 0.32, 2.6, m.black);
    for (const x of [-0.8, 0.8]) {
      cyl(p, x, 1.2, 0, 0.43, 1.8, iron);
      cyl(p, x, 2.15, 0, 0.5, 0.12, m.brass);
      bar(p, new T.Vector3(x, 2.2, 0), new T.Vector3(x, 3.6, 0), 0.07, iron);
    }
    box(p, 0, 3.6, 0, 2.2, 0.2, 0.5, iron);
    const wheel = new T.Mesh(new T.TorusGeometry(0.45, 0.05, 7, 24), m.black);
    wheel.position.set(0, 1.7, 1.08);
    p.add(wheel);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      bar(
        p,
        new T.Vector3(0, 1.7, 1.08),
        new T.Vector3(Math.cos(a) * 0.43, 1.7 + Math.sin(a) * 0.43, 1.08),
        0.025,
        m.brass,
      );
    }
    const face = cyl(p, 0, 2.65, 0.5, 0.21, 0.08, m.ivory);
    face.rotation.x = Math.PI / 2;
    bar(p, new T.Vector3(1.05, 1.4, 0), new T.Vector3(unit.x < 0 ? -2 : 2, 1.4, 0), 0.12, iron);
  }
  const ceiling = metric(g, 0, MACHINERY_CEILING, 0);
  for (const z of [2, 6, 11, 16, 21, 26]) {
    box(ceiling, 0, -0.12, z * L, 24.8, 0.24, 0.25, m.black);
    light(ceiling, 0, -0.5, z * L, 20);
  }
}
