// #198: objects.js - Element factories, rendering functions, and hit testing for all DarkBoard element types.
// Defines createElement and specialized create* functions, plus canvas draw routines for each type.

// #178: Gradient cache to avoid recreating gradient objects every frame
const _gradientCache = new Map();
function _getCachedGradient(ctx, key, createFn) {
  if (_gradientCache.has(key)) return _gradientCache.get(key);
  const grad = createFn(ctx);
  if (_gradientCache.size > 200) _gradientCache.clear(); // evict when too large
  _gradientCache.set(key, grad);
  return grad;
}

// #181: Text measurement cache to avoid expensive ctx.measureText calls on every frame
const _textMeasureCache = new Map();
function measureTextCached(ctx, text, font) {
  const key = font + '||' + text;
  if (_textMeasureCache.has(key)) return _textMeasureCache.get(key);
  ctx.font = font;
  const m = ctx.measureText(text);
  if (_textMeasureCache.size > 500) _textMeasureCache.clear();
  _textMeasureCache.set(key, m);
  return m;
}

/**
 * Create a new element with default properties merged with provided overrides.
 * @param {string} type - Element type (rect, sticky, text, frame, etc.)
 * @param {Object} props - Properties to override defaults
 * @returns {Object} The new element object with a unique id
 */
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
    rotation: 0, // degrees
    locked: false,
    groupId: null, // group membership
    opacity: 1, // #R2-102: element opacity (0.0 to 1.0)
    dashStyle: null, // #R2-104: 'dashed', 'dotted', or null
    textAlign: 'left', // #R2-105: text alignment (left, center, right)
    verticalAlign: 'top', // #R2-106: vertical text alignment (top, middle, bottom)
    gradientFill: null, // #R2-103: gradient fill end color
    linkedElementId: null, // #R2-107: linked element id for navigation
    assignee: null, // #R2-138: assigned user
    dueDate: null, // #R2-139: due date string
    priority: null, // #R2-140: priority level (high, medium, low)
    stickyTemplate: null, // #R2-147: sticky template (idea, question, action, risk)
    category: null, // #R2-148: color-coded category
    versionHistory: [], // #R2-126: last 5 modifications
    ...props
  };
  return base;
}

