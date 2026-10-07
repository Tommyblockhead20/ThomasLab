import * as pc from 'playcanvas';

const normalizeSignText = (value, fallback = 'SIGN') => (
  String(value ?? fallback).trim().slice(0, 48).toUpperCase() || fallback
);

// Shared by the production world and World Editor. Keeping the canvas/material creation in
// runtime source prevents the editor from promising lettering that the shipped game never
// constructs.
export function attachSignText(device, parent, value, options = {}) {
  if (!device || !parent || typeof document === 'undefined') return null;
  const text = normalizeSignText(value, options.fallback ?? 'SIGN');
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = options.color ?? '#f8e7aa';
  context.strokeStyle = options.outlineColor ?? '#0b1b19';
  context.lineWidth = 7;
  const fontSize = Math.max(28, Math.min(62, Math.floor(490 / Math.max(4, text.length) * 1.75)));
  context.font = `900 ${fontSize}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.strokeText(text, 256, 67, 486);
  context.fillText(text, 256, 67, 486);

  const texture = new pc.Texture(device, { width: canvas.width, height: canvas.height, mipmaps: true });
  texture.setSource(canvas);
  const material = new pc.StandardMaterial();
  material.diffuseMap = texture;
  material.emissiveMap = texture;
  material.emissive = new pc.Color(.62, .62, .62);
  material.opacityMap = texture;
  material.alphaTest = .08;
  material.cull = pc.CULLFACE_BACK;
  // The lettering is transparent and sits just in front of a solid sign board. Pull its
  // depth very slightly toward the camera as a second guard against precision flicker on
  // thin/scaled boards and distant editor views.
  material.depthBias = -1;
  material.slopeDepthBias = -1;
  material.gloss = .08;
  material.update();

  const label = new pc.Entity(`${parent.name || 'Sign'} text`);
  label._editorBaseMaterial = material;
  // A box maps the lettering onto both its front and rear faces. With transparency and a
  // shallow viewing angle, the rear copy can show through as a second offset word. Use one
  // forward-facing quad so each physical sign has exactly one layer of lettering.
  const geometry = new pc.Geometry();
  geometry.positions = [-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0];
  geometry.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  // Match PlayCanvas BoxGeometry's front-face UV orientation so the existing canvas text
  // remains upright after replacing that box with this single quad.
  geometry.uvs = [0, 1, 1, 1, 1, 0, 0, 0];
  geometry.indices = [0, 1, 2, 0, 2, 3];
  const mesh = pc.Mesh.fromGeometry(device, geometry);
  label.addComponent('render');
  label.render.castShadows = false;
  label.render.receiveShadows = false;
  label.render.meshInstances = [new pc.MeshInstance(mesh, material, label)];
  label._editorOwnedMeshes = [mesh];
  parent.addChild(label);
  // .506 was only fractions of a millimetre away after a thin sign's inherited Z scale,
  // which was visibly coplanar at ordinary camera distances. This remains visually attached
  // to the board while leaving a stable depth gap in both production and the editor.
  label.setLocalPosition(0, 0, options.surfaceOffset ?? .56);
  label.setLocalScale(options.widthScale ?? .92, options.heightScale ?? .72, 1);
  parent._editorOwnedSignTextures = [...(parent._editorOwnedSignTextures ?? []), texture];
  parent._editorOwnedSignMaterials = [...(parent._editorOwnedSignMaterials ?? []), material];
  return label;
}

