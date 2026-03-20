// Tool implementations
const Tools = {
  select: {
    name: 'select',
    cursor: 'default',
    dragStart: null,
    dragType: null, // 'move' | 'resize' | 'marquee'
    resizeHandle: null,
    originalElements: null,

    onPointerDown(app, worldX, worldY, e) {
      // Check resize handles first
      const handleHit = app.renderer.hitTestHandle(worldX, worldY);
      if (handleHit) {
        this.dragType = 'resize';
        this.resizeHandle = handleHit;
        this.dragStart = { x: worldX, y: worldY };
        const el = app.renderer.elements.get(handleHit.elementId);
        this.originalElements = new Map();
        this.originalElements.set(el.id, deepClone(el));
        return;
      }

      const hit = app.renderer.hitTest(worldX, worldY);

      if (hit) {
        if (e.shiftKey) {
          // Toggle selection
          if (app.renderer.selectedIds.has(hit.id)) {
            app.renderer.selectedIds.delete(hit.id);
          } else {
            app.renderer.selectedIds.add(hit.id);
          }
        } else if (!app.renderer.selectedIds.has(hit.id)) {
          app.renderer.selectedIds.clear();
          app.renderer.selectedIds.add(hit.id);
        }

        this.dragType = 'move';
        this.dragStart = { x: worldX, y: worldY };

        // Store original positions
        this.originalElements = new Map();
        for (const id of app.renderer.selectedIds) {
          const el = app.renderer.elements.get(id);
          if (el) this.originalElements.set(id, deepClone(el));
        }
      } else {
        // Start marquee selection
        if (!e.shiftKey) {
          app.renderer.selectedIds.clear();
        }
        this.dragType = 'marquee';
        this.dragStart = { x: worldX, y: worldY };
      }
      app.renderer.markDirty();
    },

    onPointerMove(app, worldX, worldY, e) {
      if (!this.dragStart) {
        // Hover cursor
        const handleHit = app.renderer.hitTestHandle(worldX, worldY);
        if (handleHit) {
          const cursors = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
          app.renderer.canvas.style.cursor = cursors[handleHit.handle] || 'default';
        } else {
          const hit = app.renderer.hitTest(worldX, worldY);
          app.renderer.canvas.style.cursor = hit ? 'move' : 'default';
        }
        return;
      }

      const dx = worldX - this.dragStart.x;
      const dy = worldY - this.dragStart.y;

      if (this.dragType === 'move') {
        for (const [id, orig] of this.originalElements) {
          const el = app.renderer.elements.get(id);
          if (!el) continue;
          el.x = orig.x + dx;
          el.y = orig.y + dy;
          if (el.x2 !== undefined) {
            el.x2 = orig.x2 + dx;
            el.y2 = orig.y2 + dy;
          }
          if (el.points) {
            el.points = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
          }
        }
      } else if (this.dragType === 'resize') {
        const { elementId, handle } = this.resizeHandle;
        const el = app.renderer.elements.get(elementId);
        const orig = this.originalElements.get(elementId);
        if (el && orig) {
          this.applyResize(el, orig, handle, dx, dy, e.shiftKey);
        }
      } else if (this.dragType === 'marquee') {
        app.renderer.selectionBox = normalizeRect(
          this.dragStart.x, this.dragStart.y, dx, dy
        );
        app.renderer.selectionBox = {
          x: app.renderer.selectionBox.x,
          y: app.renderer.selectionBox.y,
          w: app.renderer.selectionBox.w,
          h: app.renderer.selectionBox.h
        };
      }

      app.renderer.markDirty();
    },

    onPointerUp(app, worldX, worldY, e) {
      if (this.dragType === 'move' && this.dragStart) {
        const dx = worldX - this.dragStart.x;
        const dy = worldY - this.dragStart.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          const ops = [];
          const inverseOps = [];
          for (const [id, orig] of this.originalElements) {
            const el = app.renderer.elements.get(id);
            if (!el) continue;
            const props = { x: el.x, y: el.y };
            const oldProps = { x: orig.x, y: orig.y };
            if (el.x2 !== undefined) {
              props.x2 = el.x2;
              props.y2 = el.y2;
              oldProps.x2 = orig.x2;
              oldProps.y2 = orig.y2;
            }
            if (el.points) {
              props.points = el.points;
              oldProps.points = orig.points;
            }
            ops.push({ type: 'update', elementId: id, props });
            inverseOps.push({ type: 'update', elementId: id, props: oldProps });
          }
          app.history.push(ops, inverseOps);
          app.sync.sendOps(ops);
        }
      } else if (this.dragType === 'resize' && this.dragStart) {
        const { elementId } = this.resizeHandle;
        const el = app.renderer.elements.get(elementId);
        const orig = this.originalElements.get(elementId);
        if (el && orig) {
          const props = { x: el.x, y: el.y, width: el.width, height: el.height };
          const oldProps = { x: orig.x, y: orig.y, width: orig.width, height: orig.height };
          if (el.x2 !== undefined) {
            props.x2 = el.x2;
            props.y2 = el.y2;
            oldProps.x2 = orig.x2;
            oldProps.y2 = orig.y2;
          }
          const ops = [{ type: 'update', elementId, props }];
          const inverseOps = [{ type: 'update', elementId, props: oldProps }];
          app.history.push(ops, inverseOps);
          app.sync.sendOps(ops);
        }
      } else if (this.dragType === 'marquee' && app.renderer.selectionBox) {
        const box = app.renderer.selectionBox;
        for (const [id, el] of app.renderer.elements) {
          const bounds = getElementBounds(el);
          if (bounds.x >= box.x && bounds.y >= box.y &&
              bounds.x + bounds.w <= box.x + box.w &&
              bounds.y + bounds.h <= box.y + box.h) {
            app.renderer.selectedIds.add(id);
          }
        }
        app.renderer.selectionBox = null;
      }

      this.dragStart = null;
      this.dragType = null;
      this.resizeHandle = null;
      this.originalElements = null;
      app.renderer.markDirty();
    },

    applyResize(el, orig, handle, dx, dy, constrain) {
      if (el.type === 'line' || el.type === 'arrow') {
        // For lines, move the appropriate endpoint
        if (handle === 'nw' || handle === 'w' || handle === 'sw') {
          el.x = orig.x + dx;
          el.y = orig.y + dy;
        } else {
          el.x2 = orig.x2 + dx;
          el.y2 = orig.y2 + dy;
        }
        return;
      }

      let newX = orig.x, newY = orig.y, newW = orig.width, newH = orig.height;

      if (handle.includes('e')) { newW = orig.width + dx; }
      if (handle.includes('w')) { newX = orig.x + dx; newW = orig.width - dx; }
      if (handle.includes('s')) { newH = orig.height + dy; }
      if (handle.includes('n')) { newY = orig.y + dy; newH = orig.height - dy; }

      if (constrain) {
        const size = Math.max(Math.abs(newW), Math.abs(newH));
        newW = newW < 0 ? -size : size;
        newH = newH < 0 ? -size : size;
      }

      // Min size
      if (newW < 10) { newW = 10; }
      if (newH < 10) { newH = 10; }

      el.x = newX;
      el.y = newY;
      el.width = newW;
      el.height = newH;
    },

    onDoubleClick(app, worldX, worldY) {
      const hit = app.renderer.hitTest(worldX, worldY);
      if (hit && (hit.type === 'sticky' || hit.type === 'text' || hit.type === 'rect' || hit.type === 'circle' || hit.type === 'frame')) {
        app.startTextEdit(hit);
      } else if (!hit) {
        // Double-click on empty canvas creates a sticky
        const el = createSticky(worldX - 100, worldY - 100);
        app.addElement(el);
        app.renderer.selectedIds.clear();
        app.renderer.selectedIds.add(el.id);
        app.renderer.markDirty();
        setTimeout(() => app.startTextEdit(el), 50);
      }
    },

    onKeyDown(app, e) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (app.renderer.selectedIds.size > 0) {
          app.deleteSelected();
        }
      }
    }
  },

  hand: {
    name: 'hand',
    cursor: 'grab',
    dragging: false,
    lastX: 0,
    lastY: 0,

    onPointerDown(app, worldX, worldY, e) {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      app.renderer.canvas.style.cursor = 'grabbing';
    },

    onPointerMove(app, worldX, worldY, e) {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      app.renderer.pan(dx, dy);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    },

    onPointerUp(app) {
      this.dragging = false;
      app.renderer.canvas.style.cursor = 'grab';
    },

    onKeyDown() {},
    onDoubleClick() {}
  },

  rect: createShapeTool('rect'),
  circle: createShapeTool('circle'),

  line: {
    name: 'line',
    cursor: 'crosshair',
    startPoint: null,

    onPointerDown(app, worldX, worldY) {
      this.startPoint = { x: worldX, y: worldY };
      app.renderer.previewElement = createElement('line', {
        x: worldX, y: worldY, x2: worldX, y2: worldY,
        stroke: app.currentStroke, strokeWidth: app.currentStrokeWidth
      });
    },

    onPointerMove(app, worldX, worldY) {
      if (!this.startPoint) return;
      app.renderer.previewElement.x2 = worldX;
      app.renderer.previewElement.y2 = worldY;
      app.renderer.markDirty();
    },

    onPointerUp(app, worldX, worldY) {
      if (!this.startPoint) return;
      const el = createElement('line', {
        x: this.startPoint.x, y: this.startPoint.y,
        x2: worldX, y2: worldY,
        stroke: app.currentStroke, strokeWidth: app.currentStrokeWidth
      });
      app.addElement(el);
      app.renderer.previewElement = null;
      this.startPoint = null;
      app.renderer.markDirty();
    },

    onKeyDown() {},
    onDoubleClick() {}
  },

  arrow: {
    name: 'arrow',
    cursor: 'crosshair',
    startPoint: null,

    onPointerDown(app, worldX, worldY) {
      this.startPoint = { x: worldX, y: worldY };
      app.renderer.previewElement = createElement('arrow', {
        x: worldX, y: worldY, x2: worldX, y2: worldY,
        stroke: app.currentStroke, strokeWidth: app.currentStrokeWidth
      });
    },

    onPointerMove(app, worldX, worldY) {
      if (!this.startPoint) return;
      app.renderer.previewElement.x2 = worldX;
      app.renderer.previewElement.y2 = worldY;
      app.renderer.markDirty();
    },

    onPointerUp(app, worldX, worldY) {
      if (!this.startPoint) return;
      const el = createElement('arrow', {
        x: this.startPoint.x, y: this.startPoint.y,
        x2: worldX, y2: worldY,
        stroke: app.currentStroke, strokeWidth: app.currentStrokeWidth
      });
      app.addElement(el);
      app.renderer.previewElement = null;
      this.startPoint = null;
      app.renderer.markDirty();
    },

    onKeyDown() {},
    onDoubleClick() {}
  },

  draw: {
    name: 'draw',
    cursor: 'crosshair',
    drawing: false,
    points: [],

    onPointerDown(app, worldX, worldY) {
      this.drawing = true;
      this.points = [{ x: worldX, y: worldY }];
      app.renderer.previewElement = createElement('freehand', {
        x: worldX, y: worldY,
        points: this.points,
        stroke: app.currentStroke, strokeWidth: app.currentStrokeWidth
      });
    },

    onPointerMove(app, worldX, worldY) {
      if (!this.drawing) return;
      this.points.push({ x: worldX, y: worldY });
      app.renderer.previewElement.points = this.points;
      app.renderer.markDirty();
    },

    onPointerUp(app) {
      if (!this.drawing) return;
      this.drawing = false;

      if (this.points.length > 1) {
        // Smooth points
        const smoothed = smoothPoints(this.points);
        const el = createElement('freehand', {
          x: smoothed[0].x, y: smoothed[0].y,
          points: smoothed,
          stroke: app.currentStroke, strokeWidth: app.currentStrokeWidth
        });
        app.addElement(el);
      }

      app.renderer.previewElement = null;
      this.points = [];
      app.renderer.markDirty();
    },

    onKeyDown() {},
    onDoubleClick() {}
  },

  sticky: {
    name: 'sticky',
    cursor: 'crosshair',

    onPointerDown(app, worldX, worldY) {
      const el = createSticky(worldX - 100, worldY - 100);
      app.addElement(el);
      app.renderer.selectedIds.clear();
      app.renderer.selectedIds.add(el.id);
      app.renderer.markDirty();
      // Switch to select tool
      app.setTool('select');
    },

    onPointerMove() {},
    onPointerUp() {},
    onKeyDown() {},
    onDoubleClick() {}
  },

  text: {
    name: 'text',
    cursor: 'text',

    onPointerDown(app, worldX, worldY) {
      const el = createTextElement(worldX, worldY);
      app.addElement(el);
      app.renderer.selectedIds.clear();
      app.renderer.selectedIds.add(el.id);
      app.renderer.markDirty();
      app.setTool('select');
      // Immediately start editing
      setTimeout(() => app.startTextEdit(el), 50);
    },

    onPointerMove() {},
    onPointerUp() {},
    onKeyDown() {},
    onDoubleClick() {}
  },

  frame: {
    name: 'frame',
    cursor: 'crosshair',
    startPoint: null,

    onPointerDown(app, worldX, worldY) {
      this.startPoint = { x: worldX, y: worldY };
      app.renderer.previewElement = createElement('frame', {
        x: worldX, y: worldY, width: 0, height: 0,
        fill: 'rgba(74, 158, 255, 0.05)',
        stroke: '#4a9eff',
        strokeWidth: 2,
        text: 'Zone',
        fontSize: 16
      });
    },

    onPointerMove(app, worldX, worldY) {
      if (!this.startPoint) return;
      const w = worldX - this.startPoint.x;
      const h = worldY - this.startPoint.y;
      const norm = normalizeRect(this.startPoint.x, this.startPoint.y, w, h);
      app.renderer.previewElement.x = norm.x;
      app.renderer.previewElement.y = norm.y;
      app.renderer.previewElement.width = norm.w;
      app.renderer.previewElement.height = norm.h;
      app.renderer.markDirty();
    },

    onPointerUp(app, worldX, worldY) {
      if (!this.startPoint) return;
      const w = worldX - this.startPoint.x;
      const h = worldY - this.startPoint.y;
      const norm = normalizeRect(this.startPoint.x, this.startPoint.y, w, h);

      if (norm.w > 20 && norm.h > 20) {
        const el = createElement('frame', {
          x: norm.x, y: norm.y, width: norm.w, height: norm.h,
          fill: 'rgba(74, 158, 255, 0.05)',
          stroke: '#4a9eff',
          strokeWidth: 2,
          text: 'Zone',
          fontSize: 16,
          zIndex: 1 // frames go behind other elements
        });
        app.addElement(el);
        app.renderer.selectedIds.clear();
        app.renderer.selectedIds.add(el.id);
        app.setTool('select');
        setTimeout(() => app.startTextEdit(el), 50);
      }

      app.renderer.previewElement = null;
      this.startPoint = null;
      app.renderer.markDirty();
    },

    onKeyDown() {},
    onDoubleClick() {}
  },

  eraser: {
    name: 'eraser',
    cursor: 'crosshair',
    erasing: false,

    onPointerDown(app, worldX, worldY) {
      this.erasing = true;
      this.erase(app, worldX, worldY);
    },

    onPointerMove(app, worldX, worldY) {
      if (!this.erasing) return;
      this.erase(app, worldX, worldY);
    },

    erase(app, worldX, worldY) {
      const hit = app.renderer.hitTest(worldX, worldY);
      if (hit) {
        const ops = [{ type: 'delete', elementId: hit.id }];
        const inverseOps = [{ type: 'add', elementId: hit.id, element: deepClone(hit) }];
        app.applyOps(ops);
        app.history.push(ops, inverseOps);
        app.sync.sendOps(ops);
      }
    },

    onPointerUp(app) {
      this.erasing = false;
    },

    onKeyDown() {},
    onDoubleClick() {}
  }
};

