// UUID generation
function generateId() {
  return 'xxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

// Session ID (persisted per tab)
function getSessionId() {
  let id = sessionStorage.getItem('darkboard-session');
  if (!id) {
    id = generateId();
    sessionStorage.setItem('darkboard-session', id);
  }
  return id;
}

// Board ID from URL
function getBoardId() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1];
}

// Geometry helpers
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

// Bounding box of element
function getElementBounds(el) {
  switch (el.type) {
    case 'rect':
    case 'sticky':
    case 'text':
    case 'frame':
    case 'image':
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    case 'circle':
      return { x: el.x - el.width / 2, y: el.y - el.height / 2, w: el.width, h: el.height };
    case 'line':
    case 'arrow': {
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

// Clamp
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Lerp
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Deep clone simple objects
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Normalize rect (handle negative w/h from drag)
function normalizeRect(x, y, w, h) {
  return {
    x: w < 0 ? x + w : x,
    y: h < 0 ? y + h : y,
    w: Math.abs(w),
    h: Math.abs(h)
  };
}
