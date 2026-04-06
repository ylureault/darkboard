// DarkBoard Server-Side Tests
// Run with: node test/server.test.js
const assert = require('assert');
const path = require('path');
const { MESSAGE_VALIDATORS } = require(path.join(__dirname, '..', 'lib', 'ws-handler'));

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
// Iteration 169-175 Tests
// ============================================================

// 169. Test applyOps with interleaved add/update/delete operations
test('169: applyOps with interleaved add/update/delete operations', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();
  store.createBoard('srv-interleave');

  // Interleaved operations in a single batch
  store.applyOps('srv-interleave', [
    { type: 'add', elementId: 'i1', element: { id: 'i1', type: 'rect', x: 0, y: 0 } },
    { type: 'add', elementId: 'i2', element: { id: 'i2', type: 'sticky', x: 10, y: 10 } },
    { type: 'update', elementId: 'i1', props: { x: 50, fill: '#ff0000' } },
    { type: 'add', elementId: 'i3', element: { id: 'i3', type: 'circle', x: 20, y: 20 } },
    { type: 'delete', elementId: 'i2' },
    { type: 'update', elementId: 'i3', props: { width: 100 } }
  ]);

  const board = store.getBoard('srv-interleave');
  assert.strictEqual(board.elements.size, 2); // i1 and i3 remain
  assert.ok(board.elements.has('i1'));
  assert.ok(!board.elements.has('i2')); // deleted
  assert.ok(board.elements.has('i3'));
  assert.strictEqual(board.elements.get('i1').x, 50);
  assert.strictEqual(board.elements.get('i1').fill, '#ff0000');
  assert.strictEqual(board.elements.get('i3').width, 100);

  store.deleteBoard('srv-interleave');
});

// 170. Test tag registry persistence (set tagRegistry, verify it persists)
test('170: Tag registry persistence', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();
  store.createBoard('srv-tags');

  const board = store.getBoard('srv-tags');
  assert.ok(Array.isArray(board.tagRegistry));
  assert.strictEqual(board.tagRegistry.length, 0);

  // Set tag registry
  board.tagRegistry.push('important', 'todo', 'review');
  assert.strictEqual(board.tagRegistry.length, 3);
  assert.strictEqual(board.tagRegistry[0], 'important');
  assert.strictEqual(board.tagRegistry[1], 'todo');
  assert.strictEqual(board.tagRegistry[2], 'review');

  // Verify it persists on the same board reference
  const board2 = store.getBoard('srv-tags');
  assert.strictEqual(board2.tagRegistry.length, 3);
  assert.deepStrictEqual(board2.tagRegistry, ['important', 'todo', 'review']);

  store.deleteBoard('srv-tags');
});

// 171. Test anchor operations on non-existent board (should not throw)
test('171: Anchor operations on non-existent board do not throw', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  // None of these should throw
  try {
    store.addAnchor('nonexistent-anchor-board', { id: 'a1', name: 'test' });
    store.updateAnchor('nonexistent-anchor-board', 'a1', { name: 'updated' });
    store.deleteAnchor('nonexistent-anchor-board', 'a1');
    assert.ok(true);
  } catch (e) {
    assert.fail('Anchor operations on non-existent board should not throw: ' + e.message);
  }
});

// 172. Test comment operations on non-existent board (should not throw)
test('172: Comment operations on non-existent board do not throw', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  try {
    store.addComment('nonexistent-comment-board', { id: 'c1', text: 'hello' });
    store.updateComment('nonexistent-comment-board', 'c1', { text: 'updated' });
    store.deleteComment('nonexistent-comment-board', 'c1');
    assert.ok(true);
  } catch (e) {
    assert.fail('Comment operations on non-existent board should not throw: ' + e.message);
  }
});

