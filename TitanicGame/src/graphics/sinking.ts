import * as T from 'three';
import { BREAK_Z, sinkingPose, type HullPose } from '../../shared/sinking';
import {
  SEA_LEVEL,
  SHIP_WIDTH_SCALE as W,
  SHIP_HEIGHT_SCALE as H,
  SHIP_LENGTH_SCALE as L,
} from '../../shared/navigation';
import { softParticleTexture, type ShipMaterials } from './materials';

// Cut complete triangles at the structural break. UVs and normals are
// interpolated along each cut edge, so neither section exposes a duplicate hull.
export function cutGeometry(geometry: T.BufferGeometry, stern: boolean, split = BREAK_Z) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const names = Object.keys(source.attributes),
    sizes = names.map((n) => source.getAttribute(n).itemSize);
  const output = names.map(() => [] as number[]),
    position = source.getAttribute('position');
  const vertex = (index: number) =>
    names.map((n) => {
      const a = source.getAttribute(n);
      return Array.from({ length: a.itemSize }, (_, k) => a.array[index * a.itemSize + k]);
    });
  const pIndex = names.indexOf('position');
  for (let i = 0; i < position.count; i += 3) {
    let polygon = [vertex(i), vertex(i + 1), vertex(i + 2)],
      next: typeof polygon = [];
    for (let j = 0; j < polygon.length; j++) {
      const a = polygon[j],
        b = polygon[(j + 1) % polygon.length],
        az = a[pIndex][2],
        bz = b[pIndex][2];
      const ai = stern ? az >= split : az <= split,
        bi = stern ? bz >= split : bz <= split;
      if (ai) next.push(a);
      if (ai !== bi) {
        const t = (split - az) / (bz - az);
        next.push(a.map((values, k) => values.map((v, c) => v + (b[k][c] - v) * t)));
      }
    }
    polygon = next;
    for (let j = 1; j < polygon.length - 1; j++)
      for (const v of [polygon[0], polygon[j], polygon[j + 1]])
        for (let k = 0; k < names.length; k++) output[k].push(...v[k]);
  }
  const result = new T.BufferGeometry();
  for (let k = 0; k < names.length; k++)
    result.setAttribute(names[k], new T.Float32BufferAttribute(output[k], sizes[k]));
  result.computeBoundingSphere();
  if (source !== geometry) source.dispose();
  return result;
}
function pose(group: T.Group, p: HullPose) {
  group.position.set(0, p.heave, p.z);
  group.rotation.set(p.pitch, 0, p.roll);
}

