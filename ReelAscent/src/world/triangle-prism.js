// Centered right-triangular prism. Scale it with the authored object dimensions.
// The sloping face is walkable when the object is made wide enough.
export const TRIANGLE_PRISM_POSITIONS = Object.freeze([
  -.5, -.5, -.5,  .5, -.5, -.5,  -.5, .5, -.5,
  -.5, -.5,  .5,  .5, -.5,  .5,  -.5, .5,  .5
]);

export const TRIANGLE_PRISM_INDICES = Object.freeze([
  0, 2, 1,  3, 4, 5, // triangular ends
  0, 1, 4,  0, 4, 3, // bottom
  0, 3, 5,  0, 5, 2, // upright side
  1, 2, 5,  1, 5, 4  // slope
]);
