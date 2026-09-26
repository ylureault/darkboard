// #198: input.js - Input handling for mouse, touch, and keyboard events.
// Manages pointer interactions, pinch zoom, keyboard shortcuts, context menus, and panning.
class InputHandler {
  constructor(app) {
    this.app = app;
    this.spaceDown = false;
    this.isPanning = false;
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.pointerDown = false;
    this.zoomMode = false; // Z key held

    // #R2-21: Pan velocity tracking for inertia
    this._panVelX = 0;
    this._panVelY = 0;
    this._panMomentumRaf = null;

    // Pinch zoom momentum
    this.pinchVelocity = 0;
    this.pinchMomentumRaf = null;

    // Double-tap detection for mobile
    this.lastTapTime = 0;
    this.lastTapX = 0;
    this.lastTapY = 0;

    // Right-click movement tracking
    this.pointerDownPos = null;

    this.bindEvents();
  }

  bindEvents() {
    const canvas = this.app.renderer.canvas;

    // Mouse events
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointerleave', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
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

    // Touch: pinch zoom with momentum
    this.touchState = { dist: 0, center: null, lastScale: 1, lastTime: 0 };
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        // Cancel any ongoing momentum
        if (this.pinchMomentumRaf) {
          cancelAnimationFrame(this.pinchMomentumRaf);
          this.pinchMomentumRaf = null;
        }
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        this.touchState.dist = d;
        this.touchState.center = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
        this.touchState.lastScale = 1;
        this.touchState.lastTime = Date.now();
        // #98 - Track initial angle for rotation
        this.touchState._startAngle = Math.atan2(
          e.touches[1].clientY - e.touches[0].clientY,
          e.touches[1].clientX - e.touches[0].clientX
        );
        this.touchState._totalRotation = 0;
        this.pinchVelocity = 0;
      }

      // Double-tap detection (single touch only)
      if (e.touches.length === 1) {
        const now = Date.now();
        const touch = e.touches[0];
        const dx = touch.clientX - this.lastTapX;
        const dy = touch.clientY - this.lastTapY;
        const dist = Math.hypot(dx, dy);

        if (now - this.lastTapTime < 300 && dist < 30) {
          // Double-tap detected
          e.preventDefault();
          const currentZoom = this.app.renderer.camera.zoom;
          const targetZoom = Math.abs(currentZoom - 1.5) < 0.1 ? 1.0 : 1.5;
          // Animate zoom to target
          this.animateZoomTo(targetZoom, touch.clientX, touch.clientY);
          this.lastTapTime = 0;
        } else {
          this.lastTapTime = now;
          this.lastTapX = touch.clientX;
          this.lastTapY = touch.clientY;
        }
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
          // Smooth the scale factor using interpolation
          const smoothScale = 1 + (scale - 1) * 0.8;
          const newZoom = this.app.renderer.camera.zoom * smoothScale;
          this.app.renderer.setZoom(newZoom, center.x, center.y);

          // Pan
          const dx = center.x - this.touchState.center.x;
          const dy = center.y - this.touchState.center.y;
          this.app.renderer.pan(dx, dy);

          // Track velocity for momentum
          const now = Date.now();
          const dt = now - this.touchState.lastTime;
          if (dt > 0) {
            this.pinchVelocity = (smoothScale - 1) / dt * 16; // velocity per frame
          }
          this.touchState.lastScale = smoothScale;
          this.touchState.lastTime = now;

          this.app.updateZoomDisplay();

          // #98 - Track rotation angle
          const currentAngle = Math.atan2(
            e.touches[1].clientY - e.touches[0].clientY,
            e.touches[1].clientX - e.touches[0].clientX
          );
          if (this.touchState._startAngle !== undefined) {
            this.touchState._totalRotation = (currentAngle - this.touchState._startAngle) * 180 / Math.PI;
          }
        }

