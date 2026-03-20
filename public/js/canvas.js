// Canvas renderer with camera/zoom
class CanvasRenderer {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.dirty = true;
    this.elements = new Map(); // id -> element
    this.selectedIds = new Set();
    this.remoteUsers = new Map(); // userId -> { x, y, name, color }
    this.previewElement = null;
    this.selectionBox = null; // { x, y, w, h } for marquee selection
    this.gridEnabled = true;
    this.snapToGrid = false;
    this.snapGridSize = 20;
    this.minimapEnabled = false;
    this.laserPointers = new Map(); // userId -> {x, y, color}
    this.comments = []; // anchored comments
    this.alignmentGuides = []; // { type: 'h'|'v', x?, y? }

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.startRenderLoop();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.dirty = true;
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.camera.x) * this.camera.zoom + window.innerWidth / 2,
      y: (wy - this.camera.y) * this.camera.zoom + window.innerHeight / 2
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - window.innerWidth / 2) / this.camera.zoom + this.camera.x,
      y: (sy - window.innerHeight / 2) / this.camera.zoom + this.camera.y
    };
  }

  setZoom(newZoom, centerX, centerY) {
    newZoom = clamp(newZoom, 0.1, 5);
    if (centerX !== undefined) {
      const worldBefore = this.screenToWorld(centerX, centerY);
      this.camera.zoom = newZoom;
      const worldAfter = this.screenToWorld(centerX, centerY);
      this.camera.x += worldBefore.x - worldAfter.x;
      this.camera.y += worldBefore.y - worldAfter.y;
    } else {
      this.camera.zoom = newZoom;
    }
    this.dirty = true;
  }

  pan(dx, dy) {
    this.camera.x -= dx / this.camera.zoom;
    this.camera.y -= dy / this.camera.zoom;
    this.dirty = true;
  }

  markDirty() {
    this.dirty = true;
  }

  startRenderLoop() {
    const loop = () => {
      if (this.dirty) {
        this.render();
        this.dirty = false;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  render() {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = this.bgColor || '#121212';
    ctx.fillRect(0, 0, w, h);

    // Grid
    if (this.gridEnabled) {
      this.drawGrid(ctx, w, h);
    }

    // Apply camera transform
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // Render elements sorted by zIndex
    const sorted = Array.from(this.elements.values())
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    for (const el of sorted) {
      if (el.hidden) continue; // skip hidden elements (collapsed envelope children)
      // Search highlight glow
      if (el._searchHighlight) {
        const b = getElementBounds(el);
        ctx.save();
        ctx.shadowColor = '#4a9eff';
        ctx.shadowBlur = 16;
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 3 / this.camera.zoom;
        ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
        ctx.restore();
      }
      renderElement(ctx, el, this.selectedIds.has(el.id), this.camera);
    }

    // Preview element (being created)
    if (this.previewElement) {
      ctx.globalAlpha = 0.7;
      renderElement(ctx, this.previewElement, false, this.camera);
      ctx.globalAlpha = 1;
    }

    // Selection indicators
    for (const id of this.selectedIds) {
      const el = this.elements.get(id);
      if (el) this.drawSelectionBox(ctx, el);
    }

    // Selection marquee
    if (this.selectionBox) {
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 1 / this.camera.zoom;
      ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
      ctx.strokeRect(this.selectionBox.x, this.selectionBox.y, this.selectionBox.w, this.selectionBox.h);
      ctx.fillStyle = 'rgba(74, 158, 255, 0.08)';
      ctx.fillRect(this.selectionBox.x, this.selectionBox.y, this.selectionBox.w, this.selectionBox.h);
      ctx.setLineDash([]);
    }

    // Laser pointers
    for (const [userId, laser] of this.laserPointers) {
      this.drawLaserPointer(ctx, laser);
    }

    // Comments
    for (const comment of this.comments) {
      this.drawCommentBubble(ctx, comment);
    }

    // Alignment guides
    if (this.alignmentGuides.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#ff6b9d';
      ctx.lineWidth = 1 / this.camera.zoom;
      ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
      const viewTL = this.screenToWorld(0, 0);
      const viewBR = this.screenToWorld(w, h);
      for (const guide of this.alignmentGuides) {
        ctx.beginPath();
        if (guide.type === 'h') {
          ctx.moveTo(viewTL.x, guide.y);
          ctx.lineTo(viewBR.x, guide.y);
        } else {
          ctx.moveTo(guide.x, viewTL.y);
          ctx.lineTo(guide.x, viewBR.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Remote cursors
    for (const [userId, user] of this.remoteUsers) {
      this.drawRemoteCursor(ctx, user);
    }

    ctx.restore();

    // Minimap (rendered in screen space, after ctx.restore)
    if (this.minimapEnabled) {
      this.drawMinimap();
    }
  }

  drawGrid(ctx, w, h) {
    const zoom = this.camera.zoom;
    let gridSize = 40;

    // Adaptive grid
    if (zoom < 0.3) gridSize = 200;
    else if (zoom < 0.6) gridSize = 100;
    else if (zoom > 2) gridSize = 20;

    const startWorld = this.screenToWorld(0, 0);
    const endWorld = this.screenToWorld(w, h);

    const startX = Math.floor(startWorld.x / gridSize) * gridSize;
    const startY = Math.floor(startWorld.y / gridSize) * gridSize;

    ctx.strokeStyle = this.gridColor || 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = startX; x <= endWorld.x; x += gridSize) {
      const s = this.worldToScreen(x, 0);
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, h);
    }
    for (let y = startY; y <= endWorld.y; y += gridSize) {
      const s = this.worldToScreen(0, y);
      ctx.moveTo(0, s.y);
      ctx.lineTo(w, s.y);
    }
    ctx.stroke();
  }

  drawSelectionBox(ctx, el) {
    const bounds = getElementBounds(el);
    const pad = 6 / this.camera.zoom;
    const handleSize = 8 / this.camera.zoom;

    // Dashed border
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
    ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2);
    ctx.setLineDash([]);

    // Handles
    const handles = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y },
      { x: bounds.x, y: bounds.y + bounds.h },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      { x: bounds.x + bounds.w / 2, y: bounds.y },
      { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h / 2 },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
    ];

    ctx.fillStyle = 'white';
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2 / this.camera.zoom;
    for (const h of handles) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, handleSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Rotation handle (top center, above element)
    if (el.type !== 'line' && el.type !== 'arrow' && el.type !== 'connector' && el.type !== 'freehand') {
      const rotX = bounds.x + bounds.w / 2;
      const rotY = bounds.y - pad - 30 / this.camera.zoom;
      const lineY = bounds.y - pad;
      // Line from top to rotation handle
      ctx.beginPath();
      ctx.moveTo(rotX, lineY);
      ctx.lineTo(rotX, rotY);
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.stroke();
      // Rotation circle
      ctx.beginPath();
      ctx.arc(rotX, rotY, handleSize * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = '#4a9eff';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.stroke();
      // Rotation arrow icon
      ctx.beginPath();
      const rs = handleSize * 0.35;
      ctx.arc(rotX, rotY, rs, -Math.PI * 0.7, Math.PI * 0.3);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.stroke();
    }
  }

  drawRemoteCursor(ctx, user) {
    // Skip inactive users
    if (user.inactive) return;

    const x = user.x;
    const y = user.y;

    // Cursor arrow
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = user.color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 18);
    ctx.lineTo(5, 14);
    ctx.lineTo(12, 18);
    ctx.lineTo(10, 12);
    ctx.lineTo(14, 6);
    ctx.closePath();
    ctx.fill();

    // Name label
    const fontSize = 12 / this.camera.zoom;
    ctx.font = `bold ${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(user.name).width;
    const labelPad = 4 / this.camera.zoom;

    ctx.fillStyle = user.color;
    const rx = 3 / this.camera.zoom;
    const labelX = 16;
    const labelY = 16;
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, textWidth + labelPad * 2, fontSize + labelPad * 2, rx);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.textBaseline = 'top';
    ctx.fillText(user.name, labelX + labelPad, labelY + labelPad);
    ctx.restore();
  }

  drawLaserPointer(ctx, laser) {
    const x = laser.x;
    const y = laser.y;
    // Glowing dot
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = laser.color || '#ff0000';
    ctx.shadowColor = laser.color || '#ff0000';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.restore();
  }

  drawCommentBubble(ctx, comment) {
    const x = comment.x;
    const y = comment.y;
    const sz = 24;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, sz / 2, 0, Math.PI * 2);
    ctx.fillStyle = comment.resolved ? '#666' : '#4a9eff';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('💬', x, y);
    ctx.textAlign = 'left';
    // Count
    if (comment.replies && comment.replies.length > 0) {
      ctx.beginPath();
      ctx.arc(x + sz / 2 - 2, y - sz / 2 + 2, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#e94560';
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(comment.replies.length + 1), x + sz / 2 - 2, y - sz / 2 + 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  drawMinimap() {
    const ctx = this.ctx;
    const mmW = 180;
    const mmH = 120;
    const mmX = window.innerWidth - mmW - 16;
    const mmY = window.innerHeight - mmH - 60;

    // Compute world bounds of all elements
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of this.elements.values()) {
      const b = getElementBounds(el);
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    if (!isFinite(minX)) return;

    const pad = 100;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;
    const scale = Math.min(mmW / worldW, mmH / worldH);

    // Background
    ctx.save();
    ctx.fillStyle = 'rgba(30,30,30,0.85)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mmX, mmY, mmW, mmH, 8);
    ctx.fill();
    ctx.stroke();

    // Clip to minimap
    ctx.beginPath();
    ctx.roundRect(mmX, mmY, mmW, mmH, 8);
    ctx.clip();

    // Draw elements as dots
    for (const el of this.elements.values()) {
      const b = getElementBounds(el);
      const x = mmX + (b.x - minX) * scale;
      const y = mmY + (b.y - minY) * scale;
      const w = Math.max(2, b.w * scale);
      const h = Math.max(2, b.h * scale);
      ctx.fillStyle = el.fill && el.fill !== 'transparent' ? el.fill : (el.stroke || '#888');
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;

    // Viewport rectangle
    const tlWorld = this.screenToWorld(0, 0);
    const brWorld = this.screenToWorld(window.innerWidth, window.innerHeight);
    const vpX = mmX + (tlWorld.x - minX) * scale;
    const vpY = mmY + (tlWorld.y - minY) * scale;
    const vpW = (brWorld.x - tlWorld.x) * scale;
    const vpH = (brWorld.y - tlWorld.y) * scale;
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.strokeRect(vpX, vpY, vpW, vpH);

    ctx.restore();
  }

  // Snap a position to grid if enabled
  snapPosition(x, y) {
    if (!this.snapToGrid) return { x, y };
    const gs = this.snapGridSize;
    return {
      x: Math.round(x / gs) * gs,
      y: Math.round(y / gs) * gs
    };
  }

  // Hit test: find element under point
  hitTest(worldX, worldY) {
    const sorted = Array.from(this.elements.values())
      .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    const threshold = 8 / this.camera.zoom;
    for (const el of sorted) {
      if (hitTestElement(el, worldX, worldY, threshold)) {
        return el;
      }
    }
    return null;
  }

  // Hit test resize handles of selected elements
  hitTestHandle(worldX, worldY) {
    const handleSize = 10 / this.camera.zoom;
    for (const id of this.selectedIds) {
      const el = this.elements.get(id);
      if (el) {
        // Check rotation handle first
        if (el.type !== 'line' && el.type !== 'arrow' && el.type !== 'connector' && el.type !== 'freehand') {
          const bounds = getElementBounds(el);
          const pad = 6 / this.camera.zoom;
          const rotX = bounds.x + bounds.w / 2;
          const rotY = bounds.y - pad - 30 / this.camera.zoom;
          const rotR = 8 / this.camera.zoom;
          if (Math.hypot(worldX - rotX, worldY - rotY) < rotR) {
            return { elementId: id, handle: 'rotate' };
          }
        }
        const handle = getResizeHandle(el, worldX, worldY, handleSize);
        if (handle) return { elementId: id, handle };
      }
    }
    return null;
  }

  // Hit test minimap for navigation
  hitTestMinimap(screenX, screenY) {
    if (!this.minimapEnabled) return null;
    const mmW = 180, mmH = 120;
    const mmX = window.innerWidth - mmW - 16;
    const mmY = window.innerHeight - mmH - 60;
    if (screenX >= mmX && screenX <= mmX + mmW && screenY >= mmY && screenY <= mmY + mmH) {
      // Compute world position from minimap click
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const el of this.elements.values()) {
        const b = getElementBounds(el);
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.w > maxX) maxX = b.x + b.w;
        if (b.y + b.h > maxY) maxY = b.y + b.h;
      }
      if (!isFinite(minX)) return null;
      const pad = 100;
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      const worldW = maxX - minX || 1;
      const worldH = maxY - minY || 1;
      const scale = Math.min(mmW / worldW, mmH / worldH);
      return {
        worldX: minX + (screenX - mmX) / scale,
        worldY: minY + (screenY - mmY) / scale
      };
    }
    return null;
  }
}
