// DarkBoard Client-Side Tests
// Run with: node test/darkboard.test.js
const assert = require('assert');

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

// ============================================================
// Copy pure utility functions from the client-side code
// (these have no DOM dependencies)
// ============================================================

function generateId() {
  return 'xxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

function pointInRect(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function pointInCircle(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distanceToPolyline(px, py, points) {
  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(px, py, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function getElementBounds(el) {
  switch (el.type) {
    case 'rect':
    case 'sticky':
    case 'text':
    case 'frame':
    case 'image':
    case 'envelope':
    case 'diamond':
    case 'triangle':
    case 'card':
    case 'list':
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    case 'circle':
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    case 'line':
    case 'arrow':
    case 'connector': {
      const minX = Math.min(el.x, el.x2);
      const minY = Math.min(el.y, el.y2);
      const maxX = Math.max(el.x, el.x2);
      const maxY = Math.max(el.y, el.y2);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'freehand': {
      if (!el.points || el.points.length === 0) return { x: el.x, y: el.y, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of el.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    default:
      return { x: el.x, y: el.y, w: el.width || 0, h: el.height || 0 };
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizeRect(x, y, w, h) {
  return {
    x: w < 0 ? x + w : x,
    y: h < 0 ? y + h : y,
    w: Math.abs(w),
    h: Math.abs(h)
  };
}

function isLightColor(hex) {
  if (!hex || hex === 'transparent') return true;
  const c = hex.replace('#', '');
  if (c.length < 6) return true;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

// ---- Element factories (copied from objects.js) ----

function createElement(type, props) {
  const base = {
    id: generateId(),
    type: type,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fill: 'transparent',
    stroke: '#ffffff',
    strokeWidth: 2,
    text: '',
    fontSize: 16,
    zIndex: Date.now(),
    rotation: 0,
    locked: false,
    groupId: null,
    ...props
  };
  return base;
}

const STICKY_COLORS = ['#FFD966', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD', '#F4A460'];

function createSticky(x, y) {
  const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
  return createElement('sticky', {
    x, y,
    width: 200,
    height: 200,
    fill: color,
    stroke: 'transparent',
    text: '',
    fontSize: 16,
    tags: []
  });
}

function createFrame(x, y, w, h, title) {
  return createElement('frame', {
    x, y,
    width: w || 400,
    height: h || 300,
    fill: 'rgba(74, 158, 255, 0.05)',
    stroke: '#4a9eff',
    strokeWidth: 2,
    text: title || 'Zone',
    fontSize: 16,
    zIndex: 1
  });
}

function createConnector(sourceId, targetId, style) {
  return createElement('connector', {
    sourceId: sourceId,
    targetId: targetId,
    x: 0, y: 0, x2: 0, y2: 0,
    width: 0, height: 0,
    stroke: '#ffffff',
    strokeWidth: 2,
    fill: 'transparent',
    connectorStyle: style || 'arrow',
    lineType: 'straight',
    text: '',
    zIndex: Date.now() - 1000
  });
}

function createMindmapNode(x, y, text, parentId, color) {
  return createElement('mindmap', {
    x, y,
    width: 160,
    height: 50,
    fill: color || '#4a9eff',
    stroke: 'transparent',
    text: text || '',
    fontSize: 14,
    mindmapParent: parentId || null,
    mindmapChildren: [],
    mindmapCollapsed: false,
    borderRadius: 25
  });
}

function createEmbed(x, y, url) {
  return createElement('embed', {
    x, y,
    width: 480,
    height: 320,
    fill: '#1e1e1e',
    stroke: '#333',
    strokeWidth: 1,
    embedUrl: url || '',
    text: url || 'Embed'
  });
}

// ---- Hit testing (copied from objects.js) ----

function hitTestElement(el, worldX, worldY, threshold) {
  threshold = threshold || 8;
  switch (el.type) {
    case 'rect':
    case 'sticky':
    case 'image':
      return pointInRect(worldX, worldY, el.x, el.y, el.width, el.height);
    case 'circle': {
      const rx = el.width / 2;
      const ry = el.height / 2;
      const cx = el.x + rx;
      const cy = el.y + ry;
      const dx = (worldX - cx) / rx;
      const dy = (worldY - cy) / ry;
      return dx * dx + dy * dy <= 1;
    }
    case 'line':
    case 'arrow':
      return distanceToSegment(worldX, worldY, el.x, el.y, el.x2, el.y2) < threshold;
    case 'freehand': {
      if (!el.points || el.points.length < 2) return false;
      return distanceToPolyline(worldX, worldY, el.points) < threshold;
    }
    case 'connector':
      return distanceToSegment(worldX, worldY, el.x, el.y, el.x2, el.y2) < threshold;
    default:
      return false;
  }
}

// ---- richTextToPlain (no DOM needed for simple strip) ----

function richTextToPlain(html) {
  if (!html || !/<[^>]+>/.test(html)) return html || '';
  // Node.js compatible: strip HTML tags with regex
  return html.replace(/<[^>]+>/g, '');
}

// ---- parseRichText mock (with mock document.createElement) ----

function parseRichText(html) {
  if (!html || typeof html !== 'string') return [{ text: html || '', bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null, highlight: null, fontFamily: null }];
  if (!/<[^>]+>/.test(html)) {
    return [{ text: html, bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null, highlight: null, fontFamily: null }];
  }

  // Simple HTML parser for test: extract bold/italic from tags
  const segments = [];
  // Remove tags and track formatting
  let remaining = html;
  let bold = false, italic = false;
  const tagRe = /<\/?([a-z]+)[^>]*>|([^<]+)/gi;
  let match;
  while ((match = tagRe.exec(remaining)) !== null) {
    if (match[2]) {
      // Text content
      segments.push({
        text: match[2],
        bold,
        italic,
        underline: false,
        strikethrough: false,
        fontSize: null,
        color: null,
        highlight: null,
        fontFamily: null
      });
    } else {
      const tag = match[1].toLowerCase();
      const isClosing = match[0].startsWith('</');
      if (tag === 'b' || tag === 'strong') bold = !isClosing;
      if (tag === 'i' || tag === 'em') italic = !isClosing;
    }
  }
  return segments.length > 0 ? segments : [{ text: '', bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null, highlight: null, fontFamily: null }];
}

// ---- History class (copied from history.js) ----

class History {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = 100;
  }

  push(ops, inverseOps) {
    this.undoStack.push({ ops, inverseOps });
    this.redoStack = [];
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return null;
    const entry = this.undoStack.pop();
    this.redoStack.push(entry);
    return entry.inverseOps;
  }

  redo() {
    if (!this.canRedo()) return null;
    const entry = this.redoStack.pop();
    this.undoStack.push(entry);
    return entry.ops;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}

// ============================================================
// TESTS
// ============================================================

console.log('\n--- DarkBoard Client Tests ---\n');

// 161. Test createElement() produces correct default properties
test('161: createElement() produces correct default properties', () => {
  const el = createElement('rect', {});
  assert.strictEqual(el.type, 'rect');
  assert.strictEqual(el.x, 0);
  assert.strictEqual(el.y, 0);
  assert.strictEqual(el.width, 0);
  assert.strictEqual(el.height, 0);
  assert.strictEqual(el.fill, 'transparent');
  assert.strictEqual(el.stroke, '#ffffff');
  assert.strictEqual(el.strokeWidth, 2);
  assert.strictEqual(el.text, '');
  assert.strictEqual(el.fontSize, 16);
  assert.strictEqual(el.rotation, 0);
  assert.strictEqual(el.locked, false);
  assert.strictEqual(el.groupId, null);
  assert.ok(typeof el.id === 'string' && el.id.length === 12);
  assert.ok(typeof el.zIndex === 'number');
});

// 162. Test createSticky() has correct dimensions, tags array, color
test('162: createSticky() has correct dimensions, tags array, color', () => {
  const s = createSticky(50, 75);
  assert.strictEqual(s.type, 'sticky');
  assert.strictEqual(s.x, 50);
  assert.strictEqual(s.y, 75);
  assert.strictEqual(s.width, 200);
  assert.strictEqual(s.height, 200);
  assert.ok(STICKY_COLORS.includes(s.fill));
  assert.strictEqual(s.stroke, 'transparent');
  assert.ok(Array.isArray(s.tags));
  assert.strictEqual(s.tags.length, 0);
  assert.strictEqual(s.fontSize, 16);
});

// 163. Test createFrame() has correct properties
test('163: createFrame() has correct properties', () => {
  const f = createFrame(10, 20, 500, 400, 'My Frame');
  assert.strictEqual(f.type, 'frame');
  assert.strictEqual(f.x, 10);
  assert.strictEqual(f.y, 20);
  assert.strictEqual(f.width, 500);
  assert.strictEqual(f.height, 400);
  assert.strictEqual(f.text, 'My Frame');
  assert.strictEqual(f.stroke, '#4a9eff');
  assert.strictEqual(f.zIndex, 1);

  // Default dimensions
  const f2 = createFrame(0, 0);
  assert.strictEqual(f2.width, 400);
  assert.strictEqual(f2.height, 300);
  assert.strictEqual(f2.text, 'Zone');
});

// 164. Test createConnector() links sourceId and targetId
test('164: createConnector() links sourceId and targetId', () => {
  const c = createConnector('src1', 'tgt1', 'arrow');
  assert.strictEqual(c.type, 'connector');
  assert.strictEqual(c.sourceId, 'src1');
  assert.strictEqual(c.targetId, 'tgt1');
  assert.strictEqual(c.connectorStyle, 'arrow');
  assert.strictEqual(c.lineType, 'straight');

  // Default style
  const c2 = createConnector('a', 'b');
  assert.strictEqual(c2.connectorStyle, 'arrow');
});

// 165. Test createMindmapNode() has mindmapParent and mindmapChildren
test('165: createMindmapNode() has mindmapParent and mindmapChildren', () => {
  const m = createMindmapNode(100, 200, 'Node 1', 'parent123', '#ff0000');
  assert.strictEqual(m.type, 'mindmap');
  assert.strictEqual(m.x, 100);
  assert.strictEqual(m.y, 200);
  assert.strictEqual(m.text, 'Node 1');
  assert.strictEqual(m.mindmapParent, 'parent123');
  assert.ok(Array.isArray(m.mindmapChildren));
  assert.strictEqual(m.mindmapChildren.length, 0);
  assert.strictEqual(m.fill, '#ff0000');
  assert.strictEqual(m.width, 160);
  assert.strictEqual(m.height, 50);

  // Default parent/color
  const m2 = createMindmapNode(0, 0);
  assert.strictEqual(m2.mindmapParent, null);
  assert.strictEqual(m2.fill, '#4a9eff');
});

// 166. Test createEmbed() has embedUrl
test('166: createEmbed() has embedUrl', () => {
  const e = createEmbed(10, 20, 'https://example.com');
  assert.strictEqual(e.type, 'embed');
  assert.strictEqual(e.embedUrl, 'https://example.com');
  assert.strictEqual(e.width, 480);
  assert.strictEqual(e.height, 320);
  assert.strictEqual(e.text, 'https://example.com');

  // Default empty URL
  const e2 = createEmbed(0, 0);
  assert.strictEqual(e2.embedUrl, '');
});

// 167. Test getElementBounds() for rect, circle, line, freehand, connector
test('167: getElementBounds() for rect, circle, line, freehand, connector', () => {
  // Rect
  const rect = { type: 'rect', x: 10, y: 20, width: 100, height: 50 };
  const rb = getElementBounds(rect);
  assert.deepStrictEqual(rb, { x: 10, y: 20, w: 100, h: 50 });

  // Circle
  const circ = { type: 'circle', x: 5, y: 5, width: 80, height: 60 };
  const cb = getElementBounds(circ);
  assert.deepStrictEqual(cb, { x: 5, y: 5, w: 80, h: 60 });

  // Line
  const line = { type: 'line', x: 10, y: 20, x2: 50, y2: 5 };
  const lb = getElementBounds(line);
  assert.strictEqual(lb.x, 10);
  assert.strictEqual(lb.y, 5);
  assert.strictEqual(lb.w, 40);
  assert.strictEqual(lb.h, 15);

  // Freehand
  const fh = { type: 'freehand', x: 0, y: 0, points: [{ x: 5, y: 10 }, { x: 20, y: 30 }, { x: 0, y: 15 }] };
  const fb = getElementBounds(fh);
  assert.strictEqual(fb.x, 0);
  assert.strictEqual(fb.y, 10);
  assert.strictEqual(fb.w, 20);
  assert.strictEqual(fb.h, 20);

  // Freehand empty
  const fhEmpty = { type: 'freehand', x: 5, y: 6, points: [] };
  const fbe = getElementBounds(fhEmpty);
  assert.deepStrictEqual(fbe, { x: 5, y: 6, w: 0, h: 0 });

  // Connector
  const conn = { type: 'connector', x: 100, y: 200, x2: 50, y2: 300 };
  const conb = getElementBounds(conn);
  assert.strictEqual(conb.x, 50);
  assert.strictEqual(conb.y, 200);
  assert.strictEqual(conb.w, 50);
  assert.strictEqual(conb.h, 100);
});

// 168. Test hitTestElement() for rect (inside and outside)
test('168: hitTestElement() for rect (inside and outside)', () => {
  const rect = { type: 'rect', x: 10, y: 10, width: 100, height: 50 };
  assert.strictEqual(hitTestElement(rect, 50, 30), true);   // inside
  assert.strictEqual(hitTestElement(rect, 10, 10), true);   // corner
  assert.strictEqual(hitTestElement(rect, 110, 60), true);  // opposite corner
  assert.strictEqual(hitTestElement(rect, 5, 5), false);    // outside
  assert.strictEqual(hitTestElement(rect, 200, 200), false); // far outside
});

// 169. Test hitTestElement() for circle (inside and outside)
test('169: hitTestElement() for circle (inside and outside)', () => {
  const circ = { type: 'circle', x: 0, y: 0, width: 100, height: 100 };
  // Center
  assert.strictEqual(hitTestElement(circ, 50, 50), true);
  // Edge (should be inside ellipse)
  assert.strictEqual(hitTestElement(circ, 50, 0), true);
  // Outside corner - a point at (0,0) of a circle from (0,0) to (100,100):
  // center is at (50,50), rx=50, ry=50; (0-50)/50=(-1), (0-50)/50=(-1), 1+1=2>1 -> outside
  assert.strictEqual(hitTestElement(circ, 0, 0), false);
  // Far outside
  assert.strictEqual(hitTestElement(circ, 200, 200), false);
});

// 170. Test isLightColor() for light and dark colors
test('170: isLightColor() for light and dark colors', () => {
  assert.strictEqual(isLightColor('#ffffff'), true);    // white
  assert.strictEqual(isLightColor('#FFD966'), true);    // yellow sticky
  assert.strictEqual(isLightColor('#000000'), false);   // black
  assert.strictEqual(isLightColor('#1a1a1a'), false);   // very dark
  assert.strictEqual(isLightColor('transparent'), true);
  assert.strictEqual(isLightColor(null), true);
  assert.strictEqual(isLightColor('#4a9eff'), true);    // blue (light enough)
});

// 171. Test richTextToPlain() strips HTML tags
test('171: richTextToPlain() strips HTML tags', () => {
  assert.strictEqual(richTextToPlain('<b>Hello</b> <i>World</i>'), 'Hello World');
  assert.strictEqual(richTextToPlain('Plain text'), 'Plain text');
  assert.strictEqual(richTextToPlain(''), '');
  assert.strictEqual(richTextToPlain(null), '');
  assert.strictEqual(richTextToPlain('<p>Paragraph</p>'), 'Paragraph');
  assert.strictEqual(richTextToPlain('<b><i>Nested</i></b>'), 'Nested');
});

// 172. Test parseRichText() extracts bold/italic segments
test('172: parseRichText() extracts bold/italic segments', () => {
  const segs = parseRichText('<b>Bold</b> normal <i>Italic</i>');
  assert.ok(segs.length >= 3);
  const boldSeg = segs.find(s => s.text === 'Bold');
  assert.ok(boldSeg);
  assert.strictEqual(boldSeg.bold, true);
  assert.strictEqual(boldSeg.italic, false);

  const normalSeg = segs.find(s => s.text.trim() === 'normal');
  assert.ok(normalSeg);
  assert.strictEqual(normalSeg.bold, false);

  const italicSeg = segs.find(s => s.text === 'Italic');
  assert.ok(italicSeg);
  assert.strictEqual(italicSeg.italic, true);

  // Plain text returns single segment
  const plain = parseRichText('Just text');
  assert.strictEqual(plain.length, 1);
  assert.strictEqual(plain[0].text, 'Just text');
  assert.strictEqual(plain[0].bold, false);
});

// 173. Test normalizeRect() normalizes negative widths
test('173: normalizeRect() normalizes negative widths/heights', () => {
  const r = normalizeRect(100, 100, -50, -30);
  assert.strictEqual(r.x, 50);
  assert.strictEqual(r.y, 70);
  assert.strictEqual(r.w, 50);
  assert.strictEqual(r.h, 30);

  // Positive remains unchanged
  const r2 = normalizeRect(10, 20, 30, 40);
  assert.strictEqual(r2.x, 10);
  assert.strictEqual(r2.y, 20);
  assert.strictEqual(r2.w, 30);
  assert.strictEqual(r2.h, 40);
});

// 174. Test History push/undo/redo cycle
test('174: History push/undo/redo cycle', () => {
  const h = new History();
  assert.strictEqual(h.canUndo(), false);
  assert.strictEqual(h.canRedo(), false);
  assert.strictEqual(h.undo(), null);

  const ops1 = [{ type: 'add', elementId: 'a' }];
  const inv1 = [{ type: 'delete', elementId: 'a' }];
  h.push(ops1, inv1);

  assert.strictEqual(h.canUndo(), true);
  assert.strictEqual(h.canRedo(), false);

  // Undo returns inverse ops
  const undone = h.undo();
  assert.deepStrictEqual(undone, inv1);
  assert.strictEqual(h.canUndo(), false);
  assert.strictEqual(h.canRedo(), true);

  // Redo returns forward ops
  const redone = h.redo();
  assert.deepStrictEqual(redone, ops1);
  assert.strictEqual(h.canUndo(), true);
  assert.strictEqual(h.canRedo(), false);

  // Push clears redo stack
  const ops2 = [{ type: 'add', elementId: 'b' }];
  const inv2 = [{ type: 'delete', elementId: 'b' }];
  h.push(ops2, inv2);
  assert.strictEqual(h.canRedo(), false);

  // Clear
  h.clear();
  assert.strictEqual(h.canUndo(), false);
  assert.strictEqual(h.canRedo(), false);

  // Max size enforcement
  for (let i = 0; i < 120; i++) {
    h.push([{ type: 'add', elementId: String(i) }], [{ type: 'delete', elementId: String(i) }]);
  }
  assert.strictEqual(h.undoStack.length, 100);
});

// 175. Test board creation and persistence (mock boards.js createBoard, loadFromDisk)
test('175: board creation and persistence (BoardStore)', () => {
  // We can require the actual server-side module
  const path = require('path');
  const { BoardStore } = require(path.join(__dirname, '..', 'lib', 'boards'));

  const store = new BoardStore();
  // Create a board
  const board = store.createBoard('test-board-175');
  assert.ok(board);
  assert.ok(board.elements instanceof Map);
  assert.strictEqual(board.elements.size, 0);
  assert.ok(board.anchors instanceof Map);
  assert.ok(board.connections instanceof Set);
  assert.ok(typeof board.createdAt === 'number');

  // Get board
  const fetched = store.getBoard('test-board-175');
  assert.ok(fetched);
  assert.strictEqual(fetched, board);

  // Non-existent board
  const missing = store.getBoard('nonexistent-board');
  assert.strictEqual(missing, null);

  // Apply ops
  store.applyOps('test-board-175', [
    { type: 'add', elementId: 'el1', element: { id: 'el1', type: 'rect', x: 0, y: 0 } }
  ]);
  assert.strictEqual(board.elements.size, 1);
  assert.ok(board.elements.has('el1'));

  // Update
  store.applyOps('test-board-175', [
    { type: 'update', elementId: 'el1', props: { x: 50 } }
  ]);
  assert.strictEqual(board.elements.get('el1').x, 50);

  // Delete
  store.applyOps('test-board-175', [
    { type: 'delete', elementId: 'el1' }
  ]);
  assert.strictEqual(board.elements.size, 0);

  // getAllBoardIds
  const ids = store.getAllBoardIds();
  assert.ok(ids.includes('test-board-175'));

  // Clean up
  store.deleteBoard('test-board-175');
  assert.strictEqual(store.getBoard('test-board-175'), null);
});

// ============================================================
// Summary
// ============================================================

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
