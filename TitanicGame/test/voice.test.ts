import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaStreamTrack, RTCPeerConnection, RtpPacket, RtpHeader } from 'werift';
import { Room } from '../server/game';
import { VoiceRelay, opus } from '../server/voice';
import type { Socket } from 'socket.io';
import { STATIONS } from '../shared/world';

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
async function until(check: () => boolean, timeout = 12000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout)
      throw new Error('WebRTC connection did not establish in time.');
    await delay(25);
  }
}

test(
  'real WebRTC audio RTP is forwarded only along eligible proximity or answered telephone paths',
  { timeout: 45000 },
  async (t) => {
    const room = new Room('VOICEA', 15);
    for (let i = 0; i < 4; i++) {
      const p = room.addPlayer(`Voice ${i}`, `v-${i}`);
      p.ready = true;
    }
    room.start(room.host);
    const [a, b] = [...room.players.values()];
    Object.assign(a, { x: 0, z: -20, level: 0 });
    Object.assign(b, { x: 1, z: -20, level: 0 });
    const relay = new VoiceRelay({ RTC_PORT_MIN: '40200', RTC_PORT_MAX: '40300' });
    const clients: RTCPeerConnection[] = [];
    t.after(async () => {
      await Promise.all(clients.map((pc) => pc.close()));
      await relay.shutdown();
    });
    async function client(player: typeof a) {
      const pc = new RTCPeerConnection({
        codecs: { audio: [opus], video: [] },
        iceServers: [],
        iceAdditionalHostAddresses: ['127.0.0.1'],
        iceUseIpv6: false,
        bundlePolicy: 'max-bundle',
      });
      clients.push(pc);
      const publish = new MediaStreamTrack({ kind: 'audio', codec: opus });
      let received = 0;
      pc.onTrack.subscribe((track) => track.onReceiveRtp.subscribe(() => received++));
      const socket = {
        emit(event: string, candidate: unknown) {
          if (event === 'voice:ice')
            void pc
              .addIceCandidate(candidate as Parameters<RTCPeerConnection['addIceCandidate']>[0])
              .catch(() => {});
        },
      } as Socket;
      const offer = await relay.open(room, player, socket);
      assert.ok(offer?.sdp.includes('opus'));
      await pc.setRemoteDescription({ type: 'offer', sdp: offer!.sdp });
      const sender = pc.getTransceivers()[0];
      sender.setDirection('sendonly');
      await sender.sender.replaceTrack(publish);
      pc.onIceCandidate.subscribe((candidate) => {
        if (candidate) void relay.candidate(player.id, candidate.toJSON());
      });
      await pc.setLocalDescription(await pc.createAnswer());
      await relay.answer(player.id, pc.localDescription!.sdp);
      return { pc, publish, count: () => received };
    }
    const source = await client(a),
      receiver = await client(b);
    await until(
      () =>
        source.pc.connectionState === 'connected' && receiver.pc.connectionState === 'connected',
    );
    let seq = 0;
    async function send() {
      a.talkUntil = Date.now() + 2000;
      for (let i = 0; i < 10; i++) {
        source.publish.writeRtp(
          new RtpPacket(
            new RtpHeader({
              payloadType: 111,
              sequenceNumber: seq++,
              timestamp: seq * 960,
              ssrc: 12345,
            }),
            Buffer.from([0xf8, 0xff, 0xfe]),
          ),
        );
        await delay(20);
      }
      await delay(120);
    }
    await send();
    assert.ok(
      receiver.count() > 0,
      'The listener must receive real encrypted WebRTC media, not simulated voice.',
    );
    Object.assign(b, { x: 1, z: -20, level: -1 });
    await delay(150);
    let before = receiver.count();
    await send();
    assert.equal(
      receiver.count(),
      before,
      'Other decks must receive no RTP, even if a client ignores UI muting.',
    );
    const bridge = STATIONS.find((s) => s.id === 'bridge-phone')!,
      nest = STATIONS.find((s) => s.id === 'nest-phone')!;
    Object.assign(a, { x: bridge.x, z: bridge.z, level: bridge.level });
    Object.assign(b, { x: nest.x, z: nest.z, level: nest.level });
    room.action(a.id, { station: bridge.id, verb: 'call', value: 'nest' });
    before = receiver.count();
    await send();
    assert.equal(receiver.count(), before, 'A ringing, unanswered line must carry no audio.');
    room.action(b.id, { station: nest.id, verb: 'answer' });
    await send();
    assert.ok(
      receiver.count() > before,
      'Answered telephones must carry actual audio between decks.',
    );
    room.hangup(a.id);
    await delay(150);
    before = receiver.count();
    await send();
    assert.equal(receiver.count(), before, 'Hanging up must revoke packet forwarding.');
    room.phase = 'lifeboat';
    await send();
    assert.ok(receiver.count() > before, 'The shared lifeboat must restore communication.');
    before = receiver.count();
    room.beginInquiry('route');
    await send();
    assert.ok(receiver.count() > before, 'The company inquiry must also carry actual crew audio.');
    assert.ok(relay.forwarded > 0 && relay.blocked > 0);
  },
);
