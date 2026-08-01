// #198: utils.js - Core utility functions for DarkBoard.
// Provides ID generation, session management, geometry helpers, bounding box calculations, and math utilities.

// How long the "element created / restored" glow ring stays on screen.
const FLASH_DURATION_MS = 500;

/**
 * Generate a random 12-character hexadecimal ID.
 * @returns {string} A unique identifier string
 */
function generateId() {
  return 'xxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

/**
 * Get or create a persistent session ID for the current browser tab.
 * @returns {string} The session ID stored in sessionStorage
 */
function getSessionId() {
  let id = sessionStorage.getItem('darkboard-session');
  if (!id) {
    id = generateId();
    sessionStorage.setItem('darkboard-session', id);
  }
  return id;
}

/**
 * Extract the board ID from the current URL path.
 * @returns {string} The board ID (last segment of the URL path)
 */
function getBoardId() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1];
}

/**
 * Test if a point (px, py) is inside a rectangle defined by (x, y, w, h).
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {number} x - Rectangle left
 * @param {number} y - Rectangle top
 * @param {number} w - Rectangle width
 * @param {number} h - Rectangle height
 * @returns {boolean} True if point is inside the rectangle
 */
function pointInRect(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

/**
 * Test if a point (px, py) is inside a circle with center (cx, cy) and radius r.
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {number} cx - Circle center X
 * @param {number} cy - Circle center Y
 * @param {number} r - Circle radius
 * @returns {boolean} True if point is inside the circle
 */
function pointInCircle(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Compute the minimum distance from point (px, py) to a line segment (x1,y1)-(x2,y2).
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {number} x1 - Segment start X
 * @param {number} y1 - Segment start Y
 * @param {number} x2 - Segment end X
 * @param {number} y2 - Segment end Y
 * @returns {number} The shortest distance from the point to the segment
 */
function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Compute the minimum distance from a point to a polyline (array of {x,y} points).
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {Array<{x:number, y:number}>} points - Polyline vertices
 * @returns {number} The shortest distance from the point to any segment of the polyline
 */
function distanceToPolyline(px, py, points) {
  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(px, py, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Get the axis-aligned bounding box of an element in world coordinates.
 * @param {Object} el - The element object
 * @returns {{x:number, y:number, w:number, h:number}} Bounding box with x, y, w, h
 */
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

/**
 * Clamp a value between a minimum and maximum.
 * @param {number} val - The value to clamp
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} The clamped value
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Linear interpolation between two values.
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0 to 1)
 * @returns {number} The interpolated value
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Deep clone a JSON-serializable object.
 * @param {Object} obj - The object to clone
 * @returns {Object} A deep copy of the input
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Normalize a rectangle that may have negative width/height (from right-to-left drag).
 * Ensures the returned rect has positive w and h, with x/y adjusted accordingly.
 * @param {number} x - Original X
 * @param {number} y - Original Y
 * @param {number} w - Width (may be negative)
 * @param {number} h - Height (may be negative)
 * @returns {{x:number, y:number, w:number, h:number}} Normalized rectangle
 */
function normalizeRect(x, y, w, h) {
  return {
    x: w < 0 ? x + w : x,
    y: h < 0 ? y + h : y,
    w: Math.abs(w),
    h: Math.abs(h)
  };
}
