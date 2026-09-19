export function historyCommandForKey(event = {}) {
  const modified = Boolean(event.ctrlKey || event.metaKey);
  const key = String(event.key || '').toLowerCase();
  if (!modified) return null;
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y') return 'redo';
  return null;
}
