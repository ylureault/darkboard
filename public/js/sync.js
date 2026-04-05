// #198: sync.js - WebSocket synchronization client for real-time collaboration.
// Manages connection lifecycle, message sending/receiving, reconnection, and offline queueing.

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
    this._opBatchQueue = []; // #180: batch operations during rapid updates
    this._opBatchTimer = null;
    this._maxMessageSize = 500 * 1024; // #195: 500KB warning threshold
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
        // Load comments from server
        if (msg.comments) {
          this.app.renderer.comments = msg.comments;
        }
        // Load tag registry
        if (msg.tagRegistry) {
          this.app.tagRegistry = msg.tagRegistry;
        }

        if (this.app.workshop) {
          this.app.workshop.setFacilitator(msg.isFacilitator, msg.facilitatorId);
          if (msg.anchors) this.app.workshop.loadAnchors(msg.anchors);
          if (msg.timer) this.app.workshop.syncTimer(msg.timer);
          if (msg.voting) this.app.workshop.syncVoting(msg.voting);
          if (msg.isolation) this.app.workshop.syncIsolation(msg.isolation);
          if (msg.followMode) this.app.workshop.syncFollowMode(msg.followMode, msg.facilitatorId);
          if (msg.roundRobin) this.app.workshop.syncRoundRobin(msg.roundRobin);
          if (msg.checkin) this.app.workshop.syncCheckin(msg.checkin);
        }
        // #R2-182: Show activity summary on reconnect
        if (msg.activitySummary && this.app.showActivitySummary) {
          this.app.showActivitySummary(msg.activitySummary);
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
        this.app.showToast(`${msg.name} a rejoint le tableau`, 'success');
        // #193 - Pulse animation on users panel
        const usersPanel = document.querySelector('.users-panel');
        if (usersPanel) {
          usersPanel.classList.remove('new-user-pulse');
          void usersPanel.offsetWidth; // Force reflow
          usersPanel.classList.add('new-user-pulse');
        }
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

      case 'round-robin-sync':
        if (this.app.workshop) this.app.workshop.syncRoundRobin(msg);
        break;

      case 'checkin-sync':
        if (this.app.workshop) this.app.workshop.syncCheckin(msg);
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

      // Comments
      case 'tag-registry-update':
        this.app.tagRegistry = msg.tags;
        break;

      case 'chat':
        this.app.onChatMessage(msg);
        break;

      case 'webrtc-signal':
        this.app.onWebRTCSignal(msg);
        break;

      case 'reaction':
        this.app.onReaction(msg);
        break;

      case 'comment-add': {
        const c = msg.comment;
        // Avoid duplicate
        const existing = this.app.renderer.comments.findIndex(x => x.id === c.id);
        if (existing === -1) {
          this.app.renderer.comments.push(c);
        }
        this.app.renderer.markDirty();
        // Check if current user is mentioned
        if (c.mentions && c.mentions.includes(this.app.myUserId)) {
          this.app.showToast(`${c.author} vous a mentionne dans un commentaire`);
        }
        break;
      }

      case 'comment-update': {
        const idx = this.app.renderer.comments.findIndex(c => c.id === msg.commentId);
        if (idx !== -1) {
          Object.assign(this.app.renderer.comments[idx], msg.props);
        }
        this.app.renderer.markDirty();
        // Check if a new reply mentions current user
        if (msg.props && msg.props.replies) {
          const lastReply = msg.props.replies[msg.props.replies.length - 1];
          if (lastReply && lastReply.mentions && lastReply.mentions.includes(this.app.myUserId)) {
            this.app.showToast(`${lastReply.author} vous a mentionne dans une reponse`);
          }
        }
        break;
      }

      case 'comment-delete': {
        const idx = this.app.renderer.comments.findIndex(c => c.id === msg.commentId);
        if (idx !== -1) {
          this.app.renderer.comments.splice(idx, 1);
        }
        this.app.renderer.markDirty();
        break;
      }
    }
  }

  send(msg) {
    if (!this.connected || !this.ws) {
      // #187: Queue all messages while offline for retry on reconnection
      this.offlineQueue.push(msg);
      return;
    }
    // #195: Warn if message is too large
    const data = JSON.stringify(msg);
    if (data.length > this._maxMessageSize) {
      console.warn('SyncClient: message exceeds 500KB (' + Math.round(data.length / 1024) + 'KB). Consider reducing payload.');
    }
    try {
      this.ws.send(data);
    } catch (e) {
      console.error('SyncClient: send failed, queueing message', e);
      this.offlineQueue.push(msg);
    }
  }

  sendOps(ops) {
    // #185: Merge consecutive updates to same element before sending
    const compressedOps = this.compressOps(ops);
    const msg = {
      type: 'op',
      boardId: getBoardId(),
      ops: compressedOps
    };
    if (!this.connected || !this.ws) {
      this.offlineQueue.push(msg);
      this.updateSyncIndicator('offline', 'Hors ligne (' + this.offlineQueue.length + ' en attente)');
      return;
    }
    // #195: Warn if message is too large
    const data = JSON.stringify(msg);
    if (data.length > this._maxMessageSize) {
      console.warn('SyncClient: ops message exceeds 500KB (' + Math.round(data.length / 1024) + 'KB)');
    }
    try {
      this.ws.send(data);
    } catch (e) {
      console.error('SyncClient: sendOps failed, queueing', e);
      this.offlineQueue.push(msg);
      return;
    }
    this.showSaved();
    // #81 - Auto-save indicator
    if (this.app && this.app.showSaveIndicator) this.app.showSaveIndicator();
  }

  // #180: Batch rapid operations (e.g., during drag) and send in batches every 50ms
  sendOpsBatched(ops) {
    this._opBatchQueue.push(...ops);
    if (!this._opBatchTimer) {
      this._opBatchTimer = setTimeout(() => {
        if (this._opBatchQueue.length > 0) {
          this.sendOps(this._opBatchQueue.slice());
          this._opBatchQueue = [];
        }
        this._opBatchTimer = null;
      }, 50);
    }
  }

  // #185: Simple delta encoding — merge consecutive updates to the same element
  compressOps(ops) {
    if (!ops || ops.length < 2) return ops;
    const merged = [];
    for (const op of ops) {
      const last = merged[merged.length - 1];
      if (last && last.type === 'update' && op.type === 'update' && last.elementId === op.elementId) {
        Object.assign(last.props, op.props);
      } else {
        merged.push({ ...op, props: op.props ? { ...op.props } : undefined });
      }
    }
    return merged;
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

  sendComment(comment) {
    this.send({
      type: 'comment-add',
      boardId: getBoardId(),
      comment
    });
  }

  sendCommentUpdate(commentId, props) {
    this.send({
      type: 'comment-update',
      boardId: getBoardId(),
      commentId,
      props
    });
  }

  sendTagRegistryUpdate(tags) {
    this.send({
      type: 'tag-registry-update',
      boardId: getBoardId(),
      tags
    });
  }

  sendCommentDelete(commentId) {
    this.send({
      type: 'comment-delete',
      boardId: getBoardId(),
      commentId
    });
  }

  sendChat(text) {
    this.send({
      type: 'chat',
      boardId: getBoardId(),
      text
    });
  }

  sendWebRTCSignal(targetUserId, signal) {
    this.send({
      type: 'webrtc-signal',
      boardId: getBoardId(),
      targetUserId,
      signal
    });
  }

  sendReaction(elementId, emoji) {
    this.send({
      type: 'reaction',
      boardId: getBoardId(),
      elementId,
      emoji
    });
  }
}
