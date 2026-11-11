import { Network } from './network';
import type { Snapshot } from '../shared/types';

export class VoiceClient {
  pc: RTCPeerConnection | null = null;
  stream: MediaStream | null = null;
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  audio = new Map<
    string,
    {
      gain: GainNode;
      source: MediaStreamAudioSourceNode;
      pan: StereoPannerNode;
      filter: BiquadFilterNode;
    }
  >();
  enabled = false;
  talking = false;
  status = 'Microphone off';
  level = 0;
  volume = 1;
  onChange: () => void = () => {};
  private generation = 0;
  private signature = '';
  private restarting = false;
  constructor(private network: Network) {
    window.addEventListener('blur', () => this.push(false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.push(false);
    });
    setInterval(() => {
      if (this.talking) this.network.socket?.emit('voice:talk', true);
      if (this.analyser) {
        const a = new Uint8Array(this.analyser.fftSize);
        this.analyser.getByteTimeDomainData(a);
        this.level = Math.min(
          1,
          Math.sqrt(a.reduce((v, n) => v + (n - 128) ** 2, 0) / a.length) / 30,
        );
      }
      this.onChange();
    }, 500);
  }
  async enable() {
    const generation = ++this.generation;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Microphone needs HTTPS or localhost. You can keep playing without voice.');
      this.status = 'Requesting microphone…';
      this.onChange();
      if (!this.stream)
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      for (const t of this.stream.getTracks()) t.enabled = false;
      this.ctx ??= new AudioContext();
      await this.ctx.resume();
      if (!this.analyser) {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
      }
      if (!this.network.state) {
        this.enabled = true;
        this.status = 'Microphone ready · join a room';
        this.onChange();
        return;
      }
      this.pc?.close();
      this.audio.forEach((a) => a.source.disconnect());
      this.audio.clear();
      const offer = await this.network.request<{
        ok: boolean;
        sdp: string;
        slots: { mid: string; id: string }[];
        iceServers: RTCIceServer[];
      }>('voice:open');
      if (generation !== this.generation) return;
      const pc = new RTCPeerConnection({
        iceServers: offer.iceServers,
        bundlePolicy: 'max-bundle',
      });
      this.pc = pc;
      const pending: RTCIceCandidateInit[] = [];
      this.network.socket?.off('voice:ice');
      this.network.socket?.on('voice:ice', (candidate: RTCIceCandidateInit) => {
        if (pc.remoteDescription) void pc.addIceCandidate(candidate).catch(() => {});
        else pending.push(candidate);
      });
      pc.onicecandidate = (e) => {
        if (e.candidate)
          void this.network.request('voice:ice', e.candidate.toJSON()).catch(() => {});
      };
      pc.ontrack = (e) => {
        const slot = offer.slots.find((s) => s.mid === e.transceiver.mid);
        if (!slot || !this.ctx) return;
        const source = this.ctx.createMediaStreamSource(new MediaStream([e.track])),
          gain = this.ctx.createGain(),
          pan = this.ctx.createStereoPanner(),
          filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 20000;
        gain.gain.value = 0;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(pan);
        pan.connect(this.ctx.destination);
        this.audio.set(slot.id, { source, gain, pan, filter });
      };
      pc.onconnectionstatechange = () => {
        this.status =
          pc.connectionState === 'connected'
            ? 'Connected · hold V to speak'
            : pc.connectionState === 'failed'
              ? 'Voice failed · retry microphone'
              : `Voice ${pc.connectionState}`;
        this.onChange();
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
      const publisher = pc.getTransceivers()[0];
      publisher.direction = 'sendonly';
      await publisher.sender.replaceTrack(this.stream.getAudioTracks()[0]);
      await pc.setLocalDescription(await pc.createAnswer());
      await this.network.request('voice:answer', pc.localDescription!.sdp);
      for (const candidate of pending) await pc.addIceCandidate(candidate).catch(() => {});
      this.enabled = true;
      this.signature = [this.network.state.self.id, ...offer.slots.map((slot) => slot.id)]
        .sort()
        .join(',');
      this.status = 'Connecting voice…';
      this.onChange();
    } catch (error) {
      this.status =
        error instanceof Error
          ? error.message
          : 'Microphone unavailable. You can continue without voice.';
      this.enabled = false;
      this.onChange();
    }
  }
  async disable() {
    this.generation++;
    this.enabled = false;
    this.push(false);
    this.pc?.close();
    this.pc = null;
    this.audio.forEach((a) => a.source.disconnect());
    this.audio.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.status = 'Microphone off';
    if (this.network.state) await this.network.request('voice:close').catch(() => {});
    this.onChange();
  }
  push(talk: boolean) {
    this.talking = talk && this.enabled;
    for (const t of this.stream?.getAudioTracks() ?? []) t.enabled = this.talking;
    this.network.socket?.emit('voice:talk', this.talking);
    this.onChange();
  }
  update(state: Snapshot) {
    if (!this.ctx) return;
    for (const [id, a] of this.audio) {
      const path = state.self.voice.find((v) => v.id === id);
      a.gain.gain.setTargetAtTime((path?.gain ?? 0) * this.volume, this.ctx.currentTime, 0.08);
      const me = state.players.find((p) => p.id === state.self.id);
      const other = state.players.find((p) => p.id === id);
      if (me && other) {
        const dx = other.x - me.x,
          dz = other.z - me.z,
          d = Math.max(1, Math.hypot(dx, dz));
        const pan = path?.phone
          ? 0
          : Math.max(-0.85, Math.min(0.85, (dx * Math.cos(me.yaw) + dz * Math.sin(me.yaw)) / d));
        a.pan.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.1);
      }
      a.filter.type = path?.phone ? 'bandpass' : 'lowpass';
      a.filter.Q.value = path?.phone ? 0.45 : 0.7;
      a.filter.frequency.setTargetAtTime(path?.phone ? 1700 : 20000, this.ctx.currentTime, 0.1);
    }
    const signature = state.players
      .map((p) => p.id)
      .sort()
      .join(',');
    if (this.enabled && signature !== this.signature && !this.restarting) {
      this.restarting = true;
      void this.enable().finally(() => {
        this.restarting = false;
      });
    }
  }
  async reconnect() {
    if (this.enabled) await this.enable();
  }
}
