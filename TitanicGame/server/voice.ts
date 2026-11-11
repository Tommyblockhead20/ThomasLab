import { MediaStreamTrack, RTCPeerConnection, RTCRtpCodecParameters, type RtpPacket } from 'werift';
import type { Socket } from 'socket.io';
import type { Room, Player } from './game';

interface VoiceSession {
  pc: RTCPeerConnection;
  outputs: Map<string, MediaStreamTrack>;
  room: Room;
  player: Player;
}
export const opus = new RTCRtpCodecParameters({
  mimeType: 'audio/opus',
  clockRate: 48000,
  channels: 2,
  payloadType: 111,
});

// A small, audio-only selective forwarding unit. No client-to-client audio
// connections exist. Unauthorized RTP is discarded on the server, including
// packets from a modified client that ignores proximity or push-to-talk UI.
export class VoiceRelay {
  sessions = new Map<string, VoiceSession>();
  forwarded = 0;
  blocked = 0;
  constructor(private env: NodeJS.ProcessEnv = process.env) {}
  iceServers() {
    const servers: { urls: string; username?: string; credential?: string }[] = [];
    if (this.env.STUN_URL) servers.push({ urls: this.env.STUN_URL });
    if (this.env.TURN_URL)
      servers.push({
        urls: this.env.TURN_URL,
        username: this.env.TURN_USERNAME,
        credential: this.env.TURN_PASSWORD,
      });
    return servers;
  }
  async open(room: Room, player: Player, socket: Socket) {
    await this.close(player.id);
    const pc = new RTCPeerConnection({
      codecs: { audio: [opus], video: [] },
      iceServers: this.iceServers(),
      iceUseIpv6: false,
      bundlePolicy: 'max-bundle',
      iceAdditionalHostAddresses: [
        '127.0.0.1',
        ...(this.env.PUBLIC_IP ? [this.env.PUBLIC_IP] : []),
      ],
      icePortRange: [
        Number(this.env.RTC_PORT_MIN) || 40000,
        Number(this.env.RTC_PORT_MAX) || 40100,
      ],
    });
    const outputs = new Map<string, MediaStreamTrack>();
    const session = { pc, outputs, room, player };
    this.sessions.set(player.id, session);
    pc.addTransceiver('audio', { direction: 'recvonly' });
    for (const source of room.players.values()) {
      if (source.id === player.id) continue;
      const track = new MediaStreamTrack({ kind: 'audio', id: source.id, codec: opus });
      outputs.set(source.id, track);
      pc.addTransceiver(track, { direction: 'sendonly' });
    }
    pc.onTrack.subscribe((track) =>
      track.onReceiveRtp.subscribe((packet) => this.forward(session, packet)),
    );
    pc.connectionStateChange.subscribe((state) => {
      if (state === 'failed' && this.sessions.get(player.id) === session) {
        socket.emit(
          'voice:error',
          'The voice connection failed. Check UDP ports and TURN configuration.',
        );
        void this.close(player.id);
      }
    });
    pc.onIceCandidate.subscribe((candidate) => {
      if (candidate) socket.emit('voice:ice', candidate.toJSON());
    });
    await pc.setLocalDescription(await pc.createOffer());
    if (this.sessions.get(player.id) !== session) return;
    return {
      sdp: pc.localDescription!.sdp,
      type: 'offer',
      slots: pc
        .getTransceivers()
        .slice(1)
        .map((t, i) => ({ mid: t.mid, id: [...outputs.keys()][i] })),
      iceServers: this.iceServers(),
    };
  }
  forward(source: VoiceSession, packet: RtpPacket) {
    if (!source.player.connected || Date.now() > source.player.talkUntil) {
      this.blocked++;
      return;
    }
    for (const target of this.sessions.values()) {
      if (
        target.room !== source.room ||
        target.player.id === source.player.id ||
        !target.player.connected
      )
        continue;
      const eligible = source.room
        .voicePaths(target.player)
        .some((path) => path.id === source.player.id);
      const track = target.outputs.get(source.player.id);
      if (!eligible || !track || target.pc.connectionState !== 'connected') {
        this.blocked++;
        continue;
      }
      // Each sender rewrites SSRC and payload type. Serialize/deserialize to
      // isolate headers because Werift mutates RTP headers while forwarding.
      track.writeRtp(packet.serialize());
      this.forwarded++;
    }
  }
  async answer(id: string, sdp: unknown) {
    if (typeof sdp !== 'string' || sdp.length > 100000) throw new Error('Invalid voice answer.');
    const s = this.sessions.get(id);
    if (!s) throw new Error('Start voice again.');
    await s.pc.setRemoteDescription({ type: 'answer', sdp });
  }
  async candidate(id: string, candidate: unknown) {
    const s = this.sessions.get(id);
    if (s && candidate && typeof candidate === 'object')
      await s.pc.addIceCandidate(candidate as Parameters<RTCPeerConnection['addIceCandidate']>[0]);
  }
  async close(id: string) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    for (const t of s.outputs.values()) t.stop();
    await s.pc.close();
  }
  async shutdown() {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }
}
