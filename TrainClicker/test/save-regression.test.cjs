const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

// Exercise the actual save/load functions and constructors without a browser or game loop.
function game(storage) {
  const sandbox = { localStorage: storage, performance: { now: () => 0 }, console: { error() {} }, ThomasAchievements: { unlock() {} } };
  vm.runInNewContext(`
    const SAVE_KEY = 'trainClickerSaveV1';
    let pauseFlash = '', pauseFlashUntil = 0, buildMode = true;
    ${between('class City {', '    addPassengers(count)')} }
    ${between('const cityData =', '  let audioCtx =')}
    ${between('class Route {', '    getCost(key)')} }
    ${between('function saveGame()', '  // --- 7. UI Setup ---')}
    globalThis.api = {
      saveGame, loadGame,
      snapshot: () => JSON.stringify({ gameData, cities: CITIES, routes: activeRoutes.map(r => ({ a: r.cityAIdx, b: r.cityBIdx, upgrades: r.upgrades })), buildMode }),
      feedback: () => pauseFlash,
      seed: () => { gameData.money = 321; CITIES[0].passengers = 7; activeRoutes = [new Route(0, 1)]; activeRoutes[0].upgrades.speed.lvl = 2; gameData.routesBought = 1; }
    };
  `, sandbox);
  return sandbox.api;
}

function memoryStorage(initial) {
  let value = initial ?? null;
  return { getItem: () => value, setItem: (_key, next) => { value = next; }, replace: next => { value = next; } };
}

test('ordinary saves round-trip routes, upgrades, cities and money with the same save format', () => {
  const storage = memoryStorage();
  const original = game(storage); original.seed(); original.saveGame();
  assert.equal(original.feedback(), 'Game saved');
  const restored = game(storage); restored.loadGame();
  const state = JSON.parse(restored.snapshot());
  assert.equal(restored.feedback(), 'Game loaded');
  assert.equal(state.gameData.money, 321);
  assert.equal(state.gameData.routesBought, 1);
  assert.equal(state.cities[0].passengers, 7);
  assert.equal(state.routes[0].upgrades.speed.lvl, 2);
  assert.equal(state.buildMode, false);
});

test('failed loads leave all current gameplay state untouched, even after a valid first route', () => {
  const invalidSaves = [
    '{', 'null', '[]', '{"money":"not-a-number"}',
    JSON.stringify({ money: 9000, cities: [{ passengers: 40 }, { houses: 'bad' }] }),
    JSON.stringify({ money: 9000, activeRoutes: [{ a: 0, b: 1 }, { a: 4, b: 99 }] }),
    JSON.stringify({ activeRoutes: [{ a: 0, b: 1 }, { a: 1, b: 0 }] }),
    JSON.stringify({ activeRoutes: [{ a: 0, b: 0 }] }),
    JSON.stringify({ activeRoutes: [{ a: 0, b: 8 }] }),
    JSON.stringify({ activeRoutes: [{ a: 0, b: 1, upgrades: { speed: 'bad' } }] })
  ];
  for (const saved of invalidSaves) {
    const current = game(memoryStorage(saved)); current.seed();
    const before = current.snapshot(); current.loadGame();
    assert.equal(current.snapshot(), before, saved);
    assert.match(current.feedback(), /current game is unchanged/);
  }
});

test('unavailable storage reports a failure without throwing or changing the game', () => {
  const current = game({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } });
  current.seed(); const before = current.snapshot();
  assert.doesNotThrow(current.saveGame);
  assert.match(current.feedback(), /Could not save/);
  assert.doesNotThrow(current.loadGame);
  assert.match(current.feedback(), /current game is unchanged/);
  assert.equal(current.snapshot(), before);
});

test('missing saves give a clear message and valid upgrade levels remain bounded', () => {
  const storage = memoryStorage(); const current = game(storage); current.seed();
  const before = current.snapshot(); current.loadGame();
  assert.equal(current.feedback(), 'No save found'); assert.equal(current.snapshot(), before);
  storage.replace(JSON.stringify({ activeRoutes: [{ a: 0, b: 1, upgrades: { speed: 999 } }] }));
  current.loadGame();
  assert.equal(JSON.parse(current.snapshot()).routes[0].upgrades.speed.lvl, 20);
});
