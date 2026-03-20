// Element factory
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
    ...props
  };
  return base;
}

// Default sticky colors
const STICKY_COLORS = ['#FFD966', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD', '#F4A460'];

// Envelope colors
const ENVELOPE_COLORS = ['#4a9eff', '#ff6b6b', '#4ecdc4', '#ffd966', '#96ceb4', '#ff9ff3', '#54a0ff', '#5f27cd'];

function createSticky(x, y) {
  const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
  return createElement('sticky', {
    x, y,
    width: 200,
    height: 200,
    fill: color,
    stroke: 'transparent',
    text: '',
    fontSize: 16
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

// Connector factory - connected arrow between two elements
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

// Render an element to canvas
function renderElement(ctx, el, selected, camera) {
  ctx.save();

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
      drawSticky(ctx, el);
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

function drawRect(ctx, el) {
  const r = 4;
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  if (el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
  }
  if (el.text) {
    ctx.fillStyle = '#e0e0e0';
    ctx.font = `${el.fontSize || 16}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(el.text, el.x + el.width / 2, el.y + el.height / 2, el.width - 16);
    ctx.textAlign = 'left';
  }
}

function drawCircle(ctx, el) {
  const rx = el.width / 2;
  const ry = el.height / 2;
  ctx.beginPath();
  ctx.ellipse(el.x + rx, el.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  if (el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
  }
  if (el.text) {
    ctx.fillStyle = '#e0e0e0';
    ctx.font = `${el.fontSize || 16}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(el.text, el.x + el.width / 2, el.y + el.height / 2, el.width - 16);
    ctx.textAlign = 'left';
  }
}

function drawLine(ctx, el) {
  ctx.beginPath();
  ctx.moveTo(el.x, el.y);
  ctx.lineTo(el.x2, el.y2);
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawArrow(ctx, el) {
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

function drawSticky(ctx, el) {
  const r = 6;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  ctx.fillStyle = el.fill || '#FFD966';
  ctx.fill();

  ctx.shadowColor = 'transparent';

  const foldSize = 24;
  ctx.beginPath();
  ctx.moveTo(el.x + el.width - foldSize, el.y);
  ctx.lineTo(el.x + el.width, el.y + foldSize);
  ctx.lineTo(el.x + el.width - foldSize, el.y + foldSize);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fill();

  if (el.text) {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `${el.fontSize || 16}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = 'top';
    wrapText(ctx, el.text, el.x + 14, el.y + 14, el.width - 28, (el.fontSize || 16) * 1.4);
  }
}

function drawText(ctx, el) {
  if (!el.text) return;
  ctx.fillStyle = el.fill && el.fill !== 'transparent' ? el.fill : '#e0e0e0';
  ctx.font = `${el.fontSize || 20}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textBaseline = 'top';
  wrapText(ctx, el.text, el.x, el.y, el.width || 400, (el.fontSize || 20) * 1.4);
}

function drawFreehand(ctx, el) {
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
  }
}

function drawEnvelope(ctx, el) {
  const r = 12;
  const headerH = 36;
  const color = el.stroke || '#4a9eff';
  const childCount = (el.children && el.children.length) || 0;

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;

  // Body
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  ctx.fillStyle = el.fill || (color + '15');
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

  // Count badge
  if (childCount > 0) {
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
  }

  // Flap pattern (envelope flap aesthetic at bottom)
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

function drawConnector(ctx, el) {
  if (!el.x || !el.y || !el.x2 || !el.y2) return;
  const style = el.connectorStyle || 'arrow';

  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';

  if (style === 'dashed') {
    ctx.setLineDash([8, 4]);
  }

  if (el.lineType === 'curve') {
    // Bezier curve
    const mx = (el.x + el.x2) / 2;
    const my = (el.y + el.y2) / 2;
    const dx = el.x2 - el.x;
    const dy = el.y2 - el.y;
    const cx1 = el.x + dx * 0.5;
    const cy1 = el.y;
    const cx2 = el.x2 - dx * 0.5;
    const cy2 = el.y2;
    ctx.beginPath();
    ctx.moveTo(el.x, el.y);
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, el.x2, el.y2);
    ctx.stroke();
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

  // Label
  if (el.text) {
    const mx = (el.x + el.x2) / 2;
    const my = (el.y + el.y2) / 2;
    const fontSize = el.fontSize || 12;
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const tw = ctx.measureText(el.text).width;
    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    ctx.fillRect(mx - tw / 2 - 4, my - fontSize / 2 - 4, tw + 8, fontSize + 8);
    ctx.fillStyle = '#e0e0e0';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(el.text, mx, my);
    ctx.textAlign = 'left';
  }
}

function drawDiamond(ctx, el) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.beginPath();
  ctx.moveTo(cx, el.y);
  ctx.lineTo(el.x + el.width, cy);
  ctx.lineTo(cx, el.y + el.height);
  ctx.lineTo(el.x, cy);
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
  if (el.text) {
    ctx.fillStyle = '#e0e0e0';
    ctx.font = `${el.fontSize || 16}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(el.text, cx, cy, el.width - 20);
    ctx.textAlign = 'left';
  }
}

function drawTriangle(ctx, el) {
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
  if (el.text) {
    ctx.fillStyle = '#e0e0e0';
    ctx.font = `${el.fontSize || 16}px -apple-system, BlinkMacSystemFont, sans-serif`;
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
  'todo': 'A faire', 'in-progress': 'En cours', 'review': 'En review', 'done': 'Termine'
};
const CARD_PRIORITY_COLORS = { 'high': '#e94560', 'medium': '#ffd966', 'low': '#4ecdc4' };

function drawCard(ctx, el) {
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

  // Priority strip (left edge)
  if (el.cardPriority && CARD_PRIORITY_COLORS[el.cardPriority]) {
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
    yOff += 24;
  } else {
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
    ctx.fillStyle = '#888';
    const dueText = el.cardDueDate;
    ctx.textAlign = 'right';
    ctx.fillText('📅 ' + dueText, el.x + w - 12, bY);
    ctx.textAlign = 'left';
  }

  if (el.cardAssignee) {
    const initials = el.cardAssignee.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
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
}

function drawList(ctx, el) {
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
  ctx.fillText(el.text || 'Liste', el.x + 12, el.y + headerH / 2, el.width - 24);

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
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = text.split('\n');
  let offsetY = 0;
  for (const line of lines) {
    const words = line.split(' ');
    let currentLine = '';
    for (const word of words) {
      const test = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctx.measureText(test);
      if (metrics.width > maxWidth && currentLine) {
        ctx.fillText(currentLine, x, y + offsetY);
        currentLine = word;
        offsetY += lineHeight;
      } else {
        currentLine = test;
      }
    }
    ctx.fillText(currentLine, x, y + offsetY);
    offsetY += lineHeight;
  }
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
