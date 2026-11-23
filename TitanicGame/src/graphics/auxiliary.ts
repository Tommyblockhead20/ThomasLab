import * as T from 'three';
import type { ShipState } from '../../shared/types';
import type { AuxiliaryControl } from '../../shared/auxiliary';
import { electricSupply } from '../../shared/auxiliary';
import { FEED_PUMPS, CONDENSERS, DYNAMOS, AFT_HATCH } from '../../shared/auxiliary-layout';
import { LEVEL_Y, PLAN_WALLS } from '../../shared/layout';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from '../../shared/navigation';
import { box, cyl, bar, metric, plaque, light } from './building';
import { gaugeFace, type ShipMaterials } from './materials';

export function buildAuxiliaryMachinery(g: T.Group, m: ShipMaterials) {
  const root = new T.Group();
  root.name = 'auxiliary-machinery';
  g.add(root);
  const controls: T.Object3D[] = [];
  const pickRoots = new Set<T.Object3D>();
  const iron = new T.MeshStandardMaterial({ color: 0x334338, roughness: 0.78, metalness: 0.45 });
  const pipe = new T.MeshStandardMaterial({ color: 0x75817a, roughness: 0.85, metalness: 0.2 });
  const waterPaint = new T.MeshStandardMaterial({
    color: 0x6daca8,
    roughness: 0.3,
    emissive: 0x193432,
  });
  const needles: { mesh: T.Object3D; value: (s: ShipState) => number }[] = [];
  const water: T.Object3D[] = [],
    wheels: { mesh: T.Object3D; value: (s: ShipState) => number }[] = [];
  const pistons: { mesh: T.Object3D; index: number; generator: boolean }[] = [];
  const pilotLamps: { mesh: T.Mesh; circuit: 'lighting' | 'ventilation' | 'wireless' }[] = [];
  const tag = (mesh: T.Object3D, c: AuxiliaryControl) => {
    mesh.userData.auxiliaryControl = c;
    controls.push(mesh);
    let pickRoot: T.Object3D = mesh;
    while (pickRoot.parent && pickRoot.parent !== root) pickRoot = pickRoot.parent;
    pickRoots.add(pickRoot);
    return mesh;
  };
  function wheel(
    p: T.Object3D,
    x: number,
    y: number,
    z: number,
    c: AuxiliaryControl,
    value: (s: ShipState) => number,
  ) {
    const stem = cyl(p, x, y, z - 0.1, 0.05, 0.2, m.steel);
    stem.rotation.x = Math.PI / 2;
    stem.name = 'valve-stem';
    const w = new T.Group();
    w.position.set(x, y, z);
    p.add(w);
    w.add(new T.Mesh(new T.TorusGeometry(0.27, 0.04, 8, 20), m.brass));
    for (const angle of [0, Math.PI / 2]) {
      const spoke = box(w, 0, 0, 0, 0.52, 0.035, 0.04, m.brass);
      spoke.rotation.z = angle;
    }
    tag(w, c);
    wheels.push({ mesh: w, value });
    return w;
  }
  function dial(
    p: T.Object3D,
    x: number,
    y: number,
    z: number,
    label: string,
    max: number,
    value: (s: ShipState) => number,
  ) {
    const housing = cyl(p, x, y, z - 0.06, 0.245, 0.1, m.black);
    housing.rotation.x = Math.PI / 2;
    housing.name = 'instrument-housing';
    const face = new T.Mesh(
      new T.CircleGeometry(0.23, 24),
      typeof document === 'undefined' ? m.ivory : gaugeFace(label, max),
    );
    face.position.set(x, y, z);
    p.add(face);
    const rim = new T.Mesh(new T.TorusGeometry(0.245, 0.025, 6, 20), m.brass);
    rim.position.set(x, y, z + 0.009);
    p.add(rim);
    const n = new T.Group();
    n.position.set(x, y, z + 0.02);
    box(n, 0, 0.075, 0, 0.015, 0.16, 0.012, m.black);
    p.add(n);
    needles.push({ mesh: n, value: (s) => value(s) / max });
  }
  function lever(
    p: T.Object3D,
    x: number,
    y: number,
    z: number,
    c: AuxiliaryControl,
    value: (s: ShipState) => number,
  ) {
    box(p, x, y, z - 0.08, 0.28, 0.55, 0.15, m.black);
    const handle = new T.Group();
    handle.position.set(x, y - 0.08, z + 0.04);
    p.add(handle);
    bar(handle, new T.Vector3(), new T.Vector3(0, 0.28, 0), 0.045, m.brass);
    cyl(handle, 0, 0.3, 0, 0.075, 0.15, m.darkWood).rotation.z = Math.PI / 2;
    tag(handle, c);
    wheels.push({ mesh: handle, value: (s) => value(s) * 0.08 - 0.04 });
  }
  for (const p of FEED_PUMPS) {
    const unit = metric(root, p.x, LEVEL_Y[-1], p.z);
    unit.name = p.id;
    box(unit, 0, 0.16, 0, 2.8, 0.32, 2.6, m.black);
    for (const x of [-0.7, 0.7]) {
      cyl(unit, x, 1, 0, 0.4, 1.4, iron);
      cyl(unit, x, 2.6, 0, 0.46, 1.25, iron);
      const rod = cyl(unit, x, 1.85, 0, 0.065, 0.65, m.brass);
      pistons.push({ mesh: rod, index: p.index, generator: false });
      rod.userData.restY = rod.position.y;
    }
    const basket = box(unit, -0.8, 0.65, 1.24, 0.65, 0.45, 0.55, m.brass, 'strainer-basket');
    tag(basket, {
      station: p.id,
      verb: 'clean-strainer',
      index: p.index,
      label: `No. ${p.index + 1} strainer`,
    });
    lever(
      unit,
      0.8,
      1.4,
      1.35,
      { station: p.id, verb: 'pump', index: p.index, label: `Feed pump ${p.index + 1}` },
      (s) => Number(s.auxiliary.feedPumps[p.index]),
    );
    dial(
      unit,
      0,
      2.15,
      1.31,
      'FLOW',
      100,
      (s) => s.auxiliary.pumpRevs[p.index] * (1 - s.auxiliary.strainers[p.index] * 0.65) * 100,
    );
    box(unit, 0, 1.6, 1.1, 2.1, 1.7, 0.4, iron, 'pump-instrument-board');
    for (const x of [-0.85, 0.85]) box(unit, x, 0.55, 1.1, 0.1, 0.65, 0.2, iron, 'pump-board-leg');
    plaque(unit, `FEED PUMP ${p.index + 1}`, 0, 0.92, 1.3175, 1.3);
    bar(unit, new T.Vector3(-0.7, 1, 0), new T.Vector3(-1.2, 1, 0), 0.12, pipe);
    bar(unit, new T.Vector3(-1.2, 1, 0), new T.Vector3(-1.2, 1, -3), 0.12, pipe);
    bar(unit, new T.Vector3(-1.2, 1, -3), new T.Vector3(-1.2, 4.5, -3), 0.12, pipe);
    bar(unit, new T.Vector3(-1.2, 4.5, -3), new T.Vector3(0, 4.5, -3), 0.12, pipe);
  }
  for (let i = 0; i < 4; i++) {
    const p = metric(root, -2.1 + i * 1.4, LEVEL_Y[-1], 1.2);
    box(p, 0, 1.3, -0.16, 0.75, 2.6, 0.4, iron, 'feedwater-panel');
    wheel(
      p,
      0,
      1.1,
      0.14,
      { station: `feed-valve-${i + 1}`, verb: 'feed', index: i, label: `Boiler ${i + 1} feed` },
      (s) => s.auxiliary.feedValves[i],
    );
    box(p, 0, 1.94, 0.08, 0.21, 0.78, 0.08, m.black);
    const level = box(p, 0, 1.6, 0.13, 0.13, 0.68, 0.035, waterPaint, 'water-glass');
    water.push(level);
    for (const y of [1.72, 2.09]) box(p, 0.17, y, 0.13, 0.16, 0.025, 0.025, m.brass);
    plaque(p, `BOILER ${i + 1}`, 0, 2.4, 0.045, 0.8);
    bar(p, new T.Vector3(0, 2.5, -0.2), new T.Vector3(0, 4.4, -0.2), 0.09, pipe);
  }
  for (const side of [-1, 1]) {
    const p = metric(root);
    const a = new T.Vector3(side * 6.8 * W, LEVEL_Y[-1] * H + 4.5, -5.7 * L);
    const b = new T.Vector3(side * 11.85, a.y, a.z);
    bar(p, a, b, 0.14, pipe);
    bar(p, b, new T.Vector3(b.x, LEVEL_Y[-1] * H + 5.35, b.z), 0.14, pipe);
  }
  // Joined headers keep the water/steam routes legible above head height.
  for (const x of [-6.8, 6.8]) {
    const p = metric(root);
    bar(
      p,
      new T.Vector3(x * W, LEVEL_Y[-1] * H + 4.5, -5.7 * L),
      new T.Vector3(x * W, LEVEL_Y[-1] * H + 4.5, 13.9 * L),
      0.14,
      pipe,
    );
    bar(
      p,
      new T.Vector3(x * W, LEVEL_Y[-1] * H + 1, 3.5 * L),
      new T.Vector3(x * W, LEVEL_Y[-1] * H + 4.5, 3.5 * L),
      0.14,
      pipe,
    );
    bar(
      p,
      new T.Vector3(x * W, LEVEL_Y[-1] * H + 4.5, 13.9 * L),
      new T.Vector3(Math.sign(x) * 5 * W, LEVEL_Y[-1] * H + 4.5, 13.9 * L),
      0.2,
      pipe,
    );
  }
  bar(
    metric(root),
    new T.Vector3(-6.8 * W, LEVEL_Y[-1] * H + 4.4, 1.2 * L - 0.2),
    new T.Vector3(6.8 * W, LEVEL_Y[-1] * H + 4.4, 1.2 * L - 0.2),
    0.13,
    pipe,
  );
  for (const x of [-6.8, 6.8])
    bar(
      metric(root),
      new T.Vector3(x * W, LEVEL_Y[-1] * H + 4.4, 1.2 * L - 0.2),
      new T.Vector3(x * W, LEVEL_Y[-1] * H + 4.5, 1.2 * L - 0.2),
      0.13,
      pipe,
    );
  for (const p of CONDENSERS) {
    const unit = metric(root, p.x, LEVEL_Y[-1], p.z);
    unit.name = p.id;
    box(unit, 0, 0.15, 0, 2.8, 0.3, 2.6, m.black);
    const shell = cyl(unit, 0, 1.8, 0, 1.12, 2.3, iron);
    shell.rotation.x = Math.PI / 2;
    for (const z of [-1.17, 1.17]) {
      const cover = cyl(unit, 0, 1.8, z, 1.2, 0.12, m.black);
      cover.rotation.x = Math.PI / 2;
    }
    wheel(
      unit,
      0.65,
      1.2,
      1.39,
      {
        station: p.id,
        verb: 'cooling',
        index: p.index,
        label: `${p.index ? 'Starboard' : 'Port'} cooling water`,
      },
      (s) => s.auxiliary.coolingValves[p.index],
    );
    dial(unit, -0.5, 2, 1.34, 'VACUUM inHg', 30, (s) => s.auxiliary.vacuum * 30);
    bar(unit, new T.Vector3(0, 2.8, 0), new T.Vector3(0, 4.5, 0), 0.23, pipe);
  }
  for (const x of [-5, 5]) {
    bar(
      metric(root),
      new T.Vector3(x * W, LEVEL_Y[-1] * H + 4.6, 13.9 * L),
      new T.Vector3(x * W, LEVEL_Y[-1] * H + 4.6, 24 * L - 1),
      0.1,
      pipe,
    );
  }
  for (const p of DYNAMOS) {
    const unit = metric(root, p.x, LEVEL_Y[-1], p.z);
    unit.name = p.id;
    box(unit, 0, 0.2, 0, 3.2, 0.4, 3.8, m.black);
    const dynamo = cyl(unit, 0, 1.2, -0.6, 0.9, 1.8, iron);
    dynamo.rotation.x = Math.PI / 2;
    for (const x of [-1, 1]) {
      cyl(unit, x, 1.5, 0.8, 0.3, 1.65, iron);
      const rod = cyl(unit, x, 0.8, 0.8, 0.065, 0.65, m.brass);
      rod.userData.restY = rod.position.y;
      pistons.push({ mesh: rod, index: p.index, generator: true });
    }
    box(unit, 0, 1.5, 1.4, 1.15, 1.4, 0.35, m.black, 'dynamo-instrument-board');
    for (const x of [-0.45, 0.45])
      box(unit, x, 0.6, 1.4, 0.12, 0.5, 0.15, iron, 'dynamo-board-leg');
    dial(unit, 0, 1.85, 1.59, 'VOLTS', 120, (s) => s.auxiliary.voltage);
    lever(
      unit,
      -0.8,
      1.2,
      1.7,
      { station: p.id, verb: 'generator', index: p.index, label: `Dynamo ${p.index + 1}` },
      (s) => Number(s.auxiliary.generators[p.index]),
    );
    wheel(
      unit,
      0.8,
      1.2,
      1.7,
      {
        station: p.id,
        verb: 'governor',
        index: p.index,
        label: `No. ${p.index + 1} steam admission`,
      },
      (s) => s.auxiliary.governors[p.index],
    );
    plaque(unit, `DYNAMO ${p.index + 1}`, 0, 0.29, 1.9175, 1.4);
    bar(unit, new T.Vector3(0, 2, -1), new T.Vector3(0, 4.6, -1), 0.1, pipe);
  }
  for (const [i, circuit] of (['lighting', 'ventilation', 'wireless'] as const).entries()) {
    const p = metric(root, -1.2 + i * 1.2, LEVEL_Y[-1], 22.5);
    box(p, 0, 1.5, -0.15, 0.75, 3, 0.4, m.black, 'feeder-cabinet');
    lever(
      p,
      0,
      1.4,
      0.15,
      { station: `circuit-${circuit}`, verb: 'circuit', circuit, label: circuit },
      (s) => Number(s.auxiliary.circuits[circuit]),
    );
    const lamp = box(
      p,
      0,
      2,
      0.07,
      0.12,
      0.1,
      0.05,
      new T.MeshStandardMaterial({ color: 0x677c49, emissive: 0x9aaa60, emissiveIntensity: 1 }),
    );
    pilotLamps.push({ mesh: lamp, circuit });
    plaque(p, circuit.toUpperCase(), 0, 2.8, 0.0675, 1.4);
  }
  const oil = metric(root, 2.3, LEVEL_Y[-1], 18.7);
  box(oil, 0, 0.65, -0.05, 0.7, 1.3, 0.45, iron);
  tag(cyl(oil, 0, 1.365, 0, 0.2, 0.13, m.brass), {
    station: 'bearing-oil',
    verb: 'lubricate',
    label: 'Bearing oil pot',
  });
  dial(oil, 0, 1, 0.2, 'OIL', 100, (s) => s.auxiliary.lubrication * 100);

  // Enclosed access ladder, with genuine holes in both intervening ceiling/deck.
  const shaft = metric(root, AFT_HATCH.x, LEVEL_Y[-1], AFT_HATCH.z);
  const height = (LEVEL_Y[2] - LEVEL_Y[-1]) * H;
  for (const x of [-0.53, 0.53])
    bar(shaft, new T.Vector3(x, 0, 0), new T.Vector3(x, height + 1, 0), 0.04, m.steel);
  for (let y = 0.3; y < height + 0.8; y += 0.3)
    bar(shaft, new T.Vector3(-0.53, y, 0), new T.Vector3(0.53, y, 0), 0.025, m.brass);
  for (const x of [(-AFT_HATCH.w * W) / 2, (AFT_HATCH.w * W) / 2])
    box(
      shaft,
      x,
      height / 2 + 1.3,
      0,
      0.1,
      height + 2.6,
      AFT_HATCH.d * L,
      iron,
      'aft-ladder-casing',
    );
  box(shaft, 0, height / 2 + 1.3, (AFT_HATCH.d * L) / 2, AFT_HATCH.w * W, height + 2.6, 0.1, iron);
  box(shaft, 0, height + 2.6, 0, AFT_HATCH.w * W, 0.12, AFT_HATCH.d * L, m.roof);
  box(
    shaft,
    0,
    (height + 2.3) / 2,
    (-AFT_HATCH.d * L) / 2,
    AFT_HATCH.w * W,
    height - 2.3,
    0.1,
    iron,
  );
  light(
    shaft,
    0,
    2.8,
    -0.7,
    12,
    undefined,
    new T.Vector3((-AFT_HATCH.w * W) / 2 + 0.05, 2.8, -0.7),
  );
  light(shaft, 0, height + 2.4, -0.7, 12, undefined, height + 2.6);
  for (const w of PLAN_WALLS.filter((w) => w.level === 2 && !w.prop))
    box(root, w.x, LEVEL_Y[2] + 1.6, w.z, w.w, 3.2, w.d, m.ivory, 'steering-house-wall');
  box(root, 0, LEVEL_Y[2] + 3.3, 29.2, 6.15, 0.18, 3.35, m.roof, 'steering-house-roof');
  box(root, 1.5, LEVEL_Y[2] + 2.8, 27.6, 1.6, 0.8, 0.16, m.ivory, 'steering-door-lintel');
  const door = metric(root, 1.5, LEVEL_Y[2], 27.6);
  plaque(door, 'STEERING ENGINES', 0, 3.05, -0.08 * L - 0.0175, 1.9);
  const steering = metric(root, 1.2, LEVEL_Y[2], 29.7);
  box(steering, 0, 0.15, 0, 2.8, 0.3, 2.2, m.black);
  for (const x of [-0.8, 0.8]) {
    cyl(steering, x, 1.15, 0, 0.38, 1.5, iron);
    cyl(steering, x, 1.95, 0, 0.43, 0.12, m.brass);
  }
  box(steering, 0, 1.65, 0.95, 2.4, 1.6, 0.36, iron, 'steering-instrument-board');
  for (const x of [-1, 1]) box(steering, x, 0.6, 0.95, 0.12, 0.6, 0.2, iron, 'steering-board-leg');
  wheel(
    steering,
    0.65,
    1.15,
    1.2,
    { station: 'steering', verb: 'steering-steam', label: 'Steering steam' },
    (s) => s.auxiliary.steeringSteam,
  );
  lever(
    steering,
    -0.65,
    1.15,
    1.2,
    { station: 'steering', verb: 'steering-set', label: 'Steering engine change-over' },
    (s) => s.auxiliary.steeringSet,
  );
  dial(steering, 0, 2.25, 1.15, 'RUDDER', 70, (s) => s.rudder * 35 + 35);
  light(metric(root, 0, LEVEL_Y[2], 29), 0, 3, 0, 20, undefined, 3.21 * H);
  for (const [z, title] of [
    [12.2, 'ENGINE ROOM'],
    [21.7, 'DYNAMO ROOM'],
  ] as const) {
    const x = z === 12.2 ? 1.6 : 0;
    box(root, x, LEVEL_Y[-1] + 4.2, z, 3, 2.4, 0.2, iron, 'machinery-door-lintel');
    plaque(metric(root, x, LEVEL_Y[-1], z), title, 0, 3.8, -0.1 * L - 0.0175, 1.8);
  }
  const lights: { lamp: T.PointLight; intensity: number }[] = [];
  root.traverse((o) => {
    if (o instanceof T.PointLight) lights.push({ lamp: o, intensity: o.intensity });
  });
  function update(ship: ShipState, time: number) {
    for (const n of needles)
      n.mesh.rotation.z = -(Math.max(0, Math.min(1, n.value(ship))) * 1.5 - 0.75) * Math.PI;
    for (const w of wheels) w.mesh.rotation.z = w.value(ship) * Math.PI * 3;
    for (let i = 0; i < water.length; i++) {
      const v = Math.max(0.01, ship.auxiliary.boilerWater[i]);
      water[i].scale.y = v;
      water[i].position.y = 1.6 + 0.34 * v;
    }
    for (const p of pistons)
      p.mesh.position.y =
        p.mesh.userData.restY +
        Math.sin(time * 10) *
          0.18 *
          (p.generator ? ship.auxiliary.generatorRevs[p.index] : ship.auxiliary.pumpRevs[p.index]);
    for (const p of pilotLamps)
      (p.mesh.material as T.MeshStandardMaterial).emissiveIntensity = electricSupply(
        ship.auxiliary,
        p.circuit,
      );
    for (const l of lights)
      l.lamp.intensity = l.intensity * (0.18 + electricSupply(ship.auxiliary, 'lighting') * 0.82);
  }
  const moving = [
    ...controls,
    ...needles.map((n) => n.mesh),
    ...water,
    ...wheels.map((w) => w.mesh),
    ...pistons.map((p) => p.mesh),
  ];
  return { root, controls, pickRoots: [...pickRoots], update, moving };
}
