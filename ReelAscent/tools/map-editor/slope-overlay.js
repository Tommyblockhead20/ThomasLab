import * as pc from 'playcanvas';

function material(rgb, opacity = .62) {
  const value = new pc.StandardMaterial();
  value.diffuse = new pc.Color(rgb[0], rgb[1], rgb[2]);
  value.emissive = new pc.Color(rgb[0] * .35, rgb[1] * .35, rgb[2] * .35);
  value.opacity = opacity;
  value.blendType = pc.BLEND_NORMAL;
  value.depthWrite = false;
  value.cull = pc.CULLFACE_NONE;
  value.update();
  return value;
}

const COLORS = Object.freeze({
  walkable: [0.16, .82, .34],
  awkward: [1.0, .72, .08],
  slide: [1.0, .31, .09],
  extreme: [.68, .12, .92]
});

export function classifySlopeDegrees(degrees, playerConfig) {
  if (degrees <= playerConfig.maxSlopeDegrees) return 'walkable';
  if (degrees < playerConfig.slideSlopeDegrees) return 'awkward';
  if (degrees < playerConfig.hardNoStandSlopeDegrees) return 'slide';
  return 'extreme';
}

export function slopeOverlayLegend(playerConfig) {
  return [
    ['WALKABLE', `≤ ${playerConfig.maxSlopeDegrees}°`],
    ['AWKWARD', `>${playerConfig.maxSlopeDegrees}° and < ${playerConfig.slideSlopeDegrees}°`],
    ['SLIDE', `${playerConfig.slideSlopeDegrees}–${playerConfig.hardNoStandSlopeDegrees - 0.01}°`],
    ['EXTREME / WALL', `≥ ${playerConfig.hardNoStandSlopeDegrees}°`]
  ];
}

export class SlopeOverlay {
  constructor(app, parent, playerConfig) {
    this.app = app;
    this.parent = parent;
    this.playerConfig = playerConfig;
    this.root = new pc.Entity('Slope Diagnostic Overlay');
    parent.addChild(this.root);
    this.root.enabled = false;
    this.materials = Object.fromEntries(Object.entries(COLORS).map(([key, rgb]) => [key, material(rgb)]));
    this.signature = '';
  }

  clear() {
    for (const child of [...this.root.children]) {
      for (const mesh of child._editorOwnedMeshes ?? []) { try { mesh.destroy(); } catch {} }
      child.destroy();
    }
    this.signature = '';
  }

  rebuild(data) {
    if (!data?.positions?.length || !data?.indices?.length) { this.clear(); return; }
    const signature = `${data.positions.length}:${data.indices.length}:${data.positions[0]}:${data.positions.at(-1)}`;
    this.clear();
    const buckets = { walkable: [], awkward: [], slide: [], extreme: [] };
    const p = data.positions;
    const ids = data.indices;
    for (let offset = 0; offset < ids.length; offset += 3) {
      const ia = ids[offset] * 3, ib = ids[offset + 1] * 3, ic = ids[offset + 2] * 3;
      const abx = p[ib] - p[ia], aby = p[ib + 1] - p[ia + 1], abz = p[ib + 2] - p[ia + 2];
      const acx = p[ic] - p[ia], acy = p[ic + 1] - p[ia + 1], acz = p[ic + 2] - p[ia + 2];
      let nx = aby * acz - abz * acy;
      let ny = abz * acx - abx * acz;
      let nz = abx * acy - aby * acx;
      const length = Math.hypot(nx, ny, nz) || 1;
      ny = Math.abs(ny / length);
      const degrees = Math.acos(Math.max(0, Math.min(1, ny))) * 180 / Math.PI;
      buckets[classifySlopeDegrees(degrees, this.playerConfig)].push(ids[offset], ids[offset + 1], ids[offset + 2]);
    }
    for (const [key, indices] of Object.entries(buckets)) {
      if (!indices.length) continue;
      const geometry = new pc.Geometry();
      geometry.positions = data.positions;
      geometry.indices = indices;
      geometry.normals = data.normals ?? undefined;
      const mesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, geometry);
      const entity = new pc.Entity(`Slope ${key}`);
      entity._editorOwnedMeshes = [mesh];
      entity.addComponent('render');
      entity.render.meshInstances = [new pc.MeshInstance(mesh, this.materials[key], entity)];
      entity.render.castShadows = false;
      this.root.addChild(entity);
    }
    this.signature = signature;
  }

  setEnabled(enabled, data = null) {
    if (enabled && data) this.rebuild(data);
    this.root.enabled = Boolean(enabled);
  }
}
