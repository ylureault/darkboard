// Tool implementations
const Tools = {
  select: {
    name: 'select',
    cursor: 'default',
    dragStart: null,
    dragType: null, // 'move' | 'resize' | 'marquee' | 'rotate' | 'alt-duplicate'
    resizeHandle: null,
    originalElements: null,
    rotationCenter: null,
    altDuplicated: false, // track if alt+drag already created duplicates
    autoScrollTimer: null,

    // Auto-scroll when dragging near edges
    startAutoScroll(app, screenX, screenY) {
      const margin = 50;
      const maxSpeed = 15;
      const w = window.innerWidth;
      const h = window.innerHeight;
      let dx = 0, dy = 0;
      if (screenX < margin) dx = maxSpeed * ((margin - screenX) / margin);
      if (screenX > w - margin) dx = -maxSpeed * ((screenX - (w - margin)) / margin);
      if (screenY < margin + 60) dy = maxSpeed * ((margin + 60 - screenY) / margin); // offset for toolbar
      if (screenY > h - margin) dy = -maxSpeed * ((screenY - (h - margin)) / margin);

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        app.renderer.pan(dx, dy);
        app.renderer.markDirty();
      }
    },

    onPointerDown(app, worldX, worldY, e) {
      // Check comment bubble click
      const commentHit = app.renderer.hitTestComment(worldX, worldY);
      if (commentHit) {
        app.showCommentModal(commentHit.x, commentHit.y, commentHit.elementId);
        return;
      }

      // Check minimap click
      const mmHit = app.renderer.hitTestMinimap(e.clientX, e.clientY);
      if (mmHit) {
        app.renderer.camera.x = mmHit.worldX;
        app.renderer.camera.y = mmHit.worldY;
        app.renderer.markDirty();
        app.updateZoomDisplay();
        return;
      }

      // Check anchor point drag → start connector creation
      const anchorHit = app.renderer.hitTestAnchor(worldX, worldY);
      if (anchorHit) {
        this.dragType = 'anchor-connect';
        this._connectorSourceId = anchorHit.elementId;
        this._connectorStartAnchor = anchorHit;
        app.renderer.previewElement = createElement('connector', {
          x: anchorHit.x, y: anchorHit.y, x2: worldX, y2: worldY,
          stroke: app.currentStroke, strokeWidth: app.currentStrokeWidth,
          connectorStyle: 'arrow'
        });
        app.renderer.markDirty();
        return;
      }

      // Check resize/rotation handles first
      const handleHit = app.renderer.hitTestHandle(worldX, worldY);
      if (handleHit) {
        const el = app.renderer.elements.get(handleHit.elementId);
        if (el && el.locked) return; // Don't resize/rotate locked elements

        if (handleHit.handle === 'rotate') {
          this.dragType = 'rotate';
          const bounds = getElementBounds(el);
          this.rotationCenter = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
          this.dragStart = { x: worldX, y: worldY };
          this.originalElements = new Map();
          this.originalElements.set(el.id, deepClone(el));
          return;
        }

        this.dragType = 'resize';
        this.resizeHandle = handleHit;
        this.dragStart = { x: worldX, y: worldY };
        this.originalElements = new Map();
        this.originalElements.set(el.id, deepClone(el));
        return;
      }

      // Handle vote click during voting
      if (app.handleVoteClick(worldX, worldY)) return;

      const hit = app.renderer.hitTest(worldX, worldY);

      if (hit) {
        // Check if locked
        if (hit.locked && !e.shiftKey) {
          app.renderer.selectedIds.clear();
          app.renderer.selectedIds.add(hit.id);
          app.renderer.markDirty();
          return; // Don't start move on locked elements
        }

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

        // Check if ALL selected elements are locked
        let allLocked = true;
        for (const id of app.renderer.selectedIds) {
          const el2 = app.renderer.elements.get(id);
          if (el2 && !el2.locked) { allLocked = false; break; }
        }
        if (allLocked) {
          app.renderer.markDirty();
          return;
        }

        // Auto-select group members
        if (hit.groupId && !e.shiftKey) {
          app.selectGroup(hit.id);
        }

        this.dragType = 'move';
        this.dragStart = { x: worldX, y: worldY };

        // Store original positions (exclude locked)
        this.originalElements = new Map();
        for (const id of app.renderer.selectedIds) {
          const el = app.renderer.elements.get(id);
          if (el && !el.locked) this.originalElements.set(id, deepClone(el));
        }

        // Pre-compute frame children for drag (before positions change)
        this.frameChildren = new Map();
        for (const [id, orig] of this.originalElements) {
          if (orig.type === 'frame') {
            this.frameChildren.set(id, app.getFrameChildren(id));
          }
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
      // Handle anchor-connect drag (creating connector from anchor point)
      if (this.dragType === 'anchor-connect') {
        if (!app.renderer.previewElement) return;
        const hit = app.renderer.hitTest(worldX, worldY);
        if (hit && hit.type !== 'connector' && hit.id !== this._connectorSourceId) {
          const anchors = getAnchorPoints(hit);
          let best = anchors[0], bestDist = Infinity;
          for (const a of anchors) {
            const d = Math.hypot(a.x - worldX, a.y - worldY);
            if (d < bestDist) { bestDist = d; best = a; }
          }
          app.renderer.previewElement.x2 = best.x;
          app.renderer.previewElement.y2 = best.y;
          app.renderer.connectorSnapTarget = hit.id;
        } else {
          app.renderer.previewElement.x2 = worldX;
          app.renderer.previewElement.y2 = worldY;
          app.renderer.connectorSnapTarget = null;
        }
        app.renderer.canvas.style.cursor = 'crosshair';
        app.renderer.markDirty();
        return;
      }

      if (!this.dragStart) {
        // Hover cursor: contextual based on what's under the pointer
        const anchorHit = app.renderer.hitTestAnchor(worldX, worldY);
        if (anchorHit) {
          app.renderer._hoveredAnchor = anchorHit;
          app.renderer.canvas.style.cursor = 'crosshair';
          app.renderer.markDirty();
          return;
        }
        app.renderer._hoveredAnchor = null;

        const handleHit = app.renderer.hitTestHandle(worldX, worldY);
        if (handleHit) {
          const cursors = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rotate: 'grab' };
          app.renderer.canvas.style.cursor = cursors[handleHit.handle] || 'default';
        } else {
          const hit = app.renderer.hitTest(worldX, worldY);
          // Track hovered element for anchor display
          const newHoverId = hit ? hit.id : null;
          if (newHoverId !== app.renderer._hoveredElementId) {
            app.renderer._hoveredElementId = newHoverId;
            app.renderer.markDirty();
          }
          if (hit) {
            app.renderer.canvas.style.cursor = hit.locked ? 'not-allowed' : 'move';
          } else {
            app.renderer.canvas.style.cursor = 'default';
          }
        }
        return;
      }

      const dx = worldX - this.dragStart.x;
      const dy = worldY - this.dragStart.y;

      // Auto-scroll at screen edges
      const screen = app.renderer.worldToScreen(worldX, worldY);
      this.startAutoScroll(app, screen.x, screen.y);

      if (this.dragType === 'rotate') {
        if (this.rotationCenter) {
          const startAngle = Math.atan2(this.dragStart.y - this.rotationCenter.y, this.dragStart.x - this.rotationCenter.x);
          const currentAngle = Math.atan2(worldY - this.rotationCenter.y, worldX - this.rotationCenter.x);
          let delta = (currentAngle - startAngle) * 180 / Math.PI;
          if (e.shiftKey) {
            delta = Math.round(delta / 45) * 45;
          }
          for (const [id, orig] of this.originalElements) {
            const el = app.renderer.elements.get(id);
            if (el) el.rotation = (orig.rotation || 0) + delta;
          }
        }
      } else if (this.dragType === 'move') {
        // Alt+drag = duplicate (create copies on first move)
        if (e.altKey && !this.altDuplicated && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          this.altDuplicated = true;
          // Create duplicates, keep originals in place
          const newSelected = new Set();
          const newOriginals = new Map();
          for (const [id, orig] of this.originalElements) {
            const clone = deepClone(orig);
            clone.id = generateId();
            clone.zIndex = Date.now();
            app.addElement(clone);
            newSelected.add(clone.id);
            newOriginals.set(clone.id, deepClone(clone));
            // Restore original element to its position
            const origEl = app.renderer.elements.get(id);
            if (origEl) {
              origEl.x = orig.x;
              origEl.y = orig.y;
              if (origEl.x2 !== undefined) { origEl.x2 = orig.x2; origEl.y2 = orig.y2; }
              if (origEl.points) origEl.points = orig.points.map(p => ({ ...p }));
            }
          }
          app.renderer.selectedIds = newSelected;
          this.originalElements = newOriginals;
        }

        // Snap to grid if enabled
        let snapDx = dx, snapDy = dy;
        if (app.renderer.snapToGrid && !e.altKey) {
          const firstOrig = this.originalElements.values().next().value;
          if (firstOrig) {
            const snapped = app.renderer.snapPosition(firstOrig.x + dx, firstOrig.y + dy);
            snapDx = snapped.x - firstOrig.x;
            snapDy = snapped.y - firstOrig.y;
          }
          // Show snap feedback indicator
          app.showSnapIndicator();
        } else {
          app.hideSnapIndicator();
        }

        // Compute alignment guides (Ctrl disables snap)
        app.renderer.alignmentGuides = [];
        if (this.originalElements.size === 1 && !app.renderer.snapToGrid && !e.ctrlKey) {
          const firstOrig = this.originalElements.values().next().value;
          if (firstOrig) {
            const movedBounds = {
              x: firstOrig.x + snapDx,
              y: firstOrig.y + snapDy,
              w: firstOrig.width || 0,
              h: firstOrig.height || 0
            };
            const movedCX = movedBounds.x + movedBounds.w / 2;
            const movedCY = movedBounds.y + movedBounds.h / 2;
            const threshold = 6 / app.renderer.camera.zoom;
            const movingId = this.originalElements.keys().next().value;

            for (const [id, el] of app.renderer.elements) {
              if (id === movingId || el.hidden) continue;
              const b = getElementBounds(el);
              const cx = b.x + b.w / 2;
              const cy = b.y + b.h / 2;

              // Horizontal alignment guides
              if (Math.abs(movedBounds.y - b.y) < threshold) {
                app.renderer.alignmentGuides.push({ type: 'h', y: b.y });
                snapDy = b.y - firstOrig.y;
              } else if (Math.abs((movedBounds.y + movedBounds.h) - (b.y + b.h)) < threshold) {
                app.renderer.alignmentGuides.push({ type: 'h', y: b.y + b.h });
                snapDy = (b.y + b.h - movedBounds.h) - firstOrig.y;
              } else if (Math.abs(movedCY - cy) < threshold) {
                app.renderer.alignmentGuides.push({ type: 'h', y: cy });
                snapDy = (cy - movedBounds.h / 2) - firstOrig.y;
              }

              // Vertical alignment guides
              if (Math.abs(movedBounds.x - b.x) < threshold) {
                app.renderer.alignmentGuides.push({ type: 'v', x: b.x });
                snapDx = b.x - firstOrig.x;
              } else if (Math.abs((movedBounds.x + movedBounds.w) - (b.x + b.w)) < threshold) {
                app.renderer.alignmentGuides.push({ type: 'v', x: b.x + b.w });
                snapDx = (b.x + b.w - movedBounds.w) - firstOrig.x;
              } else if (Math.abs(movedCX - cx) < threshold) {
                app.renderer.alignmentGuides.push({ type: 'v', x: cx });
                snapDx = (cx - movedBounds.w / 2) - firstOrig.x;
              }
            }
          }
        }

        for (const [id, orig] of this.originalElements) {
          const el = app.renderer.elements.get(id);
          if (!el) continue;
          el.x = orig.x + snapDx;
          el.y = orig.y + snapDy;
          if (el.x2 !== undefined) {
            el.x2 = orig.x2 + snapDx;
            el.y2 = orig.y2 + snapDy;
          }
          if (el.points) {
            el.points = orig.points.map(p => ({ x: p.x + snapDx, y: p.y + snapDy }));
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
      // Clear alignment guides
      app.renderer.alignmentGuides = [];

      // Handle anchor-connect: finalize connector creation
      if (this.dragType === 'anchor-connect') {
        const targetHit = app.renderer.hitTest(worldX, worldY);
        const targetId = (targetHit && targetHit.type !== 'connector' && targetHit.id !== this._connectorSourceId) ? targetHit.id : null;
        const sourceId = this._connectorSourceId;

        // Only create if we actually connected to a different element or dragged far enough
        const preview = app.renderer.previewElement;
        const dist = preview ? Math.hypot(preview.x2 - preview.x, preview.y2 - preview.y) : 0;
        if (dist > 20) {
          const el = createConnector(sourceId, targetId, 'arrow');
          el.stroke = app.currentStroke;
          el.strokeWidth = app.currentStrokeWidth;
          if (sourceId && targetId) {
            const srcEl = app.renderer.elements.get(sourceId);
            const tgtEl = app.renderer.elements.get(targetId);
            if (srcEl && tgtEl) {
              const best = getBestAnchors(srcEl, tgtEl);
              el.x = best.src.x; el.y = best.src.y;
              el.x2 = best.tgt.x; el.y2 = best.tgt.y;
            }
          } else if (preview) {
            el.x = preview.x; el.y = preview.y;
            el.x2 = preview.x2; el.y2 = preview.y2;
          }
          app.addElement(el);
          app.renderer.selectedIds.clear();
          app.renderer.selectedIds.add(el.id);
        }
        app.renderer.previewElement = null;
        app.renderer.connectorSnapTarget = null;
        this.dragType = null;
        this._connectorSourceId = null;
        this._connectorStartAnchor = null;
        app.renderer.markDirty();
        return;
      }

      if (this.dragType === 'rotate' && this.dragStart) {
        for (const [id, orig] of this.originalElements) {
          const el = app.renderer.elements.get(id);
          if (el) {
            const ops = [{ type: 'update', elementId: id, props: { rotation: el.rotation } }];
            const inverseOps = [{ type: 'update', elementId: id, props: { rotation: orig.rotation || 0 } }];
            app.history.push(ops, inverseOps);
            app.sync.sendOps(ops);
          }
        }
        this.dragStart = null;
        this.dragType = null;
        this.rotationCenter = null;
        this.originalElements = null;
        this.altDuplicated = false;
        app.renderer.markDirty();
        return;
      }

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

          // Envelope/Frame: move children with container
          for (const [id] of this.originalElements) {
            const el = app.renderer.elements.get(id);
            if (el && el.type === 'envelope') {
              app.moveEnvelopeWithChildren(id, dx, dy);
            } else if (el && el.type === 'frame') {
              const precomputed = this.frameChildren && this.frameChildren.get(id);
              app.moveFrameWithChildren(id, dx, dy, precomputed);
            }
          }

          // Update connectors attached to moved elements
          app.updateConnectors(this.originalElements);

          // Envelope: check if moved elements landed in/out of envelopes
          app.updateEnvelopeContainment(this.originalElements);
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
      this.altDuplicated = false;
      app.renderer.markDirty();
      if (app.updateUrlHash) app.updateUrlHash();
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
      if (hit && (hit.type === 'sticky' || hit.type === 'text' || hit.type === 'rect' || hit.type === 'circle' || hit.type === 'frame' || hit.type === 'envelope' || hit.type === 'diamond' || hit.type === 'triangle' || hit.type === 'card' || hit.type === 'list' || hit.type === 'connector')) {
        app.startTextEdit(hit);
      } else if (!hit) {
        // Double-click on empty canvas creates a sticky
        const el = createSticky(worldX - 100, worldY - 100);
        // Use cycling color instead of random
        el.fill = app.getNextStickyColor();
        app.lastStickyColor = el.fill;
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

    constrainAngle(sx, sy, ex, ey, constrain) {
      if (!constrain) return { x: ex, y: ey };
      const dx = ex - sx;
      const dy = ey - sy;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      return { x: sx + len * Math.cos(snap), y: sy + len * Math.sin(snap) };
    },

    onPointerDown(app, worldX, worldY) {
      this.startPoint = { x: worldX, y: worldY };
      app.renderer.previewElement = createElement('line', {
        x: worldX, y: worldY, x2: worldX, y2: worldY,
        stroke: app.currentStroke, strokeWidth: app.currentStrokeWidth
      });
    },

    onPointerMove(app, worldX, worldY, e) {
      if (!this.startPoint) return;
      const end = this.constrainAngle(this.startPoint.x, this.startPoint.y, worldX, worldY, e.shiftKey);
      app.renderer.previewElement.x2 = end.x;
      app.renderer.previewElement.y2 = end.y;
      app.renderer.markDirty();
    },

    onPointerUp(app, worldX, worldY, e) {
      if (!this.startPoint) return;
      const end = this.constrainAngle(this.startPoint.x, this.startPoint.y, worldX, worldY, e.shiftKey);
      const el = createElement('line', {
        x: this.startPoint.x, y: this.startPoint.y,
        x2: end.x, y2: end.y,
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

    onPointerMove(app, worldX, worldY, e) {
      if (!this.startPoint) return;
      const end = Tools.line.constrainAngle(this.startPoint.x, this.startPoint.y, worldX, worldY, e.shiftKey);
      app.renderer.previewElement.x2 = end.x;
      app.renderer.previewElement.y2 = end.y;
      app.renderer.markDirty();
    },

    onPointerUp(app, worldX, worldY, e) {
      if (!this.startPoint) return;
      const end = Tools.line.constrainAngle(this.startPoint.x, this.startPoint.y, worldX, worldY, e.shiftKey);
      const el = createElement('arrow', {
        x: this.startPoint.x, y: this.startPoint.y,
        x2: end.x, y2: end.y,
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
    startPoint: null,
    dragged: false,

    onPointerDown(app, worldX, worldY) {
      if (app.renderer.snapToGrid) {
        const snapped = app.renderer.snapPosition(worldX, worldY);
        worldX = snapped.x;
        worldY = snapped.y;
      }
      this.startPoint = { x: worldX, y: worldY };
      this.dragged = false;
      // Show a preview element while dragging
      const color = app.lastStickyColor || STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
      app.renderer.previewElement = createElement('sticky', {
        x: worldX, y: worldY, width: 0, height: 0,
        fill: color, stroke: 'transparent', text: '', fontSize: 16
      });
    },

    onPointerMove(app, worldX, worldY, e) {
      if (!this.startPoint) return;
      if (app.renderer.snapToGrid) {
        const snapped = app.renderer.snapPosition(worldX, worldY);
        worldX = snapped.x;
        worldY = snapped.y;
      }
      let w = worldX - this.startPoint.x;
      let h = worldY - this.startPoint.y;

      // Shift = square
      if (e.shiftKey) {
        const size = Math.max(Math.abs(w), Math.abs(h));
        w = w < 0 ? -size : size;
        h = h < 0 ? -size : size;
      }

      if (Math.abs(w) > 10 || Math.abs(h) > 10) this.dragged = true;

      const norm = normalizeRect(this.startPoint.x, this.startPoint.y, w, h);
      app.renderer.previewElement.x = norm.x;
      app.renderer.previewElement.y = norm.y;
      app.renderer.previewElement.width = norm.w;
      app.renderer.previewElement.height = norm.h;
      app.renderer.markDirty();
    },

    onPointerUp(app, worldX, worldY, e) {
      if (!this.startPoint) return;

      const color = app.renderer.previewElement ? app.renderer.previewElement.fill : (app.lastStickyColor || '#FFD966');
      app.renderer.previewElement = null;

      if (this.dragged) {
        // Dragged: use drawn dimensions
        if (app.renderer.snapToGrid) {
          const snapped = app.renderer.snapPosition(worldX, worldY);
          worldX = snapped.x;
          worldY = snapped.y;
        }
        let w = worldX - this.startPoint.x;
        let h = worldY - this.startPoint.y;
        if (e.shiftKey) {
          const size = Math.max(Math.abs(w), Math.abs(h));
          w = w < 0 ? -size : size;
          h = h < 0 ? -size : size;
        }
        const norm = normalizeRect(this.startPoint.x, this.startPoint.y, w, h);
        if (norm.w > 20 && norm.h > 20) {
          const el = createSticky(norm.x, norm.y);
          el.width = norm.w;
          el.height = norm.h;
          el.fill = color;
          app.lastStickyColor = el.fill;
          app.addElement(el);
          app.renderer.selectedIds.clear();
          app.renderer.selectedIds.add(el.id);
        }
      } else {
        // Simple click: default 200x200 sticky
        const el = createSticky(this.startPoint.x - 100, this.startPoint.y - 100);
        el.fill = app.getNextStickyColor();
        app.lastStickyColor = el.fill;
        app.addElement(el);
        app.renderer.selectedIds.clear();
        app.renderer.selectedIds.add(el.id);
      }

      this.startPoint = null;
      this.dragged = false;
      app.renderer.markDirty();
    },

    onKeyDown(app, e) {
      if (e.key === 'Escape') {
        app.renderer.previewElement = null;
        this.startPoint = null;
        app.setTool('select');
      }
    },
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

  envelope: {
    name: 'envelope',
    cursor: 'crosshair',
    startPoint: null,

    onPointerDown(app, worldX, worldY) {
      this.startPoint = { x: worldX, y: worldY };
      app.renderer.previewElement = createEnvelope(worldX, worldY, 0, 0);
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

      if (norm.w > 30 && norm.h > 30) {
        const el = createEnvelope(norm.x, norm.y, norm.w, norm.h);
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

  connector: {
    name: 'connector',
    cursor: 'crosshair',
    sourceId: null,
    hoveredAnchor: null,

    onPointerDown(app, worldX, worldY) {
      // Find element under cursor to start connector from
      const hit = app.renderer.hitTest(worldX, worldY);
      if (hit && hit.type !== 'connector') {
        this.sourceId = hit.id;
        const anchors = getAnchorPoints(hit);
        // Find closest anchor
        let best = anchors[0];
        let bestDist = Infinity;
        for (const a of anchors) {
          const d = Math.hypot(a.x - worldX, a.y - worldY);
          if (d < bestDist) { bestDist = d; best = a; }
        }
        app.renderer.previewElement = createElement('connector', {
          x: best.x, y: best.y, x2: worldX, y2: worldY,
          stroke: app.currentStroke, strokeWidth: app.currentStrokeWidth,
          connectorStyle: 'arrow'
        });
      } else {
        // Free connector
        this.sourceId = null;
        app.renderer.previewElement = createElement('connector', {
          x: worldX, y: worldY, x2: worldX, y2: worldY,
          stroke: app.currentStroke, strokeWidth: app.currentStrokeWidth,
          connectorStyle: 'arrow'
        });
      }
    },

    onPointerMove(app, worldX, worldY) {
      if (!app.renderer.previewElement) return;

      // Snap to target element anchor on hover
      const hit = app.renderer.hitTest(worldX, worldY);
      if (hit && hit.type !== 'connector' && hit.id !== this.sourceId) {
        const anchors = getAnchorPoints(hit);
        let best = anchors[0];
        let bestDist = Infinity;
        for (const a of anchors) {
          const d = Math.hypot(a.x - worldX, a.y - worldY);
          if (d < bestDist) { bestDist = d; best = a; }
        }
        app.renderer.previewElement.x2 = best.x;
        app.renderer.previewElement.y2 = best.y;
        app.renderer.connectorSnapTarget = hit.id;
      } else {
        app.renderer.previewElement.x2 = worldX;
        app.renderer.previewElement.y2 = worldY;
        app.renderer.connectorSnapTarget = null;
      }
      app.renderer.markDirty();
    },

    onPointerUp(app, worldX, worldY) {
      if (!app.renderer.previewElement) return;

      const targetHit = app.renderer.hitTest(worldX, worldY);
      const targetId = (targetHit && targetHit.type !== 'connector' && targetHit.id !== this.sourceId) ? targetHit.id : null;

      // Create connector
      const el = createConnector(this.sourceId, targetId, 'arrow');
      el.stroke = app.currentStroke;
      el.strokeWidth = app.currentStrokeWidth;

      // Set initial positions
      if (this.sourceId && targetId) {
        const srcEl = app.renderer.elements.get(this.sourceId);
        const tgtEl = app.renderer.elements.get(targetId);
        if (srcEl && tgtEl) {
          const best = getBestAnchors(srcEl, tgtEl);
          el.x = best.src.x;
          el.y = best.src.y;
          el.x2 = best.tgt.x;
          el.y2 = best.tgt.y;
        }
      } else {
        el.x = app.renderer.previewElement.x;
        el.y = app.renderer.previewElement.y;
        el.x2 = worldX;
        el.y2 = worldY;
      }

      app.addElement(el);
      app.renderer.previewElement = null;
      app.renderer.connectorSnapTarget = null;
      this.sourceId = null;
      app.renderer.markDirty();
    },

    onKeyDown() {},
    onDoubleClick(app, worldX, worldY) {
      const hit = app.renderer.hitTest(worldX, worldY);
      if (hit && hit.type === 'connector') {
        app.startTextEdit(hit);
      }
    }
  },

  diamond: createShapeTool('diamond'),
  triangle: createShapeTool('triangle'),

  card: {
    name: 'card',
    cursor: 'crosshair',

    onPointerDown(app, worldX, worldY) {
      const el = createCard(worldX - 130, worldY - 80);
      app.addElement(el);
      app.renderer.selectedIds.clear();
      app.renderer.selectedIds.add(el.id);
      app.renderer.markDirty();
      app.setTool('select');
      setTimeout(() => app.startTextEdit(el), 50);
    },

    onPointerMove() {},
    onPointerUp() {},
    onKeyDown() {},
    onDoubleClick() {}
  },

  list: {
    name: 'list',
    cursor: 'crosshair',

    onPointerDown(app, worldX, worldY) {
      const el = createList(worldX - 125, worldY - 30);
      app.addElement(el);
      app.renderer.selectedIds.clear();
      app.renderer.selectedIds.add(el.id);
      app.renderer.markDirty();
      app.setTool('select');
      setTimeout(() => app.startTextEdit(el), 50);
    },

    onPointerMove() {},
    onPointerUp() {},
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
      // Snap start point to grid if enabled
      if (app.renderer.snapToGrid) {
        const snapped = app.renderer.snapPosition(worldX, worldY);
        worldX = snapped.x;
        worldY = snapped.y;
      }
      this.startPoint = { x: worldX, y: worldY };
      app.renderer.previewElement = createElement(type, {
        x: worldX, y: worldY, width: 0, height: 0,
        fill: app.currentFill, stroke: app.currentStroke,
        strokeWidth: app.currentStrokeWidth
      });
    },

    onPointerMove(app, worldX, worldY, e) {
      if (!this.startPoint) return;
      // Snap to grid if enabled
      if (app.renderer.snapToGrid) {
        const snapped = app.renderer.snapPosition(worldX, worldY);
        worldX = snapped.x;
        worldY = snapped.y;
      }
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
      // Snap to grid if enabled
      if (app.renderer.snapToGrid) {
        const snapped = app.renderer.snapPosition(worldX, worldY);
        worldX = snapped.x;
        worldY = snapped.y;
      }
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
