export class NoopTransport {
  constructor(reason = 'No multiplayer endpoint configured') { this.reason = reason; }
  get isOpen() { return false; }
  async connect() { throw new Error(this.reason); }
  send() { return false; }
  close() {}
}

export class WebSocketTransport {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.socket = null;
    this.onMessage = () => {};
    this.onClose = () => {};
  }

  get isOpen() { return this.socket?.readyState === WebSocket.OPEN; }

  connect() {
    if (this.isOpen) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      let opened = false;
      socket.addEventListener('open', () => {
        opened = true;
        resolve();
      }, { once: true });
      socket.addEventListener('message', (event) => this.onMessage(event.data));
      socket.addEventListener('close', (event) => {
        if (this.socket === socket) this.socket = null;
        this.onClose(event);
      });
      socket.addEventListener('error', () => {
        if (!opened) reject(new Error('Could not connect to the multiplayer service.'));
      });
    });
  }

  send(message) {
    if (!this.isOpen) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  close() {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

export class MockTransport {
  constructor() { this.messages = []; this.onMessage = () => {}; this.onClose = () => {}; this.open = false; }
  get isOpen() { return this.open; }
  async connect() { this.open = true; }
  send(message) { if (!this.open) return false; this.messages.push(message); return true; }
  receive(message) { this.onMessage(typeof message === 'string' ? message : JSON.stringify(message)); }
  close() { this.open = false; this.onClose(); }
}