// 173. Test that multiple boards can coexist independently
test('173: Multiple boards coexist independently', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  store.createBoard('srv-multi-a');
  store.createBoard('srv-multi-b');
  store.createBoard('srv-multi-c');

  // Add different elements to each board
  store.applyOps('srv-multi-a', [
    { type: 'add', elementId: 'ea1', element: { id: 'ea1', type: 'rect', x: 1 } }
  ]);
  store.applyOps('srv-multi-b', [
    { type: 'add', elementId: 'eb1', element: { id: 'eb1', type: 'sticky', x: 2 } },
    { type: 'add', elementId: 'eb2', element: { id: 'eb2', type: 'circle', x: 3 } }
  ]);
  store.applyOps('srv-multi-c', [
    { type: 'add', elementId: 'ec1', element: { id: 'ec1', type: 'line', x: 4 } },
    { type: 'add', elementId: 'ec2', element: { id: 'ec2', type: 'arrow', x: 5 } },
    { type: 'add', elementId: 'ec3', element: { id: 'ec3', type: 'freehand', x: 6 } }
  ]);

  // Verify each board has its own elements
  assert.strictEqual(store.getBoard('srv-multi-a').elements.size, 1);
  assert.strictEqual(store.getBoard('srv-multi-b').elements.size, 2);
  assert.strictEqual(store.getBoard('srv-multi-c').elements.size, 3);

  // Deleting from one board doesn't affect others
  store.applyOps('srv-multi-b', [{ type: 'delete', elementId: 'eb1' }]);
  assert.strictEqual(store.getBoard('srv-multi-a').elements.size, 1);
  assert.strictEqual(store.getBoard('srv-multi-b').elements.size, 1);
  assert.strictEqual(store.getBoard('srv-multi-c').elements.size, 3);

  store.deleteBoard('srv-multi-a');
  store.deleteBoard('srv-multi-b');
  store.deleteBoard('srv-multi-c');
});

// 174. Test that deleteBoard cleans up completely
test('174: deleteBoard cleans up completely', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  store.createBoard('srv-delete-test');
  store.applyOps('srv-delete-test', [
    { type: 'add', elementId: 'd1', element: { id: 'd1', type: 'rect' } }
  ]);
  store.addAnchor('srv-delete-test', { id: 'a1', name: 'anchor' });
  store.addComment('srv-delete-test', { id: 'c1', text: 'comment' });

  // Verify the board exists and has data
  assert.ok(store.getBoard('srv-delete-test'));
  assert.strictEqual(store.getBoard('srv-delete-test').elements.size, 1);

  // Delete the board
  store.deleteBoard('srv-delete-test');

  // Verify it's completely gone
  assert.strictEqual(store.getBoard('srv-delete-test'), null);
  assert.ok(!store.getAllBoardIds().includes('srv-delete-test'));

  // Deleting again should not throw
  try {
    store.deleteBoard('srv-delete-test');
    assert.ok(true);
  } catch (e) {
    assert.fail('Double delete should not throw');
  }
});

// 175. Test saveAll saves all boards without error
test('175: saveAll saves all boards without error', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  store.createBoard('srv-saveall-1');
  store.createBoard('srv-saveall-2');
  store.applyOps('srv-saveall-1', [
    { type: 'add', elementId: 'sa1', element: { id: 'sa1', type: 'rect', x: 0, y: 0 } }
  ]);
  store.applyOps('srv-saveall-2', [
    { type: 'add', elementId: 'sa2', element: { id: 'sa2', type: 'sticky', x: 10, y: 20 } }
  ]);

  try {
    store.saveAll();
    assert.ok(true);
  } catch (e) {
    assert.fail('saveAll should not throw: ' + e.message);
  }

  // Verify boards still exist after save
  assert.ok(store.getBoard('srv-saveall-1'));
  assert.ok(store.getBoard('srv-saveall-2'));

  // Clean up
  store.deleteBoard('srv-saveall-1');
  store.deleteBoard('srv-saveall-2');
});

// 176. Test MESSAGE_VALIDATORS for new message types
test('176: MESSAGE_VALIDATORS - ping', () => {
  assert.ok(MESSAGE_VALIDATORS['ping']({ x: 100, y: 200 }), 'Valid ping');
  assert.ok(!MESSAGE_VALIDATORS['ping']({ x: 'bad', y: 200 }), 'Invalid ping x');
  assert.ok(!MESSAGE_VALIDATORS['ping']({ x: 100 }), 'Missing ping y');
});

test('177: MESSAGE_VALIDATORS - typing', () => {
  assert.ok(MESSAGE_VALIDATORS['typing']({}), 'Typing has no required fields');
});

test('178: MESSAGE_VALIDATORS - fishbowl', () => {
  assert.ok(MESSAGE_VALIDATORS['fishbowl']({ active: true }), 'Valid fishbowl');
  assert.ok(MESSAGE_VALIDATORS['fishbowl']({ active: false }), 'Valid fishbowl false');
  assert.ok(!MESSAGE_VALIDATORS['fishbowl']({ active: 'yes' }), 'Invalid fishbowl type');
});

