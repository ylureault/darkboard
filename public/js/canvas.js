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
    ctx.fillStyle = '#121212';
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

    // Remote cursors
    for (const [userId, user] of this.remoteUsers) {
      this.drawRemoteCursor(ctx, user);
    }

    ctx.restore();
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

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
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
        const handle = getResizeHandle(el, worldX, worldY, handleSize);
        if (handle) return { elementId: id, handle };
      }
    }
    return null;
  }
}
