import { BALANCE } from '../shared/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../server/index';
import type { Reply, Snapshot } from '../shared/types';
import { STATIONS } from '../shared/world';

function request<T = Reply>(socket: Socket, event: string, data: unknown = null): Promise<T> {
  return new Promise((done, fail) =>
    socket
      .timeout(5000)
      .emit(event, data, (err: Error | null, result: Reply) =>
        err ? fail(err) : result.ok ? done(result as T) : fail(new Error(result.error)),
      ),
  );
}
async function connect(url: string) {
  const s = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise<void>((done, fail) => {
    s.once('connect', done);
    s.once('connect_error', fail);
  });
  return s;
}
function snapshot(socket: Socket, condition: (s: Snapshot) => boolean): Promise<Snapshot> {
  return new Promise((done, fail) => {
    const timer = setTimeout(() => {
      socket.off('snapshot', onState);
      fail(new Error('Timed out waiting for synchronized snapshot.'));
    }, 5000);
    const onState = (s: Snapshot) => {
      if (condition(s)) {
        clearTimeout(timer);
        socket.off('snapshot', onState);
        done(s);
      }
    };
    socket.on('snapshot', onState);
  });
}

test('wireless telephone read-back reaches only the answered crew member, then becomes a plotted bridge report', async (t) => {
  const game = createGameServer();
  await new Promise<void>((done) => game.http.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(game.http.address() as { port: number }).port}`,
    sockets: Socket[] = [];
  t.after(async () => {
    for (const s of sockets) s.disconnect();
    await game.close();
  });
  for (let i = 0; i < 4; i++) sockets.push(await connect(url));
  const passes: Reply[] = [await request(sockets[0], 'room:create', { name: 'Operator' })];
  for (let i = 1; i < 4; i++)
    passes.push(await request(sockets[i], 'room:join', { name: 'Crew' + i, code: passes[0].code }));
  for (const s of sockets) await request(s, 'room:ready', true);
  await request(sockets[0], 'room:start');
  const room = game.rooms.get(passes[0].code!)!;
  room.nextEvent = room.nextTelegram = Infinity;
  const a = room.players.get(passes[0].id!)!,
    b = room.players.get(passes[1].id!)!,
    observer = room.players.get(passes[2].id!)!;
  const desk = STATIONS.find((s) => s.id === 'wireless-phone')!,
    bridge = STATIONS.find((s) => s.id === 'bridge-phone')!;
  Object.assign(a, { x: desk.x, z: desk.z, level: desk.level });
  Object.assign(b, { x: bridge.x, z: bridge.z, level: bridge.level });
  Object.assign(observer, { x: 0, z: 5, level: -2 });
  const telegram = room.generateTelegram(true);
  await request(sockets[0], 'action', {
    station: 'wireless',
    verb: 'decode',
    value: { id: telegram.id, text: telegram.text },
  });
  room.tick(0.2);
  await request(sockets[0], 'action', { station: desk.id, verb: 'call', value: 'bridge' });
  await request(sockets[1], 'action', { station: bridge.id, verb: 'answer' });
  const heard = snapshot(sockets[1], (s) =>
    s.self.lineMessages.some((m) => m.text === 'Reduce engine demand'),
  );
  room.tick(0.2);
  await request(sockets[0], 'action', {
    station: desk.id,
    verb: 'message',
    value: 'Reduce engine demand',
  });
  assert.equal((await heard).self.lineMessages.at(-1)!.from, 'Operator');
  const quiet = snapshot(sockets[2], (s) => s.elapsed >= room.elapsed - 0.5);
  game.publish(room);
  assert.ok(!JSON.stringify(await quiet).includes('Reduce engine demand'));
  const received = snapshot(sockets[1], (s) =>
    s.self.inventory.includes(`Telegram:${telegram.id}`),
  );
  room.tick(0.2);
  await request(sockets[0], 'action', { station: desk.id, verb: 'relay', value: telegram.id });
  await received;
  Object.assign(b, { x: -3.2, z: -17.8, level: 0 });
  room.tick(0.2);
  const plotted = snapshot(sockets[2], (s) => s.delivered.some((t) => t.id === telegram.id));
  await request(sockets[1], 'action', { station: 'chart', verb: 'deliver' });
  assert.ok((await plotted).delivered.find((t) => t.id === telegram.id)!.report);
  room.tick(0.2);
  await request(sockets[1], 'action', {
    station: 'chart',
    verb: 'mark',
    value: {
      kind: 'area',
      points: [{ west: 500, north: 30 }],
      radius: 180,
      label: 'Crew estimate',
      source: 'Wireless',
      confidence: 'low',
    },
  });
  const shared = await snapshot(sockets[2], (s) =>
    s.chartMarks.some((m) => m.label === 'Crew estimate'),
  );
  assert.deepEqual(shared.chartMarks[0].points, [{ west: 500, north: 30 }]);
});

test('four independent network clients complete a voyage, lifeboat vote, reconnect and restart', async (t) => {
  const game = createGameServer({ ALLOW_DEV_TOOLS: '1' });
  await new Promise<void>((done) => game.http.listen(0, '127.0.0.1', done));
  const address = game.http.address() as { port: number },
    url = `http://127.0.0.1:${address.port}`;
  const sockets: Socket[] = [];
  t.after(async () => {
    for (const s of sockets) s.disconnect();
    await game.close();
  });
  for (let i = 0; i < 4; i++) sockets.push(await connect(url));
  const passes: Reply[] = [];
  passes.push(await request(sockets[0], 'room:create', { name: 'Test Captain' }));
  for (let i = 1; i < 4; i++)
    passes.push(
      await request(sockets[i], 'room:join', { code: passes[0].code, name: `Real socket ${i}` }),
    );
  const room = game.rooms.get(passes[0].code!)!;
  for (const s of sockets) await request(s, 'room:ready', true);
  const states = sockets.map((s) => snapshot(s, (s) => s.phase === 'voyage'));
  await request(sockets[0], 'room:start');
  const privateStates = await Promise.all(states);
  assert.equal(privateStates.filter((s) => s.self.saboteur).length, 1);
  for (let i = 0; i < 4; i++) {
    assert.equal(privateStates[i].self.id, passes[i].id);
    assert.equal(privateStates[i].players.length, 4);
    assert.ok(
      privateStates[i].players.every(
        (p) => !('token' in p) && !('role' in p) && !('saboteur' in p),
      ),
    );
  }
  const mover = room.players.get(passes[0].id!)!,
    before = { x: mover.x, z: mover.z };
  sockets[0].emit('input', {
    forward: 1,
    right: 0,
    yaw: 0,
    pitch: 0,
    sprint: false,
    zoom: 0,
    seq: 1,
  });
  await new Promise((done) => setTimeout(done, 150));
  assert.ok(Math.hypot(mover.x - before.x, mover.z - before.z) > 0);
  await assert.rejects(
    request(sockets[0], 'action', { station: 'engines', verb: 'throttle', value: 0 }),
    /closer/,
  );
  // Speed up physical time in this test fixture, without exposing a runtime
  // endpoint that would let production players force an outcome.
  room.nextEvent = Infinity;
  room.nextTelegram = Infinity;
  room.ship.speed = 22;
  room.addIce(room.ship.west + 130, room.ship.north, 40, true);
  room.mainResolved = true;
  for (let i = 0; i < 1600 && room.phase === 'voyage'; i++) room.tick(0.05);
  assert.equal(room.phase, 'sinking');
  const boatStates = sockets.map((s) => snapshot(s, (s) => s.phase === 'lifeboat'));
  room.tick(BALANCE.evacuationSeconds + 1);
  game.publish(room);
  await Promise.all(boatStates);
  const sab = [...room.players.values()].find((p) => p.saboteur)!;
  const results = sockets.map((s) => snapshot(s, (s) => s.phase === 'ended'));
  for (const s of sockets) await request(s, 'vote', sab.id);
  const ended = await Promise.all(results);
  assert.ok(ended.every((s) => s.result?.outcome === 'draw'));
  const hostId = room.host,
    hostIndex = passes.findIndex((p) => p.id === hostId);
  sockets[hostIndex].disconnect();
  await new Promise((done) => setTimeout(done, 80));
  assert.notEqual(room.host, hostId);
  const resumed = await connect(url);
  sockets.push(resumed);
  await request(resumed, 'room:reconnect', passes[hostIndex]);
  assert.equal(room.players.get(hostId)!.connected, true);
  const newHost = sockets[passes.findIndex((p) => p.id === room.host)];
  const lobby = snapshot(resumed, (s) => s.phase === 'lobby');
  await request(newHost, 'room:return');
  const fresh = await lobby;
  assert.equal(fresh.self.role, null);
  assert.equal(fresh.self.saboteur, false);
});

