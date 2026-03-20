const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

class BoardStore {
  constructor() {
    this.boards = new Map();
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        return;
      }
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
          const boardId = file.replace('.json', '');
          const elements = new Map();
          if (Array.isArray(data.elements)) {
            for (const el of data.elements) {
              elements.set(el.id, el);
            }
          }
          this.boards.set(boardId, {
            elements,
            connections: new Set(),
            lastActivity: Date.now()
          });
        } catch (e) { /* skip corrupt files */ }
      }
    } catch (e) { /* no data dir yet */ }
  }

  createBoard(boardId) {
    if (!this.boards.has(boardId)) {
      this.boards.set(boardId, {
        elements: new Map(),
        connections: new Set(),
        lastActivity: Date.now()
      });
    }
    return this.boards.get(boardId);
  }

  getBoard(boardId) {
    return this.boards.get(boardId) || null;
  }

  applyOps(boardId, ops) {
    const board = this.boards.get(boardId);
    if (!board) return;
    board.lastActivity = Date.now();

    for (const op of ops) {
      switch (op.type) {
        case 'add':
          board.elements.set(op.elementId, op.element);
          break;
        case 'update':
          const el = board.elements.get(op.elementId);
          if (el) {
            Object.assign(el, op.props);
          }
          break;
        case 'delete':
          board.elements.delete(op.elementId);
          break;
      }
    }

    this.debouncedSave(boardId);
  }

  saveToDisk(boardId) {
    const board = this.boards.get(boardId);
    if (!board) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        elements: Array.from(board.elements.values())
      };
      fs.writeFileSync(
        path.join(DATA_DIR, `${boardId}.json`),
        JSON.stringify(data),
        'utf8'
      );
    } catch (e) {
      console.error('Failed to save board:', boardId, e.message);
    }
  }

  debouncedSave(boardId) {
    const board = this.boards.get(boardId);
    if (!board) return;
    if (board._saveTimer) clearTimeout(board._saveTimer);
    board._saveTimer = setTimeout(() => {
      this.saveToDisk(boardId);
    }, 2000);
  }

  deleteBoard(boardId) {
    this.boards.delete(boardId);
    try {
      const filePath = path.join(DATA_DIR, `${boardId}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) { /* ignore */ }
  }

  getAllBoardIds() {
    return Array.from(this.boards.keys());
  }
}

module.exports = { BoardStore };