export class SinkingSections {
  bow = new T.Group();
  stern = new T.Group();
  debris = new T.Group();
  foam: T.Points;
  lights = new Map<T.Light, number>();
  constructor(
    private source: T.Group,
    scene: T.Scene,
    private materials: ShipMaterials,
  ) {
    this.bow.scale.set(W, H, L);
    this.stern.scale.set(W, H, L);
    this.bow.visible = this.stern.visible = false;
    source.updateMatrixWorld(true);
    const inverse = source.matrixWorld.clone().invert();
    source.traverse((object) => {
      if (
        (object instanceof T.PointLight || object instanceof T.SpotLight) &&
        object.name !== 'emergency' &&
        object.userData.bank === undefined
      )
        this.lights.set(object, object.intensity);
      if (!(object instanceof T.Mesh)) return;
      const matrix = inverse.clone().multiply(object.matrixWorld),
        geometry: T.BufferGeometry = (object.geometry as T.BufferGeometry)
          .clone()
          .applyMatrix4(matrix);
      if (matrix.determinant() < 0) {
        if (geometry.index) {
          const indices = geometry.index;
          for (let i = 0; i < indices.count; i += 3) {
            const a = indices.getX(i + 1);
            indices.setX(i + 1, indices.getX(i + 2));
            indices.setX(i + 2, a);
          }
        } else
          for (const a of Object.values(geometry.attributes))
            for (let i = 0; i < a.count; i += 3)
              for (let c = 0; c < a.itemSize; c++) {
                const values = a.array as Float32Array,
                  tmp = values[(i + 1) * a.itemSize + c];
                values[(i + 1) * a.itemSize + c] = values[(i + 2) * a.itemSize + c];
                values[(i + 2) * a.itemSize + c] = tmp;
              }
      }
      geometry.computeBoundingBox();
      for (const stern of [false, true]) {
        if (stern ? geometry.boundingBox!.max.z < BREAK_Z : geometry.boundingBox!.min.z > BREAK_Z)
          continue;
        const complete = stern
          ? geometry.boundingBox!.min.z >= BREAK_Z
          : geometry.boundingBox!.max.z <= BREAK_Z;
        const piece = complete ? geometry.clone() : cutGeometry(geometry, stern);
        if (!piece.getAttribute('position').count) {
          piece.dispose();
          continue;
        }
        const mesh = new T.Mesh(piece, object.material);
        mesh.castShadow = object.castShadow;
        mesh.receiveShadow = object.receiveShadow;
        mesh.name = object.name;
        (stern ? this.stern : this.bow).add(mesh);
      }
      geometry.dispose();
    });
    for (const group of [this.bow, this.stern]) {
      const side = group === this.stern ? 1 : -1;
      for (let i = 0; i < 18; i++)
        for (const x of [-9.9, 9.9]) {
          const jag = new T.Mesh(
            new T.BoxGeometry(0.13, 0.7 + (i % 4) * 0.17, 0.25 + (i % 3) * 0.15),
            materials.steel,
          );
          jag.position.set(x, -22.7 + i * 0.94, BREAK_Z + side * 0.12);
          jag.rotation.x = Math.sin(i * 3.17) * 0.42;
          group.add(jag);
        }
      for (const y of [-5.4, -8.2, -10.8, -13.3, -16, -19]) {
        const edge = new T.Mesh(new T.BoxGeometry(19.5, 0.1, 0.35), materials.black);
        edge.position.set(0, y, BREAK_Z + side * 0.12);
        group.add(edge);
      }
    }
    const positions = new Float32Array(120 * 3);
    this.foam = new T.Points(
      new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(positions, 3)),
      new T.PointsMaterial({
        map: softParticleTexture('#c9d7d3'),
        color: 0xb3cacd,
        size: 2,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    );
    this.foam.frustumCulled = false;
    for (let i = 0; i < 14; i++) {
      const plank = new T.Mesh(new T.BoxGeometry(0.16, 0.07, 0.8 + (i % 3) * 0.3), materials.wood);
      plank.rotation.y = i * 1.7;
      this.debris.add(plank);
    }
    scene.add(this.bow, this.stern, this.debris, this.foam);
  }
  update(seconds: number | null, side = 1, hidden = false) {
    const age = seconds ?? 0,
      state = sinkingPose(age, side);
    pose(this.bow, state.bow);
    pose(this.stern, state.stern);
    this.bow.visible = this.stern.visible = !hidden && seconds !== null && state.broken;
    this.source.visible = !hidden && !this.bow.visible;
    for (const [light, intensity] of this.lights) light.intensity = intensity * state.lights;
    this.materials.glow.emissiveIntensity = 2.3 * state.lights;
    this.debris.visible = !hidden && age >= 85;
    for (let i = 0; i < this.debris.children.length; i++) {
      const a = i * 2.39996,
        r = 6 + (i % 5) * 3 + (age - 85) * 0.06;
      this.debris.children[i].position.set(
        Math.cos(a) * r,
        SEA_LEVEL + 0.08 + Math.sin(age * 0.8 + i) * 0.06,
        50 + Math.sin(a) * r,
      );
      this.debris.children[i].rotation.z = Math.sin(age + i) * 0.06;
    }
    this.foam.visible = !hidden && state.foam > 0.001;
    const positions = this.foam.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const a = i * 2.39996,
        r = 4 + (i % 17) * 1.5 + Math.max(0, age - 128) * 0.13;
      positions.setXYZ(
        i,
        Math.cos(a) * r,
        SEA_LEVEL + 0.15 + Math.sin(age + i) * 0.04,
        51 + Math.sin(a) * r * 0.75,
      );
    }
    positions.needsUpdate = true;
    (this.foam.material as T.PointsMaterial).opacity = state.foam * 0.24;
  }
}
