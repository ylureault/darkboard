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

// Rate limiting for board creation: max 10 per minute per IP
const boardCreationMap = new Map(); // ip -> { count, resetTime }
function checkBoardCreationRate(ip) {
  const now = Date.now();
  const entry = boardCreationMap.get(ip);
  if (!entry || now > entry.resetTime) {
    boardCreationMap.set(ip, { count: 1, resetTime: now + 60000 });
    return true;
  }
  if (entry.count >= 10) {
    return false;
  }
  entry.count++;
  return true;
}
// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of boardCreationMap) {
    if (now > entry.resetTime) boardCreationMap.delete(ip);
  }
}, 300000);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Request logging for API calls
app.use('/api', (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} (${req.ip})`);
  next();
});

// Middleware
app.use(express.json());

// Cache-control headers for static assets
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create new board and redirect
app.get('/new', (req, res) => {
  if (!checkBoardCreationRate(req.ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 10 boards per minute.' });
  }
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
  if (!checkBoardCreationRate(req.ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 10 boards per minute.' });
  }
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

// STATS for a board
app.get('/api/board/:id/stats', (req, res) => {
  const board = boardStore.getBoard(req.params.id);
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  res.json({
    id: req.params.id,
    elementCount: board.elements.size,
    userCount: board.connections.size,
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
  handleWebSocket(ws, req, boardStore, wss);
});

// Cleanup stale boards
startCleanup(boardStore);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`DarkBoard running on http://localhost:${PORT}`);
});
