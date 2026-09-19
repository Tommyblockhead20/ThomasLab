export function recordActionSnapshot(past, future, current, limit = 120) {
  past.push(current);
  if (past.length > limit) past.shift();
  future.length = 0;
}

export function undoActionSnapshot(past, future, current, limit = 120) {
  if (!past.length) return null;
  future.push(current);
  if (future.length > limit) future.shift();
  return past.pop();
}

export function redoActionSnapshot(past, future, current, limit = 120) {
  if (!future.length) return null;
  past.push(current);
  if (past.length > limit) past.shift();
  return future.pop();
}

