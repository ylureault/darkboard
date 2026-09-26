// #198: ws-handler.js - WebSocket message handling for DarkBoard server.
// Routes incoming messages (join, ops, cursor, voting, etc.) and broadcasts to connected clients.

const { v4: uuidv4 } = require('uuid');

const COLORS = [
  '#4a9eff', '#ff6b6b', '#4ecdc4', '#ffd966', '#96ceb4',
  '#ff9ff3', '#54a0ff', '#5f27cd', '#01a3a4', '#f368e0',
  '#ff9f43', '#ee5a24', '#0abde3', '#10ac84', '#c8d6e5'
];

const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB

// Text fields that should be scrambled in isolation mode
// Plain text fields: replace every non-whitespace char with block
const PLAIN_TEXT_FIELDS = ['text', 'title', 'url', 'embedUrl'];
// Rich HTML fields: scramble text nodes only, keep tag structure intact
const RICH_TEXT_FIELDS = ['richText'];
function scrambleText(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\S/g, '█');
}
// Scramble only the text between HTML tags (and between top-level runs),
// preserving the tag structure so the client's HTML parser stays happy.
function scrambleRichText(html) {
  if (typeof html !== 'string') return html;
  // Match any text that is NOT inside a tag (i.e. outside of <...>).
  // The regex walks the string segment-by-segment.
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += scrambleText(html.slice(i));
      break;
    }
    // Scramble text up to the tag
    if (lt > i) out += scrambleText(html.slice(i, lt));
    // Copy the tag verbatim
    const gt = html.indexOf('>', lt);
    if (gt === -1) {
      // Malformed — scramble the rest as plain text
      out += scrambleText(html.slice(lt));
      break;
    }
    out += html.slice(lt, gt + 1);
    i = gt + 1;
  }
  return out;
}
function ghostElement(el) {
  if (!el) return el;
  const g = { ...el, _isolated: true };
  for (const f of PLAIN_TEXT_FIELDS) {
    if (g[f]) g[f] = scrambleText(String(g[f]));
  }
  for (const f of RICH_TEXT_FIELDS) {
    if (g[f]) g[f] = scrambleRichText(String(g[f]));
  }
  return g;
}
function ghostProps(props) {
  if (!props) return props;
  const g = { ...props, _isolated: true };
  for (const f of PLAIN_TEXT_FIELDS) {
    if (g[f] !== undefined && g[f] !== null) g[f] = scrambleText(String(g[f]));
  }
  for (const f of RICH_TEXT_FIELDS) {
    if (g[f] !== undefined && g[f] !== null) g[f] = scrambleRichText(String(g[f]));
  }
  return g;
}

// #192: Per-client, per-message-type rate limiting (max 100 ops/sec)
const MAX_OPS_PER_SEC = 100;
const _messageRateMap = new Map();
function checkMessageRate(clientId, msgType) {
  const key = `${clientId}:${msgType}`;
  const now = Date.now();
  const entry = _messageRateMap.get(key);
  if (!entry || now > entry.resetTime) {
    _messageRateMap.set(key, { count: 1, resetTime: now + 1000 });
    return true;
  }
  if (entry.count >= MAX_OPS_PER_SEC) {
    return false;
  }
  entry.count++;
  return true;
}
// Clean up stale rate limit entries every 30s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _messageRateMap) {
    if (now > entry.resetTime) _messageRateMap.delete(key);
  }
}, 30000);

