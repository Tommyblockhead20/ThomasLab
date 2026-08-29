import http from 'node:http';
import { WebSocketServer } from 'ws';
import { SERVER_CONFIG } from './config.js';
import { ClientConnection } from './connection.js';
import { RoomManager } from './room-manager.js';

const roomManager = new RoomManager({
  roomCapacity: SERVER_CONFIG.roomCapacity,
  reconnectWindowMs: SERVER_CONFIG.reconnectWindowMs
});

const httpServer = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, rooms: roomManager.rooms.size }));
    return;
  }
  response.writeHead(404);
  response.end('Reel Ascent multiplayer WebSocket server');
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: SERVER_CONFIG.maxPayloadBytes,
  verifyClient: SERVER_CONFIG.allowedOrigins.length
    ? ({ origin }) => SERVER_CONFIG.allowedOrigins.includes(origin)
    : undefined
});

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  new ClientConnection(socket, roomManager);
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, SERVER_CONFIG.heartbeatIntervalMs);
heartbeat.unref?.();

function shutdown(signal) {
  console.log(`[reel-ascent] ${signal}: shutting down`);
  clearInterval(heartbeat);
  for (const socket of wss.clients) socket.close(1001, 'Server shutting down');
  wss.close(() => httpServer.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

httpServer.listen(SERVER_CONFIG.port, () => {
  console.log(`[reel-ascent] multiplayer server listening on ws://localhost:${SERVER_CONFIG.port}`);
  console.log(`[reel-ascent] room capacity ${SERVER_CONFIG.roomCapacity}; reconnect window ${SERVER_CONFIG.reconnectWindowMs}ms`);
});