// Default sticky colors
const STICKY_COLORS = ['#FFD966', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD', '#F4A460'];

// Envelope colors
const ENVELOPE_COLORS = ['#4a9eff', '#ff6b6b', '#4ecdc4', '#ffd966', '#96ceb4', '#ff9ff3', '#54a0ff', '#5f27cd'];

/**
 * Create a sticky note element at the given position.
 * @param {number} x - X position in world coordinates
 * @param {number} y - Y position in world coordinates
 * @returns {Object} A sticky note element with random color, 200x200 size, and empty tags
 */
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

function createTextElement(x, y) {
  return createElement('text', {
    x, y,
    width: 200,
    height: 40,
    fill: 'transparent',
    stroke: 'transparent',
    text: 'Texte',
    fontSize: 20
  });
}

/**
 * Create a frame (zone) element for grouping other elements visually.
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} [w=400] - Width
 * @param {number} [h=300] - Height
 * @param {string} [title='Zone'] - Frame title label
 * @returns {Object} A frame element
 */
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

function createEnvelope(x, y, w, h) {
  const color = ENVELOPE_COLORS[Math.floor(Math.random() * ENVELOPE_COLORS.length)];
  return createElement('envelope', {
    x, y,
    width: w || 300,
    height: h || 250,
    fill: color + '15', // very transparent
    stroke: color,
    strokeWidth: 2,
    text: 'Enveloppe',
    fontSize: 14,
    children: [], // array of element IDs
    zIndex: 2
  });
}

/**
 * Create a connector (arrow/line) between two elements.
 * @param {string} sourceId - ID of the source element
 * @param {string} targetId - ID of the target element
 * @param {string} [style='arrow'] - Connector style: 'arrow', 'double-arrow', 'line', 'dashed'
 * @returns {Object} A connector element linking sourceId to targetId
 */
function createConnector(sourceId, targetId, style) {
  return createElement('connector', {
    sourceId: sourceId,
    targetId: targetId,
    x: 0, y: 0, x2: 0, y2: 0,
    width: 0, height: 0,
    stroke: '#ffffff',
    strokeWidth: 2,
    fill: 'transparent',
    connectorStyle: style || 'arrow', // 'arrow', 'double-arrow', 'line', 'dashed'
    lineType: 'straight', // 'straight', 'curve', 'orthogonal'
    text: '', // label
    zIndex: Date.now() - 1000 // slightly below other elements
  });
}

// Get anchor points for an element (top, bottom, left, right centers)
function getAnchorPoints(el) {
  const bounds = getElementBounds(el);
  return [
    { x: bounds.x + bounds.w / 2, y: bounds.y, side: 'top' },
    { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h, side: 'bottom' },
    { x: bounds.x, y: bounds.y + bounds.h / 2, side: 'left' },
    { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2, side: 'right' },
  ];
}

// Find the closest pair of anchor points between two elements
function getBestAnchors(sourceEl, targetEl) {
  const srcAnchors = getAnchorPoints(sourceEl);
  const tgtAnchors = getAnchorPoints(targetEl);
  let best = null;
  let bestDist = Infinity;
  for (const sa of srcAnchors) {
    for (const ta of tgtAnchors) {
      const d = Math.hypot(sa.x - ta.x, sa.y - ta.y);
      if (d < bestDist) {
        bestDist = d;
        best = { src: sa, tgt: ta };
      }
    }
  }
  return best;
}

// Diamond shape factory
function createDiamond(x, y, w, h) {
  return createElement('diamond', {
    x, y, width: w || 100, height: h || 100,
    fill: 'transparent', stroke: '#ffffff', strokeWidth: 2
  });
}

// Triangle shape factory
function createTriangle(x, y, w, h) {
  return createElement('triangle', {
    x, y, width: w || 100, height: h || 100,
    fill: 'transparent', stroke: '#ffffff', strokeWidth: 2
  });
}

// Card factory (management visual card)
function createCard(x, y) {
  return createElement('card', {
    x, y,
    width: 260,
    height: 160,
    fill: '#1e1e1e',
    stroke: '#333',
    strokeWidth: 1,
    text: '',
    fontSize: 14,
    cardStatus: '', // 'todo', 'in-progress', 'review', 'done'
    cardTags: [],
    cardPriority: '', // 'high', 'medium', 'low'
    cardPoints: '',
    cardAssignee: '',
    cardDescription: '',
    cardDueDate: '',
    cardColor: ''
  });
}

// List factory
function createList(x, y) {
  return createElement('list', {
    x, y,
    width: 250,
    height: 60,
    fill: '#1e1e1e',
    stroke: '#333',
    strokeWidth: 1,
    text: 'Liste',
    fontSize: 14,
    listItems: [] // array of { id, text }
  });
}

/**
 * Create a mind map node element.
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} [text=''] - Node text
 * @param {string|null} [parentId=null] - ID of the parent node
 * @param {string} [color='#4a9eff'] - Node background color
 * @returns {Object} A mindmap node with parent/children references
 */
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

/**
 * Create an embed (iframe) element for embedding external URLs.
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} [url=''] - The URL to embed
 * @returns {Object} An embed element with embedUrl property
 */
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

function createImageElement(x, y, w, h, dataUrl) {
  return createElement('image', {
    x, y,
    width: w,
    height: h,
    fill: 'transparent',
    stroke: 'transparent',
    imageData: dataUrl
  });
}

// Image cache for rendering
const imageCache = new Map();
function getCachedImage(dataUrl) {
  if (imageCache.has(dataUrl)) return imageCache.get(dataUrl);
  const img = new Image();
  img.src = dataUrl;
  imageCache.set(dataUrl, img);
  return img;
}

// ========================
// Rich Text Rendering
// ========================

// Parse HTML string to array of text segments with formatting
function parseRichText(html) {
  if (!html || typeof html !== 'string') return [{ text: html || '', bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null, highlight: null, fontFamily: null }];

  // If no HTML tags, treat as plain text
  if (!/<[^>]+>/.test(html)) {
    return [{ text: html, bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null, highlight: null, fontFamily: null }];
  }

  const segments = [];
  // Use DOMParser (inert document) instead of a detached div to avoid
  // triggering image loading / onerror XSS vectors from untrusted richText.
  const parsedDoc = new DOMParser().parseFromString(html, 'text/html');
  const tempDiv = parsedDoc.body;

  function walkNode(node, styles) {
    if (node.nodeType === 3) { // Text node
      const text = node.textContent;
      if (text) {
        segments.push({ text, ...styles });
      }
      return;
    }
    if (node.nodeType !== 1) return;

    const tag = node.tagName.toLowerCase();
    const newStyles = { ...styles };

    if (tag === 'b' || tag === 'strong') newStyles.bold = true;
    if (tag === 'i' || tag === 'em') newStyles.italic = true;
    if (tag === 'u') newStyles.underline = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') newStyles.strikethrough = true;
    if (tag === 'br') { segments.push({ text: '\n', ...styles }); return; }

    // Handle list items
    if (tag === 'li') {
      // Check parent for ordered vs unordered
      const parent = node.parentElement;
      const isOrdered = parent && parent.tagName.toLowerCase() === 'ol';
      if (isOrdered) {
        const idx = Array.from(parent.children).indexOf(node) + 1;
        segments.push({ text: idx + '. ', ...styles });
      } else {
        segments.push({ text: '\u2022 ', ...styles });
      }
      for (const child of node.childNodes) {
        walkNode(child, newStyles);
      }
      segments.push({ text: '\n', ...styles });
      return;
    }

    // Handle <font> tags generated by execCommand
    if (tag === 'font') {
      const sizeAttr = node.getAttribute('size');
      if (sizeAttr) {
        // Map HTML font size 1-7 to pixel sizes
        const sizeMap = { '1': 10, '2': 13, '3': 16, '4': 18, '5': 24, '6': 32, '7': 48 };
        newStyles.fontSize = sizeMap[sizeAttr] || null;
      }
      const colorAttr = node.getAttribute('color');
      if (colorAttr) newStyles.color = colorAttr;
      const faceAttr = node.getAttribute('face');
      if (faceAttr) newStyles.fontFamily = faceAttr;
    }

    // Check inline styles
    const style = node.style;
    if (style) {
      if (style.color) newStyles.color = style.color;
      if (style.backgroundColor) newStyles.highlight = style.backgroundColor;
      if (style.fontSize) newStyles.fontSize = parseInt(style.fontSize) || null;
      if (style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700) newStyles.bold = true;
      if (style.fontStyle === 'italic') newStyles.italic = true;
      if (style.textDecoration && style.textDecoration.includes('underline')) newStyles.underline = true;
      if (style.textDecoration && style.textDecoration.includes('line-through')) newStyles.strikethrough = true;
      if (style.fontFamily) newStyles.fontFamily = style.fontFamily;
    }

    for (const child of node.childNodes) {
      walkNode(child, newStyles);
    }

    // Add newline after block elements
    if (['div', 'p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol'].includes(tag) && segments.length > 0) {
      const last = segments[segments.length - 1];
      if (last.text && !last.text.endsWith('\n')) {
        segments.push({ text: '\n', ...styles });
      }
    }
  }

  walkNode(tempDiv, { bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null, highlight: null, fontFamily: null });
  return segments.length > 0 ? segments : [{ text: '', bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null, highlight: null, fontFamily: null }];
}

// Render rich text segments on canvas with word wrapping
function renderRichText(ctx, segments, x, y, maxWidth, defaultFontSize, defaultColor, textAlign) {
  const lineHeight = defaultFontSize * 1.4;
  const defaultFontFamily = '-apple-system, BlinkMacSystemFont, sans-serif';
  let curX = x;
  let curY = y;
  const lines = []; // array of arrays of { segment, width }
  let currentLine = [];
  let currentLineWidth = 0;

  // First pass: compute lines for word wrapping
  for (const seg of segments) {
    if (!seg.text) continue;

    const fontSize = seg.fontSize || defaultFontSize;
    const fontFamily = seg.fontFamily || defaultFontFamily;
    let fontStr = '';
    if (seg.italic) fontStr += 'italic ';
    if (seg.bold) fontStr += 'bold ';
    fontStr += `${fontSize}px ${fontFamily}`;
    ctx.font = fontStr;

    const words = seg.text.split(/(\s+)/);
    for (const word of words) {
      if (word === '\n') {
        lines.push([...currentLine]);
        currentLine = [];
        currentLineWidth = 0;
        continue;
      }
      if (!word) continue;

      const wordWidth = ctx.measureText(word).width;
      if (currentLineWidth + wordWidth > maxWidth && currentLine.length > 0 && word.trim()) {
        lines.push([...currentLine]);
        currentLine = [];
        currentLineWidth = 0;
      }
      currentLine.push({ segment: { ...seg, fontSize }, text: word, width: wordWidth });
      currentLineWidth += wordWidth;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  // Second pass: render
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let lineW = line.reduce((s, item) => s + item.width, 0);
    let startX = x;
    if (textAlign === 'center') startX = x + (maxWidth - lineW) / 2;
    else if (textAlign === 'right') startX = x + maxWidth - lineW;

    curX = startX;
    const curLineY = y + li * lineHeight;

    for (const item of line) {
      const seg = item.segment;
      const fontSize = seg.fontSize || defaultFontSize;
      const segFontFamily = seg.fontFamily || defaultFontFamily;
      let fontStr = '';
      if (seg.italic) fontStr += 'italic ';
      if (seg.bold) fontStr += 'bold ';
      fontStr += `${fontSize}px ${segFontFamily}`;
      ctx.font = fontStr;

      // Highlight background
      if (seg.highlight) {
        ctx.save();
        ctx.fillStyle = seg.highlight;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(curX, curLineY, item.width, lineHeight);
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Text
      ctx.fillStyle = seg.color || defaultColor || '#e0e0e0';
      ctx.textBaseline = 'top';
      ctx.fillText(item.text, curX, curLineY);

      // Underline
      if (seg.underline) {
        ctx.beginPath();
        ctx.moveTo(curX, curLineY + fontSize + 2);
        ctx.lineTo(curX + item.width, curLineY + fontSize + 2);
        ctx.strokeStyle = seg.color || defaultColor || '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Strikethrough
      if (seg.strikethrough) {
        ctx.beginPath();
        ctx.moveTo(curX, curLineY + fontSize / 2);
        ctx.lineTo(curX + item.width, curLineY + fontSize / 2);
        ctx.strokeStyle = seg.color || defaultColor || '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      curX += item.width;
    }
  }

  return lines.length * lineHeight;
}

// Get plain text from rich text HTML
function richTextToPlain(html) {
  if (!html || !/<[^>]+>/.test(html)) return html || '';
  // Use DOMParser (inert document) to avoid side effects from HTML parsing.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

// Render an element to canvas
function renderElement(ctx, el, selected, camera) {
  ctx.save();

  // Apply rotation if set
  if (el.rotation && el.type !== 'line' && el.type !== 'arrow' && el.type !== 'connector' && el.type !== 'freehand') {
    const bounds = getElementBounds(el);
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(el.rotation * Math.PI / 180);
    ctx.translate(-cx, -cy);
  }

  // Element opacity support
  if (el.opacity !== undefined && el.opacity !== null && el.opacity < 1) {
    ctx.globalAlpha = Math.max(0, Math.min(1, el.opacity));
  }

  // Isolation mode: render ghosted elements (other users' contributions during
  // "mode isoloir") with a dimmed, blurred look so only the shape/activity is
  // visible, not the content.
  if (el._isolated) {
    ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.55;
    // Slight blur so the scrambled block characters appear "floutés"
    ctx.filter = 'blur(1.2px)';
  }

  // Shadow support (for shapes that don't have built-in shadows)
  if (el.shadowEnabled && el.type !== 'sticky' && el.type !== 'card' && el.type !== 'envelope') {
    ctx.shadowColor = el.shadowColor || 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = el.shadowBlur || 12;
    ctx.shadowOffsetX = el.shadowOffsetX || 0;
    ctx.shadowOffsetY = el.shadowOffsetY || 4;
  }

  // #R2-148: Category color bar at top of element
  if (el.category) {
    const catColors = { red: '#e94560', blue: '#4a9eff', green: '#4ecdc4', yellow: '#ffd966', purple: '#DDA0DD', orange: '#F4A460' };
    const catColor = catColors[el.category] || el.category;
    const bounds = getElementBounds(el);
    if (bounds) {
      ctx.save();
      ctx.fillStyle = catColor;
      ctx.fillRect(bounds.x, bounds.y - 4, bounds.w, 4);
      ctx.restore();
    }
  }

  // #R2-107: Linked element indicator
  if (el.linkedElementId) {
    const bounds = getElementBounds(el);
    if (bounds) {
      ctx.save();
      ctx.fillStyle = '#4a9eff';
      ctx.font = '12px sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('\u{1F517}', bounds.x + 4, bounds.y + 4);
      ctx.restore();
    }
  }

  // Lock indicator
  if (el.locked) {
    const bounds = getElementBounds(el);
    if (bounds) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '12px sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText('🔒', bounds.x + bounds.w - 2, bounds.y + 2);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  switch (el.type) {
    case 'rect':
      drawRect(ctx, el);
      break;
    case 'circle':
      drawCircle(ctx, el);
      break;
    case 'line':
      drawLine(ctx, el);
      break;
    case 'arrow':
      drawArrow(ctx, el);
      break;
    case 'sticky':
      drawSticky(ctx, el, camera);
      break;
    case 'text':
      drawText(ctx, el);
      break;
    case 'freehand':
      drawFreehand(ctx, el);
      break;
    case 'frame':
      drawFrame(ctx, el);
      break;
    case 'image':
      drawImage(ctx, el);
      break;
    case 'envelope':
      drawEnvelope(ctx, el);
      break;
    case 'connector':
      drawConnector(ctx, el);
      break;
    case 'diamond':
      drawDiamond(ctx, el);
      break;
    case 'triangle':
      drawTriangle(ctx, el);
      break;
    case 'card':
      drawCard(ctx, el);
      break;
    case 'list':
      drawList(ctx, el);
      break;
    case 'mindmap':
      drawMindmapNode(ctx, el);
      break;
    case 'embed':
      drawEmbed(ctx, el);
      break;
  }

  ctx.restore();
}

// Render vote badge on an element (called separately after main render)
function renderVoteBadge(ctx, el, count, hasVoted) {
  if (count <= 0 && !hasVoted) return;
  const bounds = getElementBounds(el);
  if (!bounds) return;

  const badgeX = bounds.x + bounds.w - 4;
  const badgeY = bounds.y - 4;
  const badgeR = 14;

  ctx.save();

  // Badge circle
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = hasVoted ? '#4a9eff' : '#e94560';
  ctx.fill();

  // Border
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Count text
  ctx.fillStyle = 'white';
  ctx.font = 'bold 12px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(String(count), badgeX, badgeY);
  ctx.textAlign = 'left';

  ctx.restore();
}

// Render reaction bar below an element
function renderReactionBar(ctx, el) {
  if (!el.reactions || el.reactions.length === 0) return;
  const bounds = getElementBounds(el);
  if (!bounds) return;

  // Aggregate reactions by emoji
  const counts = {};
  for (const r of el.reactions) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  }

  const entries = Object.entries(counts);
  if (entries.length === 0) return;

  ctx.save();

  const startX = bounds.x;
  const startY = bounds.y + bounds.h + 4;
  let xOff = 0;

  for (const [emoji, count] of entries) {
    const label = emoji + (count > 1 ? count : '');
    const w = ctx.measureText(label).width + 12;

    // Background pill
    ctx.fillStyle = 'rgba(74, 158, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(startX + xOff, startY, w, 20, 10);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#e0e0e0';
    ctx.font = '12px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, startX + xOff + 6, startY + 10);

    xOff += w + 4;
  }

  ctx.restore();
}

function drawRect(ctx, el) {
  // #188: null/NaN guard
  if (!el || !isFinite(el.width) || !isFinite(el.height) || !isFinite(el.x) || !isFinite(el.y)) return;
  const r = el.borderRadius !== undefined ? el.borderRadius : 4;
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  if (el.fill && el.fill !== 'transparent') {
    // #R2-103: Gradient fill support for rectangles
    if (el.gradientFill) {
      const grad = ctx.createLinearGradient(el.x, el.y, el.x, el.y + el.height);
      grad.addColorStop(0, el.fill);
      grad.addColorStop(1, el.gradientFill);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = el.fill;
    }
    ctx.fill();
  }
  // Clear shadow after fill so stroke isn't doubled
  if (el.shadowEnabled) { ctx.shadowColor = 'transparent'; }
  if (el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    // #R2-104: Dashed/dotted stroke style
    if (el.dashStyle === 'dotted') { ctx.setLineDash([2, 4]); }
    else if (el.dashStyle === 'dashed' || el.dashStyle === true) { ctx.setLineDash([8, 4]); }
    ctx.stroke();
    if (el.dashStyle) { ctx.setLineDash([]); }
  }
  // #R2-140: Priority level indicator
  if (el.priority) {
    const pColors = { high: '#e94560', medium: '#ffd966', low: '#4ecdc4' };
    const pColor = pColors[el.priority];
    if (pColor) {
      ctx.save();
      ctx.fillStyle = pColor;
      ctx.beginPath();
      ctx.arc(el.x + el.width - 8, el.y + 8, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  const textContent = el.richText || el.text;
  if (textContent) {
    const textColor = el.textColor || '#e0e0e0';
    if (el.richText) {
      const segments = parseRichText(el.richText);
      const fs = el.fontSize || 16;
      const textH = segments.length * fs * 1.4;
      renderRichText(ctx, segments, el.x + 8, el.y + (el.height - textH) / 2, el.width - 16, fs, textColor, el.textAlign || 'center');
    } else {
      ctx.fillStyle = textColor;
      const fontFamily = el.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
      ctx.font = `${el.fontSize || 16}px ${fontFamily}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = el.textAlign || 'center';
      const txX = el.textAlign === 'left' ? el.x + 8 : el.textAlign === 'right' ? el.x + el.width - 8 : el.x + el.width / 2;
      ctx.fillText(el.text, txX, el.y + el.height / 2, el.width - 16);
      ctx.textAlign = 'left';
    }
  }
}

function drawCircle(ctx, el) {
  // #188: null/NaN guard
  if (!el || !isFinite(el.width) || !isFinite(el.height) || !isFinite(el.x) || !isFinite(el.y)) return;
  const rx = el.width / 2;
  const ry = el.height / 2;
  ctx.beginPath();
  ctx.ellipse(el.x + rx, el.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
  if (el.fill && el.fill !== 'transparent') {
    // #R2-103: Gradient fill support for circles
    if (el.gradientFill) {
      const grad = ctx.createRadialGradient(el.x + rx, el.y + ry, 0, el.x + rx, el.y + ry, Math.max(Math.abs(rx), Math.abs(ry)));
      grad.addColorStop(0, el.fill);
      grad.addColorStop(1, el.gradientFill);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = el.fill;
    }
    ctx.fill();
  }
  if (el.shadowEnabled) { ctx.shadowColor = 'transparent'; }
  if (el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    // #R2-104: Dashed/dotted stroke style for circles
    if (el.dashStyle === 'dotted') { ctx.setLineDash([2, 4]); }
    else if (el.dashStyle === 'dashed' || el.dashStyle === true) { ctx.setLineDash([8, 4]); }
    ctx.stroke();
    if (el.dashStyle) { ctx.setLineDash([]); }
  }
  const textContent = el.richText || el.text;
  if (textContent) {
    const textColor = el.textColor || '#e0e0e0';
    if (el.richText) {
      const segments = parseRichText(el.richText);
      const fs = el.fontSize || 16;
      renderRichText(ctx, segments, el.x + 16, el.y + 16, el.width - 32, fs, textColor, el.textAlign || 'center');
    } else {
      ctx.fillStyle = textColor;
      const fontFamily = el.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
      ctx.font = `${el.fontSize || 16}px ${fontFamily}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = el.textAlign || 'center';
      ctx.fillText(el.text, el.x + el.width / 2, el.y + el.height / 2, el.width - 16);
      ctx.textAlign = 'left';
    }
  }
}

function drawLine(ctx, el) {
  // #188: null/NaN guard
  if (!el || !isFinite(el.x) || !isFinite(el.y) || !isFinite(el.x2) || !isFinite(el.y2)) return;
  ctx.beginPath();
  ctx.moveTo(el.x, el.y);
  ctx.lineTo(el.x2, el.y2);
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawArrow(ctx, el) {
  // #188: null/NaN guard
  if (!el || !isFinite(el.x) || !isFinite(el.y) || !isFinite(el.x2) || !isFinite(el.y2)) return;
  const headLen = 14;
  const dx = el.x2 - el.x;
  const dy = el.y2 - el.y;
  const angle = Math.atan2(dy, dx);

  ctx.beginPath();
  ctx.moveTo(el.x, el.y);
  ctx.lineTo(el.x2, el.y2);
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(el.x2, el.y2);
  ctx.lineTo(el.x2 - headLen * Math.cos(angle - Math.PI / 6), el.y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(el.x2, el.y2);
  ctx.lineTo(el.x2 - headLen * Math.cos(angle + Math.PI / 6), el.y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawSticky(ctx, el, camera) {
  // #188: null/NaN guard
  if (!el || !isFinite(el.width) || !isFinite(el.height) || !isFinite(el.x) || !isFinite(el.y)) return;
  const r = 6;

  // Layered shadows for realistic look
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;

  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  ctx.fillStyle = el.fill || '#FFD966';
  ctx.fill();

  // Second shadow layer (closer, sharper)
  ctx.shadowColor = 'rgba(0,0,0,0.1)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Corner fold with gradient — #178: cache gradient objects
  const foldSize = 24;
  ctx.beginPath();
  ctx.moveTo(el.x + el.width - foldSize, el.y);
  ctx.lineTo(el.x + el.width, el.y + foldSize);
  ctx.lineTo(el.x + el.width - foldSize, el.y + foldSize);
  ctx.closePath();
  const foldKey = `fold:${el.x}:${el.y}:${el.width}`;
  const foldGrad = _getCachedGradient(ctx, foldKey, (c) => {
    const g = c.createLinearGradient(
      el.x + el.width - foldSize, el.y,
      el.x + el.width, el.y + foldSize
    );
    g.addColorStop(0, 'rgba(0,0,0,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
    return g;
  });
  ctx.fillStyle = foldGrad;
  ctx.fill();

  // #107 - Subtle gradient overlay for depth on stickies
  const stickyGrad = ctx.createLinearGradient(el.x, el.y, el.x, el.y + el.height);
  stickyGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
  stickyGrad.addColorStop(1, 'rgba(0,0,0,0.04)');
  ctx.fillStyle = stickyGrad;
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  ctx.fill();

  // #R2-140: Priority level indicator on stickies
  if (el.priority) {
    const pColors = { high: '#e94560', medium: '#ffd966', low: '#4ecdc4' };
    const pLabels = { high: '!', medium: '-', low: '~' };
    const pColor = pColors[el.priority];
    if (pColor) {
      ctx.save();
      ctx.fillStyle = pColor;
      ctx.beginPath();
      ctx.arc(el.x + 14, el.y + 14, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(pLabels[el.priority], el.x + 14, el.y + 14);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  // #R2-147: Sticky template indicator (idea, question, action, risk)
  if (el.stickyTemplate) {
    const tplIcons = { idea: '\u{1F4A1}', question: '\u{2753}', action: '\u{2705}', risk: '\u{26A0}' };
    const icon = tplIcons[el.stickyTemplate];
    if (icon) {
      ctx.save();
      ctx.font = '14px sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText(icon, el.x + el.width - 30, el.y + 6);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  // #103 - Zoom-dependent detail: hide text below zoom 0.3
  const _cameraZoom = camera ? camera.zoom : 1;
  const textContent = (_cameraZoom >= 0.3) ? (el.richText || el.text) : null;
  if (textContent) {
    const maxW = el.width - 28;
    const maxH = el.height - 28;
    // #R2-106: Compute vertical offset based on verticalAlign
    let vAlignOffset = 0;
    if (el.richText) {
      const segments = parseRichText(el.richText);
      // Auto-size: reduce font if text overflows
      let fs = el.fontSize || 16;
      const minFs = 10;
      while (fs > minFs) {
        const testLineH = fs * 1.4;
        let totalW = 0;
        for (const seg of segments) {
          if (seg.text) {
            ctx.font = `${seg.bold ? 'bold ' : ''}${seg.italic ? 'italic ' : ''}${fs}px -apple-system, BlinkMacSystemFont, sans-serif`;
            totalW += ctx.measureText(seg.text).width;
          }
        }
        const estLines = Math.ceil(totalW / maxW) + segments.filter(s => s.text === '\n').length;
        if (estLines * testLineH <= maxH) break;
        fs -= 1;
      }
      // #R2-106: Vertical alignment for stickies
      const estTextH = Math.ceil(fs * 1.4 * Math.max(1, Math.ceil(segments.reduce((w, s) => w + (s.text ? s.text.length : 0), 0) * fs * 0.6 / maxW)));
      if (el.verticalAlign === 'middle') { vAlignOffset = Math.max(0, (maxH - estTextH) / 2); }
      else if (el.verticalAlign === 'bottom') { vAlignOffset = Math.max(0, maxH - estTextH); }
      const stickyTextColor = el.textColor || '#1a1a1a';
      renderRichText(ctx, segments, el.x + 14, el.y + 14 + vAlignOffset, maxW, fs, stickyTextColor, el.textAlign || 'left');
    } else {
      // Auto-size for plain text
      let fs = el.fontSize || 16;
      const minFs = 10;
      const fontFamily = el.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
      while (fs > minFs) {
        ctx.font = `${fs}px ${fontFamily}`;
        const lines = estimateWrapLines(ctx, el.text, maxW);
        if (lines * fs * 1.4 <= maxH) break;
        fs -= 1;
      }
      // #R2-106: Vertical alignment for plain text stickies
      const lineCount = estimateWrapLines(ctx, el.text, maxW);
      const textH = lineCount * fs * 1.4;
      if (el.verticalAlign === 'middle') { vAlignOffset = Math.max(0, (maxH - textH) / 2); }
      else if (el.verticalAlign === 'bottom') { vAlignOffset = Math.max(0, maxH - textH); }
      ctx.fillStyle = el.textColor || '#1a1a1a';
      ctx.font = `${fs}px ${fontFamily}`;
      ctx.textBaseline = 'top';
      wrapText(ctx, el.text, el.x + 14, el.y + 14 + vAlignOffset, maxW, fs * 1.4);
    }
  }

  // #R2-138: Assignee display at bottom-left of sticky
  if (el.assignee && _cameraZoom >= 0.5) {
    ctx.save();
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText('\u{1F464} ' + el.assignee, el.x + 10, el.y + el.height - 8);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // #R2-139: Due date display
  if (el.dueDate && _cameraZoom >= 0.5) {
    ctx.save();
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    ctx.fillText('\u{1F4C5} ' + el.dueDate, el.x + el.width - 10, el.y + el.height - 8);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // Draw tags at the bottom (#103 - hide below zoom 0.5)
  if (el.tags && el.tags.length > 0 && _cameraZoom >= 0.5) {
    const tagH = 18;
    const tagPad = 6;
    const tagGap = 4;
    const tagFs = 10;
    const tagY = el.y + el.height - tagH - 8;
    let tagX = el.x + 10;
    const maxTagX = el.x + el.width - 10;

    ctx.font = `600 ${tagFs}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = 'middle';

    for (const tag of el.tags) {
      const tw = ctx.measureText(tag.label).width + tagPad * 2;
      if (tagX + tw > maxTagX) break; // No overflow

      // Tag pill background
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tw, tagH, tagH / 2);
      ctx.fillStyle = tag.color || 'rgba(0,0,0,0.15)';
      ctx.fill();

      // Tag text
      ctx.fillStyle = isLightColor(tag.color || '#888') ? '#1a1a1a' : '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(tag.label, tagX + tagPad, tagY + tagH / 2);

      tagX += tw + tagGap;
    }
  }
}

// Check if a color is light (for tag text contrast)
function isLightColor(hex) {
  if (!hex || hex === 'transparent') return true;
  const c = hex.replace('#', '');
  if (c.length < 6) return true;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

// Estimate number of wrapped lines for plain text
function estimateWrapLines(ctx, text, maxWidth) {
  let count = 0;
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    const words = para.split(' ');
    let currentLine = '';
    for (const word of words) {
      const test = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && currentLine) {
        count++;
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    count++;
  }
  return count;
}

function drawText(ctx, el) {
  const textContent = el.richText || el.text;
  if (!textContent) return;
  const textColor = el.textColor || '#e0e0e0';
  const fontFamily = el.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
  if (el.richText) {
    const segments = parseRichText(el.richText);
    renderRichText(ctx, segments, el.x, el.y, el.width || 400, el.fontSize || 20, textColor, el.textAlign || 'left');
  } else {
    ctx.fillStyle = el.textColor || (el.fill && el.fill !== 'transparent' ? el.fill : '#e0e0e0');
    ctx.font = `${el.fontSize || 20}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    wrapText(ctx, el.text, el.x, el.y, el.width || 400, (el.fontSize || 20) * 1.4);
  }
}

function drawFreehand(ctx, el) {
  // #188: null/NaN guard
  if (!el || !isFinite(el.x) || !isFinite(el.y)) return;
  if (!el.points || el.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(el.points[0].x, el.points[0].y);

  for (let i = 1; i < el.points.length - 1; i++) {
    const xc = (el.points[i].x + el.points[i + 1].x) / 2;
    const yc = (el.points[i].y + el.points[i + 1].y) / 2;
    ctx.quadraticCurveTo(el.points[i].x, el.points[i].y, xc, yc);
  }
  const last = el.points[el.points.length - 1];
  ctx.lineTo(last.x, last.y);

  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawFrame(ctx, el) {
  // #188: null/NaN guard
  if (!el || !isFinite(el.width) || !isFinite(el.height) || !isFinite(el.x) || !isFinite(el.y)) return;
  const r = 8;
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }

  ctx.strokeStyle = el.stroke || '#4a9eff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.setLineDash([8, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  if (el.text) {
    const fontSize = el.fontSize || 16;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const textWidth = ctx.measureText(el.text).width;
    const labelPad = 8;
    const labelH = fontSize + labelPad * 2;

    ctx.fillStyle = el.stroke || '#4a9eff';
    ctx.beginPath();
    ctx.roundRect(el.x, el.y - labelH, textWidth + labelPad * 2, labelH, [r, r, 0, 0]);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.textBaseline = 'top';
    ctx.fillText(el.text, el.x + labelPad, el.y - labelH + labelPad);

    // Children count badge (next to title)
    if (el._childrenCount !== undefined && el._childrenCount > 0) {
      const badgeText = String(el._childrenCount);
      ctx.font = 'bold 10px sans-serif';
      const btw = ctx.measureText(badgeText).width;
      const bx = el.x + textWidth + labelPad * 2 + 8;
      const by = el.y - labelH + 4;
      const bw = Math.max(btw + 8, 18);
      const bh = 16;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 8);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, bx + bw / 2, by + bh / 2);
      ctx.textAlign = 'left';
    }
  }
}

function drawEnvelope(ctx, el) {
  if (!el || !isFinite(el.width) || !isFinite(el.height) || !isFinite(el.x) || !isFinite(el.y)) return;
  const r = 12;
  const headerH = 36;
  const color = el.stroke || '#4a9eff';
  const childCount = (el.children && el.children.length) || 0;
  const collapsed = el.collapsed || false;
  const drawH = collapsed ? headerH : el.height;

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;

  // Body
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, drawH, r);
  ctx.fillStyle = collapsed ? (color + '30') : (el.fill || (color + '15'));
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Border
  ctx.strokeStyle = color;
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.stroke();

  // Header bar
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, headerH, [r, r, 0, 0]);
  ctx.fillStyle = color;
  ctx.fill();

  // Envelope icon in header
  ctx.save();
  ctx.translate(el.x + 14, el.y + headerH / 2);
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-6, -5, 12, 10, 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, -5);
  ctx.lineTo(0, 1);
  ctx.lineTo(6, -5);
  ctx.stroke();
  ctx.restore();

  // Title text
  const fontSize = el.fontSize || 14;
  ctx.fillStyle = 'white';
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(el.text || 'Enveloppe', el.x + 30, el.y + headerH / 2, el.width - 70);

  // Collapse/expand indicator
  const chevX = el.x + el.width - 54;
  const chevY = el.y + headerH / 2;
  ctx.fillStyle = 'white';
  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(collapsed ? '▶' : '▼', chevX, chevY);

  // Count badge (always visible)
  const badgeX = el.x + el.width - 30;
  const badgeY = el.y + headerH / 2;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  ctx.fillStyle = color;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(childCount), badgeX, badgeY);
  ctx.textAlign = 'left';

  // Flap pattern (only when expanded)
  if (!collapsed) {
    ctx.beginPath();
    ctx.moveTo(el.x, el.y + el.height);
    ctx.lineTo(el.x + el.width / 2, el.y + el.height - 20);
    ctx.lineTo(el.x + el.width, el.y + el.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Subtle expand/collapse arrow hint at bottom-right of header
  ctx.save();
  const arrowX = el.x + el.width - 70;
  const arrowY = el.y + headerH / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  if (collapsed) {
    // Down arrow hint (expand)
    ctx.beginPath();
    ctx.moveTo(arrowX - 4, arrowY - 3);
    ctx.lineTo(arrowX, arrowY + 2);
    ctx.lineTo(arrowX + 4, arrowY - 3);
    ctx.stroke();
  } else {
    // Up arrow hint (collapse)
    ctx.beginPath();
    ctx.moveTo(arrowX - 4, arrowY + 2);
    ctx.lineTo(arrowX, arrowY - 3);
    ctx.lineTo(arrowX + 4, arrowY + 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawConnector(ctx, el) {
  // #188: null/NaN guard
  if (!el || !isFinite(el.x) || !isFinite(el.y) || !isFinite(el.x2) || !isFinite(el.y2)) return;
  if (el.x == null || el.y == null || el.x2 == null || el.y2 == null) return;
  const style = el.connectorStyle || 'arrow';

  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';

  if (style === 'dashed') {
    ctx.setLineDash([8, 4]);
  }

  if (el.lineType === 'curve') {
    // Quadratic bezier curve with perpendicular offset for a smooth arc
    const mx = (el.x + el.x2) / 2;
    const my = (el.y + el.y2) / 2;
    const dx = el.x2 - el.x;
    const dy = el.y2 - el.y;
    const dist = Math.hypot(dx, dy);
    // Control point offset perpendicular to the line
    const offset = dist * 0.3;
    const nx = -dy / (dist || 1);
    const ny = dx / (dist || 1);
    const cpx = mx + nx * offset;
    const cpy = my + ny * offset;
    ctx.beginPath();
    ctx.moveTo(el.x, el.y);
    ctx.quadraticCurveTo(cpx, cpy, el.x2, el.y2);
    ctx.stroke();
    // Store control point for label positioning
    el._cpx = cpx;
    el._cpy = cpy;
  } else if (el.lineType === 'orthogonal') {
    // Right angle path
    const mx = (el.x + el.x2) / 2;
    ctx.beginPath();
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(mx, el.y);
    ctx.lineTo(mx, el.y2);
    ctx.lineTo(el.x2, el.y2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x2, el.y2);
    ctx.stroke();
  }

  ctx.setLineDash([]);

  // Arrow heads
  const headLen = 12;
  if (style === 'arrow' || style === 'double-arrow') {
    const dx = el.x2 - el.x;
    const dy = el.y2 - el.y;
    const angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(el.x2, el.y2);
    ctx.lineTo(el.x2 - headLen * Math.cos(angle - Math.PI / 6), el.y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(el.x2, el.y2);
    ctx.lineTo(el.x2 - headLen * Math.cos(angle + Math.PI / 6), el.y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }
  if (style === 'double-arrow') {
    const dx = el.x - el.x2;
    const dy = el.y - el.y2;
    const angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x - headLen * Math.cos(angle - Math.PI / 6), el.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x - headLen * Math.cos(angle + Math.PI / 6), el.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  // Label at midpoint (#111 - auto-rotate to follow line angle)
  if (el.text) {
    let mx, my;
    if (el.lineType === 'curve' && el._cpx !== undefined) {
      mx = (el.x + 2 * el._cpx + el.x2) / 4;
      my = (el.y + 2 * el._cpy + el.y2) / 4;
    } else {
      mx = (el.x + el.x2) / 2;
      my = (el.y + el.y2) / 2;
    }
    const fontSize = el.fontSize || 12;
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const tw = ctx.measureText(el.text).width;
    const padX = 6;
    const padY = 4;
    // #111 - Calculate line angle for label rotation
    let angle = Math.atan2(el.y2 - el.y, el.x2 - el.x);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(30,30,30,0.85)';
    ctx.beginPath();
    ctx.roundRect(-tw / 2 - padX, -fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2, 4);
    ctx.fill();
    ctx.fillStyle = '#e0e0e0';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(el.text, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

function drawDiamond(ctx, el) {
  if (!el || !isFinite(el.width) || !isFinite(el.height) || !isFinite(el.x) || !isFinite(el.y)) return;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.beginPath();
  ctx.moveTo(cx, el.y);
  ctx.lineTo(el.x + el.width, cy);
  ctx.lineTo(cx, el.y + el.height);
  ctx.lineTo(el.x, cy);
  ctx.closePath();
  if (el.fill && el.fill !== 'transparent') {
    if (el.gradientFill) {
      // Gradient fill from top to bottom
      const grad = ctx.createLinearGradient(cx, el.y, cx, el.y + el.height);
      grad.addColorStop(0, el.fill);
      grad.addColorStop(1, el.gradientFill);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = el.fill;
    }
    ctx.fill();
  }
  if (el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    if (el.dashStyle) ctx.setLineDash([8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (el.richText) {
    const padding = 10;
    const fontSize = el.fontSize || 16;
    const segments = parseRichText(el.richText);
    // Estimate text height from segments line count
    const lineHeight = fontSize * 1.4;
    const lineCount = Math.max(1, segments.filter(s => s.text === '\n').length + 1);
    const textH = lineCount * lineHeight;
    const startY = cy - textH / 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, el.y);
    ctx.lineTo(el.x + el.width, cy);
    ctx.lineTo(cx, el.y + el.height);
    ctx.lineTo(el.x, cy);
    ctx.clip();
    renderRichText(ctx, segments, el.x + padding, startY, el.width - padding * 2, fontSize, el.textColor || '#e0e0e0', 'center');
    ctx.restore();
  } else if (el.text) {
    ctx.fillStyle = el.textColor || '#e0e0e0';
    const fontFamily = el.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
    ctx.font = `${el.fontSize || 16}px ${fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(el.text, cx, cy, el.width - 20);
    ctx.textAlign = 'left';
  }
}

function drawTriangle(ctx, el) {
  if (!el || !isFinite(el.width) || !isFinite(el.height) || !isFinite(el.x) || !isFinite(el.y)) return;
  const cx = el.x + el.width / 2;
  ctx.beginPath();
  ctx.moveTo(cx, el.y);
  ctx.lineTo(el.x + el.width, el.y + el.height);
  ctx.lineTo(el.x, el.y + el.height);
  ctx.closePath();
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  if (el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    if (el.dashStyle) ctx.setLineDash([8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (el.richText) {
    const padding = 10;
    const fontSize = el.fontSize || 16;
    const segments = parseRichText(el.richText);
    const textY = el.y + el.height * 0.4;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, el.y);
    ctx.lineTo(el.x + el.width, el.y + el.height);
    ctx.lineTo(el.x, el.y + el.height);
    ctx.clip();
    renderRichText(ctx, segments, el.x + padding, textY, el.width - padding * 2, fontSize, el.textColor || '#e0e0e0', 'center');
    ctx.restore();
  } else if (el.text) {
    ctx.fillStyle = el.textColor || '#e0e0e0';
    const fontFamily = el.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
    ctx.font = `${el.fontSize || 16}px ${fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(el.text, cx, el.y + el.height * 0.6, el.width - 20);
    ctx.textAlign = 'left';
  }
}

const CARD_STATUS_COLORS = {
  'todo': '#888', 'in-progress': '#4a9eff', 'review': '#ffd966', 'done': '#4ecdc4'
};
const CARD_STATUS_LABELS = {
  'todo': 'À faire', 'in-progress': 'En cours', 'review': 'En review', 'done': 'Terminé'
};
const CARD_PRIORITY_COLORS = { 'high': '#e94560', 'medium': '#ffd966', 'low': '#4ecdc4' };

function drawCard(ctx, el) {
  // #188: null/NaN guard
  if (!el || !isFinite(el.width) || !isFinite(el.height) || !isFinite(el.x) || !isFinite(el.y)) return;
  const r = 8;
  const w = el.width;
  const h = el.height;

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  // Background
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, w, h, r);
  ctx.fillStyle = el.cardColor || el.fill || '#1e1e1e';
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Border
  ctx.strokeStyle = el.stroke || '#333';
  ctx.lineWidth = el.strokeWidth || 1;
  ctx.stroke();

  // Status color bar (left edge)
  if (el.cardStatus && CARD_STATUS_COLORS[el.cardStatus]) {
    ctx.fillStyle = CARD_STATUS_COLORS[el.cardStatus];
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, 5, h, [r, 0, 0, r]);
    ctx.fill();
  } else if (el.cardPriority && CARD_PRIORITY_COLORS[el.cardPriority]) {
    // Fallback to priority strip if no status
    ctx.fillStyle = CARD_PRIORITY_COLORS[el.cardPriority];
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, 5, h, [r, 0, 0, r]);
    ctx.fill();
  }

  let yOff = el.y + 14;
  const xPad = el.x + 16;

  // Status badge
  if (el.cardStatus && CARD_STATUS_LABELS[el.cardStatus]) {
    const label = CARD_STATUS_LABELS[el.cardStatus];
    const color = CARD_STATUS_COLORS[el.cardStatus];
    ctx.font = 'bold 10px sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = color + '30';
    ctx.beginPath();
    ctx.roundRect(xPad, yOff - 2, tw + 12, 18, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.fillText(label, xPad + 6, yOff + 1);
    // Priority dot next to status badge
    if (el.cardPriority && CARD_PRIORITY_COLORS[el.cardPriority]) {
      ctx.fillStyle = CARD_PRIORITY_COLORS[el.cardPriority];
      ctx.beginPath();
      ctx.arc(xPad + tw + 20, yOff + 7, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    yOff += 24;
  } else {
    // Priority dot standalone when no status
    if (el.cardPriority && CARD_PRIORITY_COLORS[el.cardPriority]) {
      ctx.fillStyle = CARD_PRIORITY_COLORS[el.cardPriority];
      ctx.beginPath();
      ctx.arc(xPad + 4, yOff + 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    yOff += 4;
  }

  // Title
  ctx.fillStyle = '#e0e0e0';
  ctx.font = `bold ${el.fontSize || 14}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textBaseline = 'top';
  const title = el.text || 'Sans titre';
  wrapText(ctx, title, xPad, yOff, w - 32, (el.fontSize || 14) * 1.3);
  const titleLines = Math.max(1, Math.ceil(ctx.measureText(title).width / (w - 32)));
  yOff += titleLines * (el.fontSize || 14) * 1.3 + 8;

  // Tags
  if (el.cardTags && el.cardTags.length > 0) {
    let tx = xPad;
    ctx.font = '10px sans-serif';
    for (const tag of el.cardTags.slice(0, 3)) {
      const tw = ctx.measureText(tag).width;
      ctx.fillStyle = '#4a9eff20';
      ctx.beginPath();
      ctx.roundRect(tx, yOff, tw + 10, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#4a9eff';
      ctx.textBaseline = 'top';
      ctx.fillText(tag, tx + 5, yOff + 2);
      tx += tw + 16;
    }
    yOff += 22;
  }

  // Bottom row: points + assignee + due date
  const bY = el.y + h - 24;
  ctx.font = '11px sans-serif';
  ctx.textBaseline = 'top';

  if (el.cardPoints) {
    ctx.fillStyle = '#888';
    ctx.fillText('⚡ ' + el.cardPoints + ' pts', xPad, bY);
  }

  if (el.cardDueDate) {
    // #114 - Due date coloring: red if overdue, orange if today, green if future
    let dueDateColor = '#888';
    try {
      const due = new Date(el.cardDueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      const diff = due.getTime() - today.getTime();
      if (diff < 0) dueDateColor = '#e94560'; // overdue - red
      else if (diff === 0) dueDateColor = '#ffa500'; // today - orange
      else dueDateColor = '#4ecdc4'; // future - green
    } catch(e) {}
    ctx.fillStyle = dueDateColor;
    const dueText = el.cardDueDate;
    ctx.textAlign = 'right';
    ctx.fillText('\u{1F4C5} ' + dueText, el.x + w - 12, bY);
    ctx.textAlign = 'left';
  }

  if (el.cardAssignee) {
    const initials = el.cardAssignee.split(' ').filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const aX = el.x + w - 34;
    const aY = el.y + 10;
    ctx.beginPath();
    ctx.arc(aX, aY + 10, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#4a9eff';
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, aX, aY + 10);
    ctx.textAlign = 'left';
  }

  // Description indicator
  if (el.cardDescription) {
    ctx.fillStyle = '#666';
    ctx.font = '11px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('📝', el.x + w - 55, bY);
  }

  // Checklist progress bar
  if (el.cardChecklist && el.cardChecklist.length > 0) {
    const done = el.cardChecklist.filter(c => c.checked).length;
    const total = el.cardChecklist.length;
    const barW = w - 32;
    const barH = 4;
    const barY2 = bY - 12;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.roundRect(xPad, barY2, barW, barH, 2);
    ctx.fill();
    if (done > 0) {
      ctx.fillStyle = done === total ? '#4ecdc4' : '#4a9eff';
      ctx.beginPath();
      ctx.roundRect(xPad, barY2, barW * (done / total), barH, 2);
      ctx.fill();
    }
    ctx.fillStyle = '#888';
    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(done + '/' + total, xPad + barW + 4, barY2 - 2);
  }
}

function drawList(ctx, el) {
  // #188: null/NaN guard
  if (!el || !isFinite(el.width) || !isFinite(el.height) || !isFinite(el.x) || !isFinite(el.y)) return;
  const r = 8;
  const headerH = 36;
  const itemH = 30;
  const items = el.listItems || [];
  const totalH = headerH + items.length * itemH + 36;

  // Update logical height
  el.height = Math.max(60, totalH);

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  // Background
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  ctx.fillStyle = el.fill || '#1e1e1e';
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Border
  ctx.strokeStyle = el.stroke || '#333';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Header
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, headerH, [r, r, 0, 0]);
  ctx.fill();

  // Title
  ctx.fillStyle = '#e0e0e0';
  ctx.font = `bold ${el.fontSize || 14}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(el.text || 'Liste', el.x + 12, el.y + headerH / 2, el.width - 60);

  // #115 - List item count badge
  if (items.length > 0) {
    const badgeText = String(items.length);
    ctx.font = 'bold 10px sans-serif';
    const btw = ctx.measureText(badgeText).width;
    const badgeW = Math.max(btw + 8, 18);
    const badgeX = el.x + el.width - 12 - badgeW;
    const badgeY = el.y + headerH / 2 - 8;
    ctx.fillStyle = 'rgba(74,158,255,0.2)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#4a9eff';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, badgeX + badgeW / 2, el.y + headerH / 2);
    ctx.textAlign = 'left';
  }

  // Checklist progress (if checkbox mode)
  if (el.checkboxMode && items.length > 0) {
    const done = items.filter(it => it.checked).length;
    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText(done + '/' + items.length, el.x + el.width - 12, el.y + headerH / 2);
    ctx.textAlign = 'left';
  }

  // Items
  for (let i = 0; i < items.length; i++) {
    const iy = el.y + headerH + i * itemH;
    // Separator
    if (i > 0) {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(el.x + 12, iy);
      ctx.lineTo(el.x + el.width - 12, iy);
      ctx.stroke();
    }

    if (el.checkboxMode) {
      // Checkbox
      const cbX = el.x + 14;
      const cbY = iy + itemH / 2 - 6;
      ctx.strokeStyle = items[i].checked ? '#4ecdc4' : '#666';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cbX, cbY, 12, 12, 2);
      ctx.stroke();
      if (items[i].checked) {
        ctx.fillStyle = '#4ecdc4';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cbX + 3, cbY + 6);
        ctx.lineTo(cbX + 5, cbY + 9);
        ctx.lineTo(cbX + 9, cbY + 3);
        ctx.stroke();
      }
      // Text (strikethrough if checked)
      ctx.fillStyle = items[i].checked ? '#666' : '#ccc';
      ctx.font = items[i].checked ? 'italic 13px sans-serif' : '13px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(items[i].text || '', el.x + 34, iy + itemH / 2, el.width - 50);
      if (items[i].checked) {
        // Strikethrough line
        const tw = ctx.measureText(items[i].text || '').width;
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(el.x + 34, iy + itemH / 2);
        ctx.lineTo(el.x + 34 + Math.min(tw, el.width - 50), iy + itemH / 2);
        ctx.stroke();
      }
    } else {
      // Bullet
      ctx.fillStyle = '#4a9eff';
      ctx.beginPath();
      ctx.arc(el.x + 20, iy + itemH / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      // Text
      ctx.fillStyle = '#ccc';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(items[i].text || '', el.x + 32, iy + itemH / 2, el.width - 48);
    }
  }

  // Add button
  const addY = el.y + headerH + items.length * itemH + 4;
  ctx.fillStyle = '#555';
  ctx.font = '13px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('+ Ajouter...', el.x + 12, addY + 4);
}

function drawImage(ctx, el) {
  if (!el.imageData) return;
  const img = getCachedImage(el.imageData);
  if (img.complete && img.naturalWidth > 0) {
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.drawImage(img, el.x, el.y, el.width, el.height);
    ctx.shadowColor = 'transparent';
  } else {
    // Placeholder while image is loading
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, el.width, el.height, 4);
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Image icon in center
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const iconS = Math.min(32, el.width * 0.3, el.height * 0.3);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    // Outer frame
    ctx.beginPath();
    ctx.roundRect(cx - iconS, cy - iconS * 0.8, iconS * 2, iconS * 1.6, 2);
    ctx.stroke();
    // Mountain shape
    ctx.beginPath();
    ctx.moveTo(cx - iconS * 0.7, cy + iconS * 0.4);
    ctx.lineTo(cx - iconS * 0.2, cy - iconS * 0.1);
    ctx.lineTo(cx + iconS * 0.2, cy + iconS * 0.2);
    ctx.lineTo(cx + iconS * 0.5, cy - iconS * 0.2);
    ctx.lineTo(cx + iconS * 0.7, cy + iconS * 0.4);
    ctx.stroke();
    // Sun circle
    ctx.beginPath();
    ctx.arc(cx + iconS * 0.4, cy - iconS * 0.35, iconS * 0.15, 0, Math.PI * 2);
    ctx.stroke();

    // Loading text
    ctx.fillStyle = '#666';
    ctx.font = '11px sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText('Loading...', cx, cy + iconS * 0.8 + 6);
    ctx.textAlign = 'left';
  }
}

function drawMindmapNode(ctx, el) {
  const r = el.borderRadius !== undefined ? el.borderRadius : 25;
  const color = el.fill || '#4a9eff';

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  // Body
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Text
  const textColor = el.textColor || (isLightColor(color) ? '#1a1a1a' : '#ffffff');
  const fontFamily = el.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
  const fontSize = el.fontSize || 14;
  ctx.fillStyle = textColor;
  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(el.text || '', el.x + el.width / 2, el.y + el.height / 2, el.width - 20);
  ctx.textAlign = 'left';

  // Collapse indicator if has children
  if (el.mindmapChildren && el.mindmapChildren.length > 0) {
    const ix = el.x + el.width - 14;
    const iy = el.y + el.height / 2;
    ctx.beginPath();
    ctx.arc(ix, iy, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.mindmapCollapsed ? '+' : String(el.mindmapChildren.length), ix, iy);
    ctx.textAlign = 'left';
  }
}

function drawEmbed(ctx, el) {
  const r = 8;

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  // Background
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  ctx.fillStyle = el.fill || '#1e1e1e';
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Border
  ctx.strokeStyle = el.stroke || '#333';
  ctx.lineWidth = el.strokeWidth || 1;
  ctx.stroke();

  // Header bar
  const headerH = 32;
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, headerH, [r, r, 0, 0]);
  ctx.fill();

  // URL text in header
  ctx.fillStyle = '#888';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textBaseline = 'middle';
  const urlText = el.embedUrl || 'No URL';
  ctx.fillText(urlText.length > 50 ? urlText.substring(0, 50) + '...' : urlText, el.x + 12, el.y + headerH / 2, el.width - 24);

  // Play/embed icon in center
  const cx = el.x + el.width / 2;
  const cy = el.y + headerH + (el.height - headerH) / 2;
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.stroke();
  // Play triangle
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 12);
  ctx.lineTo(cx + 14, cy);
  ctx.lineTo(cx - 8, cy + 12);
  ctx.closePath();
  ctx.fill();

  // Type indicator
  ctx.fillStyle = '#666';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const host = el.embedUrl ? (() => { try { return new URL(el.embedUrl).hostname; } catch(e) { return ''; } })() : '';
  ctx.fillText(host || 'Embed', cx, cy + 36);
  ctx.textAlign = 'left';
}

// #108 - wrapText with optional maxHeight, returns true if text was truncated
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxHeight) {
  const lines = text.split('\n');
  let offsetY = 0;
  for (const line of lines) {
    const words = line.split(' ');
    let currentLine = '';
    for (const word of words) {
      // Break very long words that exceed maxWidth on their own
      let remaining = word;
      while (remaining) {
        if (ctx.measureText(remaining).width <= maxWidth || remaining.length <= 1) {
          const test = currentLine ? currentLine + ' ' + remaining : remaining;
          const metrics = ctx.measureText(test);
          if (metrics.width > maxWidth && currentLine) {
            ctx.fillText(currentLine, x, y + offsetY);
            currentLine = remaining;
            offsetY += lineHeight;
          } else {
            currentLine = test;
          }
          remaining = '';
        } else {
          // Find how many characters fit
          let fit = remaining.length;
          for (let c = 1; c <= remaining.length; c++) {
            const sub = remaining.substring(0, c);
            const testStr = currentLine ? currentLine + ' ' + sub : sub;
            if (ctx.measureText(testStr).width > maxWidth) {
              fit = Math.max(1, c - 1);
              break;
            }
          }
          if (fit === remaining.length) {
            // Whole thing fits with current line
            const test = currentLine ? currentLine + ' ' + remaining : remaining;
            currentLine = test;
            remaining = '';
          } else {
            // Split the word
            const part = remaining.substring(0, fit);
            if (currentLine) {
              ctx.fillText(currentLine, x, y + offsetY);
              offsetY += lineHeight;
              currentLine = '';
            }
            if (ctx.measureText(part).width <= maxWidth && part.length > 0) {
              ctx.fillText(part, x, y + offsetY);
              offsetY += lineHeight;
            }
            remaining = remaining.substring(fit);
          }
        }
      }
    }
    // #108 - Check if we exceeded maxHeight
    if (maxHeight && offsetY + lineHeight > maxHeight) {
      ctx.fillText(currentLine + '...', x, y + offsetY);
      return true; // truncated
    }
    ctx.fillText(currentLine, x, y + offsetY);
    offsetY += lineHeight;
  }
  return false;
}

// Hit testing
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
      // Point-in-triangle test
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
    case 'connector': {
      if (el.lineType === 'orthogonal') {
        const mx = (el.x + el.x2) / 2;
        const d1 = distanceToSegment(worldX, worldY, el.x, el.y, mx, el.y);
        const d2 = distanceToSegment(worldX, worldY, mx, el.y, mx, el.y2);
        const d3 = distanceToSegment(worldX, worldY, mx, el.y2, el.x2, el.y2);
        return Math.min(d1, d2, d3) < threshold;
      }
      return distanceToSegment(worldX, worldY, el.x, el.y, el.x2, el.y2) < threshold;
    }
    case 'frame': {
      const titleH = (el.fontSize || 16) + 16;
      if (pointInRect(worldX, worldY, el.x, el.y - titleH, el.width, titleH)) return true;
      const borderThreshold = threshold;
      const inOuter = pointInRect(worldX, worldY, el.x - borderThreshold, el.y - borderThreshold, el.width + borderThreshold * 2, el.height + borderThreshold * 2);
      const inInner = pointInRect(worldX, worldY, el.x + borderThreshold, el.y + borderThreshold, el.width - borderThreshold * 2, el.height - borderThreshold * 2);
      return inOuter && !inInner;
    }
    case 'circle': {
      const rx = el.width / 2;
      const ry = el.height / 2;
      const cx = el.x + rx;
      const cy = el.y + ry;
      const dx = (worldX - cx) / rx;
      const dy = (worldY - cy) / ry;
      return dx * dx + dy * dy <= 1;
    }
    case 'text': {
      return pointInRect(worldX, worldY, el.x - 4, el.y - 4, (el.width || 200) + 8, (el.height || 30) + 8);
    }
    case 'line':
    case 'arrow': {
      return distanceToSegment(worldX, worldY, el.x, el.y, el.x2, el.y2) < threshold;
    }
    case 'freehand': {
      if (!el.points || el.points.length < 2) return false;
      return distanceToPolyline(worldX, worldY, el.points) < threshold;
    }
    default:
      return false;
  }
}

// Check if element center is inside an envelope
function isInsideEnvelope(el, envelope) {
  const bounds = getElementBounds(el);
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  return pointInRect(cx, cy, envelope.x, envelope.y + 36, envelope.width, envelope.height - 36);
}

// Get resize handle at position
function getResizeHandle(el, worldX, worldY, handleSize) {
  handleSize = handleSize || 8;
  const bounds = getElementBounds(el);
  if (!bounds) return null;

  const handles = [
    { name: 'nw', x: bounds.x, y: bounds.y },
    { name: 'ne', x: bounds.x + bounds.w, y: bounds.y },
    { name: 'sw', x: bounds.x, y: bounds.y + bounds.h },
    { name: 'se', x: bounds.x + bounds.w, y: bounds.y + bounds.h },
    { name: 'n', x: bounds.x + bounds.w / 2, y: bounds.y },
    { name: 's', x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
    { name: 'w', x: bounds.x, y: bounds.y + bounds.h / 2 },
    { name: 'e', x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
  ];

  for (const h of handles) {
    if (Math.abs(worldX - h.x) < handleSize && Math.abs(worldY - h.y) < handleSize) {
      return h.name;
    }
  }
  return null;
}
