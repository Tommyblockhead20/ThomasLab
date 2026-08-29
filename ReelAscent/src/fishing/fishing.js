import * as pc from 'playcanvas';
import { FISHING_CONFIG } from '../config.js';
import {
  createCatchRecord, createFishSpecimenForCategories, FISH_SPECIES, getFishDisplayMetrics,
  getWeightedSpeciesTable, rollFish
} from './fish-data.js';
import { getEcologySelection } from './fish-ecology.js';
import { calculateEyeAttachment } from './creature-presentation.js';
import { calculateCatchGroundLift, catchGroundSamplePoints } from './presentation-grounding.js';
import { createFishingPerformanceSnapshot, FishingPerformanceHistory } from './fishing-performance.js';
import { RHYTHM_SCALE_SEMITONES, RhythmSession } from './rhythm-session.js';
import { hasSeenHookTutorial, markHookTutorialSeen } from './tutorial-state.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const FISHING_SAMPLE_BASE = `${import.meta.env.BASE_URL ?? '/'}audio/fishing/instruments/`;

// Non-fish caught creatures keep one authored silhouette. Actual specimen length chooses a
// uniform baseline size from the authored X extent; weight condition then nudges the entire root
// thicker/thinner on Y/Z. No child part is independently repositioned by specimen size, so every
// authored overlap/connector remains physically connected. Values are approximate canonical
// rig extents; X is the sizing reference while Y/Z document the authored silhouette.
const STABLE_RIG_BOUNDS = Object.freeze({
  shark: [1.65, .62, .8],
  ray: [1.7, .28, 1.45],
  eel: [1.7, .42, .42],
  crab: [1.25, .52, 1.55],
  horseshoe: [1.65, .42, 1.35],
  lobster: [1.55, .46, .82],
  shrimp: [1.55, .36, .52],
  octopus: [1.2, 1.05, 1.05],
  lusca: [1.35, 1.05, 1.05],
  squid: [1.7, .55, .82],
  snail: [1.15, .58, .58],
  bivalve: [1.0, .36, 1.25],
  salamander: [1.2, .42, .55],
  jellyfish: [.9, 1.35, .9],
  insect: [1.0, .42, .72],
  softbody: [1.3, .52, .55],
  wisp: [.75, .55, .55],
  mammal: [1.35, .68, .62],
  rodent: [1.25, .68, .68],
  otter: [1.45, .58, .56],
  beaver: [1.35, .76, .72],
  platypus: [1.42, .62, .7],
  pinniped: [1.4, .72, .7],
  cetacean: [1.65, .62, .68],
  sirenian: [1.45, .78, .76],
  turtle: [1.15, .56, 1.05],
  frog: [.9, .62, .72],
  starfish: [1.05, .2, 1.05],
  urchin: [.9, .9, .9],
  nautilus: [1.0, .62, .68],
  waterhorse: [1.4, .86, .7],
  serpent: [1.75, .48, .45],
  dragon: [2.0, .74, .66],
  plesiosaur: [1.65, .82, .7]
});

// Small perceptual trims after active-RMS normalization. Low/plucked samples otherwise
// feel quieter than sustained midrange instruments even at identical numeric RMS.
const INSTRUMENT_MIX_GAIN = Object.freeze({
  kalimba: 1.2,
  electric_bass: 1.12,
  upright_bass_pizz: 1.12,
  double_bass_arco: 1.08,
  cello_arco: 1.04,
  tuba: 1.08,
  contrabassoon: 1.08,
  bassoon: 1.04,
  bass_clarinet: 1.04,
  guitar: 1.06,
  harp: 1.04,
  handpan: 1.02,
  marimba: 1.02,
  glockenspiel: .92,
  xylophone: .94,
  trumpet: .9,
  saxophone: .94,
  violin_arco: .94,
  harmonica: .94,
  flute: .96
});

function makeMaterial(values, options = {}) {
  const result = new pc.StandardMaterial();
  result.diffuse = new pc.Color(values[0], values[1], values[2], options.opacity ?? 1);
  const emissive = options.emissive ?? [0, 0, 0];
  result.emissive = new pc.Color(emissive[0], emissive[1], emissive[2]);
  result.emissiveIntensity = options.emissiveIntensity ?? 1;
  result.gloss = options.gloss ?? 0.25;
  result.opacity = options.opacity ?? 1;
  if (result.opacity < 1) {
    result.blendType = pc.BLEND_NORMAL;
    result.depthWrite = false;
  }
  result.update();
  return result;
}

function addPrimitive(parent, name, type, position, scale, material, rotation = {}) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type, material, castShadows: true });
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(scale.x, scale.y, scale.z);
  entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  parent.addChild(entity);
  return entity;
}

// Small overlapping ellipsoids are used at major articulated joins. They are deliberately
// visible and share the adjacent body material: the held-creature style is low-poly/organic,
// and a slightly thicker joint is preferable to even a one-pixel floating gap. Because the
// entire rig is scaled from one root, these overlaps remain overlaps at every specimen size.
function addOrganicJoint(parent, name, position, scale, material) {
  return addPrimitive(parent, name, 'sphere', position, scale, material);
}

function attachEyePairToHead(eyes, head, overlapFraction = .22) {
  if (!eyes?.length || !head) return;
  const headPosition = head.getLocalPosition();
  const headScale = head.getLocalScale();
  for (const [index, eye] of eyes.entries()) {
    const eyePosition = eye.getLocalPosition();
    const eyeScale = eye.getLocalScale();
    const attachment = calculateEyeAttachment({
      headCenterX: headPosition.x,
      headCenterY: headPosition.y,
      headLength: headScale.x,
      headHeight: headScale.y,
      headWidth: headScale.z,
      eyeX: eyePosition.x,
      eyeY: eyePosition.y,
      eyeDepth: eyeScale.z,
      overlapFraction
    });
    eye.setLocalPosition(
      eyePosition.x,
      eyePosition.y,
      headPosition.z + (index === 0 ? 1 : -1) * attachment.centerOffset
    );
  }
}

function setBoxBetween(entity, start, end, thickness = 0.018) {
  const midpoint = start.clone().lerp(start, end, 0.5);
  const distance = start.distance(end);
  entity.setPosition(midpoint);
  entity.lookAt(end);
  entity.setLocalScale(thickness, thickness, distance);
}

class FishingAudio {
  constructor() {
    this.context = null;
    this.noiseBuffer = null;
    this.sampleManifest = null;
    this.sampleManifestPromise = null;
    this.instrumentBuffers = new Map();
    this.instrumentLoadPromises = new Map();
    this.accentBuffers = new Map();
    this.accentLoadPromise = null;
    this.sampleOutput = null;
    this.sampleOutputContext = null;
  }

  getContext() {
    const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContextCtor) return null;
    this.context ??= new AudioContextCtor();
    if (this.context.state === 'suspended') this.context.resume?.().catch(() => {});
    return this.context;
  }

  async prepareForRhythm(instrumentId) {
    const context = this.getContext();
    if (!context) return { ready: false, leadSeconds: .04, audioStartTime: null };
    if (context.state === 'suspended') {
      try { await context.resume?.(); } catch { /* Synth fallback remains available. */ }
    }
    const samples = Promise.allSettled([
      instrumentId === 'handpan' ? Promise.resolve(true) : this.prepareInstrument(instrumentId),
      this.prepareAccents()
    ]);
    // Sample loading already begins during the bite. At hook time, give any remaining decode
    // a short bounded window; the song clock never starts before resume resolves, while slow or
    // unavailable samples still fall through to the existing synth voice without a visible prompt.
    await Promise.race([
      samples,
      new Promise((resolve) => globalThis.setTimeout(resolve, 120))
    ]);
    const leadSeconds = .045;
    return {
      ready: context.state === 'running',
      leadSeconds,
      audioStartTime: context.currentTime + leadSeconds
    };
  }

  getSampleOutput(context) {
    if (this.sampleOutput && this.sampleOutputContext === context) return this.sampleOutput;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-20, context.currentTime);
    compressor.knee.setValueAtTime(12, context.currentTime);
    compressor.ratio.setValueAtTime(4, context.currentTime);
    compressor.attack.setValueAtTime(.004, context.currentTime);
    compressor.release.setValueAtTime(.16, context.currentTime);
    compressor.connect(context.destination);
    this.sampleOutput = compressor;
    this.sampleOutputContext = context;
    return compressor;
  }

  getNormalizationGain(buffer) {
    if (!buffer) return 1;
    let peak = 0;
    for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
      const data = buffer.getChannelData(channelIndex);
      for (let index = 0; index < data.length; index += 1) peak = Math.max(peak, Math.abs(data[index]));
    }
    if (peak < .0001) return 1;

    // Measure 20 ms blocks and gate against the loudest meaningful block. Unlike whole-file
    // RMS, this ignores encoded silence and long reverb tails; unlike a per-sample gate, it
    // does not discard the quiet half of each waveform and overestimate apparent loudness.
    const blockSize = Math.max(32, Math.round(buffer.sampleRate * .02));
    const blockRms = [];
    for (let start = 0; start < buffer.length; start += blockSize) {
      let blockSquares = 0;
      let blockSamples = 0;
      const end = Math.min(buffer.length, start + blockSize);
      for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
        const data = buffer.getChannelData(channelIndex);
        for (let index = start; index < end; index += 1) {
          blockSquares += data[index] * data[index];
          blockSamples += 1;
        }
      }
      blockRms.push(blockSamples ? Math.sqrt(blockSquares / blockSamples) : 0);
    }
    const loudestBlock = Math.max(...blockRms, 0);
    const threshold = Math.max(.0015, loudestBlock * .12);
    let squareSum = 0;
    let activeSamples = 0;
    for (let blockIndex = 0; blockIndex < blockRms.length; blockIndex += 1) {
      if (blockRms[blockIndex] < threshold) continue;
      const start = blockIndex * blockSize;
      const end = Math.min(buffer.length, start + blockSize);
      for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
        const data = buffer.getChannelData(channelIndex);
        for (let index = start; index < end; index += 1) {
          squareSum += data[index] * data[index];
          activeSamples += 1;
        }
      }
    }
    const activeRms = activeSamples ? Math.sqrt(squareSum / activeSamples) : peak * .5;
    const rmsGain = .145 / Math.max(.001, activeRms);
    const peakGain = .8 / peak;
    return clamp(Math.min(rmsGain, peakGain), .55, 3.4);
  }

  loadSampleManifest() {
    if (this.sampleManifest) return Promise.resolve(this.sampleManifest);
    if (this.sampleManifestPromise) return this.sampleManifestPromise;
    this.sampleManifestPromise = fetch(`${FISHING_SAMPLE_BASE}manifest.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Fishing audio manifest failed: ${response.status}`);
        return response.json();
      })
      .then((manifest) => {
        this.sampleManifest = manifest;
        return manifest;
      })
      .catch((error) => {
        console.warn('Recorded fishing audio unavailable; using synth fallback.', error);
        this.sampleManifestPromise = null;
        return null;
      });
    return this.sampleManifestPromise;
  }

  async decodeSample(file) {
    const context = this.getContext();
    if (!context) return null;
    const response = await fetch(`${FISHING_SAMPLE_BASE}${file}`);
    if (!response.ok) throw new Error(`Fishing sample failed: ${file}`);
    const data = await response.arrayBuffer();
    return context.decodeAudioData(data.slice(0));
  }

  prepareInstrument(instrumentId) {
    if (!instrumentId) return Promise.resolve(false);
    if (this.instrumentBuffers.has(instrumentId)) return Promise.resolve(true);
    if (this.instrumentLoadPromises.has(instrumentId)) return this.instrumentLoadPromises.get(instrumentId);

    const promise = this.loadSampleManifest()
      .then(async (manifest) => {
        const definition = manifest?.instruments?.[instrumentId];
        if (!definition) return false;
        const entries = await Promise.all(definition.samples.map(async (sample) => {
          const buffer = await this.decodeSample(sample.file);
          return [sample.degree, buffer ? { buffer, normalizationGain: this.getNormalizationGain(buffer) } : null];
        }));
        this.instrumentBuffers.set(instrumentId, new Map(entries.filter(([, entry]) => entry?.buffer)));
        return this.instrumentBuffers.get(instrumentId).size > 0;
      })
      .catch((error) => {
        console.warn(`Could not load fishing instrument ${instrumentId}; using synth fallback.`, error);
        return false;
      })
      .finally(() => this.instrumentLoadPromises.delete(instrumentId));

    this.instrumentLoadPromises.set(instrumentId, promise);
    return promise;
  }

  prepareAccents() {
    if (this.accentLoadPromise) return this.accentLoadPromise;
    this.accentLoadPromise = this.loadSampleManifest()
      .then(async (manifest) => {
        const accents = manifest?.percussion_accents ?? {};
        const wanted = ['woodblock', 'triangle'];
        const entries = await Promise.all(wanted.map(async (name) => {
          const file = accents[name];
          if (!file) return [name, null];
          try { return [name, await this.decodeSample(file)]; }
          catch { return [name, null]; }
        }));
        for (const [name, buffer] of entries) if (buffer) this.accentBuffers.set(name, buffer);
        return this.accentBuffers.size > 0;
      })
      .catch(() => false);
    return this.accentLoadPromise;
  }

  playBuffer(buffer, options = {}) {
    try {
      const context = this.getContext();
      if (!context || !buffer) return false;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(options.playbackRate ?? 1, context.currentTime);
      gain.gain.setValueAtTime(Math.max(.0001, options.volume ?? .18), context.currentTime);
      source.connect(gain).connect(this.getSampleOutput(context));
      source.start(context.currentTime + (options.offset ?? 0));
      return true;
    } catch {
      return false;
    }
  }

  playRecordedNote(instrumentId, degree, options = {}) {
    const normalizedDegree = clamp(Math.round(degree ?? 1), 1, 8);
    const entry = this.instrumentBuffers.get(instrumentId)?.get(normalizedDegree);
    if (entry?.buffer) {
      const mixGain = INSTRUMENT_MIX_GAIN[instrumentId] ?? 1;
      return this.playBuffer(entry.buffer, {
        ...options,
        volume: (options.volume ?? .2) * entry.normalizationGain * mixGain
      });
    }
    void this.prepareInstrument(instrumentId);
    return false;
  }

  getNoiseBuffer(context) {
    if (this.noiseBuffer?.sampleRate === context.sampleRate) return this.noiseBuffer;
    const length = Math.max(1, Math.floor(context.sampleRate * .055));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      const envelope = Math.pow(1 - index / channel.length, 2.4);
      channel[index] = (Math.random() * 2 - 1) * envelope;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  createKarplusBuffer(context, frequency, duration, damping = .992, brightness = .55) {
    const sampleRate = context.sampleRate;
    const delay = Math.max(2, Math.round(sampleRate / Math.max(35, frequency)));
    const length = Math.max(delay + 2, Math.ceil(sampleRate * Math.max(.14, duration + .1)));
    const buffer = context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < delay; index += 1) {
      const pickEnvelope = 1 - index / delay * .22;
      data[index] = (Math.random() * 2 - 1) * pickEnvelope;
    }
    let previous = 0;
    for (let index = delay; index < length; index += 1) {
      const delayed = data[index - delay];
      const neighbor = data[Math.max(0, index - delay - 1)];
      const averaged = (delayed + neighbor) * .5;
      previous += (averaged - previous) * brightness;
      data[index] = previous * damping;
    }
    return buffer;
  }

  tone(frequency, duration = 0.09, offset = 0, preset = 'soft', options = {}) {
    try {
      const context = this.getContext();
      if (!context) return;
      const start = context.currentTime + offset;
      const profiles = {
        // String-like presets use a Karplus-Strong resonator instead of clean oscillator waves.
        guitar: { engine: 'string', damping: .994, brightness: .42, cutoff: 3100, volume: .058 },
        pluck: { engine: 'string', damping: .989, brightness: .66, cutoff: 3900, volume: .052 },
        bass: { engine: 'string', damping: .996, brightness: .32, cutoff: 1350, volume: .068 },
        // The old "chip" name remains for data compatibility, but is intentionally a kalimba-ish pluck.
        chip: { engine: 'string', damping: .991, brightness: .72, cutoff: 4300, volume: .047 },
        // Struck objects use individually decaying physical-ish resonant modes so they do not sound organ-like.
        wood: { engine: 'modal', modes: [[1, 1, .13], [2.76, .16, .075], [5.4, .045, .045]], cutoff: 2200, volume: .054, noise: .075, noiseHz: 1450 },
        marimba: { engine: 'modal', modes: [[1, 1, .3], [3.96, .12, .12], [9.65, .018, .065]], cutoff: 3000, volume: .06, noise: .035, noiseHz: 1900 },
        handpan: { engine: 'modal', modes: [[1, 1, .62], [2.01, .22, .44], [2.91, .12, .35], [4.08, .045, .25]], cutoff: 4300, volume: .052, noise: .018, noiseHz: 2400 },
        muted: { engine: 'modal', modes: [[1, 1, .095], [2.6, .11, .05], [4.7, .025, .035]], cutoff: 1450, volume: .044, noise: .095, noiseHz: 900 },
        bell: { engine: 'modal', modes: [[1, 1, .52], [2.38, .25, .39], [3.91, .12, .31], [5.43, .05, .24]], cutoff: 6000, volume: .052, noise: .012, noiseHz: 3900 },
        glass: { engine: 'modal', modes: [[1, 1, .44], [2.71, .18, .33], [4.17, .075, .27], [6.03, .03, .2]], cutoff: 6200, volume: .05, noise: .008, noiseHz: 4400 },
        // Breath presets deliberately mix a smooth fundamental with filtered air noise and gentle vibrato.
        flute: { engine: 'breath', partials: [[1, 1], [2, .055], [3, .018]], cutoff: 4100, volume: .047, attack: .028, noise: .055, noiseHz: 3100 },
        soft: { engine: 'breath', partials: [[1, 1], [2, .035], [3, .012]], cutoff: 1550, volume: .043, attack: .02, noise: .025, noiseHz: 1000 }
      };
      const profile = profiles[preset] ?? profiles.soft;
      const peak = options.volume ?? profile.volume;

      if (profile.engine === 'string') {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = this.createKarplusBuffer(
          context,
          frequency,
          Math.max(duration * 2.4, .22),
          profile.damping,
          profile.brightness
        );
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(profile.cutoff, start);
        gain.gain.setValueAtTime(Math.max(.0002, peak), start);
        gain.gain.exponentialRampToValueAtTime(.0001, start + Math.max(.16, duration * 2.5));
        source.connect(filter).connect(gain).connect(context.destination);
        source.start(start);
        source.stop(start + Math.max(.18, duration * 2.65));
        return;
      }

      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(profile.cutoff, start);
      filter.connect(context.destination);

      if (profile.engine === 'modal') {
        for (const [ratio, level, decay] of profile.modes) {
          const oscillator = context.createOscillator();
          const modeGain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency * ratio, start);
          oscillator.detune.setValueAtTime((options.detune ?? 0) / Math.max(1, ratio), start);
          modeGain.gain.setValueAtTime(Math.max(.0001, peak * level), start);
          modeGain.gain.exponentialRampToValueAtTime(.0001, start + Math.max(.035, decay * (duration / .11)));
          oscillator.connect(modeGain).connect(filter);
          oscillator.start(start);
          oscillator.stop(start + Math.max(.06, decay * (duration / .11) + .03));
        }
      } else {
        const master = context.createGain();
        master.gain.setValueAtTime(.0001, start);
        master.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), start + profile.attack);
        master.gain.exponentialRampToValueAtTime(.0001, start + Math.max(profile.attack + .06, duration * 1.35));
        master.connect(filter);
        const vibrato = context.createOscillator();
        const vibratoGain = context.createGain();
        vibrato.frequency.setValueAtTime(5.2, start);
        vibratoGain.gain.setValueAtTime(preset === 'flute' ? frequency * .004 : frequency * .0015, start);
        vibrato.connect(vibratoGain);
        for (const [ratio, level] of profile.partials) {
          const oscillator = context.createOscillator();
          const oscillatorGain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency * ratio, start);
          oscillatorGain.gain.setValueAtTime(level, start);
          vibratoGain.connect(oscillator.frequency);
          oscillator.connect(oscillatorGain).connect(master);
          oscillator.start(start);
          oscillator.stop(start + duration * 1.45 + .04);
        }
        vibrato.start(start);
        vibrato.stop(start + duration * 1.45 + .04);
      }

      if (profile.noise > 0) {
        const noise = context.createBufferSource();
        const noiseFilter = context.createBiquadFilter();
        const noiseGain = context.createGain();
        noise.buffer = this.getNoiseBuffer(context);
        noiseFilter.type = profile.engine === 'breath' ? 'bandpass' : 'highpass';
        noiseFilter.frequency.setValueAtTime(profile.noiseHz, start);
        noiseFilter.Q.setValueAtTime(profile.engine === 'breath' ? .72 : .5, start);
        noiseGain.gain.setValueAtTime(profile.noise * Math.min(1, peak / .04), start);
        noiseGain.gain.exponentialRampToValueAtTime(.0001, start + Math.min(duration * 1.2, profile.engine === 'breath' ? .13 : .055));
        noise.connect(noiseFilter).connect(noiseGain).connect(context.destination);
        noise.start(start);
        noise.stop(start + Math.min(duration * 1.3 + .02, .16));
      }
    } catch {
      // Visual cues keep the mechanic playable when embedded browsers mute WebAudio.
    }
  }

  cast() {
    this.tone(360, .07, 0, 'wood', { volume: .032 });
    this.tone(260, .09, .055, 'soft', { volume: .028 });
  }

  hook() {
    this.tone(460, .065, 0, 'pluck', { volume: .045 });
    this.tone(690, .085, .045, 'pluck', { volume: .04 });
  }

  bite() {
    this.tone(540, 0.1, 0, 'bell', { volume: .04 });
    this.tone(760, 0.12, 0.1, 'bell', { volume: .045 });
  }

  splash() {
    this.tone(175, 0.08, 0, 'soft', { volume: .032 });
    this.tone(115, 0.12, .025, 'bass', { volume: .025 });
  }

  success(strong = false) {
    this.tone(440, 0.12, 0, 'marimba');
    this.tone(660, 0.14, 0.12, 'marimba');
    this.tone(880, 0.16, 0.25, 'bell');
    if (strong) this.tone(1100, .22, .41, 'glass');
  }

  beat(accent = false) {
    // Keep the beat understated so the species instrument remains the musical focus.
    const buffer = this.accentBuffers.get('woodblock');
    if (buffer) {
      this.playBuffer(buffer, { volume: accent ? .055 : .032 });
      return;
    }
    void this.prepareAccents();
    this.tone(accent ? 260 : 210, 0.045, 0, accent ? 'wood' : 'muted', { volume: accent ? .018 : .01 });
  }

  rhythmHit(fish, degree, perfect) {
    const instrument = fish?.rhythm.instrument ?? 'kalimba';
    // Recorded note samples are the primary fishing melody. Size changes the event timing in
    // RhythmSession, not the sample pitch, so every species retains its recognizable scale tune.
    const scheduleLead = .014;
    if (instrument !== 'handpan'
      && this.playRecordedNote(instrument, degree, { volume: perfect ? .25 : .21, offset: scheduleLead })) return;

    // First-note/network fallback only: preserve playability if a sample has not decoded yet.
    const root = fish?.rhythm.root ?? 55;
    const semitones = RHYTHM_SCALE_SEMITONES[clamp((degree ?? 1) - 1, 0, 7)] ?? 0;
    const frequency = root * Math.pow(2, semitones / 12) * 4;
    this.tone(
      frequency,
      instrument === 'handpan' ? (perfect ? .18 : .15) : (perfect ? .13 : .1),
      scheduleLead,
      instrument === 'handpan' ? 'handpan' : 'soft',
      { volume: perfect ? .045 : .035 }
    );
  }

  rhythmMiss() {
    this.tone(120, 0.09, 0, 'muted', { volume: .045 });
    this.tone(88, .13, .025, 'bass', { volume: .035 });
  }

  danger() {
    this.tone(105, .18, 0, 'bass');
    this.tone(155, .14, .18, 'muted');
  }
}

