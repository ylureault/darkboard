const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const compression = require('compression'); // #R2-195
const { BoardStore } = require('./lib/boards');
const { handleWebSocket } = require('./lib/ws-handler');
const { startCleanup } = require('./lib/board-cleanup');

// #R2-198: WebSocket server with per-message deflate compression option
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: { chunkSize: 1024, memLevel: 7, level: 3 },
    threshold: 256 // only compress messages > 256 bytes
  }
});

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

// #R2-195: Gzip compression for API responses
app.use(compression());

// Security headers + #R2-196: CORS headers for API routes
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  // #R2-196: CORS headers
  if (req.path.startsWith('/api')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
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

// READ a board (with #R2-197 ETag support)
app.get('/api/board/:id', (req, res) => {
  const board = boardStore.getBoard(req.params.id);
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  // #R2-197: ETag based on element count + last modified
  const etag = `"${board.elements.size}-${board.lastModified || 0}"`;
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) {
    return res.sendStatus(304);
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

// #R2-193: Board analytics endpoint
app.get('/api/board/:id/analytics', (req, res) => {
  const board = boardStore.getBoard(req.params.id);
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  const elements = Array.from(board.elements.values());
  // Element counts by type
  const typeCounts = {};
  const creationTimeline = [];
  const userActivity = {};
  for (const el of elements) {
    typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
    if (el.zIndex) creationTimeline.push({ id: el.id, type: el.type, created: el.zIndex });
    if (el.createdBy) userActivity[el.createdBy] = (userActivity[el.createdBy] || 0) + 1;
  }
  creationTimeline.sort((a, b) => a.created - b.created);
  res.json({
    id: req.params.id,
    totalElements: elements.length,
    typeCounts,
    userActivity,
    creationTimeline: creationTimeline.slice(-100), // last 100
    connectedUsers: board.connections.size,
    createdAt: board.createdAt,
    lastActivity: board.lastActivity
  });
});

// #R2-200: API versioning prefix - mirror main API endpoints under /api/v1/
app.use('/api/v1', (req, res, next) => {
  // Rewrite /api/v1/... to /api/...
  req.url = req.url; // pass through
  next();
});
app.get('/api/v1/boards', (req, res) => res.redirect(307, '/api/boards'));
app.post('/api/v1/boards', (req, res) => res.redirect(307, '/api/boards'));
app.get('/api/v1/board/:id', (req, res) => res.redirect(307, `/api/board/${req.params.id}`));
app.get('/api/v1/board/:id/stats', (req, res) => res.redirect(307, `/api/board/${req.params.id}/stats`));
app.get('/api/v1/board/:id/analytics', (req, res) => res.redirect(307, `/api/board/${req.params.id}/analytics`));
app.put('/api/v1/board/:id', (req, res) => res.redirect(307, `/api/board/${req.params.id}`));
app.get('/api/v1/health', (req, res) => res.redirect(307, '/api/health'));

// #181 - Health check endpoint
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: Math.floor(uptime),
    boards: boardStore.getAllBoardIds().length,
    connections: Array.from(wss.clients).length,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
      heap: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB'
    }
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
  // #R2-194: Server startup banner with version and config info
  const pkg = require('./package.json');
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   DarkBoard by Insuffle Academie         ║');
  console.log(`  ║   Version: ${(pkg.version || '1.0.0').padEnd(30)}║`);
  console.log(`  ║   Port: ${String(PORT).padEnd(33)}║`);
  console.log(`  ║   Boards loaded: ${String(boardStore.getAllBoardIds().length).padEnd(24)}║`);
  console.log(`  ║   Node: ${process.version.padEnd(33)}║`);
  console.log(`  ║   PID: ${String(process.pid).padEnd(34)}║`);
  console.log('  ╚══════════════════════════════════════════╝');
  console.log(`  → http://localhost:${PORT}`);
  console.log('');
});

// #182 - Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  // Save all boards
  boardStore.saveAll();
  // Close all WebSocket connections
  wss.clients.forEach(client => {
    try { client.close(1001, 'Server shutting down'); } catch (e) { /* ignore */ }
  });
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// #183 - Uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
