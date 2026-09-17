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
    this.pendingTimer = null;
    this.pendingData = null;
  }

  clear() {
    if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }
    this.pendingData = null;
    for (const child of [...this.root.children]) {
      for (const mesh of child._editorOwnedMeshes ?? []) { try { mesh.destroy(); } catch {} }
      child.destroy();
    }
    this.signature = '';
  }

  dataSignature(data) {
    if (!data?.positions?.length || !data?.indices?.length) return '';
    return `${data.positions.length}:${data.indices.length}:${data.editedAt ?? ''}:${data.topologyEditedAt ?? ''}:${data.positions[0]}:${data.positions.at(-1)}`;
  }

  scheduleRebuild(data) {
    this.pendingData = data;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      const latest = this.pendingData;
      this.pendingData = null;
      if (this.root.enabled && latest) this.rebuild(latest);
    }, 180);
  }

  rebuild(data) {
    if (!data?.positions?.length || !data?.indices?.length) { this.clear(); return; }
    const signature = this.dataSignature(data);
    if (signature && signature === this.signature && this.root.children.length) return;
    // Clear just the old overlay meshes, not the pending-refresh metadata.
    if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }
    this.pendingData = null;
    for (const child of [...this.root.children]) {
      for (const mesh of child._editorOwnedMeshes ?? []) { try { mesh.destroy(); } catch {} }
      child.destroy();
    }
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
    const next = Boolean(enabled);
    if (!next) {
      this.root.enabled = false;
      if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }
      this.pendingData = null;
      return;
    }
    const wasEnabled = this.root.enabled;
    this.root.enabled = true;
    if (!data) return;
    const signature = this.dataSignature(data);
    if (signature === this.signature && this.root.children.length) return;
    // First enable is immediate. Subsequent sculpt changes are coalesced so four large
    // diagnostic meshes are not destroyed/recreated for every single brush click.
    if (!wasEnabled || !this.root.children.length) this.rebuild(data);
    else this.scheduleRebuild(data);
  }
}
