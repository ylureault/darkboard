const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_IDLE_TIME = 24 * 60 * 60 * 1000; // 24 hours

function startCleanup(boardStore) {
  setInterval(() => {
    const now = Date.now();
    for (const boardId of boardStore.getAllBoardIds()) {
      const board = boardStore.getBoard(boardId);
      if (!board) continue;
      if (board.connections.size === 0 && (now - board.lastActivity) > MAX_IDLE_TIME) {
        console.log(`Cleaning up stale board: ${boardId}`);
        boardStore.deleteBoard(boardId);
      }
    }
  }, CLEANUP_INTERVAL);
}

module.exports = { startCleanup };