// Required fields for each message type.
// These validators enforce basic shape AND size bounds on untrusted fields
// so a single client can't send oversized strings that would be broadcast
// to every other client on the board.
const MAX_NAME_LEN = 60;
const MAX_ID_LEN = 128;
const MAX_EMOJI_LEN = 16;
const MAX_ACTION_LEN = 32;
const MAX_STATUS_LEN = 32;
const isStr = (v, maxLen) => typeof v === 'string' && v.length > 0 && v.length <= maxLen;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const MESSAGE_VALIDATORS = {
  'join': (msg) => isStr(msg.boardId, MAX_ID_LEN),
  'set-name': (msg) => isStr(msg.name, MAX_NAME_LEN),
  'op': (msg) => Array.isArray(msg.ops) && msg.ops.length > 0 && msg.ops.length <= 500,
  'cursor': (msg) => isNum(msg.x) && isNum(msg.y),
  'selection': (msg) => Array.isArray(msg.ids) && msg.ids.length <= 500
    && msg.ids.every((id) => isStr(id, MAX_ID_LEN)),
  'anchor-add': (msg) => msg.anchor && isStr(msg.anchor.name, MAX_NAME_LEN)
    && isNum(msg.anchor.x) && isNum(msg.anchor.y)
    && (msg.anchor.zoom === undefined || (isNum(msg.anchor.zoom) && msg.anchor.zoom > 0 && msg.anchor.zoom <= 100)),
  'anchor-update': (msg) => isStr(msg.anchorId, MAX_ID_LEN) && msg.props && typeof msg.props === 'object',
  'anchor-delete': (msg) => isStr(msg.anchorId, MAX_ID_LEN),
  'timer-start': (msg) => isNum(msg.duration) && msg.duration > 0 && msg.duration <= 24 * 3600,
  'vote-start': (msg) => (msg.quota === undefined
    || (isNum(msg.quota) && Number.isInteger(msg.quota) && msg.quota > 0 && msg.quota <= 1000))
    && (msg.hideResults === undefined || typeof msg.hideResults === 'boolean'),
  'vote-cast': (msg) => isStr(msg.elementId, MAX_ID_LEN),
  'vote-uncast': (msg) => isStr(msg.elementId, MAX_ID_LEN),
  'laser': (msg) => isNum(msg.x) && isNum(msg.y),
  'follow-view': (msg) => isNum(msg.x) && isNum(msg.y),
  'goto-user': (msg) => isStr(msg.targetUserId, MAX_ID_LEN),
  'comment-add': (msg) => msg.comment && isStr(msg.comment.id, MAX_ID_LEN),
  'comment-update': (msg) => isStr(msg.commentId, MAX_ID_LEN) && msg.props && typeof msg.props === 'object',
  'comment-delete': (msg) => isStr(msg.commentId, MAX_ID_LEN),
  'tag-registry-update': (msg) => Array.isArray(msg.tags) && msg.tags.length <= 200,
  'chat': (msg) => typeof msg.text === 'string' && msg.text.length > 0 && msg.text.length <= 500,
  'webrtc-signal': (msg) => isStr(msg.targetUserId, MAX_ID_LEN) && msg.signal,
  'reaction': (msg) => isStr(msg.elementId, MAX_ID_LEN) && isStr(msg.emoji, MAX_EMOJI_LEN),
  'round-robin': (msg) => isStr(msg.action, MAX_ACTION_LEN),
  'checkin-start': (msg) => true,
  'checkin-vote': (msg) => isStr(msg.emoji, MAX_EMOJI_LEN),
  'ping': (msg) => isNum(msg.x) && isNum(msg.y),
  'typing': (msg) => true,
  'fishbowl': (msg) => typeof msg.active === 'boolean'
    && (msg.editorId === undefined || isStr(msg.editorId, MAX_ID_LEN))
    && (msg.editorName === undefined || isStr(msg.editorName, MAX_NAME_LEN)),
  'presence': (msg) => isStr(msg.status, MAX_STATUS_LEN),
  // claim-facilitator takes no fields; authorization is enforced in the handler.
  'claim-facilitator': () => true,
};

let colorIndex = 0;

// Heartbeat: ping all clients every 30s, terminate dead ones
let heartbeatInterval = null;
function startHeartbeat(wss) {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
}

