// Main application - wires everything together
class DarkBoardApp {
  constructor() {
    this.currentTool = 'select';
    this.currentFill = 'transparent';
    this.currentStroke = '#ffffff';
    this.currentStrokeWidth = 2;
    this.myColor = '#4a9eff';
    this.myUserId = null;
    this.isFacilitator = false;
    this.userName = '';
    this.clipboard = [];
    this.textEditElement = null;

    // Init canvas renderer
    this.renderer = new CanvasRenderer(document.getElementById('canvas'));

    // Init history
    this.history = new History();

    // Init sync (connect after name is set)
    this.sync = new SyncClient(this);

    // Init input
    this.input = new InputHandler(this);

    // Init UI
    this.ui = new UI(this);

    // Init workshop features
    this.workshop = new Workshop(this);

    // Update title
    document.title = `DarkBoard - ${getBoardId()}`;

    // Sticky color memory
    this.lastStickyColor = null;

    // Image drag-and-drop
    this.initDragDrop();

    // Clipboard image paste
    this.initClipboardPaste();

    // Cursor timeout
    this.initCursorTimeout();

    // Render vote badges
    this.initVoteRenderer();

    // Element deep-link: update URL hash on selection
    this.initElementDeepLinks();

    // Show name dialog
    this.showNameDialog();
  }

  initElementDeepLinks() {
    // On hash change, navigate to element
    window.addEventListener('hashchange', () => this.navigateToHash());
    // After initial load/sync, check hash
    setTimeout(() => this.navigateToHash(), 1000);
  }

  navigateToHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = this.renderer.elements.get(hash);
    if (el) {
      const bounds = getElementBounds(el);
      if (bounds) {
        this.renderer.selectedIds.clear();
        this.renderer.selectedIds.add(el.id);
        const cx = bounds.x + bounds.w / 2;
        const cy = bounds.y + bounds.h / 2;
        this.animateToView(cx, cy, 1.2);
      }
    }
  }

  updateUrlHash() {
    if (this.renderer.selectedIds.size === 1) {
      const id = [...this.renderer.selectedIds][0];
      window.history.replaceState(null, '', '#' + id);
    } else if (this.renderer.selectedIds.size === 0) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  showNameDialog() {
    const dialog = document.getElementById('nameDialog');
    const input = document.getElementById('nameInput');
    const submit = document.getElementById('nameSubmit');

    // Check if name already saved
    const savedName = localStorage.getItem('darkboard-name');
    if (savedName) {
      this.userName = savedName;
      dialog.style.display = 'none';
      this.sync.connect();
      return;
    }

    dialog.style.display = '';
    input.focus();

    const joinWithName = () => {
      const name = input.value.trim() || `User ${getSessionId().slice(0, 4)}`;
      this.userName = name;
      localStorage.setItem('darkboard-name', name);
      dialog.style.display = 'none';
      this.sync.connect();
    };

    submit.addEventListener('click', joinWithName);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinWithName();
      e.stopPropagation();
    });
  }

  initDragDrop() {
    const canvas = this.renderer.canvas;

    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (files.length === 0) return;

      // Check file size (max 5MB)
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) {
          this.showToast('Image trop grande (max 5 Mo)');
          continue;
        }
      }

      const world = this.renderer.screenToWorld(e.clientX, e.clientY);

      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            let w = img.width;
            let h = img.height;
            const maxSize = 600;
            if (w > maxSize || h > maxSize) {
              const scale = maxSize / Math.max(w, h);
              w *= scale;
              h *= scale;
            }
            const el = createImageElement(world.x - w / 2, world.y - h / 2, w, h, ev.target.result);
            this.addElement(el);
            this.renderer.selectedIds.clear();
            this.renderer.selectedIds.add(el.id);
            this.renderer.markDirty();
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  initClipboardPaste() {
    document.addEventListener('paste', (e) => {
      // Don't intercept if typing in a text field
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) continue;
          if (blob.size > 5 * 1024 * 1024) {
            this.showToast('Image trop grande (max 5 Mo)');
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              let w = img.width, h = img.height;
              const maxSize = 600;
              if (w > maxSize || h > maxSize) {
                const scale = maxSize / Math.max(w, h);
                w *= scale;
                h *= scale;
              }
              const cx = this.renderer.camera.x;
              const cy = this.renderer.camera.y;
              const el = createImageElement(cx - w / 2, cy - h / 2, w, h, ev.target.result);
              this.addElement(el);
              this.renderer.selectedIds.clear();
              this.renderer.selectedIds.add(el.id);
              this.renderer.markDirty();
            };
            img.src = ev.target.result;
          };
          reader.readAsDataURL(blob);
          return;
        }
      }

      // If text pasted on canvas, create a sticky with that text
      const text = e.clipboardData.getData('text/plain');
      if (text && this.clipboard.length === 0) {
        e.preventDefault();
        const cx = this.renderer.camera.x;
        const cy = this.renderer.camera.y;
        const el = createSticky(cx - 100, cy - 100);
        el.text = text;
        this.addElement(el);
        this.renderer.selectedIds.clear();
        this.renderer.selectedIds.add(el.id);
        this.renderer.markDirty();
      }
    });
  }

  initCursorTimeout() {
    // Hide cursors of inactive users (30 seconds)
    setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [userId, user] of this.renderer.remoteUsers) {
        if (user.lastActivity && (now - user.lastActivity) > 30000) {
          if (!user.inactive) {
            user.inactive = true;
            changed = true;
          }
        } else {
          if (user.inactive) {
            user.inactive = false;
            changed = true;
          }
        }
      }
      if (changed) this.renderer.markDirty();
    }, 5000);
  }

  initVoteRenderer() {
    // Override the render method to add vote badges
    const origRender = this.renderer.render.bind(this.renderer);
    this.renderer.render = () => {
      origRender();

      // Draw vote badges on top
      if (this.workshop && this.workshop.isVotingActive()) {
        const ctx = this.renderer.ctx;
        const w = window.innerWidth;
        const h = window.innerHeight;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(this.renderer.camera.zoom, this.renderer.camera.zoom);
        ctx.translate(-this.renderer.camera.x, -this.renderer.camera.y);

        for (const [id, el] of this.renderer.elements) {
          if (el.type === 'sticky' || el.type === 'rect' || el.type === 'text') {
            const count = this.workshop.getVoteCount(id);
            const voted = this.workshop.hasVoted(id);
            if (count > 0 || voted) {
              renderVoteBadge(ctx, el, count, voted);
            }
          }
        }
        ctx.restore();
      }

      // Show vote results after vote ends
      if (this.workshop && !this.workshop.isVotingActive() && Object.keys(this.workshop.voteResults).length > 0) {
        const ctx = this.renderer.ctx;
        const w = window.innerWidth;
        const h = window.innerHeight;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(this.renderer.camera.zoom, this.renderer.camera.zoom);
        ctx.translate(-this.renderer.camera.x, -this.renderer.camera.y);

        for (const [elementId, count] of Object.entries(this.workshop.voteResults)) {
          const el = this.renderer.elements.get(elementId);
          if (el && count > 0) {
            renderVoteBadge(ctx, el, count, false);
          }
        }
        ctx.restore();
      }
    };
  }

  setTool(name) {
    if (!Tools[name]) return;
    this.currentTool = name;
    this.ui.updateToolbar(name);
    this.renderer.previewElement = null;
    this.renderer.markDirty();
  }

  addElement(el) {
    const ops = [{ type: 'add', elementId: el.id, element: el }];
    const inverseOps = [{ type: 'delete', elementId: el.id }];
    this.renderer.elements.set(el.id, el);
    this.history.push(ops, inverseOps);
    this.sync.sendOps(ops);
    this.renderer.markDirty();
  }

  applyOps(ops) {
    for (const op of ops) {
      switch (op.type) {
        case 'add':
          this.renderer.elements.set(op.elementId, op.element);
          break;
        case 'update': {
          const el = this.renderer.elements.get(op.elementId);
          if (el) Object.assign(el, op.props);
          break;
        }
        case 'delete':
          this.renderer.elements.delete(op.elementId);
          this.renderer.selectedIds.delete(op.elementId);
          break;
      }
    }
    this.renderer.markDirty();
  }

  deleteSelected() {
    if (this.renderer.selectedIds.size === 0) return;

    // Delete connectors attached to selected elements first
    for (const id of this.renderer.selectedIds) {
      this.deleteConnectorsFor(id);
    }

    const ops = [];
    const inverseOps = [];
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el && !el.locked) {
        ops.push({ type: 'delete', elementId: id });
        inverseOps.push({ type: 'add', elementId: id, element: deepClone(el) });
      }
    }
    if (ops.length === 0) {
      this.showToast('Objets verrouilles');
      return;
    }
    this.applyOps(ops);
    this.history.push(ops, inverseOps);
    this.sync.sendOps(ops);
    this.renderer.selectedIds.clear();
    this.renderer.markDirty();
  }

  undo() {
    const ops = this.history.undo();
    if (ops) {
      this.applyOps(ops);
      this.sync.sendOps(ops);
    }
  }

  redo() {
    const ops = this.history.redo();
    if (ops) {
      this.applyOps(ops);
      this.sync.sendOps(ops);
    }
  }

  selectAll() {
    this.renderer.selectedIds.clear();
    for (const [id] of this.renderer.elements) {
      this.renderer.selectedIds.add(id);
    }
    this.renderer.markDirty();
  }

  copySelected() {
    this.clipboard = [];
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el) this.clipboard.push(deepClone(el));
    }
  }

  paste() {
    if (this.clipboard.length === 0) return;
    this.renderer.selectedIds.clear();
    const offset = 20;
    for (const orig of this.clipboard) {
      const el = deepClone(orig);
      el.id = generateId();
      el.x += offset;
      el.y += offset;
      if (el.x2 !== undefined) { el.x2 += offset; el.y2 += offset; }
      if (el.points) {
        el.points = el.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
      }
      el.zIndex = Date.now();
      this.addElement(el);
      this.renderer.selectedIds.add(el.id);
    }
    this.renderer.markDirty();
  }

  cutSelected() {
    this.copySelected();
    this.deleteSelected();
  }

  duplicateSelected() {
    this.copySelected();
    this.paste();
  }

  // Move selected elements by dx, dy (arrow keys)
  moveSelectedBy(dx, dy) {
    if (this.renderer.selectedIds.size === 0) return;
    const ops = [];
    const inverseOps = [];
    const moved = new Map();
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (!el) continue;
      moved.set(id, deepClone(el));
      const oldProps = { x: el.x, y: el.y };
      el.x += dx;
      el.y += dy;
      const newProps = { x: el.x, y: el.y };
      if (el.x2 !== undefined) {
        oldProps.x2 = el.x2 - dx;
        oldProps.y2 = el.y2 - dy;
        el.x2 += dx;
        el.y2 += dy;
        newProps.x2 = el.x2;
        newProps.y2 = el.y2;
      }
      if (el.points) {
        oldProps.points = el.points.map(p => ({ x: p.x - dx, y: p.y - dy }));
        el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        newProps.points = el.points;
      }
      ops.push({ type: 'update', elementId: id, props: newProps });
      inverseOps.push({ type: 'update', elementId: id, props: oldProps });
    }
    if (ops.length > 0) {
      this.history.push(ops, inverseOps);
      this.sync.sendOps(ops);
      this.updateConnectors(moved);
      this.renderer.markDirty();
    }
  }

  updateSelectedElements(props) {
    if (this.renderer.selectedIds.size === 0) return;
    const ops = [];
    const inverseOps = [];
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el) {
        const oldProps = {};
        for (const key of Object.keys(props)) {
          oldProps[key] = el[key];
        }
        ops.push({ type: 'update', elementId: id, props: { ...props } });
        inverseOps.push({ type: 'update', elementId: id, props: oldProps });
        Object.assign(el, props);
      }
    }
    if (ops.length > 0) {
      this.history.push(ops, inverseOps);
      this.sync.sendOps(ops);
      this.renderer.markDirty();
    }
  }

  // Update connectors when source/target elements are moved
  updateConnectors(movedElements) {
    const connectors = Array.from(this.renderer.elements.values()).filter(e => e.type === 'connector');
    if (connectors.length === 0) return;

    const ops = [];
    const inverseOps = [];
    const movedIds = new Set(movedElements.keys());

    for (const conn of connectors) {
      if (!conn.sourceId && !conn.targetId) continue;
      const srcMoved = conn.sourceId && movedIds.has(conn.sourceId);
      const tgtMoved = conn.targetId && movedIds.has(conn.targetId);
      if (!srcMoved && !tgtMoved) continue;

      const srcEl = conn.sourceId ? this.renderer.elements.get(conn.sourceId) : null;
      const tgtEl = conn.targetId ? this.renderer.elements.get(conn.targetId) : null;

      const oldProps = { x: conn.x, y: conn.y, x2: conn.x2, y2: conn.y2 };

      if (srcEl && tgtEl) {
        const best = getBestAnchors(srcEl, tgtEl);
        conn.x = best.src.x;
        conn.y = best.src.y;
        conn.x2 = best.tgt.x;
        conn.y2 = best.tgt.y;
      } else if (srcEl) {
        const anchors = getAnchorPoints(srcEl);
        let best = anchors[0], bestDist = Infinity;
        for (const a of anchors) {
          const d = Math.hypot(a.x - conn.x2, a.y - conn.y2);
          if (d < bestDist) { bestDist = d; best = a; }
        }
        conn.x = best.x;
        conn.y = best.y;
      } else if (tgtEl) {
        const anchors = getAnchorPoints(tgtEl);
        let best = anchors[0], bestDist = Infinity;
        for (const a of anchors) {
          const d = Math.hypot(a.x - conn.x, a.y - conn.y);
          if (d < bestDist) { bestDist = d; best = a; }
        }
        conn.x2 = best.x;
        conn.y2 = best.y;
      }

      const newProps = { x: conn.x, y: conn.y, x2: conn.x2, y2: conn.y2 };
      ops.push({ type: 'update', elementId: conn.id, props: newProps });
      inverseOps.push({ type: 'update', elementId: conn.id, props: oldProps });
    }

    if (ops.length > 0) {
      this.history.push(ops, inverseOps);
      this.sync.sendOps(ops);
      this.renderer.markDirty();
    }
  }

  // Delete element and its connectors
  deleteConnectorsFor(elementId) {
    const connectors = Array.from(this.renderer.elements.values())
      .filter(e => e.type === 'connector' && (e.sourceId === elementId || e.targetId === elementId));
    const ops = [];
    const inverseOps = [];
    for (const conn of connectors) {
      ops.push({ type: 'delete', elementId: conn.id });
      inverseOps.push({ type: 'add', elementId: conn.id, element: deepClone(conn) });
    }
    if (ops.length > 0) {
      this.applyOps(ops);
      this.history.push(ops, inverseOps);
      this.sync.sendOps(ops);
    }
  }

  // Envelope containment logic
  updateEnvelopeContainment(movedElements) {
    const envelopes = Array.from(this.renderer.elements.values()).filter(e => e.type === 'envelope');
    if (envelopes.length === 0) return;

    const ops = [];
    const inverseOps = [];

    for (const [id] of movedElements) {
      const el = this.renderer.elements.get(id);
      if (!el || el.type === 'envelope') continue;

      // Remove from any previous envelope
      for (const env of envelopes) {
        if (env.children && env.children.includes(id)) {
          const oldChildren = [...env.children];
          env.children = env.children.filter(c => c !== id);
          ops.push({ type: 'update', elementId: env.id, props: { children: [...env.children] } });
          inverseOps.push({ type: 'update', elementId: env.id, props: { children: oldChildren } });
        }
      }

      // Check if now inside an envelope
      for (const env of envelopes) {
        if (isInsideEnvelope(el, env)) {
          if (!env.children) env.children = [];
          if (!env.children.includes(id)) {
            const oldChildren = [...env.children];
            env.children.push(id);
            ops.push({ type: 'update', elementId: env.id, props: { children: [...env.children] } });
            inverseOps.push({ type: 'update', elementId: env.id, props: { children: oldChildren } });
          }
          break; // Only belong to one envelope
        }
      }
    }

    if (ops.length > 0) {
      this.history.push(ops, inverseOps);
      this.sync.sendOps(ops);
      this.renderer.markDirty();
    }
  }

  // Get children of an envelope
  getEnvelopeChildren(envelopeId) {
    const env = this.renderer.elements.get(envelopeId);
    if (!env || !env.children) return [];
    return env.children
      .map(id => this.renderer.elements.get(id))
      .filter(el => el != null);
  }

  // Move envelope with children
  moveEnvelopeWithChildren(envelopeId, dx, dy) {
    const children = this.getEnvelopeChildren(envelopeId);
    const ops = [];
    const inverseOps = [];
    for (const child of children) {
      const oldProps = { x: child.x, y: child.y };
      child.x += dx;
      child.y += dy;
      if (child.x2 !== undefined) { child.x2 += dx; child.y2 += dy; }
      if (child.points) {
        child.points = child.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      }
      const newProps = { x: child.x, y: child.y };
      if (child.x2 !== undefined) { newProps.x2 = child.x2; newProps.y2 = child.y2; }
      if (child.points) { newProps.points = child.points; }
      ops.push({ type: 'update', elementId: child.id, props: newProps });
      inverseOps.push({ type: 'update', elementId: child.id, props: oldProps });
    }
    if (ops.length > 0) {
      this.history.push(ops, inverseOps);
      this.sync.sendOps(ops);
    }
  }

  // Rich text types that support contenteditable
  isRichTextType(type) {
    return type === 'sticky' || type === 'text' || type === 'circle' || type === 'rect' || type === 'diamond' || type === 'triangle';
  }

  startTextEdit(el) {
    this.textEditElement = el;
    const screen = this.renderer.worldToScreen(el.x, el.y);
    const zoom = this.renderer.camera.zoom;

    // Use contenteditable div for rich text types, textarea for simple types
    const useRichText = this.isRichTextType(el.type);
    const editor = document.createElement(useRichText ? 'div' : 'textarea');
    editor.className = 'text-edit-overlay';

    if (useRichText) {
      editor.contentEditable = 'true';
      editor.innerHTML = el.richText || (el.text ? el.text.replace(/\n/g, '<br>') : '');
      editor.style.outline = 'none';
      editor.style.whiteSpace = 'pre-wrap';
      editor.style.wordWrap = 'break-word';
      editor.style.overflowY = 'auto';
    } else {
      editor.value = el.text || '';
    }

    editor.style.left = screen.x + 'px';
    editor.style.top = screen.y + 'px';
    editor.style.width = (el.width * zoom) + 'px';
    editor.style.height = (el.height * zoom) + 'px';
    editor.style.fontSize = ((el.fontSize || 16) * zoom) + 'px';
    editor.style.lineHeight = '1.4';

    if (el.type === 'sticky') {
      editor.style.background = el.fill || '#FFD966';
      editor.style.color = '#1a1a1a';
      editor.style.padding = (14 * zoom) + 'px';
      editor.style.borderColor = 'rgba(0,0,0,0.2)';
    } else if (el.type === 'text') {
      editor.style.background = 'rgba(30,30,30,0.9)';
      editor.style.color = '#e0e0e0';
    } else if (el.type === 'frame') {
      const titleH = ((el.fontSize || 16) + 16) * zoom;
      editor.style.left = screen.x + 'px';
      editor.style.top = (screen.y - titleH) + 'px';
      editor.style.width = (el.width * zoom) + 'px';
      editor.style.height = titleH + 'px';
      editor.style.background = el.stroke || '#4a9eff';
      editor.style.color = 'white';
      editor.style.fontWeight = 'bold';
      editor.style.padding = (8 * zoom) + 'px';
    } else if (el.type === 'envelope') {
      const headerH = 36 * zoom;
      editor.style.left = (screen.x + 30 * zoom) + 'px';
      editor.style.top = screen.y + 'px';
      editor.style.width = ((el.width - 60) * zoom) + 'px';
      editor.style.height = headerH + 'px';
      editor.style.background = el.stroke || '#4a9eff';
      editor.style.color = 'white';
      editor.style.fontWeight = 'bold';
      editor.style.padding = (8 * zoom) + 'px';
    } else if (el.type === 'card') {
      this.showCardEditor(el);
      return;
    } else if (el.type === 'list') {
      this.showListEditor(el);
      return;
    } else if (el.type === 'connector') {
      const mx = (el.x + el.x2) / 2;
      const my = (el.y + el.y2) / 2;
      const screen2 = this.renderer.worldToScreen(mx - 60, my - 15);
      editor.style.left = screen2.x + 'px';
      editor.style.top = screen2.y + 'px';
      editor.style.width = (120 * zoom) + 'px';
      editor.style.height = (30 * zoom) + 'px';
      editor.style.background = 'rgba(30,30,30,0.9)';
      editor.style.color = '#e0e0e0';
      editor.style.textAlign = 'center';
    } else if (el.type === 'rect' || el.type === 'circle' || el.type === 'diamond' || el.type === 'triangle') {
      editor.style.background = 'rgba(30,30,30,0.9)';
      editor.style.color = '#e0e0e0';
      editor.style.textAlign = 'center';
      if (!el.text) el.text = '';
    } else {
      editor.style.background = 'rgba(30,30,30,0.9)';
      editor.style.color = '#e0e0e0';
    }

    document.body.appendChild(editor);
    editor.focus();

    // Show formatting toolbar for rich text types
    if (useRichText) {
      this.showFormattingToolbar(editor, el);

      // Apply memorized formatting to new empty elements
      if (!el.richText && !el.text) {
        let initHtml = '';
        if (this.lastBold) initHtml += '<b>';
        if (this.lastItalic) initHtml += '<i>';
        if (this.lastUnderline) initHtml += '<u>';
        let hasFont = this.lastFontSize || this.lastFontFamily || this.lastTextColor;
        if (hasFont) {
          initHtml += '<font';
          if (this.lastFontSize) initHtml += ` size="${this.lastFontSize}"`;
          if (this.lastFontFamily) initHtml += ` face="${this.lastFontFamily}"`;
          if (this.lastTextColor) initHtml += ` color="${this.lastTextColor}"`;
          initHtml += '>';
        }
        initHtml += '\u200B'; // zero-width space as placeholder
        if (hasFont) initHtml += '</font>';
        if (this.lastUnderline) initHtml += '</u>';
        if (this.lastItalic) initHtml += '</i>';
        if (this.lastBold) initHtml += '</b>';
        if (initHtml !== '\u200B') {
          editor.innerHTML = initHtml;
        }
      }

      // Apply format painter if active
      if (this.formatPainterData) {
        editor.addEventListener('mouseup', () => {
          if (this.formatPainterData) {
            const fp = this.formatPainterData;
            if (fp.bold) document.execCommand('bold', false, null);
            if (fp.italic) document.execCommand('italic', false, null);
            if (fp.underline) document.execCommand('underline', false, null);
            if (fp.strikeThrough) document.execCommand('strikeThrough', false, null);
            if (fp.fontSize) document.execCommand('fontSize', false, fp.fontSize);
            if (fp.fontName) document.execCommand('fontName', false, fp.fontName);
            if (fp.foreColor) document.execCommand('foreColor', false, fp.foreColor);
            if (fp.hiliteColor) document.execCommand('hiliteColor', false, fp.hiliteColor);
            this.formatPainterData = null;
            const activeBtn = document.querySelector('.fmt-btn[data-action="formatPainter"].active');
            if (activeBtn) activeBtn.classList.remove('active');
          }
        }, { once: true });
      }

      const range = document.createRange();
      range.selectNodeContents(editor);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editor.select();
    }

    const finishEdit = () => {
      if (useRichText) {
        const newHtml = editor.innerHTML;
        const newPlain = editor.textContent || editor.innerText || '';
        const props = { richText: newHtml, text: newPlain };
        const oldProps = { richText: el.richText || null, text: el.text || '' };
        if (newHtml !== (el.richText || '') || newPlain !== el.text) {
          Object.assign(el, props);
          if (el.type === 'text') {
            const lines = newPlain.split('\n').length;
            const newHeight = Math.max(40, lines * (el.fontSize || 20) * 1.4 + 10);
            props.height = newHeight;
            oldProps.height = el.height;
            el.height = newHeight;
          }
          if (el.type === 'sticky') {
            const lines = newPlain.split('\n').length;
            const minH = Math.max(200, lines * (el.fontSize || 16) * 1.4 + 28);
            if (minH > el.height) {
              props.height = minH;
              oldProps.height = el.height;
              el.height = minH;
            }
          }
          const ops = [{ type: 'update', elementId: el.id, props }];
          const inverseOps = [{ type: 'update', elementId: el.id, props: oldProps }];
          this.history.push(ops, inverseOps);
          this.sync.sendOps(ops);
        }
      } else {
        const newText = editor.value;
        if (newText !== el.text) {
          const ops = [{ type: 'update', elementId: el.id, props: { text: newText } }];
          const inverseOps = [{ type: 'update', elementId: el.id, props: { text: el.text } }];
          el.text = newText;
          if (el.type === 'text') {
            const lines = newText.split('\n').length;
            const newHeight = Math.max(40, lines * (el.fontSize || 20) * 1.4 + 10);
            ops[0].props.height = newHeight;
            inverseOps[0].props.height = el.height;
            el.height = newHeight;
          }
          this.history.push(ops, inverseOps);
          this.sync.sendOps(ops);
        }
      }
      this.hideFormattingToolbar();
      editor.remove();
      this.textEditElement = null;
      this.renderer.markDirty();
    };

    editor.addEventListener('blur', (e) => {
      // Delay to check if click landed on toolbar/picker
      setTimeout(() => {
        const active = document.activeElement;
        const tb = document.querySelector('.formatting-toolbar');
        const cp = document.querySelector('.fmt-color-picker');
        if (tb && (tb.contains(active) || tb.contains(e.relatedTarget))) {
          // If a select dropdown is active, don't steal focus back — let user pick
          if (active && active.tagName === 'SELECT') return;
          editor.focus();
          return;
        }
        if (cp && (cp.contains(active) || cp.contains(e.relatedTarget))) { editor.focus(); return; }
        if (active === editor) return; // Already refocused
        finishEdit();
      }, 50);
    });
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        editor.blur();
      }
      if (!useRichText && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        editor.blur();
      }
      e.stopPropagation();
    });
  }

  showFormattingToolbar(editor, el) {
    this.hideFormattingToolbar();
    const toolbar = document.createElement('div');
    toolbar.className = 'formatting-toolbar';
    toolbar.tabIndex = -1;
    toolbar.innerHTML = `
      <button class="fmt-btn" data-cmd="bold" title="Gras (Ctrl+B)"><b>B</b></button>
      <button class="fmt-btn" data-cmd="italic" title="Italique (Ctrl+I)"><i>I</i></button>
      <button class="fmt-btn" data-cmd="underline" title="Souligne (Ctrl+U)"><u>U</u></button>
      <button class="fmt-btn" data-cmd="strikeThrough" title="Barre"><s>S</s></button>
      <span class="fmt-sep"></span>
      <select class="fmt-select" data-cmd="fontSize" title="Taille">
        <option value="">Taille</option>
        <option value="1">9px</option>
        <option value="2">11px</option>
        <option value="3">14px</option>
        <option value="4">18px</option>
        <option value="5">22px</option>
        <option value="6">28px</option>
        <option value="7">36px</option>
      </select>
      <select class="fmt-select" data-cmd="fontName" title="Police">
        <option value="">Police</option>
        <option value="Arial, sans-serif">Arial</option>
        <option value="Helvetica, sans-serif">Helvetica</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="Times New Roman, serif">Times</option>
        <option value="Courier New, monospace">Courier</option>
        <option value="Verdana, sans-serif">Verdana</option>
        <option value="Trebuchet MS, sans-serif">Trebuchet</option>
        <option value="Comic Sans MS, cursive">Comic Sans</option>
      </select>
      <span class="fmt-sep"></span>
      <button class="fmt-btn" data-action="textColor" title="Couleur du texte"><span style="color:#e94560">A</span></button>
      <button class="fmt-btn" data-action="highlight" title="Surlignage"><span style="background:#ffd966;padding:0 3px">H</span></button>
      <span class="fmt-sep"></span>
      <button class="fmt-btn" data-cmd="justifyLeft" title="Gauche"><span style="font-size:10px;line-height:1;letter-spacing:-1px">&#9776;</span></button>
      <button class="fmt-btn" data-cmd="justifyCenter" title="Centre"><span style="font-size:11px">&#8801;</span></button>
      <button class="fmt-btn" data-cmd="justifyRight" title="Droite"><span style="font-size:10px;direction:rtl;display:block">&#9776;</span></button>
      <span class="fmt-sep"></span>
      <button class="fmt-btn" data-cmd="insertUnorderedList" title="Liste a puces">&#8226;</button>
      <button class="fmt-btn" data-cmd="insertOrderedList" title="Liste numerotee">1.</button>
      <span class="fmt-sep"></span>
      <button class="fmt-btn" data-action="formatPainter" title="Pinceau de mise en forme">&#128396;</button>
      <button class="fmt-btn" data-cmd="removeFormat" title="Effacer">&#10005;</button>
    `;

    // Add to DOM first so we can measure
    toolbar.style.visibility = 'hidden';
    document.body.appendChild(toolbar);
    this.formattingToolbar = toolbar;

    // Now position relative to editor, accounting for actual toolbar height
    const editorRect = editor.getBoundingClientRect();
    const tbRect = toolbar.getBoundingClientRect();
    const tbHeight = tbRect.height;
    let tbLeft = Math.max(4, Math.min(editorRect.left, window.innerWidth - tbRect.width - 8));
    let tbTop = editorRect.top - tbHeight - 8;
    if (tbTop < 4) {
      tbTop = editorRect.bottom + 8;
    }
    toolbar.style.left = tbLeft + 'px';
    toolbar.style.top = tbTop + 'px';
    toolbar.style.visibility = 'visible';

    toolbar.addEventListener('mousedown', (e) => {
      // Don't preventDefault on select elements - they need native behavior to open dropdown
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
      e.preventDefault();
    });

    // Font size select - must use change event
    const fontSelect = toolbar.querySelector('.fmt-select[data-cmd="fontSize"]');
    if (fontSelect) {
      fontSelect.addEventListener('mousedown', (e) => e.stopPropagation());
      fontSelect.addEventListener('change', () => {
        if (fontSelect.value) {
          editor.focus();
          document.execCommand('fontSize', false, fontSelect.value);
          // Memorize last font size
          this.lastFontSize = fontSelect.value;
        }
        fontSelect.value = ''; // Reset to placeholder
      });
    }

    // Font family select
    const fontNameSelect = toolbar.querySelector('.fmt-select[data-cmd="fontName"]');
    if (fontNameSelect) {
      fontNameSelect.addEventListener('mousedown', (e) => e.stopPropagation());
      fontNameSelect.addEventListener('change', () => {
        if (fontNameSelect.value) {
          editor.focus();
          document.execCommand('fontName', false, fontNameSelect.value);
          // Memorize last font family
          this.lastFontFamily = fontNameSelect.value;
        }
        fontNameSelect.value = '';
      });
    }

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.fmt-btn');
      if (btn) {
        const cmd = btn.dataset.cmd;
        const action = btn.dataset.action;
        if (cmd) {
          editor.focus();
          document.execCommand(cmd, false, null);
          // Memorize bold/italic/underline state
          if (cmd === 'bold') this.lastBold = document.queryCommandState('bold');
          if (cmd === 'italic') this.lastItalic = document.queryCommandState('italic');
          if (cmd === 'underline') this.lastUnderline = document.queryCommandState('underline');
        } else if (action === 'textColor') {
          this.showColorPicker(toolbar, (color) => {
            editor.focus();
            document.execCommand('foreColor', false, color);
            this.lastTextColor = color;
          });
        } else if (action === 'highlight') {
          this.showColorPicker(toolbar, (color) => {
            editor.focus();
            document.execCommand('hiliteColor', false, color);
            this.lastHighlight = color;
          });
        } else if (action === 'formatPainter') {
          // Copy current selection formatting
          this.formatPainterData = {
            bold: document.queryCommandState('bold'),
            italic: document.queryCommandState('italic'),
            underline: document.queryCommandState('underline'),
            strikeThrough: document.queryCommandState('strikeThrough'),
            fontSize: document.queryCommandValue('fontSize'),
            fontName: document.queryCommandValue('fontName'),
            foreColor: document.queryCommandValue('foreColor'),
            hiliteColor: document.queryCommandValue('hiliteColor')
          };
          btn.classList.add('active');
          this.showToast('Format copie - selectionnez du texte pour appliquer');
        }
      }
    });
  }

  hideFormattingToolbar() {
    if (this.formattingToolbar) { this.formattingToolbar.remove(); this.formattingToolbar = null; }
    const picker = document.querySelector('.fmt-color-picker');
    if (picker) picker.remove();
  }

  showColorPicker(toolbar, callback) {
    const existing = document.querySelector('.fmt-color-picker');
    if (existing) { existing.remove(); return; }
    const picker = document.createElement('div');
    picker.className = 'fmt-color-picker';
    picker.tabIndex = -1;
    const colors = ['#000000', '#e94560', '#ff6b6b', '#ffd966', '#4ecdc4', '#4a9eff', '#96ceb4', '#dda0dd', '#ffffff', '#888888', '#0f3460', '#45b7d1'];
    for (const c of colors) {
      const swatch = document.createElement('div');
      swatch.className = 'fmt-swatch';
      swatch.style.background = c;
      swatch.addEventListener('mousedown', (e) => e.preventDefault());
      swatch.addEventListener('click', () => { callback(c); picker.remove(); });
      picker.appendChild(swatch);
    }
    const tbRect = toolbar.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.left = Math.max(4, Math.min(tbRect.left, window.innerWidth - 210)) + 'px';
    picker.style.top = (tbRect.bottom + 4) + 'px';
    document.body.appendChild(picker);
    setTimeout(() => {
      document.addEventListener('pointerdown', function handler(e) {
        if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('pointerdown', handler); }
      });
    }, 0);
  }

  centerOnSelection() {
    if (this.renderer.selectedIds.size === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (!el) continue;
      const b = getElementBounds(el);
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    if (!isFinite(minX)) return;
    const cx = minX + (maxX - minX) / 2;
    const cy = minY + (maxY - minY) / 2;
    const cw = maxX - minX;
    const ch = maxY - minY;
    const zoom = Math.min((window.innerWidth * 0.7) / (cw || 1), (window.innerHeight * 0.7) / (ch || 1), 2);
    this.animateToView(cx, cy, Math.max(0.3, zoom));
  }

  // Search and replace
  toggleSearchPanel() {
    if (!this.searchPanel) this.createSearchPanel();
    const visible = this.searchPanel.style.display !== 'none';
    this.searchPanel.style.display = visible ? 'none' : 'flex';
    if (!visible) this.searchPanel.querySelector('.search-input').focus();
  }

  closeSearchPanel() {
    if (this.searchPanel) { this.searchPanel.style.display = 'none'; this.clearSearchHighlights(); }
  }

  createSearchPanel() {
    const panel = document.createElement('div');
    panel.className = 'search-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="search-row">
        <input type="text" class="search-input" placeholder="Rechercher..." />
        <span class="search-count">0/0</span>
        <button class="search-btn" id="searchPrev" title="Precedent">▲</button>
        <button class="search-btn" id="searchNext" title="Suivant">▼</button>
        <button class="search-close" title="Fermer">✕</button>
      </div>
      <div class="search-row">
        <input type="text" class="replace-input" placeholder="Remplacer par..." />
        <button class="search-btn replace-btn">Remplacer</button>
        <button class="search-btn replace-all-btn">Tout</button>
      </div>
    `;
    document.body.appendChild(panel);
    this.searchPanel = panel;
    this.searchResults = [];
    this.searchIndex = 0;

    const searchInput = panel.querySelector('.search-input');
    const replaceInput = panel.querySelector('.replace-input');
    const countEl = panel.querySelector('.search-count');

    searchInput.addEventListener('input', () => {
      this.performSearch(searchInput.value);
      countEl.textContent = this.searchResults.length > 0 ? `${this.searchIndex + 1}/${this.searchResults.length}` : '0/0';
    });
    searchInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.searchNavigate(1);
      if (e.key === 'Escape') this.closeSearchPanel();
    });
    replaceInput.addEventListener('keydown', (e) => e.stopPropagation());

    panel.querySelector('#searchNext').addEventListener('click', () => this.searchNavigate(1));
    panel.querySelector('#searchPrev').addEventListener('click', () => this.searchNavigate(-1));
    panel.querySelector('.replace-btn').addEventListener('click', () => this.replaceOne(searchInput.value, replaceInput.value));
    panel.querySelector('.replace-all-btn').addEventListener('click', () => this.replaceAll(searchInput.value, replaceInput.value));
    panel.querySelector('.search-close').addEventListener('click', () => this.closeSearchPanel());
  }

  performSearch(query) {
    this.clearSearchHighlights();
    this.searchResults = [];
    this.searchIndex = 0;
    if (!query) return;
    const lower = query.toLowerCase();
    for (const [id, el] of this.renderer.elements) {
      const text = (el.text || '') + (el.richText ? richTextToPlain(el.richText) : '');
      if (text.toLowerCase().includes(lower)) {
        this.searchResults.push(id);
        el._searchHighlight = true;
      }
    }
    if (this.searchResults.length > 0) this.focusSearchResult();
    this.renderer.markDirty();
  }

  searchNavigate(dir) {
    if (this.searchResults.length === 0) return;
    this.searchIndex = (this.searchIndex + dir + this.searchResults.length) % this.searchResults.length;
    this.focusSearchResult();
    this.searchPanel.querySelector('.search-count').textContent = `${this.searchIndex + 1}/${this.searchResults.length}`;
  }

  focusSearchResult() {
    const id = this.searchResults[this.searchIndex];
    if (!id) return;
    const el = this.renderer.elements.get(id);
    if (!el) return;
    const b = getElementBounds(el);
    this.renderer.selectedIds.clear();
    this.renderer.selectedIds.add(id);
    this.animateToView(b.x + b.w / 2, b.y + b.h / 2);
  }

  replaceOne(search, replace) {
    if (this.searchResults.length === 0 || !search) return;
    const id = this.searchResults[this.searchIndex];
    const el = this.renderer.elements.get(id);
    if (!el) return;
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const oldText = el.text;
    const newText = (el.text || '').replace(re, replace);
    if (newText !== oldText) {
      const props = { text: newText };
      const oldProps = { text: oldText };
      if (el.richText) { oldProps.richText = el.richText; el.richText = el.richText.replace(re, replace); props.richText = el.richText; }
      el.text = newText;
      this.history.push([{ type: 'update', elementId: id, props }], [{ type: 'update', elementId: id, props: oldProps }]);
      this.sync.sendOps([{ type: 'update', elementId: id, props }]);
    }
    this.performSearch(search);
    this.searchPanel.querySelector('.search-count').textContent = this.searchResults.length > 0 ? `${this.searchIndex + 1}/${this.searchResults.length}` : '0/0';
    this.renderer.markDirty();
  }

  replaceAll(search, replace) {
    if (!search) return;
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let count = 0;
    const ops = [], inverseOps = [];
    for (const [id, el] of this.renderer.elements) {
      const oldText = el.text || '';
      const newText = oldText.replace(re, replace);
      if (newText !== oldText) {
        count++;
        const p = { text: newText }, op = { text: oldText };
        if (el.richText) { op.richText = el.richText; el.richText = el.richText.replace(re, replace); p.richText = el.richText; }
        el.text = newText;
        ops.push({ type: 'update', elementId: id, props: p });
        inverseOps.push({ type: 'update', elementId: id, props: op });
      }
    }
    if (ops.length > 0) { this.history.push(ops, inverseOps); this.sync.sendOps(ops); }
    this.showToast(`${count} remplacement(s) effectue(s)`);
    this.performSearch(search);
    this.searchPanel.querySelector('.search-count').textContent = '0/0';
    this.renderer.markDirty();
  }

  clearSearchHighlights() {
    for (const [id, el] of this.renderer.elements) delete el._searchHighlight;
    this.renderer.markDirty();
  }

  // Group/Ungroup
  groupSelected() {
    if (this.renderer.selectedIds.size < 2) return;
    const groupId = generateId();
    const ops = [];
    const inverseOps = [];
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el) {
        inverseOps.push({ type: 'update', elementId: id, props: { groupId: el.groupId || null } });
        el.groupId = groupId;
        ops.push({ type: 'update', elementId: id, props: { groupId } });
      }
    }
    this.history.push(ops, inverseOps);
    this.sync.sendOps(ops);
    this.renderer.markDirty();
    this.showToast('Objets groupes');
  }

  ungroupSelected() {
    const ops = [];
    const inverseOps = [];
    const groupIds = new Set();
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el && el.groupId) groupIds.add(el.groupId);
    }
    // Ungroup all elements in those groups
    for (const [id, el] of this.renderer.elements) {
      if (el.groupId && groupIds.has(el.groupId)) {
        inverseOps.push({ type: 'update', elementId: id, props: { groupId: el.groupId } });
        el.groupId = null;
        ops.push({ type: 'update', elementId: id, props: { groupId: null } });
      }
    }
    this.history.push(ops, inverseOps);
    this.sync.sendOps(ops);
    this.renderer.markDirty();
    this.showToast('Objets degroupes');
  }

  // Select entire group when one element is clicked
  selectGroup(elementId) {
    const el = this.renderer.elements.get(elementId);
    if (!el || !el.groupId) return;
    for (const [id, other] of this.renderer.elements) {
      if (other.groupId === el.groupId) {
        this.renderer.selectedIds.add(id);
      }
    }
  }

  // Alignment tools
  alignSelected(mode) {
    if (this.renderer.selectedIds.size < 2) return;
    const elements = [];
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el && !el.locked) elements.push(el);
    }
    if (elements.length < 2) return;

    const ops = [];
    const inverseOps = [];

    if (mode === 'top') {
      const minY = Math.min(...elements.map(el => el.y));
      for (const el of elements) {
        if (el.y !== minY) {
          inverseOps.push({ type: 'update', elementId: el.id, props: { y: el.y } });
          el.y = minY;
          ops.push({ type: 'update', elementId: el.id, props: { y: minY } });
        }
      }
    } else if (mode === 'left') {
      const minX = Math.min(...elements.map(el => el.x));
      for (const el of elements) {
        if (el.x !== minX) {
          inverseOps.push({ type: 'update', elementId: el.id, props: { x: el.x } });
          el.x = minX;
          ops.push({ type: 'update', elementId: el.id, props: { x: minX } });
        }
      }
    } else if (mode === 'centerH') {
      const bounds = elements.map(el => getElementBounds(el));
      const centerY = bounds.reduce((s, b) => s + b.y + b.h / 2, 0) / bounds.length;
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const newY = centerY - bounds[i].h / 2;
        if (el.y !== newY) {
          inverseOps.push({ type: 'update', elementId: el.id, props: { y: el.y } });
          el.y = newY;
          ops.push({ type: 'update', elementId: el.id, props: { y: newY } });
        }
      }
    }

    if (ops.length > 0) {
      this.history.push(ops, inverseOps);
      this.sync.sendOps(ops);
      this.renderer.markDirty();
    }
  }

  distributeSelected(direction) {
    const elements = [];
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el && !el.locked) elements.push(el);
    }
    if (elements.length < 3) return;

    const ops = [];
    const inverseOps = [];

    if (direction === 'horizontal') {
      elements.sort((a, b) => a.x - b.x);
      const first = elements[0];
      const last = elements[elements.length - 1];
      const totalSpan = (last.x + last.width) - first.x;
      const totalWidths = elements.reduce((s, el) => s + el.width, 0);
      const gap = (totalSpan - totalWidths) / (elements.length - 1);
      let currentX = first.x + first.width + gap;
      for (let i = 1; i < elements.length - 1; i++) {
        const el = elements[i];
        if (el.x !== currentX) {
          inverseOps.push({ type: 'update', elementId: el.id, props: { x: el.x } });
          el.x = currentX;
          ops.push({ type: 'update', elementId: el.id, props: { x: currentX } });
        }
        currentX += el.width + gap;
      }
    }

    if (ops.length > 0) {
      this.history.push(ops, inverseOps);
      this.sync.sendOps(ops);
      this.renderer.markDirty();
    }
  }

  // Envelope collapse/expand
  toggleEnvelopeCollapse(envelope) {
    const collapsed = !envelope.collapsed;
    const ops = [{ type: 'update', elementId: envelope.id, props: { collapsed } }];
    const inverseOps = [{ type: 'update', elementId: envelope.id, props: { collapsed: !collapsed } }];
    envelope.collapsed = collapsed;

    // Hide/show children
    if (envelope.children) {
      for (const childId of envelope.children) {
        const child = this.renderer.elements.get(childId);
        if (child) {
          ops.push({ type: 'update', elementId: childId, props: { hidden: collapsed } });
          inverseOps.push({ type: 'update', elementId: childId, props: { hidden: !collapsed } });
          child.hidden = collapsed;
        }
      }
    }

    this.history.push(ops, inverseOps);
    this.sync.sendOps(ops);
    this.renderer.markDirty();
  }

  // Delete envelope with all its content
  deleteEnvelopeWithContent(envelope) {
    const ops = [];
    const inverseOps = [];
    if (envelope.children) {
      for (const childId of envelope.children) {
        const child = this.renderer.elements.get(childId);
        if (child) {
          ops.push({ type: 'delete', elementId: childId });
          inverseOps.push({ type: 'add', elementId: childId, element: deepClone(child) });
        }
      }
    }
    ops.push({ type: 'delete', elementId: envelope.id });
    inverseOps.push({ type: 'add', elementId: envelope.id, element: deepClone(envelope) });
    this.applyOps(ops);
    this.history.push(ops, inverseOps);
    this.sync.sendOps(ops);
    this.renderer.selectedIds.clear();
    this.renderer.markDirty();
  }

  // Comments
  addComment(el) {
    const text = prompt('Commentaire:');
    if (!text) return;
    const bounds = getElementBounds(el);
    const comment = {
      id: generateId(),
      x: bounds.x + bounds.w,
      y: bounds.y,
      elementId: el.id,
      text: text,
      author: this.userName || 'Anonyme',
      timestamp: Date.now(),
      replies: [],
      resolved: false
    };
    this.renderer.comments.push(comment);
    this.renderer.markDirty();
    this.showToast('Commentaire ajoute');
  }

  // Canvas comment (not attached to object)
  addCanvasComment(x, y) {
    const text = prompt('Commentaire:');
    if (!text) return;
    const comment = {
      id: generateId(),
      x: x,
      y: y,
      elementId: null,
      text: text,
      author: this.userName || 'Anonyme',
      timestamp: Date.now(),
      replies: [],
      resolved: false
    };
    this.renderer.comments.push(comment);
    this.renderer.markDirty();
    this.showToast('Commentaire ajoute');
  }

  // Card editor panel
  showCardEditor(el) {
    const existing = document.querySelector('.card-editor-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.className = 'card-editor-panel';
    panel.innerHTML = `
      <div class="card-editor-header">
        <h3>Carte</h3>
        <button class="card-editor-close">&times;</button>
      </div>
      <div class="card-editor-body">
        <label>Titre</label>
        <input type="text" class="card-field" data-field="text" value="${(el.text || '').replace(/"/g, '&quot;')}" placeholder="Titre de la carte..." />
        <label>Statut</label>
        <select class="card-field" data-field="cardStatus">
          <option value="">-- Aucun --</option>
          <option value="todo" ${el.cardStatus === 'todo' ? 'selected' : ''}>A faire</option>
          <option value="in-progress" ${el.cardStatus === 'in-progress' ? 'selected' : ''}>En cours</option>
          <option value="review" ${el.cardStatus === 'review' ? 'selected' : ''}>En review</option>
          <option value="done" ${el.cardStatus === 'done' ? 'selected' : ''}>Termine</option>
        </select>
        <label>Priorite</label>
        <select class="card-field" data-field="cardPriority">
          <option value="">-- Aucune --</option>
          <option value="high" ${el.cardPriority === 'high' ? 'selected' : ''}>Haute</option>
          <option value="medium" ${el.cardPriority === 'medium' ? 'selected' : ''}>Moyenne</option>
          <option value="low" ${el.cardPriority === 'low' ? 'selected' : ''}>Basse</option>
        </select>
        <label>Tags (separes par virgule)</label>
        <input type="text" class="card-field" data-field="cardTags" value="${(el.cardTags || []).join(', ')}" placeholder="Frontend, Sprint 4..." />
        <label>Story Points</label>
        <input type="number" class="card-field" data-field="cardPoints" value="${el.cardPoints || ''}" min="0" placeholder="0" />
        <label>Assigne a</label>
        <input type="text" class="card-field" data-field="cardAssignee" value="${el.cardAssignee || ''}" placeholder="Nom..." />
        <label>Date echeance</label>
        <input type="date" class="card-field" data-field="cardDueDate" value="${el.cardDueDate || ''}" />
        <label>Description</label>
        <textarea class="card-field card-desc" data-field="cardDescription" placeholder="Description detaillee...">${el.cardDescription || ''}</textarea>
        <label>Checklist</label>
        <div class="card-checklist-editor"></div>
        <button class="list-add-btn card-add-check">+ Ajouter un element</button>
      </div>
    `;

    // Render checklist
    const renderChecklist = () => {
      if (!el.cardChecklist) el.cardChecklist = [];
      const container = panel.querySelector('.card-checklist-editor');
      container.innerHTML = el.cardChecklist.map((item, i) => `
        <div class="list-item-row">
          <input type="checkbox" ${item.checked ? 'checked' : ''} data-chk-idx="${i}" />
          <input type="text" class="list-item-input" data-chk-text-idx="${i}" value="${(item.text || '').replace(/"/g, '&quot;')}" placeholder="Sous-tache..." />
          <button class="list-item-del" data-chk-del="${i}">&times;</button>
        </div>
      `).join('');

      container.querySelectorAll('[data-chk-idx]').forEach(cb => {
        cb.addEventListener('change', () => {
          const idx = parseInt(cb.dataset.chkIdx);
          const old = deepClone(el.cardChecklist);
          el.cardChecklist[idx].checked = cb.checked;
          const ops = [{ type: 'update', elementId: el.id, props: { cardChecklist: deepClone(el.cardChecklist) } }];
          const inverseOps = [{ type: 'update', elementId: el.id, props: { cardChecklist: old } }];
          this.history.push(ops, inverseOps);
          this.sync.sendOps(ops);
          this.renderer.markDirty();
        });
      });

      container.querySelectorAll('[data-chk-text-idx]').forEach(input => {
        input.addEventListener('input', () => {
          const idx = parseInt(input.dataset.chkTextIdx);
          el.cardChecklist[idx].text = input.value;
          const ops = [{ type: 'update', elementId: el.id, props: { cardChecklist: deepClone(el.cardChecklist) } }];
          this.sync.sendOps(ops);
          this.renderer.markDirty();
        });
        input.addEventListener('keydown', (e) => e.stopPropagation());
      });

      container.querySelectorAll('[data-chk-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.chkDel);
          const old = deepClone(el.cardChecklist);
          el.cardChecklist.splice(idx, 1);
          const ops = [{ type: 'update', elementId: el.id, props: { cardChecklist: deepClone(el.cardChecklist) } }];
          const inverseOps = [{ type: 'update', elementId: el.id, props: { cardChecklist: old } }];
          this.history.push(ops, inverseOps);
          this.sync.sendOps(ops);
          this.renderer.markDirty();
          renderChecklist();
        });
      });
    };

    panel.querySelector('.card-add-check').addEventListener('click', () => {
      if (!el.cardChecklist) el.cardChecklist = [];
      el.cardChecklist.push({ text: '', checked: false });
      const ops = [{ type: 'update', elementId: el.id, props: { cardChecklist: deepClone(el.cardChecklist) } }];
      this.sync.sendOps(ops);
      this.renderer.markDirty();
      renderChecklist();
    });

    renderChecklist();

    document.body.appendChild(panel);

    panel.querySelector('.card-editor-close').addEventListener('click', () => {
      panel.remove();
    });

    // Save changes on input
    panel.querySelectorAll('.card-field').forEach(field => {
      const saveField = () => {
        const key = field.dataset.field;
        let value = field.value;
        if (key === 'cardTags') {
          value = value.split(',').map(t => t.trim()).filter(t => t);
        }
        const ops = [{ type: 'update', elementId: el.id, props: { [key]: value } }];
        const inverseOps = [{ type: 'update', elementId: el.id, props: { [key]: el[key] } }];
        el[key] = value;
        this.history.push(ops, inverseOps);
        this.sync.sendOps(ops);
        this.renderer.markDirty();
      };
      field.addEventListener('change', saveField);
      field.addEventListener('input', saveField);
      field.addEventListener('keydown', (e) => e.stopPropagation());
    });
  }

  // List editor
  showListEditor(el) {
    const existing = document.querySelector('.card-editor-panel');
    if (existing) existing.remove();

    if (!el.listItems) el.listItems = [];

    const panel = document.createElement('div');
    panel.className = 'card-editor-panel';

    const renderList = () => {
      panel.innerHTML = `
        <div class="card-editor-header">
          <h3>Liste</h3>
          <button class="card-editor-close">&times;</button>
        </div>
        <div class="card-editor-body">
          <label>Titre</label>
          <input type="text" class="list-title" value="${(el.text || '').replace(/"/g, '&quot;')}" placeholder="Titre..." />
          <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
            <input type="checkbox" id="chkMode" ${el.checkboxMode ? 'checked' : ''} />
            <label for="chkMode" style="margin:0;text-transform:none;font-size:13px">Mode checklist</label>
          </div>
          <label>Elements</label>
          <div class="list-items-editor">
            ${el.listItems.map((item, i) => `
              <div class="list-item-row">
                <input type="text" class="list-item-input" data-idx="${i}" value="${(item.text || '').replace(/"/g, '&quot;')}" placeholder="Element..." />
                <button class="list-item-del" data-idx="${i}">&times;</button>
              </div>
            `).join('')}
          </div>
          <button class="list-add-btn">+ Ajouter un element</button>
        </div>
      `;

      panel.querySelector('.card-editor-close').addEventListener('click', () => panel.remove());

      panel.querySelector('.list-title').addEventListener('input', (e) => {
        e.target.addEventListener('keydown', (ev) => ev.stopPropagation());
        const ops = [{ type: 'update', elementId: el.id, props: { text: e.target.value } }];
        const inverseOps = [{ type: 'update', elementId: el.id, props: { text: el.text } }];
        el.text = e.target.value;
        this.history.push(ops, inverseOps);
        this.sync.sendOps(ops);
        this.renderer.markDirty();
      });
      panel.querySelector('.list-title').addEventListener('keydown', (e) => e.stopPropagation());

      // Checkbox mode toggle
      const chkModeEl = panel.querySelector('#chkMode');
      if (chkModeEl) {
        chkModeEl.addEventListener('change', () => {
          const ops = [{ type: 'update', elementId: el.id, props: { checkboxMode: chkModeEl.checked } }];
          const inverseOps = [{ type: 'update', elementId: el.id, props: { checkboxMode: el.checkboxMode } }];
          el.checkboxMode = chkModeEl.checked;
          this.history.push(ops, inverseOps);
          this.sync.sendOps(ops);
          this.renderer.markDirty();
        });
      }

      panel.querySelectorAll('.list-item-input').forEach(input => {
        input.addEventListener('input', () => {
          const idx = parseInt(input.dataset.idx);
          const old = deepClone(el.listItems);
          el.listItems[idx].text = input.value;
          const ops = [{ type: 'update', elementId: el.id, props: { listItems: deepClone(el.listItems) } }];
          const inverseOps = [{ type: 'update', elementId: el.id, props: { listItems: old } }];
          this.history.push(ops, inverseOps);
          this.sync.sendOps(ops);
          this.renderer.markDirty();
        });
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            const idx = parseInt(input.dataset.idx);
            const old = deepClone(el.listItems);
            el.listItems.splice(idx + 1, 0, { id: generateId(), text: '' });
            const ops = [{ type: 'update', elementId: el.id, props: { listItems: deepClone(el.listItems) } }];
            const inverseOps = [{ type: 'update', elementId: el.id, props: { listItems: old } }];
            this.history.push(ops, inverseOps);
            this.sync.sendOps(ops);
            this.renderer.markDirty();
            renderList();
            const newInput = panel.querySelector(`[data-idx="${idx + 1}"]`);
            if (newInput) newInput.focus();
          }
        });
      });

      panel.querySelectorAll('.list-item-del').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          const old = deepClone(el.listItems);
          el.listItems.splice(idx, 1);
          const ops = [{ type: 'update', elementId: el.id, props: { listItems: deepClone(el.listItems) } }];
          const inverseOps = [{ type: 'update', elementId: el.id, props: { listItems: old } }];
          this.history.push(ops, inverseOps);
          this.sync.sendOps(ops);
          this.renderer.markDirty();
          renderList();
        });
      });

      panel.querySelector('.list-add-btn').addEventListener('click', () => {
        const old = deepClone(el.listItems);
        el.listItems.push({ id: generateId(), text: '' });
        const ops = [{ type: 'update', elementId: el.id, props: { listItems: deepClone(el.listItems) } }];
        const inverseOps = [{ type: 'update', elementId: el.id, props: { listItems: old } }];
        this.history.push(ops, inverseOps);
        this.sync.sendOps(ops);
        this.renderer.markDirty();
        renderList();
        const inputs = panel.querySelectorAll('.list-item-input');
        if (inputs.length > 0) inputs[inputs.length - 1].focus();
      });
    };

    renderList();
    document.body.appendChild(panel);
  }

  // Animated view transition
  animateToView(targetX, targetY, targetZoom) {
    targetZoom = targetZoom || this.renderer.camera.zoom;
    const startX = this.renderer.camera.x;
    const startY = this.renderer.camera.y;
    const startZoom = this.renderer.camera.zoom;
    const startTime = Date.now();
    const duration = 500; // ms

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      // Ease in-out
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      this.renderer.camera.x = lerp(startX, targetX, ease);
      this.renderer.camera.y = lerp(startY, targetY, ease);
      this.renderer.camera.zoom = lerp(startZoom, targetZoom, ease);
      this.renderer.markDirty();
      this.updateZoomDisplay();

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }

  // Handle click on element during voting
  handleVoteClick(worldX, worldY) {
    if (!this.workshop || !this.workshop.isVotingActive()) return false;

    const hit = this.renderer.hitTest(worldX, worldY);
    if (hit && (hit.type === 'sticky' || hit.type === 'rect' || hit.type === 'text')) {
      return this.workshop.castVote(hit.id);
    }
    return false;
  }

  updateZoomDisplay() {
    const pct = Math.round(this.renderer.camera.zoom * 100);
    document.getElementById('zoomLevel').textContent = pct + '%';
  }

  updateUsersPanel() {
    const panel = document.getElementById('usersPanel');
    const count = this.renderer.remoteUsers.size + 1;
    let html = '';

    // My avatar
    const myFac = this.isFacilitator ? ' facilitator' : '';
    html += `<div class="user-avatar${myFac}" style="background:${this.myColor}" title="${this.userName} (Vous)">${(this.userName || '').slice(0, 2).toUpperCase()}</div>`;

    // Remote users
    for (const [userId, user] of this.renderer.remoteUsers) {
      const fac = user.isFacilitator ? ' facilitator' : '';
      html += `<div class="user-avatar${fac}" style="background:${user.color}" title="${user.name}">${(user.name || '').slice(0, 2).toUpperCase()}</div>`;
    }

    html += `<span class="users-count">${count} en ligne</span>`;
    panel.innerHTML = html;

    // Click on users panel to show dropdown
    panel.onclick = () => this.showUsersDropdown();
  }

  showUsersDropdown() {
    // Remove existing
    const existing = document.querySelector('.users-dropdown');
    if (existing) { existing.remove(); return; }

    const dropdown = document.createElement('div');
    dropdown.className = 'users-dropdown';

    // Me
    const myItem = document.createElement('div');
    myItem.className = 'users-dropdown-item';
    myItem.innerHTML = `<span class="user-dot" style="background:${this.myColor}"></span>${this.userName} (Vous)${this.isFacilitator ? '<span class="user-role">Animateur</span>' : ''}`;
    dropdown.appendChild(myItem);

    // Remote users
    for (const [userId, user] of this.renderer.remoteUsers) {
      const item = document.createElement('div');
      item.className = 'users-dropdown-item';
      item.innerHTML = `<span class="user-dot" style="background:${user.color}"></span>${user.name || userId}${user.isFacilitator ? '<span class="user-role">Animateur</span>' : ''}`;
      item.addEventListener('click', () => {
        this.sync.send({ type: 'goto-user', targetUserId: userId });
        dropdown.remove();
      });
      dropdown.appendChild(item);
    }

    // Claim facilitator option
    if (!this.isFacilitator) {
      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:var(--panel-border);margin:4px 0;';
      dropdown.appendChild(sep);

      const claimBtn = document.createElement('div');
      claimBtn.className = 'users-dropdown-item';
      claimBtn.style.color = 'var(--warning)';
      claimBtn.textContent = 'Devenir animateur';
      claimBtn.addEventListener('click', () => {
        this.sync.send({ type: 'claim-facilitator' });
        dropdown.remove();
      });
      dropdown.appendChild(claimBtn);
    }

    document.body.appendChild(dropdown);

    setTimeout(() => {
      document.addEventListener('pointerdown', function handler(e) {
        if (!dropdown.contains(e.target)) {
          dropdown.remove();
          document.removeEventListener('pointerdown', handler);
        }
      });
    }, 0);
  }

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  showContextMenu(screenX, screenY, worldX, worldY) {
    this.hideContextMenu();

    const hit = this.renderer.hitTest(worldX, worldY);
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = screenX + 'px';
    menu.style.top = screenY + 'px';

    if (hit) {
      if (!this.renderer.selectedIds.has(hit.id)) {
        this.renderer.selectedIds.clear();
        this.renderer.selectedIds.add(hit.id);
        this.renderer.markDirty();
      }

      const isLocked = hit.locked;
      const multiSel = this.renderer.selectedIds.size > 1;
      const isGrouped = hit.groupId;

      menu.innerHTML = `
        <div class="context-menu-item" data-action="copy">Copier <span class="shortcut-hint">Ctrl+C</span></div>
        <div class="context-menu-item" data-action="duplicate">Dupliquer <span class="shortcut-hint">Ctrl+D</span></div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="${isLocked ? 'unlock' : 'lock'}">${isLocked ? '🔓 Deverrouiller' : '🔒 Verrouiller'}</div>
        ${multiSel ? `<div class="context-menu-item" data-action="group">📦 Grouper <span class="shortcut-hint">Ctrl+G</span></div>` : ''}
        ${isGrouped ? `<div class="context-menu-item" data-action="ungroup">📤 Degrouper <span class="shortcut-hint">Ctrl+Shift+G</span></div>` : ''}
        ${hit.rotation ? `<div class="context-menu-item" data-action="resetRotation">↺ Remettre a 0°</div>` : ''}
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="front">Mettre devant</div>
        <div class="context-menu-item" data-action="back">Mettre derriere</div>
        ${multiSel ? `
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="alignTop">↑ Aligner en haut</div>
        <div class="context-menu-item" data-action="alignLeft">← Aligner a gauche</div>
        <div class="context-menu-item" data-action="alignCenterH">↔ Centrer horizontalement</div>
        <div class="context-menu-item" data-action="distributeH">⇔ Distribuer horizontalement</div>
        ` : ''}
        ${hit.type === 'envelope' ? `
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="toggleCollapse">${hit.collapsed ? '▼ Etendre' : '▶ Reduire'}</div>
        <div class="context-menu-item" data-action="deleteWithContent" style="color:var(--danger)">Supprimer avec le contenu</div>
        ` : ''}
        ${hit.type === 'card' ? `<div class="context-menu-separator"></div><div class="context-menu-item" data-action="editCard">✏️ Modifier la carte</div>` : ''}
        ${hit.type === 'list' ? `<div class="context-menu-separator"></div><div class="context-menu-item" data-action="editList">✏️ Modifier la liste</div>` : ''}
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="comment">💬 Commenter</div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="delete" style="color:var(--danger)">Supprimer <span class="shortcut-hint">Suppr</span></div>
      `;
    } else {
      menu.innerHTML = `
        <div class="context-menu-item" data-action="paste">Coller <span class="shortcut-hint">Ctrl+V</span></div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="selectAll">Tout selectionner <span class="shortcut-hint">Ctrl+A</span></div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="addAnchor">📌 Ajouter une ancre ici</div>
        <div class="context-menu-item" data-action="addCanvasComment">💬 Ajouter un commentaire</div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="resetView">Reinitialiser la vue</div>
      `;
    }

    document.body.appendChild(menu);
    this.contextMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (screenX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (screenY - rect.height) + 'px';
    }

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;
      const action = item.dataset.action;

      switch (action) {
        case 'copy': this.copySelected(); break;
        case 'duplicate': this.duplicateSelected(); break;
        case 'delete': this.deleteSelected(); break;
        case 'paste': this.paste(); break;
        case 'selectAll': this.selectAll(); break;
        case 'addAnchor':
          if (this.workshop) this.workshop.addAnchorHere();
          break;
        case 'front':
          this.updateSelectedElements({ zIndex: Date.now() + 1000 });
          break;
        case 'back':
          this.updateSelectedElements({ zIndex: 1 });
          break;
        case 'resetView':
          this.renderer.camera = { x: 0, y: 0, zoom: 1 };
          this.renderer.markDirty();
          this.updateZoomDisplay();
          break;
        case 'lock':
          this.updateSelectedElements({ locked: true });
          this.showToast('Objet verrouille');
          break;
        case 'unlock':
          this.updateSelectedElements({ locked: false });
          this.showToast('Objet deverrouille');
          break;
        case 'group':
          this.groupSelected();
          break;
        case 'ungroup':
          this.ungroupSelected();
          break;
        case 'resetRotation':
          this.updateSelectedElements({ rotation: 0 });
          break;
        case 'alignTop':
          this.alignSelected('top');
          break;
        case 'alignLeft':
          this.alignSelected('left');
          break;
        case 'alignCenterH':
          this.alignSelected('centerH');
          break;
        case 'distributeH':
          this.distributeSelected('horizontal');
          break;
        case 'toggleCollapse':
          this.toggleEnvelopeCollapse(hit);
          break;
        case 'deleteWithContent':
          this.deleteEnvelopeWithContent(hit);
          break;
        case 'editCard':
          this.showCardEditor(hit);
          break;
        case 'editList':
          this.showListEditor(hit);
          break;
        case 'comment':
          this.addComment(hit);
          break;
        case 'addCanvasComment':
          this.addCanvasComment(worldX, worldY);
          break;
      }
      this.hideContextMenu();
    });

    setTimeout(() => {
      document.addEventListener('pointerdown', this._closeMenu = () => {
        this.hideContextMenu();
      }, { once: true });
    }, 0);
  }

  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
    if (this._closeMenu) {
      document.removeEventListener('pointerdown', this._closeMenu);
      this._closeMenu = null;
    }
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  window.app = new DarkBoardApp();
});
