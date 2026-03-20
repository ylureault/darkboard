// Input handler - mouse, touch, keyboard
class InputHandler {
  constructor(app) {
    this.app = app;
    this.spaceDown = false;
    this.isPanning = false;
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.pointerDown = false;
    this.zoomMode = false; // Z key held

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

    // Wheel zoom/pan
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

    // Z key zoom mode: click to zoom in, Alt+click to zoom out
    if (this.zoomMode && e.button === 0) {
      const factor = e.altKey ? 0.7 : 1.4;
      const newZoom = this.app.renderer.camera.zoom * factor;
      this.app.renderer.setZoom(newZoom, e.clientX, e.clientY);
      this.app.updateZoomDisplay();
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

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+scroll = zoom (pinch on trackpad also sends ctrl+wheel)
      const delta = -e.deltaY * 0.005;
      const newZoom = this.app.renderer.camera.zoom * (1 + delta);
      this.app.renderer.setZoom(newZoom, e.clientX, e.clientY);
      this.app.updateZoomDisplay();
    } else if (e.shiftKey) {
      // Shift+scroll = horizontal pan
      this.app.renderer.pan(-e.deltaY, 0);
      this.app.renderer.markDirty();
    } else {
      // Normal scroll = pan vertically (trackpad 2-finger sends deltaX & deltaY)
      if (Math.abs(e.deltaX) > 0 || e.deltaMode === 0) {
        // Trackpad: pan in both directions
        this.app.renderer.pan(-e.deltaX, -e.deltaY);
        this.app.renderer.markDirty();
      } else {
        // Mouse wheel: zoom
        const delta = -e.deltaY * 0.001;
        const newZoom = this.app.renderer.camera.zoom * (1 + delta);
        this.app.renderer.setZoom(newZoom, e.clientX, e.clientY);
        this.app.updateZoomDisplay();
      }
    }
  }

  onKeyDown(e) {
    // Ignore if typing in input/textarea/contenteditable
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) {
      // Allow Ctrl shortcuts in contenteditable (formatting)
      if (e.target.isContentEditable && (e.ctrlKey || e.metaKey)) {
        // Let browser handle B/I/U in contenteditable; intercept Escape
        if (e.key === 'Escape') {
          e.target.blur();
          e.preventDefault();
        }
        return;
      }
      return;
    }

    // Space bar = temporary pan (not in text editing)
    if (e.key === ' ') {
      e.preventDefault();
      this.spaceDown = true;
      this.app.renderer.canvas.style.cursor = 'grab';
      return;
    }

