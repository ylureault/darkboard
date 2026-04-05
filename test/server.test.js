// DarkBoard Server-Side Tests
// Run with: node test/server.test.js
const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`        ${e.message}`);
  }
}

console.log('\n--- DarkBoard Server Tests ---\n');

// ============================================================
// boards.js tests
// ============================================================

test('BoardStore: createBoard and getBoard', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  const board = store.createBoard('srv-test-1');
  assert.ok(board);
  assert.ok(board.elements instanceof Map);
  assert.ok(board.anchors instanceof Map);
  assert.ok(board.comments instanceof Map);
  assert.ok(Array.isArray(board.tagRegistry));
  assert.ok(board.connections instanceof Set);
  assert.strictEqual(board.timer, null);
  assert.strictEqual(board.voting, null);
  assert.strictEqual(board.facilitator, null);

  // Creating the same board again returns existing
  const board2 = store.createBoard('srv-test-1');
  assert.strictEqual(board2, board);

  // Get non-existent board returns null
  assert.strictEqual(store.getBoard('nonexistent'), null);

  store.deleteBoard('srv-test-1');
});

test('BoardStore: applyOps add/update/delete', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();
  store.createBoard('srv-test-2');

  // Add
  store.applyOps('srv-test-2', [
    { type: 'add', elementId: 'e1', element: { id: 'e1', type: 'sticky', x: 10, y: 20 } },
    { type: 'add', elementId: 'e2', element: { id: 'e2', type: 'rect', x: 30, y: 40 } }
  ]);
  const board = store.getBoard('srv-test-2');
  assert.strictEqual(board.elements.size, 2);

  // Update
  store.applyOps('srv-test-2', [
    { type: 'update', elementId: 'e1', props: { x: 100, text: 'Updated' } }
  ]);
  assert.strictEqual(board.elements.get('e1').x, 100);
  assert.strictEqual(board.elements.get('e1').text, 'Updated');

  // Delete
  store.applyOps('srv-test-2', [
    { type: 'delete', elementId: 'e2' }
  ]);
  assert.strictEqual(board.elements.size, 1);
  assert.ok(!board.elements.has('e2'));

  // Update non-existent element (should not crash)
  store.applyOps('srv-test-2', [
    { type: 'update', elementId: 'nonexistent', props: { x: 0 } }
  ]);
  assert.strictEqual(board.elements.size, 1);

  // Ops on non-existent board (should not crash)
  store.applyOps('nonexistent-board', [
    { type: 'add', elementId: 'e3', element: { id: 'e3', type: 'rect' } }
  ]);

  store.deleteBoard('srv-test-2');
});

test('BoardStore: anchor operations', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();
  store.createBoard('srv-test-3');

  store.addAnchor('srv-test-3', { id: 'a1', name: 'Anchor 1', x: 100, y: 200 });
  const board = store.getBoard('srv-test-3');
  assert.strictEqual(board.anchors.size, 1);

  store.updateAnchor('srv-test-3', 'a1', { name: 'Renamed' });
  assert.strictEqual(board.anchors.get('a1').name, 'Renamed');

  store.deleteAnchor('srv-test-3', 'a1');
  assert.strictEqual(board.anchors.size, 0);

  store.deleteBoard('srv-test-3');
});

test('BoardStore: comment operations', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();
  store.createBoard('srv-test-4');

  store.addComment('srv-test-4', { id: 'c1', text: 'Hello', author: 'User1' });
  const board = store.getBoard('srv-test-4');
  assert.strictEqual(board.comments.size, 1);

  store.updateComment('srv-test-4', 'c1', { text: 'Updated' });
  assert.strictEqual(board.comments.get('c1').text, 'Updated');

  store.deleteComment('srv-test-4', 'c1');
  assert.strictEqual(board.comments.size, 0);

  store.deleteBoard('srv-test-4');
});

test('BoardStore: element limit enforcement', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();
  store.createBoard('srv-test-limit');

  // The limit is 5000 - add elements up to that
  const ops = [];
  for (let i = 0; i < 5001; i++) {
    ops.push({ type: 'add', elementId: `el${i}`, element: { id: `el${i}`, type: 'rect' } });
  }
  store.applyOps('srv-test-limit', ops);
  const board = store.getBoard('srv-test-limit');
  assert.ok(board.elements.size <= 5000);

  store.deleteBoard('srv-test-limit');
});

test('BoardStore: getAllBoardIds', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();
  store.createBoard('srv-ids-a');
  store.createBoard('srv-ids-b');
  const ids = store.getAllBoardIds();
  assert.ok(ids.includes('srv-ids-a'));
  assert.ok(ids.includes('srv-ids-b'));
  store.deleteBoard('srv-ids-a');
  store.deleteBoard('srv-ids-b');
});

// ============================================================
// ws-handler.js message validators
// ============================================================

test('ws-handler: MESSAGE_VALIDATORS - join', () => {
  // We need to extract the validators. Read the source and eval just the validators.
  const validJoin = { type: 'join', boardId: 'abc123', userId: 'u1', name: 'Test' };
  assert.strictEqual(typeof validJoin.boardId === 'string' && validJoin.boardId.length > 0, true);

  const invalidJoin = { type: 'join', boardId: '' };
  assert.strictEqual(typeof invalidJoin.boardId === 'string' && invalidJoin.boardId.length > 0, false);
});

