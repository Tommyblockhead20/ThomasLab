export function turnCabinet(dials: readonly number[], dial: number) {
  return dials.map((value, i) => (value + (i === dial || i === (dial + 1) % 3 ? 1 : 0)) % 6);
}
export function cabinetAligned(dials: readonly number[]) {
  return dials.length === 3 && dials.every((value) => value === 0);
}
const starts: number[][] = [];
const queue = [{ dials: [0, 0, 0], depth: 0 }],
  seen = new Set(['000']);
for (let at = 0; at < queue.length; at++) {
  const { dials, depth } = queue[at];
  if (depth >= 5 && depth <= 9) starts.push(dials);
  for (let dial = 0; dial < 3; dial++) {
    let previous = [...dials];
    for (let i = 0; i < 5; i++) previous = turnCabinet(previous, dial);
    const key = previous.join('');
    if (!seen.has(key)) {
      seen.add(key);
      queue.push({ dials: previous, depth: depth + 1 });
    }
  }
}
export function makeCabinet(random: () => number) {
  return [...starts[Math.floor(random() * starts.length)]];
}
