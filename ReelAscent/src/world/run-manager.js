import { PLAYER_FOOT_OFFSET } from '../config.js';
import { isCheatsEnabled } from '../debug/cheat-gate.js';

const RARITY_RANK = Object.freeze({ Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 });

export const TEMPORARY_PLAYTEST_CONTROLS = Object.freeze({
  unlimitedStamina: 'F7',
  summitRim: 'F8',
  returnHome: 'Home'
});

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function rarestCatch(catches) {
  return catches.reduce((best, fish) => {
    if (!best) return fish;
    return (RARITY_RANK[fish.rarity] ?? -1) > (RARITY_RANK[best.rarity] ?? -1) ? fish : best;
  }, null);
}

export class RunManager {
  constructor(player, fishing, world, hud, camera, initialStart) {
    this.player = player;
    this.fishing = fishing;
    this.world = world;
    this.hud = hud;
    this.camera = camera;
    this.currentStart = initialStart;
    this.pendingStart = null;
    this.status = 'active';
    this.elapsed = 0;
    this.highestElevation = 0;
    this.summitReached = false;
    this.banner = null;
    this.bannerTime = 0;
    this.endedTime = 0;
    this.summary = null;
    this.debugQueue = [];
    this.newRunButton = document.querySelector('#start-new-run');
    this.homeButton = document.querySelector('#return-home');
    this.onNewRunClick = () => {
      if (this.status === 'ended') this.debugQueue.push({ type: 'new-run' });
    };
    this.newRunButton?.addEventListener('click', this.onNewRunClick);
    this.onHomeClick = () => this.debugQueue.push({ type: 'home' });
    this.homeButton?.addEventListener('click', this.onHomeClick);

    this.onKeyDown = (event) => {
      if (event.repeat) return;
      if (event.code === 'KeyR' && (this.status === 'ended' || this.hud.debugVisible)) {
        event.preventDefault();
        this.debugQueue.push({ type: 'new-run' });
        return;
      }
      // Temporary playtest shortcut: F7 toggles unlimited stamina without requiring
      // the debug HUD. It is deliberately separate from F8's summit teleport.
      if (event.code === TEMPORARY_PLAYTEST_CONTROLS.unlimitedStamina) {
        if (!isCheatsEnabled()) return;
        event.preventDefault();
        this.debugQueue.push({ type: 'toggle-unlimited-stamina' });
        return;
      }
      if (event.code === TEMPORARY_PLAYTEST_CONTROLS.returnHome) {
        if (!isCheatsEnabled()) return;
        event.preventDefault();
        this.debugQueue.push({ type: 'home' });
        return;
      }
      // Temporary playtest shortcut: F8 always jumps to the summit rim, even when the
      // debug HUD is hidden. This is intentionally isolated from the numbered debug map.
      if (event.code === TEMPORARY_PLAYTEST_CONTROLS.summitRim) {
        if (!isCheatsEnabled()) return;
        event.preventDefault();
        this.debugQueue.push({ type: 'teleport', code: 'F8' });
        return;
      }
      if (!this.hud.debugVisible || !isCheatsEnabled()) return;
      if (/^Digit[0-9]$/.test(event.code) || ['KeyT', 'KeyV', 'KeyY', 'KeyO', 'KeyU'].includes(event.code)) {
        event.preventDefault();
        this.debugQueue.push({ type: 'teleport', code: event.code });
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  get paused() {
    return this.status === 'ended';
  }

  update(dt) {
    this.processDebugQueue();

    if (this.status === 'ended') {
      this.endedTime += dt;
      return;
    }

    this.elapsed += dt;
    const position = this.player.getPosition();
    this.highestElevation = Math.max(this.highestElevation, position.y - PLAYER_FOOT_OFFSET);
    if (!this.summitReached && this.world.isAtSummit(position)) {
      this.reachSummit();
    }

    if (this.bannerTime > 0) {
      this.bannerTime = Math.max(0, this.bannerTime - dt);
      if (this.bannerTime === 0) this.banner = null;
    }
  }

  processDebugQueue() {
    for (const action of this.debugQueue.splice(0)) {
      if (action.type === 'new-run') {
        this.startRun(this.world.chooseStart(this.currentStart?.id), true);
        continue;
      }
      if (action.type === 'home') {
        this.status = 'active';
        this.endedTime = 0;
        this.fishing.cancel();
        this.player.teleport(this.currentStart.position, this.currentStart.facingYaw);
        this.camera.setYaw(this.currentStart.facingYaw);
        this.world.setDeveloperCourseVisible(false);
        this.banner = { title: 'BACK AT SPAWN', detail: this.currentStart.label };
        this.bannerTime = 1.5;
        continue;
      }
      if (action.type === 'toggle-unlimited-stamina') {
        const enabled = this.player.setUnlimitedStamina(!this.player.stamina.unlimited);
        this.banner = {
          title: enabled ? 'DEV STAMINA: UNLIMITED' : 'DEV STAMINA: NORMAL',
          detail: enabled ? 'F7 to restore normal stamina.' : 'Normal drain and regeneration restored.'
        };
        this.bannerTime = 1.8;
        continue;
      }
      const target = this.world.getDebugTarget(action.code);
      if (!target) continue;
      this.status = 'active';
      this.endedTime = 0;
      this.fishing.cancel();
      this.player.teleport(target.position, target.facingYaw);
      this.camera.setYaw(target.facingYaw);
      this.world.setDeveloperCourseVisible(['KeyT', 'KeyV'].includes(action.code));
      this.banner = { title: 'DEBUG TELEPORT', detail: target.label };
      this.bannerTime = 1.35;
    }
  }

  startRun(start = this.world.chooseStart(this.currentStart?.id), announce = false) {
    this.currentStart = start;
    this.pendingStart = null;
    this.status = 'active';
    this.elapsed = 0;
    this.highestElevation = Math.max(0, start.position.y - PLAYER_FOOT_OFFSET);
    this.summitReached = false;
    this.summary = null;
    this.endedTime = 0;
    this.fishing.resetRun();
    this.player.setSpawnPoint(start.position);
    this.player.teleport(start.position, start.facingYaw);
    this.camera.setYaw(start.facingYaw);
    this.world.setDeveloperCourseVisible(false);
    this.banner = announce ? { title: 'NEW RUN', detail: start.label } : null;
    this.bannerTime = announce ? 1.6 : 0;
  }

  endRun(reason = 'fall') {
    if (this.status === 'ended') return;
    const catches = [...this.fishing.catchHistory];
    const rarest = rarestCatch(catches);
    this.summary = {
      reason,
      elapsed: this.elapsed,
      highestElevation: this.highestElevation,
      fishCaught: catches.length,
      rarest: rarest ? `${rarest.rarity} ${rarest.name}` : 'None',
      start: this.currentStart.label
    };
    this.status = 'ended';
    this.endedTime = 0;
    this.pendingStart = this.world.chooseStart(this.currentStart.id);
    this.player.exitFishing({ releasePointerLock: true });
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.banner = {
      title: 'RUN ENDED',
      detail: 'Review the run, then start again when you are ready.'
    };
    this.bannerTime = Infinity;
  }

  reachSummit() {
    this.summitReached = true;
    const catches = [...this.fishing.catchHistory];
    const rarest = rarestCatch(catches);
    this.summary = {
      elapsed: this.elapsed,
      highestElevation: this.highestElevation,
      fishCaught: catches.length,
      rarest: rarest ? `${rarest.rarity} ${rarest.name}` : 'None',
      start: this.currentStart.label
    };
    this.banner = {
      title: 'SUMMIT REACHED',
      detail: `${formatTime(this.elapsed)} • ${catches.length} fish • highest ${Math.round(this.highestElevation * 3.28084)}ft • ${this.summary.rarest} • ${this.currentStart.label}`
    };
    this.bannerTime = 5.5;
  }

  getState() {
    const catches = this.fishing.catchHistory;
    const rarest = rarestCatch(catches);
    return {
      status: this.status,
      start: this.currentStart.label,
      elapsed: this.elapsed,
      highestElevation: this.highestElevation,
      summitReached: this.summitReached,
      fishCaught: catches.length,
      rarest: rarest ? `${rarest.rarity} ${rarest.name}` : 'None',
      banner: this.banner,
      summary: this.summary
    };
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.newRunButton?.removeEventListener('click', this.onNewRunClick);
    this.homeButton?.removeEventListener('click', this.onHomeClick);
  }
}
