import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import { BALANCE } from '../shared/config';
import type { Reply } from '../shared/types';
import { GameError, Room } from './game';
import { VoiceRelay } from './voice';

export function createGameServer(env: NodeJS.ProcessEnv = process.env) {
  const app = express(),
    http = createServer(app);
  const origins = (
    env.ALLOWED_ORIGINS ??
    'http://localhost:5174,http://127.0.0.1:5174,http://localhost:3001,http://127.0.0.1:3001,https://thomaslab.me,https://www.thomaslab.me'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = (origin: string | undefined) => !origin || origins.includes(origin);
  const io = new Server(http, {
    cors: { origin: (origin, cb) => cb(null, allowed(origin)), methods: ['GET', 'POST'] },
    allowRequest: (req, cb) => cb(null, allowed(req.headers.origin)),
    maxHttpBufferSize: 128000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling'],
  });
  const rooms = new Map<string, Room>(),
    voice = new VoiceRelay(env);
  const allowDev = env.ALLOW_DEV_TOOLS === '1';
  app.disable('x-powered-by');
  app.get('/health', (_req, res) =>
    res.json({
      ok: true,
      game: 'Titanic: Altered History',
      version: 'v11',
      rooms: rooms.size,
      players: [...rooms.values()].reduce(
        (n, r) => n + [...r.players.values()].filter((p) => p.connected).length,
        0,
      ),
      voice: 'server-relayed-webrtc',
    }),
  );
  app.get('/Titanic/downloads/Titanic-Altered-History.zip', (_req, res) =>
    res.download(resolve(process.cwd(), '../Titanic/downloads/Titanic-Altered-History.zip')),
  );
  app.get('/Titanic/downloads/Titanic-Altered-History-v11.zip', (_req, res) =>
    res.download(resolve(process.cwd(), '../Titanic/downloads/Titanic-Altered-History-v11.zip')),
  );
  app.use('/Titanic', express.static(resolve(process.cwd(), '../Titanic')));
  app.get('/', (_req, res) => res.redirect('/Titanic/'));
  const requirePlayer = (socket: Socket) => {
    const room = rooms.get(socket.data.code),
      player = room?.players.get(socket.data.playerId);
    if (!room || !player || player.socket !== socket.id) throw new GameError('Join a room first.');
    return { room, player };
  };
  const publish = (room: Room) => {
    for (const p of room.players.values())
      if (p.socket && p.connected) io.to(p.socket).emit('snapshot', room.snapshot(p.id));
  };
  io.on('connection', (socket) => {
    const counts = new Map<string, { at: number; n: number }>();
    const limited = (key: string, max: number) => {
      const now = Date.now(),
        v = counts.get(key);
      if (!v || now - v.at > 1000) {
        counts.set(key, { at: now, n: 1 });
        return false;
      }
      return ++v.n > max;
    };
    const on = (event: string, fn: (data: any) => unknown, max = 8) =>
      socket.on(event, async (data, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (limited(event, max))
          return reply({ ok: false, error: 'Too many requests. Give it a moment.' });
        try {
          const result = await fn(data);
          reply({ ok: true, ...(result && typeof result === 'object' ? result : {}) });
        } catch (error) {
          reply({
            ok: false,
            error:
              error instanceof GameError ? error.message : 'The request could not be completed.',
          });
          if (!(error instanceof GameError))
            console.error(`[${event}]`, error instanceof Error ? error.message : String(error));
        }
      });
    const createRoom = (data: any, solo = false) => {
      if (socket.data.code) throw new GameError('Leave the current room first.');
      if (rooms.size >= 100) throw new GameError('The server is full. Please try again later.');
      let code = '';
      do {
        code = Array.from(randomBytes(6), (n) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join(
          '',
        );
      } while (rooms.has(code));
      const fixedSeed =
        allowDev && env.MATCH_SEED && Number.isSafeInteger(Number(env.MATCH_SEED))
          ? Number(env.MATCH_SEED)
          : undefined;
      const room = new Room(code, fixedSeed),
        p = room.addPlayer(String(data?.name ?? ''), socket.id);
      if (solo) room.start(p.id, { ...data?.options, practice: true });
      rooms.set(code, room);
      socket.data.code = code;
      socket.data.playerId = p.id;
      publish(room);
      return { code, id: p.id, token: p.token, devTools: allowDev };
    };
    on('room:create', (data) => createRoom(data), 3);
    on('room:solo', (data) => createRoom(data, true), 3);
    on(
      'room:join',
      (data) => {
        if (socket.data.code) throw new GameError('Leave the current room first.');
        const code = String(data?.code ?? '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 6),
          room = rooms.get(code);
        if (!room)
          throw new GameError('No room with that code. Check the code and server address.');
        const p = room.addPlayer(String(data?.name ?? ''), socket.id);
        socket.data.code = code;
        socket.data.playerId = p.id;
        publish(room);
        return { code, id: p.id, token: p.token, devTools: allowDev };
      },
      4,
    );
    on(
      'room:reconnect',
      (data) => {
        if (socket.data.code) throw new GameError('Already connected to a room.');
        const room = rooms.get(String(data?.code ?? ''));
        if (!room) throw new GameError('This room is no longer running.');
        const p = room.reconnect(String(data?.id ?? ''), String(data?.token ?? ''), socket.id);
        socket.data.code = room.code;
        socket.data.playerId = p.id;
        publish(room);
        return { code: room.code, id: p.id, token: p.token, devTools: allowDev };
      },
      4,
    );
    on('room:ready', (data) => {
      const { room, player } = requirePlayer(socket);
      if (room.phase !== 'lobby') throw new GameError('The voyage has started.');
      player.ready = data === true;
      publish(room);
    });
    on('equipment:view', (data) => {
      const { room, player } = requirePlayer(socket);
      room.viewEquipment(player.id, typeof data?.station === 'string' ? data.station : null);
    }, 4);
    on('room:start', (data) => {
      const { room, player } = requirePlayer(socket);
      room.start(player.id, data ?? {}, allowDev);
      publish(room);
    });
    on('room:return', () => {
      const { room, player } = requirePlayer(socket);
      room.returnToLobby(player.id);
      publish(room);
    });
    on('practice', (data) => {
      const { room, player } = requirePlayer(socket);
      room.practiceAction(player.id, data);
      publish(room);
    });
    on('room:leave', async () => {
      const { room, player } = requirePlayer(socket);
      room.leave(player.id);
      socket.data.code = null;
      socket.data.playerId = null;
      await voice.close(player.id);
      publish(room);
    });
    socket.on('input', (data) => {
      if (limited('input', 65)) return;
      try {
        const { room, player } = requirePlayer(socket);
        if (['voyage', 'sinking'].includes(room.phase) && !player.evacuated)
          room.setInput(player, data);
      } catch {}
    });
    on(
      'action',
      (data) => {
        const { room, player } = requirePlayer(socket);
        room.action(player.id, data);
        publish(room);
      },
      12,
    );
    on('vote', (data) => {
      const { room, player } = requirePlayer(socket);
      room.vote(player.id, String(data));
      publish(room);
    });
    on(
      'voice:open',
      async () => {
        const { room, player } = requirePlayer(socket);
        return await voice.open(room, player, socket);
      },
      2,
    );
    on(
      'voice:answer',
      async (data) => {
        const { player } = requirePlayer(socket);
        await voice.answer(player.id, data);
      },
      3,
    );
    on(
      'voice:ice',
      async (data) => {
        const { player } = requirePlayer(socket);
        await voice.candidate(player.id, data);
      },
      50,
    );
    on('voice:close', async () => {
      const { player } = requirePlayer(socket);
      player.talkUntil = 0;
      await voice.close(player.id);
    });
    socket.on('voice:talk', (talk) => {
      if (limited('talk', 10)) return;
      try {
        const { player } = requirePlayer(socket);
        player.talkUntil = talk === true ? Date.now() + 1800 : 0;
        player.talking = talk === true;
      } catch {}
    });
    socket.on('disconnect', () => {
      try {
        const { room, player } = requirePlayer(socket);
        room.disconnect(player.id);
        void voice.close(player.id);
        publish(room);
      } catch {}
    });
  });
  let last = performance.now(),
    frame = 0;
  const tick = setInterval(() => {
    const now = performance.now(),
      dt = Math.min(0.2, (now - last) / 1000);
    last = now;
    frame++;
    for (const room of rooms.values()) {
      room.tick(dt);
      if (frame % 2 === 0) publish(room);
    }
  }, 1000 / BALANCE.tickRate);
  const sweep = setInterval(() => {
    for (const [code, room] of rooms) {
      if (![...room.players.values()].some((p) => p.connected)) {
        room.emptySince ??= Date.now();
        if (Date.now() - room.emptySince > 600000) rooms.delete(code);
      }
      if (room.phase === 'lobby') {
        for (const [id, p] of room.players)
          if (p.disconnectedAt && Date.now() - p.disconnectedAt > 120000) room.players.delete(id);
        room.electHost();
      }
    }
  }, 15000);
  return {
    app,
    http,
    io,
    rooms,
    voice,
    publish,
    async close() {
      clearInterval(tick);
      clearInterval(sweep);
      await voice.shutdown();
      await new Promise<void>((done) => io.close(() => done()));
    },
  };
}

const entry = process.argv[1];
if (entry && resolve(entry) === resolve(fileURLToPath(import.meta.url))) {
  const game = createGameServer();
  const port = Number(process.env.PORT) || 3001;
  game.http.listen(port, '0.0.0.0', () =>
    console.log(
      `Titanic server ready at http://localhost:${port}/Titanic/ · UDP ${process.env.RTC_PORT_MIN ?? 40000}–${process.env.RTC_PORT_MAX ?? 40100} for voice`,
    ),
  );
  const stop = () => {
    void game.close().then(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
