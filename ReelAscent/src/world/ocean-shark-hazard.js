import { createSpecimenModel, destroySpecimenModel } from '../fishing/specimen-model.js';

export const SHARK_HAZARD_CONFIG = Object.freeze({
  safeDistance: 15,
  warningSeconds: 1.7,
  circlingSeconds: 2.8,
  attackSeconds: 1.15,
  cooldownSeconds: 10
});

export class OceanSharkHazard {
  constructor(app, hud, { getExposureDistance = () => 0, onAttack = () => {} } = {}) {
    this.app = app;
    this.hud = hud;
    this.getExposureDistance = getExposureDistance;
    this.onAttack = onAttack;
    this.stage = 'idle';
    this.timer = 0;
    this.cooldown = 0;
    this.model = null;
    this.phase = 0;
  }

  setStage(stage) {
    this.stage = stage;
    this.timer = 0;
    if (stage === 'warning') this.hud.showToast?.('DEEP-WATER WARNING — something is moving below you.', 2.2);
    if (stage === 'circling') this.hud.showToast?.('SHARK CIRCLING — reach shore or a boat!', 3);
    if (stage === 'attack') this.hud.showToast?.('SHARK ATTACK!', 1.4);
  }

  ensureModel() {
    if (this.model) return this.model;
    this.model = createSpecimenModel({
      specimenId: 'ocean-hazard-shark', speciesId: 'blue-shark', name: 'Blue Shark',
      rarity: 'Rare', length: 102, weight: 190, sizeFraction: .72, shiny: false
    }, { name: 'Deep-water shark hazard', maximumScale: 2.1 });
    this.app.root.addChild(this.model.root);
    return this.model;
  }

  hideModel() {
    if (this.model?.root) this.model.root.enabled = false;
  }

  update(dt, point) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const exposed = point && point.y < 1.65 && this.getExposureDistance(point) > SHARK_HAZARD_CONFIG.safeDistance;
    if (!exposed) {
      if (this.stage !== 'idle') this.setStage('idle');
      this.hideModel();
      return;
    }
    if (this.cooldown > 0) return;
    if (this.stage === 'idle') this.setStage('warning');
    this.timer += dt;
    this.phase += dt;
    if (this.stage === 'warning') {
      this.hideModel();
      if (this.timer >= SHARK_HAZARD_CONFIG.warningSeconds) this.setStage('circling');
      return;
    }
    const model = this.ensureModel();
    model.root.enabled = true;
    const stageDuration = this.stage === 'circling' ? SHARK_HAZARD_CONFIG.circlingSeconds : SHARK_HAZARD_CONFIG.attackSeconds;
    const t = Math.min(1, this.timer / stageDuration);
    const radius = this.stage === 'circling' ? 8 - t * 2.4 : 5.6 * (1 - t);
    const angle = this.phase * (this.stage === 'circling' ? 1.85 : 1.15);
    const x = point.x + Math.cos(angle) * radius;
    const z = point.z + Math.sin(angle) * radius;
    model.root.setPosition(x, -.57, z);
    model.root.setEulerAngles(0, 90 - angle * 180 / Math.PI, this.stage === 'attack' ? -6 : 0);
    if (this.timer < stageDuration) return;
    if (this.stage === 'circling') {
      this.setStage('attack');
      return;
    }
    this.cooldown = SHARK_HAZARD_CONFIG.cooldownSeconds;
    this.setStage('idle');
    this.hideModel();
    this.onAttack();
  }

  destroy() {
    destroySpecimenModel(this.model);
    this.model = null;
  }
}
