import { io, type Socket } from 'socket.io-client';
import type { Action, Reply, Snapshot, StartOptions } from '../shared/types';

export const defaultServer =
  import.meta.env.VITE_GAME_SERVER_URL ||
  (location.port === '5174' ? `${location.protocol}//${location.hostname}:3001` : location.origin);
export class Network {
  socket: Socket | null = null;
  state: Snapshot | null = null;
  connected = false;
  devTools = false;
  endpoint = '';
  onState: (s: Snapshot) => void = () => {};
  onConnection: (s: boolean) => void = () => {};
  onError: (e: string) => void = () => {};
  onReset: () => void = () => {};
  onResumed: () => void = () => {};
  async connect(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new Error('Enter a complete server address, such as http://localhost:3001.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol))
      throw new Error('The game server address must use HTTP or HTTPS.');
    if (this.socket?.connected && this.endpoint === parsed.origin) return;
    this.socket?.disconnect();
    this.endpoint = parsed.origin;
    const socket = io(parsed.origin, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 3000,
      timeout: 6500,
    });
    this.socket = socket;
    socket.on('snapshot', (s: Snapshot) => {
      this.state = s;
      this.onState(s);
    });
    socket.on('disconnect', () => {
      this.connected = false;
      this.onConnection(false);
    });
    socket.on('connect', () => {
      this.connected = true;
      this.onConnection(true);
      if (this.state) void this.resume().catch((e) => this.onError(e.message));
    });
    await new Promise<void>((done, fail) => {
      const onConnect = () => {
        socket.off('connect_error', onFail);
        done();
      };
      const onFail = () => {
        socket.off('connect', onConnect);
        socket.disconnect();
        fail(
          new Error(
            'Cannot reach the game server. Start the local server, or check the server address in Settings.',
          ),
        );
      };
      socket.once('connect', onConnect);
      socket.once('connect_error', onFail);
      socket.connect();
    });
  }
  async request<T = Reply>(event: string, data: unknown = null): Promise<T> {
    if (!this.socket?.connected) throw new Error('Connection lost. Reconnecting to the ship…');
    return new Promise((done, fail) => {
      this.socket!.timeout(15000).emit(event, data, (err: Error | null, result: Reply) => {
        if (err) fail(new Error('The ship did not respond. Please try again.'));
        else if (!result?.ok) fail(new Error(result?.error ?? 'Request failed.'));
        else done(result as T);
      });
    });
  }
  async join(name: string, url: string, code?: string) {
    await this.connect(url);
    const reply = await this.request<Reply & { devTools: boolean }>(
      code ? 'room:join' : 'room:create',
      { name, code },
    );
    sessionStorage.setItem(
      'titanic-session',
      JSON.stringify({ code: reply.code, id: reply.id, token: reply.token }),
    );
    this.devTools = reply.devTools;
    return reply;
  }
  async resume() {
    const saved = sessionStorage.getItem('titanic-session');
    if (!saved) return;
    try {
      const reply = await this.request<Reply & { devTools: boolean }>(
        'room:reconnect',
        JSON.parse(saved),
      );
      this.devTools = reply.devTools;
      this.onResumed();
    } catch (e) {
      sessionStorage.removeItem('titanic-session');
      this.state = null;
      this.onReset();
      throw e;
    }
  }
  async solo(name: string, url: string, options: StartOptions) {
    await this.connect(url);
    const reply = await this.request<Reply & { devTools: boolean }>('room:solo', { name, options });
    sessionStorage.setItem(
      'titanic-session',
      JSON.stringify({ code: reply.code, id: reply.id, token: reply.token }),
    );
    this.devTools = reply.devTools;
    return reply;
  }
  async leave() {
    try {
      if (this.socket?.connected) await this.request('room:leave');
    } catch {
      /* A lost room must still be escapable. */
    } finally {
      sessionStorage.removeItem('titanic-session');
      this.state = null;
      this.socket?.disconnect();
      this.socket = null;
      this.onReset();
    }
  }
  action(action: Action) {
    return this.request('action', action);
  }
}
export const network = new Network();
