export function inquirySeat(index: number) {
  const side = index % 2 ? 1 : -1;
  return { x: side * 2.7, z: -4.5 + Math.floor(index / 2) * 2, yaw: (-side * Math.PI) / 2 };
}
