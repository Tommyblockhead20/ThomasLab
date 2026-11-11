import * as T from 'three';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from '../../shared/navigation';
export function box(
  g: T.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  m: T.Material,
  name = '',
) {
  const o = new T.Mesh(new T.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.name = name;
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}
export function cyl(
  g: T.Object3D,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  m: T.Material,
  top = r,
) {
  const o = new T.Mesh(new T.CylinderGeometry(top, r, h, 32), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}
export function bar(g: T.Object3D, a: T.Vector3, b: T.Vector3, r: number, m: T.Material) {
  const o = cyl(g, 0, 0, 0, r, a.distanceTo(b), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}
export function metric(g: T.Object3D, x = 0, y = 0, z = 0) {
  const anchor = new T.Group();
  anchor.position.set(x, y, z);
  anchor.scale.set(1 / W, 1 / H, 1 / L);
  g.add(anchor);
  // Rotate fittings after cancelling the ship's authoring scale. Otherwise a
  // sideways doorway or bookcase stretches by the length/width scale ratio.
  const p = new T.Group();
  anchor.add(p);
  return p;
}
export const point = (p: { x: number; y: number; z: number }) =>
  new T.Vector3(p.x * W, p.y * H, p.z * L);
export function plaque(g: T.Object3D, text: string, x: number, y: number, z: number, width = 1.5) {
  if (typeof document === 'undefined') return;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const a = c.getContext('2d')!;
  a.fillStyle = '#192529';
  a.fillRect(0, 0, 512, 128);
  a.strokeStyle = '#bda16b';
  a.lineWidth = 3;
  a.strokeRect(8, 8, 496, 112);
  a.fillStyle = '#dfcda9';
  a.font = '36px Georgia';
  a.textAlign = 'center';
  a.textBaseline = 'middle';
  a.fillText(text, 256, 66, 465);
  const map = new T.CanvasTexture(c);
  map.colorSpace = T.SRGBColorSpace;
  return box(
    g,
    x,
    y,
    z,
    width,
    0.25,
    0.035,
    new T.MeshStandardMaterial({ map, roughness: 0.8 }),
    'room-plaque',
  );
}
export function light(
  g: T.Object3D,
  x: number,
  y: number,
  z: number,
  power = 18,
  color = 0xffd29b,
) {
  const l = new T.PointLight(color, power, 15, 2);
  l.position.set(x, y, z);
  g.add(l);
  const bulb = new T.Mesh(
    new T.SphereGeometry(0.095, 8, 6),
    new T.MeshStandardMaterial({ color: 0xfce6bc, emissive: 0xfcd298, emissiveIntensity: 1.2 }),
  );
  bulb.position.copy(l.position);
  g.add(bulb);
  return l;
}
