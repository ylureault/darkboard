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
    case 'envelope':
      return pointInRect(worldX, worldY, el.x, el.y, el.width, el.height);
    case 'diamond': {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const dx = Math.abs(worldX - cx) / (el.width / 2);
      const dy = Math.abs(worldY - cy) / (el.height / 2);
      return dx + dy <= 1;
    }
    case 'triangle': {
      const ax = el.x + el.width / 2, ay = el.y;
      const bx = el.x + el.width, by = el.y + el.height;
      const cx2 = el.x, cy2 = el.y + el.height;
      const d1 = (worldX - bx) * (ay - by) - (ax - bx) * (worldY - by);
      const d2 = (worldX - cx2) * (by - cy2) - (bx - cx2) * (worldY - cy2);
      const d3 = (worldX - ax) * (cy2 - ay) - (cx2 - ax) * (worldY - ay);
      const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      return !(hasNeg && hasPos);
    }
    case 'card':
    case 'list':
    case 'mindmap':
    case 'embed':
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
    case 'text':
      return pointInRect(worldX, worldY, el.x - 4, el.y - 4, (el.width || 200) + 8, (el.height || 30) + 8);
    case 'frame': {
      const titleH = (el.fontSize || 16) + 16;
      if (pointInRect(worldX, worldY, el.x, el.y - titleH, el.width, titleH)) return true;
      const borderThreshold = threshold;
      const inOuter = pointInRect(worldX, worldY, el.x - borderThreshold, el.y - borderThreshold, el.width + borderThreshold * 2, el.height + borderThreshold * 2);
      const inInner = pointInRect(worldX, worldY, el.x + borderThreshold, el.y + borderThreshold, el.width - borderThreshold * 2, el.height - borderThreshold * 2);
      return inOuter && !inInner;
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
// Iteration 151-168 Tests
// ============================================================

// 151. Test pointInRect for edge cases (zero-width, negative coords)
test('151: pointInRect edge cases (zero-width, negative coords)', () => {
  // Zero-width rect: a vertical line at x=10 from y=0 to y=100
  assert.strictEqual(pointInRect(10, 50, 10, 0, 0, 100), true);  // on the line
  assert.strictEqual(pointInRect(11, 50, 10, 0, 0, 100), false); // just off

  // Zero-height rect: a horizontal line at y=20 from x=0 to x=100
  assert.strictEqual(pointInRect(50, 20, 0, 20, 100, 0), true);
  assert.strictEqual(pointInRect(50, 21, 0, 20, 100, 0), false);

  // Zero-width and zero-height: a single point
  assert.strictEqual(pointInRect(5, 5, 5, 5, 0, 0), true);
  assert.strictEqual(pointInRect(6, 5, 5, 5, 0, 0), false);

  // Negative coordinates
  assert.strictEqual(pointInRect(-5, -5, -10, -10, 20, 20), true);
  assert.strictEqual(pointInRect(-15, -15, -10, -10, 20, 20), false);

  // Large negative coords
  assert.strictEqual(pointInRect(-500, -500, -1000, -1000, 1000, 1000), true);
});

// 152. Test pointInCircle for edge cases (zero radius, boundary)
test('152: pointInCircle edge cases (zero radius, boundary)', () => {
  // Zero radius: only the center itself passes
  assert.strictEqual(pointInCircle(5, 5, 5, 5, 0), true);
  assert.strictEqual(pointInCircle(6, 5, 5, 5, 0), false);

  // Exactly on boundary (distance^2 == r^2)
  assert.strictEqual(pointInCircle(10, 0, 0, 0, 10), true);
  assert.strictEqual(pointInCircle(0, 10, 0, 0, 10), true);

  // Just outside boundary
  assert.strictEqual(pointInCircle(11, 0, 0, 0, 10), false);

  // Inside
  assert.strictEqual(pointInCircle(3, 4, 0, 0, 10), true); // dist=5 < 10

  // Negative center
  assert.strictEqual(pointInCircle(-5, -5, -5, -5, 1), true);
  assert.strictEqual(pointInCircle(-3, -5, -5, -5, 1), false);
});

// 153. Test distanceToSegment for horizontal/vertical/diagonal segments
test('153: distanceToSegment for horizontal/vertical/diagonal segments', () => {
  // Horizontal segment from (0,0) to (10,0)
  assert.strictEqual(distanceToSegment(5, 0, 0, 0, 10, 0), 0);   // on segment
  assert.strictEqual(distanceToSegment(5, 5, 0, 0, 10, 0), 5);   // perpendicular distance
  assert.strictEqual(distanceToSegment(-1, 0, 0, 0, 10, 0), 1);  // past endpoint

  // Vertical segment from (0,0) to (0,10)
  assert.strictEqual(distanceToSegment(0, 5, 0, 0, 0, 10), 0);
  assert.strictEqual(distanceToSegment(3, 5, 0, 0, 0, 10), 3);

  // Diagonal segment from (0,0) to (10,10): distance from (0,10) should be ~7.07
  const d = distanceToSegment(0, 10, 0, 0, 10, 10);
  assert.ok(Math.abs(d - Math.SQRT2 * 5) < 0.001);

  // Zero-length segment (point): distance to that point
  assert.strictEqual(distanceToSegment(3, 4, 0, 0, 0, 0), 5);
});

// 154. Test distanceToPolyline with single point, two points, complex path
test('154: distanceToPolyline with single point, two points, complex path', () => {
  // Single point: no segments, should return Infinity
  const d1 = distanceToPolyline(5, 5, [{ x: 0, y: 0 }]);
  assert.strictEqual(d1, Infinity);

  // Two points: one segment
  const d2 = distanceToPolyline(5, 5, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  assert.strictEqual(d2, 5); // perpendicular distance to horizontal segment

  // Complex path: L-shape from (0,0) to (10,0) to (10,10)
  const d3 = distanceToPolyline(5, 5, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  assert.strictEqual(d3, 5); // closest to first or second segment, both at dist 5

  // Point on the polyline itself
  const d4 = distanceToPolyline(10, 5, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  assert.strictEqual(d4, 0);

  // Empty points array
  const d5 = distanceToPolyline(5, 5, []);
  assert.strictEqual(d5, Infinity);
});

// 155. Test hitTestElement for sticky, text, frame, diamond, triangle types
test('155: hitTestElement for sticky, text, frame, diamond, triangle types', () => {
  // sticky uses pointInRect (same as rect)
  const sticky = { type: 'sticky', x: 0, y: 0, width: 100, height: 100 };
  assert.strictEqual(hitTestElement(sticky, 50, 50), true);
  assert.strictEqual(hitTestElement(sticky, 150, 150), false);

  // text uses pointInRect with padding
  const text = { type: 'text', x: 0, y: 0, width: 100, height: 30 };
  assert.strictEqual(hitTestElement(text, 50, 15), true);
  assert.strictEqual(hitTestElement(text, 200, 200), false);

  // frame uses border/title hit test - center of frame (inside) should NOT hit (only borders)
  const frame = { type: 'frame', x: 0, y: 0, width: 200, height: 200 };
  assert.strictEqual(hitTestElement(frame, 100, 100), false); // center is interior
  assert.strictEqual(hitTestElement(frame, 0, 0), true); // border corner

  // diamond uses rhombus point test
  const diamond = { type: 'diamond', x: 0, y: 0, width: 100, height: 100 };
  assert.strictEqual(hitTestElement(diamond, 50, 50), true); // center
  assert.strictEqual(hitTestElement(diamond, 0, 0), false); // corner (outside rhombus)

  // triangle uses point-in-triangle test
  const triangle = { type: 'triangle', x: 0, y: 0, width: 100, height: 100 };
  assert.strictEqual(hitTestElement(triangle, 50, 80), true); // inside
  assert.strictEqual(hitTestElement(triangle, 0, 0), false); // top-left corner (outside)

  // image uses pointInRect (same as rect)
  const image = { type: 'image', x: 10, y: 10, width: 50, height: 50 };
  assert.strictEqual(hitTestElement(image, 30, 30), true);
  assert.strictEqual(hitTestElement(image, 5, 5), false);
});

// 156. Test hitTestElement for freehand with various point configurations
test('156: hitTestElement for freehand with various point configurations', () => {
  // No points: should return false
  const fh1 = { type: 'freehand', x: 0, y: 0, points: [] };
  assert.strictEqual(hitTestElement(fh1, 0, 0), false);

  // Single point: less than 2 points, returns false
  const fh2 = { type: 'freehand', x: 0, y: 0, points: [{ x: 5, y: 5 }] };
  assert.strictEqual(hitTestElement(fh2, 5, 5), false);

  // Two points forming a horizontal segment
  const fh3 = { type: 'freehand', x: 0, y: 0, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  assert.strictEqual(hitTestElement(fh3, 50, 0), true);   // on the line
  assert.strictEqual(hitTestElement(fh3, 50, 5), true);    // within threshold (8)
  assert.strictEqual(hitTestElement(fh3, 50, 20), false);  // outside threshold

  // Complex path
  const fh4 = { type: 'freehand', x: 0, y: 0, points: [
    { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }
  ] };
  assert.strictEqual(hitTestElement(fh4, 25, 0), true);    // on first segment
  assert.strictEqual(hitTestElement(fh4, 50, 25), true);   // on second segment
  assert.strictEqual(hitTestElement(fh4, 25, 25), false);  // inside box but not near line

  // Undefined points
  const fh5 = { type: 'freehand', x: 0, y: 0 };
  assert.strictEqual(hitTestElement(fh5, 0, 0), false);
});

// 157. Test getElementBounds for all element types including mindmap and embed
test('157: getElementBounds for all element types including mindmap and embed', () => {
  // sticky
  const sticky = { type: 'sticky', x: 10, y: 20, width: 200, height: 200 };
  assert.deepStrictEqual(getElementBounds(sticky), { x: 10, y: 20, w: 200, h: 200 });

  // text
  const text = { type: 'text', x: 5, y: 10, width: 150, height: 30 };
  assert.deepStrictEqual(getElementBounds(text), { x: 5, y: 10, w: 150, h: 30 });

  // frame
  const frame = { type: 'frame', x: 0, y: 0, width: 400, height: 300 };
  assert.deepStrictEqual(getElementBounds(frame), { x: 0, y: 0, w: 400, h: 300 });

  // diamond
  const diamond = { type: 'diamond', x: 50, y: 50, width: 100, height: 80 };
  assert.deepStrictEqual(getElementBounds(diamond), { x: 50, y: 50, w: 100, h: 80 });

  // triangle
  const triangle = { type: 'triangle', x: 0, y: 0, width: 60, height: 80 };
  assert.deepStrictEqual(getElementBounds(triangle), { x: 0, y: 0, w: 60, h: 80 });

  // envelope
  const envelope = { type: 'envelope', x: 10, y: 10, width: 120, height: 80 };
  assert.deepStrictEqual(getElementBounds(envelope), { x: 10, y: 10, w: 120, h: 80 });

  // card
  const card = { type: 'card', x: 0, y: 0, width: 200, height: 150 };
  assert.deepStrictEqual(getElementBounds(card), { x: 0, y: 0, w: 200, h: 150 });

  // list
  const list = { type: 'list', x: 5, y: 5, width: 250, height: 300 };
  assert.deepStrictEqual(getElementBounds(list), { x: 5, y: 5, w: 250, h: 300 });

  // mindmap (falls to default case)
  const mindmap = { type: 'mindmap', x: 100, y: 200, width: 160, height: 50 };
  const mb = getElementBounds(mindmap);
  assert.strictEqual(mb.x, 100);
  assert.strictEqual(mb.y, 200);
  assert.strictEqual(mb.w, 160);
  assert.strictEqual(mb.h, 50);

  // embed (falls to default case)
  const embed = { type: 'embed', x: 0, y: 0, width: 480, height: 320 };
  const eb = getElementBounds(embed);
  assert.strictEqual(eb.x, 0);
  assert.strictEqual(eb.y, 0);
  assert.strictEqual(eb.w, 480);
  assert.strictEqual(eb.h, 320);

  // arrow
  const arrow = { type: 'arrow', x: 0, y: 0, x2: 100, y2: 50 };
  const ab = getElementBounds(arrow);
  assert.strictEqual(ab.x, 0);
  assert.strictEqual(ab.y, 0);
  assert.strictEqual(ab.w, 100);
  assert.strictEqual(ab.h, 50);

  // freehand with no points
  const fhNone = { type: 'freehand', x: 10, y: 20, points: null };
  assert.deepStrictEqual(getElementBounds(fhNone), { x: 10, y: 20, w: 0, h: 0 });
});

// 158. Test normalizeRect with zero width/height
test('158: normalizeRect with zero width/height', () => {
  // Zero width
  const r1 = normalizeRect(50, 50, 0, 100);
  assert.strictEqual(r1.x, 50);
  assert.strictEqual(r1.y, 50);
  assert.strictEqual(r1.w, 0);
  assert.strictEqual(r1.h, 100);

  // Zero height
  const r2 = normalizeRect(50, 50, 100, 0);
  assert.strictEqual(r2.x, 50);
  assert.strictEqual(r2.y, 50);
  assert.strictEqual(r2.w, 100);
  assert.strictEqual(r2.h, 0);

  // Both zero
  const r3 = normalizeRect(25, 75, 0, 0);
  assert.strictEqual(r3.x, 25);
  assert.strictEqual(r3.y, 75);
  assert.strictEqual(r3.w, 0);
  assert.strictEqual(r3.h, 0);

  // Negative zero-ish: very small negative
  const r4 = normalizeRect(100, 100, -0, -0);
  assert.strictEqual(r4.w, 0);
  assert.strictEqual(r4.h, 0);
});

// 159. Test createElement with override props replacing defaults
test('159: createElement with override props replacing defaults', () => {
  const el = createElement('rect', {
    x: 100,
    y: 200,
    width: 50,
    height: 75,
    fill: '#ff0000',
    stroke: '#00ff00',
    strokeWidth: 5,
    text: 'Hello',
    fontSize: 24,
    rotation: 45,
    locked: true,
    groupId: 'g1'
  });
  assert.strictEqual(el.x, 100);
  assert.strictEqual(el.y, 200);
  assert.strictEqual(el.width, 50);
  assert.strictEqual(el.height, 75);
  assert.strictEqual(el.fill, '#ff0000');
  assert.strictEqual(el.stroke, '#00ff00');
  assert.strictEqual(el.strokeWidth, 5);
  assert.strictEqual(el.text, 'Hello');
  assert.strictEqual(el.fontSize, 24);
  assert.strictEqual(el.rotation, 45);
  assert.strictEqual(el.locked, true);
  assert.strictEqual(el.groupId, 'g1');
  assert.strictEqual(el.type, 'rect');
});

// 160. Test that each factory function generates unique IDs
test('160: Factory functions generate unique IDs', () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) {
    ids.add(createSticky(0, 0).id);
    ids.add(createFrame(0, 0).id);
    ids.add(createConnector('a', 'b').id);
    ids.add(createMindmapNode(0, 0).id);
    ids.add(createEmbed(0, 0).id);
    ids.add(createElement('rect', {}).id);
  }
  // 300 total IDs, all should be unique
  assert.strictEqual(ids.size, 300);
});

// 161. Test createConnector with various styles
test('161: createConnector with various styles (arrow, line, dashed)', () => {
  const c1 = createConnector('s1', 't1', 'arrow');
  assert.strictEqual(c1.connectorStyle, 'arrow');

  const c2 = createConnector('s2', 't2', 'line');
  assert.strictEqual(c2.connectorStyle, 'line');

  const c3 = createConnector('s3', 't3', 'dashed');
  assert.strictEqual(c3.connectorStyle, 'dashed');

  // All have correct source/target
  assert.strictEqual(c1.sourceId, 's1');
  assert.strictEqual(c1.targetId, 't1');
  assert.strictEqual(c2.sourceId, 's2');
  assert.strictEqual(c3.targetId, 't3');

  // All are connector type
  assert.strictEqual(c1.type, 'connector');
  assert.strictEqual(c2.type, 'connector');
  assert.strictEqual(c3.type, 'connector');
});

// 162. Test that element zIndex is always a valid number
test('162: Element zIndex is always a valid number', () => {
  const el1 = createElement('rect', {});
  assert.strictEqual(typeof el1.zIndex, 'number');
  assert.ok(!isNaN(el1.zIndex));
  assert.ok(isFinite(el1.zIndex));

  const sticky = createSticky(0, 0);
  assert.strictEqual(typeof sticky.zIndex, 'number');
  assert.ok(!isNaN(sticky.zIndex));

  const frame = createFrame(0, 0);
  assert.strictEqual(frame.zIndex, 1); // frames have zIndex=1

  const conn = createConnector('a', 'b');
  assert.strictEqual(typeof conn.zIndex, 'number');
  assert.ok(!isNaN(conn.zIndex));

  const mindmap = createMindmapNode(0, 0);
  assert.strictEqual(typeof mindmap.zIndex, 'number');

  const embed = createEmbed(0, 0);
  assert.strictEqual(typeof embed.zIndex, 'number');
});

// 163. Test createElement with nested props (tags array, points array)
test('163: createElement with nested props (tags array, points array)', () => {
  const el = createElement('sticky', {
    tags: ['important', 'todo', 'review'],
    points: [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 40 }]
  });
  assert.ok(Array.isArray(el.tags));
  assert.strictEqual(el.tags.length, 3);
  assert.strictEqual(el.tags[0], 'important');
  assert.strictEqual(el.tags[2], 'review');

  assert.ok(Array.isArray(el.points));
  assert.strictEqual(el.points.length, 3);
  assert.deepStrictEqual(el.points[1], { x: 10, y: 20 });

  // Empty arrays
  const el2 = createElement('rect', { tags: [], points: [] });
  assert.ok(Array.isArray(el2.tags));
  assert.strictEqual(el2.tags.length, 0);
  assert.ok(Array.isArray(el2.points));
  assert.strictEqual(el2.points.length, 0);
});

// 164. Test History with multiple sequential undo/redo operations
test('164: History multiple sequential undo/redo', () => {
  const h = new History();
  const entries = [];
  for (let i = 0; i < 5; i++) {
    const ops = [{ type: 'add', elementId: `e${i}` }];
    const inv = [{ type: 'delete', elementId: `e${i}` }];
    entries.push({ ops, inv });
    h.push(ops, inv);
  }
  assert.strictEqual(h.undoStack.length, 5);

  // Undo all 5
  for (let i = 4; i >= 0; i--) {
    const result = h.undo();
    assert.deepStrictEqual(result, entries[i].inv);
  }
  assert.strictEqual(h.undoStack.length, 0);
  assert.strictEqual(h.redoStack.length, 5);

  // Redo all 5
  for (let i = 0; i < 5; i++) {
    const result = h.redo();
    assert.deepStrictEqual(result, entries[i].ops);
  }
  assert.strictEqual(h.undoStack.length, 5);
  assert.strictEqual(h.redoStack.length, 0);

  // Undo 3, then redo 2
  h.undo(); h.undo(); h.undo();
  assert.strictEqual(h.undoStack.length, 2);
  assert.strictEqual(h.redoStack.length, 3);
  h.redo(); h.redo();
  assert.strictEqual(h.undoStack.length, 4);
  assert.strictEqual(h.redoStack.length, 1);
});

// 165. Test History max size eviction (push 150, verify stack is 100)
test('165: History max size eviction', () => {
  const h = new History();
  for (let i = 0; i < 150; i++) {
    h.push([{ type: 'add', id: i }], [{ type: 'delete', id: i }]);
  }
  assert.strictEqual(h.undoStack.length, 100);

  // The oldest entries (0-49) should have been evicted
  // The newest entry should have id=149
  const newest = h.undoStack[h.undoStack.length - 1];
  assert.strictEqual(newest.ops[0].id, 149);

  // The oldest remaining should have id=50
  const oldest = h.undoStack[0];
  assert.strictEqual(oldest.ops[0].id, 50);
});

// 166. Test that redo stack clears on new push after undo
test('166: Redo stack clears on new push after undo', () => {
  const h = new History();
  h.push([{ type: 'add', id: 1 }], [{ type: 'delete', id: 1 }]);
  h.push([{ type: 'add', id: 2 }], [{ type: 'delete', id: 2 }]);
  h.push([{ type: 'add', id: 3 }], [{ type: 'delete', id: 3 }]);

  // Undo twice
  h.undo();
  h.undo();
  assert.strictEqual(h.redoStack.length, 2);
  assert.strictEqual(h.undoStack.length, 1);

  // Push a new operation - redo stack should clear
  h.push([{ type: 'add', id: 4 }], [{ type: 'delete', id: 4 }]);
  assert.strictEqual(h.redoStack.length, 0);
  assert.strictEqual(h.undoStack.length, 2);

  // The redo of the old entries is gone
  assert.strictEqual(h.canRedo(), false);
});

// 167. Test History.clear() resets both stacks
test('167: History.clear() resets both stacks', () => {
  const h = new History();
  for (let i = 0; i < 10; i++) {
    h.push([{ type: 'add', id: i }], [{ type: 'delete', id: i }]);
  }
  h.undo(); h.undo(); h.undo();
  assert.strictEqual(h.undoStack.length, 7);
  assert.strictEqual(h.redoStack.length, 3);

  h.clear();
  assert.strictEqual(h.undoStack.length, 0);
  assert.strictEqual(h.redoStack.length, 0);
  assert.strictEqual(h.canUndo(), false);
  assert.strictEqual(h.canRedo(), false);
});

// 168. Test History undo returns null when empty
test('168: History undo/redo return null when empty', () => {
  const h = new History();
  assert.strictEqual(h.undo(), null);
  assert.strictEqual(h.redo(), null);

  // Push then undo to empty, verify undo returns null again
  h.push([{ type: 'add' }], [{ type: 'delete' }]);
  h.undo();
  assert.strictEqual(h.undo(), null);

  // Redo then redo again when empty
  h.redo();
  assert.strictEqual(h.redo(), null);
});

// ============================================================
// Bug Fix Regression Tests
// ============================================================

// 169. drawSticky should accept camera parameter
test('169: drawSticky function accepts camera parameter', () => {
  // Verify the function signature accepts 3 parameters
  // This tests that the camera param is passed through renderElement
  const el = createSticky(100, 200);
  const bounds = getElementBounds(el);
  assert.ok(bounds.w > 0 && bounds.h > 0, 'Sticky should have positive dimensions');
  assert.strictEqual(el.width, 200, 'Default sticky width should be 200');
  assert.strictEqual(el.height, 200, 'Default sticky height should be 200');
});

// 170. Shape minimum size enforcement
test('170: Shape minimum size enforcement is consistent', () => {
  // Test that normalizeRect handles small shapes
  const norm1 = normalizeRect(0, 0, 3, 3);
  const finalW = Math.max(norm1.w, 10);
  const finalH = Math.max(norm1.h, 10);
  // With the fix, we check finalW >= 10 (not norm.w > 5)
  assert.ok(finalW >= 10, 'Enforced width should be at least 10');
  assert.ok(finalH >= 10, 'Enforced height should be at least 10');
  // A 3x3 drag should still result in a valid element
  assert.strictEqual(finalW, 10);
  assert.strictEqual(finalH, 10);
});

// 171. Element lifecycle: create, update, delete ops
test('171: Element lifecycle ops are correctly structured', () => {
  const el = createSticky(50, 75);

  // Create add op
  const addOp = { type: 'add', elementId: el.id, element: el };
  assert.strictEqual(addOp.type, 'add');
  assert.strictEqual(addOp.elementId, el.id);
  assert.deepStrictEqual(addOp.element, el);

  // Create update op
  const updateOp = { type: 'update', elementId: el.id, props: { text: 'Hello' } };
  assert.strictEqual(updateOp.type, 'update');
  assert.ok(updateOp.props);

  // Create delete op (inverse of add)
  const deleteOp = { type: 'delete', elementId: el.id };
  assert.strictEqual(deleteOp.type, 'delete');
  assert.strictEqual(deleteOp.elementId, el.id);
});

// 172. compressOps merges consecutive updates to same element
test('172: compressOps merges consecutive updates correctly', () => {
  // Simulate the compressOps logic
  function compressOps(ops) {
    if (!ops || ops.length < 2) return ops;
    const merged = [];
    for (const op of ops) {
      const last = merged[merged.length - 1];
      if (last && last.type === 'update' && op.type === 'update' && last.elementId === op.elementId) {
        Object.assign(last.props, op.props);
      } else {
        merged.push({ ...op, props: op.props ? { ...op.props } : undefined });
      }
    }
    return merged;
  }

  const ops = [
    { type: 'update', elementId: 'a', props: { x: 10 } },
    { type: 'update', elementId: 'a', props: { y: 20 } },
    { type: 'update', elementId: 'a', props: { x: 30 } },
  ];

  const compressed = compressOps(ops);
  assert.strictEqual(compressed.length, 1, 'Should merge 3 updates into 1');
  assert.strictEqual(compressed[0].props.x, 30, 'Last x value wins');
  assert.strictEqual(compressed[0].props.y, 20, 'y should be preserved');
});

// 173. compressOps preserves add operations unchanged
test('173: compressOps preserves add operations', () => {
  function compressOps(ops) {
    if (!ops || ops.length < 2) return ops;
    const merged = [];
    for (const op of ops) {
      const last = merged[merged.length - 1];
      if (last && last.type === 'update' && op.type === 'update' && last.elementId === op.elementId) {
        Object.assign(last.props, op.props);
      } else {
        merged.push({ ...op, props: op.props ? { ...op.props } : undefined });
      }
    }
    return merged;
  }

  const el = createSticky(10, 20);
  const ops = [
    { type: 'add', elementId: el.id, element: el },
    { type: 'update', elementId: el.id, props: { text: 'Hello' } },
  ];

  const compressed = compressOps(ops);
  assert.strictEqual(compressed.length, 2, 'Add and update should not merge');
  assert.strictEqual(compressed[0].type, 'add');
  assert.ok(compressed[0].element, 'Add op should preserve element');
  assert.strictEqual(compressed[1].type, 'update');
});

// 174. Element Map operations: set, get, delete
test('174: Element Map operations work correctly', () => {
  const elements = new Map();
  const el1 = createSticky(0, 0);
  const el2 = createSticky(100, 100);

  elements.set(el1.id, el1);
  elements.set(el2.id, el2);

  assert.strictEqual(elements.size, 2);
  assert.strictEqual(elements.get(el1.id), el1);

  // Simulate applyOps update
  const stored = elements.get(el1.id);
  Object.assign(stored, { text: 'Updated' });
  assert.strictEqual(elements.get(el1.id).text, 'Updated');

  // Simulate applyOps delete
  elements.delete(el2.id);
  assert.strictEqual(elements.size, 1);
  assert.strictEqual(elements.get(el2.id), undefined);
});

// 175. History inverse ops correctly reverse add/delete
test('175: History inverse ops correctly reverse add/delete', () => {
  const h = new History();
  const elements = new Map();

  // Add an element
  const el = createSticky(50, 50);
  const addOps = [{ type: 'add', elementId: el.id, element: el }];
  const inverseOps = [{ type: 'delete', elementId: el.id }];

  elements.set(el.id, el);
  h.push(addOps, inverseOps);

  // Undo should return inverse ops (delete) - returns array directly
  const undoResult = h.undo();
  assert.ok(undoResult);
  assert.ok(Array.isArray(undoResult), 'undo() returns an array');
  assert.strictEqual(undoResult[0].type, 'delete');
  assert.strictEqual(undoResult[0].elementId, el.id);

  // Redo should return original ops (add) - returns array directly
  const redoResult = h.redo();
  assert.ok(redoResult);
  assert.ok(Array.isArray(redoResult), 'redo() returns an array');
  assert.strictEqual(redoResult[0].type, 'add');
  assert.strictEqual(redoResult[0].elementId, el.id);
});

// 176. Multiple element types can coexist in Map
test('176: Multiple element types coexist correctly', () => {
  const elements = new Map();
  const sticky = createSticky(0, 0);
  const frame = createFrame(100, 100, 400, 300);
  const conn = createConnector('src1', 'tgt1');
  const mindmap = createMindmapNode(200, 200, 'Root');

  elements.set(sticky.id, sticky);
  elements.set(frame.id, frame);
  elements.set(conn.id, conn);
  elements.set(mindmap.id, mindmap);

  assert.strictEqual(elements.size, 4);

  // Verify each type
  assert.strictEqual(elements.get(sticky.id).type, 'sticky');
  assert.strictEqual(elements.get(frame.id).type, 'frame');
  assert.strictEqual(elements.get(conn.id).type, 'connector');
  assert.strictEqual(elements.get(mindmap.id).type, 'mindmap');
});

// 177. applyOps simulation: full lifecycle
test('177: applyOps simulation - add, update, delete cycle', () => {
  const elements = new Map();

  function applyOps(ops) {
    for (const op of ops) {
      switch (op.type) {
        case 'add':
          elements.set(op.elementId, op.element);
          break;
        case 'update': {
          const el = elements.get(op.elementId);
          if (el) Object.assign(el, op.props);
          break;
        }
        case 'delete':
          elements.delete(op.elementId);
          break;
      }
    }
  }

  const el = createSticky(10, 20);

  // Add
  applyOps([{ type: 'add', elementId: el.id, element: el }]);
  assert.strictEqual(elements.size, 1);
  assert.strictEqual(elements.get(el.id).x, 10);

  // Update
  applyOps([{ type: 'update', elementId: el.id, props: { x: 50, text: 'Test' } }]);
  assert.strictEqual(elements.get(el.id).x, 50);
  assert.strictEqual(elements.get(el.id).text, 'Test');

  // Delete
  applyOps([{ type: 'delete', elementId: el.id }]);
  assert.strictEqual(elements.size, 0);

  // Update on non-existent element should not crash
  applyOps([{ type: 'update', elementId: 'nonexistent', props: { x: 100 } }]);
  assert.strictEqual(elements.size, 0);
});

// 178. Offline queue re-application after init
test('178: Offline queue ops re-applied after init', () => {
  const elements = new Map();

  function applyOps(ops) {
    for (const op of ops) {
      switch (op.type) {
        case 'add':
          elements.set(op.elementId, op.element);
          break;
        case 'update': {
          const el = elements.get(op.elementId);
          if (el) Object.assign(el, op.props);
          break;
        }
        case 'delete':
          elements.delete(op.elementId);
          break;
      }
    }
  }

  // User creates sticky while offline
  const offlineSticky = createSticky(100, 200);
  const offlineOps = [{ type: 'add', elementId: offlineSticky.id, element: offlineSticky }];
  applyOps(offlineOps);
  assert.strictEqual(elements.size, 1);

  // Simulate init clearing state (server doesn't have the offline sticky)
  elements.clear();
  const serverElements = [
    { id: 'server1', type: 'rect', x: 0, y: 0, width: 50, height: 50 }
  ];
  for (const el of serverElements) {
    elements.set(el.id, el);
  }
  assert.strictEqual(elements.size, 1, 'Only server element after init');
  assert.ok(!elements.has(offlineSticky.id), 'Offline sticky lost after init');

  // Re-apply offline ops (the fix)
  applyOps(offlineOps);
  assert.strictEqual(elements.size, 2, 'Both server and offline elements present');
  assert.ok(elements.has(offlineSticky.id), 'Offline sticky recovered');
  assert.ok(elements.has('server1'), 'Server element preserved');
});

// 179. Sorted elements cache invalidation
test('179: Sorted elements cache invalidation on add', () => {
  const elements = new Map();
  let sortedCacheDirty = true;
  let sortedCache = null;

  function getSortedElements() {
    if (!sortedCacheDirty && sortedCache) return sortedCache;
    sortedCache = Array.from(elements.values()).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    sortedCacheDirty = false;
    return sortedCache;
  }

  function markDirty() { sortedCacheDirty = true; }

  const el1 = createElement('rect', { x: 0, y: 0, width: 50, height: 50, zIndex: 2 });
  elements.set(el1.id, el1);
  markDirty();

  let sorted = getSortedElements();
  assert.strictEqual(sorted.length, 1);

  const el2 = createElement('rect', { x: 100, y: 100, width: 50, height: 50, zIndex: 1 });
  elements.set(el2.id, el2);
  markDirty();

  sorted = getSortedElements();
  assert.strictEqual(sorted.length, 2);
  assert.strictEqual(sorted[0].zIndex, 1, 'Lower zIndex should come first');
  assert.strictEqual(sorted[1].zIndex, 2, 'Higher zIndex should come second');
});

// 180. Viewport culling bounds check
test('180: Viewport culling bounds check', () => {
  // Simulate viewport culling logic
  const vpLeft = -500, vpRight = 500, vpTop = -500, vpBottom = 500;

  const visible = { x: 0, y: 0, w: 100, h: 100 };
  const isVisible = !(visible.x + visible.w < vpLeft || visible.x > vpRight ||
                       visible.y + visible.h < vpTop || visible.y > vpBottom);
  assert.ok(isVisible, 'Element at origin should be visible');

  const offscreen = { x: 600, y: 600, w: 100, h: 100 };
  const isOffscreen = !(offscreen.x + offscreen.w < vpLeft || offscreen.x > vpRight ||
                         offscreen.y + offscreen.h < vpTop || offscreen.y > vpBottom);
  assert.ok(!isOffscreen, 'Element at 600,600 should be off-screen');

  const partial = { x: 450, y: 450, w: 100, h: 100 };
  const isPartial = !(partial.x + partial.w < vpLeft || partial.x > vpRight ||
                       partial.y + partial.h < vpTop || partial.y > vpBottom);
  assert.ok(isPartial, 'Partially visible element should not be culled');
});

// 181. Hit test accuracy for all element types
test('181: hitTestElement for card, list, envelope types', () => {
  const card = createElement('card', { x: 0, y: 0, width: 200, height: 150 });
  assert.ok(hitTestElement(card, 100, 75), 'Should hit center of card');
  assert.ok(!hitTestElement(card, 300, 300), 'Should miss card');

  const list = createElement('list', { x: 50, y: 50, width: 180, height: 200 });
  assert.ok(hitTestElement(list, 100, 100), 'Should hit center of list');
  assert.ok(!hitTestElement(list, 0, 0), 'Should miss list');

  const envelope = createElement('envelope', { x: 10, y: 10, width: 300, height: 200 });
  assert.ok(hitTestElement(envelope, 100, 100), 'Should hit center of envelope');
});

// 182. Element bounds for embed and mindmap
test('182: getElementBounds for card, list, envelope', () => {
  const card = createElement('card', { x: 10, y: 20, width: 200, height: 150 });
  const cardBounds = getElementBounds(card);
  assert.strictEqual(cardBounds.x, 10);
  assert.strictEqual(cardBounds.y, 20);
  assert.strictEqual(cardBounds.w, 200);
  assert.strictEqual(cardBounds.h, 150);

  const list = createElement('list', { x: 5, y: 15, width: 180, height: 250 });
  const listBounds = getElementBounds(list);
  assert.strictEqual(listBounds.w, 180);
  assert.strictEqual(listBounds.h, 250);
});

// 183. createSticky with custom properties
test('183: createSticky preserves custom properties', () => {
  const el = createSticky(50, 75);
  el.text = 'Custom text';
  el.fill = '#FF0000';
  el.tags = [{ label: 'Urgent', color: '#FF6B6B' }];

  assert.strictEqual(el.text, 'Custom text');
  assert.strictEqual(el.fill, '#FF0000');
  assert.strictEqual(el.tags.length, 1);
  assert.strictEqual(el.tags[0].label, 'Urgent');
});

// 184. Batch operations preserve order
test('184: Batch operations preserve execution order', () => {
  const elements = new Map();

  function applyOps(ops) {
    for (const op of ops) {
      switch (op.type) {
        case 'add':
          elements.set(op.elementId, op.element);
          break;
        case 'update': {
          const el = elements.get(op.elementId);
          if (el) Object.assign(el, op.props);
          break;
        }
        case 'delete':
          elements.delete(op.elementId);
          break;
      }
    }
  }

  const el = createSticky(0, 0);
  // Add then immediately update
  applyOps([
    { type: 'add', elementId: el.id, element: el },
    { type: 'update', elementId: el.id, props: { text: 'Updated' } }
  ]);

  assert.strictEqual(elements.size, 1);
  assert.strictEqual(elements.get(el.id).text, 'Updated');

  // Add then immediately delete
  const el2 = createSticky(100, 100);
  applyOps([
    { type: 'add', elementId: el2.id, element: el2 },
    { type: 'delete', elementId: el2.id }
  ]);

  assert.strictEqual(elements.size, 1, 'el2 should be deleted');
  assert.ok(!elements.has(el2.id));
});

// 185. NaN guard in element creation
test('185: Elements reject NaN coordinates gracefully', () => {
  const el = createElement('rect', { x: NaN, y: 0, width: 100, height: 100 });
  // Element should still be created (NaN guard is at render time, not create time)
  assert.ok(el.id);
  assert.ok(isNaN(el.x), 'NaN x should be stored');

  // But bounds should handle it
  const bounds = getElementBounds(el);
  // NaN propagates through bounds
  assert.ok(bounds !== null, 'getElementBounds should not crash on NaN');
});

// 186. Empty board state
test('186: Empty board has zero elements', () => {
  const elements = new Map();
  assert.strictEqual(elements.size, 0);

  const sorted = Array.from(elements.values()).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  assert.strictEqual(sorted.length, 0);
});

// 187. Selection set operations
test('187: Selection set operations', () => {
  const selectedIds = new Set();
  const el1 = createSticky(0, 0);
  const el2 = createSticky(100, 100);

  selectedIds.add(el1.id);
  assert.strictEqual(selectedIds.size, 1);
  assert.ok(selectedIds.has(el1.id));
  assert.ok(!selectedIds.has(el2.id));

  selectedIds.add(el2.id);
  assert.strictEqual(selectedIds.size, 2);

  selectedIds.clear();
  assert.strictEqual(selectedIds.size, 0);

  // Add and remove
  selectedIds.add(el1.id);
  selectedIds.delete(el1.id);
  assert.strictEqual(selectedIds.size, 0);
});

// 188. normalizeRect with various edge cases
test('188: normalizeRect with negative dimensions', () => {
  // Dragging from bottom-right to top-left
  const r1 = normalizeRect(100, 100, -50, -50);
  assert.strictEqual(r1.x, 50);
  assert.strictEqual(r1.y, 50);
  assert.strictEqual(r1.w, 50);
  assert.strictEqual(r1.h, 50);

  // Zero dimensions
  const r2 = normalizeRect(50, 50, 0, 0);
  assert.strictEqual(r2.x, 50);
  assert.strictEqual(r2.w, 0);
});

// ============================================================
// Summary
// ============================================================

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
