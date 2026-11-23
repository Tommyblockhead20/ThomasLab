import * as T from 'three';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from '../../shared/navigation';
import { bar, box, cyl, metric, plaque, light } from './building';
import type { ShipMaterials } from './materials';
import type { Station } from '../../shared/types';
import { BRIDGE, LEVEL_Y } from '../../shared/layout';

export function buildTelephone(g: T.Object3D, s: Station, m: ShipMaterials) {
  const p = metric(g, s.x, LEVEL_Y[s.level], s.z);
  p.name = s.id + '-fixture';
  box(p, 0, 0.08, 0, 0.42, 0.16, 0.42, m.black, 'telephone-foot');
  cyl(p, 0, 0.62, 0, 0.045, 1.08, m.black);
  box(p, 0, 1.27, 0, 0.34, 0.64, 0.1, m.darkWood, 'telephone-backboard');
  const mouth = cyl(p, 0, 1.37, 0.12, 0.095, 0.12, m.brass, 0.06);
  mouth.rotation.x = Math.PI / 2;
  box(p, 0.23, 1.34, 0.07, 0.07, 0.36, 0.09, m.black, 'telephone-receiver');
  for (const y of [1.17, 1.51]) {
    const cap = cyl(p, 0.23, y, 0.07, 0.07, 0.08, m.black);
    cap.rotation.z = Math.PI / 2;
  }
  bar(p, new T.Vector3(0.23, 1.17, 0.07), new T.Vector3(0.2, 0.91, 0.06), 0.012, m.black);
  for (const x of [-0.09, 0.09]) {
    const bell = cyl(p, x, 1.66, 0, 0.065, 0.07, m.brass, 0.04);
    bell.rotation.x = Math.PI / 2;
  }
  return p;
}

export function buildTelegraph(g: T.Object3D, m: ShipMaterials) {
  const p = metric(g, BRIDGE.telegraph.x, 0, BRIDGE.telegraph.z);
  p.name = 'bridge-telegraph';
  cyl(p, 0, 0.06, 0, 0.26, 0.12, m.brass);
  cyl(p, 0, 0.65, 0, 0.075, 1.2, m.brass);
  const head = cyl(p, 0, 1.38, 0, 0.34, 0.17, m.brass);
  head.rotation.x = Math.PI / 2;
  let paint: T.Material = m.ivory;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const a = canvas.getContext('2d')!;
    a.fillStyle = '#ece2c8';
    a.fillRect(0, 0, 512, 512);
    a.strokeStyle = '#34372e';
    a.lineWidth = 4;
    a.beginPath();
    a.arc(256, 256, 226, 0, Math.PI * 2);
    a.stroke();
    a.fillStyle = '#34372e';
    a.textAlign = 'center';
    a.font = 'bold 28px Georgia';
    a.fillText('ENGINE ORDER', 256, 216);
    a.font = '24px Georgia';
    for (const [i, word] of ['STOP', '10', '15', '20', '25'].entries()) {
      const angle = -Math.PI + (i * Math.PI) / 4,
        x = 256 + Math.cos(angle) * 178,
        y = 288 + Math.sin(angle) * 164;
      a.fillText(word, x, y);
    }
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    paint = new T.MeshStandardMaterial({ map, roughness: 0.7 });
  }
  const face = new T.Mesh(new T.CircleGeometry(0.305, 48), paint);
  face.position.set(0, 1.38, 0.09);
  p.add(face);
  const pointer = new T.Group();
  pointer.position.set(0, 1.38, 0.11);
  p.add(pointer);
  box(pointer, 0, 0.13, 0, 0.018, 0.28, 0.016, m.black, 'telegraph-pointer');
  cyl(p, 0, 1.38, 0.12, 0.045, 0.05, m.brass).rotation.x = Math.PI / 2;
  bar(p, new T.Vector3(0.28, 1.38, 0), new T.Vector3(0.43, 1.63, 0), 0.025, m.brass);
  cyl(p, 0.43, 1.67, 0, 0.045, 0.15, m.darkWood);
  return { pointer };
}

