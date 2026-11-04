// Local-only UI review server. Runs the actual room/connection code; no cloud database.
import { createRequire } from 'node:module';
import { ClientConnection } from '../../server/src/connection.js';
import { RoomManager } from '../../server/src/room-manager.js';
const { WebSocketServer }=createRequire(new URL('../../server/package.json',import.meta.url))('ws');
const manager=new RoomManager(),server=new WebSocketServer({host:'127.0.0.1',port:8787});
server.on('connection',socket=>new ClientConnection(socket,manager));
server.on('listening',()=>console.log('Local room review server: ws://127.0.0.1:8787'));
