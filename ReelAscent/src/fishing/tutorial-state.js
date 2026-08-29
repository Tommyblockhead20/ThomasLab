export const HOOK_TUTORIAL_STORAGE_KEY = 'reel-ascent-hook-tutorial-seen-v1';

export function hasSeenHookTutorial(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(HOOK_TUTORIAL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markHookTutorialSeen(storage = globalThis.localStorage) {
  try {
    storage?.setItem(HOOK_TUTORIAL_STORAGE_KEY, '1');
  } catch {
    // Private or embedded sessions may not expose persistent storage.
  }
}