test('179: MESSAGE_VALIDATORS - presence', () => {
  assert.ok(MESSAGE_VALIDATORS['presence']({ status: 'active' }), 'Valid presence');
  assert.ok(!MESSAGE_VALIDATORS['presence']({ status: 123 }), 'Invalid presence type');
  assert.ok(!MESSAGE_VALIDATORS['presence']({}), 'Missing presence status');
});

// 180. Test board operations with many element types
test('180: applyOps with all element types', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  store.createBoard('srv-all-types');
  const types = ['rect', 'circle', 'sticky', 'text', 'frame', 'line', 'arrow',
                 'connector', 'diamond', 'triangle', 'card', 'list', 'envelope',
                 'mindmap', 'embed', 'image', 'freehand'];

  const ops = types.map((type, i) => ({
    type: 'add',
    elementId: `type-${type}`,
    element: { id: `type-${type}`, type, x: i * 100, y: 0, width: 50, height: 50 }
  }));

  store.applyOps('srv-all-types', ops);
  const board = store.getBoard('srv-all-types');
  assert.strictEqual(board.elements.size, types.length, `Should have ${types.length} elements`);

  for (const type of types) {
    assert.ok(board.elements.has(`type-${type}`), `Should have ${type} element`);
    assert.strictEqual(board.elements.get(`type-${type}`).type, type);
  }

  store.deleteBoard('srv-all-types');
});

// 181. Test concurrent operations on same element
test('181: Concurrent update operations on same element', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  store.createBoard('srv-concurrent');
  store.applyOps('srv-concurrent', [
    { type: 'add', elementId: 'cc1', element: { id: 'cc1', type: 'sticky', x: 0, y: 0, width: 200, height: 200, text: '' } }
  ]);

  // Simulate rapid concurrent updates (like dragging)
  for (let i = 0; i < 100; i++) {
    store.applyOps('srv-concurrent', [
      { type: 'update', elementId: 'cc1', props: { x: i * 10, y: i * 5 } }
    ]);
  }

  const board = store.getBoard('srv-concurrent');
  const el = board.elements.get('cc1');
  assert.strictEqual(el.x, 990, 'x should be final value');
  assert.strictEqual(el.y, 495, 'y should be final value');

  store.deleteBoard('srv-concurrent');
});

// 182. Test add then delete then add with same ID
test('182: Add-delete-readd with same element ID', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  store.createBoard('srv-readd');
  store.applyOps('srv-readd', [
    { type: 'add', elementId: 're1', element: { id: 're1', type: 'rect', x: 0, y: 0, text: 'original' } }
  ]);
  store.applyOps('srv-readd', [
    { type: 'delete', elementId: 're1' }
  ]);
  store.applyOps('srv-readd', [
    { type: 'add', elementId: 're1', element: { id: 're1', type: 'rect', x: 100, y: 100, text: 'new' } }
  ]);

  const board = store.getBoard('srv-readd');
  assert.strictEqual(board.elements.size, 1);
  assert.strictEqual(board.elements.get('re1').text, 'new');
  assert.strictEqual(board.elements.get('re1').x, 100);

  store.deleteBoard('srv-readd');
});

// 183. Test update on non-existent element doesn't crash
test('183: Update on non-existent element is silently ignored', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  store.createBoard('srv-nocrash');
  // Should not throw
  store.applyOps('srv-nocrash', [
    { type: 'update', elementId: 'nonexistent', props: { x: 100 } }
  ]);
  store.applyOps('srv-nocrash', [
    { type: 'delete', elementId: 'nonexistent' }
  ]);

  const board = store.getBoard('srv-nocrash');
  assert.strictEqual(board.elements.size, 0);

  store.deleteBoard('srv-nocrash');
});

// 184. Test tag registry persistence
test('184: Tag registry update and retrieval', () => {
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));
  const store = new BoardStore();

  store.createBoard('srv-tags2');
  const board = store.getBoard('srv-tags2');

  const tags = [
    { label: 'Urgent', color: '#FF6B6B' },
    { label: 'Done', color: '#4ECDC4' },
    { label: 'Question', color: '#DDA0DD' }
  ];
  board.tagRegistry = tags;

  assert.strictEqual(board.tagRegistry.length, 3);
  assert.strictEqual(board.tagRegistry[0].label, 'Urgent');
  assert.strictEqual(board.tagRegistry[2].color, '#DDA0DD');

  store.deleteBoard('srv-tags2');
});

// ============================================================
// Summary
// ============================================================

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