export class FishingController {
  constructor(app, player, world, options = {}) {
    this.app = app;
    this.player = player;
    this.world = world;
    this.rng = options.rng ?? Math.random;
    this.config = options.config ?? FISHING_CONFIG;
    this.progression = options.progression ?? null;
    this.audio = new FishingAudio();
    this.state = 'inactive';
    this.stateTime = 0;
    this.zone = null;
    this.message = '';
    this.charge = 0;
    this.biteTimer = 0;
    this.hookTimer = 0;
    this.resultTimer = 0;
    this.selectedFish = null;
    this.rhythm = null;
    this.rhythmDebugAttempt = null;
    this.rhythmStartup = null;
    this.rhythmStartupToken = 0;
    this.lastRhythmBeat = -1;
    this.lastJudgmentTime = -1;
    this.lastFishingFailure = null;
    this.catchCard = null;
    this.catchGroundLift = 0;
    this.catchHistory = [];
    this.performanceHistory = new FishingPerformanceHistory();
    this.performanceEncounterSequence = 0;
    this.activePerformanceEncounter = null;
    this.activePerformanceRecorded = false;
    // Soft anti-repeat memory: fishing is still weighted/random, but recently hooked species
    // become temporarily less likely so a diverse pond actually feels diverse.
    this.recentHookSpecies = [];
    this.selectionDebug = null;
    this.rhythmInputSerial = 0;
    this.rhythmInputFeedback = null;
    this.rhythmInputFeedbackBatch = [];
    this.hasShownRecastHint = false;
    this.bestBySpecies = new Map();
    this.seenSpecies = new Set();
    this.gallery = { active: false, mode: 'species', speciesIndex: 0, modelIndex: 0, lengthIndex: 2, sizeIndex: 2, changedDimension: 'length', shiny: false };
    this.galleryModelArchetypes = Object.freeze([...new Set(FISH_SPECIES.map((species) => species.visual?.archetype ?? 'panfish'))]);
    this.cast = null;
    this.aimDirection = new pc.Vec3(0, 0, -1);
    this.bobberPosition = new pc.Vec3();
    this.visualTime = 0;
    this.rippleAge = 99;
    this.castInputHeld = false;
    this.nearLossWarned = false;
    this.hookTutorialSeen = hasSeenHookTutorial();
    this.showHookTutorial = false;
    this.biteSplashTimer = 0;
    this.buildVisuals();
    this.catchContinueQueued = false;
    this.onCatchContinueKeyDown = (event) => {
      if (this.state !== 'caught' || event.repeat || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.catchContinueQueued = true;
    };
    this.onDebugKeyDown = (event) => {
      if (event.repeat) return;
      const targetTag = event.target?.tagName?.toLowerCase?.() ?? '';
      if (targetTag === 'input' || targetTag === 'textarea' || event.target?.isContentEditable) return;
      const galleryToggle = event.code === 'F4' || event.code === 'KeyP';
      if (galleryToggle) {
        if (!this.gallery.active && (document.body.classList.contains('inventory-open')
          || document.body.classList.contains('journal-open'))) return;
        event.preventDefault();
        if (this.gallery.active) this.closeGallery(); else this.openGallery();
        return;
      }
      if ((event.code === 'Escape' || event.code === 'F3') && this.gallery.active) {
        event.preventDefault();
        this.closeGallery();
        return;
      }
      if (!this.gallery.active) return;
      // Deliberately avoid the arrow keys here: they are also player/camera controls and made
      // the held-creature gallery drift around while trying to inspect a model.
      if (event.code === 'KeyJ') {
        this.stepGallery(-1);
      } else if (event.code === 'KeyK') {
        this.stepGallery(1);
      } else if (event.code === 'KeyL') {
        this.gallery.lengthIndex = (this.gallery.lengthIndex + 1) % 5;
        this.gallery.changedDimension = 'length';
        this.refreshGalleryFish();
      } else if (event.code === 'KeyB') {
        this.gallery.sizeIndex = (this.gallery.sizeIndex + 1) % 5;
        this.gallery.changedDimension = 'size';
        this.refreshGalleryFish();
      } else if (event.code === 'KeyH') {
        this.gallery.shiny = !this.gallery.shiny;
        this.refreshGalleryFish();
      } else if (event.code === 'KeyM') {
        this.toggleGalleryMode();
      } else return;
      event.preventDefault();
    };
    window.REEL_ASCENT_CREATURE_GALLERY = {
      open: () => this.openGallery(),
      close: () => this.closeGallery(),
      toggle: () => (this.gallery.active ? this.closeGallery() : this.openGallery()),
      next: () => this.stepGallery(1),
      previous: () => this.stepGallery(-1),
      toggleMode: () => this.toggleGalleryMode(),
      speciesMode: () => {
        this.gallery.mode = 'species';
        this.refreshGalleryFish();
      },
      modelMode: () => {
        this.gallery.mode = 'models';
        this.refreshGalleryFish();
      },
      setShiny: (value) => {
        this.gallery.shiny = Boolean(value);
        this.refreshGalleryFish();
      },
      cycleLength: () => {
        this.gallery.lengthIndex = (this.gallery.lengthIndex + 1) % 5;
        this.gallery.changedDimension = 'length';
        this.refreshGalleryFish();
      },
      cycleBodySize: () => {
        this.gallery.sizeIndex = (this.gallery.sizeIndex + 1) % 5;
        this.gallery.changedDimension = 'size';
        this.refreshGalleryFish();
      },
      cycleSize: () => {
        this.gallery.sizeIndex = (this.gallery.sizeIndex + 1) % 5;
        this.gallery.changedDimension = 'size';
        this.refreshGalleryFish();
      }
    };
    window.addEventListener('keydown', this.onCatchContinueKeyDown, true);
    window.addEventListener('keydown', this.onDebugKeyDown);
  }

  buildVisuals() {
    this.rodRoot = new pc.Entity('Fishing rod');
    this.rodRoot.enabled = false;
    this.rodRoot.setLocalPosition(0.42, 0.22, -0.26);
    this.rodRoot.setLocalEulerAngles(-32, 0, 8);
    this.player.visualRoot.addChild(this.rodRoot);
    const rodLength = 1.56;
    addPrimitive(
      this.rodRoot, 'Rod shaft', 'cylinder',
      { x: 0, y: rodLength * .5, z: 0 }, { x: 0.055, y: rodLength, z: 0.055 },
      makeMaterial([0.17, 0.12, 0.08], { gloss: 0.45 })
    );
    // Keep the line anchor literally on the visible guide at the end of the shaft. The old
    // guide sat well beyond the cylinder's actual end, creating the 1–2 ft visual gap.
    this.rodTipAnchor = addPrimitive(
      this.rodRoot, 'Rod tip line guide', 'cylinder',
      { x: 0, y: rodLength, z: 0 }, { x: .052, y: .018, z: .052 },
      makeMaterial([.22, .24, .22], { gloss: .72 }), { x: 90 }
    );
    addPrimitive(
      this.rodRoot, 'Rod reel', 'cylinder',
      { x: 0.09, y: 0.1, z: 0 }, { x: 0.18, y: 0.08, z: 0.18 },
      makeMaterial([0.85, 0.62, 0.2], { gloss: 0.65 }), { z: 90 }
    );

    this.bobberRoot = new pc.Entity('Fishing bobber');
    this.bobberRoot.enabled = false;
    this.app.root.addChild(this.bobberRoot);
    addPrimitive(
      this.bobberRoot, 'Bobber white', 'sphere',
      { x: 0, y: -0.035, z: 0 }, { x: 0.2, y: 0.16, z: 0.2 },
      makeMaterial([0.95, 0.91, 0.76], { gloss: 0.5 })
    );
    addPrimitive(
      this.bobberRoot, 'Bobber red', 'sphere',
      { x: 0, y: 0.07, z: 0 }, { x: 0.15, y: 0.16, z: 0.15 },
      makeMaterial([0.88, 0.2, 0.13], { gloss: 0.5 })
    );
    addPrimitive(
      this.bobberRoot, 'Bobber stem', 'cylinder',
      { x: 0, y: 0.2, z: 0 }, { x: 0.035, y: 0.13, z: 0.035 },
      makeMaterial([0.2, 0.16, 0.1])
    );

    this.lineEntity = addPrimitive(
      this.app.root, 'Fishing line', 'box',
      { x: 0, y: 0, z: 0 }, { x: 0.018, y: 0.018, z: 1 },
      makeMaterial([0.09, 0.13, 0.12], { gloss: 0.6 })
    );
    this.lineEntity.enabled = false;

    this.rippleMaterial = makeMaterial([0.78, 0.97, 0.91], {
      opacity: 0.5,
      emissive: [0.08, 0.2, 0.18]
    });
    this.ripple = addPrimitive(
      this.app.root, 'Bobber ripple', 'cylinder',
      { x: 0, y: 0, z: 0 }, { x: 0.25, y: 0.008, z: 0.25 },
      this.rippleMaterial
    );
    this.ripple.enabled = false;

    this.catchFish = new pc.Entity('Caught creature');
    this.catchFish.enabled = false;
    this.player.visualRoot.addChild(this.catchFish);
    this.fishBodyMaterial = makeMaterial([0.45, 0.72, 0.42], { gloss: 0.55 });
    this.fishAccentMaterial = makeMaterial([0.75, 0.62, 0.28], { gloss: 0.5 });
    const fishDarkMaterial = makeMaterial([0.04, 0.06, 0.05], { gloss: 0.8 });

    const makeRig = (key, label) => {
      const root = new pc.Entity(label);
      root.enabled = false;
      this.catchFish.addChild(root);
      this.catchCreatureRigs ??= {};
      this.catchCreatureRigs[key] = root;
      return root;
    };

    // Standard fish. The existing visual archetypes still share this rig and keep their
    // familiar body/head/fin proportion differences.
    const fishRig = makeRig('fish', 'Fish rig');
    this.catchFishBody = addPrimitive(
      fishRig, 'Fish body', 'sphere',
      { x: 0, y: 0, z: 0 }, { x: 0.8, y: 0.34, z: 0.28 },
      this.fishBodyMaterial
    );
    this.catchFishHead = addPrimitive(
      fishRig, 'Fish head', 'sphere',
      { x: 0.34, y: 0, z: 0 }, { x: 0.3, y: 0.3, z: 0.26 },
      this.fishBodyMaterial
    );
    this.catchFishTail = addPrimitive(
      fishRig, 'Fish tail', 'cone',
      { x: -0.48, y: 0, z: 0 }, { x: 0.32, y: 0.4, z: 0.1 },
      this.fishAccentMaterial, { z: 90 }
    );
    this.catchFishDorsal = addPrimitive(
      fishRig, 'Dorsal fin', 'cone',
      { x: -0.08, y: 0.2, z: 0 }, { x: 0.18, y: 0.28, z: 0.07 },
      this.fishAccentMaterial
    );
    this.catchFishSideFin = addPrimitive(
      fishRig, 'Side fin', 'cone',
      { x: 0.16, y: -0.04, z: 0.17 }, { x: 0.13, y: 0.2, z: 0.05 },
      this.fishAccentMaterial, { x: 72, z: -35 }
    );
    this.catchFishStripe = addPrimitive(
      fishRig, 'Species marking', 'box',
      { x: 0.02, y: 0, z: 0.145 }, { x: 0.48, y: 0.06, z: 0.012 },
      this.fishAccentMaterial
    );
    this.catchFishEyes = [
      addPrimitive(fishRig, 'Near fish eye', 'sphere', { x: 0.39, y: 0.07, z: 0.14 }, { x: 0.055, y: 0.055, z: 0.045 }, fishDarkMaterial),
      addPrimitive(fishRig, 'Far fish eye', 'sphere', { x: 0.39, y: 0.07, z: -0.14 }, { x: 0.055, y: 0.055, z: 0.045 }, fishDarkMaterial)
    ];
    this.catchFishWhiskers = [
      addPrimitive(fishRig, 'Left barbel', 'box', { x: 0.51, y: -0.05, z: 0.12 }, { x: 0.28, y: 0.015, z: 0.015 }, fishDarkMaterial, { y: -18, z: 14 }),
      addPrimitive(fishRig, 'Right barbel', 'box', { x: 0.51, y: -0.05, z: -0.12 }, { x: 0.28, y: 0.015, z: 0.015 }, fishDarkMaterial, { y: 18, z: 14 })
    ];

    // Deep-bodied fish share an integrated silhouette with a real jaw, paired fins, and
    // a short dorsal fan instead of stretching the slender standard-fish assembly.
    const deepFishRig = makeRig('deepfish', 'Deep-bodied fish rig');
    this.catchDeepFishBody = addPrimitive(deepFishRig, 'Deep fish body', 'sphere', { x: -.05, y: 0, z: 0 }, { x: .62, y: .45, z: .38 }, this.fishBodyMaterial);
    this.catchDeepFishHead = addPrimitive(deepFishRig, 'Deep fish head', 'sphere', { x: .35, y: -.01, z: 0 }, { x: .34, y: .38, z: .34 }, this.fishBodyMaterial);
    this.catchDeepFishJaw = addPrimitive(deepFishRig, 'Deep fish lower lip', 'sphere', { x: .47, y: -.11, z: 0 }, { x: .23, y: .11, z: .25 }, this.fishAccentMaterial, { z: -4 });
    this.catchDeepFishTail = addPrimitive(deepFishRig, 'Deep fish tail', 'cone', { x: -.55, y: 0, z: 0 }, { x: .28, y: .42, z: .1 }, this.fishAccentMaterial, { z: 90 });
    this.catchDeepFishDorsals = Array.from({ length: 3 }, (_, index) => addPrimitive(
      deepFishRig, `Deep fish dorsal ${index + 1}`, 'cone',
      { x: .05 - index * .17, y: .33, z: 0 }, { x: .12, y: .25, z: .06 },
      this.fishAccentMaterial, { z: 4 + index * 5 }
    ));
    this.catchDeepFishFins = [-1, 1].map((side) => addPrimitive(
      deepFishRig, side > 0 ? 'Near deep fish fin' : 'Far deep fish fin', 'cone',
      { x: .15, y: -.06, z: side * .31 }, { x: .14, y: .25, z: .06 },
      this.fishAccentMaterial, { x: side * 72, z: -28 }
    ));
    this.catchDeepFishEyes = [
      addPrimitive(deepFishRig, 'Near deep fish eye', 'sphere', { x: .42, y: .11, z: .26 }, { x: .05, y: .05, z: .04 }, fishDarkMaterial),
      addPrimitive(deepFishRig, 'Far deep fish eye', 'sphere', { x: .42, y: .11, z: -.26 }, { x: .05, y: .05, z: .04 }, fishDarkMaterial)
    ];

    // Sharks: fusiform body, pointed snout, strong dorsal/pectoral fins and a forked tail.
    const sharkRig = makeRig('shark', 'Shark rig');
    this.catchSharkBody = addPrimitive(sharkRig, 'Shark body', 'sphere', { x: -.05, y: 0, z: 0 }, { x: .8, y: .28, z: .25 }, this.fishBodyMaterial);
    this.catchSharkHead = addPrimitive(sharkRig, 'Shark head', 'sphere', { x: .42, y: -.01, z: 0 }, { x: .38, y: .24, z: .23 }, this.fishBodyMaterial);
    this.catchSharkSnout = addPrimitive(sharkRig, 'Shark snout', 'cone', { x: .67, y: -.01, z: 0 }, { x: .18, y: .25, z: .23 }, this.fishBodyMaterial, { z: -90 });
    this.catchSharkDorsal = addPrimitive(sharkRig, 'Shark dorsal', 'cone', { x: -.12, y: .26, z: 0 }, { x: .22, y: .34, z: .08 }, this.fishAccentMaterial);
    this.catchSharkPectorals = [
      addPrimitive(sharkRig, 'Near shark pectoral', 'cone', { x: .12, y: -.06, z: .23 }, { x: .18, y: .34, z: .07 }, this.fishAccentMaterial, { x: 72, z: -35 }),
      addPrimitive(sharkRig, 'Far shark pectoral', 'cone', { x: .12, y: -.06, z: -.23 }, { x: .18, y: .34, z: .07 }, this.fishAccentMaterial, { x: -72, z: -35 })
    ];
    addOrganicJoint(sharkRig, 'Shark tail stock', { x: -.63, y: 0, z: 0 }, { x: .36, y: .18, z: .18 }, this.fishBodyMaterial);
    this.catchSharkTail = [
      addPrimitive(sharkRig, 'Shark upper tail', 'cone', { x: -.76, y: .10, z: 0 }, { x: .24, y: .34, z: .10 }, this.fishAccentMaterial, { z: 115 }),
      addPrimitive(sharkRig, 'Shark lower tail', 'cone', { x: -.76, y: -.10, z: 0 }, { x: .21, y: .29, z: .09 }, this.fishAccentMaterial, { z: 65 })
    ];
    this.catchSharkEyes = [
      addPrimitive(sharkRig, 'Near shark eye', 'sphere', { x: .48, y: .07, z: .19 }, { x: .045, y: .045, z: .038 }, fishDarkMaterial),
      addPrimitive(sharkRig, 'Far shark eye', 'sphere', { x: .48, y: .07, z: -.19 }, { x: .045, y: .045, z: .038 }, fishDarkMaterial)
    ];

    // Rays/skates: a broad flattened disc with a long thin tail.
    const rayRig = makeRig('ray', 'Ray rig');
    this.catchRayDisc = addPrimitive(rayRig, 'Ray disc', 'sphere', { x: 0, y: 0, z: 0 }, { x: .64, y: .13, z: .86 }, this.fishBodyMaterial);
    this.catchRaySnout = addPrimitive(rayRig, 'Ray rounded nose', 'sphere', { x: .28, y: -.005, z: 0 }, { x: .32, y: .11, z: .34 }, this.fishBodyMaterial);
    addOrganicJoint(rayRig, 'Ray tail root', { x: -.31, y: 0, z: 0 }, { x: .22, y: .09, z: .11 }, this.fishBodyMaterial);
    this.catchRayTail = addPrimitive(rayRig, 'Ray tail', 'box', { x: -.61, y: 0, z: 0 }, { x: .72, y: .025, z: .025 }, this.fishAccentMaterial);
    this.catchRayEyes = [
      addPrimitive(rayRig, 'Near ray eye', 'sphere', { x: .2, y: .11, z: .18 }, { x: .04, y: .035, z: .035 }, fishDarkMaterial),
      addPrimitive(rayRig, 'Far ray eye', 'sphere', { x: .2, y: .11, z: -.18 }, { x: .04, y: .035, z: .035 }, fishDarkMaterial)
    ];

    // Eels/lampreys: segmented snake-like silhouette without a fish tail or pectoral fins.
    const eelRig = makeRig('eel', 'Eel rig');
    this.catchEelSegments = [];
    for (let index = 0; index < 7; index += 1) {
      this.catchEelSegments.push(addPrimitive(eelRig, `Eel segment ${index + 1}`, 'sphere',
        { x: .38 - index * .15, y: Math.sin(index * .7) * .035, z: 0 },
        { x: .23 - index * .012, y: .13 - index * .006, z: .12 - index * .006 }, this.fishBodyMaterial));
    }
    this.catchEelHead = addPrimitive(eelRig, 'Eel head', 'sphere', { x: .55, y: 0, z: 0 }, { x: .24, y: .15, z: .14 }, this.fishBodyMaterial);
    this.catchEelEyes = [
      addPrimitive(eelRig, 'Near eel eye', 'sphere', { x: .62, y: .05, z: .11 }, { x: .032, y: .032, z: .028 }, fishDarkMaterial),
      addPrimitive(eelRig, 'Far eel eye', 'sphere', { x: .62, y: .05, z: -.11 }, { x: .032, y: .032, z: .028 }, fishDarkMaterial)
    ];

    // True crabs: broad shell, two claws, eye stalks and eight walking legs.
    // Every appendage has a visibly overlapping root. PlayCanvas primitive scales are diameters,
    // not radii, so positions are authored from actual half-extents rather than optimistic guesses.
    const crabRig = makeRig('crab', 'Crab rig');
    this.catchCrabShell = addPrimitive(crabRig, 'Crab shell', 'sphere', { x: 0, y: 0, z: 0 }, { x: .62, y: .28, z: .78 }, this.fishBodyMaterial);
    this.catchCrabClaws = [];
    for (const side of [-1, 1]) {
      addOrganicJoint(crabRig, side > 0 ? 'Near crab shoulder' : 'Far crab shoulder',
        { x: .17, y: -.015, z: side * .34 }, { x: .26, y: .16, z: .24 }, this.fishAccentMaterial);
      const arm = addPrimitive(crabRig, side > 0 ? 'Near crab arm' : 'Far crab arm', 'sphere',
        { x: .29, y: -.02, z: side * .43 }, { x: .34, y: .12, z: .22 }, this.fishAccentMaterial, { y: side * 18 });
      const claw = addPrimitive(crabRig, side > 0 ? 'Near crab claw' : 'Far crab claw', 'sphere',
        { x: .49, y: .015, z: side * .50 }, { x: .31, y: .22, z: .27 }, this.fishAccentMaterial);
      this.catchCrabClaws.push(claw, arm);
      addOrganicJoint(crabRig, side > 0 ? 'Near claw wrist' : 'Far claw wrist',
        { x: .39, y: 0, z: side * .47 }, { x: .18, y: .14, z: .17 }, this.fishAccentMaterial);
    }
    this.catchCrabLegs = [];
    for (const side of [-1, 1]) for (let index = 0; index < 4; index += 1) {
      const rootX = .12 - index * .12;
      const rootZ = side * (.31 + index * .018);
      addOrganicJoint(crabRig, `Crab leg root ${side > 0 ? 'near' : 'far'} ${index + 1}`,
        { x: rootX, y: -.075, z: rootZ }, { x: .18, y: .13, z: .18 }, this.fishAccentMaterial);
      this.catchCrabLegs.push(addPrimitive(crabRig, `Crab leg ${side > 0 ? 'near' : 'far'} ${index + 1}`, 'box',
        { x: rootX - .02, y: -.12, z: side * (.43 + index * .07) },
        { x: .38, y: .04, z: .04 }, this.fishAccentMaterial, { y: side * (30 + index * 8), z: side * (9 + index * 2) }));
    }
    this.catchCrabEyeStalks = [
      addPrimitive(crabRig, 'Near crab eyestalk', 'cylinder', { x: .22, y: .155, z: .17 }, { x: .045, y: .16, z: .045 }, this.fishBodyMaterial, { z: -12 }),
      addPrimitive(crabRig, 'Far crab eyestalk', 'cylinder', { x: .22, y: .155, z: -.17 }, { x: .045, y: .16, z: .045 }, this.fishBodyMaterial, { z: -12 })
    ];
    this.catchCrabEyes = [
      addPrimitive(crabRig, 'Near crab eye', 'sphere', { x: .235, y: .235, z: .17 }, { x: .07, y: .07, z: .06 }, fishDarkMaterial),
      addPrimitive(crabRig, 'Far crab eye', 'sphere', { x: .235, y: .235, z: -.17 }, { x: .07, y: .07, z: .06 }, fishDarkMaterial)
    ];

    // Horseshoe crabs get their own silhouette instead of looking like ordinary crabs.
    const horseshoeRig = makeRig('horseshoe', 'Horseshoe crab rig');
    this.catchHorseshoeShell = addPrimitive(horseshoeRig, 'Horseshoe shell', 'sphere', { x: .08, y: 0, z: 0 }, { x: .58, y: .2, z: .66 }, this.fishBodyMaterial);
    this.catchHorseshoeRear = addPrimitive(horseshoeRig, 'Horseshoe rear plate', 'sphere', { x: -.36, y: -.015, z: 0 }, { x: .3, y: .16, z: .48 }, this.fishAccentMaterial);
    this.catchHorseshoeTail = addPrimitive(horseshoeRig, 'Horseshoe tail spine', 'box', { x: -.78, y: 0, z: 0 }, { x: .82, y: .025, z: .025 }, this.fishAccentMaterial);

    // Lobsters/crayfish: segmented abdomen, large front claws and a fan tail.
    const lobsterRig = makeRig('lobster', 'Lobster rig');
    this.catchLobsterSegments = [];
    for (let index = 0; index < 5; index += 1) {
      this.catchLobsterSegments.push(addPrimitive(lobsterRig, `Lobster segment ${index + 1}`, 'sphere',
        { x: .22 - index * .18, y: 0, z: 0 }, { x: .26, y: .19 - index * .012, z: .22 - index * .012 },
        index < 2 ? this.fishBodyMaterial : this.fishAccentMaterial));
    }
    this.catchLobsterClaws = [];
    for (const side of [-1, 1]) {
      this.catchLobsterClaws.push(addPrimitive(lobsterRig, side > 0 ? 'Near lobster claw' : 'Far lobster claw', 'sphere', { x: .58, y: 0, z: side * .28 }, { x: .25, y: .18, z: .17 }, this.fishAccentMaterial));
      this.catchLobsterClaws.push(addPrimitive(lobsterRig, side > 0 ? 'Near lobster foreleg' : 'Far lobster foreleg', 'box', { x: .4, y: -.03, z: side * .2 }, { x: .28, y: .045, z: .045 }, this.fishAccentMaterial, { y: side * 18 }));
    }
    this.catchLobsterTail = [
      addPrimitive(lobsterRig, 'Lobster tail fan center', 'cone', { x: -.64, y: 0, z: 0 }, { x: .18, y: .2, z: .08 }, this.fishAccentMaterial, { z: 90 }),
      addPrimitive(lobsterRig, 'Lobster tail fan near', 'cone', { x: -.62, y: 0, z: .13 }, { x: .16, y: .18, z: .07 }, this.fishAccentMaterial, { x: 25, z: 90 }),
      addPrimitive(lobsterRig, 'Lobster tail fan far', 'cone', { x: -.62, y: 0, z: -.13 }, { x: .16, y: .18, z: .07 }, this.fishAccentMaterial, { x: -25, z: 90 })
    ];
    this.catchLobsterAntennae = [
      addPrimitive(lobsterRig, 'Near lobster antenna', 'box', { x: .62, y: .1, z: .1 }, { x: .5, y: .012, z: .012 }, fishDarkMaterial, { y: -10, z: 10 }),
      addPrimitive(lobsterRig, 'Far lobster antenna', 'box', { x: .62, y: .1, z: -.1 }, { x: .5, y: .012, z: .012 }, fishDarkMaterial, { y: 10, z: 10 })
    ];
    addOrganicJoint(lobsterRig, 'Near lobster eye base', { x: .34, y: .09, z: .12 }, { x: .07, y: .09, z: .07 }, this.fishBodyMaterial);
    addOrganicJoint(lobsterRig, 'Far lobster eye base', { x: .34, y: .09, z: -.12 }, { x: .07, y: .09, z: .07 }, this.fishBodyMaterial);
    this.catchLobsterEyes = [
      addPrimitive(lobsterRig, 'Near lobster eye', 'sphere', { x: .39, y: .13, z: .15 }, { x: .045, y: .05, z: .04 }, fishDarkMaterial),
      addPrimitive(lobsterRig, 'Far lobster eye', 'sphere', { x: .39, y: .13, z: -.15 }, { x: .045, y: .05, z: .04 }, fishDarkMaterial)
    ];

    // Shrimp: curved segmented body with antennae and a small tail fan.
    const shrimpRig = makeRig('shrimp', 'Shrimp rig');
    this.catchShrimpSegments = [];
    for (let index = 0; index < 6; index += 1) {
      this.catchShrimpSegments.push(addPrimitive(shrimpRig, `Shrimp segment ${index + 1}`, 'sphere',
        { x: .34 - index * .15, y: Math.sin(index / 5 * Math.PI) * .08, z: 0 },
        { x: .2 - index * .01, y: .13 - index * .006, z: .14 - index * .006 }, this.fishBodyMaterial));
    }
    this.catchShrimpTail = [
      addPrimitive(shrimpRig, 'Shrimp tail near', 'cone', { x: -.52, y: .02, z: .09 }, { x: .15, y: .16, z: .06 }, this.fishAccentMaterial, { x: 24, z: 90 }),
      addPrimitive(shrimpRig, 'Shrimp tail far', 'cone', { x: -.52, y: .02, z: -.09 }, { x: .15, y: .16, z: .06 }, this.fishAccentMaterial, { x: -24, z: 90 })
    ];
    this.catchShrimpAntennae = [
      addPrimitive(shrimpRig, 'Near shrimp antenna', 'box', { x: .64, y: .13, z: .06 }, { x: .62, y: .009, z: .009 }, fishDarkMaterial, { y: -8, z: 8 }),
      addPrimitive(shrimpRig, 'Far shrimp antenna', 'box', { x: .64, y: .13, z: -.06 }, { x: .62, y: .009, z: .009 }, fishDarkMaterial, { y: 8, z: 8 })
    ];

    // The old octopus silhouette actually read as a fish-bodied tentacled monster. Keep it
    // deliberately as the Lusca model instead of deleting a usable creature.
    const luscaRig = makeRig('lusca', 'Lusca rig');
    this.catchLuscaMantle = addPrimitive(luscaRig, 'Lusca mantle', 'sphere', { x: .02, y: .09, z: 0 }, { x: .42, y: .46, z: .4 }, this.fishBodyMaterial);
    this.catchLuscaHead = addPrimitive(luscaRig, 'Lusca head', 'sphere', { x: .25, y: -.05, z: 0 }, { x: .36, y: .31, z: .36 }, this.fishBodyMaterial);
    addOrganicJoint(luscaRig, 'Lusca arm skirt', { x: .03, y: -.16, z: 0 }, { x: .46, y: .16, z: .4 }, this.fishAccentMaterial);
    this.catchLuscaArms = [];
    for (let index = 0; index < 8; index += 1) {
      const side = index % 2 ? 1 : -1;
      const band = Math.floor(index / 2);
      this.catchLuscaArms.push(addPrimitive(luscaRig, `Lusca arm ${index + 1} upper`, 'sphere',
        { x: .08 - band * .02, y: -.18 - band * .015, z: side * (.05 + band * .035) },
        { x: .4 + band * .035, y: .085, z: .08 }, this.fishAccentMaterial, { y: side * (8 + band * 7), z: 14 + band * 4 }));
      this.catchLuscaArms.push(addPrimitive(luscaRig, `Lusca arm ${index + 1} lower`, 'sphere',
        { x: -.22 - band * .04, y: -.23 - band * .025, z: side * (.065 + band * .045) },
        { x: .44 + band * .055, y: .075, z: .07 }, this.fishAccentMaterial, { y: side * (16 + band * 8), z: 20 + band * 5 }));
    }
    this.catchLuscaEyes = [
      addPrimitive(luscaRig, 'Near lusca eye', 'sphere', { x: .34, y: .02, z: .18 }, { x: .055, y: .06, z: .045 }, fishDarkMaterial),
      addPrimitive(luscaRig, 'Far lusca eye', 'sphere', { x: .34, y: .02, z: -.18 }, { x: .055, y: .06, z: .045 }, fishDarkMaterial)
    ];

    // Actual octopus: one upright rounded mantle, a compact head beneath/front of it, and eight
    // arms that all originate from one overlapping arm crown. The mantle/head overlap heavily,
    // avoiding the former two-lobed fish silhouette.
    const octopusRig = makeRig('octopus', 'Octopus rig');
    this.catchOctopusMantle = addPrimitive(octopusRig, 'Octopus mantle', 'sphere',
      { x: -.11, y: .14, z: 0 }, { x: .5, y: .62, z: .52 }, this.fishBodyMaterial);
    this.catchOctopusHead = addPrimitive(octopusRig, 'Octopus head', 'sphere',
      { x: .12, y: -.045, z: 0 }, { x: .44, y: .38, z: .46 }, this.fishBodyMaterial);
    this.catchOctopusArmCrown = addOrganicJoint(octopusRig, 'Octopus arm crown',
      { x: .17, y: -.19, z: 0 }, { x: .44, y: .22, z: .44 }, this.fishAccentMaterial);
    this.catchOctopusArms = [];
    const octopusArmLayout = [
      { z: -.16, y: -.27, yaw: -26, pitch: 24, length: .42 },
      { z: -.10, y: -.30, yaw: -16, pitch: 30, length: .46 },
      { z: -.045, y: -.32, yaw: -8, pitch: 36, length: .49 },
      { z: -.015, y: -.34, yaw: -3, pitch: 42, length: .52 },
      { z: .015, y: -.34, yaw: 3, pitch: 42, length: .52 },
      { z: .045, y: -.32, yaw: 8, pitch: 36, length: .49 },
      { z: .10, y: -.30, yaw: 16, pitch: 30, length: .46 },
      { z: .16, y: -.27, yaw: 26, pitch: 24, length: .42 }
    ];
    octopusArmLayout.forEach((arm, index) => {
      const side = arm.z < 0 ? -1 : 1;
      const upper = addPrimitive(octopusRig, `Octopus arm ${index + 1} upper`, 'sphere',
        { x: .28, y: arm.y, z: arm.z },
        { x: arm.length, y: .105, z: .095 }, this.fishAccentMaterial,
        { y: arm.yaw, z: arm.pitch });
      const lower = addPrimitive(octopusRig, `Octopus arm ${index + 1} lower`, 'sphere',
        { x: .45, y: arm.y - .12, z: arm.z + side * .045 },
        { x: arm.length * .78, y: .082, z: .075 }, this.fishAccentMaterial,
        { y: arm.yaw + side * 6, z: arm.pitch + 18 });
      this.catchOctopusArms.push(upper, lower);
      addOrganicJoint(octopusRig, `Octopus arm ${index + 1} root`,
        { x: .22, y: -.21, z: arm.z * .72 }, { x: .19, y: .13, z: .14 }, this.fishAccentMaterial);
      addOrganicJoint(octopusRig, `Octopus arm ${index + 1} elbow`,
        { x: .38, y: arm.y - .055, z: arm.z + side * .02 }, { x: .17, y: .105, z: .105 }, this.fishAccentMaterial);
    });
    this.catchOctopusEyes = [
      addPrimitive(octopusRig, 'Near octopus eye', 'sphere', { x: .22, y: .015, z: .18 }, { x: .065, y: .07, z: .055 }, fishDarkMaterial),
      addPrimitive(octopusRig, 'Far octopus eye', 'sphere', { x: .22, y: .015, z: -.18 }, { x: .065, y: .07, z: .055 }, fishDarkMaterial)
    ];

    // Squid/cuttlefish: connected mantle/head and ten readable two-segment arms.
    const squidRig = makeRig('squid', 'Squid rig');
    this.catchSquidMantle = addPrimitive(squidRig, 'Squid mantle', 'sphere', { x: -.14, y: .02, z: 0 }, { x: .64, y: .25, z: .25 }, this.fishBodyMaterial);
    this.catchSquidTip = addPrimitive(squidRig, 'Squid mantle tip', 'cone', { x: -.49, y: .02, z: 0 }, { x: .18, y: .23, z: .21 }, this.fishBodyMaterial, { z: 90 });
    this.catchSquidHead = addPrimitive(squidRig, 'Squid head', 'sphere', { x: .25, y: 0, z: 0 }, { x: .3, y: .24, z: .25 }, this.fishBodyMaterial);
    addOrganicJoint(squidRig, 'Squid arm collar', { x: .38, y: -.02, z: 0 }, { x: .26, y: .17, z: .23 }, this.fishAccentMaterial);
    this.catchSquidFins = [
      addPrimitive(squidRig, 'Near squid fin', 'cone', { x: -.28, y: .03, z: .18 }, { x: .19, y: .24, z: .06 }, this.fishAccentMaterial, { x: 78, z: 10 }),
      addPrimitive(squidRig, 'Far squid fin', 'cone', { x: -.28, y: .03, z: -.18 }, { x: .19, y: .24, z: .06 }, this.fishAccentMaterial, { x: -78, z: 10 })
    ];
    this.catchSquidTentacles = [];
    for (let index = 0; index < 10; index += 1) {
      const side = index % 2 ? 1 : -1;
      const band = Math.floor(index / 2);
      const longArm = band === 4;
      const lateral = side * (.04 + band * .02);
      this.catchSquidTentacles.push(addPrimitive(squidRig, `Squid arm ${index + 1} upper`, 'sphere',
        { x: .43, y: -.055 + band * .018, z: lateral },
        { x: longArm ? .42 : .31, y: .04, z: .04 }, this.fishAccentMaterial, { y: side * (4 + band * 4) }));
      this.catchSquidTentacles.push(addPrimitive(squidRig, `Squid arm ${index + 1} lower`, 'sphere',
        { x: longArm ? .79 : .68, y: -.09 + band * .015, z: side * (.055 + band * .022) },
        { x: longArm ? .52 : .34, y: .036, z: .036 }, this.fishAccentMaterial, { y: side * (8 + band * 5) }));
    }
    this.catchSquidEyes = [
      addPrimitive(squidRig, 'Near squid eye', 'sphere', { x: .32, y: .07, z: .17 }, { x: .05, y: .05, z: .04 }, fishDarkMaterial),
      addPrimitive(squidRig, 'Far squid eye', 'sphere', { x: .32, y: .07, z: -.17 }, { x: .05, y: .05, z: .04 }, fishDarkMaterial)
    ];

    // Snails: visible shell plus soft foot/head and eyestalks.
    const snailRig = makeRig('snail', 'Snail rig');
    this.catchSnailFoot = addPrimitive(snailRig, 'Snail foot', 'sphere', { x: .08, y: -.14, z: 0 }, { x: .62, y: .12, z: .25 }, this.fishAccentMaterial);
    this.catchSnailShell = addPrimitive(snailRig, 'Snail shell', 'sphere', { x: -.12, y: .08, z: 0 }, { x: .38, y: .38, z: .3 }, this.fishBodyMaterial);
    this.catchSnailHead = addPrimitive(snailRig, 'Snail head', 'sphere', { x: .31, y: -.08, z: 0 }, { x: .24, y: .18, z: .2 }, this.fishAccentMaterial);
    addOrganicJoint(snailRig, 'Snail neck-foot joint', { x: .2, y: -.1, z: 0 }, { x: .24, y: .14, z: .2 }, this.fishAccentMaterial);
    addOrganicJoint(snailRig, 'Snail shell-foot joint', { x: -.08, y: -.07, z: 0 }, { x: .3, y: .18, z: .24 }, this.fishAccentMaterial);
    this.catchSnailStalks = [
      addPrimitive(snailRig, 'Near snail eyestalk', 'box', { x: .45, y: .07, z: .09 }, { x: .24, y: .012, z: .012 }, fishDarkMaterial, { y: -18, z: 28 }),
      addPrimitive(snailRig, 'Far snail eyestalk', 'box', { x: .45, y: .07, z: -.09 }, { x: .24, y: .012, z: .012 }, fishDarkMaterial, { y: 18, z: 28 })
    ];

    // Mussels/scallops/clams: two overlapping shell valves joined by a thick rear hinge.
    // The old rear box sat beyond the shell's actual half-extent and visibly floated.
    const bivalveRig = makeRig('bivalve', 'Shellfish rig');
    this.catchBivalveShell = addPrimitive(bivalveRig, 'Bivalve upper valve', 'sphere',
      { x: .02, y: .035, z: 0 }, { x: .58, y: .22, z: .72 }, this.fishBodyMaterial, { z: -5 });
    this.catchBivalveLip = addPrimitive(bivalveRig, 'Bivalve lower valve', 'sphere',
      { x: .035, y: -.045, z: 0 }, { x: .55, y: .18, z: .69 }, this.fishAccentMaterial, { z: 4 });
    this.catchBivalveHinge = addPrimitive(bivalveRig, 'Bivalve hinge', 'cylinder',
      { x: -.245, y: .005, z: 0 }, { x: .075, y: .5, z: .075 }, this.fishAccentMaterial, { x: 90 });
    addOrganicJoint(bivalveRig, 'Bivalve hinge blend', { x: -.19, y: 0, z: 0 },
      { x: .2, y: .14, z: .48 }, this.fishAccentMaterial);

    // Salamanders/newts/mudpuppies/olm-like creatures.
    const salamanderRig = makeRig('salamander', 'Salamander rig');
    this.catchSalamanderBody = addPrimitive(salamanderRig, 'Salamander body', 'sphere', { x: -.05, y: 0, z: 0 }, { x: .55, y: .18, z: .22 }, this.fishBodyMaterial);
    this.catchSalamanderHead = addPrimitive(salamanderRig, 'Salamander head', 'sphere', { x: .27, y: .02, z: 0 }, { x: .28, y: .21, z: .25 }, this.fishBodyMaterial);
    this.catchSalamanderTail = addPrimitive(salamanderRig, 'Salamander tail', 'cone', { x: -.34, y: .01, z: 0 }, { x: .22, y: .4, z: .14 }, this.fishAccentMaterial, { z: 90 });
    addOrganicJoint(salamanderRig, 'Salamander tail root', { x: -.29, y: .005, z: 0 }, { x: .22, y: .16, z: .18 }, this.fishBodyMaterial);
    addOrganicJoint(salamanderRig, 'Salamander neck', { x: .2, y: .01, z: 0 }, { x: .22, y: .18, z: .21 }, this.fishBodyMaterial);
    this.catchSalamanderLegs = [];
    for (const side of [-1, 1]) for (const x of [-.2, .25]) {
      this.catchSalamanderLegs.push(addPrimitive(salamanderRig, 'Salamander leg', 'box', { x, y: -.08, z: side * .18 }, { x: .22, y: .025, z: .025 }, this.fishAccentMaterial, { y: side * 48, z: side * 8 }));
    }
    for (const side of [-1, 1]) for (const x of [-.18, .2]) {
      addOrganicJoint(salamanderRig, 'Salamander limb root', { x, y: -.055, z: side * .13 }, { x: .13, y: .09, z: .12 }, this.fishAccentMaterial);
    }
    this.catchSalamanderEyes = [
      addPrimitive(salamanderRig, 'Near salamander eye', 'sphere', { x: .34, y: .09, z: .15 }, { x: .035, y: .035, z: .03 }, fishDarkMaterial),
      addPrimitive(salamanderRig, 'Far salamander eye', 'sphere', { x: .34, y: .09, z: -.15 }, { x: .035, y: .035, z: .03 }, fishDarkMaterial)
    ];

    // Jellyfish: bell plus short vertical tentacle chains attached directly under the rim.
    const jellyRig = makeRig('jellyfish', 'Jellyfish rig');
    this.catchJellyBell = addPrimitive(jellyRig, 'Jelly bell', 'sphere', { x: 0, y: .15, z: 0 }, { x: .44, y: .36, z: .44 }, this.fishBodyMaterial);
    this.catchJellyRim = addPrimitive(jellyRig, 'Jelly rim', 'cylinder', { x: 0, y: -.06, z: 0 }, { x: .39, y: .035, z: .39 }, this.fishAccentMaterial);
    this.catchJellyTentacles = [];
    for (let index = 0; index < 6; index += 1) {
      const z = (index - 2.5) * .075;
      const x = (index % 2 ? 1 : -1) * .06;
      this.catchJellyTentacles.push(addPrimitive(jellyRig, `Jelly tentacle ${index + 1} upper`, 'cylinder',
        { x, y: -.27, z }, { x: .018, y: .38, z: .018 }, this.fishAccentMaterial, { z: (index - 2.5) * 2 }));
      this.catchJellyTentacles.push(addPrimitive(jellyRig, `Jelly tentacle ${index + 1} lower`, 'cylinder',
        { x: x * .65, y: -.58, z: z * 1.08 }, { x: .014, y: .3 + (index % 3) * .05, z: .014 }, this.fishAccentMaterial, { z: -(index - 2.5) * 2 }));
    }

    // Aquatic insects: three overlapping body segments, six rooted legs and broad wing covers.
    const insectRig = makeRig('insect', 'Aquatic insect rig');
    this.catchInsectAbdomen = addPrimitive(insectRig, 'Insect abdomen', 'sphere', { x: -.19, y: 0, z: 0 }, { x: .42, y: .2, z: .22 }, this.fishBodyMaterial);
    this.catchInsectThorax = addPrimitive(insectRig, 'Insect thorax', 'sphere', { x: .09, y: .01, z: 0 }, { x: .34, y: .23, z: .25 }, this.fishAccentMaterial);
    this.catchInsectHead = addPrimitive(insectRig, 'Insect head', 'sphere', { x: .31, y: .015, z: 0 }, { x: .24, y: .2, z: .21 }, this.fishBodyMaterial);
    addOrganicJoint(insectRig, 'Insect abdomen-thorax joint', { x: -.03, y: .005, z: 0 }, { x: .2, y: .17, z: .19 }, this.fishAccentMaterial);
    addOrganicJoint(insectRig, 'Insect thorax-head joint', { x: .21, y: .01, z: 0 }, { x: .16, y: .15, z: .16 }, this.fishBodyMaterial);
    this.catchInsectWings = [
      addPrimitive(insectRig, 'Near insect wing', 'sphere', { x: -.06, y: .11, z: .12 }, { x: .38, y: .055, z: .18 }, this.fishAccentMaterial, { y: -10 }),
      addPrimitive(insectRig, 'Far insect wing', 'sphere', { x: -.06, y: .11, z: -.12 }, { x: .38, y: .055, z: .18 }, this.fishAccentMaterial, { y: 10 })
    ];
    this.catchInsectLegs = [];
    for (const side of [-1, 1]) for (let index = 0; index < 3; index += 1) {
      const rootX = .12 - index * .14;
      addOrganicJoint(insectRig, `Insect leg root ${side > 0 ? 'near' : 'far'} ${index + 1}`,
        { x: rootX, y: -.075, z: side * .095 }, { x: .13, y: .1, z: .12 }, this.fishAccentMaterial);
      this.catchInsectLegs.push(addPrimitive(insectRig, `Insect leg ${side > 0 ? 'near' : 'far'} ${index + 1}`, 'box',
        { x: rootX - .015, y: -.105, z: side * (.18 + index * .02) }, { x: .3, y: .025, z: .025 },
        fishDarkMaterial, { y: side * (30 + index * 10), z: side * 8 }));
    }

    // Sea cucumbers and similarly soft-bodied oddities. Surface nodules are deliberately
    // embedded into the main body instead of hovering above it.
    const softRig = makeRig('softbody', 'Soft body rig');
    this.catchSoftBody = addPrimitive(softRig, 'Soft creature body', 'sphere', { x: 0, y: 0, z: 0 }, { x: .68, y: .26, z: .29 }, this.fishBodyMaterial);
    this.catchSoftNodules = [];
    for (let index = 0; index < 7; index += 1) {
      const t = index / 6;
      this.catchSoftNodules.push(addPrimitive(softRig, `Soft body nodule ${index + 1}`, 'sphere',
        { x: -.27 + t * .54, y: .105 - Math.abs(index - 3) * .008, z: (index % 2 ? 1 : -1) * .095 },
        { x: .085, y: .085, z: .08 }, this.fishAccentMaterial));
    }

    // Rimefin Wisp and future supernatural wisps. It still reads ethereal, but the glowing
    // trail is now one touching chain rather than four unrelated floating balls.
    const wispRig = makeRig('wisp', 'Wisp rig');
    this.catchWispCore = addPrimitive(wispRig, 'Wisp core', 'sphere', { x: .04, y: .02, z: 0 }, { x: .32, y: .32, z: .32 }, this.fishBodyMaterial);
    this.catchWispTrail = [
      addPrimitive(wispRig, 'Wisp trail 1', 'sphere', { x: -.105, y: .045, z: .025 }, { x: .2, y: .19, z: .19 }, this.fishAccentMaterial),
      addPrimitive(wispRig, 'Wisp trail 2', 'sphere', { x: -.245, y: .01, z: -.015 }, { x: .16, y: .15, z: .15 }, this.fishAccentMaterial),
      addPrimitive(wispRig, 'Wisp trail 3', 'sphere', { x: -.355, y: .035, z: .01 }, { x: .12, y: .11, z: .11 }, this.fishAccentMaterial)
    ];

    // The old project sent nearly every furry semi-aquatic animal through one mammal model.
    // Keep a generic small-mammal rig for mole/shrew/opossum/fishing-cat/bunyip-like cases, but
    // split the common silhouettes below so an otter, beaver, capybara and platypus are not clones.
    const mammalRig = makeRig('mammal', 'Generic semi-aquatic mammal rig');
    this.catchMammalBody = addPrimitive(mammalRig, 'Mammal body', 'sphere', { x: -.08, y: 0, z: 0 }, { x: .65, y: .34, z: .32 }, this.fishBodyMaterial);
    this.catchMammalHead = addPrimitive(mammalRig, 'Mammal head', 'sphere', { x: .31, y: .07, z: 0 }, { x: .34, y: .3, z: .29 }, this.fishBodyMaterial);
    addOrganicJoint(mammalRig, 'Mammal neck', { x: .17, y: .035, z: 0 }, { x: .28, y: .25, z: .25 }, this.fishBodyMaterial);
    this.catchMammalMuzzle = addPrimitive(mammalRig, 'Mammal muzzle', 'sphere', { x: .49, y: .025, z: 0 }, { x: .22, y: .16, z: .16 }, this.fishAccentMaterial);
    addOrganicJoint(mammalRig, 'Mammal tail root', { x: -.39, y: -.02, z: 0 }, { x: .3, y: .18, z: .18 }, this.fishBodyMaterial);
    this.catchMammalTail = addPrimitive(mammalRig, 'Mammal tail', 'cone', { x: -.57, y: -.035, z: 0 }, { x: .18, y: .46, z: .12 }, this.fishAccentMaterial, { z: 90 });
    this.catchMammalEars = [
      addPrimitive(mammalRig, 'Near mammal ear', 'sphere', { x: .27, y: .22, z: .12 }, { x: .11, y: .12, z: .07 }, this.fishAccentMaterial),
      addPrimitive(mammalRig, 'Far mammal ear', 'sphere', { x: .27, y: .22, z: -.12 }, { x: .11, y: .12, z: .07 }, this.fishAccentMaterial)
    ];
    this.catchMammalLegs = [];
    for (const x of [-.23, .18]) for (const side of [-1, 1]) {
      addOrganicJoint(mammalRig, 'Mammal leg root', { x, y: -.13, z: side * .12 }, { x: .18, y: .15, z: .16 }, this.fishAccentMaterial);
      this.catchMammalLegs.push(addPrimitive(mammalRig, 'Mammal leg', 'sphere',
        { x, y: -.21, z: side * .16 }, { x: .2, y: .16, z: .13 }, this.fishAccentMaterial, { y: side * 12 }));
    }
    this.catchMammalEyes = [
      addPrimitive(mammalRig, 'Near mammal eye', 'sphere', { x: .39, y: .12, z: .13 }, { x: .06, y: .06, z: .05 }, fishDarkMaterial),
      addPrimitive(mammalRig, 'Far mammal eye', 'sphere', { x: .39, y: .12, z: -.13 }, { x: .06, y: .06, z: .05 }, fishDarkMaterial)
    ];

    // Muskrat, nutria, water vole, rakali and capybara: compact rounded rodent silhouette.
    const rodentRig = makeRig('rodent', 'Semi-aquatic rodent rig');
    this.catchRodentBody = addPrimitive(rodentRig, 'Rodent body', 'sphere', { x: -.08, y: 0, z: 0 }, { x: .7, y: .4, z: .38 }, this.fishBodyMaterial);
    this.catchRodentHead = addPrimitive(rodentRig, 'Rodent head', 'sphere', { x: .31, y: .07, z: 0 }, { x: .34, y: .31, z: .3 }, this.fishBodyMaterial);
    addOrganicJoint(rodentRig, 'Rodent neck', { x: .17, y: .04, z: 0 }, { x: .3, y: .27, z: .27 }, this.fishBodyMaterial);
    this.catchRodentMuzzle = addPrimitive(rodentRig, 'Rodent muzzle', 'sphere', { x: .49, y: .01, z: 0 }, { x: .22, y: .15, z: .16 }, this.fishAccentMaterial);
    this.catchRodentEars = [
      addPrimitive(rodentRig, 'Near rodent ear', 'sphere', { x: .25, y: .24, z: .12 }, { x: .12, y: .13, z: .07 }, this.fishAccentMaterial),
      addPrimitive(rodentRig, 'Far rodent ear', 'sphere', { x: .25, y: .24, z: -.12 }, { x: .12, y: .13, z: .07 }, this.fishAccentMaterial)
    ];
    addOrganicJoint(rodentRig, 'Rodent tail root', { x: -.4, y: -.02, z: 0 }, { x: .28, y: .18, z: .18 }, this.fishBodyMaterial);
    this.catchRodentTail = addPrimitive(rodentRig, 'Rodent tail', 'cone', { x: -.62, y: -.03, z: 0 }, { x: .13, y: .54, z: .1 }, this.fishAccentMaterial, { z: 90 });
    this.catchRodentLegs = [];
    for (const x of [-.24, .17]) for (const side of [-1, 1]) {
      addOrganicJoint(rodentRig, 'Rodent leg root', { x, y: -.15, z: side * .13 }, { x: .17, y: .15, z: .16 }, this.fishAccentMaterial);
      this.catchRodentLegs.push(addPrimitive(rodentRig, 'Rodent foot', 'sphere', { x: x + .02, y: -.23, z: side * .18 }, { x: .22, y: .13, z: .16 }, this.fishAccentMaterial));
    }
    this.catchRodentEyes = [
      addPrimitive(rodentRig, 'Near rodent eye', 'sphere', { x: .39, y: .13, z: .13 }, { x: .06, y: .06, z: .05 }, fishDarkMaterial),
      addPrimitive(rodentRig, 'Far rodent eye', 'sphere', { x: .39, y: .13, z: -.13 }, { x: .06, y: .06, z: .05 }, fishDarkMaterial)
    ];

    // Mink and otters: long flexible body, small rounded head, short limbs and a thick tapered tail.
    const otterRig = makeRig('otter', 'Otter and mink rig');
    this.catchOtterBody = addPrimitive(otterRig, 'Otter body', 'sphere', { x: -.09, y: 0, z: 0 }, { x: .82, y: .32, z: .3 }, this.fishBodyMaterial);
    this.catchOtterHead = addPrimitive(otterRig, 'Otter head', 'sphere', { x: .36, y: .06, z: 0 }, { x: .32, y: .28, z: .27 }, this.fishBodyMaterial);
    addOrganicJoint(otterRig, 'Otter neck', { x: .22, y: .035, z: 0 }, { x: .3, y: .24, z: .24 }, this.fishBodyMaterial);
    this.catchOtterMuzzle = addPrimitive(otterRig, 'Otter muzzle', 'sphere', { x: .52, y: .01, z: 0 }, { x: .2, y: .13, z: .15 }, this.fishAccentMaterial);
    this.catchOtterEars = [
      addPrimitive(otterRig, 'Near otter ear', 'sphere', { x: .29, y: .2, z: .115 }, { x: .09, y: .095, z: .055 }, this.fishAccentMaterial),
      addPrimitive(otterRig, 'Far otter ear', 'sphere', { x: .29, y: .2, z: -.115 }, { x: .09, y: .095, z: .055 }, this.fishAccentMaterial)
    ];
    addOrganicJoint(otterRig, 'Otter tail root', { x: -.45, y: -.02, z: 0 }, { x: .3, y: .18, z: .18 }, this.fishBodyMaterial);
    this.catchOtterTail = addPrimitive(otterRig, 'Otter tail', 'cone', { x: -.7, y: -.03, z: 0 }, { x: .18, y: .62, z: .13 }, this.fishAccentMaterial, { z: 90 });
    this.catchOtterLegs = [];
    for (const x of [-.28, .2]) for (const side of [-1, 1]) {
      addOrganicJoint(otterRig, 'Otter leg root', { x, y: -.12, z: side * .115 }, { x: .16, y: .13, z: .14 }, this.fishAccentMaterial);
      this.catchOtterLegs.push(addPrimitive(otterRig, 'Otter paw', 'sphere', { x: x + .02, y: -.18, z: side * .16 }, { x: .2, y: .12, z: .15 }, this.fishAccentMaterial));
    }
    this.catchOtterEyes = [
      addPrimitive(otterRig, 'Near otter eye', 'sphere', { x: .43, y: .115, z: .12 }, { x: .055, y: .055, z: .045 }, fishDarkMaterial),
      addPrimitive(otterRig, 'Far otter eye', 'sphere', { x: .43, y: .115, z: -.12 }, { x: .055, y: .055, z: .045 }, fishDarkMaterial)
    ];

    // Beaver gets the broad paddle tail that the generic mammal rig could never represent.
    const beaverRig = makeRig('beaver', 'Beaver rig');
    this.catchBeaverBody = addPrimitive(beaverRig, 'Beaver body', 'sphere', { x: -.08, y: 0, z: 0 }, { x: .72, y: .44, z: .42 }, this.fishBodyMaterial);
    this.catchBeaverHead = addPrimitive(beaverRig, 'Beaver head', 'sphere', { x: .32, y: .075, z: 0 }, { x: .35, y: .32, z: .31 }, this.fishBodyMaterial);
    addOrganicJoint(beaverRig, 'Beaver neck', { x: .17, y: .04, z: 0 }, { x: .3, y: .28, z: .28 }, this.fishBodyMaterial);
    this.catchBeaverMuzzle = addPrimitive(beaverRig, 'Beaver muzzle', 'sphere', { x: .5, y: .015, z: 0 }, { x: .23, y: .17, z: .18 }, this.fishAccentMaterial);
    this.catchBeaverEars = [
      addPrimitive(beaverRig, 'Near beaver ear', 'sphere', { x: .25, y: .245, z: .12 }, { x: .105, y: .11, z: .065 }, this.fishAccentMaterial),
      addPrimitive(beaverRig, 'Far beaver ear', 'sphere', { x: .25, y: .245, z: -.12 }, { x: .105, y: .11, z: .065 }, this.fishAccentMaterial)
    ];
    addOrganicJoint(beaverRig, 'Beaver tail root', { x: -.42, y: -.025, z: 0 }, { x: .3, y: .2, z: .22 }, this.fishBodyMaterial);
    this.catchBeaverTail = addPrimitive(beaverRig, 'Beaver paddle tail', 'sphere', { x: -.62, y: -.035, z: 0 }, { x: .38, y: .11, z: .42 }, this.fishAccentMaterial);
    this.catchBeaverLegs = [];
    for (const x of [-.25, .18]) for (const side of [-1, 1]) {
      addOrganicJoint(beaverRig, 'Beaver leg root', { x, y: -.16, z: side * .14 }, { x: .18, y: .16, z: .17 }, this.fishAccentMaterial);
      this.catchBeaverLegs.push(addPrimitive(beaverRig, 'Beaver foot', 'sphere', { x: x + .015, y: -.24, z: side * .2 }, { x: .23, y: .13, z: .18 }, this.fishAccentMaterial));
    }
    this.catchBeaverEyes = [
      addPrimitive(beaverRig, 'Near beaver eye', 'sphere', { x: .4, y: .135, z: .13 }, { x: .06, y: .06, z: .05 }, fishDarkMaterial),
      addPrimitive(beaverRig, 'Far beaver eye', 'sphere', { x: .4, y: .135, z: -.13 }, { x: .06, y: .06, z: .05 }, fishDarkMaterial)
    ];

    // Platypus: low body, broad bill, webbed feet and a flat tail.
    const platypusRig = makeRig('platypus', 'Platypus rig');
    this.catchPlatypusBody = addPrimitive(platypusRig, 'Platypus body', 'sphere', { x: -.08, y: 0, z: 0 }, { x: .74, y: .34, z: .36 }, this.fishBodyMaterial);
    this.catchPlatypusHead = addPrimitive(platypusRig, 'Platypus head', 'sphere', { x: .31, y: .055, z: 0 }, { x: .3, y: .27, z: .29 }, this.fishBodyMaterial);
    addOrganicJoint(platypusRig, 'Platypus neck', { x: .18, y: .03, z: 0 }, { x: .28, y: .24, z: .25 }, this.fishBodyMaterial);
    this.catchPlatypusBill = addPrimitive(platypusRig, 'Platypus bill', 'sphere', { x: .52, y: .015, z: 0 }, { x: .3, y: .105, z: .26 }, this.fishAccentMaterial);
    addOrganicJoint(platypusRig, 'Platypus tail root', { x: -.42, y: -.015, z: 0 }, { x: .28, y: .18, z: .2 }, this.fishBodyMaterial);
    this.catchPlatypusTail = addPrimitive(platypusRig, 'Platypus paddle tail', 'sphere', { x: -.63, y: -.02, z: 0 }, { x: .4, y: .1, z: .34 }, this.fishAccentMaterial);
    this.catchPlatypusLegs = [];
    for (const x of [-.25, .17]) for (const side of [-1, 1]) {
      addOrganicJoint(platypusRig, 'Platypus leg root', { x, y: -.13, z: side * .13 }, { x: .17, y: .14, z: .16 }, this.fishAccentMaterial);
      this.catchPlatypusLegs.push(addPrimitive(platypusRig, 'Platypus webbed foot', 'sphere', { x: x + .03, y: -.2, z: side * .2 }, { x: .24, y: .095, z: .2 }, this.fishAccentMaterial));
    }
    this.catchPlatypusEyes = [
      addPrimitive(platypusRig, 'Near platypus eye', 'sphere', { x: .38, y: .105, z: .12 }, { x: .052, y: .052, z: .043 }, fishDarkMaterial),
      addPrimitive(platypusRig, 'Far platypus eye', 'sphere', { x: .38, y: .105, z: -.12 }, { x: .052, y: .052, z: .043 }, fishDarkMaterial)
    ];

    // Seals, sea lions, walrus, selkies.
    const pinnipedRig = makeRig('pinniped', 'Pinniped rig');
    this.catchPinnipedBody = addPrimitive(pinnipedRig, 'Pinniped body', 'sphere', { x: -.1, y: 0, z: 0 }, { x: .72, y: .34, z: .32 }, this.fishBodyMaterial);
    this.catchPinnipedHead = addPrimitive(pinnipedRig, 'Pinniped head', 'sphere', { x: .48, y: .08, z: 0 }, { x: .3, y: .28, z: .27 }, this.fishBodyMaterial);
    this.catchPinnipedMuzzle = addPrimitive(pinnipedRig, 'Pinniped muzzle', 'sphere', { x: .64, y: .01, z: 0 }, { x: .2, y: .14, z: .16 }, this.fishAccentMaterial);
    addOrganicJoint(pinnipedRig, 'Pinniped neck', { x: .3, y: .04, z: 0 }, { x: .26, y: .26, z: .25 }, this.fishBodyMaterial);
    this.catchPinnipedFrontFlippers = [
      addPrimitive(pinnipedRig, 'Near front flipper', 'cone', { x: .08, y: -.2, z: .32 }, { x: .16, y: .3, z: .08 }, this.fishAccentMaterial, { x: 72, z: -25 }),
      addPrimitive(pinnipedRig, 'Far front flipper', 'cone', { x: .08, y: -.2, z: -.32 }, { x: .16, y: .3, z: .08 }, this.fishAccentMaterial, { x: -72, z: -25 })
    ];
    addOrganicJoint(pinnipedRig, 'Near front flipper root', { x: .06, y: -.14, z: .23 }, { x: .16, y: .13, z: .16 }, this.fishAccentMaterial);
    addOrganicJoint(pinnipedRig, 'Far front flipper root', { x: .06, y: -.14, z: -.23 }, { x: .16, y: .13, z: .16 }, this.fishAccentMaterial);
    addOrganicJoint(pinnipedRig, 'Pinniped rear body joint', { x: -.42, y: -.01, z: 0 }, { x: .24, y: .2, z: .22 }, this.fishBodyMaterial);
    this.catchPinnipedRearFlippers = [
      addPrimitive(pinnipedRig, 'Near rear flipper', 'cone', { x: -.48, y: -.02, z: .13 }, { x: .16, y: .3, z: .08 }, this.fishAccentMaterial, { z: 82 }),
      addPrimitive(pinnipedRig, 'Far rear flipper', 'cone', { x: -.48, y: -.02, z: -.13 }, { x: .16, y: .3, z: .08 }, this.fishAccentMaterial, { z: 98 })
    ];
    addOrganicJoint(pinnipedRig, 'Near rear flipper root', { x: -.42, y: -.02, z: .09 }, { x: .16, y: .13, z: .13 }, this.fishAccentMaterial);
    addOrganicJoint(pinnipedRig, 'Far rear flipper root', { x: -.42, y: -.02, z: -.09 }, { x: .16, y: .13, z: .13 }, this.fishAccentMaterial);
    this.catchPinnipedEyes = [
      addPrimitive(pinnipedRig, 'Near pinniped eye', 'sphere', { x: .55, y: .15, z: .18 }, { x: .045, y: .045, z: .035 }, fishDarkMaterial),
      addPrimitive(pinnipedRig, 'Far pinniped eye', 'sphere', { x: .55, y: .15, z: -.18 }, { x: .045, y: .045, z: .035 }, fishDarkMaterial)
    ];

    // Dolphins, porpoises, whales, orcas, narwhals and whale-like leviathans.
    const cetaceanRig = makeRig('cetacean', 'Cetacean rig');
    this.catchCetaceanBody = addPrimitive(cetaceanRig, 'Cetacean body', 'sphere', { x: -.08, y: 0, z: 0 }, { x: .8, y: .3, z: .28 }, this.fishBodyMaterial);
    this.catchCetaceanHead = addPrimitive(cetaceanRig, 'Cetacean head', 'sphere', { x: .48, y: .02, z: 0 }, { x: .34, y: .28, z: .27 }, this.fishBodyMaterial);
    this.catchCetaceanSnout = addPrimitive(cetaceanRig, 'Cetacean snout', 'sphere', { x: .72, y: -.03, z: 0 }, { x: .25, y: .11, z: .13 }, this.fishAccentMaterial);
    addOrganicJoint(cetaceanRig, 'Cetacean neck-body blend', { x: .3, y: .01, z: 0 }, { x: .25, y: .23, z: .23 }, this.fishBodyMaterial);
    this.catchCetaceanDorsal = addPrimitive(cetaceanRig, 'Cetacean dorsal', 'cone', { x: -.12, y: .3, z: 0 }, { x: .16, y: .28, z: .07 }, this.fishAccentMaterial);
    this.catchCetaceanPectorals = [
      addPrimitive(cetaceanRig, 'Near cetacean flipper', 'cone', { x: .12, y: -.12, z: .31 }, { x: .14, y: .32, z: .07 }, this.fishAccentMaterial, { x: 72, z: -18 }),
      addPrimitive(cetaceanRig, 'Far cetacean flipper', 'cone', { x: .12, y: -.12, z: -.31 }, { x: .14, y: .32, z: .07 }, this.fishAccentMaterial, { x: -72, z: -18 })
    ];
    addOrganicJoint(cetaceanRig, 'Cetacean tail stock', { x: -.43, y: 0, z: 0 }, { x: .28, y: .14, z: .14 }, this.fishBodyMaterial);
    this.catchCetaceanFlukes = [
      addPrimitive(cetaceanRig, 'Near tail fluke', 'cone', { x: -.52, y: 0, z: .13 }, { x: .15, y: .34, z: .08 }, this.fishAccentMaterial, { x: 72, z: 88 }),
      addPrimitive(cetaceanRig, 'Far tail fluke', 'cone', { x: -.52, y: 0, z: -.13 }, { x: .15, y: .34, z: .08 }, this.fishAccentMaterial, { x: -72, z: 88 })
    ];
    this.catchCetaceanEyes = [
      addPrimitive(cetaceanRig, 'Near cetacean eye', 'sphere', { x: .52, y: .08, z: .2 }, { x: .04, y: .04, z: .03 }, fishDarkMaterial),
      addPrimitive(cetaceanRig, 'Far cetacean eye', 'sphere', { x: .52, y: .08, z: -.2 }, { x: .04, y: .04, z: .03 }, fishDarkMaterial)
    ];

    // Manatees and dugongs.
    const sirenianRig = makeRig('sirenian', 'Sirenian rig');
    this.catchSirenianBody = addPrimitive(sirenianRig, 'Sirenian body', 'sphere', { x: -.08, y: 0, z: 0 }, { x: .72, y: .4, z: .36 }, this.fishBodyMaterial);
    this.catchSirenianHead = addPrimitive(sirenianRig, 'Sirenian head', 'sphere', { x: .45, y: .05, z: 0 }, { x: .31, y: .31, z: .29 }, this.fishBodyMaterial);
    this.catchSirenianMuzzle = addPrimitive(sirenianRig, 'Sirenian muzzle', 'sphere', { x: .64, y: -.03, z: 0 }, { x: .2, y: .16, z: .17 }, this.fishAccentMaterial);
    this.catchSirenianFlippers = [
      addPrimitive(sirenianRig, 'Near sirenian flipper', 'cone', { x: .05, y: -.2, z: .33 }, { x: .15, y: .3, z: .07 }, this.fishAccentMaterial, { x: 72, z: -20 }),
      addPrimitive(sirenianRig, 'Far sirenian flipper', 'cone', { x: .05, y: -.2, z: -.33 }, { x: .15, y: .3, z: .07 }, this.fishAccentMaterial, { x: -72, z: -20 })
    ];
    addOrganicJoint(sirenianRig, 'Near sirenian flipper root', { x: .03, y: -.14, z: .26 }, { x: .17, y: .14, z: .16 }, this.fishAccentMaterial);
    addOrganicJoint(sirenianRig, 'Far sirenian flipper root', { x: .03, y: -.14, z: -.26 }, { x: .17, y: .14, z: .16 }, this.fishAccentMaterial);
    addOrganicJoint(sirenianRig, 'Sirenian neck', { x: .28, y: .025, z: 0 }, { x: .25, y: .27, z: .25 }, this.fishBodyMaterial);
    addOrganicJoint(sirenianRig, 'Sirenian tail stock', { x: -.4, y: 0, z: 0 }, { x: .25, y: .2, z: .22 }, this.fishBodyMaterial);
    this.catchSirenianTail = addPrimitive(sirenianRig, 'Sirenian paddle tail', 'sphere', { x: -.5, y: 0, z: 0 }, { x: .3, y: .1, z: .38 }, this.fishAccentMaterial);
    this.catchSirenianEyes = [
      addPrimitive(sirenianRig, 'Near sirenian eye', 'sphere', { x: .51, y: .13, z: .19 }, { x: .04, y: .04, z: .03 }, fishDarkMaterial),
      addPrimitive(sirenianRig, 'Far sirenian eye', 'sphere', { x: .51, y: .13, z: -.19 }, { x: .04, y: .04, z: .03 }, fishDarkMaterial)
    ];

    // Freshwater and sea turtles, including giant mythical turtle forms.
    const turtleRig = makeRig('turtle', 'Turtle rig');
    this.catchTurtleShell = addPrimitive(turtleRig, 'Turtle shell', 'sphere', { x: -.04, y: .03, z: 0 }, { x: .56, y: .25, z: .48 }, this.fishBodyMaterial);
    this.catchTurtlePlastron = addPrimitive(turtleRig, 'Turtle underside', 'sphere', { x: -.04, y: -.12, z: 0 }, { x: .48, y: .12, z: .42 }, this.fishAccentMaterial);
    this.catchTurtleHead = addPrimitive(turtleRig, 'Turtle head', 'sphere', { x: .27, y: .02, z: 0 }, { x: .25, y: .2, z: .2 }, this.fishBodyMaterial);
    addOrganicJoint(turtleRig, 'Turtle neck', { x: .2, y: .02, z: 0 }, { x: .2, y: .18, z: .18 }, this.fishBodyMaterial);
    this.catchTurtleLimbs = [];
    for (const x of [-.28, .2]) for (const side of [-1, 1]) {
      this.catchTurtleLimbs.push(addPrimitive(turtleRig, 'Turtle limb', 'cone', { x, y: -.05, z: side * .29 }, { x: .12, y: .26, z: .07 }, this.fishAccentMaterial, { x: side * 72, z: x > 0 ? -20 : 20 }));
    }
    for (const x of [-.24, .17]) for (const side of [-1, 1]) {
      addOrganicJoint(turtleRig, 'Turtle limb root', { x, y: -.04, z: side * .22 }, { x: .16, y: .12, z: .16 }, this.fishAccentMaterial);
    }
    addOrganicJoint(turtleRig, 'Turtle rear body joint', { x: -.29, y: -.02, z: 0 }, { x: .18, y: .15, z: .18 }, this.fishBodyMaterial);
    this.catchTurtleTail = addPrimitive(turtleRig, 'Turtle tail', 'cone', { x: -.35, y: -.02, z: 0 }, { x: .12, y: .2, z: .08 }, this.fishAccentMaterial, { z: 90 });
    this.catchTurtleEyes = [
      addPrimitive(turtleRig, 'Near turtle eye', 'sphere', { x: .36, y: .08, z: .1 }, { x: .035, y: .035, z: .027 }, fishDarkMaterial),
      addPrimitive(turtleRig, 'Far turtle eye', 'sphere', { x: .36, y: .08, z: -.1 }, { x: .035, y: .035, z: .027 }, fishDarkMaterial)
    ];

    const frogRig = makeRig('frog', 'Frog rig');
    this.catchFrogBody = addPrimitive(frogRig, 'Frog body', 'sphere', { x: -.08, y: 0, z: 0 }, { x: .43, y: .3, z: .34 }, this.fishBodyMaterial);
    this.catchFrogHead = addPrimitive(frogRig, 'Frog head', 'sphere', { x: .17, y: .06, z: 0 }, { x: .34, y: .28, z: .34 }, this.fishBodyMaterial);
    addOrganicJoint(frogRig, 'Frog shoulder-body joint', { x: .06, y: .02, z: 0 }, { x: .28, y: .25, z: .3 }, this.fishBodyMaterial);
    this.catchFrogHindLegs = [
      addPrimitive(frogRig, 'Near frog hind leg', 'box', { x: -.27, y: -.16, z: .23 }, { x: .38, y: .08, z: .07 }, this.fishAccentMaterial, { y: 35 }),
      addPrimitive(frogRig, 'Far frog hind leg', 'box', { x: -.27, y: -.16, z: -.23 }, { x: .38, y: .08, z: .07 }, this.fishAccentMaterial, { y: -35 })
    ];
    this.catchFrogForelegs = [
      addPrimitive(frogRig, 'Near frog foreleg', 'box', { x: .14, y: -.14, z: .19 }, { x: .23, y: .055, z: .055 }, this.fishAccentMaterial, { y: 35 }),
      addPrimitive(frogRig, 'Far frog foreleg', 'box', { x: .14, y: -.14, z: -.19 }, { x: .23, y: .055, z: .055 }, this.fishAccentMaterial, { y: -35 })
    ];
    for (const side of [-1, 1]) {
      addOrganicJoint(frogRig, 'Frog hind-leg root', { x: -.2, y: -.11, z: side * .2 }, { x: .18, y: .13, z: .15 }, this.fishAccentMaterial);
      addOrganicJoint(frogRig, 'Frog foreleg root', { x: .11, y: -.1, z: side * .16 }, { x: .14, y: .11, z: .12 }, this.fishAccentMaterial);
    }
    this.catchFrogEyes = [
      addPrimitive(frogRig, 'Near frog eye', 'sphere', { x: .28, y: .18, z: .16 }, { x: .06, y: .06, z: .05 }, fishDarkMaterial),
      addPrimitive(frogRig, 'Far frog eye', 'sphere', { x: .28, y: .18, z: -.16 }, { x: .06, y: .06, z: .05 }, fishDarkMaterial)
    ];

    const starfishRig = makeRig('starfish', 'Sea star rig');
    this.catchStarCenter = addPrimitive(starfishRig, 'Sea star center', 'sphere', { x: 0, y: 0, z: 0 }, { x: .24, y: .09, z: .24 }, this.fishBodyMaterial);
    this.catchStarArms = [];
    for (let index = 0; index < 5; index += 1) {
      const angle = index * Math.PI * 2 / 5;
      this.catchStarArms.push(addPrimitive(starfishRig, `Sea star arm ${index + 1}`, 'sphere',
        { x: Math.cos(angle) * .27, y: 0, z: Math.sin(angle) * .27 },
        { x: .5, y: .085, z: .13 }, this.fishAccentMaterial, { y: -angle * 180 / Math.PI }));
    }

    const urchinRig = makeRig('urchin', 'Urchin rig');
    this.catchUrchinCore = addPrimitive(urchinRig, 'Urchin core', 'sphere', { x: 0, y: 0, z: 0 }, { x: .36, y: .36, z: .36 }, this.fishBodyMaterial);
    this.catchUrchinSpines = [];
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI * 2 / 12;
      this.catchUrchinSpines.push(addPrimitive(urchinRig, `Urchin radial spine ${index + 1}`, 'box',
        { x: Math.cos(angle) * .34, y: (index % 2 ? 1 : -1) * .045, z: Math.sin(angle) * .34 },
        { x: .46, y: .025, z: .025 }, this.fishAccentMaterial, { y: -angle * 180 / Math.PI }));
    }
    this.catchUrchinSpines.push(
      addPrimitive(urchinRig, 'Urchin top spine', 'box', { x: 0, y: .35, z: 0 }, { x: .025, y: .42, z: .025 }, this.fishAccentMaterial),
      addPrimitive(urchinRig, 'Urchin bottom spine', 'box', { x: 0, y: -.35, z: 0 }, { x: .025, y: .42, z: .025 }, this.fishAccentMaterial)
    );

    const nautilusRig = makeRig('nautilus', 'Nautilus rig');
    this.catchNautilusShell = addPrimitive(nautilusRig, 'Nautilus shell', 'sphere', { x: -.12, y: .05, z: 0 }, { x: .42, y: .42, z: .34 }, this.fishBodyMaterial);
    this.catchNautilusHead = addPrimitive(nautilusRig, 'Nautilus head', 'sphere', { x: .1, y: -.035, z: 0 }, { x: .27, y: .22, z: .24 }, this.fishAccentMaterial);
    addOrganicJoint(nautilusRig, 'Nautilus shell-head collar', { x: .015, y: 0, z: 0 }, { x: .22, y: .2, z: .21 }, this.fishAccentMaterial);
    this.catchNautilusTentacles = [];
    for (let index = 0; index < 8; index += 1) {
      const side = index % 2 ? 1 : -1;
      const band = Math.floor(index / 2);
      this.catchNautilusTentacles.push(addPrimitive(nautilusRig, `Nautilus tentacle ${index + 1}`, 'box', { x: .28, y: -.12 + band * .07, z: side * (.07 + band * .05) }, { x: .3 + band * .04, y: .02, z: .02 }, this.fishAccentMaterial, { y: side * (8 + band * 7) }));
    }
    this.catchNautilusEyes = [
      addPrimitive(nautilusRig, 'Near nautilus eye', 'sphere', { x: .2, y: .04, z: .13 }, { x: .035, y: .035, z: .028 }, fishDarkMaterial),
      addPrimitive(nautilusRig, 'Far nautilus eye', 'sphere', { x: .2, y: .04, z: -.13 }, { x: .035, y: .035, z: .028 }, fishDarkMaterial)
    ];

    // Kelpies, hippocampi, Each-Uisge and Makara use a compact swimming water-horse silhouette.
    const waterhorseRig = makeRig('waterhorse', 'Water horse rig');
    this.catchWaterhorseBody = addPrimitive(waterhorseRig, 'Water horse body', 'sphere', { x: -.12, y: -.02, z: 0 }, { x: .56, y: .31, z: .28 }, this.fishBodyMaterial);
    this.catchWaterhorseNeck = addPrimitive(waterhorseRig, 'Water horse neck', 'sphere', { x: .25, y: .18, z: 0 }, { x: .23, y: .38, z: .2 }, this.fishBodyMaterial);
    this.catchWaterhorseHead = addPrimitive(waterhorseRig, 'Water horse head', 'sphere', { x: .46, y: .34, z: 0 }, { x: .25, y: .2, z: .19 }, this.fishBodyMaterial);
    this.catchWaterhorseMuzzle = addPrimitive(waterhorseRig, 'Water horse muzzle', 'sphere', { x: .63, y: .3, z: 0 }, { x: .22, y: .12, z: .13 }, this.fishAccentMaterial);
    addOrganicJoint(waterhorseRig, 'Water horse shoulder-neck joint', { x: .14, y: .1, z: 0 }, { x: .28, y: .3, z: .24 }, this.fishBodyMaterial);
    addOrganicJoint(waterhorseRig, 'Water horse neck-head joint', { x: .36, y: .29, z: 0 }, { x: .22, y: .22, z: .2 }, this.fishBodyMaterial);
    this.catchWaterhorseLegs = [];
    for (const x of [-.25, .16]) for (const side of [-1, 1]) {
      this.catchWaterhorseLegs.push(addPrimitive(waterhorseRig, 'Water horse leg', 'box', { x, y: -.28, z: side * .2 }, { x: .3, y: .05, z: .05 }, this.fishAccentMaterial, { y: side * 24, z: side * 10 }));
    }
    for (const x of [-.22, .13]) for (const side of [-1, 1]) {
      addOrganicJoint(waterhorseRig, 'Water horse leg root', { x, y: -.2, z: side * .16 }, { x: .17, y: .13, z: .14 }, this.fishAccentMaterial);
    }
    addOrganicJoint(waterhorseRig, 'Water horse tail root', { x: -.36, y: 0, z: 0 }, { x: .22, y: .2, z: .19 }, this.fishBodyMaterial);
    this.catchWaterhorseTail = addPrimitive(waterhorseRig, 'Water horse tail', 'cone', { x: -.43, y: .01, z: 0 }, { x: .2, y: .44, z: .12 }, this.fishAccentMaterial, { z: 90 });
    this.catchWaterhorseEyes = [
      addPrimitive(waterhorseRig, 'Near water horse eye', 'sphere', { x: .5, y: .4, z: .13 }, { x: .04, y: .04, z: .032 }, fishDarkMaterial),
      addPrimitive(waterhorseRig, 'Far water horse eye', 'sphere', { x: .5, y: .4, z: -.13 }, { x: .04, y: .04, z: .032 }, fishDarkMaterial)
    ];

    const serpentRig = makeRig('serpent', 'Aquatic serpent rig');
    this.catchSerpentSegments = [];
    for (let index = 0; index < 8; index += 1) {
      this.catchSerpentSegments.push(addPrimitive(serpentRig, `Serpent segment ${index + 1}`, 'sphere', { x: .35 - index * .16, y: 0, z: 0 }, { x: .2, y: .14, z: .14 }, this.fishBodyMaterial));
    }
    this.catchSerpentHead = addPrimitive(serpentRig, 'Serpent head', 'sphere', { x: .55, y: .03, z: 0 }, { x: .25, y: .18, z: .17 }, this.fishAccentMaterial);
    addOrganicJoint(serpentRig, 'Serpent crest root', { x: .47, y: .105, z: 0 }, { x: .14, y: .11, z: .1 }, this.fishAccentMaterial);
    this.catchSerpentCrest = addPrimitive(serpentRig, 'Serpent crest', 'cone', { x: .47, y: .15, z: 0 }, { x: .11, y: .17, z: .06 }, this.fishAccentMaterial);
    this.catchSerpentEyes = [
      addPrimitive(serpentRig, 'Near serpent eye', 'sphere', { x: .62, y: .09, z: .12 }, { x: .035, y: .035, z: .028 }, fishDarkMaterial),
      addPrimitive(serpentRig, 'Far serpent eye', 'sphere', { x: .62, y: .09, z: -.12 }, { x: .035, y: .035, z: .028 }, fishDarkMaterial)
    ];

    // The summit dragon is a dedicated aquatic-dragon hierarchy, not a renamed fish or
    // serpent: segmented body, jawed head, horns, dorsal spines, fins, limbs, and tail fan.
    const dragonRig = makeRig('dragon', 'Aquatic dragon rig');
    this.catchDragonSegments = [];
    for (let index = 0; index < 10; index += 1) {
      this.catchDragonSegments.push(addPrimitive(dragonRig, `Dragon body segment ${index + 1}`, 'sphere',
        { x: .28 - index * .13, y: Math.sin(index * .62) * .05, z: Math.cos(index * .47) * .025 },
        { x: .2 - index * .008, y: .17 - index * .006, z: .16 - index * .005 }, this.fishBodyMaterial));
    }
    this.catchDragonHead = addPrimitive(dragonRig, 'Dragon head', 'sphere', { x: .5, y: .08, z: 0 }, { x: .28, y: .22, z: .21 }, this.fishBodyMaterial);
    this.catchDragonMuzzle = addPrimitive(dragonRig, 'Dragon upper muzzle', 'sphere', { x: .66, y: .05, z: 0 }, { x: .29, y: .13, z: .2 }, this.fishAccentMaterial, { z: -3 });
    this.catchDragonJaw = addPrimitive(dragonRig, 'Dragon lower jaw', 'sphere', { x: .65, y: -.055, z: 0 }, { x: .25, y: .09, z: .18 }, this.fishBodyMaterial, { z: 7 });
    this.catchDragonHorns = [-1, 1].map((side) => addPrimitive(
      dragonRig, side > 0 ? 'Near dragon horn' : 'Far dragon horn', 'cone',
      { x: .42, y: .28, z: side * .14 }, { x: .07, y: .23, z: .065 },
      this.fishAccentMaterial, { x: side * 16, z: 28 }
    ));
    this.catchDragonSpines = Array.from({ length: 6 }, (_, index) => {
      const x = .28 - index * .18;
      addOrganicJoint(dragonRig, `Dragon dorsal scale root ${index + 1}`,
        { x, y: .09, z: 0 }, { x: .12, y: .12, z: .1 }, this.fishAccentMaterial);
      return addPrimitive(
        dragonRig, `Dragon dorsal spine ${index + 1}`, 'cone',
        { x, y: .14, z: 0 }, { x: .08, y: .2 - index * .012, z: .055 },
        this.fishAccentMaterial, { z: 5 + index * 3 }
      );
    });
    this.catchDragonFins = [-1, 1].map((side) => {
      addOrganicJoint(dragonRig, side > 0 ? 'Near dragon fin root' : 'Far dragon fin root',
        { x: .16, y: -.04, z: side * .115 }, { x: .14, y: .12, z: .13 }, this.fishAccentMaterial);
      return addPrimitive(
        dragonRig, side > 0 ? 'Near dragon fin' : 'Far dragon fin', 'cone',
        { x: .16, y: -.04, z: side * .17 }, { x: .13, y: .3, z: .08 },
        this.fishAccentMaterial, { x: side * 72, z: -24 }
      );
    });
    this.catchDragonLimbs = [];
    for (const x of [-.24, .12]) for (const side of [-1, 1]) {
      addOrganicJoint(dragonRig, 'Dragon swimming limb root',
        { x, y: -.085, z: side * .105 }, { x: .15, y: .13, z: .14 }, this.fishAccentMaterial);
      this.catchDragonLimbs.push(addPrimitive(dragonRig, 'Dragon swimming limb', 'sphere',
        { x, y: -.15, z: side * .15 }, { x: .28, y: .09, z: .09 },
        this.fishAccentMaterial, { y: side * 24, z: side * 7 }));
    }
    addOrganicJoint(dragonRig, 'Dragon tail-fan root', { x: -.89, y: 0, z: 0 }, { x: .2, y: .14, z: .14 }, this.fishBodyMaterial);
    this.catchDragonTailFan = addPrimitive(dragonRig, 'Dragon tail fan', 'cone', { x: -.96, y: 0, z: 0 }, { x: .2, y: .4, z: .09 }, this.fishAccentMaterial, { z: 90 });
    this.catchDragonEyes = [
      addPrimitive(dragonRig, 'Near dragon eye', 'sphere', { x: .57, y: .15, z: .16 }, { x: .038, y: .038, z: .03 }, fishDarkMaterial),
      addPrimitive(dragonRig, 'Far dragon eye', 'sphere', { x: .57, y: .15, z: -.16 }, { x: .038, y: .038, z: .03 }, fishDarkMaterial)
    ];

    const plesiosaurRig = makeRig('plesiosaur', 'Lake monster rig');
    this.catchPlesiosaurBody = addPrimitive(plesiosaurRig, 'Lake monster body', 'sphere', { x: -.15, y: 0, z: 0 }, { x: .56, y: .28, z: .3 }, this.fishBodyMaterial);
    this.catchPlesiosaurNeck = [];
    for (let index = 0; index < 4; index += 1) {
      this.catchPlesiosaurNeck.push(addPrimitive(plesiosaurRig, `Lake monster neck ${index + 1}`, 'sphere', { x: .18 + index * .14, y: .08 + index * .08, z: 0 }, { x: .17, y: .13, z: .13 }, this.fishBodyMaterial));
    }
    this.catchPlesiosaurHead = addPrimitive(plesiosaurRig, 'Lake monster head', 'sphere', { x: .7, y: .37, z: 0 }, { x: .25, y: .19, z: .18 }, this.fishAccentMaterial);
    addOrganicJoint(plesiosaurRig, 'Lake monster head-neck joint', { x: .62, y: .34, z: 0 }, { x: .18, y: .15, z: .15 }, this.fishBodyMaterial);
    this.catchPlesiosaurFlippers = [];
    for (const x of [-.32, .08]) for (const side of [-1, 1]) {
      this.catchPlesiosaurFlippers.push(addPrimitive(plesiosaurRig, 'Lake monster flipper', 'cone', { x, y: -.12, z: side * .3 }, { x: .13, y: .28, z: .07 }, this.fishAccentMaterial, { x: side * 70, z: -18 }));
    }
    for (const x of [-.28, .06]) for (const side of [-1, 1]) {
      addOrganicJoint(plesiosaurRig, 'Lake monster flipper root', { x, y: -.09, z: side * .23 }, { x: .15, y: .12, z: .14 }, this.fishAccentMaterial);
    }
    addOrganicJoint(plesiosaurRig, 'Lake monster tail root', { x: -.4, y: .01, z: 0 }, { x: .2, y: .2, z: .21 }, this.fishBodyMaterial);
    this.catchPlesiosaurTail = addPrimitive(plesiosaurRig, 'Lake monster tail', 'cone', { x: -.47, y: .01, z: 0 }, { x: .22, y: .4, z: .12 }, this.fishAccentMaterial, { z: 90 });
    this.catchPlesiosaurEyes = [
      addPrimitive(plesiosaurRig, 'Near lake monster eye', 'sphere', { x: .78, y: .43, z: .11 }, { x: .035, y: .035, z: .027 }, fishDarkMaterial),
      addPrimitive(plesiosaurRig, 'Far lake monster eye', 'sphere', { x: .78, y: .43, z: -.11 }, { x: .035, y: .035, z: .027 }, fishDarkMaterial)
    ];

    // Eyes remain siblings of their head primitives so all authored rigs stay simple.
    // Attach each pair to the actual ellipsoid surface using head dimensions and eye radius;
    // unlike the old universal Z multiplier, this cannot alternately float large eyes and
    // bury small ones. Eyestalk creatures retain their purpose-built authored placement.
    const eyeAttachments = [
      [this.catchFishEyes, this.catchFishHead],
      [this.catchDeepFishEyes, this.catchDeepFishHead],
      [this.catchSharkEyes, this.catchSharkHead],
      [this.catchEelEyes, this.catchEelHead],
      [this.catchLuscaEyes, this.catchLuscaHead],
      [this.catchOctopusEyes, this.catchOctopusHead],
      [this.catchSquidEyes, this.catchSquidHead],
      [this.catchSalamanderEyes, this.catchSalamanderHead],
      [this.catchMammalEyes, this.catchMammalHead],
      [this.catchRodentEyes, this.catchRodentHead],
      [this.catchOtterEyes, this.catchOtterHead],
      [this.catchBeaverEyes, this.catchBeaverHead],
      [this.catchPlatypusEyes, this.catchPlatypusHead],
      [this.catchPinnipedEyes, this.catchPinnipedHead],
      [this.catchCetaceanEyes, this.catchCetaceanHead],
      [this.catchSirenianEyes, this.catchSirenianHead],
      [this.catchTurtleEyes, this.catchTurtleHead],
      [this.catchFrogEyes, this.catchFrogHead],
      [this.catchNautilusEyes, this.catchNautilusHead],
      [this.catchWaterhorseEyes, this.catchWaterhorseHead],
      [this.catchSerpentEyes, this.catchSerpentHead],
      [this.catchDragonEyes, this.catchDragonHead],
      [this.catchPlesiosaurEyes, this.catchPlesiosaurHead]
    ];
    for (const [eyes, head] of eyeAttachments) attachEyePairToHead(eyes, head);

    this.shinyMaterial = makeMaterial([.55, .93, .95], { gloss: .98, emissive: [.16, .34, .4], emissiveIntensity: 1.8 });
    this.catchFishSparkles = Array.from({ length: 6 }, (_, index) => addPrimitive(
      this.catchFish, `Shiny sparkle ${index + 1}`, 'sphere',
      { x: (index % 3 - 1) * .35, y: index % 2 ? .32 : -.25, z: .31 },
      { x: .045, y: .045, z: .045 }, this.shinyMaterial
    ));
    this.catchFishSparkles.forEach((sparkle) => { sparkle.enabled = false; });
  }