// Factory for shape tools (rect, circle)
function createShapeTool(type) {
  return {
    name: type,
    cursor: 'crosshair',
    startPoint: null,

    onPointerDown(app, worldX, worldY) {
      this.startPoint = { x: worldX, y: worldY };
      app.renderer.previewElement = createElement(type, {
        x: worldX, y: worldY, width: 0, height: 0,
        fill: app.currentFill, stroke: app.currentStroke,
        strokeWidth: app.currentStrokeWidth
      });
    },

    onPointerMove(app, worldX, worldY, e) {
      if (!this.startPoint) return;
      let w = worldX - this.startPoint.x;
      let h = worldY - this.startPoint.y;

      if (e.shiftKey) {
        const size = Math.max(Math.abs(w), Math.abs(h));
        w = w < 0 ? -size : size;
        h = h < 0 ? -size : size;
      }

      const norm = normalizeRect(this.startPoint.x, this.startPoint.y, w, h);
      app.renderer.previewElement.x = norm.x;
      app.renderer.previewElement.y = norm.y;
      app.renderer.previewElement.width = norm.w;
      app.renderer.previewElement.height = norm.h;
      app.renderer.markDirty();
    },

    onPointerUp(app, worldX, worldY, e) {
      if (!this.startPoint) return;
      let w = worldX - this.startPoint.x;
      let h = worldY - this.startPoint.y;

      if (e.shiftKey) {
        const size = Math.max(Math.abs(w), Math.abs(h));
        w = w < 0 ? -size : size;
        h = h < 0 ? -size : size;
      }

      const norm = normalizeRect(this.startPoint.x, this.startPoint.y, w, h);

      if (norm.w > 5 && norm.h > 5) {
        const el = createElement(type, {
          x: norm.x, y: norm.y, width: norm.w, height: norm.h,
          fill: app.currentFill, stroke: app.currentStroke,
          strokeWidth: app.currentStrokeWidth
        });
        app.addElement(el);
      }

      app.renderer.previewElement = null;
      this.startPoint = null;
      app.renderer.markDirty();
    },

    onKeyDown() {},
    onDoubleClick() {}
  };
}

// Smooth freehand points
function smoothPoints(points) {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    result.push({
      x: (points[i - 1].x + points[i].x + points[i + 1].x) / 3,
      y: (points[i - 1].y + points[i].y + points[i + 1].y) / 3
    });
  }
  result.push(points[points.length - 1]);
  return result;
}
