import * as T from 'three';
import { box, bar, cyl, metric } from './building';
import type { ShipMaterials } from './materials';
import { LEVEL_Y } from '../../shared/layout';
import { NEST } from '../../shared/lookout';
import { SHIP_HEIGHT_SCALE as H } from '../../shared/navigation';

export function buildLookout(g: T.Group, m: ShipMaterials) {
  const mast = metric(g, 0, LEVEL_Y[2], NEST.z);
  mast.name = 'foremast';
  const floor = (LEVEL_Y[1] - LEVEL_Y[2]) * H;
  const buff = new T.MeshStandardMaterial({
    color: 0x917c53,
    roughness: 0.7,
    metalness: 0.4,
    side: T.DoubleSide,
  });
  // Hollow steel foremast. Two front openings lead to the same internal ladder.
  const ys = [0, 2.05, floor, floor + 2.05, 32],
    vertices: number[] = [];
  for (let row = 0; row < ys.length - 1; row++)
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2,
        b = ((i + 1) / 48) * Math.PI * 2;
      if ((row === 0 || row === 2) && Math.cos((a + b) / 2) < -0.55) continue;
      const vertex = (y: number, t: number) =>
        new T.Vector3(Math.sin(t) * (0.48 - y * 0.009), y, Math.cos(t) * (0.48 - y * 0.009));
      const p = [
        vertex(ys[row], a),
        vertex(ys[row], b),
        vertex(ys[row + 1], a),
        vertex(ys[row + 1], b),
      ];
      for (const n of [0, 2, 1, 1, 2, 3]) vertices.push(...p[n].toArray());
    }
  const shell = new T.BufferGeometry();
  shell.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  shell.computeVertexNormals();
  const tube = new T.Mesh(shell, buff);
  tube.name = 'hollow-mast';
  tube.castShadow = true;
  mast.add(tube);
  for (const x of [-0.24, 0.24])
    bar(mast, new T.Vector3(x, 0.05, 0.17), new T.Vector3(x, floor + 1.5, 0.17), 0.026, m.black);
  for (let y = 0.28; y < floor + 1.5; y += 0.3)
    bar(mast, new T.Vector3(-0.24, y, 0.17), new T.Vector3(0.24, y, 0.17), 0.019, m.steel);
  // The basket is forward of the mast, leaving two clear lookout positions.
  const nest = metric(g, 0, LEVEL_Y[1], NEST.z);
  nest.name = 'lookout-cage';
  const r = NEST.width / 2,
    d = NEST.depth,
    rear = NEST.rear;
  const shape = new T.Shape();
  shape.moveTo(-r, rear);
  for (let i = 1; i <= 48; i++) {
    const a = (i / 48) * Math.PI;
    shape.lineTo(-Math.cos(a) * r, rear - Math.sin(a) * d);
  }
  shape.lineTo(0.5, rear);
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    shape.lineTo(Math.cos(a) * 0.5, -Math.sin(a) * 0.5);
  }
  shape.lineTo(-r, rear);
  const deck = new T.Mesh(
    new T.ExtrudeGeometry(shape, { depth: 0.13, bevelEnabled: false, steps: 1 }),
    m.darkWood,
  );
  deck.rotation.x = Math.PI / 2;
  deck.name = 'nest-floor';
  nest.add(deck);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI,
      b = ((i + 1) / 32) * Math.PI;
    const u = new T.Vector3(-Math.cos(a) * r, 0, rear - Math.sin(a) * d),
      v = new T.Vector3(-Math.cos(b) * r, 0, rear - Math.sin(b) * d);
    const plank = box(
      nest,
      (u.x + v.x) / 2,
      0.47,
      (u.z + v.z) / 2,
      u.distanceTo(v) + 0.008,
      0.94,
      0.055,
      m.darkWood,
      'nest-stave',
    );
    plank.rotation.y = -Math.atan2(v.z - u.z, v.x - u.x);
    bar(nest, u.clone().setY(1.04), v.clone().setY(1.04), 0.032, m.brass);
  }
  for (const side of [-1, 1]) {
    box(nest, side * 0.96, 0.47, rear, 0.78, 0.94, 0.06, m.darkWood, 'nest-rear-screen');
    bar(
      nest,
      new T.Vector3(side * 0.57, 1.04, rear),
      new T.Vector3(side * r, 1.04, rear),
      0.032,
      m.brass,
    );
    bar(
      nest,
      new T.Vector3(side * 1.05, -0.12, -0.65),
      new T.Vector3(side * 0.25, -1.6, 0),
      0.045,
      m.black,
    );
  }
  // Starboard telephone fixed to the rear screen, with an earpiece and cord.
  box(nest, 1, 0.7, -0.04, 0.25, 0.49, 0.12, m.darkWood, 'lookout-telephone');
  const receiver = cyl(nest, 1, 0.91, -0.15, 0.075, 0.09, m.brass);
  receiver.rotation.x = Math.PI / 2;
  bar(nest, new T.Vector3(0.9, 0.53, -0.12), new T.Vector3(0.86, 0.32, -0.12), 0.014, m.black);
  // A suspended, hollow bell above head height; the pull hangs at the port hand.
  bar(nest, new T.Vector3(0, 1.9, 0), new T.Vector3(0, 2.55, -0.48), 0.037, m.black);
  const profile = [
    new T.Vector2(0.035, 0.22),
    new T.Vector2(0.085, 0.2),
    new T.Vector2(0.11, 0.08),
    new T.Vector2(0.16, -0.05),
    new T.Vector2(0.21, -0.11),
    new T.Vector2(0.21, -0.14),
    new T.Vector2(0.18, -0.14),
    new T.Vector2(0.13, -0.05),
    new T.Vector2(0.085, 0.1),
    new T.Vector2(0.025, 0.18),
  ];
  const bell = new T.Mesh(new T.LatheGeometry(profile, 32), m.brass);
  bell.position.set(0, 2.27, -0.48);
  bell.name = 'hanging-lookout-bell';
  nest.add(bell);
  bar(nest, new T.Vector3(0, 2.44, -0.48), new T.Vector3(0, 2.55, -0.48), 0.018, m.black);
  cyl(nest, 0, 2.17, -0.48, 0.036, 0.2, m.black);
  bar(nest, new T.Vector3(0, 2.11, -0.48), new T.Vector3(-0.72, 1.08, -0.35), 0.012, m.rope);
  cyl(nest, -0.72, 1.06, -0.35, 0.025, 0.14, m.darkWood);
  return { mast, nest };
}
