import type { FiringTool } from './firing';

export const FIRING_TOOLS: FiringTool[] = ['coal', 'slice', 'rake'];
export const FIRING_RACK = { id: 'firing-tools', x: -0.65, z: -7.15, level: -1 as const };
export const COAL_BUNKERS = [-13.6, -6.6].flatMap((z) =>
  [-6.3, 0, 6.3].filter(x => z !== -6.6 || x !== 0).map(x => ({
    id: `coal-${x}-${z}`, x, z, level: -1 as const,
  })),
);
export const toolName = (tool: FiringTool) => tool === 'coal' ? 'shovel' : tool === 'slice' ? 'slice bar' : 'ash rake';
