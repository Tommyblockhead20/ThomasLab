import * as pc from 'playcanvas';

function surface(color, gloss = .35) {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(...color);
  material.gloss = gloss;
  material.update();
  return material;
}

function primitive(parent, name, type, position, scale, material, rotation = {}) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type, material, castShadows: true, receiveShadows: true });
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(scale.x, scale.y, scale.z);
  entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  parent.addChild(entity);
  return entity;
}

export function createHeldEquipmentModel(parent, itemId, { name = 'Held equipment' } = {}) {
  if (itemId !== 'ice-axe') return null;
  const materials = [
    surface([.3, .17, .085], .24),
    surface([.58, .65, .66], .78),
    surface([.08, .09, .085], .28)
  ];
  const root = new pc.Entity(`${name} Ice Axe`);
  parent?.addChild(root);
  root.setLocalPosition(.08, -.34, -.05);
  root.setLocalEulerAngles(-8, 0, -18);
  primitive(root, 'Ice Axe wooden shaft', 'cylinder', { x: 0, y: .34, z: 0 },
    { x: .045, y: .78, z: .045 }, materials[0]);
  primitive(root, 'Ice Axe metal head', 'box', { x: 0, y: .75, z: 0 },
    { x: .52, y: .075, z: .095 }, materials[1], { z: -5 });
  primitive(root, 'Ice Axe pick', 'cone', { x: -.31, y: .74, z: 0 },
    { x: .11, y: .3, z: .08 }, materials[1], { z: 84 });
  primitive(root, 'Ice Axe grip', 'cylinder', { x: 0, y: .05, z: 0 },
    { x: .06, y: .2, z: .06 }, materials[2]);
  return { root, itemId, materials };
}

export function destroyHeldEquipmentModel(model) {
  if (!model) return;
  model.root?.destroy();
  for (const material of model.materials ?? []) material.destroy?.();
}
