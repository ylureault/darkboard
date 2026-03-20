// Input handler - mouse, touch, keyboard
class InputHandler {
  constructor(app) {
    this.app = app;
    this.spaceDown = false;
    this.isPanning = false;
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.pointerDown = false;

    this.bindEvents();
  }

  bindEvents() {
    const canvas = this.app.renderer.canvas;

    // Mouse events
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointerleave', (e) => this.onPointerUp(e));
    canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));

    // Wheel zoom
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    // Keyboard
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Context menu
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onContextMenu(e);
    });

    // Touch: pinch zoom
    this.touchState = { dist: 0, center: null };
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        this.touchState.dist = d;
        this.touchState.center = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const center = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };

        if (this.touchState.dist > 0) {
          const scale = d / this.touchState.dist;
          const newZoom = this.app.renderer.camera.zoom * scale;
          this.app.renderer.setZoom(newZoom, center.x, center.y);

          // Pan
          const dx = center.x - this.touchState.center.x;
          const dy = center.y - this.touchState.center.y;
          this.app.renderer.pan(dx, dy);

          this.app.updateZoomDisplay();
        }

        this.touchState.dist = d;
        this.touchState.center = center;
      }
    }, { passive: false });
  }

  getWorldPos(e) {
    return this.app.renderer.screenToWorld(e.clientX, e.clientY);
  }

  onPointerDown(e) {
    if (e.button === 1 || (this.spaceDown && e.button === 0)) {
      // Middle click or space+click: pan
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.app.renderer.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return;
    this.pointerDown = true;

    const world = this.getWorldPos(e);
    const tool = Tools[this.app.currentTool];
    if (tool && tool.onPointerDown) {
      tool.onPointerDown(this.app, world.x, world.y, e);
    }
  }

  onPointerMove(e) {
    // Send cursor position
    const world = this.getWorldPos(e);
    this.app.sync.sendCursor(world.x, world.y);

    if (this.isPanning) {
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      this.app.renderer.pan(dx, dy);
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      return;
    }

    const tool = Tools[this.app.currentTool];
    if (tool && tool.onPointerMove) {
      tool.onPointerMove(this.app, world.x, world.y, e);
    }
  }

  onPointerUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      const tool = Tools[this.app.currentTool];
      this.app.renderer.canvas.style.cursor = tool ? tool.cursor : 'default';
      return;
    }

    if (!this.pointerDown) return;
    this.pointerDown = false;

    const world = this.getWorldPos(e);
    const tool = Tools[this.app.currentTool];
    if (tool && tool.onPointerUp) {
      tool.onPointerUp(this.app, world.x, world.y, e);
    }
  }

  onDoubleClick(e) {
    const world = this.getWorldPos(e);
    const tool = Tools[this.app.currentTool];
    if (tool && tool.onDoubleClick) {
      tool.onDoubleClick(this.app, world.x, world.y, e);
    }
  }

  onWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newZoom = this.app.renderer.camera.zoom * (1 + delta);
    this.app.renderer.setZoom(newZoom, e.clientX, e.clientY);
    this.app.updateZoomDisplay();
  }

  onKeyDown(e) {
    // Ignore if typing in input
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

    if (e.key === ' ') {
      e.preventDefault();
      this.spaceDown = true;
      this.app.renderer.canvas.style.cursor = 'grab';
      return;
    }

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.app.redo();
        } else {
          this.app.undo();
        }
        return;
      }
      if (e.key === 'y') {
        e.preventDefault();
        this.app.redo();
        return;
      }
      if (e.key === 'a') {
        e.preventDefault();
        this.app.selectAll();
        return;
      }
      if (e.key === 'c') {
        e.preventDefault();
        this.app.copySelected();
        return;
      }
      if (e.key === 'v') {
        e.preventDefault();
        this.app.paste();
        return;
      }
      if (e.key === 'd') {
        e.preventDefault();
        this.app.duplicateSelected();
        return;
      }
      return;
    }

    // Tool shortcuts
    // Anchor navigation shortcut
    if (e.key === 'n' || e.key === 'N') {
      if (this.app.workshop) {
        this.app.workshop.openAnchorSearch();
      }
      return;
    }

    const toolMap = { v: 'select', h: 'hand', r: 'rect', c: 'circle', l: 'line', a: 'arrow', d: 'draw', s: 'sticky', t: 'text', e: 'eraser', f: 'frame', g: 'envelope' };
    if (toolMap[e.key.toLowerCase()]) {
      this.app.setTool(toolMap[e.key.toLowerCase()]);
      return;
    }

    // Delete
    const tool = Tools[this.app.currentTool];
    if (tool && tool.onKeyDown) {
      tool.onKeyDown(this.app, e);
    }

    // Escape
    if (e.key === 'Escape') {
      this.app.renderer.selectedIds.clear();
      this.app.renderer.previewElement = null;
      this.app.renderer.markDirty();
    }
  }

  onKeyUp(e) {
    if (e.key === ' ') {
      this.spaceDown = false;
      const tool = Tools[this.app.currentTool];
      this.app.renderer.canvas.style.cursor = tool ? tool.cursor : 'default';
    }
  }

  onContextMenu(e) {
    const world = this.getWorldPos(e);
    this.app.showContextMenu(e.clientX, e.clientY, world.x, world.y);
  }
}
