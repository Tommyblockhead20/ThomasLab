import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSeenHookTutorial, HOOK_TUTORIAL_STORAGE_KEY, markHookTutorialSeen } from '../src/fishing/tutorial-state.js';

test('the hook tutorial is stored after its first bite and survives a new reader', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  assert.equal(hasSeenHookTutorial(storage), false);
  markHookTutorialSeen(storage);
  assert.equal(values.get(HOOK_TUTORIAL_STORAGE_KEY), '1');
  assert.equal(hasSeenHookTutorial(storage), true);
});

test('blocked browser storage does not break fishing', () => {
  const blocked = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); }
  };
  assert.equal(hasSeenHookTutorial(blocked), false);
  assert.doesNotThrow(() => markHookTutorialSeen(blocked));
});
