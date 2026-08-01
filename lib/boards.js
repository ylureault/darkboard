// #198: boards.js - Board storage and persistence layer.
// Manages in-memory board state, applies operations, and persists to disk as JSON files.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Board ids become filenames, so they must be a safe slug. Anything containing
// a path separator, a dot segment, or exotic characters is rejected outright
// rather than sanitised, so a hostile id can never escape DATA_DIR.
const BOARD_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
function isValidBoardId(boardId) {
  return typeof boardId === 'string' && BOARD_ID_RE.test(boardId);
}

// Resolve a board id to its on-disk path, returning null if the id is unsafe
// or if the resolved path would land outside DATA_DIR.
function boardFilePath(boardId) {
  if (!isValidBoardId(boardId)) return null;
  const filePath = path.join(DATA_DIR, `${boardId}.json`);
  const rel = path.relative(DATA_DIR, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return filePath;
}

const MAX_ELEMENTS_PER_BOARD = 5000;
const ELEMENT_WARNING_THRESHOLD = 4000;

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
          let skippedElements = 0;
          if (Array.isArray(data.elements)) {
            for (const el of data.elements) {
              // Data integrity check: skip malformed elements
              if (!el || typeof el.id !== 'string' || !el.type) {
                skippedElements++;
                continue;
              }
              elements.set(el.id, el);
            }
          }
          if (skippedElements > 0) {
            console.warn(`Board ${boardId}: skipped ${skippedElements} malformed elements on load`);
          }
          // Load anchors
          const anchors = new Map();
          if (Array.isArray(data.anchors)) {
            for (const a of data.anchors) {
              if (!a || typeof a.id !== 'string') continue;
              anchors.set(a.id, a);
            }
          }
          // Load comments
          const comments = new Map();
          if (Array.isArray(data.comments)) {
            for (const c of data.comments) {
              if (!c || typeof c.id !== 'string') continue;
              comments.set(c.id, c);
            }
          }
          // Load tag registry
          const tagRegistry = data.tagRegistry || [];

          this.boards.set(boardId, {
            elements,
            anchors,
            comments,
            tagRegistry,
            connections: new Set(),
            lastActivity: Date.now(),
            createdAt: data.createdAt || Date.now(),
            lastModified: data.lastModified || Date.now(),
            // Workshop state. Voting survives a restart so an in-progress vote
            // isn't silently wiped; the timer and facilitator are deliberately
            // not restored — nobody is connected yet and a countdown resumed
            // from a stale timestamp would be wrong.
            timer: null,
            voting: data.voting || null,
            isolation: null,
            facilitator: null,
            followMode: false
          });
        } catch (e) {
          // #193: Log corrupt file errors instead of silently skipping
          console.error(`[BoardStore] Failed to load board file ${file}:`, e.message);
        }
      }
    } catch (e) {
      // #193: Log data directory errors
      console.error('[BoardStore] Failed to read data directory:', e.message);
    }
  }

  createBoard(boardId) {
    if (!isValidBoardId(boardId)) return null;
    if (!this.boards.has(boardId)) {
      const now = Date.now();
      this.boards.set(boardId, {
        elements: new Map(),
        anchors: new Map(),
        comments: new Map(),
        tagRegistry: [],
        connections: new Set(),
        lastActivity: now,
        createdAt: now,
        lastModified: now,
        timer: null,
        voting: null,
        isolation: null,
        facilitator: null,
        followMode: false
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
    const now = Date.now();
    board.lastActivity = now;
    board.lastModified = now;

    let warning = null;
    for (const op of ops) {
      switch (op.type) {
        case 'add':
          // Enforce element limit
          if (board.elements.size >= MAX_ELEMENTS_PER_BOARD) {
            console.warn(`Board ${boardId}: element limit reached (${MAX_ELEMENTS_PER_BOARD})`);
            continue; // skip this add
          }
          board.elements.set(op.elementId, op.element);
          if (board.elements.size >= ELEMENT_WARNING_THRESHOLD && !warning) {
            warning = `Board approaching element limit: ${board.elements.size}/${MAX_ELEMENTS_PER_BOARD}`;
            console.warn(`Board ${boardId}: ${warning}`);
          }
          break;
        case 'update': {
          const el = board.elements.get(op.elementId);
          if (el) {
            Object.assign(el, op.props);
          }
          break;
        }
        case 'delete':
          board.elements.delete(op.elementId);
          break;
      }
    }

    this.debouncedSave(boardId);
    return warning;
  }

  // Anchor operations
  addAnchor(boardId, anchor) {
    const board = this.boards.get(boardId);
    if (!board) return;
    board.anchors.set(anchor.id, anchor);
    this.debouncedSave(boardId);
  }

  updateAnchor(boardId, anchorId, props) {
    const board = this.boards.get(boardId);
    if (!board) return;
    const anchor = board.anchors.get(anchorId);
    if (anchor) {
      Object.assign(anchor, props);
      this.debouncedSave(boardId);
    }
  }

  deleteAnchor(boardId, anchorId) {
    const board = this.boards.get(boardId);
    if (!board) return;
    board.anchors.delete(anchorId);
    this.debouncedSave(boardId);
  }

  addComment(boardId, comment) {
    const board = this.boards.get(boardId);
    if (!board) return;
    board.comments.set(comment.id, comment);
    this.debouncedSave(boardId);
  }

  updateComment(boardId, commentId, props) {
    const board = this.boards.get(boardId);
    if (!board) return;
    const comment = board.comments.get(commentId);
    if (comment) {
      Object.assign(comment, props);
      this.debouncedSave(boardId);
    }
  }

  deleteComment(boardId, commentId) {
    const board = this.boards.get(boardId);
    if (!board) return;
    board.comments.delete(commentId);
    this.debouncedSave(boardId);
  }

  // #193: Enhanced error handling for disk write operations
  saveToDisk(boardId) {
    const board = this.boards.get(boardId);
    if (!board) return;
    const filePath = boardFilePath(boardId);
    if (!filePath) {
      console.error(`[BoardStore] Refusing to save board with unsafe id: ${boardId}`);
      return;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        elements: Array.from(board.elements.values()),
        anchors: Array.from(board.anchors.values()),
        comments: Array.from(board.comments.values()),
        tagRegistry: board.tagRegistry || [],
        voting: board.voting || null,
        createdAt: board.createdAt,
        lastModified: board.lastModified
      };
      const jsonStr = JSON.stringify(data);
      // Write to temp file first, then rename for atomicity
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, jsonStr, 'utf8');
      fs.renameSync(tmpPath, filePath);
    } catch (e) {
      console.error(`[BoardStore] Failed to save board ${boardId}:`, e.message);
      // #193: Try to clean up temp file on failure
      try {
        const tmpPath = filePath + '.tmp';
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch (_) { /* ignore cleanup failure */ }
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
      const filePath = boardFilePath(boardId);
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) { /* ignore */ }
  }

  // #182 - Save all boards immediately (used during graceful shutdown)
  saveAll() {
    for (const boardId of this.boards.keys()) {
      this.saveToDisk(boardId);
    }
  }

  getAllBoardIds() {
    return Array.from(this.boards.keys());
  }
}

module.exports = { BoardStore, isValidBoardId };
