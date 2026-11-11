import * as THREE from 'three';
import type { Iceberg, ShipState } from '../../shared/types';
import { SEA_LEVEL, SEA_SCALE, SHIP_SCALE } from '../../shared/navigation';
import { softParticleTexture } from './materials';
import { LEVEL_Y } from '../../shared/world';
import { SHIP_HEIGHT_SCALE } from '../../shared/navigation';
import type { Position } from '../../shared/types';
import { hullContact, HULL_OUTLINE } from '../../shared/navigation';

export function createHullScar(impact: NonNullable<ShipState['impact']>, metal: THREE.Material) {
  const group = new THREE.Group(),
    waterline = SEA_LEVEL / SHIP_HEIGHT_SCALE + 0.12,
    points: number[] = [],
    indices: number[] = [];
  for (let i = 0; i < 9; i++) {
    const t = (i - 4) * 0.28,
      contact = hullContact(
        {
          x: impact.point.x + impact.normal.z * t + impact.normal.x * 0.2,
          z: impact.point.z - impact.normal.x * t + impact.normal.z * 0.2,
        },
        0,
        HULL_OUTLINE,
      );
    const x = contact.point.x + contact.normal.x * 0.035,
      z = contact.point.z + contact.normal.z * 0.035,
      h = 0.23 + (i % 3) * 0.07;
    points.push(x, waterline - h, z, x, waterline + h, z);
    if (i < 8) {
      const at = i * 2;
      indices.push(at, at + 1, at + 2, at + 1, at + 3, at + 2);
    }
    if (i % 2 === 0) {
      const shard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.04), metal);
      shard.position.set(x, waterline, z);
      shard.rotation.set(0.12, Math.atan2(contact.normal.x, contact.normal.z), (i % 3) * 0.2);
      group.add(shard);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  group.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x050b0e, roughness: 0.96, side: THREE.DoubleSide }),
    ),
  );
  return group;
}

export function setCrewCamera(
  camera: THREE.Camera,
  ship: THREE.Group,
  position: Position & { y?: number },
  yaw: number,
  pitch: number,
  bob = 0,
) {
  camera.position.copy(
    ship.localToWorld(
      new THREE.Vector3(
        position.x,
        (position.y ?? LEVEL_Y[position.level]) + (1.68 + bob) / SHIP_HEIGHT_SCALE,
        position.z,
      ),
    ),
  );
  camera.quaternion
    .copy(ship.quaternion)
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, -yaw, 0, 'YXZ')));
}