  findNearbyZone() {
    const maximumCastDistance = this.config.maximumCastDistance
      * (this.progression?.getModifier('castDistance') ?? 1);
    return this.world.getFishingZoneForCast(
      this.player.getPosition(),
      this.player.getFacingDirection(),
      this.config.minimumCastDistance,
      maximumCastDistance
    );
  }

  canRemainActive() {
    if (!this.active || !this.zone) return false;
    // Never discard a landed catch presentation because the body slid/fell away from the bank.
    // The catch remains on screen until the player explicitly dismisses it.
    if (this.state === 'caught') return true;
    const maximumCastDistance = this.config.maximumCastDistance
      * (this.progression?.getModifier('castDistance') ?? 1);
    // Once the fishing stance is open, validity should depend on physical proximity to the
    // water rather than where the camera happens to be facing. A small grace margin avoids
    // flicker at the exact boundary, while a fall away from the bank cleanly exits fishing.
    return this.zone.canCastFrom(this.player.getPosition(), maximumCastDistance + 1.25, 5.5);
  }

  enter(zone) {
    if (!zone || this.state !== 'inactive') return false;
    this.zone = zone;
    this.state = 'ready';
    this.stateTime = 0;
    this.message = 'Hold ↑ to charge • release to cast';
    this.charge = 0;
    this.rodRoot.enabled = true;
    this.player.input.consumeFishingCastPressed();
    this.player.input.consumeFishingCastReleased();
    this.player.input.consumeFishingHookPressed();
    this.castInputHeld = this.player.input.fishingCastHeld;
    this.nearLossWarned = false;
    this.showHookTutorial = false;
    this.hideWaterVisuals();
    this.showIdleLine();
    this.audio.tone(320, 0.08);
    return true;
  }

