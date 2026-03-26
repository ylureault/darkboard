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
        }

        this.touchState.dist = d;
        this.touchState.center = center;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      // Apply pinch momentum when releasing a two-finger gesture
      if (e.touches.length < 2 && Math.abs(this.pinchVelocity) > 0.001) {
        const center = this.touchState.center;
        if (center) {
          this.applyPinchMomentum(this.pinchVelocity, center.x, center.y);
        }
      }
    }, { passive: true });
  }

  getWorldPos(e) {
    return this.app.renderer.screenToWorld(e.clientX, e.clientY);
  }

  onPointerDown(e) {
    if (e.button === 1) {
      // Middle click: paste at cursor position if clipboard has content, otherwise pan
      e.preventDefault();
      const world = this.getWorldPos(e);
      if (this.app.clipboard && this.app.clipboard.length > 0) {
        this.app.pasteAt(world.x, world.y);
        return;
      }
      // Fallback to pan
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
      // Default scroll = vertical pan (both mouse wheel and trackpad)
      this.app.renderer.pan(-e.deltaX, -e.deltaY);
      this.app.renderer.markDirty();
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
      if (e.key === 'd' && e.shiftKey) { e.preventDefault(); this.app.duplicateSelectedWithOffset(); return; }
      if (e.key === 'd') { e.preventDefault(); this.app.duplicateSelected(); return; }

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

      return;
    }

    // Tool shortcuts (match toolbar labels)
    const toolMap = {
      v: 'select', h: 'hand', r: 'rect', c: 'circle', o: 'circle',
      l: 'line', a: 'arrow', d: 'draw', s: 'sticky',
      t: 'text', e: 'eraser', f: 'frame', g: 'envelope',
      k: 'connector', m: 'card', i: 'list'
    };

    const lower = e.key.toLowerCase();

    // N key: toggle anchors panel
    if (lower === 'n') {
      if (this.app.workshop) this.app.workshop.toggleAnchorsPanel();
      return;
    }

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

    // F key: fullscreen toggle in presentation mode
    if (lower === 'f' && !e.ctrlKey && !e.metaKey && this.app.ui && this.app.ui.presentationActive) {
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
      return;
    }

    // F5: toggle presentation fullscreen
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

    // ? key: open help overlay
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      if (this.app.ui) {
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
        document.getElementById('laserBtn').click();
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
