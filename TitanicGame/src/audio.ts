import type { Snapshot } from '../shared/types';
import { roomAt } from '../shared/world';

// Original, synthesized ambience: no downloaded sound assets or licensing keys.
export class ShipAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  rumble: GainNode | null = null;
  wind: GainNode | null = null;
  steamHiss: GainNode | null = null;
  volume = 0.35;
  lastBell = 0;
  lastWaiting = 0;
  lastRing = 0;
  lastStep = 0;
  lastPhase = '';
  lastImpact = 0;
  morseTimers: ReturnType<typeof setTimeout>[] = [];
  crash() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx,
      buffer = ctx.createBuffer(1, ctx.sampleRate * 2.8, ctx.sampleRate),
      data = buffer.getChannelData(0);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      low = low * 0.88 + (Math.random() * 2 - 1) * 0.12;
      data[i] = low * Math.exp(-t * 1.15) * (1 + Math.sin(t * 37) * 0.2);
    }
    const noise = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    noise.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1900, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 2.7);
    gain.gain.value = 1.5;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start();
    this.tone(38, 1.8, 0.65, 'sawtooth');
    this.tone(117, 0.6, 0.16, 'triangle');
  }
  async start() {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
      data = buffer.getChannelData(0);
    let b = 0;
    for (let i = 0; i < data.length; i++) {
      b = (b + (Math.random() * 2 - 1) * 0.025) / 1.025;
      data[i] = b * 4;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0.08;
    noise.connect(this.wind);
    this.wind.connect(this.master);
    noise.start();
    const hiss = ctx.createBufferSource(),
      highpass = ctx.createBiquadFilter();
    const hissBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const hissData = hissBuffer.getChannelData(0);
    for (let n = 0; n < hissData.length; n++) hissData[n] = Math.random() * 2 - 1;
    hiss.buffer = hissBuffer;
    hiss.loop = true;
    highpass.type = 'highpass';
    highpass.frequency.value = 1800;
    this.steamHiss = ctx.createGain();
    this.steamHiss.gain.value = 0;
    hiss.connect(highpass);
    highpass.connect(this.steamHiss);
    this.steamHiss.connect(this.master);
    hiss.start();
    const hum = ctx.createOscillator();
    hum.frequency.value = 43;
    hum.type = 'triangle';
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0.05;
    hum.connect(this.rumble);
    this.rumble.connect(this.master);
    hum.start();
  }
  setVolume(value: number) {
    this.volume = value;
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.15);
  }
  tone(frequency: number, duration = 0.12, volume = 0.25, type: OscillatorType = 'sine') {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx,
      osc = ctx.createOscillator(),
      g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    g.gain.setValueAtTime(volume, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }
  stopMorse() {
    for (const timer of this.morseTimers) clearTimeout(timer);
    this.morseTimers = [];
  }
  morse(code: string) {
    this.stopMorse();
    if (!this.ctx) return 0;
    let at = 0;
    for (const c of code.slice(0, 1800)) {
      if (c === '.' || c === '-') {
        const d = c === '.' ? 0.065 : 0.195;
        this.morseTimers.push(setTimeout(() => this.tone(670, d, 0.25), at * 1000));
        at += d + 0.065;
      } else at += c === '/' ? 0.3 : 0.13;
    }
    return at;
  }
  update(state: Snapshot, moving: boolean) {
    const me = state.players.find((p) => p.id === state.self.id);
    if (!me || !this.ctx) return;
    if (!state.ship.impact) this.lastImpact = 0;
    if (state.ship.impact && state.ship.impact.id !== this.lastImpact) {
      this.lastImpact = state.ship.impact.id;
      if (state.elapsed - state.ship.impact.at < 4) this.crash();
    }
    if (
      state.phase === 'inquiry' ||
      (state.phase === 'ended' && ['schedule', 'route'].includes(state.inquiryCause ?? ''))
    ) {
      this.rumble?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      this.wind?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      this.steamHiss?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      return;
    }
    const room = roomAt(me),
      inside = ['engine', 'boiler'].includes(room),
      now = performance.now();
    const releasing = state.ship.safetyLifted.filter(
      (lifted, i) => lifted || state.ship.reliefUntil[i] > 0,
    ).length;
    this.steamHiss?.gain.setTargetAtTime(
      room === 'boiler' ? Math.min(0.13, releasing * 0.05) : 0,
      this.ctx.currentTime,
      0.1,
    );
    this.rumble?.gain.setTargetAtTime(
      (inside ? 0.32 : room === 'bridge' ? 0.035 : 0.065) * Math.min(1, state.ship.engineRevs / 50),
      this.ctx.currentTime,
      0.7,
    );
    this.wind?.gain.setTargetAtTime(
      inside ? 0.015 : room === 'deck' || room === 'nest' ? 0.16 : 0.04,
      this.ctx.currentTime,
      0.7,
    );
    if (
      state.wirelessWaiting > this.lastWaiting &&
      (room === 'wireless' || (state.self.role === 'Captain' && state.crewSize < 5))
    ) {
      this.tone(630, 0.16, 0.13);
      setTimeout(() => this.tone(790, 0.16, 0.13), 220);
    }
    this.lastWaiting = state.wirelessWaiting;
    const ring = state.phones.some((c) => c.to === room && !c.answerer);
    if (ring && now - this.lastRing > 1700) {
      this.tone(880, 0.32, 0.3, 'triangle');
      setTimeout(() => this.tone(1100, 0.25, 0.3, 'triangle'), 350);
      this.lastRing = now;
    }
    if (moving && now - this.lastStep > 390) {
      this.tone(inside ? 85 : 130, 0.075, 0.15, 'triangle');
      this.lastStep = now;
    }
    if (state.phase === 'sinking' && now - this.lastBell > 1800) {
      this.tone(235, 1.5, 0.55, 'triangle');
      this.tone(247, 1.5, 0.4);
      this.lastBell = now;
    }
    if (this.lastPhase !== 'sinking' && state.phase === 'sinking') this.tone(46, 4, 1, 'sawtooth');
    this.lastPhase = state.phase;
  }
}
export const shipAudio = new ShipAudio();