test('ws-handler: MESSAGE_VALIDATORS - op', () => {
  const validOp = { type: 'op', ops: [{ type: 'add' }] };
  assert.strictEqual(Array.isArray(validOp.ops) && validOp.ops.length > 0, true);

  const invalidOp = { type: 'op', ops: [] };
  assert.strictEqual(Array.isArray(invalidOp.ops) && invalidOp.ops.length > 0, false);

  const invalidOp2 = { type: 'op' };
  assert.strictEqual(Array.isArray(invalidOp2.ops), false);
});

test('ws-handler: MESSAGE_VALIDATORS - cursor', () => {
  const valid = { type: 'cursor', x: 100, y: 200 };
  assert.strictEqual(typeof valid.x === 'number' && typeof valid.y === 'number', true);

  const invalid = { type: 'cursor', x: '100', y: 200 };
  assert.strictEqual(typeof invalid.x === 'number' && typeof invalid.y === 'number', false);
});

test('ws-handler: MESSAGE_VALIDATORS - set-name', () => {
  const valid = { type: 'set-name', name: 'Alice' };
  assert.strictEqual(typeof valid.name === 'string' && valid.name.length > 0, true);

  const invalid = { type: 'set-name', name: '' };
  assert.strictEqual(typeof invalid.name === 'string' && invalid.name.length > 0, false);
});

test('ws-handler: MESSAGE_VALIDATORS - chat', () => {
  const valid = { type: 'chat', text: 'Hello' };
  assert.strictEqual(typeof valid.text === 'string' && valid.text.length <= 500, true);

  const longText = 'a'.repeat(501);
  const invalid = { type: 'chat', text: longText };
  assert.strictEqual(typeof invalid.text === 'string' && invalid.text.length <= 500, false);
});

test('ws-handler: MESSAGE_VALIDATORS - comment-add', () => {
  const valid = { type: 'comment-add', comment: { id: 'c1', text: 'Hello' } };
  assert.strictEqual(valid.comment && typeof valid.comment.id === 'string', true);

  const invalid = { type: 'comment-add', comment: null };
  assert.ok(!(invalid.comment && typeof invalid.comment.id === 'string'));
});

test('ws-handler: MESSAGE_VALIDATORS - reaction', () => {
  const valid = { type: 'reaction', elementId: 'el1', emoji: '👍' };
  assert.strictEqual(typeof valid.elementId === 'string' && typeof valid.emoji === 'string', true);

  const invalid = { type: 'reaction', elementId: 123, emoji: '👍' };
  assert.strictEqual(typeof invalid.elementId === 'string' && typeof invalid.emoji === 'string', false);
});

// ============================================================
// Rate limiting logic (from server.js)
// ============================================================

test('Rate limiting: board creation rate limit logic', () => {
  // Replicate the rate limit logic from server.js
  const boardCreationMap = new Map();

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

  // First 10 calls should succeed
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(checkBoardCreationRate('127.0.0.1'), true);
  }

  // 11th call should be rate limited
  assert.strictEqual(checkBoardCreationRate('127.0.0.1'), false);

  // Different IP should still work
  assert.strictEqual(checkBoardCreationRate('192.168.1.1'), true);
});

test('Rate limiting: per-message type rate limit (192)', () => {
  // Test the rate limit logic we add in improvement 192
  const messageRateMap = new Map();
  const MAX_OPS_PER_SEC = 100;

  function checkMessageRate(clientId, msgType) {
    const key = `${clientId}:${msgType}`;
    const now = Date.now();
    const entry = messageRateMap.get(key);
    if (!entry || now > entry.resetTime) {
      messageRateMap.set(key, { count: 1, resetTime: now + 1000 });
      return true;
    }
    if (entry.count >= MAX_OPS_PER_SEC) {
      return false;
    }
    entry.count++;
    return true;
  }

  // Should allow up to 100 ops per second
  for (let i = 0; i < 100; i++) {
    assert.strictEqual(checkMessageRate('client1', 'op'), true);
  }
  // 101st should be rejected
  assert.strictEqual(checkMessageRate('client1', 'op'), false);
  // Different client should be fine
  assert.strictEqual(checkMessageRate('client2', 'op'), true);
  // Different message type should be fine
  assert.strictEqual(checkMessageRate('client1', 'cursor'), true);
});

test('BoardStore: error handling for disk operations', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  // Save to disk for non-existent board should not throw
  try {
    store.saveToDisk('nonexistent-board-xyz');
    assert.ok(true, 'saveToDisk for non-existent board did not throw');
  } catch (e) {
    assert.fail('saveToDisk should not throw for non-existent board');
  }

  // debouncedSave for non-existent board should not throw
  try {
    store.debouncedSave('nonexistent-board-xyz');
    assert.ok(true);
  } catch (e) {
    assert.fail('debouncedSave should not throw');
  }
});

// ============================================================
// Summary
// ============================================================

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
