import * as T from 'three';
import { box, cyl, plaque, light } from './building';
import { inquirySeat } from '../../shared/inquiry';
import type { ShipMaterials } from './materials';

// A separate company hearing, not an evacuation or another position at sea.
export function buildInquiryRoom(m: ShipMaterials) {
  const room = new T.Group();
  room.name = 'company-inquiry-room';
  const wall = m.ivory.clone();
  wall.color.set(0xa69b82);
  wall.roughness = 0.94;
  wall.metalness = 0;
  const timber = m.darkWood.clone();
  timber.color.set(0x6c5342);
  timber.roughness = 0.86;
  timber.metalness = 0;
  const floor = m.wood.clone();
  floor.roughness = 0.94;
  floor.metalness = 0;

  box(room, 0, -0.12, 0, 13, 0.24, 16, floor, 'inquiry-floor');
  box(room, 0, 3.6, 0, 13, 0.18, 16, wall, 'inquiry-ceiling');
  for (const side of [-1, 1]) {
    box(room, side * 6.4, 0.55, 0, 0.18, 1.1, 16, timber, 'inquiry-wainscot');
    box(room, side * 6.4, 2.3, 0, 0.18, 2.4, 16, wall, 'inquiry-wall');
    for (const z of [-6, -2, 2, 6]) {
      box(room, side * 6.28, 1.7, z, 0.08, 2.9, 0.1, timber, 'inquiry-panel-post');
      light(room, side * 5.8, 2.6, z, 4.5);
    }
  }
  for (const z of [-7.9, 7.9]) {
    box(room, 0, 0.55, z, 13, 1.1, 0.18, timber, 'inquiry-end-dado');
    box(room, 0, 2.3, z, 13, 2.4, 0.18, wall, 'inquiry-end-wall');
  }
  const carpet = new T.MeshStandardMaterial({ color: 0x4d3d34, roughness: 1 });
  box(room, 0, 0.012, -0.5, 9, 0.024, 12.8, carpet, 'inquiry-carpet');
  box(room, 0, 0.86, -0.5, 3.8, 0.18, 11, timber, 'inquiry-table');
  for (const x of [-1.3, 1.3])
    for (const z of [-4.5, 3.5]) box(room, x, 0.38, z, 0.18, 0.76, 0.18, timber);
  for (let i = 0; i < 10; i++) {
    const seat = inquirySeat(i),
      side = i % 2 ? 1 : -1;
    const chair = new T.Group();
    chair.position.set(seat.x, 0, seat.z);
    room.add(chair);
    box(chair, side * 0.25, 0.48, 0, 0.8, 0.13, 0.75, timber, 'inquiry-chair-seat');
    box(chair, side * 0.6, 0.98, 0, 0.13, 0.9, 0.8, timber, 'inquiry-chair-back');
    for (const x of [-0.05, 0.55])
      for (const z of [-0.27, 0.27]) box(chair, side * x, 0.22, z, 0.08, 0.44, 0.08, timber);
    box(room, side * 1.3, 0.963, seat.z, 0.6, 0.025, 0.4, m.ivory, 'inquiry-papers');
    cyl(room, side * 1.2, 1.04, seat.z + 0.3, 0.045, 0.14, m.brass);
  }
  plaque(room, 'CREW INQUIRY', 0, 2.4, -7.78, 3.2);
  box(room, 0, 0.65, -6.8, 5, 1.3, 0.8, timber, 'company-desk');
  for (const x of [-1.7, 1.7]) light(room, x, 2.7, -6.5, 6);
  room.position.y = 12;
  return room;
}
