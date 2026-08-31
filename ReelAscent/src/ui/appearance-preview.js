import * as pc from 'playcanvas';
import { createRemoteAvatar } from '../multiplayer/remote-avatar.js';

// The wardrobe preview deliberately instantiates the real multiplayer avatar builder.
// That keeps geometry, category visibility, hat/hair compatibility, and palette resolution
// on the same code path used by another human looking at this player in a room.
export class AppearancePreview {
  constructor(canvas, appearance) {
    this.canvas = canvas;
    this.app = null;
    this.avatar = null;
    this.spinning = true;
    if (!canvas) return;
    try {
      this.app = new pc.Application(canvas, {
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

      this.avatar = createRemoteAvatar(this.app, 'wardrobe-preview', 0, appearance);
      this.avatar.setPosition(0, .15, 0);
      this.avatar.setLocalEulerAngles(0, -22, 0);
      this.app.on('update', () => {
        if (!this.avatar?.enabled) return;
        if (this.spinning) this.avatar.rotateLocal(0, 7 / 60, 0);
        this.avatar.setMovementState?.('grounded', Date.now(), 0);
      });
      this.app.start();
    } catch (error) {
      console.warn('Appearance preview could not initialize', error);
      this.destroy();
    }
  }

  setAppearance(appearance) {
    this.avatar?.setAppearance?.(appearance);
  }

  setVisible(visible) {
    if (this.avatar) this.avatar.enabled = Boolean(visible);
  }

  setSpinning(spinning) {
    this.spinning = Boolean(spinning);
    return this.spinning;
  }

  destroy() {
    this.avatar = null;
    this.app?.destroy?.();
    this.app = null;
  }
}
