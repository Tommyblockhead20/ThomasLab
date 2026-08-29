// This schema describes live, disposable state only. Nothing in this shape belongs in a
// portable progress export or durable local save.
export const TRANSIENT_SESSION_SCHEMA_VERSION = 1;

export function describeTransientSession({ player, fishing, runManager }) {
  return {
    schemaVersion: TRANSIENT_SESSION_SCHEMA_VERSION,
    player: player?.getState?.() ?? null,
    fishing: fishing ? { active: fishing.active, state: fishing.state } : null,
    run: runManager?.getState?.() ?? null
  };
}
