const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { BoardStore } = require('./lib/boards');
const { handleWebSocket } = require('./lib/ws-handler');
const { startCleanup } = require('./lib/board-cleanup');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const boardStore = new BoardStore();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create new board and redirect
app.get('/new', (req, res) => {
  const boardId = uuidv4().split('-')[0];
  boardStore.createBoard(boardId);
  res.redirect(`/board/${boardId}`);
});

// Board page — serve HTML without auto-creating (client checks existence)
app.get('/board/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'board.html'));
});

// ========================
//  REST API — CRUD (no DELETE)
// ========================

// LIST all boards
app.get('/api/boards', (req, res) => {
  const ids = boardStore.getAllBoardIds();
  const boards = ids.map(id => {
    const board = boardStore.getBoard(id);
    return {
      id,
      elementCount: board.elements.size,
      anchorCount: board.anchors.size,
      connectedUsers: board.connections.size,
      lastActivity: board.lastActivity
    };
  });
  res.json({ boards });
});

// CREATE a new board
app.post('/api/boards', (req, res) => {
  const boardId = req.body.id || uuidv4().split('-')[0];
  if (boardStore.getBoard(boardId)) {
    return res.status(409).json({ error: 'Board already exists', id: boardId });
  }
  boardStore.createBoard(boardId);
  res.status(201).json({ id: boardId, url: `/board/${boardId}` });
});

// READ a board
app.get('/api/board/:id', (req, res) => {
  const board = boardStore.getBoard(req.params.id);
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  res.json({
    id: req.params.id,
    elements: Array.from(board.elements.values()),
    anchors: Array.from(board.anchors.values()),
    connectedUsers: board.connections.size,
    lastActivity: board.lastActivity
  });
});

// UPDATE a board (add/update elements — no delete)
app.put('/api/board/:id', (req, res) => {
  const board = boardStore.getBoard(req.params.id);
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  const { elements } = req.body;
  if (!Array.isArray(elements)) {
    return res.status(400).json({ error: 'elements must be an array of operations' });
  }
  // Only allow add and update operations — no delete
  const ops = elements.filter(op => op.type === 'add' || op.type === 'update');
  if (ops.length > 0) {
    boardStore.applyOps(req.params.id, ops);
  }
  res.json({
    id: req.params.id,
    applied: ops.length,
    rejected: elements.length - ops.length,
    elements: Array.from(board.elements.values())
  });
});

// WebSocket
wss.on('connection', (ws, req) => {
  handleWebSocket(ws, req, boardStore);
});

// Cleanup stale boards
startCleanup(boardStore);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`DarkBoard running on http://localhost:${PORT}`);
});