test('multiple rooms receive snapshots; membership and forged reconnects are rejected', async (t) => {
  const game = createGameServer();
  await new Promise<void>((done) => game.http.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(game.http.address() as { port: number }).port}`;
  const a = await connect(url),
    b = await connect(url),
    outsider = await connect(url);
  t.after(async () => {
    a.disconnect();
    b.disconnect();
    outsider.disconnect();
    await game.close();
  });
  const pa = await request(a, 'room:create', { name: 'Room A' }),
    pb = await request(b, 'room:create', { name: 'Room B' });
  assert.notEqual(pa.code, pb.code);
  await Promise.all([
    snapshot(a, (s) => s.code === pa.code),
    snapshot(b, (s) => s.code === pb.code),
  ]);
  await assert.rejects(request(outsider, 'room:reconnect', { ...pa, token: 'stolen' }), /expired/);
  await assert.rejects(
    request(outsider, 'action', { station: 'wheel', verb: 'rudder', value: 1 }),
    /Join a room/,
  );
  await assert.rejects(
    request(a, 'room:join', { code: pb.code, name: 'Duplicate' }),
    /Leave the current/,
  );
});

test('dedicated solo protocol starts immediately and keeps test commands in its private room', async (t) => {
  const game = createGameServer();
  await new Promise<void>((done) => game.http.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(game.http.address() as { port: number }).port}`;
  const player = await connect(url),
    outsider = await connect(url);
  t.after(async () => {
    player.disconnect();
    outsider.disconnect();
    await game.close();
  });
  const first = snapshot(player, (s) => s.phase === 'voyage');
  const pass = await request(player, 'room:solo', {
    name: 'Solo Tester',
    options: { post: 'Lookout' },
  });
  const state = await first;
  assert.equal(state.players.length, 1);
  assert.equal(state.practice, true);
  assert.equal(state.self.role, 'Lookout');
  assert.equal(state.practiceSettings?.paused, false);
  assert.equal(state.self.saboteur, false);
  const room = game.rooms.get(pass.code!)!;
  room.icebergs = [];
  room.mainResolved = true;
  room.nextEvent = room.nextTelegram = Infinity;
  room.ship.speed = room.ship.throttle = room.ship.order = 0;
  const warning = snapshot(
    player,
    (s) => s.ship.delay >= 45 && s.notice === 'Falling behind schedule',
  );
  for (let t = 0; t < 46; t += 0.05) room.tick(0.05);
  game.publish(room);
  assert.equal((await warning).practiceSettings?.paused, false);
  const prepared = snapshot(player, (s) => s.demo?.id === 'engineer');
  await request(player, 'practice', { verb: 'demo', value: 'engineer' });
  assert.ok((await prepared).machines.find((m) => m.id === 'engines')?.fault);
  const moved = snapshot(player, (s) => s.players[0].level === -1);
  await request(player, 'practice', { verb: 'travel', value: 'engines' });
  await moved;
  await assert.rejects(request(outsider, 'practice', { verb: 'sinking' }), /Join a room/);
  await assert.rejects(
    request(outsider, 'room:join', { code: pass.code, name: 'Uninvited' }),
    /departed/,
  );
  await request(player, 'practice', { verb: 'sinking' });
  room.tick(0.05);
  room.tick(BALANCE.evacuationSeconds + 1);
  game.publish(room);
  await request(player, 'vote', state.self.id);
  assert.equal(room.phase, 'ended');
  await request(player, 'practice', { verb: 'restart' });
  assert.equal(room.phase, 'voyage');
  player.disconnect();
});
test('a route recall broadcasts a company inquiry and accepts all votes without evacuating the ship', async (t) => {
  const game = createGameServer();
  await new Promise<void>((done) => game.http.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(game.http.address() as { port: number }).port}`,
    sockets: Socket[] = [];
  t.after(async () => {
    sockets.forEach((s) => s.disconnect());
    await game.close();
  });
  for (let i = 0; i < 4; i++) sockets.push(await connect(url));
  const pass = await request(sockets[0], 'room:create', { name: 'Captain' });
  for (let i = 1; i < 4; i++)
    await request(sockets[i], 'room:join', { name: 'Crew' + i, code: pass.code });
  for (const s of sockets) await request(s, 'room:ready', true);
  await request(sockets[0], 'room:start');
  const room = game.rooms.get(pass.code!)!;
  const hearing = sockets.map((s) => snapshot(s, (s) => s.phase === 'inquiry'));
  room.beginInquiry('route');
  game.publish(room);
  for (const s of await Promise.all(hearing)) {
    assert.equal(s.inquiryCause, 'route');
    assert.ok(s.players.every((p) => !p.evacuated));
    assert.equal(s.ship.hull, 100);
    assert.equal(s.phaseRemaining, 120);
  }
  const ended = sockets.map((s) => snapshot(s, (s) => s.phase === 'ended'));
  const ids = [...room.players.keys()];
  for (let i = 0; i < 4; i++) await request(sockets[i], 'vote', ids[i]);
  for (const s of await Promise.all(ended)) {
    assert.equal(s.result?.cause, 'route');
    assert.match(s.result!.description, /company dismissed/);
  }
});
