import * as T from 'three';
import type { FiringTool } from '../../shared/firing';
import type { ShipMaterials } from './materials';
import { box, bar } from './building';

export function buildFiringTool(tool: FiringTool, m: ShipMaterials) {
  const g = new T.Group();
  bar(
    g,
    new T.Vector3(0, 0, 0),
    new T.Vector3(0, 1.25, 0),
    0.022,
    tool === 'coal' ? m.wood : m.steel,
  );
  if (tool === 'coal') box(g, 0, 0.04, 0.03, 0.29, 0.35, 0.05, m.black, 'shovel-blade');
  if (tool === 'slice') box(g, 0, 0.025, 0, 0.08, 0.17, 0.025, m.steel, 'slice-tip');
  if (tool === 'rake') {
    box(g, 0, 0.04, 0, 0.34, 0.04, 0.04, m.steel, 'rake-head');
    for (const x of [-0.14, -0.07, 0, 0.07, 0.14])
      box(g, x, -0.015, 0.02, 0.025, 0.11, 0.035, m.steel);
  }
  return g;
}