// The waterline is circular and matches the server's solid collision radius.
// Faceted upper ridges vary by seed; no role or target marker changes the art.
export function icebergGeometry(ice: Pick<Iceberg, 'radius' | 'height' | 'shape'>) {
  const vertices: number[] = [],
    indices: number[] = [],
    rings = 5,
    sides = 48;
  const kind = ice.shape % 3;
  const profile =
    kind === 1
      ? [1, 1, 0.98, 0.8, 0.52]
      : kind === 2
        ? [1, 1, 0.9, 0.6, 0.22]
        : [1, 1, 0.91, 0.53, 0.06];
  for (let ring = 0; ring < rings; ring++)
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2,
        variation = Math.sin(a * 3 + ice.shape) * 0.08 + Math.cos(a * 7 + ice.shape * 0.71) * 0.045;
      const offset = Math.max(0, ring - 1) * ice.radius * SEA_SCALE * 0.045;
      const radius = Math.min(
        ice.radius * SEA_SCALE - offset,
        ice.radius * SEA_SCALE * profile[ring] * (ring < 2 ? 1 : 1 + variation),
      );
      const height =
        ring === 0
          ? -3
          : ring === 1
            ? 0
            : ice.height *
              SEA_SCALE *
              [0, 0, 0.24, 0.76, 1][ring] *
              (1 + variation * 1.6 + (kind === 2 ? Math.sin(a * 2 + ice.shape) * 0.17 : 0));
      vertices.push(Math.cos(a) * radius + offset, height, Math.sin(a) * radius);
    }
  for (let ring = 0; ring < rings - 1; ring++)
    for (let i = 0; i < sides; i++) {
      const a = ring * sides + i,
        b = ring * sides + ((i + 1) % sides),
        c = a + sides,
        d = b + sides;
      indices.push(a, c, b, b, c, d);
    }
  const top = vertices.length / 3;
  vertices.push(
    ice.radius * SEA_SCALE * 0.18,
    ice.height * SEA_SCALE * (kind === 1 ? 0.96 : kind === 2 ? 0.68 : 1.06),
    0,
  );
  for (let i = 0; i < sides; i++)
    indices.push((rings - 1) * sides + i, top, (rings - 1) * sides + ((i + 1) % sides));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function createIceberg(ice: Iceberg, material: THREE.MeshStandardMaterial) {
  const mesh = new THREE.Mesh(icebergGeometry(ice), material);
  mesh.name = 'solid-iceberg';
  mesh.position.y = SEA_LEVEL;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export class CrashEffects {
  group = new THREE.Group();
  spray: THREE.Points;
  chunks: THREE.InstancedMesh;
  private velocities: THREE.Vector3[] = [];
  private origin = new THREE.Vector3();
  private started = -100;
  private dummy = new THREE.Object3D();
  private id = 0;
  constructor(scene: THREE.Scene) {
    this.spray = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(new Float32Array(120 * 3), 3),
      ),
      new THREE.PointsMaterial({
        map: softParticleTexture('#d5edf1'),
        color: 0xc9e8f2,
        size: 0.85,
        opacity: 0.7,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.spray.frustumCulled = false;
    this.chunks = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.14, 0),
      new THREE.MeshStandardMaterial({ color: 0xc4dce3, roughness: 0.5 }),
      32,
    );
    this.chunks.frustumCulled = false;
    this.group.add(this.spray, this.chunks);
    this.group.visible = false;
    scene.add(this.group);
  }
  reset() {
    this.id = 0;
    this.started = -100;
    this.group.visible = false;
  }
  trigger(impact: NonNullable<ShipState['impact']>, ship: THREE.Group, time: number) {
    if (impact.id === this.id) return;
    this.id = impact.id;
    this.started = time;
    this.origin.copy(ship.localToWorld(new THREE.Vector3(impact.point.x, -2.7, impact.point.z)));
    this.origin.y = SEA_LEVEL + 0.1;
    this.velocities = [];
    for (let i = 0; i < 120; i++) {
      const a = i * 2.39996,
        seed = 0.5 + 0.5 * Math.sin(i * 53.17 + impact.id),
        power = (0.6 + impact.strength) * (0.7 + seed);
      this.velocities.push(
        new THREE.Vector3(
          (Math.cos(a) * 2.5 + impact.normal.x * 2) * power,
          (1.4 + seed * 4.5) * power,
          (Math.sin(a) * 2.5 + impact.normal.z * 2) * power,
        ),
      );
    }
    this.group.visible = true;
  }
  update(time: number) {
    const age = time - this.started;
    if (age > 4) {
      this.group.visible = false;
      return;
    }
    const positions = this.spray.geometry.getAttribute('position');
    for (let i = 0; i < 120; i++) {
      const v = this.velocities[i],
        t = Math.max(0, age - (i % 5) * 0.055),
        x = this.origin.x + v.x * t,
        y = this.origin.y + v.y * t - 4.1 * t * t,
        z = this.origin.z + v.z * t;
      positions.setXYZ(i, x, Math.max(SEA_LEVEL - 0.15, y), z);
      if (i < 32) {
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(t * ((i % 3) + 1), t * 2, i);
        this.dummy.scale.setScalar(0.7 + (i % 4) * 0.35);
        this.dummy.updateMatrix();
        this.chunks.setMatrixAt(i, this.dummy.matrix);
      }
    }
    positions.needsUpdate = true;
    this.chunks.instanceMatrix.needsUpdate = true;
    (this.spray.material as THREE.PointsMaterial).opacity = Math.max(0, 0.8 - age * 0.22);
  }
}