    // Z key = temporary zoom mode
    if (e.key === 'z' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      this.zoomMode = true;
      this.app.renderer.canvas.style.cursor = 'zoom-in';
      return;
    }

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.app.redo();
        else this.app.undo();
        return;
      }
      if (e.key === 'y') { e.preventDefault(); this.app.redo(); return; }
      if (e.key === 'a') { e.preventDefault(); this.app.selectAll(); return; }
      if (e.key === 'c' && !e.shiftKey) { e.preventDefault(); this.app.copySelected(); return; }
      if (e.key === 'x') { e.preventDefault(); this.app.cutSelected(); return; }
      if (e.key === 'v' && !e.shiftKey) { e.preventDefault(); this.app.paste(); return; }
      if (e.key === 'g' && e.shiftKey) { e.preventDefault(); this.app.ungroupSelected(); return; }
      if (e.key === 'g') { e.preventDefault(); this.app.groupSelected(); return; }
      if (e.key === 'd') { e.preventDefault(); this.app.duplicateSelected(); return; }

      // Ctrl+F: Search & replace
      if (e.key === 'f') {
        e.preventDefault();
        this.app.toggleSearchPanel();
        return;
      }

      // Ctrl+0: Fit to screen
      if (e.key === '0') {
        e.preventDefault();
        this.app.ui.fitToScreen();
        return;
      }
      // Ctrl+1: Zoom 100%
      if (e.key === '1') {
        e.preventDefault();
        this.app.renderer.camera.zoom = 1;
        this.app.renderer.markDirty();
        this.app.updateZoomDisplay();
        return;
      }
      // Ctrl+= or Ctrl++: Zoom in
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        const z = this.app.renderer.camera.zoom * 1.2;
        this.app.renderer.setZoom(z);
        this.app.updateZoomDisplay();
        return;
      }
      // Ctrl+-: Zoom out
      if (e.key === '-') {
        e.preventDefault();
        const z = this.app.renderer.camera.zoom / 1.2;
        this.app.renderer.setZoom(z);
        this.app.updateZoomDisplay();
        return;
      }
      // Ctrl+Shift+H: Center on selection
      if (e.key === 'h' && e.shiftKey) {
        e.preventDefault();
        this.app.centerOnSelection();
        return;
      }

      return;
    }

    // Tool shortcuts
    // Remap: C=connector, O=circle (oval), N=sticky (new), S=sticky
    const toolMap = {
      v: 'select', h: 'hand', r: 'rect', o: 'circle', l: 'line',
      a: 'arrow', d: 'draw', s: 'sticky', n: 'sticky', t: 'text',
      e: 'eraser', f: 'frame', g: 'envelope', c: 'connector',
      k: 'connector', m: 'card', i: 'list'
    };

    const lower = e.key.toLowerCase();
    if (toolMap[lower]) {
      this.app.setTool(toolMap[lower]);
      return;
    }

    // Arrow key movement of selected elements
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      // In presentation mode, navigate anchors
      if (this.app.ui && this.app.ui.presentationActive) {
        e.preventDefault();
        if (e.key === 'ArrowRight') this.app.ui.presentationNavigate(1);
        else if (e.key === 'ArrowLeft') this.app.ui.presentationNavigate(-1);
        return;
      }
      if (this.app.renderer.selectedIds.size > 0) {
        e.preventDefault();
        const step = e.ctrlKey ? 100 : (e.shiftKey ? 10 : 1);
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        this.app.moveSelectedBy(dx, dy);
        return;
      }
    }

    // PageUp/PageDown for presentation mode
    if (e.key === 'PageDown') {
      if (this.app.ui && this.app.ui.presentationActive) {
        e.preventDefault();
        this.app.ui.presentationNavigate(1);
        return;
      }
    }
    if (e.key === 'PageUp') {
      if (this.app.ui && this.app.ui.presentationActive) {
        e.preventDefault();
        this.app.ui.presentationNavigate(-1);
        return;
      }
    }

    // Number keys 1-9 for direct anchor navigation in presentation mode
    if (this.app.ui && this.app.ui.presentationActive && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      this.app.ui.navigateToAnchor(parseInt(e.key) - 1);
      return;
    }

    // F5 or F: toggle presentation fullscreen
    if (e.key === 'F5') {
      e.preventDefault();
      if (this.app.ui && this.app.ui.presentationActive) {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      } else {
        this.app.ui.startPresentation();
      }
      return;
    }

    // Delete
    const tool = Tools[this.app.currentTool];
    if (tool && tool.onKeyDown) {
      tool.onKeyDown(this.app, e);
    }

    // Escape
    if (e.key === 'Escape') {
      // Close search panel if open
      if (this.app.searchPanel && this.app.searchPanel.style.display !== 'none') {
        this.app.closeSearchPanel();
        return;
      }
      // Exit presentation mode
      if (this.app.ui && this.app.ui.presentationActive) {
        this.app.ui.stopPresentation();
        return;
      }
      // Return to select tool and clear selection
      this.app.setTool('select');
      this.app.renderer.selectedIds.clear();
      this.app.renderer.previewElement = null;
      this.app.renderer.markDirty();
    }
  }

  onKeyUp(e) {
    if (e.key === ' ') {
      this.spaceDown = false;
      if (!this.zoomMode) {
        const tool = Tools[this.app.currentTool];
        this.app.renderer.canvas.style.cursor = tool ? tool.cursor : 'default';
      }
    }
    if (e.key === 'z' || e.key === 'Z') {
      this.zoomMode = false;
      if (!this.spaceDown) {
        const tool = Tools[this.app.currentTool];
        this.app.renderer.canvas.style.cursor = tool ? tool.cursor : 'default';
      }
    }
  }

  onContextMenu(e) {
    const world = this.getWorldPos(e);
    this.app.showContextMenu(e.clientX, e.clientY, world.x, world.y);
  }
}
