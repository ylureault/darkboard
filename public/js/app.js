// Main application - wires everything together
class DarkBoardApp {
  constructor() {
    this.currentTool = 'select';
    this.currentFill = 'transparent';
    this.currentStroke = '#ffffff';
    this.currentStrokeWidth = 2;
    this.myColor = '#4a9eff';
    this.clipboard = [];
    this.textEditElement = null;

    // Init canvas renderer
    this.renderer = new CanvasRenderer(document.getElementById('canvas'));

    // Init history
    this.history = new History();

    // Init sync
    this.sync = new SyncClient(this);
    this.sync.connect();

    // Init input
    this.input = new InputHandler(this);

    // Init UI
    this.ui = new UI(this);

    // Update title
    document.title = `DarkBoard - ${getBoardId()}`;

    // Image drag-and-drop
    this.initDragDrop();
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

      const world = this.renderer.screenToWorld(e.clientX, e.clientY);

      for (const file of files) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            // Scale down large images
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
    const ops = [];
    const inverseOps = [];
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el) {
        ops.push({ type: 'delete', elementId: id });
        inverseOps.push({ type: 'add', elementId: id, element: deepClone(el) });
      }
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

  duplicateSelected() {
    this.copySelected();
    this.paste();
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

  startTextEdit(el) {
    this.textEditElement = el;
    const screen = this.renderer.worldToScreen(el.x, el.y);
    const zoom = this.renderer.camera.zoom;

    const textarea = document.createElement('textarea');
    textarea.className = 'text-edit-overlay';
    textarea.value = el.text || '';
    textarea.style.left = screen.x + 'px';
    textarea.style.top = screen.y + 'px';
    textarea.style.width = (el.width * zoom) + 'px';
    textarea.style.height = (el.height * zoom) + 'px';
    textarea.style.fontSize = ((el.fontSize || 16) * zoom) + 'px';
    textarea.style.lineHeight = '1.4';

    if (el.type === 'sticky') {
      textarea.style.background = el.fill || '#FFD966';
      textarea.style.color = '#1a1a1a';
      textarea.style.padding = (14 * zoom) + 'px';
      textarea.style.borderColor = 'rgba(0,0,0,0.2)';
    } else if (el.type === 'frame') {
      const titleH = ((el.fontSize || 16) + 16) * zoom;
      textarea.style.left = screen.x + 'px';
      textarea.style.top = (screen.y - titleH) + 'px';
      textarea.style.width = (el.width * zoom) + 'px';
      textarea.style.height = titleH + 'px';
      textarea.style.background = el.stroke || '#4a9eff';
      textarea.style.color = 'white';
      textarea.style.fontWeight = 'bold';
      textarea.style.padding = (8 * zoom) + 'px';
    } else if (el.type === 'rect' || el.type === 'circle') {
      textarea.style.background = 'rgba(30,30,30,0.9)';
      textarea.style.color = '#e0e0e0';
      textarea.style.textAlign = 'center';
      // Init text prop if needed
      if (!el.text) el.text = '';
    } else {
      textarea.style.background = 'rgba(30,30,30,0.9)';
      textarea.style.color = '#e0e0e0';
    }

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const finishEdit = () => {
      const newText = textarea.value;
      if (newText !== el.text) {
        const ops = [{ type: 'update', elementId: el.id, props: { text: newText } }];
        const inverseOps = [{ type: 'update', elementId: el.id, props: { text: el.text } }];
        el.text = newText;

        // Auto-resize height for text elements
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
      textarea.remove();
      this.textEditElement = null;
      this.renderer.markDirty();
    };

    textarea.addEventListener('blur', finishEdit);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        textarea.blur();
      }
      // Allow Enter in stickies (multiline), but finish on Enter for single-line text/frame/shapes
      if (e.key === 'Enter' && (el.type === 'text' || el.type === 'frame' || el.type === 'rect' || el.type === 'circle') && !e.shiftKey) {
        e.preventDefault();
        textarea.blur();
      }
      e.stopPropagation();
    });
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
    html += `<div class="user-avatar" style="background:${this.myColor}">${getSessionId().slice(0, 2).toUpperCase()}</div>`;

    // Remote users
    for (const [userId, user] of this.renderer.remoteUsers) {
      html += `<div class="user-avatar" style="background:${user.color}" title="${user.name}">${(user.name || '').slice(0, 2).toUpperCase()}</div>`;
    }

    html += `<span class="users-count">${count} en ligne</span>`;
    panel.innerHTML = html;
  }

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  showContextMenu(screenX, screenY, worldX, worldY) {
    // Remove existing
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

      menu.innerHTML = `
        <div class="context-menu-item" data-action="copy">Copier <span class="shortcut-hint">Ctrl+C</span></div>
        <div class="context-menu-item" data-action="duplicate">Dupliquer <span class="shortcut-hint">Ctrl+D</span></div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="front">Mettre devant</div>
        <div class="context-menu-item" data-action="back">Mettre derriere</div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="delete" style="color:var(--danger)">Supprimer <span class="shortcut-hint">Suppr</span></div>
      `;
    } else {
      menu.innerHTML = `
        <div class="context-menu-item" data-action="paste">Coller <span class="shortcut-hint">Ctrl+V</span></div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="selectAll">Tout selectionner <span class="shortcut-hint">Ctrl+A</span></div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="resetView">Reinitialiser la vue</div>
      `;
    }

    document.body.appendChild(menu);
    this.contextMenu = menu;

    // Keep menu in viewport
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
      }
      this.hideContextMenu();
    });

    // Close on click outside
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
