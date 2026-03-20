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

// Serve static files
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

// Board page
app.get('/board/:id', (req, res) => {
  const boardId = req.params.id;
  if (!boardStore.getBoard(boardId)) {
    boardStore.createBoard(boardId);
  }
  res.sendFile(path.join(__dirname, 'public', 'board.html'));
});

// API: get board state
app.get('/api/board/:id', (req, res) => {
  const board = boardStore.getBoard(req.params.id);
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  res.json({
    id: req.params.id,
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