        this.touchState.dist = d;
        this.touchState.center = center;
      }
    }, { passive: false });

    // #98 - Track touch rotation angle for pinch-to-rotate
    canvas.addEventListener('touchend', (e) => {
      // Apply pinch momentum when releasing a two-finger gesture
      if (e.touches.length < 2 && Math.abs(this.pinchVelocity) > 0.001) {
        const center = this.touchState.center;
        if (center) {
          this.applyPinchMomentum(this.pinchVelocity, center.x, center.y);
        }
      }
      // #98 - Apply rotation if significant angle change detected during pinch
      if (e.touches.length < 2 && this.touchState._totalRotation &&
          Math.abs(this.touchState._totalRotation) > 15 && this.app.renderer.selectedIds.size > 0) {
        const angle = Math.round(this.touchState._totalRotation / 15) * 15;
        for (const id of this.app.renderer.selectedIds) {
          const el = this.app.renderer.elements.get(id);
          if (el && !el.locked) el.rotation = (el.rotation || 0) + angle;
        }
        this.app.renderer.markDirty();
      }
      this.touchState._totalRotation = 0;
    }, { passive: true });
  }

  getWorldPos(e) {
    return this.app.renderer.screenToWorld(e.clientX, e.clientY);
  }

  onPointerDown(e) {
    if (e.button === 1) {
      // #R2-10: Middle-click drag for pan (always pan, not paste)
      e.preventDefault();
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.app.renderer.canvas.style.cursor = 'grabbing';
      return;
    }

    if (this.spaceDown && e.button === 0) {
      // Space+click: pan
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.app.renderer.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button === 2) {
      // Right click: track for pan vs context menu distinction
      this.rightClickStart = { x: e.clientX, y: e.clientY };
      this.rightClickMoved = false;
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
    this.isDragging = true;

    const world = this.getWorldPos(e);
    const tool = Tools[this.app.currentTool];
    if (tool && tool.onPointerDown) {
      tool.onPointerDown(this.app, world.x, world.y, e);
    }
  }

  onPointerMove(e) {
    // Send cursor position and track last mouse position (#86, #109)
    const world = this.getWorldPos(e);
    this.app._lastMouseWorld = { x: world.x, y: world.y };
    this.app.renderer._lastMouseScreen = { x: e.clientX, y: e.clientY };
    this.app.sync.sendCursor(world.x, world.y);

    if (this.isPanning) {
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      // #R2-21: Track velocity for pan inertia
      this._panVelX = dx * 0.6 + this._panVelX * 0.4;
      this._panVelY = dy * 0.6 + this._panVelY * 0.4;
      // Track if right-click moved beyond 5px threshold
      if (this.rightClickStart) {
        const totalDx = e.clientX - this.rightClickStart.x;
        const totalDy = e.clientY - this.rightClickStart.y;
        if (Math.hypot(totalDx, totalDy) > 5) {
          this.rightClickMoved = true;
        }
      }
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
    // Always drop the drag flag, whatever path we take out of here — leaving it
    // set strands edge auto-scroll in an "always dragging" state.
    this.isDragging = false;
    if (this.isPanning) {
      this.isPanning = false;
      const tool = Tools[this.app.currentTool];
      this.app.renderer.canvas.style.cursor = tool ? tool.cursor : 'default';
      // If right-click didn't move > 5px, it was a short click — context menu already handled
      if (this.rightClickStart) {
        if (this.rightClickMoved) {
          // Panned with right-click — suppress context menu
          this.suppressContextMenu = true;
        }
        this.rightClickStart = null;
        this.rightClickMoved = false;
      }
      // #R2-21: Apply pan momentum/inertia after releasing pan
      if (Math.abs(this._panVelX) > 1 || Math.abs(this._panVelY) > 1) {
        if (this._panMomentumRaf) cancelAnimationFrame(this._panMomentumRaf);
        const decay = 0.92;
        const self = this;
        const step = () => {
          self._panVelX *= decay;
          self._panVelY *= decay;
          if (Math.abs(self._panVelX) < 0.5 && Math.abs(self._panVelY) < 0.5) {
            self._panMomentumRaf = null;
            return;
          }
          self.app.renderer.pan(self._panVelX, self._panVelY);
          self.app.renderer.markDirty();
          self._panMomentumRaf = requestAnimationFrame(step);
        };
        this._panMomentumRaf = requestAnimationFrame(step);
      }
      this._panVelX = 0;
      this._panVelY = 0;
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

    // Detect trackpad vs mouse wheel: trackpad sends small deltaY with deltaMode 0
    const isTrackpad = e.deltaMode === 0 && Math.abs(e.deltaY) < 50 && !e.ctrlKey && !e.metaKey;

    if (isTrackpad && !e.ctrlKey && !e.metaKey) {
      // Trackpad: two-finger scroll = pan, pinch = zoom (browser sends ctrlKey with pinch)
      if (e.shiftKey) {
        this.app.renderer.pan(-e.deltaY, 0);
      } else {
        this.app.renderer.pan(-e.deltaX, -e.deltaY);
      }
      this.app.renderer.markDirty();
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd + scroll OR trackpad pinch (browser sends ctrlKey) = zoom
      const delta = -e.deltaY * 0.01;
      const targetZoom = clamp(this.app.renderer.camera.zoom * (1 + delta), 0.1, 5);
      this.app.renderer.setZoom(targetZoom, e.clientX, e.clientY);
      this.app.updateZoomDisplay();
    } else {
      // Mouse wheel (no modifier) = zoom centered on cursor
      const delta = -e.deltaY * 0.003;
      const targetZoom = clamp(this.app.renderer.camera.zoom * (1 + delta), 0.1, 5);
      // Smooth animated zoom for mouse wheel
      if (this._wheelZoomRaf) cancelAnimationFrame(this._wheelZoomRaf);
      const startZoom = this.app.renderer.camera.zoom;
      const cx = e.clientX, cy = e.clientY;
      const startTime = performance.now();
      const duration = 120;
      const app = this.app;
      const self = this;
      const step = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        const ease = 1 - Math.pow(1 - t, 2);
        const z = startZoom + (targetZoom - startZoom) * ease;
        app.renderer.setZoom(z, cx, cy);
        app.updateZoomDisplay();
        if (t < 1) self._wheelZoomRaf = requestAnimationFrame(step);
        else self._wheelZoomRaf = null;
      };
      this._wheelZoomRaf = requestAnimationFrame(step);
    }
  }

  onKeyDown(e) {
    // Ignore if typing in input/textarea/contenteditable
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) {
      // Allow Ctrl shortcuts in contenteditable (formatting)
      if (e.target.isContentEditable && (e.ctrlKey || e.metaKey)) {
        if (e.key === 'Escape') {
          e.target.blur();
          e.preventDefault();
          return;
        }
        // Ctrl+Shift+X: strikethrough
        if (e.shiftKey && (e.key === 'x' || e.key === 'X')) {
          e.preventDefault();
          document.execCommand('strikeThrough', false, null);
          return;
        }
        // Ctrl+Shift+E: center align
        if (e.shiftKey && (e.key === 'e' || e.key === 'E')) {
          e.preventDefault();
          document.execCommand('justifyCenter', false, null);
          return;
        }
        // Ctrl+Shift+>: increase font size
        if (e.shiftKey && e.key === '>') {
          e.preventDefault();
          const current = document.queryCommandValue('fontSize') || '3';
          const next = Math.min(7, parseInt(current) + 1);
          document.execCommand('fontSize', false, String(next));
          return;
        }
        // Ctrl+Shift+<: decrease font size
        if (e.shiftKey && e.key === '<') {
          e.preventDefault();
          const current = document.queryCommandValue('fontSize') || '3';
          const next = Math.max(1, parseInt(current) - 1);
          document.execCommand('fontSize', false, String(next));
          return;
        }
        // Ctrl+\: remove formatting
        if (e.key === '\\') {
          e.preventDefault();
          document.execCommand('removeFormat', false, null);
          return;
        }
        // Let browser handle B/I/U and other Ctrl shortcuts
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
      // #82 - Ctrl+Shift+D = duplicate in place (offset 0,0)
      if (e.key === 'd' && e.shiftKey) { e.preventDefault(); this.app.duplicateSelectedInPlace(); return; }
      if (e.key === 'd') { e.preventDefault(); this.app.duplicateSelected(); return; }

      // #88 - Ctrl+Shift+L: lock/unlock selected elements
      if (e.key === 'l' && e.shiftKey) { e.preventDefault(); this.app.toggleLockSelected(); return; }
      if (e.key === 'L' && e.shiftKey) { e.preventDefault(); this.app.toggleLockSelected(); return; }

      // #96 - Ctrl+Shift+A: deselect all
      if (e.key === 'a' && e.shiftKey) { e.preventDefault(); this.app.renderer.selectedIds.clear(); this.app.renderer.markDirty(); return; }
      if (e.key === 'A' && e.shiftKey) { e.preventDefault(); this.app.renderer.selectedIds.clear(); this.app.renderer.markDirty(); return; }

      // Ctrl+F: Search & replace
      if (e.key === 'f') {
        e.preventDefault();
        this.app.toggleSearchPanel();
        return;
      }

      // Ctrl+Shift+0: Zoom to fit selected elements
      if (e.key === '0' && e.shiftKey) {
        e.preventDefault();
        this.app.zoomToSelection();
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

      // #R2-33: Ctrl+L to lock/unlock selected
      if (e.key === 'l' && !e.shiftKey) {
        e.preventDefault();
        this.app.toggleLockSelected();
        return;
      }

      // #R2-34: Ctrl+] to bring forward, Ctrl+[ to send backward
      if (e.key === ']' && !e.shiftKey) {
        e.preventDefault();
        this.app.bringForward();
        return;
      }
      if (e.key === '[' && !e.shiftKey) {
        e.preventDefault();
        this.app.sendBackward();
        return;
      }

      // #R2-35: Ctrl+Shift+] bring to front, Ctrl+Shift+[ send to back
      if (e.key === ']' && e.shiftKey) {
        e.preventDefault();
        this.app.bringToFront();
        return;
      }
      if (e.key === '[' && e.shiftKey) {
        e.preventDefault();
        this.app.sendToBack();
        return;
      }

      // #R2-36: Ctrl+Shift+C copy style, Ctrl+Shift+V paste style
      if (e.key === 'c' && e.shiftKey) {
        e.preventDefault();
        this.app.copyStyle();
        return;
      }
      if (e.key === 'v' && e.shiftKey) {
        e.preventDefault();
        this.app.pasteStyle();
        return;
      }

      // #R2-37: Ctrl+E to export as PNG
      if (e.key === 'e' && !e.shiftKey) {
        e.preventDefault();
        this.app.exportAsPNG();
        return;
      }

      // #R2-38: Ctrl+Shift+E to export as SVG (stub)
      if (e.key === 'e' && e.shiftKey) {
        e.preventDefault();
        this.app.showToast('Export SVG : fonctionnalité à venir', 'info');
        return;
      }

      return;
    }

    // #148 - Home key: center on board
    if (e.key === 'Home') {
      e.preventDefault();
      if (this.app.centerOnBoard) this.app.centerOnBoard();
      return;
    }

    // Tool shortcuts (match toolbar labels)
    const toolMap = {
      v: 'select', h: 'hand', r: 'rect', c: 'circle', o: 'circle',
      l: 'line', a: 'arrow', d: 'draw', s: 'sticky',
      t: 'text', e: 'eraser', f: 'frame', g: 'envelope',
      k: 'connector', m: 'card', i: 'list',
      w: 'mindmap'
    };

    const lower = e.key.toLowerCase();

    // N key: toggle anchors panel
    if (lower === 'n') {
      if (this.app.workshop) this.app.workshop.toggleAnchorsPanel();
      return;
    }

    // In presentation mode, handle navigation keys and skip tool shortcuts
    if (this.app.ui && this.app.ui.presentationActive) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        this.app.ui.presentationNavigate(1);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        this.app.ui.presentationNavigate(-1);
        return;
      }
      if (lower === 'f' && !e.ctrlKey && !e.metaKey) {
        // Toggle fullscreen in presentation mode
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
        return;
      }
      if (e.key === 'Escape') {
        this.app.ui.stopPresentation();
        return;
      }
      // Number keys for direct anchor navigation
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        const anchors = this.app.workshop ? [...this.app.workshop.anchors.values()] : [];
        // Only commit the index if that slide exists, otherwise presentationIndex
        // points past the end and the next arrow press jumps to the last slide.
        if (idx < anchors.length) {
          this.app.ui.presentationIndex = idx;
          this.app.ui.navigateToAnchor(idx);
        }
        return;
      }
      return; // Ignore all other keys during presentation
    }

    // #R2-39: F2 to rename/edit text of selected element
    if (e.key === 'F2') {
      e.preventDefault();
      if (this.app.renderer.selectedIds.size === 1) {
        const selId = [...this.app.renderer.selectedIds][0];
        const selEl = this.app.renderer.elements.get(selId);
        if (selEl) this.app.startTextEdit(selEl);
      }
      return;
    }

    // #R2-5: Tab cycles through elements (forward), Shift+Tab (backward)
    if (e.key === 'Tab' && this.app.currentTool === 'select') {
      // Only cycle when not in mindmap tool (mindmap uses Tab for child creation)
      e.preventDefault();
      this.app.cycleSelection(e.shiftKey ? -1 : 1);
      return;
    }

    if (toolMap[lower]) {
      this.app.setTool(toolMap[lower]);
      return;
    }

    // Arrow key movement of selected elements
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
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
    // (Presentation mode keys are handled above, before toolMap)

    // F5: toggle presentation fullscreen
    if (e.key === 'F5') {
      e.preventDefault();
      if (this.app.ui && this.app.ui.presentationActive) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      } else if (this.app.ui) {
        this.app.ui.startPresentation();
      }
      return;
    }

    // Delete
    const tool = Tools[this.app.currentTool];
    if (tool && tool.onKeyDown) {
      tool.onKeyDown(this.app, e);
    }

    // ? key: open cheat sheet (#R2-176) or help overlay
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      // #R2-176: Show cheat sheet if available, fall back to help overlay
      var existing = document.querySelector('.cheat-sheet-overlay');
      if (existing) { existing.remove(); return; }
      if (this.app.showCheatSheet) {
        this.app.showCheatSheet();
      } else if (this.app.ui) {
        const helpOverlay = document.getElementById('helpOverlay');
        if (helpOverlay && helpOverlay.style.display !== 'none') {
          this.app.ui.hideHelp();
        } else {
          this.app.ui.showHelp();
        }
      }
      return;
    }

    // Escape — close everything in priority order
    if (e.key === 'Escape') {
      // Close formatting toolbar
      if (this.app.formattingToolbar) {
        this.app.hideFormattingToolbar();
        return;
      }
      // Close any color picker
      const colorPicker = document.querySelector('.fmt-color-picker');
      if (colorPicker) { colorPicker.remove(); return; }
      // Close users dropdown
      const usersDropdown = document.querySelector('.users-dropdown');
      if (usersDropdown) { usersDropdown.remove(); return; }
      // Close help overlay
      const helpOverlay = document.getElementById('helpOverlay');
      if (helpOverlay && helpOverlay.style.display !== 'none') {
        this.app.ui.hideHelp();
        return;
      }
      // Close any confirm/comment overlays
      const confirmOverlay = document.querySelector('.confirm-overlay');
      if (confirmOverlay) { confirmOverlay.remove(); return; }
      // Close card/list editor panel
      const cardEditor = document.querySelector('.card-editor-panel');
      if (cardEditor) { cardEditor.remove(); return; }
      // Close context menu
      if (this.app.contextMenu) { this.app.hideContextMenu(); return; }
      // Close search panel if open
      if (this.app.searchPanel && this.app.searchPanel.style.display !== 'none') {
        this.app.closeSearchPanel();
        return;
      }
      // Close anchors panel
      const anchorsPanel = document.getElementById('anchorsPanel');
      if (anchorsPanel && anchorsPanel.style.display !== 'none') {
        anchorsPanel.style.display = 'none';
        return;
      }
      // Close template modal
      const templateModal = document.getElementById('templateModal');
      if (templateModal && templateModal.style.display !== 'none') {
        templateModal.style.display = 'none';
        return;
      }
      // Close name dialog
      const nameDialog = document.getElementById('nameDialog');
      if (nameDialog && nameDialog.style.display === 'flex' && this.app._joined) {
        nameDialog.style.display = 'none';
        return;
      }
      // Close board not found dialog
      const notFoundDialog = document.getElementById('boardNotFoundDialog');
      if (notFoundDialog && notFoundDialog.style.display === 'flex') {
        notFoundDialog.style.display = 'none';
        return;
      }
      // Exit presentation mode
      if (this.app.ui && this.app.ui.presentationActive) {
        this.app.ui.stopPresentation();
        return;
      }
      // Deactivate laser
      if (this.app.ui && this.app.ui.laserActive) {
        const laserBtn = document.getElementById('laserBtn');
        if (laserBtn) laserBtn.click();
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

  applyPinchMomentum(velocity, cx, cy) {
    if (this.pinchMomentumRaf) cancelAnimationFrame(this.pinchMomentumRaf);
    const decay = 0.92;
    const threshold = 0.0005;
    let vel = velocity;

    const step = () => {
      vel *= decay;
      if (Math.abs(vel) < threshold) {
        this.pinchMomentumRaf = null;
        return;
      }
      const scale = 1 + vel;
      const newZoom = this.app.renderer.camera.zoom * scale;
      this.app.renderer.setZoom(newZoom, cx, cy);
      this.app.updateZoomDisplay();
      this.pinchMomentumRaf = requestAnimationFrame(step);
    };
    this.pinchMomentumRaf = requestAnimationFrame(step);
  }

  animateZoomTo(targetZoom, cx, cy) {
    const startZoom = this.app.renderer.camera.zoom;
    const duration = 250;
    const startTime = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      const zoom = startZoom + (targetZoom - startZoom) * ease;
      this.app.renderer.setZoom(zoom, cx, cy);
      this.app.updateZoomDisplay();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  onContextMenu(e) {
    // Suppress context menu if we just panned with right-click
    if (this.suppressContextMenu) {
      this.suppressContextMenu = false;
      return;
    }
    const world = this.getWorldPos(e);
    this.app.showContextMenu(e.clientX, e.clientY, world.x, world.y);
  }
}