  cancel() {
    this.recordPerformanceEncounter('cancelled');
    this.player.input.suppressPrimaryUntilRelease();
    this.state = 'inactive';
    this.stateTime = 0;
    this.zone = null;
    this.message = '';
    this.charge = 0;
    this.castInputHeld = false;
    this.nearLossWarned = false;
    this.selectedFish = null;
    this.selectionDebug = null;
    this.rhythmInputFeedback = null;
    this.rhythmInputFeedbackBatch = [];
    this.player.input.endRhythmCapture();
    this.rhythmStartupToken += 1;
    this.rhythmStartup = null;
    this.rhythm = null;
    this.catchCard = null;
    this.cast = null;
    this.rodRoot.enabled = false;
    this.catchFish.enabled = false;
    this.gallery.active = false;
    this.hideWaterVisuals();
    return true;
  }

  openGallery() {
    if (this.active) this.cancel();
    this.gallery.active = true;
    this.gallery.speciesIndex %= FISH_SPECIES.length;
    document.body.classList.add('fish-gallery');
    this.refreshGalleryFish();
  }

  closeGallery() {
    this.gallery.active = false;
    document.body.classList.remove('fish-gallery');
    this.selectedFish = null;
    this.catchCard = null;
    this.catchFish.enabled = false;
  }

