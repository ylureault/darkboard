// WebSocket sync client
class SyncClient {
  constructor(app) {
    this.app = app;
    this.ws = null;
    this.connected = false;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 16000;
    this.cursorThrottle = null;
    this.reconnectAttempts = 0;
    this.offlineQueue = [];
    this.onlineUserCount = 0;
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
      this.reconnectAttempts = 0;
      this.updateSyncIndicator('online', 'En ligne');
      console.log('Connected to DarkBoard server');

      // Join board with name
      this.ws.send(JSON.stringify({
        type: 'join',
        boardId: getBoardId(),
        userId: getSessionId(),
        name: this.app.userName
      }));

      // Flush offline queue
      if (this.offlineQueue.length > 0) {
        console.log('Flushing ' + this.offlineQueue.length + ' queued operations');
        const queue = this.offlineQueue.slice();
        this.offlineQueue = [];
        for (const msg of queue) {
          this.ws.send(JSON.stringify(msg));
        }
        this.showSaved();
      }
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
      this.updateSyncIndicator('offline', 'Hors ligne');
      console.log('Disconnected from server');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      console.error('WebSocket error');
    };
  }

  scheduleReconnect() {
    this.reconnectAttempts++;
    this.updateSyncIndicator('syncing', 'Reconnexion... (tentative ' + this.reconnectAttempts + ')');
    setTimeout(() => {
      console.log('Attempting to reconnect (attempt ' + this.reconnectAttempts + ')...');
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  updateSyncIndicator(state, text) {
    const dot = document.getElementById('syncDot');
    const label = document.getElementById('syncText');
    if (!dot || !label) return;
    dot.className = 'sync-dot ' + state;
    label.textContent = text;
  }

  updateOnlineCount() {
    // Count remote users + self
    this.onlineUserCount = this.app.renderer.remoteUsers.size + 1;
    const el = document.getElementById('syncUsers');
    if (el) {
      el.textContent = this.onlineUserCount + ' utilisateur' + (this.onlineUserCount !== 1 ? 's' : '') + ' en ligne';
    }
  }

  showSaved() {
    const now = new Date();
    const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.updateSyncIndicator('online', 'Sauvegarde a ' + time);
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'init':
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
        this.app.myUserId = msg.userId;
        this.app.isFacilitator = msg.isFacilitator;
        this.app.updateUsersPanel();
        this.app.renderer.markDirty();
        this.updateOnlineCount();
        this.app.updateEmptyHint();

        // Init workshop state
        if (this.app.workshop) {
          this.app.workshop.setFacilitator(msg.isFacilitator, msg.facilitatorId);
          if (msg.anchors) this.app.workshop.loadAnchors(msg.anchors);
          if (msg.timer) this.app.workshop.syncTimer(msg.timer);
          if (msg.voting) this.app.workshop.syncVoting(msg.voting);
          if (msg.isolation) this.app.workshop.syncIsolation(msg.isolation);
          if (msg.followMode) this.app.workshop.syncFollowMode(msg.followMode, msg.facilitatorId);
        }
        break;

      case 'op':
        this.app.applyOps(msg.ops);
        break;

      case 'cursor':
        this.app.renderer.remoteUsers.set(msg.userId, {
          x: msg.x,
          y: msg.y,
          name: msg.name,
          color: msg.color,
          lastActivity: Date.now()
        });
        this.app.renderer.markDirty();
        break;

      case 'user-join':
        this.app.renderer.remoteUsers.set(msg.userId, {
          x: 0, y: 0,
          name: msg.name,
          color: msg.color,
          isFacilitator: msg.isFacilitator,
          lastActivity: Date.now()
        });
        this.app.updateUsersPanel();
        this.updateOnlineCount();
        this.app.showToast(`${msg.name} a rejoint le tableau`);
        break;

      case 'user-leave':
        this.app.renderer.remoteUsers.delete(msg.userId);
        this.app.updateUsersPanel();
        this.updateOnlineCount();
        this.app.renderer.markDirty();
        break;

      case 'user-rename': {
        const user = this.app.renderer.remoteUsers.get(msg.userId);
        if (user) user.name = msg.name;
        this.app.updateUsersPanel();
        break;
      }

      case 'facilitator-change':
        this.app.isFacilitator = (msg.facilitatorId === this.app.myUserId);
        if (this.app.workshop) {
          this.app.workshop.setFacilitator(this.app.isFacilitator, msg.facilitatorId);
        }
        // Update remote users
        this.app.renderer.remoteUsers.forEach((user, uid) => {
          user.isFacilitator = (uid === msg.facilitatorId);
        });
        this.app.updateUsersPanel();
        if (this.app.isFacilitator) {
          this.app.showToast('Vous etes maintenant animateur');
        }
        break;

      // Workshop messages
      case 'timer-sync':
        if (this.app.workshop) this.app.workshop.syncTimer(msg.timer);
        break;

      case 'vote-sync':
        if (this.app.workshop) this.app.workshop.syncVoting(msg.voting);
        break;

      case 'vote-update':
        if (this.app.workshop) this.app.workshop.handleVoteUpdate(msg);
        break;

      case 'vote-reveal':
        if (this.app.workshop) this.app.workshop.handleVoteReveal(msg);
        break;

      case 'vote-end':
        if (this.app.workshop) this.app.workshop.handleVoteEnd(msg);
        break;

      case 'vote-error':
        this.app.showToast(msg.message);
        break;

      case 'isolation-sync':
        if (this.app.workshop) this.app.workshop.syncIsolation(msg.isolation);
        break;

      case 'isolation-reveal':
        if (this.app.workshop) this.app.workshop.handleIsolationReveal(msg);
        break;

      case 'follow-sync':
        if (this.app.workshop) this.app.workshop.syncFollowMode(msg.active, msg.facilitatorId);
        break;

      case 'follow-view':
        if (this.app.workshop) this.app.workshop.handleFollowView(msg);
        break;

      case 'goto-position':
        this.app.animateToView(msg.x, msg.y);
        break;

      case 'laser':
        if (msg.userId !== this.app.myUserId) {
          this.app.renderer.laserPointers.set(msg.userId, {
            x: msg.x, y: msg.y,
            color: msg.color || '#ff0000',
            name: msg.name
          });
          this.app.renderer.markDirty();
          // Auto-clear after 3 seconds of inactivity
          clearTimeout(this._laserTimers && this._laserTimers[msg.userId]);
          if (!this._laserTimers) this._laserTimers = {};
          this._laserTimers[msg.userId] = setTimeout(() => {
            this.app.renderer.laserPointers.delete(msg.userId);
            this.app.renderer.markDirty();
          }, 3000);
        }
        break;

      // Anchors
      case 'anchor-add':
        if (this.app.workshop) this.app.workshop.handleAnchorAdd(msg);
        break;

      case 'anchor-update':
        if (this.app.workshop) this.app.workshop.handleAnchorUpdate(msg);
        break;

      case 'anchor-delete':
        if (this.app.workshop) this.app.workshop.handleAnchorDelete(msg);
        break;
    }
  }

  send(msg) {
    if (!this.connected || !this.ws) {
      // Queue operation messages while offline
      if (msg.type === 'op') {
        this.offlineQueue.push(msg);
      }
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  sendOps(ops) {
    const msg = {
      type: 'op',
      boardId: getBoardId(),
      ops
    };
    if (!this.connected || !this.ws) {
      this.offlineQueue.push(msg);
      this.updateSyncIndicator('offline', 'Hors ligne (' + this.offlineQueue.length + ' en attente)');
      return;
    }
    this.ws.send(JSON.stringify(msg));
    this.showSaved();
  }

  sendCursor(x, y) {
    if (!this.connected || !this.ws) return;
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

  sendLaser(x, y) {
    this.send({
      type: 'laser',
      boardId: getBoardId(),
      x, y
    });
  }

  sendName(name) {
    this.send({ type: 'set-name', name });
  }
}
