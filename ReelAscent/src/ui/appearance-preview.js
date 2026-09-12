import * as pc from 'playcanvas';
import { createCharacterModel } from '../player/character-model.js';
import { normalizeAppearance } from '../player/appearance.js';

// The wardrobe preview owns a small renderer, but not a separate avatar implementation.
// Its visible hierarchy is the exact canonical character model used by local and remote play.
export class AppearancePreview {
  constructor(canvas, appearance) {
    this.canvas = canvas;
    this.app = null;
    this.avatar = null;
    this.character = null;
    this.appearance = normalizeAppearance(appearance);
    this.visible = false;
    this.spinning = true;
    this.onWindowResize = () => {
      if (this.visible) globalThis.requestAnimationFrame?.(() => this.resizeToDisplay());
    };
  }

  initialize() {
    if (!this.canvas || this.app) return Boolean(this.app);
    try {
      // The menu is visible before this method runs. Initializing against a real non-zero
      // canvas prevents the incomplete/zero-sized framebuffer that made the old preview
      // silently show no newly selected cosmetics.
      this.app = new pc.Application(this.canvas, {
        graphicsDeviceOptions: { antialias: true, alpha: true, preserveDrawingBuffer: false }
      });
      this.app.graphicsDevice.maxPixelRatio = Math.min(globalThis.devicePixelRatio ?? 1, 2);
      this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
      this.app.scene.ambientLight = new pc.Color(.72, .76, .71);

      const camera = new pc.Entity('Wardrobe preview camera');
      camera.addComponent('camera', {
        clearColor: new pc.Color(.035, .12, .125, 1),
        fov: 38,
        nearClip: .05,
        farClip: 40
      });
      camera.setPosition(0, .72, 4.35);
      camera.lookAt(0, .18, 0);
      this.app.root.addChild(camera);

      const key = new pc.Entity('Wardrobe preview key light');
      key.addComponent('light', { type: 'directional', color: new pc.Color(1, .91, .72), intensity: 1.45 });
      key.setEulerAngles(35, -28, 0);
      this.app.root.addChild(key);
      const fill = new pc.Entity('Wardrobe preview fill light');
      fill.addComponent('light', { type: 'omni', color: new pc.Color(.48, .75, .82), intensity: .72, range: 8 });
      fill.setPosition(-2, 1.8, 2.4);
      this.app.root.addChild(fill);

      this.avatar = new pc.Entity('Wardrobe canonical character preview');
      this.avatar.setLocalScale(1, .89, 1);
      this.avatar.setPosition(0, .15, 0);
      this.avatar.setLocalEulerAngles(0, -22, 0);
      this.app.root.addChild(this.avatar);
      this.character = createCharacterModel(this.avatar, { name: 'Wardrobe preview' });
      this.character.setAppearance(this.appearance);
      this.app.on('update', () => {
        if (!this.avatar?.enabled) return;
        if (this.spinning) this.avatar.rotateLocal(0, 7 / 60, 0);
      });
      this.app.start();
      globalThis.addEventListener?.('resize', this.onWindowResize);
      this.resizeToDisplay();
      return true;
    } catch (error) {
      console.warn('Appearance preview could not initialize', error);
      this.destroy();
      return false;
    }
  }

  setAppearance(appearance) {
    this.appearance = normalizeAppearance(appearance);
    this.character?.setAppearance(this.appearance);
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    if (this.visible && !this.initialize()) return;
    if (this.avatar) this.avatar.enabled = this.visible;
    if (this.visible) {
      this.resizeToDisplay();
      globalThis.requestAnimationFrame?.(() => this.resizeToDisplay());
    }
  }

  resizeToDisplay() {
    if (!this.app || !this.canvas || !this.visible) return;
    const width = Math.max(1, Math.round(this.canvas.clientWidth || this.canvas.width || 1));
    const height = Math.max(1, Math.round(this.canvas.clientHeight || this.canvas.height || 1));
    // Application.resizeCanvas writes inline CSS width/height. During the modal's
    // first layout that can freeze the canvas at 1px tall. Only resize the drawing
    // buffer here and let the responsive wardrobe CSS own the display dimensions.
    this.app.graphicsDevice.resizeCanvas(width, height);
  }

  setSpinning(spinning) {
    this.spinning = Boolean(spinning);
    return this.spinning;
  }

  destroy() {
    globalThis.removeEventListener?.('resize', this.onWindowResize);
    this.character = null;
    this.avatar = null;
    this.app?.destroy?.();
    this.app = null;
  }
}