  getCatchModelLabel(fish) {
    const archetype = fish?.visual?.archetype ?? 'unknown';
    const fishArchetypes = new Set(['panfish', 'slender', 'bass', 'carp', 'catfish', 'trout', 'flatfish', 'sculpin']);
    return fishArchetypes.has(archetype)
      ? `FISH (${archetype.toUpperCase()})`
      : archetype.toUpperCase();
  }

  stepGallery(direction) {
    if (!this.gallery.active) return;
    if (this.gallery.mode === 'models') {
      const count = this.galleryModelArchetypes.length;
      this.gallery.modelIndex = (this.gallery.modelIndex + direction + count) % count;
    } else {
      this.gallery.speciesIndex = (this.gallery.speciesIndex + direction + FISH_SPECIES.length) % FISH_SPECIES.length;
    }
    this.refreshGalleryFish();
  }

  toggleGalleryMode() {
    if (!this.gallery.active) return;
    if (this.gallery.mode === 'species') {
      const currentArchetype = this.selectedFish?.visual?.archetype;
      const matchingIndex = this.galleryModelArchetypes.indexOf(currentArchetype);
      this.gallery.modelIndex = matchingIndex >= 0 ? matchingIndex : 0;
      this.gallery.mode = 'models';
    } else {
      this.gallery.mode = 'species';
    }
    this.refreshGalleryFish();
  }

  refreshGalleryFish() {
    const modelMode = this.gallery.mode === 'models';
    let species;
    let galleryIndex;
    let galleryCount;
    if (modelMode) {
      const archetype = this.galleryModelArchetypes[this.gallery.modelIndex] ?? this.galleryModelArchetypes[0];
      species = FISH_SPECIES.find((entry) => (entry.visual?.archetype ?? 'panfish') === archetype) ?? FISH_SPECIES[0];
      galleryIndex = this.gallery.modelIndex + 1;
      galleryCount = this.galleryModelArchetypes.length;
    } else {
      species = FISH_SPECIES[this.gallery.speciesIndex];
      galleryIndex = this.gallery.speciesIndex + 1;
      galleryCount = FISH_SPECIES.length;
    }

    const specimen = createFishSpecimenForCategories(
      species,
      this.gallery.lengthIndex,
      this.gallery.sizeIndex,
      this.gallery.shiny,
      () => .5,
      this.gallery.changedDimension
    );
    this.gallery.lengthIndex = specimen.lengthCategoryIndex;
    this.gallery.sizeIndex = specimen.sizeCategoryIndex;
    if (modelMode) {
      const archetype = specimen.visual?.archetype ?? 'panfish';
      const genericName = archetype.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
      // Model mode is a disposable visual specimen. It never enters createCatchRecord(),
      // catchHistory, seenSpecies, bestBySpecies, or any journal persistence path.
      this.selectedFish = { ...specimen, name: `Generic ${genericName}`, speciesId: `gallery-model-${archetype}` };
    } else {
      this.selectedFish = specimen;
    }

    const modelLabel = this.getCatchModelLabel(this.selectedFish);
    const rarityLabel = (this.selectedFish.rarityLabel ?? this.selectedFish.rarity).toUpperCase();
    const modeLabel = modelMode ? 'MODEL GALLERY' : 'SPECIES GALLERY';
    const detailLabel = modelMode ? 'GENERIC MODEL' : rarityLabel;
    this.catchCard = {
      ...this.selectedFish,
      gallery: true,
      galleryMode: this.gallery.mode,
      galleryLabel: `${modeLabel} • ${galleryIndex}/${galleryCount} • MODEL: ${modelLabel} • ${detailLabel} • ${this.selectedFish.sizeCategory.toUpperCase()} • ${this.selectedFish.lengthCategory.toUpperCase()}${this.selectedFish.shiny ? ' • SHINY' : ''}`,
      galleryModel: modelLabel,
      galleryControls: `F4/P open/close • J/K ${modelMode ? 'model' : 'species'} • L length • B body • H shiny • M ${modelMode ? 'species' : 'models'} • Esc close`
    };
    this.showCaughtFish();
  }

  updateDebug() {
    if (this.gallery.active) this.updateCaughtVisual();
  }

  resetRun() {
    this.cancel();
    this.catchHistory.length = 0;
  }

  hideWaterVisuals() {
    this.bobberRoot.enabled = false;
    this.lineEntity.enabled = false;
    this.ripple.enabled = false;
    this.rippleAge = 99;
  }

  showIdleLine() {
    const tip = this.getRodTipPosition();
    this.bobberPosition.copy(tip).add(new pc.Vec3(0, -.28, 0));
    this.bobberRoot.enabled = true;
    this.lineEntity.enabled = true;
  }

  setState(state, message) {
    this.state = state;
    this.stateTime = 0;
    this.message = message;
  }

