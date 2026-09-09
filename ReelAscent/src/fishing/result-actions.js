export const FISHING_RESULT_DIRECTIONS = Object.freeze({
  ArrowUp: 'recast',
  ArrowDown: 'stay',
  ArrowLeft: 'down',
  ArrowRight: 'up',
  up: 'recast',
  down: 'stay',
  left: 'down',
  right: 'up'
});

export const fishingResultActionForDirection = (direction) => FISHING_RESULT_DIRECTIONS[direction] ?? null;
export const isFishingResultAction = (action) => ['recast', 'stay', 'up', 'down'].includes(action);
