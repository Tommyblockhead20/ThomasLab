import { io, type Socket } from 'socket.io-client';

// These are actual network clients, clearly named as test crew. They do not
// stand in for human gameplay or audio testing, and never spawn in normal play.
const args = Object.fromEntries(process.argv.slice(2).map((s) => s.replace(/^--/, '').split('=')));
const server = args.server ?? 'http://localhost:3001',
  count = Math.max(1, Math.min(9, Number(args.count) || 3));
if (!args.room) {
  console.error(
    'Usage: npm run test:crew -- --room=ABC123 --count=3 --server=http://localhost:3001',
  );
  process.exit(1);
}
const sockets: Socket[] = [];
for (let i = 1; i <= count; i++) {
  const socket = io(server, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  await new Promise<void>((done, fail) => {
    socket.once('connect', () => done());
    socket.once('connect_error', fail);
  });
  const request = (event: string, data: unknown) =>
    new Promise<any>((done, fail) =>
      socket
        .timeout(8000)
        .emit(event, data, (e: Error | null, r: { ok: boolean; error?: string }) =>
          e || !r.ok ? fail(e ?? new Error(r.error)) : done(r),
        ),
    );
  await request('room:join', { code: args.room, name: `TEST CREW ${i}` });
  await request('room:ready', true);
  let role = '';
  socket.on('snapshot', (s) => {
    if (s.self.role && s.self.role !== role) {
      role = s.self.role;
      console.log(`TEST CREW ${i}: ${role}${s.self.saboteur ? ' (time traveler)' : ''}`);
    }
  });
  console.log(`TEST CREW ${i} connected to ${args.room} using a real socket.`);
}
console.log(
  'Test crew stay at their posts without automated decisions. Press Ctrl+C to disconnect.',
);
process.once('SIGINT', () => {
  for (const s of sockets) s.disconnect();
  process.exit(0);
});