  update(dt, cameraAxes) {
    if (!this.active) return;
    this.stateTime += dt;
    this.visualTime += dt;
    if (this.state !== 'caught') {
      this.aimDirection.copy(cameraAxes.forward);
      this.aimDirection.y = 0;
      if (this.aimDirection.lengthSq() < 0.001) this.aimDirection.set(0, 0, -1);
      this.aimDirection.normalize();
      this.player.faceDirection(this.aimDirection, dt);
    }

    const pressed = this.player.input.consumePrimaryPressed();
    this.player.input.consumePrimaryReleased();
    const hookPressed = this.player.input.consumeFishingHookPressed();
    const castHeld = this.player.input.fishingCastHeld;
    const castPressed = this.player.input.consumeFishingCastPressed()
      || (castHeld && !this.castInputHeld);
    const castReleased = this.player.input.consumeFishingCastReleased()
      || (!castHeld && this.castInputHeld);
    this.castInputHeld = castHeld;
    const forceBite = this.player.input.consumeForceBite()
      && document.body.classList.contains('debug-visible');
    const debugFish = this.player.input.consumeDebugFish();
    if (forceBite && this.state === 'waiting') this.beginBite();
    if (debugFish && this.state === 'waiting' && document.body.classList.contains('debug-visible')) {
      this.beginBite(debugFish === 'easy' ? 'bluegill' : 'channel-catfish');
    }
    switch (this.state) {
      case 'ready':
        if (castPressed) {
          this.charge = 0;
          this.setState('charging', 'Release ↑ to cast');
          this.audio.tone(250, 0.055);
          if (castReleased) this.startCast();
        }
        break;
      case 'charging':
        this.charge = Math.min(1, this.charge + dt / this.config.chargeSeconds);
        if (castReleased) this.startCast();
        break;
      case 'casting':
        this.updateCast(dt);
        break;
      case 'waiting':
        this.updateWaiting(dt);
        break;
      case 'bite':
        this.updateBite(dt, pressed || hookPressed);
        break;
      case 'rhythm-starting':
        // Audio resume/sample preparation owns this very short phase. No chart clock exists
        // yet, so an opening event cannot pass visually before its sound path is valid.
        break;
      case 'rhythm':
        this.updateRhythm(dt);
        break;
      case 'caught':
        this.updateCaughtVisual();
        // Successful catches are inspection moments with no timeout. Arrow keys are the
        // primary mouse-free continue input; a primary mouse/grip click is a secondary option.
        // The capture listener consumes arrow keydown before movement/fishing handlers see it.
        if (this.catchContinueQueued || pressed) {
          this.catchContinueQueued = false;
          this.resetForNextCast('Ready to cast');
        }
        break;
      case 'result':
        this.resultTimer -= dt;
        if (pressed || hookPressed || castPressed || this.resultTimer <= 0) this.resetForNextCast('Ready for another cast');
        break;
      default:
        break;
    }
    this.updateWaterVisuals(dt);
  }

  startCast() {
    const maximumCastDistance = this.config.maximumCastDistance
      * (this.progression?.getModifier('castDistance') ?? 1);
    const distance = this.config.minimumCastDistance
      + this.charge * (maximumCastDistance - this.config.minimumCastDistance);
    const start = this.getRodTipPosition();
    const playerPosition = this.player.getPosition();
    const target = new pc.Vec3(
      playerPosition.x + this.aimDirection.x * distance,
      this.zone.surfaceY,
      playerPosition.z + this.aimDirection.z * distance
    );
    const landingZone = this.world.findFishingZoneAt(target);
    const duration = Math.max(
      this.config.minimumCastSeconds,
      distance * this.config.castSecondsPerMeter
    );
    this.cast = {
      start,
      target,
      landingZone,
      elapsed: 0,
      duration,
      arcHeight: 1.3 + distance * 0.18
    };
    this.bobberPosition.copy(start);
    this.bobberRoot.enabled = true;
    this.lineEntity.enabled = true;
    this.audio.cast();
    this.setState('casting', landingZone ? 'Cast away…' : 'That cast is headed for dry ground…');
  }

  updateCast(dt) {
    this.cast.elapsed += dt;
    const alpha = Math.min(1, this.cast.elapsed / this.cast.duration);
    this.bobberPosition.lerp(this.cast.start, this.cast.target, alpha);
    this.bobberPosition.y += Math.sin(alpha * Math.PI) * this.cast.arcHeight;
    if (alpha < 1) return;

    this.bobberPosition.copy(this.cast.target);
    if (!this.cast.landingZone || this.cast.landingZone.id !== this.zone.id) {
      this.lastFishingFailure = 'dry cast';
      this.audio.tone(145, 0.11);
      this.resultTimer = 0.9;
      this.setState('result', 'Dry cast — the line reset cleanly');
      this.lineEntity.enabled = false;
      return;
    }

    this.audio.splash();
    this.triggerRipple(this.bobberPosition);
    const biteRate = (this.zone.modifiers.biteRate ?? 1)
      * (this.progression?.getModifier('biteRate') ?? 1);
    const biteDelayMultiplier = this.progression?.getModifier('biteDelayMultiplier') ?? 1;
    this.biteTimer = (
      this.config.biteDelayMinimum
      + this.rng() * (this.config.biteDelayMaximum - this.config.biteDelayMinimum)
    ) / biteRate * biteDelayMultiplier;
    this.setState('waiting', 'Watch the bobber…');
  }

  updateWaiting(dt) {
    this.biteTimer -= dt;
    this.bobberPosition.y = this.zone.surfaceY + 0.03 + Math.sin(this.visualTime * 3.1) * 0.025;
    if (this.biteTimer <= 0) this.beginBite();
  }

  getSelectionModifiers(ecology, includeRecent = true, zone = this.zone) {
    const equipment = this.progression?.getModifiers?.() ?? {};
    return {
      ...zone?.modifiers,
      rarityTier: ecology.habitat.rarityTier,
      rareWeightMultiplier: equipment.rareWeightMultiplier ?? 1,
      legendaryWeightMultiplier: equipment.legendaryWeightMultiplier ?? 1,
      nonFishWeightMultiplier: equipment.nonFishWeightMultiplier ?? 1,
      shinyChanceMultiplier: equipment.shinyChanceMultiplier ?? 1,
      specimenSizeBias: equipment.specimenSizeBias ?? 0,
      recentSpeciesIds: includeRecent ? this.recentHookSpecies : [],
      habitatWeights: ecology.habitatWeights,
      disablePoolEnrichment: true
    };
  }

  beginBite(forcedSpeciesId = null) {
    this.lastFishingFailure = null;
    const ecology = getEcologySelection(this.zone, this.cast?.target ?? this.zone.center);
    const candidateIds = forcedSpeciesId ? [forcedSpeciesId] : ecology.fishIds;
    const selectionModifiers = this.getSelectionModifiers(ecology, !forcedSpeciesId);
    const selectionTable = getWeightedSpeciesTable(candidateIds, selectionModifiers);
    this.selectedFish = rollFish(
      candidateIds,
      selectionModifiers,
      this.rng
    );
    const selectedEntry = selectionTable.find(
      (entry) => (entry.fish.canonicalId ?? entry.fish.id) === this.selectedFish?.speciesId
    );
    this.selectionDebug = {
      habitat: ecology.habitat,
      candidatePoolSize: selectionTable.length,
      selectedWeight: selectedEntry?.selectionWeight ?? 0,
      selectedProbability: selectedEntry?.probability ?? 0
    };
    if (!forcedSpeciesId && this.selectedFish?.speciesId) {
      this.recentHookSpecies.unshift(this.selectedFish.runtimeSpeciesId ?? this.selectedFish.speciesId);
      this.recentHookSpecies.length = Math.min(this.recentHookSpecies.length, 4);
    }
    // Start decoding the selected species' 8-note recorded instrument while the bobber is biting.
    // In normal play this gives the browser the hook window + approach time to have samples ready.
    if (this.selectedFish?.rhythm.instrument !== 'handpan') {
      void this.audio.prepareInstrument(this.selectedFish?.rhythm.instrument);
    }
    void this.audio.prepareAccents();
    this.hookTimer = this.config.hookWindow;
    this.showHookTutorial = !this.hookTutorialSeen;
    if (this.showHookTutorial) {
      this.hookTutorialSeen = true;
      markHookTutorialSeen();
    }
    this.biteSplashTimer = 0;
    this.setState('bite', this.showHookTutorial ? 'Bobber down! Press ↓ to hook' : 'Watch the bobber…');
    this.triggerRipple(this.bobberPosition);
    this.audio.splash();
    this.audio.bite();
  }

  updateBite(dt, pressed) {
    this.hookTimer -= dt;
    this.biteSplashTimer -= dt;
    const side = new pc.Vec3(-this.aimDirection.z, 0, this.aimDirection.x);
    const kick = Math.sin(this.stateTime * 27) * Math.max(0, 1 - this.stateTime / this.config.hookWindow);
    const waterPoint = this.zone.clampToWater({
      x: this.cast.target.x + side.x * kick * .24,
      z: this.cast.target.z + side.z * kick * .24
    });
    this.bobberPosition.set(
      waterPoint.x,
      this.zone.surfaceY - .27 - Math.abs(Math.sin(this.stateTime * 18)) * .08,
      waterPoint.z
    );
    if (this.biteSplashTimer <= 0) {
      this.biteSplashTimer = .3;
      this.triggerRipple(this.bobberPosition);
    }
    if (pressed) {
      this.showHookTutorial = false;
      this.audio.hook();
      this.beginRhythmIntro();
    } else if (this.hookTimer <= 0) {
      this.lastFishingFailure = 'missed hook window';
      this.showHookTutorial = false;
      this.selectedFish = null;
      this.resultTimer = this.config.resultHoldSeconds;
      this.setState('result', 'Too slow — the fish slipped the hook');
      this.audio.tone(130, 0.14);
    }
  }

  beginRhythmIntro() {
    // Hook input is the user gesture that unlocks WebAudio. The UI receives no readiness
    // message, but the chart clock is not created until AudioContext resume has resolved.
    const token = ++this.rhythmStartupToken;
    const fish = this.selectedFish;
    this.player.input.endRhythmCapture();
    this.setState('rhythm-starting', "Match the fish's movements!");
    this.rhythmStartup = this.audio.prepareForRhythm(fish?.rhythm.instrument)
      .then((readiness) => {
        if (token !== this.rhythmStartupToken || this.state !== 'rhythm-starting'
          || this.selectedFish !== fish) return;
        this.startRhythmSession(readiness);
      })
      .catch(() => {
        if (token !== this.rhythmStartupToken || this.state !== 'rhythm-starting'
          || this.selectedFish !== fish) return;
        this.startRhythmSession({ ready: false, leadSeconds: .045, audioStartTime: null });
      });
  }

  startRhythmSession(readiness = {}) {
    if (!['bite', 'rhythm-starting'].includes(this.state) || !this.selectedFish) return;
    this.player.input.beginRhythmCapture();
    const startTime = performance.now() / 1000 + Math.max(.02, readiness.leadSeconds ?? .045);
    this.rhythm = new RhythmSession(
      this.selectedFish,
      startTime,
      this.rng,
      undefined,
      {
        successWindowMultiplier: this.progression?.getModifier('successWindowMultiplier') ?? 1,
        tempoMultiplier: this.progression?.getModifier('tempoMultiplier') ?? 1,
        mistakeAllowanceMultiplier: this.progression?.getModifier('mistakeAllowanceMultiplier') ?? 1,
        reelGain: this.progression?.getModifier('reelGain') ?? 1,
        escapeGain: this.progression?.getModifier('escapeGain') ?? 1
      }
    );
    this.rhythmDebugAttempt = this.rhythm.getDebugState();
    this.rhythmStartup = null;
      this.performanceEncounterSequence += 1;
      this.activePerformanceEncounter = {
        id: `fight-${this.performanceEncounterSequence}`,
        sequence: this.performanceEncounterSequence,
        startedAt: Date.now(),
        location: this.getPerformanceLocation()
      };
      this.activePerformanceRecorded = false;
      this.lastRhythmBeat = -1;
      this.lastJudgmentTime = -1;
      this.setState('rhythm', "Match the fish's movements!");
      this.audio.tone(410, 0.09);
  }

  updateRhythm() {
    const now = performance.now() / 1000;
    const inputs = this.player.input.consumeRhythmInputs();
    this.rhythmInputFeedbackBatch = [];
    const result = this.rhythm.update(
      now,
      inputs,
      (lane) => this.player.input.isRhythmLaneHeld(lane)
    );
    for (const feedback of this.rhythm.consumeInputFeedbackEvents()) {
      this.rhythmInputSerial += 1;
      this.rhythmInputFeedback = { ...feedback, serial: this.rhythmInputSerial };
      this.rhythmInputFeedbackBatch.push(this.rhythmInputFeedback);
    }
    this.rhythmDebugAttempt = this.rhythm.getDebugState();
    if (this.rhythm.beatIndex !== this.lastRhythmBeat) {
      this.lastRhythmBeat = this.rhythm.beatIndex;
      this.audio.beat(this.lastRhythmBeat % 4 === 0);
    }
    // Correct hits are queued individually. Chart normalization guarantees these events are
    // sequential, including notes that were authored as chords or directly after a hold tail.
    for (const noteEvent of this.rhythm.consumeAudioEvents()) {
      this.audio.rhythmHit(this.selectedFish, noteEvent.degree, noteEvent.perfect);
    }

    if (this.rhythm.judgmentTime !== this.lastJudgmentTime) {
      this.lastJudgmentTime = this.rhythm.judgmentTime;
      if (this.rhythm.judgment === 'MISS' || this.rhythm.judgment === 'OFF BEAT') {
        this.audio.rhythmMiss();
        this.triggerRipple(this.bobberPosition);
      }
      if (this.rhythm.nearLoss && !this.nearLossWarned) {
        this.nearLossWarned = true;
        this.audio.danger();
      }
    }

    const side = new pc.Vec3(-this.aimDirection.z, 0, this.aimDirection.x);
    const nearLoss = this.rhythm.nearLoss;
    const intensity = 0.18 + this.rhythm.escapeProgress * 0.48 + (nearLoss ? .24 : 0);
    const thrashSpeed = nearLoss ? 13 : 7.5;
    const movement = side.mulScalar(Math.sin(this.visualTime * thrashSpeed) * intensity);
    movement.add(this.aimDirection.clone().mulScalar((1 - this.rhythm.progress) * 0.2));
    const waterPoint = this.zone.clampToWater({
      x: this.cast.target.x + movement.x,
      z: this.cast.target.z + movement.z
    });
    this.bobberPosition.set(
      waterPoint.x,
      this.zone.surfaceY - intensity * 0.08 + Math.sin(this.visualTime * 9) * 0.025,
      waterPoint.z
    );
    if (Math.sin(this.visualTime * (nearLoss ? 17 : 10)) > (nearLoss ? .82 : .96)) {
      this.triggerRipple(this.bobberPosition);
    }
    if (result === 'caught') this.landCatch();
    if (result === 'escaped') {
      this.loseFish('The fish broke the rhythm and escaped', this.rhythm.getFailureReason());
    }
  }

  landCatch() {
    this.player.input.endRhythmCapture();
    const perfectSong = this.rhythm?.perfectPerformance ?? false;
    const qualityRank = { GOOD: 1, GREAT: 2, PERFECT: 3 };
    const earnedQuality = this.rhythm?.quality ?? 'GOOD';
    const minimumQuality = this.progression?.getModifier('minimumSuccessfulQuality');
    const quality = (qualityRank[minimumQuality] ?? 0) > (qualityRank[earnedQuality] ?? 0)
      ? minimumQuality
      : earnedQuality;
    this.recordPerformanceEncounter('caught', quality);
    const caughtFish = createCatchRecord(this.selectedFish, this.zone, quality);
    const ownership = this.progression?.captureCatch(caughtFish) ?? { ok: false, value: null, specimen: null };
    const previousBest = this.bestBySpecies.get(this.selectedFish.speciesId);
    const newSpecies = !this.seenSpecies.has(this.selectedFish.speciesId);
    const newRecord = !previousBest
      || this.selectedFish.weight > previousBest.weight
      || this.selectedFish.length > previousBest.length;
    this.bestBySpecies.set(this.selectedFish.speciesId, {
      weight: Math.max(previousBest?.weight ?? 0, this.selectedFish.weight),
      length: Math.max(previousBest?.length ?? 0, this.selectedFish.length)
    });
    this.seenSpecies.add(this.selectedFish.speciesId);
    this.catchHistory.push(caughtFish);
    const showRecastHint = !this.hasShownRecastHint;
    this.hasShownRecastHint = true;
    this.catchCard = {
      ...caughtFish,
      value: ownership.value,
      specimenId: ownership.specimen?.specimenId ?? null,
      addedToInventory: Boolean(ownership?.ok && ownership?.specimen),
      newRecord,
      newSpecies,
      perfectSong,
      showRecastHint
    };
    // End the rhythm state before catch presentation so the challenge panel cannot cover the fish.
    this.rhythmDebugAttempt = this.rhythm?.getDebugState() ?? this.rhythmDebugAttempt;
    this.rhythm = null;
    this.resultTimer = 0;
    this.catchContinueQueued = false;
    this.setState('caught', ownership?.ok ? 'Added to Inventory • press any arrow to continue' : 'Catch landed • press any arrow to continue');
    this.rodRoot.enabled = false;
    this.lineEntity.enabled = false;
    this.bobberRoot.enabled = false;
    this.showCaughtFish();
    this.audio.success(perfectSong);
  }

  loseFish(message, failureReason = this.rhythm?.getFailureReason() ?? 'fish escaped') {
    this.lastFishingFailure = failureReason;
    this.recordPerformanceEncounter('escaped');
    this.player.input.endRhythmCapture();
    this.selectedFish = null;
    this.rhythmDebugAttempt = this.rhythm?.getDebugState() ?? this.rhythmDebugAttempt;
    this.rhythm = null;
    this.rhythmStartup = null;
    this.showHookTutorial = false;
    this.resultTimer = this.config.resultHoldSeconds;
    this.setState('result', message);
    this.lineEntity.enabled = false;
    this.bobberRoot.enabled = false;
    this.audio.tone(115, 0.18);
  }


  resetForNextCast(message) {
    this.recordPerformanceEncounter('cancelled');
    this.selectedFish = null;
    this.player.input.endRhythmCapture();
    this.rhythm = null;
    this.catchCard = null;
    this.cast = null;
    this.charge = 0;
    this.castInputHeld = this.player.input.fishingCastHeld;
    this.nearLossWarned = false;
    this.catchFish.enabled = false;
    this.rodRoot.enabled = true;
    this.hideWaterVisuals();
    this.showIdleLine();
    this.setState('ready', message);
  }

  setActiveCatchRig(key) {
    const resolved = this.catchCreatureRigs?.[key] ? key : 'fish';
    for (const [rigKey, root] of Object.entries(this.catchCreatureRigs ?? {})) root.enabled = rigKey === resolved;
    return resolved;
  }

