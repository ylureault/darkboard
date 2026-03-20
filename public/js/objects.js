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
  }

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
  // Text inside shape
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
  // Text inside shape
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

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(el.x2, el.y2);
  ctx.lineTo(el.x2 - headLen * Math.cos(angle - Math.PI / 6), el.y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(el.x2, el.y2);
  ctx.lineTo(el.x2 - headLen * Math.cos(angle + Math.PI / 6), el.y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawSticky(ctx, el) {
  const r = 6;
  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  ctx.fillStyle = el.fill || '#FFD966';
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Corner fold
  const foldSize = 24;
  ctx.beginPath();
  ctx.moveTo(el.x + el.width - foldSize, el.y);
  ctx.lineTo(el.x + el.width, el.y + foldSize);
  ctx.lineTo(el.x + el.width - foldSize, el.y + foldSize);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fill();

  // Text
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

  // Smooth curve using quadratic bezier
  for (let i = 1; i < el.points.length - 1; i++) {
    const xc = (el.points[i].x + el.points[i + 1].x) / 2;
    const yc = (el.points[i].y + el.points[i + 1].y) / 2;
    ctx.quadraticCurveTo(el.points[i].x, el.points[i].y, xc, yc);
  }
  // Last point
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
  // Background
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }

  // Dashed border
  ctx.strokeStyle = el.stroke || '#4a9eff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.setLineDash([8, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Title label at top
  if (el.text) {
    const fontSize = el.fontSize || 16;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const textWidth = ctx.measureText(el.text).width;
    const labelPad = 8;
    const labelH = fontSize + labelPad * 2;

    // Label background
    ctx.fillStyle = el.stroke || '#4a9eff';
    ctx.beginPath();
    ctx.roundRect(el.x, el.y - labelH, textWidth + labelPad * 2, labelH, [r, r, 0, 0]);
    ctx.fill();

    // Label text
    ctx.fillStyle = 'white';
    ctx.textBaseline = 'top';
    ctx.fillText(el.text, el.x + labelPad, el.y - labelH + labelPad);
  }
}

function drawImage(ctx, el) {
  if (!el.imageData) return;
  const img = getCachedImage(el.imageData);
  if (img.complete && img.naturalWidth > 0) {
    // Shadow
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
    case 'frame': {
      // Hit test the border area only (not the inside), or the title bar
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