export function buildBridgeDetails(g: T.Object3D, m: ShipMaterials) {
  const captain = metric(g, BRIDGE.command.x, 0, BRIDGE.command.z);
  captain.name = 'captains-order-desk';
  box(captain, 0, 0.91, 0, 1.8 * W, 0.14, 0.65 * L, m.darkWood, 'order-desktop');
  for (const x of [-1, 1])
    for (const z of [-0.8, 0.8]) box(captain, x, 0.43, z, 0.14, 0.86, 0.14, m.darkWood, 'desk-leg');
  box(captain, -0.35, 0.997, 0.15, 0.79, 0.025, 0.54, m.darkWood, 'logbook-cover');
  for (const side of [-1, 1]) {
    const page = box(
      captain,
      -0.35 + side * 0.19,
      1.015,
      0.15,
      0.36,
      0.015,
      0.49,
      m.ivory,
      'order-book',
    );
    page.rotation.z = side * -0.025;
    for (let n = 0; n < 6; n++)
      box(
        captain,
        -0.35 + side * 0.19,
        1.027,
        -0.01 + n * 0.06,
        0.26 - (n % 3) * 0.025,
        0.002,
        0.003,
        m.black,
        'logbook-ink',
      );
  }
  cyl(captain, -0.78, 1.045, -0.24, 0.05, 0.1, m.black);
  box(captain, 0.15, 1.005, 0.28, 0.38, 0.015, 0.5, m.ivory, 'message-slip');
  bar(captain, new T.Vector3(0.1, 1.035, 0.12), new T.Vector3(0.38, 1.035, -0.08), 0.009, m.brass);
  light(captain, 0, 2.8, 0, 15, undefined, 3.25 * H);
  // Bridge ownership comes from the adjoining equipment, not floating instructions.
  for (const [x, text] of [
    [3.3, 'CAPTAIN'],
    [-3.2, 'NAVIGATION'],
  ] as const) {
    const p = metric(g, x, 0, -16.3);
    plaque(p, text, 0, 2.65, (-0.15 * L) / 2 - 0.0175, 1.5);
  }
  const compass = metric(g, BRIDGE.wheel.x - 1.1, 0, BRIDGE.wheel.z);
  cyl(compass, 0, 0.6, 0, 0.12, 1.2, m.darkWood);
  cyl(compass, 0, 1.24, 0, 0.23, 0.12, m.brass);
  cyl(compass, 0, 1.31, 0, 0.2, 0.025, m.ivory);
  bar(compass, new T.Vector3(0, 1.335, -0.17), new T.Vector3(0, 1.335, 0.17), 0.009, m.black);
  if (typeof document === 'undefined') return (_heading: number, _ack: string | null) => {};
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  box(captain, 0.7, 1.3, -0.45, 0.94, 0.5, 0.08, m.darkWood, 'heading-order-board');
  for (const x of [0.38, 1.02])
    box(captain, x, 1.025, -0.45, 0.06, 0.09, 0.1, m.brass, 'order-board-foot');
  const face = new T.Mesh(
    new T.PlaneGeometry(0.87, 0.43),
    new T.MeshStandardMaterial({ map: texture, roughness: 0.9 }),
  );
  face.position.set(0.7, 1.3, -0.402);
  captain.add(face);
  let previous = '';
  return (heading: number, ack: string | null) => {
    const key = `${heading}:${ack}`;
    if (key === previous) return;
    previous = key;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#d4c5a1';
    c.fillRect(0, 0, 512, 256);
    c.fillStyle = '#342f26';
    c.textAlign = 'center';
    c.font = '26px Georgia';
    c.fillText('HEADING', 256, 48);
    c.font = '96px Georgia';
    c.fillText(`${heading}°`, 256, 155);
    c.font = '22px Georgia';
    c.fillText(ack ? 'READ BACK' : 'AWAITING READ-BACK', 256, 220);
    texture.needsUpdate = true;
  };
}