  configureCaughtCreature(fish, displayedLength, girth, width, bodyLength) {
    const archetype = fish.visual.archetype;
    const fishArchetypes = new Set(['slender', 'bass', 'catfish', 'trout']);
    const deepFishArchetypes = new Set(['panfish', 'carp', 'flatfish', 'sculpin']);
    const rig = fishArchetypes.has(archetype) ? 'fish'
      : deepFishArchetypes.has(archetype) ? 'deepfish'
        : archetype;
    this.setActiveCatchRig(rig);
    // Eye primitives used to keep their constructor size even when a tiny specimen shrank,
    // producing the giant googly-eye bug. Scale every eye from the held creature dimensions.
    const eyeSize = Math.max(.006, Math.min(displayedLength * .045, Math.max(.008, girth * .18), Math.max(.008, width * .18)));
    const scaleEyes = (eyes, multiplier = 1) => {
      for (const eye of eyes ?? []) eye.setLocalScale(eyeSize * multiplier, eyeSize * multiplier, eyeSize * .8 * multiplier);
    };

    // Every specialized archetype now preserves its authored child transforms. Size variation
    // changes only the three root axes, so specimens get longer or bulkier without morphing
    // appendage placement or opening seams between disconnected child formulas.
    const stableBounds = STABLE_RIG_BOUNDS[rig];
    if (stableBounds) {
      const root = this.catchCreatureRigs[rig];
      // Non-fish rigs already encode their family's natural proportions. Actual catch length
      // therefore sets a UNIFORM baseline scale from the authored X extent. Weight condition
      // only makes that fixed silhouette moderately thicker/thinner on Y/Z. The previous 6.9.2
      // code forced fish-derived absolute girth onto turtles/mammals/monsters and made them look
      // like stretched taffy; it also double-counted visual.lengthScale here.
      const uniformScale = Math.max(.035, displayedLength) / Math.max(.05, stableBounds[0]);
      const baseGirth = Math.max(.01, displayedLength * .24 * (fish.visual.depth ?? 1));
      const baseWidth = Math.max(.01, baseGirth * (fish.visual.width ?? 1));
      const girthCondition = clamp(girth / baseGirth, .72, 1.38);
      const widthCondition = clamp(width / baseWidth, .68, 1.46);
      root.setLocalScale(
        uniformScale,
        uniformScale * girthCondition,
        uniformScale * widthCondition
      );
      return;
    }

    // Fish families keep species/archetype silhouette differences, but specimen dimensions no
    // longer rewrite individual child transforms. Build the species' canonical one-unit shape,
    // then apply specimen length/condition only at the rig root.
    this.catchCreatureRigs[rig]?.setLocalScale(1, 1, 1);
    if (rig === 'fish') {
      const headScale = fish.visual.head;
      const canonicalDisplayed = 1;
      const canonicalBodyLength = canonicalDisplayed * .7 * fish.visual.lengthScale;
      const canonicalGirth = .24 * fish.visual.depth;
      const canonicalWidth = .24 * fish.visual.depth * fish.visual.width;
      this.catchFishBody.setLocalScale(canonicalBodyLength, canonicalGirth, canonicalWidth);
      this.catchFishHead.setLocalPosition(canonicalBodyLength * .42, 0, 0);
      this.catchFishHead.setLocalScale(canonicalDisplayed * .24 * headScale, canonicalGirth * .94, canonicalWidth * .96);
      this.catchFishTail.setLocalPosition(-canonicalBodyLength * .55, 0, 0);
      this.catchFishTail.setLocalScale(canonicalDisplayed * .2 * fish.visual.fin, canonicalGirth * .86, canonicalWidth * .22);
      this.catchFishDorsal.setLocalPosition(-canonicalBodyLength * .06, canonicalGirth * .51, 0);
      this.catchFishDorsal.setLocalScale(canonicalDisplayed * .16 * fish.visual.fin, canonicalGirth * .74, canonicalWidth * .17);
      this.catchFishSideFin.setLocalPosition(canonicalBodyLength * .12, -canonicalGirth * .08, canonicalWidth * .54);
      this.catchFishSideFin.setLocalScale(canonicalDisplayed * .11 * fish.visual.fin, canonicalGirth * .58, canonicalWidth * .18);
      this.catchFishStripe.setLocalScale(canonicalBodyLength * .58, Math.max(.025, canonicalGirth * .16), .012);
      this.catchFishStripe.setLocalPosition(0, 0, canonicalWidth * .51);
      const canonicalEye = Math.max(.012, Math.min(.04, canonicalGirth * .18, canonicalWidth * .18));
      for (const [index, eye] of this.catchFishEyes.entries()) {
        eye.setLocalPosition(canonicalBodyLength * .455, canonicalGirth * .09, 0);
        eye.setLocalScale(canonicalEye * 1.2, canonicalEye * 1.2, canonicalEye * .98);
      }
      attachEyePairToHead(this.catchFishEyes, this.catchFishHead);
      const isCatfish = archetype === 'catfish';
      for (const whisker of this.catchFishWhiskers) whisker.enabled = isCatfish;
      this.catchFishStripe.enabled = archetype === 'trout' || archetype === 'slender' || archetype === 'bass';
      this.catchFishDorsal.enabled = true;
      this.catchCreatureRigs.fish.setLocalScale(
        displayedLength,
        Math.max(.1, girth / Math.max(.001, canonicalGirth)),
        Math.max(.1, width / Math.max(.001, canonicalWidth))
      );
      return;
    }

    // Specialized rigs intentionally use the same overall displayedLength metric so a 30 in
    // crab and 30 in fish remain comparable in the player's hands, while their silhouettes do not.
    const rigScaleBoost = rig === 'plesiosaur' ? 1.18 : rig === 'cetacean' ? 1.08 : rig === 'sirenian' ? 1.08 : 1;
    const L = displayedLength * fish.visual.lengthScale * rigScaleBoost;
    const G = Math.max(.05, girth);
    const W = Math.max(.05, width);

    if (rig === 'deepfish') {
      const canonicalDisplayed = 1;
      const canonicalL = fish.visual.lengthScale;
      const canonicalG = .24 * fish.visual.depth;
      const canonicalW = .24 * fish.visual.depth * fish.visual.width;
      const flatness = archetype === 'flatfish' ? .62 : 1;
      const headBoost = archetype === 'sculpin' ? 1.24 : fish.visual.head;
      this.catchDeepFishBody.setLocalScale(canonicalL * .58, canonicalG * .88 * flatness, Math.max(canonicalW * .92, canonicalG * .5));
      this.catchDeepFishHead.setLocalPosition(canonicalL * .31, -canonicalG * .01, 0);
      this.catchDeepFishHead.setLocalScale(canonicalL * .25 * headBoost, canonicalG * .73 * flatness, Math.max(canonicalW * .76, canonicalG * .44));
      this.catchDeepFishJaw.setLocalPosition(canonicalL * .43, -canonicalG * .2 * flatness, 0);
      this.catchDeepFishJaw.setLocalScale(canonicalL * .17 * headBoost, Math.max(.009, canonicalG * .14), Math.max(canonicalW * .58, canonicalG * .28));
      this.catchDeepFishTail.setLocalPosition(-canonicalL * .43, 0, 0);
      this.catchDeepFishTail.setLocalScale(canonicalL * .2 * fish.visual.fin, canonicalG * .85, Math.max(canonicalW * .2, canonicalG * .1));
      this.catchDeepFishDorsals.forEach((dorsal, index) => {
        dorsal.setLocalPosition(canonicalL * (.08 - index * .13), canonicalG * .48 * flatness, 0);
        dorsal.setLocalScale(canonicalL * .1, canonicalG * (.54 - index * .06), Math.max(canonicalW * .13, canonicalG * .07));
      });
      this.catchDeepFishFins.forEach((fin, index) => {
        fin.setLocalPosition(canonicalL * .12, -canonicalG * .08, (index === 0 ? 1 : -1) * Math.max(canonicalW * .52, canonicalG * .3));
        fin.setLocalScale(canonicalL * .12, canonicalG * .56, Math.max(canonicalW * .13, canonicalG * .07));
      });
      const canonicalEye = Math.max(.012, Math.min(.04, canonicalG * .17, canonicalW * .17));
      for (const [index, eye] of this.catchDeepFishEyes.entries()) {
        eye.setLocalPosition(canonicalL * .36, canonicalG * .12 * flatness, 0);
        eye.setLocalScale(canonicalEye * 1.14, canonicalEye * 1.14, canonicalEye * .9);
      }
      attachEyePairToHead(this.catchDeepFishEyes, this.catchDeepFishHead);
      this.catchCreatureRigs.deepfish.setLocalScale(
        canonicalDisplayed * displayedLength,
        Math.max(.1, girth / Math.max(.001, canonicalG)),
        Math.max(.1, width / Math.max(.001, canonicalW))
      );
      return;
    }

    if (rig === 'mammal') {
      this.catchMammalBody.setLocalScale(L * .58, G * .72, Math.max(W * .82, G * .58));
      this.catchMammalHead.setLocalPosition(L * .32, G * .08, 0);
      this.catchMammalHead.setLocalScale(L * .22, G * .52, Math.max(W * .62, G * .46));
      this.catchMammalMuzzle.setLocalPosition(L * .45, G * .02, 0);
      this.catchMammalMuzzle.setLocalScale(L * .14, G * .26, Math.max(W * .34, G * .24));
      this.catchMammalTail.setLocalPosition(-L * .44, -G * .03, 0);
      this.catchMammalTail.setLocalScale(L * .16, G * .9, Math.max(W * .24, G * .17));
      for (const [index, ear] of this.catchMammalEars.entries()) {
        ear.setLocalPosition(L * .29, G * .34, (index === 0 ? 1 : -1) * Math.max(W * .24, G * .16));
        ear.setLocalScale(L * .065, G * .18, Math.max(W * .13, G * .1));
      }
      this.catchMammalLegs.forEach((leg, index) => {
        const side = index % 2 ? 1 : -1;
        const front = index >= 2;
        leg.setLocalPosition(L * (front ? .16 : -.18), -G * .24, side * Math.max(W * .32, G * .22));
        leg.setLocalScale(L * .18, Math.max(.01, G * .11), Math.max(.01, G * .09));
      });
      for (const [index, eye] of this.catchMammalEyes.entries()) eye.setLocalPosition(L * .38, G * .14, (index === 0 ? 1 : -1) * Math.max(W * .3, G * .21));
      scaleEyes(this.catchMammalEyes, .95);
      return;
    }

    if (rig === 'pinniped') {
      this.catchPinnipedBody.setLocalScale(L * .66, G * .78, Math.max(W * .84, G * .62));
      this.catchPinnipedHead.setLocalPosition(L * .34, G * .06, 0);
      this.catchPinnipedHead.setLocalScale(L * .23, G * .55, Math.max(W * .62, G * .46));
      this.catchPinnipedMuzzle.setLocalPosition(L * .46, 0, 0);
      this.catchPinnipedMuzzle.setLocalScale(L * .14, G * .25, Math.max(W * .36, G * .25));
      for (const [index, flipper] of this.catchPinnipedFrontFlippers.entries()) {
        flipper.setLocalPosition(L * .08, -G * .18, (index === 0 ? 1 : -1) * Math.max(W * .54, G * .38));
        flipper.setLocalScale(L * .15, G * .62, Math.max(W * .13, G * .09));
      }
      for (const [index, flipper] of this.catchPinnipedRearFlippers.entries()) {
        flipper.setLocalPosition(-L * .48, -G * .01, (index === 0 ? 1 : -1) * Math.max(W * .18, G * .12));
        flipper.setLocalScale(L * .14, G * .55, Math.max(W * .14, G * .1));
      }
      for (const [index, eye] of this.catchPinnipedEyes.entries()) eye.setLocalPosition(L * .4, G * .13, (index === 0 ? 1 : -1) * Math.max(W * .3, G * .22));
      scaleEyes(this.catchPinnipedEyes, .95);
      return;
    }

    if (rig === 'cetacean') {
      this.catchCetaceanBody.setLocalScale(L * .74, G * .72, Math.max(W * .78, G * .56));
      this.catchCetaceanHead.setLocalPosition(L * .35, 0, 0);
      this.catchCetaceanHead.setLocalScale(L * .26, G * .63, Math.max(W * .72, G * .5));
      this.catchCetaceanSnout.setLocalPosition(L * .49, -G * .03, 0);
      this.catchCetaceanSnout.setLocalScale(L * .19, G * .22, Math.max(W * .36, G * .24));
      this.catchCetaceanDorsal.setLocalPosition(-L * .08, G * .57, 0);
      this.catchCetaceanDorsal.setLocalScale(L * .14, G * .72, Math.max(W * .18, G * .12));
      for (const [index, fin] of this.catchCetaceanPectorals.entries()) {
        fin.setLocalPosition(L * .06, -G * .08, (index === 0 ? 1 : -1) * Math.max(W * .58, G * .42));
        fin.setLocalScale(L * .14, G * .68, Math.max(W * .13, G * .09));
      }
      for (const [index, fluke] of this.catchCetaceanFlukes.entries()) {
        fluke.setLocalPosition(-L * .48, 0, (index === 0 ? 1 : -1) * Math.max(W * .16, G * .12));
        fluke.setLocalScale(L * .14, G * .7, Math.max(W * .15, G * .1));
      }
      for (const [index, eye] of this.catchCetaceanEyes.entries()) eye.setLocalPosition(L * .38, G * .08, (index === 0 ? 1 : -1) * Math.max(W * .34, G * .24));
      scaleEyes(this.catchCetaceanEyes, .75);
      return;
    }

    if (rig === 'sirenian') {
      this.catchSirenianBody.setLocalScale(L * .66, G * .9, Math.max(W * .9, G * .68));
      this.catchSirenianHead.setLocalPosition(L * .33, G * .05, 0);
      this.catchSirenianHead.setLocalScale(L * .24, G * .65, Math.max(W * .68, G * .5));
      this.catchSirenianMuzzle.setLocalPosition(L * .44, -G * .01, 0);
      this.catchSirenianMuzzle.setLocalScale(L * .15, G * .3, Math.max(W * .4, G * .28));
      for (const [index, fin] of this.catchSirenianFlippers.entries()) {
        fin.setLocalPosition(L * .05, -G * .14, (index === 0 ? 1 : -1) * Math.max(W * .56, G * .4));
        fin.setLocalScale(L * .14, G * .6, Math.max(W * .13, G * .09));
      }
      this.catchSirenianTail.setLocalPosition(-L * .47, 0, 0);
      this.catchSirenianTail.setLocalScale(L * .2, Math.max(.025, G * .18), Math.max(W * .8, G * .55));
      for (const [index, eye] of this.catchSirenianEyes.entries()) eye.setLocalPosition(L * .37, G * .12, (index === 0 ? 1 : -1) * Math.max(W * .3, G * .22));
      scaleEyes(this.catchSirenianEyes, .72);
      return;
    }

    if (rig === 'turtle') {
      this.catchTurtleShell.setLocalScale(L * .48, G * .56, Math.max(W * 1.04, L * .34));
      this.catchTurtlePlastron.setLocalPosition(-L * .03, -G * .22, 0);
      this.catchTurtlePlastron.setLocalScale(L * .42, G * .28, Math.max(W * .9, L * .29));
      this.catchTurtleHead.setLocalPosition(L * .35, 0, 0);
      this.catchTurtleHead.setLocalScale(L * .17, G * .34, Math.max(W * .42, G * .3));
      this.catchTurtleLimbs.forEach((limb, index) => {
        const side = index % 2 ? 1 : -1;
        const front = index >= 2;
        limb.setLocalPosition(L * (front ? .16 : -.2), -G * .03, side * Math.max(W * .58, L * .22));
        limb.setLocalScale(L * .12, G * .55, Math.max(W * .13, G * .09));
      });
      this.catchTurtleTail.setLocalPosition(-L * .4, -G * .02, 0);
      this.catchTurtleTail.setLocalScale(L * .08, G * .34, Math.max(W * .12, G * .08));
      for (const [index, eye] of this.catchTurtleEyes.entries()) eye.setLocalPosition(L * .39, G * .07, (index === 0 ? 1 : -1) * Math.max(W * .22, G * .16));
      scaleEyes(this.catchTurtleEyes, .72);
      return;
    }

    if (rig === 'frog') {
      this.catchFrogBody.setLocalScale(L * .38, G * .62, Math.max(W * .75, G * .55));
      this.catchFrogHead.setLocalPosition(L * .2, G * .04, 0);
      this.catchFrogHead.setLocalScale(L * .25, G * .54, Math.max(W * .72, G * .52));
      for (const [index, leg] of this.catchFrogHindLegs.entries()) {
        leg.setLocalPosition(-L * .18, -G * .2, (index === 0 ? 1 : -1) * Math.max(W * .46, G * .34));
        leg.setLocalScale(L * .32, Math.max(.01, G * .12), Math.max(.01, G * .1));
      }
      for (const [index, leg] of this.catchFrogForelegs.entries()) {
        leg.setLocalPosition(L * .1, -G * .16, (index === 0 ? 1 : -1) * Math.max(W * .34, G * .26));
        leg.setLocalScale(L * .19, Math.max(.009, G * .1), Math.max(.009, G * .085));
      }
      for (const [index, eye] of this.catchFrogEyes.entries()) eye.setLocalPosition(L * .23, G * .26, (index === 0 ? 1 : -1) * Math.max(W * .28, G * .22));
      scaleEyes(this.catchFrogEyes, 1.15);
      return;
    }

    if (rig === 'starfish') {
      this.catchStarCenter.setLocalScale(L * .18, Math.max(.018, G * .18), Math.max(W * .38, L * .15));
      this.catchStarArms.forEach((arm, index) => {
        const angle = index * Math.PI * 2 / 5;
        arm.setLocalPosition(Math.cos(angle) * L * .12, 0, Math.sin(angle) * Math.max(W * .22, L * .12));
        arm.setLocalScale(L * .11, Math.max(W * .42, L * .2), Math.max(.012, G * .1));
      });
      return;
    }

    if (rig === 'urchin') {
      const core = Math.max(L * .25, W * .36);
      this.catchUrchinCore.setLocalScale(core, core * .78, core);
      this.catchUrchinSpines.forEach((spine, index) => {
        const angle = index * Math.PI * 2 / this.catchUrchinSpines.length;
        spine.setLocalPosition(Math.cos(angle) * core * .22, (index % 2 ? 1 : -1) * core * .1, Math.sin(angle) * core * .22);
        spine.setLocalScale(Math.max(.01, core * .1), core * .75, Math.max(.01, core * .1));
      });
      return;
    }

    if (rig === 'nautilus') {
      this.catchNautilusShell.setLocalScale(L * .34, G * .78, Math.max(W * .8, G * .6));
      this.catchNautilusHead.setLocalPosition(L * .18, -G * .02, 0);
      this.catchNautilusHead.setLocalScale(L * .18, G * .38, Math.max(W * .48, G * .34));
      this.catchNautilusTentacles.forEach((tentacle, index) => {
        const side = index % 2 ? 1 : -1;
        const band = Math.floor(index / 2);
        tentacle.setLocalPosition(L * .28, -G * (.1 - band * .035), side * Math.max(W * (.08 + band * .05), G * (.06 + band * .04)));
        tentacle.setLocalScale(L * (.24 + band * .03), Math.max(.006, G * .035), Math.max(.006, G * .035));
      });
      for (const [index, eye] of this.catchNautilusEyes.entries()) eye.setLocalPosition(L * .22, G * .03, (index === 0 ? 1 : -1) * Math.max(W * .22, G * .16));
      scaleEyes(this.catchNautilusEyes, .72);
      return;
    }

    if (rig === 'waterhorse') {
      this.catchWaterhorseBody.setLocalScale(L * .52, G * .68, Math.max(W * .72, G * .52));
      this.catchWaterhorseNeck.setLocalPosition(L * .14, G * .16, 0);
      this.catchWaterhorseNeck.setLocalScale(L * .18, G * .78, Math.max(W * .45, G * .32));
      this.catchWaterhorseHead.setLocalPosition(L * .29, G * .28, 0);
      this.catchWaterhorseHead.setLocalScale(L * .21, G * .4, Math.max(W * .48, G * .34));
      this.catchWaterhorseMuzzle.setLocalPosition(L * .4, G * .25, 0);
      this.catchWaterhorseMuzzle.setLocalScale(L * .15, G * .2, Math.max(W * .3, G * .21));
      this.catchWaterhorseLegs.forEach((leg, index) => {
        const side = index % 2 ? 1 : -1;
        const front = index >= 2;
        leg.setLocalPosition(L * (front ? .12 : -.18), -G * .22, side * Math.max(W * .3, G * .22));
        leg.setLocalScale(L * .25, Math.max(.009, G * .09), Math.max(.009, G * .075));
      });
      this.catchWaterhorseTail.setLocalPosition(-L * .42, G * .03, 0);
      this.catchWaterhorseTail.setLocalScale(L * .15, G * .82, Math.max(W * .2, G * .14));
      for (const [index, eye] of this.catchWaterhorseEyes.entries()) eye.setLocalPosition(L * .32, G * .34, (index === 0 ? 1 : -1) * Math.max(W * .22, G * .16));
      scaleEyes(this.catchWaterhorseEyes, .8);
      return;
    }

    if (rig === 'serpent') {
      this.catchSerpentSegments.forEach((segment, index) => {
        const t = index / Math.max(1, this.catchSerpentSegments.length - 1);
        segment.setLocalPosition(L * (.26 - t * .68), Math.sin(t * Math.PI * 1.7) * G * .16, Math.cos(t * Math.PI * 1.2) * W * .04);
        segment.setLocalScale(L * (.16 - t * .045), G * (.34 - t * .08), Math.max(W * (.44 - t * .08), G * .22));
      });
      this.catchSerpentHead.setLocalPosition(L * .31, G * .03, 0);
      this.catchSerpentHead.setLocalScale(L * .2, G * .44, Math.max(W * .56, G * .38));
      this.catchSerpentCrest.setLocalPosition(L * .26, G * .22, 0);
      this.catchSerpentCrest.setLocalScale(L * .08, G * .42, Math.max(W * .12, G * .08));
      for (const [index, eye] of this.catchSerpentEyes.entries()) eye.setLocalPosition(L * .37, G * .09, (index === 0 ? 1 : -1) * Math.max(W * .25, G * .18));
      scaleEyes(this.catchSerpentEyes, .72);
      return;
    }

    if (rig === 'dragon') {
      this.catchDragonSegments.forEach((segment, index) => {
        const t = index / Math.max(1, this.catchDragonSegments.length - 1);
        segment.setLocalPosition(L * (.2 - t * .72), Math.sin(t * Math.PI * 2.05) * G * .24, Math.cos(t * Math.PI * 1.55) * W * .08);
        segment.setLocalScale(L * (.145 - t * .052), G * (.42 - t * .14), Math.max(W * (.5 - t * .14), G * .24));
      });
      this.catchDragonHead.setLocalPosition(L * .31, G * .09, 0);
      this.catchDragonHead.setLocalScale(L * .21, G * .54, Math.max(W * .64, G * .42));
      this.catchDragonMuzzle.setLocalPosition(L * .43, G * .035, 0);
      this.catchDragonMuzzle.setLocalScale(L * .18, G * .22, Math.max(W * .5, G * .3));
      this.catchDragonJaw.setLocalPosition(L * .42, -G * .105, 0);
      this.catchDragonJaw.setLocalScale(L * .165, G * .13, Math.max(W * .45, G * .27));
      this.catchDragonHorns.forEach((horn, index) => {
        horn.setLocalPosition(L * .26, G * .39, (index === 0 ? 1 : -1) * Math.max(W * .3, G * .2));
        horn.setLocalScale(L * .06, G * .48, Math.max(W * .1, G * .07));
      });
      this.catchDragonSpines.forEach((spine, index) => {
        const t = index / Math.max(1, this.catchDragonSpines.length - 1);
        spine.setLocalPosition(L * (.2 - t * .48), G * (.36 + Math.sin(t * Math.PI) * .08), 0);
        spine.setLocalScale(L * (.07 - t * .015), G * (.46 - t * .12), Math.max(W * .1, G * .06));
      });
      this.catchDragonFins.forEach((fin, index) => {
        fin.setLocalPosition(L * .08, -G * .05, (index === 0 ? 1 : -1) * Math.max(W * .52, G * .36));
        fin.setLocalScale(L * .14, G * .72, Math.max(W * .14, G * .09));
      });
      this.catchDragonLimbs.forEach((limb, index) => {
        const side = index % 2 ? 1 : -1;
        const front = index >= 2;
        limb.setLocalPosition(L * (front ? .08 : -.2), -G * .22, side * Math.max(W * .34, G * .24));
        limb.setLocalScale(L * .21, Math.max(.01, G * .09), Math.max(.01, G * .075));
      });
      this.catchDragonTailFan.setLocalPosition(-L * .57, 0, 0);
      this.catchDragonTailFan.setLocalScale(L * .15, G * .76, Math.max(W * .2, G * .12));
      for (const [index, eye] of this.catchDragonEyes.entries()) {
        eye.setLocalPosition(L * .35, G * .17, (index === 0 ? 1 : -1) * Math.max(W * .3, G * .2));
      }
      scaleEyes(this.catchDragonEyes, .75);
      return;
    }

    if (rig === 'plesiosaur') {
      this.catchPlesiosaurBody.setLocalScale(L * .48, G * .62, Math.max(W * .72, G * .52));
      this.catchPlesiosaurNeck.forEach((segment, index) => {
        segment.setLocalPosition(L * (.08 + index * .08), G * (.08 + index * .08), 0);
        segment.setLocalScale(L * .13, G * .28, Math.max(W * .33, G * .23));
      });
      this.catchPlesiosaurHead.setLocalPosition(L * .38, G * .3, 0);
      this.catchPlesiosaurHead.setLocalScale(L * .18, G * .32, Math.max(W * .42, G * .3));
      this.catchPlesiosaurFlippers.forEach((flipper, index) => {
        const side = index % 2 ? 1 : -1;
        const front = index >= 2;
        flipper.setLocalPosition(L * (front ? .06 : -.2), -G * .1, side * Math.max(W * .5, G * .36));
        flipper.setLocalScale(L * .13, G * .58, Math.max(W * .13, G * .09));
      });
      this.catchPlesiosaurTail.setLocalPosition(-L * .42, G * .01, 0);
      this.catchPlesiosaurTail.setLocalScale(L * .14, G * .64, Math.max(W * .19, G * .13));
      for (const [index, eye] of this.catchPlesiosaurEyes.entries()) eye.setLocalPosition(L * .42, G * .36, (index === 0 ? 1 : -1) * Math.max(W * .22, G * .16));
      scaleEyes(this.catchPlesiosaurEyes, .7);
      return;
    }

    if (rig === 'shark') {
      this.catchSharkBody.setLocalScale(L * .72, G * .78, W * .82);
      this.catchSharkHead.setLocalPosition(L * .31, 0, 0);
      this.catchSharkHead.setLocalScale(L * .26, G * .72, W * .84);
      this.catchSharkSnout.setLocalPosition(L * .44, -.01, 0);
      this.catchSharkSnout.setLocalScale(L * .1, G * .46, W * .58);
      this.catchSharkDorsal.setLocalPosition(-L * .08, G * .62, 0);
      this.catchSharkDorsal.setLocalScale(L * .18, G * .9, W * .22);
      for (const [index, fin] of this.catchSharkPectorals.entries()) {
        fin.setLocalPosition(L * .08, -G * .07, (index === 0 ? 1 : -1) * W * .64);
        fin.setLocalScale(L * .15, G * .9, W * .18);
      }
      for (const [index, tail] of this.catchSharkTail.entries()) {
        tail.setLocalPosition(-L * .44, (index === 0 ? 1 : -1) * G * .2, 0);
        tail.setLocalScale(L * .16, G * (index === 0 ? .92 : .72), W * .24);
      }
      for (const [index, eye] of this.catchSharkEyes.entries()) eye.setLocalPosition(L * .34, G * .12, (index === 0 ? 1 : -1) * W * .52);
      scaleEyes(this.catchSharkEyes);
      return;
    }

    if (rig === 'ray') {
      this.catchRayDisc.setLocalScale(L * .48, Math.max(.035, G * .38), Math.max(W * 1.28, L * .42));
      this.catchRaySnout.setLocalPosition(L * .28, -G * .01, 0);
      this.catchRaySnout.setLocalScale(L * .1, Math.max(.04, G * .24), Math.max(W * .32, L * .08));
      this.catchRayTail.setLocalPosition(-L * .48, 0, 0);
      this.catchRayTail.setLocalScale(L * .78, Math.max(.012, G * .055), Math.max(.012, G * .055));
      for (const [index, eye] of this.catchRayEyes.entries()) eye.setLocalPosition(L * .12, Math.max(.025, G * .18), (index === 0 ? 1 : -1) * Math.max(W * .24, L * .08));
      scaleEyes(this.catchRayEyes, .9);
      return;
    }

    if (rig === 'eel') {
      this.catchEelSegments.forEach((segment, index) => {
        const t = index / Math.max(1, this.catchEelSegments.length - 1);
        segment.setLocalPosition(L * (.25 - t * .58), Math.sin(t * Math.PI * 1.1) * G * .08, 0);
        segment.setLocalScale(L * (.18 - t * .055), G * (.38 - t * .08), Math.max(W * (.55 - t * .1), G * .22));
      });
      this.catchEelHead.setLocalPosition(L * .31, 0, 0);
      this.catchEelHead.setLocalScale(L * .19, G * .43, Math.max(W * .58, G * .31));
      for (const [index, eye] of this.catchEelEyes.entries()) eye.setLocalPosition(L * .37, G * .08, (index === 0 ? 1 : -1) * Math.max(W * .26, G * .16));
      scaleEyes(this.catchEelEyes, .82);
      return;
    }

    if (rig === 'crab') {
      this.catchCrabShell.setLocalScale(L * .42, G * .5, Math.max(W * .82, L * .34));
      for (let index = 0; index < this.catchCrabClaws.length; index += 2) {
        const side = index === 0 ? 1 : -1;
        this.catchCrabClaws[index].setLocalPosition(L * .28, G * .01, side * Math.max(W * .5, L * .2));
        this.catchCrabClaws[index].setLocalScale(L * .19, G * .42, Math.max(W * .25, L * .12));
        this.catchCrabClaws[index + 1].setLocalPosition(L * .18, -G * .02, side * Math.max(W * .38, L * .16));
        this.catchCrabClaws[index + 1].setLocalScale(L * .29, Math.max(.015, G * .12), Math.max(.015, G * .12));
      }
      this.catchCrabLegs.forEach((leg, index) => {
        const side = Math.floor(index / 4) === 0 ? -1 : 1;
        const band = index % 4;
        leg.setLocalPosition(L * (.1 - band * .08), -G * .12, side * Math.max(W * (.34 + band * .05), L * (.16 + band * .028)));
        leg.setLocalScale(L * (.28 + band * .035), Math.max(.012, G * .07), Math.max(.012, G * .07));
      });
      for (const [index, eye] of this.catchCrabEyes.entries()) eye.setLocalPosition(L * .18, G * .2, (index === 0 ? 1 : -1) * Math.max(W * .18, L * .08));
      scaleEyes(this.catchCrabEyes, .75);
      return;
    }

    if (rig === 'horseshoe') {
      this.catchHorseshoeShell.setLocalScale(L * .46, G * .43, Math.max(W * .84, L * .36));
      this.catchHorseshoeRear.setLocalPosition(-L * .22, -G * .01, 0);
      this.catchHorseshoeRear.setLocalScale(L * .25, G * .34, Math.max(W * .58, L * .25));
      this.catchHorseshoeTail.setLocalPosition(-L * .52, 0, 0);
      this.catchHorseshoeTail.setLocalScale(L * .78, Math.max(.01, G * .045), Math.max(.01, G * .045));
      return;
    }

    if (rig === 'lobster') {
      this.catchLobsterSegments.forEach((segment, index) => {
        segment.setLocalPosition(L * (.16 - index * .11), Math.sin(index * .45) * G * .04, 0);
        segment.setLocalScale(L * (.2 - index * .008), G * (.42 - index * .025), Math.max(W * (.5 - index * .025), G * .34));
      });
      for (let index = 0; index < this.catchLobsterClaws.length; index += 2) {
        const side = index === 0 ? 1 : -1;
        this.catchLobsterClaws[index].setLocalPosition(L * .34, 0, side * Math.max(W * .34, L * .12));
        this.catchLobsterClaws[index].setLocalScale(L * .2, G * .4, Math.max(W * .32, G * .25));
        this.catchLobsterClaws[index + 1].setLocalPosition(L * .24, -G * .02, side * Math.max(W * .22, L * .08));
        this.catchLobsterClaws[index + 1].setLocalScale(L * .24, Math.max(.012, G * .09), Math.max(.012, G * .09));
      }
      this.catchLobsterTail.forEach((fan, index) => {
        fan.setLocalPosition(-L * .36, 0, (index - 1) * Math.max(W * .14, L * .045));
        fan.setLocalScale(L * .14, G * .34, Math.max(W * .14, G * .1));
      });
      for (const [index, antenna] of this.catchLobsterAntennae.entries()) {
        antenna.setLocalPosition(L * .56, G * .17, (index === 0 ? 1 : -1) * Math.max(W * .16, G * .13));
        antenna.setLocalScale(L * .58, Math.max(.006, G * .025), Math.max(.006, G * .025));
      }
      return;
    }

    if (rig === 'shrimp') {
      this.catchShrimpSegments.forEach((segment, index) => {
        const t = index / Math.max(1, this.catchShrimpSegments.length - 1);
        segment.setLocalPosition(L * (.24 - t * .54), Math.sin(t * Math.PI) * G * .12, 0);
        segment.setLocalScale(L * (.16 - t * .035), G * (.32 - t * .06), Math.max(W * (.52 - t * .08), G * .22));
      });
      for (const [index, fan] of this.catchShrimpTail.entries()) {
        fan.setLocalPosition(-L * .32, G * .03, (index === 0 ? 1 : -1) * Math.max(W * .14, G * .08));
        fan.setLocalScale(L * .12, G * .3, Math.max(W * .16, G * .08));
      }
      for (const [index, antenna] of this.catchShrimpAntennae.entries()) {
        antenna.setLocalPosition(L * .55, G * .2, (index === 0 ? 1 : -1) * Math.max(W * .12, G * .08));
        antenna.setLocalScale(L * .68, Math.max(.005, G * .02), Math.max(.005, G * .02));
      }
      return;
    }

    if (rig === 'octopus') {
      this.catchOctopusMantle.setLocalScale(L * .3, G * .72, Math.max(W * .72, G * .55));
      this.catchOctopusHead.setLocalPosition(L * .14, -G * .03, 0);
      this.catchOctopusHead.setLocalScale(L * .23, G * .48, Math.max(W * .62, G * .45));
      this.catchOctopusArms.forEach((arm, index) => {
        const side = index % 2 ? 1 : -1;
        const band = Math.floor(index / 2);
        arm.setLocalPosition(-L * (.02 + band * .03), -G * (.14 + band * .035), side * Math.max(W * (.08 + band * .06), G * (.08 + band * .05)));
        arm.setLocalScale(L * (.42 + band * .06), Math.max(.012, G * .065), Math.max(.012, G * .065));
      });
      for (const [index, eye] of this.catchOctopusEyes.entries()) eye.setLocalPosition(L * .22, G * .03, (index === 0 ? 1 : -1) * Math.max(W * .28, G * .22));
      scaleEyes(this.catchOctopusEyes, 1.05);
      return;
    }

    if (rig === 'squid') {
      this.catchSquidMantle.setLocalScale(L * .5, G * .52, Math.max(W * .62, G * .42));
      this.catchSquidTip.setLocalPosition(-L * .34, G * .01, 0);
      this.catchSquidTip.setLocalScale(L * .15, G * .48, Math.max(W * .52, G * .35));
      this.catchSquidHead.setLocalPosition(L * .18, 0, 0);
      this.catchSquidHead.setLocalScale(L * .22, G * .44, Math.max(W * .58, G * .4));
      for (const [index, fin] of this.catchSquidFins.entries()) {
        fin.setLocalPosition(-L * .16, G * .02, (index === 0 ? 1 : -1) * Math.max(W * .38, G * .24));
        fin.setLocalScale(L * .15, G * .48, Math.max(W * .15, G * .09));
      }
      this.catchSquidTentacles.forEach((tentacle, index) => {
        const side = index % 2 ? 1 : -1;
        const band = Math.floor(index / 2);
        tentacle.setLocalPosition(L * (.2 + band * .03), -G * (.08 - band * .01), side * Math.max(W * (.06 + band * .05), G * (.05 + band * .04)));
        tentacle.setLocalScale(L * (.38 + band * .1), Math.max(.009, G * .045), Math.max(.009, G * .045));
      });
      for (const [index, eye] of this.catchSquidEyes.entries()) eye.setLocalPosition(L * .24, G * .08, (index === 0 ? 1 : -1) * Math.max(W * .28, G * .22));
      scaleEyes(this.catchSquidEyes, 1.05);
      return;
    }

    if (rig === 'snail') {
      this.catchSnailFoot.setLocalScale(L * .5, G * .22, Math.max(W * .48, G * .35));
      this.catchSnailShell.setLocalPosition(-L * .02, G * .08, 0);
      this.catchSnailShell.setLocalScale(L * .34, G * .78, Math.max(W * .84, G * .64));
      this.catchSnailHead.setLocalPosition(L * .26, -G * .03, 0);
      this.catchSnailHead.setLocalScale(L * .16, G * .28, Math.max(W * .38, G * .28));
      for (const [index, stalk] of this.catchSnailStalks.entries()) {
        stalk.setLocalPosition(L * .33, G * .12, (index === 0 ? 1 : -1) * Math.max(W * .13, G * .1));
        stalk.setLocalScale(L * .2, Math.max(.005, G * .03), Math.max(.005, G * .03));
      }
      return;
    }

    if (rig === 'bivalve') {
      this.catchBivalveShell.setLocalScale(L * .42, Math.max(.035, G * .42), Math.max(W * .85, L * .34));
      this.catchBivalveLip.setLocalPosition(L * .01, -G * .02, 0);
      this.catchBivalveLip.setLocalScale(L * .36, Math.max(.02, G * .18), Math.max(W * .74, L * .29));
      this.catchBivalveHinge.setLocalPosition(-L * .25, G * .02, 0);
      this.catchBivalveHinge.setLocalScale(L * .12, Math.max(.01, G * .08), Math.max(W * .54, L * .18));
      return;
    }

    if (rig === 'salamander') {
      this.catchSalamanderBody.setLocalScale(L * .48, G * .4, Math.max(W * .55, G * .36));
      this.catchSalamanderHead.setLocalPosition(L * .28, G * .01, 0);
      this.catchSalamanderHead.setLocalScale(L * .22, G * .42, Math.max(W * .58, G * .4));
      this.catchSalamanderTail.setLocalPosition(-L * .38, G * .01, 0);
      this.catchSalamanderTail.setLocalScale(L * .17, G * .68, Math.max(W * .3, G * .2));
      this.catchSalamanderLegs.forEach((leg, index) => {
        const side = index % 2 ? 1 : -1;
        const front = index >= 2;
        leg.setLocalPosition(L * (front ? .16 : -.14), -G * .08, side * Math.max(W * .3, G * .22));
        leg.setLocalScale(L * .19, Math.max(.008, G * .055), Math.max(.008, G * .055));
      });
      for (const [index, eye] of this.catchSalamanderEyes.entries()) eye.setLocalPosition(L * .33, G * .1, (index === 0 ? 1 : -1) * Math.max(W * .28, G * .2));
      scaleEyes(this.catchSalamanderEyes, .9);
      return;
    }

    if (rig === 'jellyfish') {
      this.catchJellyBell.setLocalScale(L * .34, G * .68, Math.max(W * .72, G * .56));
      this.catchJellyRim.setLocalPosition(0, -G * .24, 0);
      this.catchJellyRim.setLocalScale(L * .3, Math.max(.015, G * .08), Math.max(W * .62, G * .46));
      this.catchJellyTentacles.forEach((tentacle, index) => {
        const lateral = (index - 2.5) / 2.5;
        tentacle.setLocalPosition(-L * (.04 + (index % 2) * .03), -G * .36, lateral * Math.max(W * .28, G * .2));
        tentacle.setLocalScale(L * (.36 + (index % 3) * .055), Math.max(.008, G * .04), Math.max(.008, G * .04));
      });
      return;
    }

    if (rig === 'insect') {
      this.catchInsectAbdomen.setLocalScale(L * .32, G * .38, Math.max(W * .48, G * .32));
      this.catchInsectThorax.setLocalPosition(L * .12, G * .01, 0);
      this.catchInsectThorax.setLocalScale(L * .21, G * .42, Math.max(W * .52, G * .36));
      this.catchInsectHead.setLocalPosition(L * .24, G * .01, 0);
      this.catchInsectHead.setLocalScale(L * .15, G * .34, Math.max(W * .4, G * .28));
      for (const [index, wing] of this.catchInsectWings.entries()) {
        wing.setLocalPosition(-L * .01, G * .16, (index === 0 ? 1 : -1) * Math.max(W * .22, G * .16));
        wing.setLocalScale(L * .32, Math.max(.01, G * .08), Math.max(W * .28, G * .18));
      }
      this.catchInsectLegs.forEach((leg, index) => {
        const side = Math.floor(index / 3) === 0 ? -1 : 1;
        const band = index % 3;
        leg.setLocalPosition(L * (.14 - band * .12), -G * .12, side * Math.max(W * .24, G * .18));
        leg.setLocalScale(L * .23, Math.max(.006, G * .045), Math.max(.006, G * .045));
      });
      return;
    }

    if (rig === 'softbody') {
      this.catchSoftBody.setLocalScale(L * .56, G * .56, Math.max(W * .62, G * .46));
      this.catchSoftNodules.forEach((nodule, index) => {
        const t = index / Math.max(1, this.catchSoftNodules.length - 1);
        nodule.setLocalPosition(L * (-.28 + t * .56), G * (.24 - Math.abs(t - .5) * .08), (index % 2 ? 1 : -1) * Math.max(W * .2, G * .14));
        nodule.setLocalScale(Math.max(.018, L * .045), Math.max(.018, G * .13), Math.max(.018, G * .13));
      });
      return;
    }

    if (rig === 'wisp') {
      this.catchWispCore.setLocalScale(L * .28, G * .62, Math.max(W * .62, G * .5));
      this.catchWispTrail.forEach((node, index) => {
        const scale = 1 - index * .2;
        node.setLocalPosition(-L * (.18 + index * .09), (index % 2 ? -1 : 1) * G * .08, (index % 2 ? -1 : 1) * Math.max(W * .09, G * .07));
        node.setLocalScale(L * .16 * scale, G * .32 * scale, Math.max(W * .32 * scale, G * .24 * scale));
      });
      return;
    }

    // Unknown future archetypes should fail gracefully as fish rather than disappearing.
    this.setActiveCatchRig('fish');
  }

