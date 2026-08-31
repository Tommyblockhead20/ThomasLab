import * as pc from 'playcanvas';

function material(color, gloss) {
  const result = new pc.StandardMaterial();
  result.diffuse = new pc.Color(...color);
  result.gloss = gloss;
  result.update();
  return result;
}

function primitive(parent, name, type, position, scale, surface, rotation = {}) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type, material: surface, castShadows: true, receiveShadows: true });
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(scale.x, scale.y, scale.z);
  entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  parent.addChild(entity);
  return entity;
}

export function createFishingRodModel(parent, { name = 'Fishing rod' } = {}) {
  const surfaces = {
    shaft: material([.17, .12, .08], .45),
    metal: material([.22, .24, .22], .72),
    reel: material([.85, .62, .2], .65),
    grip: material([.08, .055, .035], .28),
    line: material([.72, .84, .82], .82)
  };
  const root = new pc.Entity(name);
  parent?.addChild(root);
  const rodLength = 1.56;
  primitive(root, `${name} cork handle`, 'cylinder', { x: 0, y: -.16, z: 0 },
    { x: .085, y: .32, z: .085 }, surfaces.grip);
  primitive(root, `${name} shaft`, 'cylinder', { x: 0, y: rodLength * .5, z: 0 },
    { x: .055, y: rodLength, z: .055 }, surfaces.shaft);
  const tipAnchor = primitive(root, `${name} tip line guide`, 'cylinder', { x: 0, y: rodLength, z: 0 },
    { x: .07, y: .07, z: .07 }, surfaces.metal, { x: 90 });
  primitive(root, `${name} reel body`, 'cylinder', { x: .09, y: .1, z: 0 },
    { x: .18, y: .08, z: .18 }, surfaces.reel, { z: 90 });
  primitive(root, `${name} reel spool`, 'cylinder', { x: .2, y: .1, z: 0 },
    { x: .09, y: .12, z: .09 }, surfaces.line, { z: 90 });
  primitive(root, `${name} reel crank`, 'box', { x: .26, y: .02, z: 0 },
    { x: .16, y: .025, z: .025 }, surfaces.metal, { z: -30 });
  primitive(root, `${name} reel knob`, 'sphere', { x: .32, y: -.03, z: 0 },
    { x: .045, y: .045, z: .045 }, surfaces.grip);
  for (const y of [.48, .92, 1.32]) primitive(root, `${name} line guide ${y}`, 'cylinder',
    { x: 0, y, z: 0 }, { x: .055, y: .055, z: .055 }, surfaces.metal, { x: 90 });
  primitive(root, `${name} visible leader`, 'cylinder', { x: 0, y: rodLength + .23, z: 0 },
    { x: .008, y: .46, z: .008 }, surfaces.line);
  return { root, tipAnchor, materials: Object.values(surfaces), rodLength };
}

export function destroyFishingRodModel(model) {
  if (!model) return;
  model.root?.destroy();
  for (const surface of model.materials ?? []) surface.destroy?.();
}