function handleWebSocket(ws, req, boardStore, wss) {
  // Start heartbeat on first connection if wss is provided
  if (wss) startHeartbeat(wss);
  let userId = null;
  let boardId = null;
  let userName = null;
  let userColor = COLORS[colorIndex++ % COLORS.length];
  let isFacilitator = false;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // #175 - Per-client message rate limiting.
  // Presence frames (cursor, selection, laser) are fire-and-forget and far more
  // frequent than real edits, so they get their own generous allowance. Sharing
  // one budget meant a normal drag could spend it and get the client's actual
  // operations rejected — with an error per rejected message.
  let msgCount = 0;
  let msgResetTime = Date.now();
  let presenceCount = 0;
  let presenceResetTime = Date.now();
  let rateWarnedAt = 0;
  const MSG_RATE_LIMIT = 100;
  const MSG_RATE_WINDOW = 1000;
  const PRESENCE_RATE_LIMIT = 200;
  const PRESENCE_TYPES = new Set(['cursor', 'selection', 'laser', 'presence']);

  // #176 - Error handling wrapper for safe send
  const safeSend = (client, data) => {
    try {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(typeof data === 'string' ? data : JSON.stringify(data));
      }
    } catch (e) {
      console.error('WebSocket send error:', e.message);
    }
  };

  ws.on('message', (data) => {
    const now = Date.now();

    // Reject messages larger than 1MB
    const rawSize = typeof data === 'string' ? data.length : data.byteLength || data.length;
    if (rawSize > MAX_MESSAGE_SIZE) {
      safeSend(ws, { type: 'error', message: 'Message too large (max 1MB)' });
      return;
    }

    // #175 - Rate limiting, split between presence and everything else.
    const peekType = (() => {
      try { return JSON.parse(typeof data === 'string' ? data : data.toString()).type; }
      catch (e) { return null; }
    })();

    if (PRESENCE_TYPES.has(peekType)) {
      if (now - presenceResetTime > MSG_RATE_WINDOW) {
        presenceCount = 0;
        presenceResetTime = now;
      }
      presenceCount++;
      // Silently drop excess presence: telling someone their cursor updates were
      // throttled is noise, and the next frame supersedes the dropped one anyway.
      if (presenceCount > PRESENCE_RATE_LIMIT) return;
    } else {
      if (now - msgResetTime > MSG_RATE_WINDOW) {
        msgCount = 0;
        msgResetTime = now;
      }
      msgCount++;
      if (msgCount > MSG_RATE_LIMIT) {
        // One warning per window, not one per rejected message — the old
        // behaviour turned a brief burst into a wall of identical toasts.
        if (now - rateWarnedAt > MSG_RATE_WINDOW) {
          rateWarnedAt = now;
          safeSend(ws, { type: 'error', message: 'Trop d\'opérations d\'un coup. Ralentissez un instant.' });
        }
        return;
      }
    }

    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return;
    }

    // Validate required fields for known message types
    if (msg.type && MESSAGE_VALIDATORS[msg.type]) {
      if (!MESSAGE_VALIDATORS[msg.type](msg)) {
        safeSend(ws, { type: 'error', message: `Invalid ${msg.type} message: missing required fields` });
        return;
      }
    }

    // #192: Per-client, per-message-type rate limiting (max 100 ops/sec)
    if (userId && msg.type === 'op') {
      if (!checkMessageRate(userId, 'op')) {
        safeSend(ws, { type: 'error', message: 'Rate limit: too many operations per second' });
        return;
      }
    }

    switch (msg.type) {
      case 'join': {
        // Validator already enforced boardId length & type; still clamp
        // userId / userName in case a client sends oversized values.
        boardId = msg.boardId;
        userId = (typeof msg.userId === 'string' && msg.userId.length > 0 && msg.userId.length <= MAX_ID_LEN)
          ? msg.userId
          : uuidv4().split('-')[0];

        const board = boardStore.getBoard(boardId);
        if (!board && !boardStore.createBoard(boardId)) {
          safeSend(ws, { type: 'error', message: 'Identifiant de tableau invalide.' });
          return;
        }
        const b = boardStore.getBoard(boardId);

        // Identity is client-supplied, so refuse an id that another live
        // connection already holds. Without this, a participant could rejoin
        // as the facilitator (whose id is broadcast in `init`) and inherit
        // every facilitator-gated action.
        for (const client of b.connections) {
          if (client !== ws && client._userData && client._userData.userId === userId) {
            userId = uuidv4().split('-')[0];
            break;
          }
        }

        userName = (typeof msg.name === 'string' && msg.name.length > 0 && msg.name.length <= MAX_NAME_LEN)
          ? msg.name
          : `User ${userId.slice(0, 4)}`;

        b.connections.add(ws);
        b.lastActivity = Date.now();

        // First user becomes facilitator
        if (!b.facilitator) {
          b.facilitator = userId;
          isFacilitator = true;
        }

        // Collect existing users
        const users = [];
        b.connections.forEach(client => {
          if (client !== ws && client._userData) {
            users.push(client._userData);
          }
        });

        ws._userData = { userId, name: userName, color: userColor, isFacilitator };

        // #R2-182: Build activity summary for reconnecting users
        let activitySummary = null;
        const lastSeen = ws._lastSeen || 0;
        if (lastSeen > 0 && b.elements.size > 0) {
          const newElements = Array.from(b.elements.values()).filter(el => el.zIndex && el.zIndex > lastSeen);
          if (newElements.length > 0) {
            activitySummary = {
              newElementCount: newElements.length,
              typeBreakdown: {},
              timeSince: Date.now() - lastSeen
            };
            for (const el of newElements) {
              activitySummary.typeBreakdown[el.type] = (activitySummary.typeBreakdown[el.type] || 0) + 1;
            }
          }
        }
        ws._lastSeen = Date.now();

        // Determine which elements to send based on isolation mode
        let elements = Array.from(b.elements.values());
        if (b.isolation && b.isolation.active) {
          // In isolation mode, new joiners see ghosted versions of others' contributions
          // (blurred placeholders) plus their own elements unchanged.
          elements = elements.map(el => el.createdBy === userId ? el : ghostElement(el));
        }

        ws.send(JSON.stringify({
          type: 'init',
          boardId,
          userId,
          color: userColor,
          elements,
          anchors: Array.from(b.anchors.values()),
          comments: Array.from(b.comments.values()),
          tagRegistry: b.tagRegistry || [],
          users,
          isFacilitator,
          facilitatorId: b.facilitator,
          timer: b.timer,
          voting: b.voting ? {
            active: b.voting.active,
            quota: b.voting.quota,
            hideResults: b.voting.hideResults,
            votes: b.voting.hideResults ? {} : b.voting.votes,
            myVotes: b.voting.userVotes ? (b.voting.userVotes[userId] || []) : []
          } : null,
          isolation: b.isolation ? { active: b.isolation.active } : null,
          followMode: b.followMode,
          roundRobin: b.roundRobin ? {
            active: b.roundRobin.active,
            currentUserId: b.roundRobin.order[b.roundRobin.index] ? b.roundRobin.order[b.roundRobin.index].userId : null,
            currentName: b.roundRobin.order[b.roundRobin.index] ? b.roundRobin.order[b.roundRobin.index].name : '',
            order: b.roundRobin.order,
            index: b.roundRobin.index
          } : null,
          checkin: b.checkin ? { active: b.checkin.active, responses: b.checkin.responses } : null,
          activitySummary // #R2-182: "While you were away..." data
        }));

        // Broadcast user join
        broadcast(b, ws, {
          type: 'user-join',
          userId,
          name: userName,
          color: userColor,
          isFacilitator
        });

        // Broadcast updated user count
        broadcastAll(b, {
          type: 'user-count',
          count: b.connections.size
        });
        break;
      }

      case 'set-name': {
        userName = msg.name;
        if (ws._userData) ws._userData.name = msg.name;
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcast(board, ws, {
            type: 'user-rename',
            userId,
            name: msg.name
          });
        }
        break;
      }

      case 'op': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;

        // Tag elements with creator for isolation mode
        for (const op of msg.ops) {
          if (op.type === 'add' && op.element) {
            op.element.createdBy = userId;
          }
        }

        boardStore.applyOps(boardId, msg.ops);

        if (board.isolation && board.isolation.active) {
          // In isolation mode, broadcast a "ghosted" version: same shape and position
          // but with text content replaced by blur placeholder, so other users can see
          // activity is happening without reading the actual content.
          const ghostOps = msg.ops.map(op => {
            if (op.type === 'add' && op.element) {
              return { ...op, element: ghostElement(op.element) };
            }
            if (op.type === 'update' && op.props) {
              return { ...op, props: ghostProps(op.props) };
            }
            return op;
          });
          broadcast(board, ws, {
            type: 'op',
            userId,
            ops: ghostOps,
            isolated: true
          });
          break;
        }

        broadcast(board, ws, {
          type: 'op',
          userId,
          ops: msg.ops
        });
        break;
      }

      // Mirror each participant's selection so everyone can see what the others
      // are working on, not just where their pointer is.
      case 'selection': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcast(board, ws, {
            type: 'selection',
            userId,
            name: userName,
            color: userColor,
            ids: msg.ids
          });
        }
        break;
      }

      case 'cursor': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcast(board, ws, {
            type: 'cursor',
            userId,
            name: userName,
            color: userColor,
            x: msg.x,
            y: msg.y
          });
        }
        break;
      }

      // === ANCHORS ===
      case 'anchor-add': {
        if (!boardId) return;
        const anchor = {
          id: msg.anchor.id || uuidv4().split('-')[0],
          name: msg.anchor.name,
          x: msg.anchor.x,
          y: msg.anchor.y,
          zoom: msg.anchor.zoom || 1
        };
        boardStore.addAnchor(boardId, anchor);
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcastAll(board, {
            type: 'anchor-add',
            anchor
          });
        }
        break;
      }

      case 'anchor-update': {
        if (!boardId) return;
        boardStore.updateAnchor(boardId, msg.anchorId, msg.props);
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcastAll(board, {
            type: 'anchor-update',
            anchorId: msg.anchorId,
            props: msg.props
          });
        }
        break;
      }

      case 'anchor-delete': {
        if (!boardId) return;
        boardStore.deleteAnchor(boardId, msg.anchorId);
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcastAll(board, {
            type: 'anchor-delete',
            anchorId: msg.anchorId
          });
        }
        break;
      }

      // === COMMENTS ===
      case 'comment-add': {
        if (!boardId) return;
        const comment = msg.comment;
        comment.author = userName;
        comment.userId = userId;
        boardStore.addComment(boardId, comment);
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcast(board, ws, {
            type: 'comment-add',
            comment
          });
        }
        break;
      }

      case 'comment-update': {
        if (!boardId) return;
        boardStore.updateComment(boardId, msg.commentId, msg.props);
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcast(board, ws, {
            type: 'comment-update',
            commentId: msg.commentId,
            props: msg.props
          });
        }
        break;
      }

      case 'comment-delete': {
        if (!boardId) return;
        boardStore.deleteComment(boardId, msg.commentId);
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcast(board, ws, {
            type: 'comment-delete',
            commentId: msg.commentId
          });
        }
        break;
      }

      // === TAG REGISTRY ===
      case 'tag-registry-update': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;
        board.tagRegistry = msg.tags;
        boardStore.debouncedSave(boardId);
        broadcast(board, ws, {
          type: 'tag-registry-update',
          tags: msg.tags
        });
        break;
      }

      // === TIMER ===
      case 'timer-start': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;
        // Only facilitator can control timer
        if (board.facilitator !== userId) return;

        board.timer = {
          duration: msg.duration, // in seconds
          startedAt: Date.now(),
          running: true,
          remaining: msg.duration
        };
        broadcastAll(board, {
          type: 'timer-sync',
          timer: board.timer
        });
        break;
      }

      case 'timer-stop': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        if (board.timer) {
          const elapsed = (Date.now() - board.timer.startedAt) / 1000;
          board.timer.remaining = Math.max(0, board.timer.duration - elapsed);
          board.timer.running = false;
        }
        broadcastAll(board, {
          type: 'timer-sync',
          timer: board.timer
        });
        break;
      }

      case 'timer-reset': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        if (board.timer) {
          board.timer.startedAt = Date.now();
          board.timer.remaining = board.timer.duration;
          board.timer.running = true;
        }
        broadcastAll(board, {
          type: 'timer-sync',
          timer: board.timer
        });
        break;
      }

      case 'timer-clear': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;
        board.timer = null;
        broadcastAll(board, {
          type: 'timer-sync',
          timer: null
        });
        break;
      }

      // === VOTING ===
      case 'vote-start': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        board.voting = {
          active: true,
          quota: msg.quota || 3,
          hideResults: msg.hideResults !== false,
          votes: {},      // elementId -> count
          userVotes: {},  // userId -> [elementIds]
          voterDetails: {} // elementId -> [{name, color}]
        };
        broadcastAll(board, {
          type: 'vote-sync',
          voting: {
            active: true,
            quota: board.voting.quota,
            hideResults: board.voting.hideResults,
            votes: {},
            myVotes: []
          }
        });
        break;
      }

      case 'vote-cast': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || !board.voting || !board.voting.active) return;

        const elementId = msg.elementId;
        if (!board.voting.userVotes[userId]) {
          board.voting.userVotes[userId] = [];
        }

        const myVotes = board.voting.userVotes[userId];
        // Check quota (0 = unlimited)
        if (board.voting.quota > 0 && myVotes.length >= board.voting.quota) {
          ws.send(JSON.stringify({
            type: 'vote-error',
            message: 'Plus de votes disponibles'
          }));
          return;
        }

        myVotes.push(elementId);
        board.voting.votes[elementId] = (board.voting.votes[elementId] || 0) + 1;

        // Track voter details
        if (!board.voting.voterDetails[elementId]) board.voting.voterDetails[elementId] = [];
        board.voting.voterDetails[elementId].push({ name: userName, color: userColor, userId });

        // Send updated vote count to voter
        ws.send(JSON.stringify({
          type: 'vote-update',
          myVotes: myVotes,
          elementId,
          count: board.voting.votes[elementId]
        }));

        // If results visible, broadcast to all
        if (!board.voting.hideResults) {
          broadcast(board, ws, {
            type: 'vote-update',
            elementId,
            count: board.voting.votes[elementId]
          });
        }
        break;
      }

      case 'vote-uncast': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || !board.voting || !board.voting.active) return;

        const elementId = msg.elementId;
        if (!board.voting.userVotes[userId]) return;

        const idx = board.voting.userVotes[userId].indexOf(elementId);
        if (idx === -1) return;

        board.voting.userVotes[userId].splice(idx, 1);
        board.voting.votes[elementId] = Math.max(0, (board.voting.votes[elementId] || 0) - 1);

        // Remove voter detail
        if (board.voting.voterDetails[elementId]) {
          const vIdx = board.voting.voterDetails[elementId].findIndex(v => v.userId === userId);
          if (vIdx !== -1) board.voting.voterDetails[elementId].splice(vIdx, 1);
        }

        ws.send(JSON.stringify({
          type: 'vote-update',
          myVotes: board.voting.userVotes[userId],
          elementId,
          count: board.voting.votes[elementId]
        }));

        if (!board.voting.hideResults) {
          broadcast(board, ws, {
            type: 'vote-update',
            elementId,
            count: board.voting.votes[elementId]
          });
        }
        break;
      }

      case 'vote-reveal': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || !board.voting || board.facilitator !== userId) return;

        board.voting.hideResults = false;
        broadcastAll(board, {
          type: 'vote-reveal',
          votes: board.voting.votes,
          voterDetails: board.voting.voterDetails || {}
        });
        break;
      }

      case 'vote-end': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        const results = board.voting ? board.voting.votes : {};
        const voterDetails = board.voting ? (board.voting.voterDetails || {}) : {};
        board.voting = null;
        broadcastAll(board, {
          type: 'vote-end',
          results,
          voterDetails
        });
        break;
      }

      // === ISOLATION MODE ===
      case 'isolation-start': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        board.isolation = { active: true, startedAt: Date.now() };
        broadcastAll(board, {
          type: 'isolation-sync',
          isolation: { active: true }
        });
        break;
      }

      case 'isolation-reveal': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        board.isolation = null;

        // Gather ALL elements and send to everyone
        const allElements = Array.from(board.elements.values());
        // Shuffle for random reveal order
        for (let i = allElements.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allElements[i], allElements[j]] = [allElements[j], allElements[i]];
        }

        broadcastAll(board, {
          type: 'isolation-reveal',
          elements: allElements
        });
        break;
      }

      case 'isolation-cancel': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        board.isolation = null;
        broadcastAll(board, {
          type: 'isolation-sync',
          isolation: { active: false }
        });
        break;
      }

      // === FOLLOW MODE / MODERATION ===
      case 'follow-start': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        board.followMode = true;
        broadcastAll(board, {
          type: 'follow-sync',
          active: true,
          facilitatorId: userId
        });
        break;
      }

      case 'follow-stop': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        board.followMode = false;
        broadcastAll(board, {
          type: 'follow-sync',
          active: false
        });
        break;
      }

      case 'follow-view': {
        // Facilitator broadcasts their view position
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || !board.followMode) return;
        // Only facilitator sends view updates
        if (board.facilitator !== userId) return;

        broadcast(board, ws, {
          type: 'follow-view',
          x: msg.x,
          y: msg.y,
          zoom: msg.zoom
        });
        break;
      }

      case 'goto-user': {
        // Ask a specific user for their position
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;

        // Find target user's last cursor position
        let targetPos = null;
        board.connections.forEach(client => {
          if (client._userData && client._userData.userId === msg.targetUserId && client._lastCursorPos) {
            targetPos = client._lastCursorPos;
          }
        });

        if (targetPos) {
          ws.send(JSON.stringify({
            type: 'goto-position',
            x: targetPos.x,
            y: targetPos.y
          }));
        }
        break;
      }

      // === LASER POINTER ===
      case 'laser': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcast(board, ws, {
            type: 'laser',
            userId,
            name: userName,
            color: userColor,
            x: msg.x,
            y: msg.y
          });
        }
        break;
      }

      // === CHAT ===
      case 'chat': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;
        broadcastAll(board, {
          type: 'chat',
          userId,
          name: userName,
          color: userColor,
          text: msg.text,
          timestamp: Date.now()
        });
        break;
      }

      // === WEBRTC SIGNALING ===
      case 'webrtc-signal': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;
        // Forward signal to the target user
        board.connections.forEach(client => {
          if (client._userData && client._userData.userId === msg.targetUserId && client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'webrtc-signal',
              userId,
              signal: msg.signal
            }));
          }
        });
        break;
      }

      // === REACTIONS ===
      case 'reaction': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;
        const el = board.elements.get(msg.elementId);
        if (!el) return;
        if (!el.reactions) el.reactions = [];
        el.reactions.push({ userId, emoji: msg.emoji, timestamp: Date.now() });
        boardStore.debouncedSave(boardId);
        broadcastAll(board, {
          type: 'reaction',
          elementId: msg.elementId,
          userId,
          emoji: msg.emoji,
          timestamp: Date.now()
        });
        break;
      }

      // === CLAIM FACILITATOR ===
      // Only allowed when the board has no facilitator yet, OR the current
      // facilitator is no longer connected. Otherwise any client could send
      // this message and seize control.
      case 'claim-facilitator': {
        if (!boardId || !userId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;

        const currentFacilitatorId = board.facilitator;
        let facilitatorConnected = false;
        if (currentFacilitatorId) {
          for (const client of board.connections) {
            if (client._userData && client._userData.userId === currentFacilitatorId) {
              facilitatorConnected = true;
              break;
            }
          }
        }
        if (currentFacilitatorId && facilitatorConnected && currentFacilitatorId !== userId) {
          safeSend(ws, { type: 'error', message: 'Un facilitateur est déjà actif sur ce tableau.' });
          return;
        }

        board.facilitator = userId;
        isFacilitator = true;
        if (ws._userData) ws._userData.isFacilitator = true;

        // Reset other users' facilitator status
        board.connections.forEach(client => {
          if (client !== ws && client._userData) {
            client._userData.isFacilitator = false;
          }
        });

        broadcastAll(board, {
          type: 'facilitator-change',
          facilitatorId: userId,
          facilitatorName: userName
        });
        break;
      }

      // === ROUND ROBIN ===
      case 'round-robin': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        if (msg.action === 'start') {
          // Build order from connected users
          const order = [];
          board.connections.forEach(client => {
            if (client._userData) {
              order.push({ userId: client._userData.userId, name: client._userData.name });
            }
          });
          board.roundRobin = { active: true, order, index: 0 };
          broadcastAll(board, {
            type: 'round-robin-sync',
            active: true,
            currentUserId: order[0] ? order[0].userId : null,
            currentName: order[0] ? order[0].name : '',
            order,
            index: 0
          });
        } else if (msg.action === 'next') {
          if (!board.roundRobin || !board.roundRobin.active) return;
          board.roundRobin.index++;
          if (board.roundRobin.index >= board.roundRobin.order.length) {
            // Round complete
            board.roundRobin = null;
            broadcastAll(board, {
              type: 'round-robin-sync',
              active: false,
              currentUserId: null,
              currentName: '',
              order: [],
              index: -1
            });
          } else {
            const current = board.roundRobin.order[board.roundRobin.index];
            broadcastAll(board, {
              type: 'round-robin-sync',
              active: true,
              currentUserId: current.userId,
              currentName: current.name,
              order: board.roundRobin.order,
              index: board.roundRobin.index
            });
          }
        } else if (msg.action === 'stop') {
          board.roundRobin = null;
          broadcastAll(board, {
            type: 'round-robin-sync',
            active: false,
            currentUserId: null,
            currentName: '',
            order: [],
            index: -1
          });
        }
        break;
      }

      // === CHECK-IN / CHECK-OUT ===
      case 'checkin-start': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || board.facilitator !== userId) return;

        board.checkin = { active: true, responses: {} };
        broadcastAll(board, {
          type: 'checkin-sync',
          active: true,
          responses: {}
        });
        break;
      }

      case 'checkin-vote': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board || !board.checkin || !board.checkin.active) return;

        board.checkin.responses[userId] = { name: userName, emoji: msg.emoji, color: userColor };
        broadcastAll(board, {
          type: 'checkin-sync',
          active: true,
          responses: board.checkin.responses
        });
        break;
      }

      // #R2-136: Broadcast ping location to all board users
      case 'ping': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;
        broadcast(board, ws, {
          type: 'ping',
          userId,
          name: userName,
          x: msg.x,
          y: msg.y
        });
        break;
      }

      // #R2-131: Broadcast typing indicator
      case 'typing': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;
        broadcast(board, ws, {
          type: 'typing',
          userId,
          name: userName
        });
        break;
      }

      // #R2-112: Handle fishbowl mode updates
      case 'fishbowl': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        // Fishbowl decides who may edit, so it is facilitator-only like every
        // other moderation mode.
        if (!board || board.facilitator !== userId) return;
        board.fishbowl = { active: msg.active, editorId: msg.editorId, editorName: msg.editorName };
        broadcastAll(board, {
          type: 'fishbowl',
          active: msg.active,
          editorId: msg.editorId,
          editorName: msg.editorName
        });
        break;
      }

      // #R2-134: Broadcast presence status
      case 'presence': {
        if (!boardId) return;
        const board = boardStore.getBoard(boardId);
        if (!board) return;
        broadcast(board, ws, {
          type: 'presence',
          userId,
          status: msg.status
        });
        break;
      }
    }

    // Store last cursor position for goto-user
    if (msg.type === 'cursor') {
      ws._lastCursorPos = { x: msg.x, y: msg.y };
    }
  });

  // #177 - Graceful error handling
  ws.on('error', (err) => {
    console.error(`WebSocket error for user ${userId || 'unknown'}:`, err.message);
  });

  ws.on('close', () => {
    if (boardId) {
      const board = boardStore.getBoard(boardId);
      if (board) {
        board.connections.delete(ws);
        broadcast(board, ws, {
          type: 'user-leave',
          userId
        });

        // Broadcast updated user count
        broadcastAll(board, {
          type: 'user-count',
          count: board.connections.size
        });

        // If facilitator leaves, assign to next user
        if (board.facilitator === userId && board.connections.size > 0) {
          const nextClient = board.connections.values().next().value;
          if (nextClient && nextClient._userData) {
            board.facilitator = nextClient._userData.userId;
            nextClient._userData.isFacilitator = true;
            broadcastAll(board, {
              type: 'facilitator-change',
              facilitatorId: nextClient._userData.userId,
              facilitatorName: nextClient._userData.name
            });
          }
        }
      }
    }
  });
}

function broadcast(board, sender, message) {
  const data = JSON.stringify(message);
  board.connections.forEach(client => {
    if (client !== sender && client.readyState === 1) {
      try { client.send(data); } catch (e) { /* client disconnected */ }
    }
  });
}

function broadcastAll(board, message) {
  const data = JSON.stringify(message);
  board.connections.forEach(client => {
    if (client.readyState === 1) {
      try { client.send(data); } catch (e) { /* client disconnected */ }
    }
  });
}

module.exports = { handleWebSocket, MESSAGE_VALIDATORS };
