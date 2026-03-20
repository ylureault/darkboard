// WebSocket sync client
class SyncClient {
  constructor(app) {
    this.app = app;
    this.ws = null;
    this.connected = false;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 16000;
    this.cursorThrottle = null;
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.error('WebSocket connection failed:', e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      console.log('Connected to DarkBoard server');

      // Join board
      this.ws.send(JSON.stringify({
        type: 'join',
        boardId: getBoardId(),
        userId: getSessionId()
      }));
    };

    this.ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.connected = false;
      console.log('Disconnected from server');
      this.scheduleReconnect();
    };

    this.ws.onerror = (e) => {
      console.error('WebSocket error');
    };
  }

  scheduleReconnect() {
    setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'init':
        // Load initial board state
        this.app.renderer.elements.clear();
        if (msg.elements) {
          for (const el of msg.elements) {
            this.app.renderer.elements.set(el.id, el);
          }
        }
        if (msg.users) {
          for (const user of msg.users) {
            this.app.renderer.remoteUsers.set(user.userId, user);
          }
        }
        this.app.myColor = msg.color;
        this.app.updateUsersPanel();
        this.app.renderer.markDirty();
        break;

      case 'op':
        // Apply remote operations
        this.app.applyOps(msg.ops);
        break;

      case 'cursor':
        this.app.renderer.remoteUsers.set(msg.userId, {
          x: msg.x,
          y: msg.y,
          name: msg.name,
          color: msg.color
        });
        this.app.renderer.markDirty();
        break;

      case 'user-join':
        this.app.renderer.remoteUsers.set(msg.userId, {
          x: 0, y: 0,
          name: msg.name,
          color: msg.color
        });
        this.app.updateUsersPanel();
        this.app.showToast(`${msg.name} a rejoint le tableau`);
        break;

      case 'user-leave':
        this.app.renderer.remoteUsers.delete(msg.userId);
        this.app.updateUsersPanel();
        this.app.renderer.markDirty();
        break;
    }
  }

  sendOps(ops) {
    if (!this.connected || !this.ws) return;
    this.ws.send(JSON.stringify({
      type: 'op',
      boardId: getBoardId(),
      ops
    }));
  }

  sendCursor(x, y) {
    if (!this.connected || !this.ws) return;
    // Throttle cursor updates
    if (this.cursorThrottle) return;
    this.cursorThrottle = setTimeout(() => {
      this.cursorThrottle = null;
    }, 50);

    this.ws.send(JSON.stringify({
      type: 'cursor',
      boardId: getBoardId(),
      x, y
    }));
  }
}
