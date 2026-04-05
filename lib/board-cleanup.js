const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_IDLE_TIME = 24 * 60 * 60 * 1000; // 24 hours
const AUTO_ARCHIVE_DAYS = 30; // #R2-199: Auto-archive after 30 days inactivity
const AUTO_ARCHIVE_MS = AUTO_ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
const fs = require('fs');
const path = require('path');

function startCleanup(boardStore) {
  setInterval(() => {
    const now = Date.now();
    for (const boardId of boardStore.getAllBoardIds()) {
      const board = boardStore.getBoard(boardId);
      if (!board) continue;

      // #R2-199: Auto-archive boards inactive for 30 days
      if (board.connections.size === 0 && (now - board.lastActivity) > AUTO_ARCHIVE_MS) {
        console.log(`[Cleanup] Auto-archiving board ${boardId} (inactive ${AUTO_ARCHIVE_DAYS}+ days)`);
        try {
          const archiveDir = path.join(__dirname, '..', 'data', 'archive');
          if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
          const data = {
            elements: Array.from(board.elements.values()),
            anchors: Array.from(board.anchors.values()),
            comments: board.comments ? Array.from(board.comments.values()) : [],
            archivedAt: now,
            lastActivity: board.lastActivity,
            createdAt: board.createdAt
          };
          fs.writeFileSync(path.join(archiveDir, `${boardId}.json`), JSON.stringify(data), 'utf8');
          boardStore.deleteBoard(boardId);
          console.log(`[Cleanup] Board ${boardId} archived successfully`);
        } catch (e) {
          console.error(`[Cleanup] Failed to archive board ${boardId}:`, e.message);
        }
        continue;
      }

      // Original cleanup: delete empty boards after 24h
      if (board.connections.size === 0 && (now - board.lastActivity) > MAX_IDLE_TIME) {
        console.log(`[Cleanup] Cleaning up stale board: ${boardId}`);
        boardStore.deleteBoard(boardId);
      }
    }
  }, CLEANUP_INTERVAL);
}

module.exports = { startCleanup };
