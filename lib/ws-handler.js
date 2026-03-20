const { v4: uuidv4 } = require('uuid');

const COLORS = [
  '#4a9eff', '#ff6b6b', '#4ecdc4', '#ffd966', '#96ceb4',
  '#ff9ff3', '#54a0ff', '#5f27cd', '#01a3a4', '#f368e0',
  '#ff9f43', '#ee5a24', '#0abde3', '#10ac84', '#c8d6e5'
];

let colorIndex = 0;

function handleWebSocket(ws, req, boardStore) {
  let userId = null;
  let boardId = null;
  let userName = null;
  let userColor = COLORS[colorIndex++ % COLORS.length];

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'join': {
        boardId = msg.boardId;
        userId = msg.userId || uuidv4().split('-')[0];
        userName = msg.name || `User ${userId.slice(0, 4)}`;

        const board = boardStore.getBoard(boardId);
        if (!board) {
          boardStore.createBoard(boardId);
        }
        const b = boardStore.getBoard(boardId);
        b.connections.add(ws);
        b.lastActivity = Date.now();

        // Send init state
        const users = [];
        b.connections.forEach(client => {
          if (client !== ws && client._userData) {
            users.push(client._userData);
          }
        });

        ws._userData = { userId, name: userName, color: userColor };

        ws.send(JSON.stringify({
          type: 'init',
          boardId,
          userId,
          color: userColor,
          elements: Array.from(b.elements.values()),
          users
        }));

        // Broadcast user join
        broadcast(b, ws, {
          type: 'user-join',
          userId,
          name: userName,
          color: userColor
        });
        break;
      }

      case 'op': {
        if (!boardId) return;
        boardStore.applyOps(boardId, msg.ops);
        const board = boardStore.getBoard(boardId);
        if (board) {
          broadcast(board, ws, {
            type: 'op',
            userId,
            ops: msg.ops
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
    }
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
      }
    }
  });
}

function broadcast(board, sender, message) {
  const data = JSON.stringify(message);
  board.connections.forEach(client => {
    if (client !== sender && client.readyState === 1) {
      client.send(data);
    }
  });
}

// Heartbeat to detect dead connections
setInterval(() => {
  // This would need wss reference, handled externally if needed
}, 30000);

module.exports = { handleWebSocket };
