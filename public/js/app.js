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

    // Image drag-and-drop
    this.initDragDrop();

    // Cursor timeout
    this.initCursorTimeout();

    // Render vote badges
    this.initVoteRenderer();

    // Show name dialog
    this.showNameDialog();
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
    const ops = [];
    const inverseOps = [];
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el) {
        ops.push({ type: 'delete', elementId: id });
        inverseOps.push({ type: 'add', elementId: id, element: deepClone(el) });

        // If deleting an envelope, also remove children references
        if (el.type === 'envelope' && el.children) {
          // Children stay on canvas, just lose their parent
        }
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
    } else if (el.type === 'envelope') {
      // Edit envelope title in header bar
      const headerH = 36 * zoom;
      textarea.style.left = (screen.x + 30 * zoom) + 'px';
      textarea.style.top = screen.y + 'px';
      textarea.style.width = ((el.width - 60) * zoom) + 'px';
      textarea.style.height = headerH + 'px';
      textarea.style.background = el.stroke || '#4a9eff';
      textarea.style.color = 'white';
      textarea.style.fontWeight = 'bold';
      textarea.style.padding = (8 * zoom) + 'px';
    } else if (el.type === 'rect' || el.type === 'circle') {
      textarea.style.background = 'rgba(30,30,30,0.9)';
      textarea.style.color = '#e0e0e0';
      textarea.style.textAlign = 'center';
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
      if (e.key === 'Enter' && (el.type === 'text' || el.type === 'frame' || el.type === 'rect' || el.type === 'circle' || el.type === 'envelope') && !e.shiftKey) {
        e.preventDefault();
        textarea.blur();
      }
      e.stopPropagation();
    });
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
        <div class="context-menu-item" data-action="addAnchor">Ajouter une ancre ici</div>
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
