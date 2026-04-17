// #198: canvas.js - Canvas rendering engine with camera/zoom, viewport culling, minimap,
// grid drawing, selection visuals, remote cursors, and spatial indexing for large boards.
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
    this.snapGuideThreshold = 10; // #84 - configurable snap guide threshold (px)
    this._lastMinimapRender = 0; // throttle minimap to every 1000ms
    this._minimapCache = null;
    this._elementRenderCache = new Map(); // #177: bitmap cache for complex elements
    this._spatialGrid = new Map(); // #182: spatial index grid for viewport culling
    this._spatialGridCellSize = 500; // world units per grid cell
    this._spatialGridDirty = true;

    // #165 - Text measurement cache for performance
    this._textMeasureCache = new Map();
    this._textMeasureCacheMax = 500;

    // #167 - Frame rate monitoring
    this._frameCount = 0;
    this._lastFPSTime = performance.now();
    this._currentFPS = 60;

    // #170 - Batch element sorting cache
    this._sortedCache = null;
    this._sortedCacheDirty = true;

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
    this._sortedCacheDirty = true;
    this._spatialGridDirty = true; // #182
  }

  // #182: Rebuild spatial grid index for fast viewport culling on large boards
  rebuildSpatialGrid() {
    if (!this._spatialGridDirty) return;
    this._spatialGrid.clear();
    const cs = this._spatialGridCellSize;
    for (const [id, el] of this.elements) {
      const bounds = getElementBounds(el);
      const minCX = Math.floor(bounds.x / cs);
      const minCY = Math.floor(bounds.y / cs);
      const maxCX = Math.floor((bounds.x + bounds.w) / cs);
      const maxCY = Math.floor((bounds.y + bounds.h) / cs);
      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cy = minCY; cy <= maxCY; cy++) {
          const key = cx + ',' + cy;
          if (!this._spatialGrid.has(key)) this._spatialGrid.set(key, []);
          this._spatialGrid.get(key).push(id);
        }
      }
    }
    this._spatialGridDirty = false;
  }

  // #182: Get elements visible in a world-space rectangle using spatial grid
  getVisibleElementIds(left, top, right, bottom) {
    const cs = this._spatialGridCellSize;
    const minCX = Math.floor(left / cs);
    const minCY = Math.floor(top / cs);
    const maxCX = Math.floor(right / cs);
    const maxCY = Math.floor(bottom / cs);
    const visible = new Set();
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = cx + ',' + cy;
        const ids = this._spatialGrid.get(key);
        if (ids) {
          for (const id of ids) visible.add(id);
        }
      }
    }
    return visible;
  }

  // #165 - Cached text measurement to avoid expensive ctx.measureText calls
  measureTextCached(ctx, text, font) {
    const key = font + '|' + text;
    if (this._textMeasureCache.has(key)) return this._textMeasureCache.get(key);
    ctx.font = font;
    const m = ctx.measureText(text);
    if (this._textMeasureCache.size >= this._textMeasureCacheMax) {
      // Evict oldest entries (first half)
      const keys = [...this._textMeasureCache.keys()];
      const toRemove = Math.floor(keys.length / 2);
      for (let i = 0; i < toRemove; i++) this._textMeasureCache.delete(keys[i]);
    }
    this._textMeasureCache.set(key, m);
    return m;
  }

  // #170 - Sorted elements cache
  getSortedElements() {
    if (!this._sortedCacheDirty && this._sortedCache) return this._sortedCache;
    this._sortedCache = Array.from(this.elements.values())
      .sort((a, b) => {
        // #113 - Selected elements get temporary z-boost during rendering
        const aZ = (a.zIndex || 0) + (this.selectedIds.has(a.id) ? 999999 : 0);
        const bZ = (b.zIndex || 0) + (this.selectedIds.has(b.id) ? 999999 : 0);
        return aZ - bZ;
      });
    this._sortedCacheDirty = false;
    return this._sortedCache;
  }

  startRenderLoop() {
    this._lastFrameTime = 0; // #176: rAF throttling
    this._lastCursorRender = 0; // #184: lazy render cursors at 30fps
    const loop = (timestamp) => {
      // #167 - FPS tracking
      this._frameCount++;
      const now = performance.now();
      if (now - this._lastFPSTime >= 1000) {
        this._currentFPS = this._frameCount;
        this._frameCount = 0;
        this._lastFPSTime = now;
      }

      // #176: Skip frame if less than ~16.67ms (60fps cap) since last render
      if (this.dirty && (timestamp - this._lastFrameTime >= 16)) {
        this._lastFrameTime = timestamp;
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

    // Background with subtle radial vignette
    ctx.fillStyle = this.bgColor || '#121212';
    ctx.fillRect(0, 0, w, h);
    const vg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(255,255,255,0.012)');
    vg.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Grid
    if (this.gridEnabled) {
      this.drawGrid(ctx, w, h);
    }

    // #105 - Ruler markings at screen edges
    if (this.gridEnabled && this.camera.zoom >= 0.3) {
      const rulerInterval = 200; // world units
      const viewTL2 = this.screenToWorld(0, 0);
      const viewBR2 = this.screenToWorld(w, h);
      const rStartX = Math.floor(viewTL2.x / rulerInterval) * rulerInterval;
      const rStartY = Math.floor(viewTL2.y / rulerInterval) * rulerInterval;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textBaseline = 'top';
      for (let rx = rStartX; rx <= viewBR2.x; rx += rulerInterval) {
        const s = this.worldToScreen(rx, 0);
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.round(rx)), s.x, 2);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let ry = rStartY; ry <= viewBR2.y; ry += rulerInterval) {
        const s = this.worldToScreen(0, ry);
        ctx.fillText(String(Math.round(ry)), 30, s.y);
      }
      ctx.restore();
    }

    // Apply camera transform
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // Render elements sorted by zIndex (using cache for perf #170)
    const sorted = this.getSortedElements();

    // Viewport culling: compute visible world bounds to skip off-screen elements
    const viewTLCull = this.screenToWorld(0, 0);
    const viewBRCull = this.screenToWorld(w, h);
    const cullPad = 100 / this.camera.zoom; // padding to avoid popping at edges
    const vpLeft = viewTLCull.x - cullPad;
    const vpTop = viewTLCull.y - cullPad;
    const vpRight = viewBRCull.x + cullPad;
    const vpBottom = viewBRCull.y + cullPad;

    // Precompute frame children counts for badge rendering
    for (const el of sorted) {
      if (el.type === 'frame') {
        let count = 0;
        const fb = getElementBounds(el);
        for (const other of sorted) {
          if (other.id !== el.id && other.type !== 'frame') {
            const ob = getElementBounds(other);
            if (ob.x >= fb.x && ob.y >= fb.y && ob.x + ob.w <= fb.x + fb.w && ob.y + ob.h <= fb.y + fb.h) {
              count++;
            }
          }
        }
        el._childrenCount = count;
      }
    }

    // Draw mindmap connections (behind nodes)
    for (const el of sorted) {
      if (el.type === 'mindmap' && el.mindmapParent) {
        const parent = this.elements.get(el.mindmapParent);
        if (parent && !el.hidden && !parent.hidden) {
          const px = parent.x + parent.width;
          const py = parent.y + parent.height / 2;
          const cx = el.x;
          const cy = el.y + el.height / 2;
          const midX = (px + cx) / 2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.bezierCurveTo(midX, py, midX, cy, cx, cy);
          ctx.strokeStyle = parent.fill || '#4a9eff';
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 0.6;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // Tag filter dimming
    const tagFilter = this._activeTagFilter;

    for (const el of sorted) {
      if (el.hidden) continue; // skip hidden elements (collapsed envelope children)

      // Apply tag filter dimming (works for any taggable element type, not just stickies).
      if (tagFilter) {
        const hasTags = el.tags && el.tags.some(t => t.label === tagFilter);
        if (!hasTags) {
          ctx.globalAlpha = 0.15;
        }
      }

      // Viewport culling: skip elements entirely outside the visible area
      const elBounds = getElementBounds(el);
      if (elBounds.x + elBounds.w < vpLeft || elBounds.x > vpRight ||
          elBounds.y + elBounds.h < vpTop || elBounds.y > vpBottom) {
        ctx.globalAlpha = 1;
        el._wasVisible = false; // #R2-22: Track visibility for fade-in
        continue;
      }

      // #R2-22: Fade in elements when they enter viewport
      if (el._wasVisible === false) {
        el._fadeInStart = performance.now();
        el._wasVisible = true;
      }
      if (el._fadeInStart) {
        const fadeElapsed = performance.now() - el._fadeInStart;
        const fadeDuration = 200;
        if (fadeElapsed < fadeDuration) {
          ctx.globalAlpha = Math.min(1, fadeElapsed / fadeDuration) * (ctx.globalAlpha || 1);
          this.dirty = true; // Keep rendering during fade
        } else {
          delete el._fadeInStart;
        }
      }

      // Search highlight glow (#116 - also highlight matching text)
      if (el._searchHighlight) {
        ctx.save();
        ctx.shadowColor = '#4a9eff';
        ctx.shadowBlur = 16;
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 3 / this.camera.zoom;
        ctx.strokeRect(elBounds.x - 4, elBounds.y - 4, elBounds.w + 8, elBounds.h + 8);
        ctx.restore();
        if (el._searchQuery && el.text) {
          const query = el._searchQuery;
          const textLower = el.text.toLowerCase();
          const idx = textLower.indexOf(query);
          if (idx >= 0) {
            ctx.save();
            const fs = el.fontSize || 16;
            ctx.font = `${fs}px -apple-system, BlinkMacSystemFont, sans-serif`;
            const beforeW = ctx.measureText(el.text.substring(0, idx)).width;
            const matchW = ctx.measureText(el.text.substring(idx, idx + query.length)).width;
            const textX = el.type === 'sticky' ? elBounds.x + 14 : elBounds.x + 8;
            const textY = el.type === 'sticky' ? elBounds.y + 14 : elBounds.y + 8;
            ctx.fillStyle = 'rgba(74, 158, 255, 0.3)';
            ctx.fillRect(textX + beforeW, textY, matchW, fs * 1.4);
            ctx.restore();
          }
        }
      }
      if (this._hoveredElementId === el.id && !this.selectedIds.has(el.id)) {
        ctx.save();
        ctx.shadowColor = 'rgba(74, 158, 255, 0.6)';
        ctx.shadowBlur = 12 / this.camera.zoom;
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.4)';
        ctx.lineWidth = 2 / this.camera.zoom;
        const hb = getElementBounds(el);
        ctx.beginPath();
        ctx.roundRect(hb.x - 3, hb.y - 3, hb.w + 6, hb.h + 6, 6 / this.camera.zoom);
        ctx.stroke();
        ctx.shadowColor = 'transparent';
        ctx.restore();
      }
      renderElement(ctx, el, this.selectedIds.has(el.id), this.camera);
      if (el.reactions && el.reactions.length > 0) {
        renderReactionBar(ctx, el);
      }
      if (tagFilter) ctx.globalAlpha = 1;
    }

    // Preview element (being created)
    if (this.previewElement) {
      ctx.globalAlpha = 0.7;
      renderElement(ctx, this.previewElement, false, this.camera);
      ctx.globalAlpha = 1;
    }

    // Hover anchors on non-selected element
    if (this._hoveredElementId && !this.selectedIds.has(this._hoveredElementId)) {
      const hoverEl = this.elements.get(this._hoveredElementId);
      if (hoverEl) this.drawHoverAnchors(ctx, hoverEl);
    }

    // Group display: subtle background for grouped elements
    const drawnGroups = new Set();
    for (const id of this.selectedIds) {
      const el = this.elements.get(id);
      if (el && el.groupId && !drawnGroups.has(el.groupId)) {
        drawnGroups.add(el.groupId);
        // Find all elements in this group
        let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
        for (const [, ge] of this.elements) {
          if (ge.groupId === el.groupId) {
            const b = getElementBounds(ge);
            if (b.x < gMinX) gMinX = b.x;
            if (b.y < gMinY) gMinY = b.y;
            if (b.x + b.w > gMaxX) gMaxX = b.x + b.w;
            if (b.y + b.h > gMaxY) gMaxY = b.y + b.h;
          }
        }
        if (isFinite(gMinX)) {
          const gPad = 12 / this.camera.zoom;
          ctx.fillStyle = 'rgba(74, 158, 255, 0.06)';
          ctx.strokeStyle = 'rgba(74, 158, 255, 0.25)';
          ctx.lineWidth = 1.5 / this.camera.zoom;
          ctx.setLineDash([8 / this.camera.zoom, 4 / this.camera.zoom]);
          ctx.beginPath();
          ctx.roundRect(gMinX - gPad, gMinY - gPad, (gMaxX - gMinX) + gPad * 2, (gMaxY - gMinY) + gPad * 2, 6 / this.camera.zoom);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Selection indicators
    for (const id of this.selectedIds) {
      const el = this.elements.get(id);
      if (el) this.drawSelectionBox(ctx, el);
    }

    // Selection marquee (#92 - improved with animated dash and corner radius)
    if (this.selectionBox) {
      const dashLen = 6 / this.camera.zoom;
      const gapLen = 4 / this.camera.zoom;
      const animOffset = (performance.now() / 50) % (dashLen + gapLen);
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.setLineDash([dashLen, gapLen]);
      ctx.lineDashOffset = animOffset;
      const mr = 3 / this.camera.zoom;
      ctx.beginPath();
      ctx.roundRect(this.selectionBox.x, this.selectionBox.y, this.selectionBox.w, this.selectionBox.h, mr);
      ctx.stroke();
      ctx.fillStyle = 'rgba(74, 158, 255, 0.1)';
      ctx.fill();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      this.dirty = true; // Keep animating while marquee is active
    }

    // Connector snap target highlight
    if (this.connectorSnapTarget) {
      const snapEl = this.elements.get(this.connectorSnapTarget);
      if (snapEl) {
        const bounds = getElementBounds(snapEl);
        ctx.save();
        ctx.strokeStyle = '#4ecdc4';
        ctx.lineWidth = 3 / this.camera.zoom;
        ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
        ctx.strokeRect(bounds.x - 4 / this.camera.zoom, bounds.y - 4 / this.camera.zoom,
          bounds.w + 8 / this.camera.zoom, bounds.h + 8 / this.camera.zoom);
        ctx.setLineDash([]);
        // Draw anchor points
        const anchors = getAnchorPoints(snapEl);
        for (const a of anchors) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, 5 / this.camera.zoom, 0, Math.PI * 2);
          ctx.fillStyle = '#4ecdc4';
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 1.5 / this.camera.zoom;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Laser pointers
    for (const [userId, laser] of this.laserPointers) {
      this.drawLaserPointer(ctx, laser);
    }

    // Comments
    for (const comment of this.comments) {
      this.drawCommentBubble(ctx, comment);
    }

    // #R2-11: Ghost preview at original positions during drag
    if (this._dragGhosts && this._dragGhosts.length > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.setLineDash([4 / this.camera.zoom, 4 / this.camera.zoom]);
      for (const ghost of this._dragGhosts) {
        if (ghost.w > 0 && ghost.h > 0) {
          ctx.strokeRect(ghost.x, ghost.y, ghost.w, ghost.h);
        }
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // #R2-43: Alignment guides with fade effect (#110 - with distance labels)
    if (this.alignmentGuides.length > 0) {
      ctx.save();
      const snapOpacity = this._snapGuideOpacity !== undefined ? this._snapGuideOpacity : 1.0;
      ctx.globalAlpha = snapOpacity;
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
        // #110 - Show coordinate label on guide
        const labelFs = 10 / this.camera.zoom;
        ctx.font = `${labelFs}px sans-serif`;
        ctx.fillStyle = '#ff6b9d';
        ctx.setLineDash([]);
        if (guide.type === 'h') {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(Math.round(guide.y) + 'px', viewTL.x + 8 / this.camera.zoom, guide.y - 2 / this.camera.zoom);
        } else {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(Math.round(guide.x) + 'px', guide.x + 2 / this.camera.zoom, viewTL.y + 8 / this.camera.zoom);
        }
        ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Dimension tooltip during resize
    if (this._resizeDimensions) {
      const dim = this._resizeDimensions;
      const label = `${dim.w} × ${dim.h}`;
      const fs = 12 / this.camera.zoom;
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      const tm = ctx.measureText(label);
      const px = 6 / this.camera.zoom;
      const py = 3 / this.camera.zoom;
      const bw = tm.width + px * 2;
      const bh = fs + py * 2;
      const bx = dim.x - bw / 2;
      const by = dim.y;
      ctx.fillStyle = 'rgba(30, 30, 30, 0.85)';
      ctx.beginPath();
      const r = 4 / this.camera.zoom;
      ctx.roundRect(bx, by, bw, bh, r);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, dim.x, by + bh / 2);
    }

    // Remote cursors — #184: only update at 30fps max
    const cursorNow = performance.now();
    if (cursorNow - this._lastCursorRender >= 33) {
      this._lastCursorRender = cursorNow;
      this._cachedCursorData = [];
      for (const [userId, user] of this.remoteUsers) {
        this._cachedCursorData.push(user);
      }
    }
    if (this._cachedCursorData) {
      for (const user of this._cachedCursorData) {
        this.drawRemoteCursor(ctx, user);
      }
    }

    ctx.restore();

    // #109 - Cursor coordinate display at bottom of screen
    if (this._lastMouseScreen) {
      const world = this.screenToWorld(this._lastMouseScreen.x, this._lastMouseScreen.y);
      const coordText = `${Math.round(world.x)}, ${Math.round(world.y)}`;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'right';
      ctx.fillText(coordText, w - 200, h - 8);
      ctx.restore();
    }

    // Minimap (rendered in screen space, after ctx.restore) — #179: throttled to every 1000ms
    if (this.minimapEnabled) {
      const now = performance.now();
      if (now - this._lastMinimapRender >= 1000) {
        this._lastMinimapRender = now;
        this.drawMinimap();
      } else if (this._minimapCache) {
        // Re-draw the cached minimap between throttle intervals
        const dpr = window.devicePixelRatio || 1;
        const mmW = 180, mmH = 120;
        const mmX = window.innerWidth - mmW - 16;
        const mmY = window.innerHeight - mmH - 60;
        this.ctx.putImageData(this._minimapCache, mmX * dpr, mmY * dpr);
      }
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

    if (this.gridPattern === 'dots') {
      // Dot grid pattern
      const dotColor = this.gridColor || 'rgba(255, 255, 255, 0.08)';
      const dotRadius = Math.max(1, 1.5 * zoom);
      ctx.fillStyle = dotColor;
      for (let x = startX; x <= endWorld.x; x += gridSize) {
        for (let y = startY; y <= endWorld.y; y += gridSize) {
          const s = this.worldToScreen(x, y);
          ctx.beginPath();
          ctx.arc(s.x, s.y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // #104 - Line grid with major/minor lines
      const minorColor = this.gridColor || 'rgba(255, 255, 255, 0.04)';
      const majorColor = this.gridColor ? this.gridColor : 'rgba(255, 255, 255, 0.08)';
      const majorInterval = gridSize * 5; // Major every 5 minor lines (e.g. 100px if gridSize=20)

      // Minor grid lines
      ctx.strokeStyle = minorColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = startX; x <= endWorld.x; x += gridSize) {
        if (Math.abs(x % majorInterval) < 0.1) continue; // skip major positions
        const s = this.worldToScreen(x, 0);
        ctx.moveTo(s.x, 0);
        ctx.lineTo(s.x, h);
      }
      for (let y = startY; y <= endWorld.y; y += gridSize) {
        if (Math.abs(y % majorInterval) < 0.1) continue;
        const s = this.worldToScreen(0, y);
        ctx.moveTo(0, s.y);
        ctx.lineTo(w, s.y);
      }
      ctx.stroke();

      // Major grid lines
      const majorStartX = Math.floor(startWorld.x / majorInterval) * majorInterval;
      const majorStartY = Math.floor(startWorld.y / majorInterval) * majorInterval;
      ctx.strokeStyle = majorColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = majorStartX; x <= endWorld.x; x += majorInterval) {
        const s = this.worldToScreen(x, 0);
        ctx.moveTo(s.x, 0);
        ctx.lineTo(s.x, h);
      }
      for (let y = majorStartY; y <= endWorld.y; y += majorInterval) {
        const s = this.worldToScreen(0, y);
        ctx.moveTo(0, s.y);
        ctx.lineTo(w, s.y);
      }
      ctx.stroke();
    }
  }

  drawSelectionBox(ctx, el) {
    const bounds = getElementBounds(el);
    const pad = 6 / this.camera.zoom;
    const handleSize = 10 / this.camera.zoom; // #106 - larger handles

    // #106 - Dashed border with corner radius and gradient fill
    const selR = 4 / this.camera.zoom;
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
    ctx.beginPath();
    ctx.roundRect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2, selR);
    ctx.stroke();
    // Subtle gradient fill
    const selGrad = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x, bounds.y + bounds.h);
    selGrad.addColorStop(0, 'rgba(74, 158, 255, 0.04)');
    selGrad.addColorStop(1, 'rgba(74, 158, 255, 0.01)');
    ctx.fillStyle = selGrad;
    ctx.fill();
    ctx.setLineDash([]);

    // #106 - Corner resize handles (circular, larger) — skip for linear elements
    if (el.type !== 'line' && el.type !== 'arrow' && el.type !== 'connector' && el.type !== 'freehand') {
      const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y },
        { x: bounds.x, y: bounds.y + bounds.h },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      ];

      ctx.fillStyle = 'white';
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 2 / this.camera.zoom;
      for (const h of corners) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, handleSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Connection anchor points (edge centers) — like Miro
    if (el.type !== 'line' && el.type !== 'arrow' && el.type !== 'connector' && el.type !== 'freehand') {
      const anchorR = 6 / this.camera.zoom;
      const anchors = [
        { x: bounds.x + bounds.w / 2, y: bounds.y },          // top
        { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h }, // bottom
        { x: bounds.x, y: bounds.y + bounds.h / 2 },           // left
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 }, // right
      ];
      for (const a of anchors) {
        // Outer glow when hovered
        const isHovered = this._hoveredAnchor &&
          this._hoveredAnchor.elementId === el.id &&
          Math.hypot(a.x - this._hoveredAnchor.x, a.y - this._hoveredAnchor.y) < 1;
        ctx.beginPath();
        ctx.arc(a.x, a.y, isHovered ? anchorR * 1.4 : anchorR, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#4ecdc4' : 'white';
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#4ecdc4' : '#4a9eff';
        ctx.lineWidth = 2 / this.camera.zoom;
        ctx.stroke();
      }
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

  // Draw anchor points on hovered (non-selected) element
  drawHoverAnchors(ctx, el) {
    const bounds = getElementBounds(el);
    if (el.type === 'line' || el.type === 'arrow' || el.type === 'connector' || el.type === 'freehand') return;
    const anchorR = 5 / this.camera.zoom;
    const anchors = [
      { x: bounds.x + bounds.w / 2, y: bounds.y },
      { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h / 2 },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
    ];
    ctx.save();
    ctx.globalAlpha = 0.6;
    for (const a of anchors) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, anchorR, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Hit test for anchor connection points on selected elements
  hitTestAnchor(worldX, worldY) {
    const anchorR = 10 / this.camera.zoom;
    for (const id of this.selectedIds) {
      const el = this.elements.get(id);
      if (!el || el.type === 'line' || el.type === 'arrow' || el.type === 'connector' || el.type === 'freehand') continue;
      const anchors = getAnchorPoints(el);
      for (const a of anchors) {
        if (Math.hypot(worldX - a.x, worldY - a.y) < anchorR) {
          return { elementId: id, x: a.x, y: a.y, side: a.side };
        }
      }
    }
    // Also check hovered element
    if (this._hoveredElementId) {
      const el = this.elements.get(this._hoveredElementId);
      if (el && el.type !== 'line' && el.type !== 'arrow' && el.type !== 'connector' && el.type !== 'freehand') {
        const anchors = getAnchorPoints(el);
        for (const a of anchors) {
          if (Math.hypot(worldX - a.x, worldY - a.y) < anchorR) {
            return { elementId: this._hoveredElementId, x: a.x, y: a.y, side: a.side };
          }
        }
      }
    }
    return null;
  }

  drawRemoteCursor(ctx, user) {
    // Skip inactive users
    if (user.inactive) return;

    const x = user.x;
    const y = user.y;

    ctx.save();

    // Fade effect for inactive users
    const timeSinceActivity = user.lastActivity ? Date.now() - user.lastActivity : 0;
    if (timeSinceActivity > 10000) {
      ctx.globalAlpha = 0.3;
    } else if (timeSinceActivity > 5000) {
      // Interpolate from 1.0 to 0.3 between 5000-10000ms
      const t = (timeSinceActivity - 5000) / 5000;
      ctx.globalAlpha = 1.0 - t * 0.7;
    }

    // Pulsing glow ring for active cursors (within 2 seconds)
    if (timeSinceActivity < 2000) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
      const glowRadius = 12 + pulse * 6;
      const glowAlpha = 0.15 + pulse * 0.1;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = user.color;
      const savedAlpha = ctx.globalAlpha;
      ctx.globalAlpha = savedAlpha * glowAlpha;
      ctx.fill();
      ctx.globalAlpha = savedAlpha;
    }

    // Cursor arrow
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
    const fontSize = 13 / this.camera.zoom;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const textWidth = ctx.measureText(user.name).width;
    const labelPad = 5 / this.camera.zoom;

    ctx.fillStyle = user.color;
    const rx = 4 / this.camera.zoom;
    const labelX = 16;
    const labelY = 16;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4 / this.camera.zoom;
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, textWidth + labelPad * 2, fontSize + labelPad * 2, rx);
    ctx.fill();
    ctx.shadowColor = 'transparent';

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
    const isHovered = this._hoveredCommentId === comment.id;
    const scale = isHovered ? 1.2 : 1;
    ctx.save();
    if (isHovered) ctx.translate(x, y);
    if (isHovered) ctx.scale(scale, scale);
    const cx = isHovered ? 0 : x;
    const cy = isHovered ? 0 : y;
    ctx.beginPath();
    ctx.arc(cx, cy, sz / 2, 0, Math.PI * 2);
    ctx.fillStyle = comment.resolved ? '#666' : '#4a9eff';
    ctx.shadowColor = isHovered ? 'rgba(74,158,255,0.5)' : 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = isHovered ? 12 : 6;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('💬', cx, cy);
    ctx.textAlign = 'left';
    if (comment.replies && comment.replies.length > 0) {
      ctx.beginPath();
      ctx.arc(cx + sz / 2 - 2, cy - sz / 2 + 2, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#e94560';
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(comment.replies.length + 1), cx + sz / 2 - 2, cy - sz / 2 + 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  hitTestComment(worldX, worldY) {
    const radius = 16 / this.camera.zoom;
    for (const comment of this.comments) {
      const d = Math.hypot(comment.x - worldX, comment.y - worldY);
      if (d < radius) return comment;
    }
    return null;
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

    // Cache the minimap region for throttled reuse
    const dpr = window.devicePixelRatio || 1;
    try {
      this._minimapCache = this.ctx.getImageData(mmX * dpr, mmY * dpr, mmW * dpr, mmH * dpr);
    } catch (e) {
      this._minimapCache = null;
    }
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
    // Use cached sort (reversed for top-first hit testing)
    const sorted = this.getSortedElements();
    const reversed = [];
    for (let i = sorted.length - 1; i >= 0; i--) reversed.push(sorted[i]);
    const threshold = 8 / this.camera.zoom;
    for (const el of reversed) {
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