  showCaughtFish() {
    const fish = this.selectedFish;
    const [bodyColor, accentColor] = fish.visual.colors;
    const shiny = fish.shiny;
    const body = shiny ? [Math.min(1, bodyColor[2] + .22), Math.min(1, bodyColor[0] + .28), Math.min(1, bodyColor[1] + .3)] : bodyColor;
    const accent = shiny ? [.95, .45, .88] : accentColor;
    this.fishBodyMaterial.diffuse.set(body[0], body[1], body[2]);
    this.fishAccentMaterial.diffuse.set(accent[0], accent[1], accent[2]);
    this.fishBodyMaterial.emissive.set(shiny ? .08 : 0, shiny ? .15 : 0, shiny ? .18 : 0);
    this.fishAccentMaterial.emissive.set(shiny ? .2 : 0, shiny ? .05 : 0, shiny ? .16 : 0);
    this.fishBodyMaterial.emissiveIntensity = shiny ? 1.6 : 1;
    this.fishAccentMaterial.emissiveIntensity = shiny ? 1.8 : 1;
    this.fishBodyMaterial.update();
    this.fishAccentMaterial.update();

    const displayMetrics = getFishDisplayMetrics(fish);
    const displayedLength = displayMetrics.displayedLength;
    const bodyLength = displayedLength * .7 * fish.visual.lengthScale;
    const girth = displayedLength * .24 * fish.visual.depth * displayMetrics.girthMultiplier;
    const width = displayedLength * .24 * fish.visual.depth * fish.visual.width
      * displayMetrics.widthMultiplier;
    this.configureCaughtCreature(fish, displayedLength, girth, width, bodyLength);

    this.catchFishSparkles.forEach((sparkle, index) => {
      sparkle.enabled = shiny;
      const spread = Math.max(width, girth, displayedLength * .18);
      sparkle.setLocalPosition((index % 3 - 1) * displayedLength * .32,
        (index % 2 ? 1 : -1) * Math.max(girth * .8, displayedLength * .12), spread * .9);
    });
    this.catchFish.enabled = true;
    this.updateCaughtVisual();
  }

  getCaughtRenderBounds() {
    this.catchFish.syncHierarchy();
    let bounds = null;
    for (const render of this.catchFish.findComponents('render')) {
      let enabled = render.enabled;
      for (let entity = render.entity; enabled && entity !== this.catchFish.parent; entity = entity.parent) {
        enabled = entity.enabled;
        if (!entity.parent) break;
      }
      if (!enabled) continue;
      for (const meshInstance of render.meshInstances ?? []) {
        if (meshInstance.visible === false) continue;
        if (!bounds) bounds = meshInstance.aabb.clone();
        else bounds.add(meshInstance.aabb);
      }
    }
    return bounds;
  }

  applyCaughtGroundClearance() {
    const bounds = this.getCaughtRenderBounds();
    if (!bounds) return 0;
    const topY = bounds.center.y + bounds.halfExtents.y + 2;
    const rayDistance = Math.max(12, bounds.halfExtents.y * 2 + 24);
    let highestGroundY = -Infinity;
    for (const point of catchGroundSamplePoints(bounds)) {
      const ray = new this.player.RAPIER.Ray(
        { x: point.x, y: topY, z: point.z },
        { x: 0, y: -1, z: 0 }
      );
      const hit = this.player.physicsWorld.castRay(
        ray, rayDistance, true, undefined, undefined, this.player.collider
      );
      if (hit) highestGroundY = Math.max(highestGroundY, topY - hit.timeOfImpact);
    }
    const lowestRenderedY = bounds.center.y - bounds.halfExtents.y;
    const lift = calculateCatchGroundLift(lowestRenderedY, highestGroundY);
    if (lift > 0) {
      const local = this.catchFish.getLocalPosition();
      this.catchFish.setLocalPosition(local.x, local.y + lift, local.z);
    }
    this.catchGroundLift = lift;
    return lift;
  }

  updateCaughtVisual() {
    const fish = this.selectedFish;
    const displayedLength = getFishDisplayMetrics(fish).displayedLength;
    const trophyOffset = Math.max(0, displayedLength - 1.25);
    const closeBoost = Math.max(0, 1.0 - displayedLength) * .55;
    const farBoost = Math.max(0, displayedLength - 1.9) * .25;
    this.catchFish.setLocalPosition(0, 0.48 + Math.sin(this.visualTime * 2.2) * 0.025, -0.95 + closeBoost - trophyOffset * .34 - farBoost);
    this.catchFish.setLocalEulerAngles(0, 0, Math.sin(this.visualTime * 3) * 4);
    this.applyCaughtGroundClearance();
    if (this.selectedFish?.shiny) {
      this.catchFishSparkles.forEach((sparkle, index) => {
        const pulse = .7 + Math.sin(this.visualTime * 5 + index) * .35;
        sparkle.setLocalScale(.045 * pulse, .045 * pulse, .045 * pulse);
      });
    }
  }

  getRodTipPosition() {
    return this.rodTipAnchor.getPosition().clone();
  }

  triggerRipple(position) {
    this.rippleAge = 0;
    this.ripple.enabled = true;
    const surfaceY = this.zone ? this.zone.surfaceY + 0.018 : position.y;
    this.ripple.setPosition(position.x, surfaceY, position.z);
  }

  updateWaterVisuals(dt) {
    const nearLoss = this.rhythm?.nearLoss ?? false;
    let rodPitch = -32;
    if (this.state === 'charging') rodPitch -= this.charge * 42;
    if (this.state === 'casting') rodPitch = -18;
    if (this.state === 'waiting') rodPitch = -25;
    if (this.state === 'bite') rodPitch = -43 + Math.sin(this.visualTime * 31) * 5;
    if (this.state === 'rhythm') rodPitch = -24 - this.rhythm.escapeProgress * 18;
    const vibration = nearLoss ? Math.sin(this.visualTime * 34) * 4.5 : 0;
    this.rodRoot.setLocalEulerAngles(rodPitch + vibration * .4, 0, 8 + vibration);
    if (this.state === 'ready' || this.state === 'charging') {
      this.bobberPosition.copy(this.getRodTipPosition()).add(new pc.Vec3(0, -.28, 0));
    }
    if (this.bobberRoot.enabled) {
      this.bobberRoot.setPosition(this.bobberPosition);
      if (this.lineEntity.enabled) {
        const lineThickness = this.state === 'bite' ? .032 : nearLoss ? .03 : .018;
        setBoxBetween(this.lineEntity, this.getRodTipPosition(), this.bobberPosition, lineThickness);
      }
    }
    if (!this.ripple.enabled) return;
    this.rippleAge += dt;
    const alpha = Math.max(0, 1 - this.rippleAge / 0.85);
    const scale = 0.28 + this.rippleAge * 1.8;
    this.ripple.setLocalScale(scale, 0.008, scale);
    this.rippleMaterial.opacity = alpha * 0.5;
    this.rippleMaterial.update();
    if (alpha <= 0) this.ripple.enabled = false;
  }

  get active() {
    return this.state !== 'inactive';
  }

  get presentationActive() {
    return this.state === 'caught' || this.gallery.active;
  }

  get presentationScale() {
    return this.presentationActive ? this.selectedFish?.sizeFraction ?? 1 : 1;
  }

  getPerformanceLocation() {
    const habitat = this.selectionDebug?.habitat ?? {};
    return {
      id: this.zone?.id ?? habitat.zoneId ?? '',
      label: this.zone?.label ?? habitat.label ?? 'Unknown water',
      habitat: [habitat.tier ?? this.zone?.tier, habitat.waterType ?? this.zone?.waterType]
        .filter(Boolean).join(' / '),
      tier: habitat.tier ?? this.zone?.tier ?? '',
      waterType: habitat.waterType ?? this.zone?.waterType ?? '',
      theme: habitat.theme ?? this.zone?.theme ?? '',
      salinity: habitat.salinity ?? this.zone?.salinity ?? ''
    };
  }

  recordPerformanceEncounter(result, catchQuality = null) {
    if (!this.rhythm || !this.activePerformanceEncounter || this.activePerformanceRecorded) return null;
    const snapshot = createFishingPerformanceSnapshot(this.rhythm, {
      ...this.activePerformanceEncounter,
      capturedAt: Date.now(),
      result,
      catchQuality
    });
    this.activePerformanceRecorded = true;
    return this.performanceHistory.add(snapshot);
  }

  getFishingPerformanceState() {
    const active = this.rhythm && this.activePerformanceEncounter && !this.activePerformanceRecorded
      ? createFishingPerformanceSnapshot(this.rhythm, {
        ...this.activePerformanceEncounter,
        capturedAt: Date.now(),
        live: true,
        result: this.rhythm.result ?? 'active'
      })
      : null;
    return { active, history: this.performanceHistory.getSnapshot() };
  }

  getFishingDebugState() {
    const zone = this.zone ?? this.findNearbyZone();
    if (!zone) {
      return {
        state: this.state,
        zone: null,
        candidates: [],
        selected: null,
        castValid: false,
        failure: this.lastFishingFailure
      };
    }
    const samplePoint = this.cast?.landingZone?.id === zone.id ? this.cast.target : zone.center;
    const ecology = getEcologySelection(zone, samplePoint);
    const modifiers = this.getSelectionModifiers(ecology, true, zone);
    const table = getWeightedSpeciesTable(ecology.fishIds, modifiers);
    const candidates = [...table]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5)
      .map((entry) => ({
        name: entry.fish.name,
        rarity: entry.fish.rarity,
        probability: entry.probability,
        weight: entry.selectionWeight
      }));
    return {
      state: this.state,
      zone: {
        id: zone.id,
        label: zone.label,
        tier: zone.tier,
        waterType: zone.waterType,
        theme: ecology.habitat.theme,
        candidateCount: table.length,
        modifiers: { ...zone.modifiers }
      },
      candidates,
      selected: this.selectedFish ? {
        name: this.selectedFish.name,
        rarity: this.selectedFish.rarity,
        length: this.selectedFish.length,
        weight: this.selectedFish.weight,
        shiny: this.selectedFish.shiny
      } : null,
      castValid: Boolean(this.cast?.landingZone?.id === zone.id),
      catchGroundLift: this.catchGroundLift,
      rhythmAttempt: this.rhythm?.getDebugState() ?? this.rhythmDebugAttempt,
      failure: this.lastFishingFailure
    };
  }

  getEcologyGuideState() {
    const guide = this.progression?.getEquippedItem?.('guide');
    const zone = this.zone ?? this.findNearbyZone();
    if (!guide?.guideMode || !zone) return null;
    const point = this.cast?.landingZone?.id === zone.id ? this.cast.target : zone.center;
    const ecology = getEcologySelection(zone, point);
    const table = getWeightedSpeciesTable(ecology.fishIds, this.getSelectionModifiers(ecology, true, zone));
    const sorted = [...table].sort((a, b) => b.probability - a.probability);
    let entries;
    if (guide.guideMode === 'rarity') {
      entries = sorted.filter((entry) => entry.fish.rarity === guide.guideRarity).slice(0, 5);
    } else if (guide.guideMode === 'exclusive') {
      entries = sorted.filter((entry) => entry.fish.habitat?.exclusiveWaterId === zone.id);
    } else {
      const selected = ['Common', 'Uncommon', 'Rare', 'Legendary']
        .flatMap((rarity) => sorted.filter((entry) => entry.fish.rarity === rarity).slice(0, 5));
      selected.push(...sorted.filter((entry) => entry.fish.habitat?.exclusiveWaterId === zone.id));
      entries = [...new Map(selected.map((entry) => [entry.fish.id, entry])).values()];
    }
    return {
      guide: guide.name,
      zone: zone.label,
      entries: entries.map((entry) => ({
        id: entry.fish.id,
        name: entry.fish.name,
        rarity: entry.fish.rarity,
        probability: entry.probability,
        exclusive: entry.fish.habitat?.exclusiveWaterId === zone.id
      }))
    };
  }

  getState() {
    const bestWeight = this.catchHistory.reduce((best, fish) => Math.max(best, fish.weight), 0);
    const bestLength = this.catchHistory.reduce((best, fish) => Math.max(best, fish.length), 0);
    return {
      state: this.state,
      zone: this.zone?.label ?? null,
      zoneId: this.zone?.id ?? null,
      zoneMetadata: this.selectionDebug?.habitat ?? (this.zone ? {
        tier: this.zone.tier,
        waterType: this.zone.waterType,
        theme: this.zone.theme
      } : null),
      message: this.message,
      showHookTutorial: this.showHookTutorial,
      castStrength: this.charge,
      progress: this.rhythm?.progress ?? 0,
      escapeProgress: this.rhythm?.escapeProgress ?? 0,
      fish: this.selectedFish?.name ?? null,
      shiny: Boolean(this.selectedFish?.shiny),
      selection: this.selectionDebug,
      inputFeedback: this.rhythmInputFeedback,
      inputFeedbacks: this.rhythmInputFeedbackBatch,
      rhythm: this.rhythm ? {
        bpm: this.rhythm.pattern.bpm,
        baseBpm: this.selectedFish?.rhythm?.bpm ?? null,
        authoredBpm: this.selectedFish?.rhythm?.authoredBpm ?? null,
        patternId: this.rhythm.getDebugState().patternId,
        noteCount: this.rhythm.pattern.notes.length,
        notes: this.rhythm.getVisibleNotes(),
        misses: this.rhythm.misses,
        offBeatPresses: this.rhythm.offBeatPresses,
        lossMeter: this.rhythm.lossMeter,
        judgment: this.rhythm.judgment,
        progress: this.rhythm.progress,
        escapeProgress: this.rhythm.escapeProgress,
        songTime: this.rhythm.songTime,
        duration: this.rhythm.pattern.duration,
        debug: this.rhythm.getDebugState()
      } : null,
      catchCard: this.catchCard,
      gallery: this.gallery.active ? {
        mode: this.gallery.mode,
        index: this.gallery.mode === 'models' ? this.gallery.modelIndex + 1 : this.gallery.speciesIndex + 1,
        count: this.gallery.mode === 'models' ? this.galleryModelArchetypes.length : FISH_SPECIES.length,
        model: this.getCatchModelLabel(this.selectedFish),
        length: this.selectedFish?.lengthCategory,
        size: this.selectedFish?.sizeLabel,
        shiny: this.gallery.shiny
      } : null,
      catches: this.catchHistory.length,
      bestWeight,
      bestLength
    };
  }

  destroy() {
    window.removeEventListener('keydown', this.onCatchContinueKeyDown, true);
    window.removeEventListener('keydown', this.onDebugKeyDown);
    delete window.REEL_ASCENT_CREATURE_GALLERY;
    document.body.classList.remove('fish-gallery');
  }
}
