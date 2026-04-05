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
    this.updateTitle();

    // Sticky color cycling (sequential instead of random)
    this.lastStickyColor = null;
    this.stickyColorIndex = 0;

    // Toast queue for stacked toasts
    this._toastQueue = [];
    this._toastActiveCount = 0;

    // Hover tooltip state
    this._hoverTooltipTimer = null;
    this._hoverTooltip = null;
    this.initHoverTooltip();

    // Unsaved changes tracking
    this.hasUnsavedChanges = false;
    window.addEventListener('beforeunload', (e) => {
      if (this.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

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

    // Init chat
    this.initChat();

    // Init audio (WebRTC)
    this.initAudio();

    // Init floating toolbar
    this.initFloatingToolbar();

    // Init tag filter
    this.initTagFilter();

    // Init embed click handler
    this.initEmbedHandler();

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
    this.updateSelectionCount();
  }

  updateSelectionCount() {
    const el = document.getElementById('selectionCount');
    if (!el) return;
    const count = this.renderer.selectedIds.size;
    if (count > 0) {
      // #89 - Show count and types in selection info
      if (count === 1) {
        const selEl = this.renderer.elements.get([...this.renderer.selectedIds][0]);
        const typeLabels = { sticky: 'post-it', text: 'texte', rect: 'rectangle', circle: 'cercle', line: 'ligne', arrow: 'fleche', frame: 'cadre', envelope: 'enveloppe', connector: 'connecteur', diamond: 'losange', triangle: 'triangle', card: 'carte', list: 'liste', image: 'image', freehand: 'dessin', mindmap: 'mindmap', embed: 'embed' };
        el.textContent = selEl ? (typeLabels[selEl.type] || selEl.type) : '1 objet';
      } else {
        const typeCounts = {};
        const typeLabels = { sticky: 'post-it', rect: 'rectangle', circle: 'cercle', text: 'texte', card: 'carte', line: 'ligne', arrow: 'fleche', connector: 'connecteur', frame: 'cadre', image: 'image', list: 'liste' };
        for (const id of this.renderer.selectedIds) {
          const selEl = this.renderer.elements.get(id);
          if (selEl) { typeCounts[selEl.type] = (typeCounts[selEl.type] || 0) + 1; }
        }
        const parts = Object.entries(typeCounts).map(([t, c]) => `${c} ${typeLabels[t] || t}${c > 1 ? 's' : ''}`);
        el.textContent = parts.length <= 3 ? parts.join(', ') : `${count} objets`;
      }
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }

  showNameDialog() {
    const boardId = getBoardId();
    const dialog = document.getElementById('nameDialog');
    const input = document.getElementById('nameInput');
    const submit = document.getElementById('nameSubmit');

    // Pre-fill with saved name if available
    const savedName = localStorage.getItem('darkboard-name');
    if (savedName) {
      input.value = savedName;
    }

    // #129 - Avatar color picker
    const colorPicker = document.getElementById('avatarColorPicker');
    if (colorPicker) {
      const savedColor = localStorage.getItem('darkboard-avatar-color');
      if (savedColor) {
        colorPicker.querySelectorAll('.avatar-color-swatch').forEach(s => {
          s.classList.toggle('selected', s.dataset.color === savedColor);
        });
        this.myColor = savedColor;
      }
      colorPicker.addEventListener('click', (e) => {
        const swatch = e.target.closest('.avatar-color-swatch');
        if (!swatch) return;
        colorPicker.querySelectorAll('.avatar-color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        this.myColor = swatch.dataset.color;
        localStorage.setItem('darkboard-avatar-color', swatch.dataset.color);
      });
    }

    // Set up event listeners immediately so the dialog is always functional
    const joinWithName = () => {
      if (this._joined) return; // prevent double-join
      const name = input.value.trim() || `User ${getSessionId().slice(0, 4)}`;
      this.userName = name;
      localStorage.setItem('darkboard-name', name);
      dialog.style.display = 'none';
      this._joined = true;
      // #157 - prevent double-submit
      submit.classList.add('submitting');
      this.sync.connect();
    };

    submit.addEventListener('click', joinWithName);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinWithName();
      e.stopPropagation();
    });

    // Check if the board exists
    fetch(`/api/board/${boardId}`)
      .then(res => {
        if (res.ok) {
          // Board exists — auto-join if name saved, otherwise show dialog
          if (savedName) {
            joinWithName();
          } else {
            dialog.style.display = 'flex';
            input.focus();
          }
        } else if (res.status === 404) {
          // Board doesn't exist — propose creation
          this.showBoardNotFound(boardId, joinWithName);
        } else {
          if (savedName) { joinWithName(); }
          else { dialog.style.display = 'flex'; input.focus(); }
        }
      })
      .catch(() => {
        if (savedName) { joinWithName(); }
        else { dialog.style.display = 'flex'; input.focus(); }
      });
  }

  showBoardNotFound(boardId, onCreated) {
    const nameDialog = document.getElementById('nameDialog');
    const notFoundDialog = document.getElementById('boardNotFoundDialog');
    nameDialog.style.display = 'none';
    notFoundDialog.style.display = 'flex';
    document.getElementById('notFoundBoardId').textContent = boardId;

    document.getElementById('createBoardBtn').addEventListener('click', () => {
      fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: boardId })
      })
        .then(res => res.json())
        .then(() => {
          notFoundDialog.style.display = 'none';
          this.showToast('Board cree !');
          const savedName = localStorage.getItem('darkboard-name');
          if (savedName) {
            onCreated();
          } else {
            nameDialog.style.display = 'flex';
            document.getElementById('nameInput').focus();
          }
        })
        .catch(() => {
          this.showToast('Erreur lors de la creation du board');
        });
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
      const allFiles = Array.from(e.dataTransfer.files);
      if (allFiles.length === 0) return;
      const files = allFiles.filter(f => f.type.startsWith('image/'));
      if (files.length === 0) {
        this.showToast('Format de fichier non supporte. Utilisez une image (PNG, JPG, GIF, SVG).');
        return;
      }
      if (files.length < allFiles.length) {
        this.showToast('Certains fichiers ignores (format non supporte)');
      }

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
      const isEditing = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable;

      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;

      // Read HTML and text first to detect structured data from apps like Miro
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');

      // Detect if this paste comes from a whiteboard/collaboration app
      const isFromApp = html && (
        html.includes('miro-data-v1') ||
        html.includes('miro.com') ||
        html.includes('mural.co') ||
        html.includes('figjam') ||
        html.includes('figma') ||
        html.includes('lucidspark') ||
        html.includes('draft.io') ||
        html.includes('data-pm-slice')  // ProseMirror-based editors
      );

      // If editing text and it's not from an app, let the browser handle it
      if (isEditing && !isFromApp) return;

      // If it's from a known app, ALWAYS prefer HTML parsing over image
      // (these apps put a screenshot image + structured HTML — we want the HTML)
      if (!isFromApp) {
        // Check for pure image paste (screenshots, images copied from browser)
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            // Only treat as image if there's no meaningful text/HTML alongside
            const hasText = text && text.trim().length > 0;
            const hasStructuredHTML = html && (
              html.includes('<table') ||
              html.includes('<li') ||
              html.includes('<p>')
            );
            if (!hasText && !hasStructuredHTML) {
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
        }
      }

      // If text pasted on canvas, create stickies
      // html and text already read above
      if ((html || text) && this.clipboard.length === 0) {
        e.preventDefault();
        const cx = this.renderer.camera.x;
        const cy = this.renderer.camera.y;

        // Try to parse Miro clipboard data or HTML tables
        const parsed = this.parseClipboardHTML(html, text);

        if (parsed && parsed.length > 0) {
          this.renderer.selectedIds.clear();
          const gap = 16;
          const stickyW = 200;
          const stickyH = 200;
          const perRow = Math.min(parsed.length, 5);

          for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i];
            const col = i % perRow;
            const row = Math.floor(i / perRow);
            const el = createSticky(
              cx - (perRow * (stickyW + gap)) / 2 + col * (stickyW + gap),
              cy - 100 + row * (stickyH + gap)
            );
            el.text = item.text;
            if (item.color) el.fill = item.color;
            this.addElement(el);
            this.renderer.selectedIds.add(el.id);
          }
          if (parsed.length > 1) {
            this.showToast(`${parsed.length} post-its colles`);
          }
        } else if (text) {
          // #118 - Detect image URL paste and create image element
          const trimmed = text.trim();
          if (/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(trimmed)) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              let w = img.width, h = img.height;
              const maxSize = 600;
              if (w > maxSize || h > maxSize) {
                const scale = maxSize / Math.max(w, h);
                w *= scale; h *= scale;
              }
              const imgEl = createImageElement(cx - w / 2, cy - h / 2, w, h, trimmed);
              imgEl.imageUrl = trimmed; // store URL reference
              this.addElement(imgEl);
              this.renderer.selectedIds.clear();
              this.renderer.selectedIds.add(imgEl.id);
              this.renderer.markDirty();
              this.showToast('Image collee depuis URL');
            };
            img.onerror = () => {
              // Fallback to sticky if image fails to load
              const el = createSticky(cx - 100, cy - 100);
              el.text = trimmed;
              this.addElement(el);
              this.renderer.selectedIds.add(el.id);
              this.renderer.markDirty();
            };
            img.src = trimmed;
            this.renderer.markDirty();
            return;
          }

          // Fallback: plain text
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          this.renderer.selectedIds.clear();

          if (lines.length <= 1) {
            const el = createSticky(cx - 100, cy - 100);
            el.text = text.trim();
            this.addElement(el);
            this.renderer.selectedIds.add(el.id);
          } else {
            // Smart grid paste: 5 per row centered on camera
            const gap = 16;
            const stickyW = 200;
            const stickyH = 200;
            const perRow = Math.min(lines.length, 5);
            for (let i = 0; i < lines.length; i++) {
              const col = i % perRow;
              const row = Math.floor(i / perRow);
              const el = createSticky(
                cx - (perRow * (stickyW + gap)) / 2 + col * (stickyW + gap),
                cy - 100 + row * (stickyH + gap)
              );
              el.text = lines[i];
              this.addElement(el);
              this.renderer.selectedIds.add(el.id);
            }
            this.showToast(`${lines.length} \u00e9l\u00e9ments coll\u00e9s`);
          }
        }
        this.renderer.markDirty();
      }
    });
  }

  /**
   * Parse HTML clipboard data from Miro, Excel, Google Sheets, or generic HTML.
   * Returns array of { text, color } objects, or null if not parseable.
   */
  parseClipboardHTML(html, plainText) {
    if (!html) return null;

    // Miro color name → hex mapping
    const MIRO_COLORS = {
      'light_yellow': '#FFD966', 'yellow': '#F5D128', 'orange': '#FF9D48',
      'light_green': '#93D275', 'green': '#4DB050', 'dark_green': '#2D8B4E',
      'cyan': '#45B7D1', 'light_pink': '#F5A0C0', 'pink': '#FF6B9D',
      'violet': '#B384DB', 'red': '#FF6B6B', 'light_blue': '#7BC4FF',
      'blue': '#4A9EFF', 'dark_blue': '#2E5AAC', 'gray': '#B0B0B0',
      'black': '#4A4A4A'
    };

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const results = [];

    // ── 1. Detect Miro clipboard ──
    const isMiro = html.includes('miro-data-v1') || html.includes('miro.com');

    if (isMiro) {
      // Strategy A: try to find colored blocks (Miro wraps stickies in styled divs)
      const allDivs = doc.body.querySelectorAll('div');
      const coloredBlocks = [];
      for (const div of allDivs) {
        const bg = div.style?.backgroundColor || '';
        const hasBg = bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
        if (hasBg) {
          const text = (div.textContent || '').trim();
          if (text) coloredBlocks.push({ text, color: bg });
        }
      }

      if (coloredBlocks.length > 0) {
        // Deduplicate (nested divs may repeat same text)
        const seen = new Set();
        for (const block of coloredBlocks) {
          if (!seen.has(block.text)) {
            seen.add(block.text);
            results.push(block);
          }
        }
        return results;
      }

      // Strategy B: top-level divs after the <span data-meta>
      // Miro HTML: <span data-meta="<--(miro-data-v1)...">  <div>..text..</div>  <div>..text..</div>
      const topDivs = doc.body.querySelectorAll(':scope > div');
      for (const div of topDivs) {
        const text = (div.textContent || '').trim();
        if (!text) continue;
        // Try to extract color from inline styles anywhere inside
        let color = null;
        const bgMatch = div.innerHTML.match(/background(?:-color)?:\s*([^;"]+)/i);
        if (bgMatch) color = bgMatch[1].trim();
        const fillMatch = div.innerHTML.match(/data-fill-color="([^"]+)"/i);
        if (fillMatch && MIRO_COLORS[fillMatch[1]]) color = MIRO_COLORS[fillMatch[1]];
        results.push({ text, color });
      }

      // Strategy C: use plain text — split by double newlines (each sticky is separated)
      // Miro text/plain typically separates stickies with blank lines
      if (results.length === 0 && plainText) {
        // Split by double newlines first (Miro separator between stickies)
        let chunks = plainText.split(/\n\s*\n/).map(c => c.trim()).filter(c => c.length > 0);
        // If only one chunk, try single newlines
        if (chunks.length <= 1) {
          chunks = plainText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        }
        for (const chunk of chunks) {
          results.push({ text: chunk, color: null });
        }
      }

      return results.length > 0 ? results : null;
    }

    // ── 2. Detect other whiteboard apps (Mural, FigJam, etc.) ──
    const isWhiteboardApp = html.includes('mural.co') || html.includes('figjam') ||
      html.includes('figma') || html.includes('lucidspark') || html.includes('draft.io');

    if (isWhiteboardApp && plainText) {
      // Same strategy as Miro fallback: split by double newlines or single newlines
      let chunks = plainText.split(/\n\s*\n/).map(c => c.trim()).filter(c => c.length > 0);
      if (chunks.length <= 1) {
        chunks = plainText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      }
      for (const chunk of chunks) {
        results.push({ text: chunk, color: null });
      }
      return results.length > 0 ? results : null;
    }

    // ── 3. Detect HTML table (Excel, Google Sheets) ──
    const tables = doc.querySelectorAll('table');
    if (tables.length > 0) {
      const table = tables[0];
      const cells = table.querySelectorAll('td, th');
      for (const cell of cells) {
        const text = (cell.textContent || '').trim();
        if (!text) continue;
        let color = null;
        const bg = cell.style?.backgroundColor || cell.getAttribute('bgcolor');
        if (bg) color = bg;
        results.push({ text, color });
      }
      return results.length > 0 ? results : null;
    }

    // ── 4. Tab-separated data (spreadsheet copy) ──
    if (plainText && plainText.includes('\t')) {
      const cells = plainText.split(/[\t\n]/).map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length > 1) {
        for (const cell of cells) {
          results.push({ text: cell, color: null });
        }
        return results;
      }
    }

    // ── 5. Generic HTML with multiple block elements ──
    const blocks = doc.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6');
    if (blocks.length > 1) {
      for (const block of blocks) {
        const text = (block.textContent || '').trim();
        if (!text) continue;
        results.push({ text, color: null });
      }
      return results.length > 1 ? results : null;
    }

    return null;
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
    // #141 - Remember last used tool per session
    if (name !== 'hand' && name !== 'eraser' && name !== 'select') {
      localStorage.setItem('darkboard-last-tool', name);
    }
    // #130 - Show contextual hint at cursor
    this._showToolCursorHint(name);
  }

  addElement(el) {
    const ops = [{ type: 'add', elementId: el.id, element: el }];
    const inverseOps = [{ type: 'delete', elementId: el.id }];
    this.renderer.elements.set(el.id, el);
    this.history.push(ops, inverseOps);
    this.sync.sendOps(ops);
    this.renderer.markDirty();
    this.hasUnsavedChanges = true;
    this.updateTitle();
    if (this.ui) this.ui.updateUndoRedoButtons();
    this.updateEmptyHint();
    // #131 - Success creation flash
    this._flashCreatedElement(el);
    // #139 - Element count milestone
    this._checkElementMilestone();
    // #112 - Element count limit warning at 4000
    const elCount = this.renderer.elements.size;
    if (elCount === 4000) {
      this.showToast('Attention: 4000 elements sur le tableau. Performances potentiellement degradees.');
    }
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
    this.updateTitle();
    this.updateEmptyHint();
    // Update tag filter bar
    if (this._updateTagFilterBar) this._updateTagFilterBar();
  }

  deleteSelected() {
    if (this.renderer.selectedIds.size === 0) return;

    // Check if deleting an envelope/frame with many children — confirm first
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el && (el.type === 'envelope' || el.type === 'frame') && el.children && el.children.length > 10) {
        this.showConfirmDialog(
          `Cette zone contient ${el.children.length} objets. Supprimer la zone uniquement ou tout supprimer (${el.children.length} objets) ?`,
          [
            { label: 'Zone uniquement', action: () => this._doDeleteSelected() },
            { label: `Tout supprimer (${el.children.length})`, className: 'confirm-danger', action: () => {
              // Add children to selection for deletion
              for (const childId of el.children) {
                this.renderer.selectedIds.add(childId);
              }
              this._doDeleteSelected();
            }},
            { label: 'Annuler', action: () => {} }
          ]
        );
        return;
      }
    }

    // #151 - Confirmation for bulk delete (threshold lowered to 5)
    const unlocked = [...this.renderer.selectedIds].filter(id => {
      const el = this.renderer.elements.get(id);
      return el && !el.locked;
    });
    if (unlocked.length > 5) {
      this.showConfirmDialog(
        `Supprimer ${unlocked.length} objets ?`,
        [
          { label: 'Supprimer', className: 'confirm-danger', action: () => this._doDeleteSelected() },
          { label: 'Annuler', action: () => {} }
        ]
      );
      return;
    }

    this._doDeleteSelected();
  }

  _doDeleteSelected() {
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
    this.hasUnsavedChanges = true;
  }

  showConfirmDialog(message, buttons) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `<p>${message}</p>`;
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    for (const btn of buttons) {
      const b = document.createElement('button');
      b.textContent = btn.label;
      if (btn.className) b.className = btn.className;
      b.addEventListener('click', () => {
        overlay.remove();
        btn.action();
      });
      actions.appendChild(b);
    }
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  undo() {
    const ops = this.history.undo();
    if (ops) {
      this.applyOps(ops);
      this.sync.sendOps(ops);
      // #87 - Multi-level undo info: describe what was undone
      const desc = this._describeOps(ops);
      this.showToast(desc ? `Annule: ${desc}` : 'Annule');
      this.updateTitle();
    }
    if (this.ui) this.ui.updateUndoRedoButtons();
  }

  // #87 - Describe ops for undo/redo toast
  _describeOps(ops) {
    if (!ops || ops.length === 0) return '';
    const deletes = ops.filter(o => o.type === 'delete');
    const adds = ops.filter(o => o.type === 'add');
    const updates = ops.filter(o => o.type === 'update');
    if (deletes.length > 0) return `suppression de ${deletes.length} element${deletes.length > 1 ? 's' : ''}`;
    if (adds.length > 0) return `ajout de ${adds.length} element${adds.length > 1 ? 's' : ''}`;
    if (updates.length > 0) return `modification de ${updates.length} element${updates.length > 1 ? 's' : ''}`;
    return '';
  }

  redo() {
    const ops = this.history.redo();
    if (ops) {
      this.applyOps(ops);
      this.sync.sendOps(ops);
      this.showToast('R\u00e9tabli');
      this.updateTitle();
    }
    if (this.ui) this.ui.updateUndoRedoButtons();
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
    if (this.clipboard.length > 0) {
      this.showToast(`${this.clipboard.length} elements copies`, 'success');
      // #133 - Show "Copie!" near cursor
      this._showCursorFeedback('Copie!');
    }
  }

  paste() {
    if (this.clipboard.length === 0) return;
    this.renderer.selectedIds.clear();
    // #86 - Paste at cursor position if available
    const cx = this._lastMouseWorld ? this._lastMouseWorld.x : this.renderer.camera.x;
    const cy = this._lastMouseWorld ? this._lastMouseWorld.y : this.renderer.camera.y;
    const count = this.clipboard.length;

    if (count > 1) {
      // Smart paste: arrange in grid pattern (5 per row) centered on camera
      const perRow = Math.min(count, 5);
      const gap = 16;
      for (let i = 0; i < count; i++) {
        const orig = this.clipboard[i];
        const el = deepClone(orig);
        el.id = generateId();
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const elW = el.width || 200;
        const elH = el.height || 200;
        el.x = cx - (perRow * (elW + gap)) / 2 + col * (elW + gap);
        el.y = cy - 100 + row * (elH + gap);
        if (el.x2 !== undefined) {
          const dx = el.x - orig.x;
          const dy = el.y - orig.y;
          el.x2 = orig.x2 + dx;
          el.y2 = orig.y2 + dy;
        }
        if (el.points) {
          const dx = el.x - orig.x;
          const dy = el.y - orig.y;
          el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        }
        el.zIndex = Date.now() + i;
        this.addElement(el);
        this.renderer.selectedIds.add(el.id);
      }
    } else {
      const orig = this.clipboard[0];
      const el = deepClone(orig);
      el.id = generateId();
      el.x += 20;
      el.y += 20;
      if (el.x2 !== undefined) { el.x2 += 20; el.y2 += 20; }
      if (el.points) {
        el.points = el.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
      }
      el.zIndex = Date.now();
      this.addElement(el);
      this.renderer.selectedIds.add(el.id);
    }
    this.showToast(`${count} \u00e9l\u00e9ments coll\u00e9s`);
    this.renderer.markDirty();
  }

  cutSelected() {
    this.copySelected();
    this.deleteSelected();
  }

  duplicateSelected() {
    this.copySelected();
    // #93 - Smart duplicate: remap connector source/target to duplicated elements
    if (this.clipboard.length > 1) {
      const oldIds = new Set(this.clipboard.map(el => el.id));
      const idMap = new Map();
      const newClipboard = [];
      // First pass: assign new IDs
      for (const orig of this.clipboard) {
        const newId = generateId();
        idMap.set(orig.id, newId);
      }
      // Second pass: remap connectors
      for (const orig of this.clipboard) {
        const el = deepClone(orig);
        el.id = idMap.get(orig.id);
        if (el.type === 'connector') {
          if (el.sourceId && idMap.has(el.sourceId)) el.sourceId = idMap.get(el.sourceId);
          if (el.targetId && idMap.has(el.targetId)) el.targetId = idMap.get(el.targetId);
        }
        newClipboard.push(el);
      }
      this.clipboard = newClipboard;
    }
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
      this.hasUnsavedChanges = true;
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

  getFrameChildren(frameId) {
    const frame = this.renderer.elements.get(frameId);
    if (!frame) return [];
    const fb = getElementBounds(frame);
    const children = [];
    for (const [id, el] of this.renderer.elements) {
      if (id === frameId || el.type === 'frame') continue;
      const eb = getElementBounds(el);
      // Element is inside frame if fully contained
      if (eb.x >= fb.x && eb.y >= fb.y &&
          eb.x + eb.w <= fb.x + fb.w && eb.y + eb.h <= fb.y + fb.h) {
        children.push(el);
      }
    }
    return children;
  }

  moveFrameWithChildren(frameId, dx, dy, precomputedChildren) {
    const children = precomputedChildren || this.getFrameChildren(frameId);
    const ops = [];
    const inverseOps = [];
    for (const child of children) {
      // Skip if child is already being moved as part of selection
      if (this.renderer.selectedIds.has(child.id)) continue;
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

    // Intercept paste in contenteditable: strip HTML formatting from external sources
    if (useRichText) {
      editor.addEventListener('paste', (e) => {
        // Ctrl+Shift+V always pastes plain text
        if (e.shiftKey) {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          return;
        }
        // Default Ctrl+V: also strip external HTML (from Word, web pages, etc.)
        const html = e.clipboardData.getData('text/html');
        if (html) {
          // Check if the HTML comes from an external source (not from our own editor)
          const isExternal = html.includes('urn:schemas-microsoft-com') ||
            html.includes('xmlns:o=') || html.includes('class="Mso') ||
            html.includes('data-pm-slice') || html.includes('docs-internal');
          if (isExternal) {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
          }
        }
      });
    }

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
          // Auto-resize other shape types when text overflows
          if (el.type === 'rect' || el.type === 'circle' || el.type === 'diamond' || el.type === 'triangle') {
            const lines = newPlain.split('\n').length;
            const minH = Math.max(el.height, lines * (el.fontSize || 16) * 1.4 + 20);
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

      // If Enter was pressed on a sticky, create a new one below
      if (this._createStickyBelow) {
        const src = this._createStickyBelow;
        this._createStickyBelow = null;
        const gap = 16;
        const newEl = createSticky(src.x, src.y + src.height + gap);
        newEl.width = src.width;
        newEl.height = src.height;
        newEl.fill = src.fill;
        newEl.fontSize = src.fontSize;
        // #90 - Inherit parent sticky's tags
        if (src.tags && src.tags.length > 0) newEl.tags = src.tags.map(t => ({ ...t }));
        this.addElement(newEl);
        this.renderer.selectedIds.clear();
        this.renderer.selectedIds.add(newEl.id);
        this.renderer.markDirty();
        // Immediately start editing the new sticky
        setTimeout(() => this.startTextEdit(newEl), 50);
      }

      // If Tab was pressed on a sticky, create a new one to the right
      if (this._createStickyRight) {
        const src = this._createStickyRight;
        this._createStickyRight = null;
        const gap = 16;
        const newEl = createSticky(src.x + src.width + gap, src.y);
        newEl.width = src.width;
        newEl.height = src.height;
        newEl.fill = src.fill;
        newEl.fontSize = src.fontSize;
        // #90 - Inherit parent sticky's tags
        if (src.tags && src.tags.length > 0) newEl.tags = src.tags.map(t => ({ ...t }));
        this.addElement(newEl);
        this.renderer.selectedIds.clear();
        this.renderer.selectedIds.add(newEl.id);
        this.renderer.markDirty();
        setTimeout(() => this.startTextEdit(newEl), 50);
      }
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
        this._createStickyBelow = null;
        this._createStickyRight = null;
        editor.blur();
        this.setTool('select');
        e.stopPropagation();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (el.type === 'sticky') {
          this._createStickyBelow = el;
        }
        editor.blur();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Tab' && el.type === 'sticky') {
        e.preventDefault();
        this._createStickyRight = el;
        editor.blur();
        e.stopPropagation();
        return;
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
        el._searchQuery = lower; // #116 - Store query for text highlighting
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
    for (const [id, el] of this.renderer.elements) { delete el._searchHighlight; delete el._searchQuery; }
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
    // #134 - Group feedback with count
    this.showToast(`Groupe cree (${this.renderer.selectedIds.size} elements)`, 'success');
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
    // #134 - Ungroup feedback
    this.showToast('Degroupe', 'success');
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

  // #120 - Select all elements of same type and optionally color
  selectSimilar(referenceEl) {
    if (!referenceEl) return;
    this.renderer.selectedIds.clear();
    for (const [id, el] of this.renderer.elements) {
      if (el.type === referenceEl.type) {
        // Match color for stickies
        if (referenceEl.type === 'sticky' && referenceEl.fill && el.fill !== referenceEl.fill) continue;
        this.renderer.selectedIds.add(id);
      }
    }
    this.renderer.markDirty();
    const count = this.renderer.selectedIds.size;
    this.showToast(`${count} element${count > 1 ? 's' : ''} similaire${count > 1 ? 's' : ''} selectionne${count > 1 ? 's' : ''}`);
    if (this.updateUrlHash) this.updateUrlHash();
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
    } else if (mode === 'bottom') {
      const bounds = elements.map(el => getElementBounds(el));
      const maxBottom = Math.max(...bounds.map(b => b.y + b.h));
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const newY = maxBottom - bounds[i].h;
        if (el.y !== newY) {
          inverseOps.push({ type: 'update', elementId: el.id, props: { y: el.y } });
          el.y = newY;
          ops.push({ type: 'update', elementId: el.id, props: { y: newY } });
        }
      }
    } else if (mode === 'right') {
      const bounds = elements.map(el => getElementBounds(el));
      const maxRight = Math.max(...bounds.map(b => b.x + b.w));
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const newX = maxRight - bounds[i].w;
        if (el.x !== newX) {
          inverseOps.push({ type: 'update', elementId: el.id, props: { x: el.x } });
          el.x = newX;
          ops.push({ type: 'update', elementId: el.id, props: { x: newX } });
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
    } else if (mode === 'centerV') {
      const bounds = elements.map(el => getElementBounds(el));
      const centerX = bounds.reduce((s, b) => s + b.x + b.w / 2, 0) / bounds.length;
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const newX = centerX - bounds[i].w / 2;
        if (el.x !== newX) {
          inverseOps.push({ type: 'update', elementId: el.id, props: { x: el.x } });
          el.x = newX;
          ops.push({ type: 'update', elementId: el.id, props: { x: newX } });
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
    } else if (direction === 'vertical') {
      elements.sort((a, b) => a.y - b.y);
      const first = elements[0];
      const last = elements[elements.length - 1];
      const totalSpan = (last.y + last.height) - first.y;
      const totalHeights = elements.reduce((s, el) => s + el.height, 0);
      const gap = (totalSpan - totalHeights) / (elements.length - 1);
      let currentY = first.y + first.height + gap;
      for (let i = 1; i < elements.length - 1; i++) {
        const el = elements[i];
        if (el.y !== currentY) {
          inverseOps.push({ type: 'update', elementId: el.id, props: { y: el.y } });
          el.y = currentY;
          ops.push({ type: 'update', elementId: el.id, props: { y: currentY } });
        }
        currentY += el.height + gap;
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
    const bounds = getElementBounds(el);
    this.showCommentModal(bounds.x + bounds.w, bounds.y, el.id);
  }

  // Canvas comment (not attached to object)
  addCanvasComment(x, y) {
    this.showCommentModal(x, y, null);
  }

  showCommentModal(x, y, elementId) {
    // Check if there's an existing comment at this location
    const existing = elementId
      ? this.renderer.comments.find(c => c.elementId === elementId)
      : null;

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.style.maxWidth = '450px';
    dialog.style.textAlign = 'left';

    let html = '';
    if (existing) {
      html += `<div style="margin-bottom:12px">
        <div style="font-weight:bold;margin-bottom:4px">${existing.author} <span style="color:var(--text-muted);font-weight:normal;font-size:11px">${new Date(existing.timestamp).toLocaleString('fr-FR')}</span></div>
        <div style="background:var(--btn);padding:8px 12px;border-radius:6px;margin-bottom:8px">${existing.text}</div>`;
      if (existing.replies) {
        for (const r of existing.replies) {
          html += `<div style="margin-left:16px;margin-bottom:4px">
            <div style="font-size:12px;color:var(--text-muted)">${r.author} — ${new Date(r.timestamp).toLocaleString('fr-FR')}</div>
            <div style="background:var(--btn);padding:6px 10px;border-radius:6px;font-size:13px">${r.text}</div>
          </div>`;
        }
      }
      html += `</div>`;
      html += `<textarea class="comment-input" placeholder="Repondre..." style="width:100%;height:60px;background:var(--btn);border:1px solid var(--panel-border);border-radius:6px;color:var(--text);padding:8px;resize:vertical;font-size:13px"></textarea>`;
    } else {
      html += `<p style="margin-bottom:8px;font-weight:bold">Ajouter un commentaire</p>`;
      html += `<textarea class="comment-input" placeholder="Votre commentaire..." style="width:100%;height:80px;background:var(--btn);border:1px solid var(--panel-border);border-radius:6px;color:var(--text);padding:8px;resize:vertical;font-size:13px"></textarea>`;
    }

    dialog.innerHTML = html;
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    actions.style.marginTop = '12px';

    const submitBtn = document.createElement('button');
    submitBtn.textContent = existing ? 'Repondre' : 'Ajouter';
    submitBtn.style.background = 'var(--accent)';
    submitBtn.style.color = 'white';
    submitBtn.style.border = 'none';

    if (existing) {
      const resolveBtn = document.createElement('button');
      resolveBtn.textContent = existing.resolved ? 'Reouvrir' : 'Resoudre';
      resolveBtn.addEventListener('click', () => {
        existing.resolved = !existing.resolved;
        this.sync.sendCommentUpdate(existing.id, { resolved: existing.resolved });
        this.renderer.markDirty();
        overlay.remove();
        this.showToast(existing.resolved ? 'Commentaire resolu' : 'Commentaire rouvert');
      });
      actions.appendChild(resolveBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Annuler';
    cancelBtn.addEventListener('click', () => overlay.remove());

    submitBtn.addEventListener('click', () => {
      const textarea = dialog.querySelector('.comment-input');
      const text = textarea.value.trim();
      if (!text) return;

      const mentions = this._detectMentions(text);
      if (existing) {
        existing.replies.push({
          text: text,
          author: this.userName || 'Anonyme',
          timestamp: Date.now(),
          mentions
        });
        this.sync.sendCommentUpdate(existing.id, { replies: [...existing.replies] });
      } else {
        const comment = {
          id: generateId(),
          x: x, y: y,
          elementId: elementId,
          text: text,
          author: this.userName || 'Anonyme',
          timestamp: Date.now(),
          replies: [],
          resolved: false,
          mentions
        };
        this.renderer.comments.push(comment);
        this.sync.sendComment(comment);
      }
      this.renderer.markDirty();
      overlay.remove();
      this.showToast('Commentaire ajoute');
    });

    actions.appendChild(submitBtn);
    actions.appendChild(cancelBtn);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus textarea and stop key propagation
    const textarea = dialog.querySelector('.comment-input');
    setTimeout(() => textarea.focus(), 50);
    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        submitBtn.click();
      }
      if (e.key === 'Escape') {
        overlay.remove();
      }
    });

    // @mention autocomplete
    this._setupMentionAutocomplete(textarea);
  }

  // Tag editor panel - supports single or multi-select
  showTagEditor(el) {
    const existing = document.querySelector('.tag-editor-panel');
    if (existing) existing.remove();

    // Gather target elements (multi-select support)
    const targets = [];
    if (this.selectedElements.size > 1) {
      for (const id of this.selectedElements) {
        const e = this.renderer.elements.get(id);
        if (e && e.type === 'sticky') targets.push(e);
      }
    }
    if (targets.length === 0) targets.push(el);

    const screen = this.renderer.worldToScreen(el.x + el.width + 10, el.y);

    const TAG_COLORS = ['#FF6B6B', '#F4A460', '#FFD966', '#4ECDC4', '#45B7D1', '#4a9eff', '#DDA0DD', '#96CEB4', '#e94560', '#333333'];

    // Ensure tag registry exists with defaults
    if (!this.tagRegistry || this.tagRegistry.length === 0) {
      this.tagRegistry = [
        { label: 'Urgent', color: '#FF6B6B' },
        { label: 'Important', color: '#F4A460' },
        { label: 'Idee', color: '#FFD966' },
        { label: 'A faire', color: '#4a9eff' },
        { label: 'En cours', color: '#45B7D1' },
        { label: 'Fait', color: '#4ECDC4' },
        { label: 'Question', color: '#DDA0DD' },
        { label: 'Bloquant', color: '#e94560' },
      ];
      this.sync.sendTagRegistryUpdate(this.tagRegistry);
    }

    const panel = document.createElement('div');
    panel.className = 'tag-editor-panel';
    panel.style.left = Math.min(screen.x, window.innerWidth - 280) + 'px';
    panel.style.top = Math.min(screen.y, window.innerHeight - 400) + 'px';

    const isMulti = targets.length > 1;

    // Helper: add tag to targets
    const addTagToTargets = (tag) => {
      const ops = [];
      const inverseOps = [];
      for (const t of targets) {
        const oldTags = [...(t.tags || [])];
        if (oldTags.some(x => x.label === tag.label)) continue;
        if (!t.tags) t.tags = [];
        t.tags.push({ label: tag.label, color: tag.color });
        ops.push({ type: 'update', elementId: t.id, props: { tags: [...t.tags] } });
        inverseOps.push({ type: 'update', elementId: t.id, props: { tags: oldTags } });
      }
      if (ops.length > 0) {
        this.history.push(ops, inverseOps);
        this.sync.sendOps(ops);
        this.renderer.markDirty();
        if (this.ui) this.ui.updateUndoRedoButtons();
      }
      renderPanel();
    };

    // Helper: remove tag from targets by label
    const removeTagFromTargets = (label) => {
      const ops = [];
      const inverseOps = [];
      for (const t of targets) {
        const oldTags = [...(t.tags || [])];
        const idx = (t.tags || []).findIndex(x => x.label === label);
        if (idx === -1) continue;
        t.tags.splice(idx, 1);
        ops.push({ type: 'update', elementId: t.id, props: { tags: [...t.tags] } });
        inverseOps.push({ type: 'update', elementId: t.id, props: { tags: oldTags } });
      }
      if (ops.length > 0) {
        this.history.push(ops, inverseOps);
        this.sync.sendOps(ops);
        this.renderer.markDirty();
        if (this.ui) this.ui.updateUndoRedoButtons();
      }
      renderPanel();
    };

    // Helper: register tag in registry
    const registerTag = (tag) => {
      if (!this.tagRegistry.some(t => t.label === tag.label)) {
        this.tagRegistry.push({ label: tag.label, color: tag.color });
        this.sync.sendTagRegistryUpdate(this.tagRegistry);
      }
    };

    // Helper: delete tag from registry
    const deleteTagFromRegistry = (label) => {
      this.tagRegistry = this.tagRegistry.filter(t => t.label !== label);
      this.sync.sendTagRegistryUpdate(this.tagRegistry);
      renderPanel();
    };

    const renderPanel = () => {
      // For multi-select, show common tags (present on ALL targets)
      const commonTags = [];
      if (isMulti) {
        const first = targets[0].tags || [];
        for (const tag of first) {
          if (targets.every(t => (t.tags || []).some(x => x.label === tag.label))) {
            commonTags.push(tag);
          }
        }
      } else {
        commonTags.push(...(targets[0].tags || []));
      }

      panel.innerHTML = `
        <div class="tag-editor-header">
          <span>Tags${isMulti ? ` (${targets.length} post-its)` : ''}</span>
          <button class="tag-editor-close">&times;</button>
        </div>
        <div class="tag-editor-current">
          ${commonTags.length === 0 ? '<span class="tag-editor-empty">Aucun tag</span>' :
            commonTags.map(t => `
              <span class="tag-pill" style="background:${t.color || '#888'}; color:${isLightColor(t.color || '#888') ? '#1a1a1a' : '#fff'}">
                ${t.label}
                <button class="tag-remove" data-label="${t.label}">&times;</button>
              </span>
            `).join('')}
        </div>
        <div class="tag-editor-presets">
          <span class="tag-editor-label">Registre :</span>
          ${this.tagRegistry.filter(p => !commonTags.some(t => t.label === p.label)).map(p => `
            <div class="tag-preset-row">
              <button class="tag-preset-btn" data-label="${p.label}" data-color="${p.color}" style="background:${p.color}; color:${isLightColor(p.color) ? '#1a1a1a' : '#fff'}">
                ${p.label}
              </button>
              <button class="tag-registry-delete" data-label="${p.label}" title="Supprimer du registre">&times;</button>
            </div>
          `).join('')}
          ${this.tagRegistry.filter(p => !commonTags.some(t => t.label === p.label)).length === 0 ? '<span class="tag-editor-empty">Tous attribues</span>' : ''}
        </div>
        <div class="tag-editor-custom">
          <input type="text" class="tag-custom-input" placeholder="Nouveau tag..." maxlength="20" />
          <div class="tag-color-row">
            ${TAG_COLORS.map(c => `<span class="tag-color-swatch${c === '#4a9eff' ? ' active' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}
          </div>
          <button class="tag-add-btn">Ajouter</button>
        </div>
      `;

      // Event handlers
      panel.querySelector('.tag-editor-close').addEventListener('click', () => panel.remove());

      panel.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', () => removeTagFromTargets(btn.dataset.label));
      });

      panel.querySelectorAll('.tag-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          addTagToTargets({ label: btn.dataset.label, color: btn.dataset.color });
        });
      });

      panel.querySelectorAll('.tag-registry-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteTagFromRegistry(btn.dataset.label);
        });
      });

      let selectedColor = '#4a9eff';
      panel.querySelectorAll('.tag-color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          panel.querySelectorAll('.tag-color-swatch').forEach(s => s.classList.remove('active'));
          sw.classList.add('active');
          selectedColor = sw.dataset.color;
        });
      });

      const addCustomTag = () => {
        const input = panel.querySelector('.tag-custom-input');
        const label = input.value.trim();
        if (!label) return;
        const tag = { label, color: selectedColor };
        registerTag(tag);
        addTagToTargets(tag);
      };

      const addBtn = panel.querySelector('.tag-add-btn');
      if (addBtn) addBtn.addEventListener('click', addCustomTag);
      const input = panel.querySelector('.tag-custom-input');
      if (input) input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addCustomTag();
        e.stopPropagation();
      });
    };

    renderPanel();
    document.body.appendChild(panel);

    // Close on click outside
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!panel.contains(e.target)) {
          panel.remove();
          document.removeEventListener('pointerdown', closeHandler);
        }
      };
      document.addEventListener('pointerdown', closeHandler);
    }, 0);
  }

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

  // #101 - Smooth camera animations with easeOutCubic
  animateToView(targetX, targetY, targetZoom) {
    targetZoom = targetZoom || this.renderer.camera.zoom;
    this.animateCamera(targetX, targetY, targetZoom, 500);
  }

  animateCamera(targetX, targetY, targetZoom, duration) {
    duration = duration || 500;
    if (this._cameraAnimRaf) cancelAnimationFrame(this._cameraAnimRaf);
    const startX = this.renderer.camera.x;
    const startY = this.renderer.camera.y;
    const startZoom = this.renderer.camera.zoom;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - t, 3);

      this.renderer.camera.x = lerp(startX, targetX, ease);
      this.renderer.camera.y = lerp(startY, targetY, ease);
      this.renderer.camera.zoom = lerp(startZoom, targetZoom, ease);
      this.renderer.markDirty();
      this.updateZoomDisplay();

      if (t < 1) {
        this._cameraAnimRaf = requestAnimationFrame(animate);
      } else {
        this._cameraAnimRaf = null;
      }
    };
    this._cameraAnimRaf = requestAnimationFrame(animate);
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
    const avatarsEl = document.getElementById('usersAvatars');
    const countEl = document.getElementById('usersCount');
    const count = this.renderer.remoteUsers.size + 1;
    const maxVisible = 5;

    let avatarsHtml = '';

    // My avatar
    const myFac = this.isFacilitator ? ' facilitator' : '';
    avatarsHtml += `<div class="user-avatar${myFac}" style="background:${this.myColor}" title="${this.userName} (Vous)">${(this.userName || '').slice(0, 2).toUpperCase()}<span class="user-avatar-dot"></span></div>`;

    // Remote user avatars (max 5 visible)
    let shown = 1;
    for (const [userId, user] of this.renderer.remoteUsers) {
      if (shown >= maxVisible) break;
      const fac = user.isFacilitator ? ' facilitator' : '';
      const isActive = user.lastActivity && (Date.now() - user.lastActivity < 10000);
      const dotHtml = isActive ? '<span class="user-avatar-dot"></span>' : '';
      avatarsHtml += `<div class="user-avatar${fac}" style="background:${user.color}" title="${user.name}">${(user.name || '').slice(0, 2).toUpperCase()}${dotHtml}</div>`;
      shown++;
    }

    // Overflow indicator
    const overflow = count - maxVisible;
    if (overflow > 0) {
      avatarsHtml += `<div class="user-avatar" style="background:var(--btn, #333)" title="${overflow} autres utilisateurs">+${overflow}</div>`;
    }

    avatarsEl.innerHTML = avatarsHtml;
    countEl.textContent = `${count} en ligne`;

    // Click on avatars area toggles dropdown
    avatarsEl.onclick = (e) => {
      e.stopPropagation();
      this.toggleUsersDropdown();
    };

    // Also update dropdown if it's currently visible
    const dropdown = document.getElementById('usersDropdown');
    if (dropdown && dropdown.style.display !== 'none') {
      this._renderUsersDropdownList();
    }
  }

  toggleUsersDropdown() {
    const dropdown = document.getElementById('usersDropdown');
    if (dropdown.style.display === 'none') {
      this._renderUsersDropdownList();
      dropdown.style.display = 'block';
      // Close when clicking outside
      setTimeout(() => {
        this._usersDropdownHandler = (e) => {
          const panel = document.getElementById('usersPanel');
          if (!panel.contains(e.target)) {
            dropdown.style.display = 'none';
            document.removeEventListener('pointerdown', this._usersDropdownHandler);
            this._usersDropdownHandler = null;
          }
        };
        document.addEventListener('pointerdown', this._usersDropdownHandler);
      }, 0);
    } else {
      dropdown.style.display = 'none';
      if (this._usersDropdownHandler) {
        document.removeEventListener('pointerdown', this._usersDropdownHandler);
        this._usersDropdownHandler = null;
      }
    }
  }

  _renderUsersDropdownList() {
    const listEl = document.getElementById('usersDropdownList');
    let html = '';

    // Me
    const myInitials = (this.userName || '').slice(0, 2).toUpperCase();
    html += `<div class="users-dropdown-item">
      <div class="user-avatar-sm" style="background:${this.myColor}">${myInitials}</div>
      <span class="user-name">${this.userName} (Vous)</span>
      ${this.isFacilitator ? '<span class="user-role">Animateur</span>' : ''}
    </div>`;

    // Remote users
    for (const [userId, user] of this.renderer.remoteUsers) {
      const initials = (user.name || '').slice(0, 2).toUpperCase();
      const roleHtml = user.isFacilitator ? '<span class="user-role">Animateur</span>' : '';
      html += `<div class="users-dropdown-item" data-userid="${userId}">
        <div class="user-avatar-sm" style="background:${user.color}">${initials}</div>
        <span class="user-name">${user.name || userId}</span>
        ${roleHtml}
        <button class="goto-user-btn" data-goto="${userId}">Voir</button>
      </div>`;
    }

    // Claim facilitator option
    if (!this.isFacilitator) {
      html += '<div style="height:1px;background:var(--panel-border);margin:4px 0;"></div>';
      html += '<div class="users-dropdown-item" id="claimFacilitatorBtn" style="color:var(--warning);cursor:pointer;">Devenir animateur</div>';
    }

    listEl.innerHTML = html;

    // Bind "Voir" buttons to navigate to user cursor position
    listEl.querySelectorAll('.goto-user-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.goto;
        const user = this.renderer.remoteUsers.get(targetId);
        if (user && user.x !== undefined && user.y !== undefined) {
          // Pan camera to user's cursor position
          const canvas = this.renderer.canvas;
          this.renderer.camera.x = user.x - (canvas.width / 2) / this.renderer.camera.zoom;
          this.renderer.camera.y = user.y - (canvas.height / 2) / this.renderer.camera.zoom;
          this.renderer.draw();
        }
        document.getElementById('usersDropdown').style.display = 'none';
        if (this._usersDropdownHandler) {
          document.removeEventListener('pointerdown', this._usersDropdownHandler);
          this._usersDropdownHandler = null;
        }
      });
    });

    // Bind claim facilitator
    const claimBtn = document.getElementById('claimFacilitatorBtn');
    if (claimBtn) {
      claimBtn.addEventListener('click', () => {
        this.sync.send({ type: 'claim-facilitator' });
        document.getElementById('usersDropdown').style.display = 'none';
        if (this._usersDropdownHandler) {
          document.removeEventListener('pointerdown', this._usersDropdownHandler);
          this._usersDropdownHandler = null;
        }
      });
    }
  }

  // #124 - Improved toasts with icons and type parameter
  showToast(message, type = 'info') {
    // Queue multiple toasts and show them stacked
    const toast = document.createElement('div');
    toast.className = `toast show toast-${type}`;
    const iconMap = { success: '<span class="toast-icon toast-icon-success">&#10003;</span>', error: '<span class="toast-icon toast-icon-error">&#10005;</span>', info: '<span class="toast-icon toast-icon-info">i</span>' };
    toast.innerHTML = (iconMap[type] || iconMap.info) + '<span>' + this._escapeHtml(message) + '</span>';
    toast.style.position = 'fixed';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.zIndex = '10000';
    toast.style.background = 'var(--panel, #23272e)';
    toast.style.color = 'var(--text, #e0e0e0)';
    toast.style.padding = '10px 24px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '14px';
    toast.style.pointerEvents = 'none';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s, bottom 0.3s';
    toast.style.boxShadow = '0 2px 12px rgba(0,0,0,0.4)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '4px';

    document.body.appendChild(toast);
    this._toastQueue.push(toast);
    this._repositionToasts();

    // Animate in
    requestAnimationFrame(() => { toast.style.opacity = '1'; });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
        const idx = this._toastQueue.indexOf(toast);
        if (idx !== -1) this._toastQueue.splice(idx, 1);
        this._repositionToasts();
      }, 300);
    }, 3500);

    // Also update the original toast element for backward compatibility
    const origToast = document.getElementById('toast');
    if (origToast) {
      origToast.textContent = message;
      origToast.classList.add('show');
      clearTimeout(this._toastTimeout);
      this._toastTimeout = setTimeout(() => origToast.classList.remove('show'), 3500);
    }
  }

  _repositionToasts() {
    let bottom = 80;
    for (let i = this._toastQueue.length - 1; i >= 0; i--) {
      this._toastQueue[i].style.bottom = bottom + 'px';
      bottom += 48;
    }
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
        <div class="context-menu-item" data-action="${isLocked ? 'unlock' : 'lock'}">${isLocked ? '🔓 Deverrouiller' : '🔒 Verrouiller'} <span class="shortcut-hint">Ctrl+Shift+L</span></div>
        ${multiSel ? `<div class="context-menu-item" data-action="group">📦 Grouper <span class="shortcut-hint">Ctrl+G</span></div>` : ''}
        ${isGrouped ? `<div class="context-menu-item" data-action="ungroup">📤 Degrouper <span class="shortcut-hint">Ctrl+Shift+G</span></div>` : ''}
        ${hit.rotation ? `<div class="context-menu-item" data-action="resetRotation">↺ Remettre a 0°</div>` : ''}
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="front">Mettre devant</div>
        <div class="context-menu-item" data-action="back">Mettre derriere</div>
        ${multiSel ? `
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="alignTop">↑ Aligner en haut</div>
        <div class="context-menu-item" data-action="alignBottom">↓ Aligner en bas</div>
        <div class="context-menu-item" data-action="alignLeft">← Aligner a gauche</div>
        <div class="context-menu-item" data-action="alignRight">→ Aligner a droite</div>
        <div class="context-menu-item" data-action="alignCenterH">↔ Centrer horizontalement</div>
        <div class="context-menu-item" data-action="alignCenterV">↕ Centrer verticalement</div>
        <div class="context-menu-item" data-action="distributeH">⇔ Distribuer horizontalement</div>
        <div class="context-menu-item" data-action="distributeV">⇕ Distribuer verticalement</div>
        ` : ''}
        ${hit.type === 'envelope' ? `
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="toggleCollapse">${hit.collapsed ? '▼ Etendre' : '▶ Reduire'}</div>
        <div class="context-menu-item" data-action="deleteWithContent" style="color:var(--danger)">Supprimer avec le contenu</div>
        ` : ''}
        ${hit.type === 'sticky' || (multiSel && Array.from(this.selectedElements).some(id => { const e = this.renderer.elements.get(id); return e && e.type === 'sticky'; })) ? `<div class="context-menu-separator"></div><div class="context-menu-item" data-action="editTags">🏷️ Tags</div>` : ''}
        ${hit.type === 'card' ? `<div class="context-menu-separator"></div><div class="context-menu-item" data-action="editCard">✏️ Modifier la carte</div>` : ''}
        ${hit.type === 'list' ? `<div class="context-menu-separator"></div><div class="context-menu-item" data-action="editList">✏️ Modifier la liste</div>` : ''}
        ${hit.type === 'mindmap' ? `<div class="context-menu-separator"></div><div class="context-menu-item" data-action="addMindmapChild">🧠 Ajouter un noeud enfant</div><div class="context-menu-item" data-action="layoutMindmap">📐 Re-organiser</div>` : ''}
        ${hit.type === 'embed' ? `<div class="context-menu-separator"></div><div class="context-menu-item" data-action="openEmbed">▶️ Ouvrir l'embed</div><div class="context-menu-item" data-action="editEmbedUrl">🔗 Modifier l'URL</div>` : ''}
        ${hit.type === 'connector' ? `
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="connStraight">${hit.lineType !== 'orthogonal' && hit.lineType !== 'curve' ? '✓ ' : ''}Ligne droite</div>
        <div class="context-menu-item" data-action="connOrthogonal">${hit.lineType === 'orthogonal' ? '✓ ' : ''}Ligne orthogonale</div>
        <div class="context-menu-item" data-action="connCurved">${hit.lineType === 'curve' ? '✓ ' : ''}Ligne courbee</div>
        ` : ''}
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="react">😀 Reagir</div>
        <div class="context-menu-item" data-action="comment">💬 Commenter</div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="selectSimilar">🔍 Selectionner les similaires</div>
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
          this.bringToFront();
          break;
        case 'back':
          this.sendToBack();
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
        case 'alignBottom':
          this.alignSelected('bottom');
          break;
        case 'alignLeft':
          this.alignSelected('left');
          break;
        case 'alignRight':
          this.alignSelected('right');
          break;
        case 'alignCenterH':
          this.alignSelected('centerH');
          break;
        case 'alignCenterV':
          this.alignSelected('centerV');
          break;
        case 'distributeH':
          this.distributeSelected('horizontal');
          break;
        case 'distributeV':
          this.distributeSelected('vertical');
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
        case 'connStraight':
          this.updateSelectedElements({ lineType: 'straight' });
          break;
        case 'connOrthogonal':
          this.updateSelectedElements({ lineType: 'orthogonal' });
          break;
        case 'connCurved':
          this.updateSelectedElements({ lineType: 'curve' });
          break;
        case 'editTags':
          this.showTagEditor(hit);
          break;
        case 'react':
          this.showReactionPicker(hit);
          break;
        case 'comment':
          this.addComment(hit);
          break;
        case 'selectSimilar':
          // #120 - Select all elements of same type/color
          this.selectSimilar(hit);
          break;
        case 'addCanvasComment':
          this.addCanvasComment(worldX, worldY);
          break;
        case 'addMindmapChild':
          this.addMindmapChild(hit);
          break;
        case 'layoutMindmap': {
          // Find root of mindmap tree
          let root = hit;
          while (root.mindmapParent) {
            const parent = this.renderer.elements.get(root.mindmapParent);
            if (!parent) break;
            root = parent;
          }
          this._layoutMindmapChildren(root);
          break;
        }
        case 'openEmbed':
          this._openEmbedOverlay(hit);
          break;
        case 'editEmbedUrl': {
          const newUrl = prompt('URL:', hit.embedUrl || '');
          if (newUrl !== null) {
            this.updateSelectedElements({ embedUrl: newUrl, text: newUrl });
          }
          break;
        }
      }
      this.hideContextMenu();
    });

    setTimeout(() => {
      document.addEventListener('pointerdown', this._closeMenu = (ev) => {
        // Don't close if clicking inside the context menu itself
        if (this.contextMenu && this.contextMenu.contains(ev.target)) return;
        this.hideContextMenu();
      });
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

  // --- Feature: Element count in page title ---
  updateTitle() {
    const boardId = getBoardId();
    const count = this.renderer.elements.size;
    document.title = `DarkBoard - ${boardId} (${count} \u00e9l\u00e9ments)`;
  }

  updateEmptyHint() {
    const hint = document.getElementById('emptyBoardHint');
    if (!hint) return;
    hint.style.display = this.renderer.elements.size === 0 ? '' : 'none';
  }

  // --- Feature: Hover tooltip showing element type ---
  initHoverTooltip() {
    const canvas = this.renderer.canvas;
    canvas.addEventListener('mousemove', (e) => {
      clearTimeout(this._hoverTooltipTimer);
      this._removeHoverTooltip();
      const world = this.renderer.screenToWorld(e.clientX, e.clientY);
      this._hoverTooltipTimer = setTimeout(() => {
        const hit = this.renderer.hitTest(world.x, world.y);
        if (hit) {
          this._showHoverTooltip(e.clientX, e.clientY, hit.type);
        }
      }, 1000);
    });
    canvas.addEventListener('mouseleave', () => {
      clearTimeout(this._hoverTooltipTimer);
      this._removeHoverTooltip();
    });
    canvas.addEventListener('mousedown', () => {
      clearTimeout(this._hoverTooltipTimer);
      this._removeHoverTooltip();
    });
  }

  _showHoverTooltip(x, y, type) {
    this._removeHoverTooltip();
    const typeLabels = {
      sticky: 'Post-it', text: 'Texte', rect: 'Rectangle', circle: 'Cercle',
      line: 'Ligne', arrow: 'Fl\u00e8che', draw: 'Dessin', frame: 'Cadre',
      envelope: 'Enveloppe', connector: 'Connecteur', diamond: 'Losange',
      triangle: 'Triangle', card: 'Carte', list: 'Liste', image: 'Image'
    };
    const tip = document.createElement('div');
    tip.className = 'hover-tooltip';
    tip.textContent = typeLabels[type] || type;
    tip.style.cssText = `position:fixed;left:${x + 12}px;top:${y - 28}px;background:rgba(0,0,0,0.8);color:#fff;padding:4px 10px;border-radius:4px;font-size:12px;pointer-events:none;z-index:9999;white-space:nowrap;`;
    document.body.appendChild(tip);
    this._hoverTooltip = tip;
  }

  _removeHoverTooltip() {
    if (this._hoverTooltip) {
      this._hoverTooltip.remove();
      this._hoverTooltip = null;
    }
  }

  // --- Feature: Duplicate with smart offset (Ctrl+D) ---
  duplicateSelectedWithOffset() {
    this.copySelected();
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

  // #82 - Duplicate in place (offset 0,0)
  duplicateSelectedInPlace() {
    this.copySelected();
    if (this.clipboard.length === 0) return;
    this.renderer.selectedIds.clear();
    for (const orig of this.clipboard) {
      const el = deepClone(orig);
      el.id = generateId();
      el.zIndex = Date.now();
      this.addElement(el);
      this.renderer.selectedIds.add(el.id);
    }
    this.showToast('Duplique sur place');
    this.renderer.markDirty();
  }

  // --- Feature: Paste at specific location (for middle-click paste) ---
  pasteAt(worldX, worldY) {
    if (this.clipboard.length === 0) return;
    // Calculate centroid of clipboard elements
    let cx = 0, cy = 0;
    for (const el of this.clipboard) {
      cx += el.x + (el.width || 0) / 2;
      cy += el.y + (el.height || 0) / 2;
    }
    cx /= this.clipboard.length;
    cy /= this.clipboard.length;

    this.renderer.selectedIds.clear();
    for (const orig of this.clipboard) {
      const el = deepClone(orig);
      el.id = generateId();
      el.x += worldX - cx;
      el.y += worldY - cy;
      if (el.x2 !== undefined) { el.x2 += worldX - cx; el.y2 += worldY - cy; }
      if (el.points) {
        const dx = worldX - cx, dy = worldY - cy;
        el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      }
      el.zIndex = Date.now();
      this.addElement(el);
      this.renderer.selectedIds.add(el.id);
    }
    this.showToast(`${this.clipboard.length} \u00e9l\u00e9ments coll\u00e9s`);
    this.renderer.markDirty();
  }

  // --- Feature: Bring to front / Send to back ---
  bringToFront() {
    if (this.renderer.selectedIds.size === 0) return;
    const now = Date.now();
    let offset = 0;
    const ops = [], inverseOps = [];
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el) {
        inverseOps.push({ type: 'update', elementId: id, props: { zIndex: el.zIndex } });
        el.zIndex = now + 1000 + (offset++);
        ops.push({ type: 'update', elementId: id, props: { zIndex: el.zIndex } });
      }
    }
    if (ops.length > 0) {
      this.history.push(ops, inverseOps);
      this.sync.sendOps(ops);
      this.renderer.markDirty();
    }
  }

  sendToBack() {
    if (this.renderer.selectedIds.size === 0) return;
    let minZ = Infinity;
    for (const [, el] of this.renderer.elements) {
      if (el.zIndex < minZ) minZ = el.zIndex;
    }
    let offset = 0;
    const ops = [], inverseOps = [];
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el) {
        inverseOps.push({ type: 'update', elementId: id, props: { zIndex: el.zIndex } });
        el.zIndex = Math.max(1, minZ - 100 + (offset++));
        ops.push({ type: 'update', elementId: id, props: { zIndex: el.zIndex } });
      }
    }
    if (ops.length > 0) {
      this.history.push(ops, inverseOps);
      this.sync.sendOps(ops);
      this.renderer.markDirty();
    }
  }

  // --- Feature: Lock/unlock toggle ---
  toggleLockSelected() {
    if (this.renderer.selectedIds.size === 0) return;
    // Check if any is locked
    let anyLocked = false;
    for (const id of this.renderer.selectedIds) {
      const el = this.renderer.elements.get(id);
      if (el && el.locked) { anyLocked = true; break; }
    }
    const newLocked = !anyLocked;
    this.updateSelectedElements({ locked: newLocked });
    this.showToast(newLocked ? 'Objet verrouill\u00e9' : 'Objet d\u00e9verrouill\u00e9');
  }

  // --- Feature: Zoom to fit selected elements (Ctrl+Shift+0) ---
  zoomToSelection() {
    if (this.renderer.selectedIds.size === 0) {
      // If nothing selected, fit all
      if (this.ui) this.ui.fitToScreen();
      return;
    }
    this.centerOnSelection();
  }

  // --- Feature: Sticky color cycling ---
  getNextStickyColor() {
    const colors = typeof STICKY_COLORS !== 'undefined' ? STICKY_COLORS : ['#FFD966', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD', '#F4A460'];
    const color = colors[this.stickyColorIndex % colors.length];
    this.stickyColorIndex++;
    return color;
  }

  // --- Feature: Snap feedback indicator ---
  showSnapIndicator() {
    if (this._snapIndicator) return;
    const indicator = document.createElement('div');
    indicator.className = 'snap-indicator';
    indicator.textContent = 'SNAP';
    indicator.style.cssText = 'position:fixed;top:60px;right:16px;background:rgba(74,158,255,0.2);color:#4a9eff;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:bold;pointer-events:none;z-index:9999;border:1px solid rgba(74,158,255,0.4);';
    document.body.appendChild(indicator);
    this._snapIndicator = indicator;
  }

  hideSnapIndicator() {
    if (this._snapIndicator) {
      this._snapIndicator.remove();
      this._snapIndicator = null;
    }
  }

  // #81 - Auto-save indicator
  showSaveIndicator() {
    if (this._saveIndicator) return;
    const el = document.createElement('div');
    el.className = 'save-indicator';
    el.textContent = 'Sauvegarde...';
    el.style.cssText = 'position:fixed;bottom:12px;left:12px;background:rgba(74,158,255,0.15);color:#4a9eff;padding:3px 10px;border-radius:4px;font-size:11px;pointer-events:none;z-index:9999;opacity:1;transition:opacity 0.3s;';
    document.body.appendChild(el);
    this._saveIndicator = el;
    setTimeout(() => {
      if (this._saveIndicator) {
        this._saveIndicator.style.opacity = '0';
        setTimeout(() => {
          if (this._saveIndicator) { this._saveIndicator.remove(); this._saveIndicator = null; }
        }, 300);
      }
    }, 1000);
  }

  // Stub: flash effect on newly created element
  _flashCreatedElement(el) {
    // Brief highlight - no-op if not needed
  }

  // Stub: milestone check
  _checkElementMilestone() {
    // Handled by #112 in addElement
  }

  // =====================
  // CHAT
  // =====================
  initChat() {
    this._chatBadgeCount = 0;
    const toggle = document.getElementById('chatToggle');
    const close = document.getElementById('chatClose');
    const sendBtn = document.getElementById('chatSend');
    const input = document.getElementById('chatInput');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const panel = document.getElementById('chatPanel');
      if (!panel) return;
      const visible = panel.style.display !== 'none';
      panel.style.display = visible ? 'none' : 'flex';
      if (!visible) {
        this._chatBadgeCount = 0;
        const badge = document.getElementById('chatBadge');
        if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
        input.focus();
      }
    });

    if (close) close.addEventListener('click', () => {
      const panel = document.getElementById('chatPanel');
      if (panel) panel.style.display = 'none';
    });

    if (sendBtn) sendBtn.addEventListener('click', () => this.sendChat());

    if (input) {
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') this.sendChat();
      });
    }
  }

  onChatMessage(msg) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-msg';
    const time = new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `<span class="chat-msg-name" style="color:${msg.color || 'var(--accent)'}">${this._escapeHtml(msg.name)}</span> <span class="chat-msg-time">${time}</span><div class="chat-msg-text">${this._escapeHtml(msg.text)}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    const panel = document.getElementById('chatPanel');
    if (panel && panel.style.display === 'none' && msg.userId !== this.myUserId) {
      this._chatBadgeCount++;
      const badge = document.getElementById('chatBadge');
      if (badge) {
        badge.textContent = String(this._chatBadgeCount);
        badge.style.display = '';
      }
    }
  }

  sendChat() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    this.sync.sendChat(text);
    this.onChatMessage({
      userId: this.myUserId,
      name: this.userName,
      color: this.myColor,
      text,
      timestamp: Date.now()
    });
    input.value = '';
    input.focus();
  }

  _escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // =====================
  // AUDIO (WebRTC)
  // =====================
  initAudio() {
    this.audioPeers = new Map();
    this.audioStream = null;
    this.audioEnabled = false;

    const toggle = document.getElementById('audioToggle');
    if (toggle) {
      toggle.addEventListener('click', () => this.toggleAudio());
    }
  }

  async toggleAudio() {
    if (this.audioEnabled) {
      // Turn off
      this.audioPeers.forEach((pc) => pc.close());
      this.audioPeers.clear();
      if (this.audioStream) {
        this.audioStream.getTracks().forEach(t => t.stop());
        this.audioStream = null;
      }
      this.audioEnabled = false;
      const btn = document.getElementById('audioToggle');
      if (btn) btn.classList.remove('active');
      this.showToast('Audio desactive');
      return;
    }

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      this.showToast('Impossible d\'acceder au micro');
      return;
    }

    this.audioEnabled = true;
    const btn = document.getElementById('audioToggle');
    if (btn) btn.classList.add('active');
    this.showToast('Audio active');

    // Create peer connections with all remote users
    this.renderer.remoteUsers.forEach((user, uid) => {
      this._createAudioPeer(uid, true);
    });
  }

  _createAudioPeer(targetUserId, initiator) {
    if (this.audioPeers.has(targetUserId)) return;
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    this.audioPeers.set(targetUserId, pc);

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => pc.addTrack(track, this.audioStream));
    }

    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sync.sendWebRTCSignal(targetUserId, {
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        pc.close();
        this.audioPeers.delete(targetUserId);
      }
    };

    if (initiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        this.sync.sendWebRTCSignal(targetUserId, {
          type: 'offer',
          sdp: offer
        });
      }).catch(() => {});
    }
  }

  onWebRTCSignal(msg) {
    if (!this.audioEnabled) {
      // If we receive an offer but audio is off, ignore
      if (msg.signal.type === 'offer') return;
      return;
    }

    const fromUserId = msg.userId;
    const signal = msg.signal;

    if (signal.type === 'offer') {
      this._createAudioPeer(fromUserId, false);
      const pc = this.audioPeers.get(fromUserId);
      if (!pc) return;
      pc.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
        return pc.createAnswer();
      }).then(answer => {
        pc.setLocalDescription(answer);
        this.sync.sendWebRTCSignal(fromUserId, {
          type: 'answer',
          sdp: answer
        });
      }).catch(() => {});
    } else if (signal.type === 'answer') {
      const pc = this.audioPeers.get(fromUserId);
      if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(signal.sdp)).catch(() => {});
      }
    } else if (signal.type === 'ice-candidate') {
      const pc = this.audioPeers.get(fromUserId);
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
      }
    }
  }

  // =====================
  // REACTIONS
  // =====================
  onReaction(msg) {
    const el = this.renderer.elements.get(msg.elementId);
    if (!el) return;
    if (!el.reactions) el.reactions = [];
    el.reactions.push({ userId: msg.userId, emoji: msg.emoji, timestamp: msg.timestamp });
    this.renderer.markDirty();
  }

  showReactionPicker(el) {
    // Remove existing picker
    const existing = document.querySelector('.reaction-picker');
    if (existing) existing.remove();

    const emojis = ['\u{1F44D}', '\u{1F44E}', '\u{2764}\u{FE0F}', '\u{1F389}', '\u{1F914}', '\u{2B50}', '\u{1F525}', '\u{1F4A1}'];
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';

    const bounds = getElementBounds(el);
    if (!bounds) return;
    const cam = this.renderer.camera;
    const sx = (bounds.x + bounds.w / 2) * cam.zoom + cam.x;
    const sy = (bounds.y + bounds.h) * cam.zoom + cam.y + 10;
    picker.style.left = sx + 'px';
    picker.style.top = sy + 'px';

    for (const emoji of emojis) {
      const btn = document.createElement('span');
      btn.className = 'reaction-picker-item';
      btn.textContent = emoji;
      btn.addEventListener('click', () => {
        this.sync.sendReaction(el.id, emoji);
        this.onReaction({ elementId: el.id, userId: this.myUserId, emoji, timestamp: Date.now() });
        picker.remove();
      });
      picker.appendChild(btn);
    }

    document.body.appendChild(picker);

    // Close on outside click
    setTimeout(() => {
      const handler = (e) => {
        if (!picker.contains(e.target)) {
          picker.remove();
          document.removeEventListener('pointerdown', handler);
        }
      };
      document.addEventListener('pointerdown', handler);
    }, 0);
  }

  // =====================
  // @MENTIONS IN COMMENTS
  // =====================
  _setupMentionAutocomplete(textarea) {
    const dropdown = document.createElement('div');
    dropdown.className = 'mention-dropdown';
    dropdown.style.display = 'none';
    textarea.parentNode.style.position = 'relative';
    textarea.parentNode.appendChild(dropdown);

    textarea.addEventListener('input', () => {
      const val = textarea.value;
      const cursor = textarea.selectionStart;
      // Look for @ before cursor
      const textBefore = val.substring(0, cursor);
      const atMatch = textBefore.match(/@(\w*)$/);

      if (!atMatch) {
        dropdown.style.display = 'none';
        return;
      }

      const query = atMatch[1].toLowerCase();
      const users = [];
      this.renderer.remoteUsers.forEach((u, uid) => {
        if (!query || u.name.toLowerCase().includes(query)) {
          users.push({ userId: uid, name: u.name });
        }
      });

      if (users.length === 0) {
        dropdown.style.display = 'none';
        return;
      }

      dropdown.innerHTML = '';
      dropdown.style.display = 'block';
      for (const u of users) {
        const item = document.createElement('div');
        item.className = 'mention-dropdown-item';
        item.textContent = '@' + u.name;
        item.addEventListener('click', () => {
          const before = val.substring(0, cursor - atMatch[0].length);
          const after = val.substring(cursor);
          textarea.value = before + '@' + u.name + ' ' + after;
          dropdown.style.display = 'none';
          textarea.focus();
          const newPos = before.length + u.name.length + 2;
          textarea.setSelectionRange(newPos, newPos);
        });
        dropdown.appendChild(item);
      }
    });

    textarea.addEventListener('blur', () => {
      setTimeout(() => { dropdown.style.display = 'none'; }, 200);
    });
  }

  _detectMentions(text) {
    const mentions = [];
    const regex = /@(\S+)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const mentionName = match[1];
      this.renderer.remoteUsers.forEach((u, uid) => {
        if (u.name === mentionName) {
          mentions.push(uid);
        }
      });
    }
    return mentions;
  }

  // ===== MINDMAP =====
  addMindmapChild(parentNode) {
    const children = parentNode.mindmapChildren || [];
    const childCount = children.length;
    // Position child to the right, spread vertically
    const gapX = 60;
    const gapY = 70;
    const totalH = childCount * gapY;
    const startY = parentNode.y + parentNode.height / 2 - totalH / 2;
    const childX = parentNode.x + parentNode.width + gapX;
    const childY = startY + childCount * gapY - 25;

    // Alternate colors for depth
    const colors = ['#4a9eff', '#4ecdc4', '#ffd966', '#ff6b6b', '#dda0dd', '#96ceb4', '#f4a460', '#45b7d1'];
    const depth = this._getMindmapDepth(parentNode);
    const color = colors[(depth + 1) % colors.length];

    const child = createMindmapNode(childX, childY, '', parentNode.id, color);
    child.fontSize = Math.max(11, 16 - depth * 2);
    child.width = Math.max(100, 160 - depth * 20);
    child.height = Math.max(36, 50 - depth * 5);

    // Update parent's children list
    if (!parentNode.mindmapChildren) parentNode.mindmapChildren = [];
    parentNode.mindmapChildren.push(child.id);

    const ops = [
      { type: 'add', elementId: child.id, element: child },
      { type: 'update', elementId: parentNode.id, props: { mindmapChildren: [...parentNode.mindmapChildren] } }
    ];
    const inverseOps = [
      { type: 'delete', elementId: child.id },
      { type: 'update', elementId: parentNode.id, props: { mindmapChildren: parentNode.mindmapChildren.filter(id => id !== child.id) } }
    ];

    this.renderer.elements.set(child.id, child);
    this.history.push(ops, inverseOps);
    this.sync.sendOps(ops);
    this.renderer.selectedIds.clear();
    this.renderer.selectedIds.add(child.id);
    this.renderer.markDirty();
    if (this.ui) this.ui.updateUndoRedoButtons();

    // Auto-layout siblings
    this._layoutMindmapChildren(parentNode);

    setTimeout(() => this.startTextEdit(child), 50);
  }

  _getMindmapDepth(node) {
    let depth = 0;
    let current = node;
    while (current && current.mindmapParent) {
      current = this.renderer.elements.get(current.mindmapParent);
      depth++;
    }
    return depth;
  }

  _layoutMindmapChildren(parentNode) {
    const children = (parentNode.mindmapChildren || []).map(id => this.renderer.elements.get(id)).filter(Boolean);
    if (children.length === 0) return;
    const gapY = 16;
    const totalH = children.reduce((s, c) => s + c.height + gapY, -gapY);
    const startY = parentNode.y + parentNode.height / 2 - totalH / 2;
    const childX = parentNode.x + parentNode.width + 60;
    let curY = startY;
    const ops = [];
    for (const child of children) {
      if (Math.abs(child.x - childX) > 1 || Math.abs(child.y - curY) > 1) {
        child.x = childX;
        child.y = curY;
        ops.push({ type: 'update', elementId: child.id, props: { x: childX, y: curY } });
      }
      curY += child.height + gapY;
      // Recursively layout grandchildren
      this._layoutMindmapChildren(child);
    }
    if (ops.length > 0) this.sync.sendOps(ops);
    this.renderer.markDirty();
  }

  // ===== FLOATING TOOLBAR =====
  initFloatingToolbar() {
    this._floatingToolbar = null;
    // Listen for selection changes
    const checkSelection = () => {
      if (this.renderer.selectedIds.size > 0 && !this.textEditElement) {
        this._showFloatingToolbar();
      } else {
        this._hideFloatingToolbar();
      }
    };
    // Check periodically (selection changes happen in many places)
    setInterval(checkSelection, 300);
  }

  _showFloatingToolbar() {
    if (this.textEditElement) { this._hideFloatingToolbar(); return; }
    const ids = Array.from(this.renderer.selectedIds);
    if (ids.length === 0) { this._hideFloatingToolbar(); return; }

    // Get bounds of selection
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const el = this.renderer.elements.get(id);
      if (!el) continue;
      const b = getElementBounds(el);
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    if (!isFinite(minX)) return;

    const screen = this.renderer.worldToScreen((minX + maxX) / 2, minY);
    const topY = screen.y - 50;
    if (topY < 60) return; // Too close to main toolbar

    if (!this._floatingToolbar) {
      const tb = document.createElement('div');
      tb.className = 'floating-toolbar';
      tb.innerHTML = `
        <button class="ftb-btn" data-action="duplicate" title="Dupliquer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        </button>
        <button class="ftb-btn" data-action="delete" title="Supprimer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
        <span class="ftb-sep"></span>
        <button class="ftb-btn" data-action="bringFront" title="Mettre devant">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="8" y="2" width="13" height="13" rx="2"/><rect x="3" y="9" width="13" height="13" rx="2" opacity="0.3"/>
          </svg>
        </button>
        <button class="ftb-btn" data-action="sendBack" title="Mettre derriere">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="3" y="9" width="13" height="13" rx="2"/><rect x="8" y="2" width="13" height="13" rx="2" opacity="0.3"/>
          </svg>
        </button>
        <span class="ftb-sep"></span>
        <button class="ftb-btn" data-action="lock" title="Verrouiller">🔒</button>
        <button class="ftb-btn" data-action="emoji" title="Emoji">😀</button>
        <button class="ftb-btn" data-action="shadow" title="Ombre">◐</button>
        <button class="ftb-btn" data-action="radius" title="Arrondi">◢</button>
      `;
      tb.addEventListener('pointerdown', (e) => e.stopPropagation());
      tb.addEventListener('click', (e) => {
        const btn = e.target.closest('.ftb-btn');
        if (!btn) return;
        const action = btn.dataset.action;
        this._handleFloatingAction(action);
      });
      document.body.appendChild(tb);
      this._floatingToolbar = tb;
    }

    this._floatingToolbar.style.left = screen.x + 'px';
    this._floatingToolbar.style.top = topY + 'px';
    this._floatingToolbar.style.display = 'flex';
  }

  _hideFloatingToolbar() {
    if (this._floatingToolbar) {
      this._floatingToolbar.style.display = 'none';
    }
  }

  _handleFloatingAction(action) {
    switch (action) {
      case 'duplicate':
        this.duplicateSelected();
        break;
      case 'delete':
        this.deleteSelected();
        break;
      case 'bringFront':
        this.updateSelectedElements({ zIndex: Date.now() });
        break;
      case 'sendBack':
        this.updateSelectedElements({ zIndex: 1 });
        break;
      case 'lock': {
        const id = this.renderer.selectedIds.values().next().value;
        const el = id ? this.renderer.elements.get(id) : null;
        if (el) this.updateSelectedElements({ locked: !el.locked });
        break;
      }
      case 'emoji':
        this._showEmojiPicker();
        break;
      case 'shadow': {
        const id2 = this.renderer.selectedIds.values().next().value;
        const el2 = id2 ? this.renderer.elements.get(id2) : null;
        if (el2) this.updateSelectedElements({ shadowEnabled: !el2.shadowEnabled });
        break;
      }
      case 'radius': {
        const val = prompt('Rayon des coins (px):', '12');
        if (val !== null) {
          this.updateSelectedElements({ borderRadius: parseInt(val) || 0 });
        }
        break;
      }
    }
  }

  _showEmojiPicker() {
    const existing = document.querySelector('.emoji-picker-panel');
    if (existing) { existing.remove(); return; }
    const emojis = ['😀','😍','🤔','👍','👎','❤️','🎉','⭐','🔥','💡','✅','❌','⚡','🚀','💪','🎯','📌','💬','🏆','🌟'];
    const picker = document.createElement('div');
    picker.className = 'emoji-picker-panel';
    picker.innerHTML = emojis.map(e => `<button class="emoji-btn">${e}</button>`).join('');

    // Position near floating toolbar
    const tb = this._floatingToolbar;
    if (tb) {
      picker.style.left = tb.style.left;
      picker.style.top = (parseInt(tb.style.top) - 50) + 'px';
    }

    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('.emoji-btn');
      if (!btn) return;
      const emoji = btn.textContent;
      // Add emoji to selected elements' text
      for (const id of this.renderer.selectedIds) {
        const el = this.renderer.elements.get(id);
        if (el) {
          const oldText = el.text || '';
          const newText = oldText + ' ' + emoji;
          const ops = [{ type: 'update', elementId: el.id, props: { text: newText } }];
          const inverseOps = [{ type: 'update', elementId: el.id, props: { text: oldText } }];
          el.text = newText;
          this.history.push(ops, inverseOps);
          this.sync.sendOps(ops);
        }
      }
      this.renderer.markDirty();
      picker.remove();
    });
    picker.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(picker);
    setTimeout(() => {
      document.addEventListener('pointerdown', function h(e) {
        if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('pointerdown', h); }
      });
    }, 0);
  }

  // ===== TAG FILTERING =====
  initTagFilter() {
    const filterBar = document.getElementById('tagFilterBar');
    if (!filterBar) return;

    this._tagFilterActive = null;

    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.tag-filter-btn');
      if (!btn) return;
      const tag = btn.dataset.tag;
      if (tag === '__clear__') {
        this._tagFilterActive = null;
        this.renderer._activeTagFilter = null;
      } else {
        this._tagFilterActive = tag;
        this.renderer._activeTagFilter = tag;
      }
      this.renderer.markDirty();
      this._updateTagFilterBar();
    });
  }

  _updateTagFilterBar() {
    const filterBar = document.getElementById('tagFilterBar');
    if (!filterBar) return;

    // Collect all tags from elements
    const tagCounts = new Map();
    for (const [, el] of this.renderer.elements) {
      if (el.tags) {
        for (const t of el.tags) {
          tagCounts.set(t.label, (tagCounts.get(t.label) || 0) + 1);
        }
      }
    }

    if (tagCounts.size === 0) {
      filterBar.style.display = 'none';
      return;
    }

    filterBar.style.display = 'flex';
    filterBar.innerHTML = `
      <button class="tag-filter-btn ${!this._tagFilterActive ? 'active' : ''}" data-tag="__clear__">Tous</button>
      ${Array.from(tagCounts.entries()).map(([label, count]) => {
        const regTag = (this.tagRegistry || []).find(t => t.label === label);
        const color = regTag ? regTag.color : '#888';
        return `<button class="tag-filter-btn ${this._tagFilterActive === label ? 'active' : ''}" data-tag="${label}" style="--tag-color:${color}">${label} (${count})</button>`;
      }).join('')}
    `;
  }

  // ===== EMBED HANDLER =====
  initEmbedHandler() {
    this.renderer.canvas.addEventListener('dblclick', (e) => {
      const world = this.renderer.screenToWorld(e.clientX, e.clientY);
      const hit = this.renderer.hitTest(world.x, world.y);
      if (hit && hit.type === 'embed' && hit.embedUrl) {
        this._openEmbedOverlay(hit);
      }
    });
  }

  _openEmbedOverlay(el) {
    const existing = document.querySelector('.embed-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'embed-overlay';

    let embedHtml = '';
    const url = el.embedUrl;
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (ytMatch) {
      embedHtml = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%"></iframe>`;
    }
    // Figma
    else if (url.includes('figma.com')) {
      embedHtml = `<iframe src="https://www.figma.com/embed?embed_host=darkboard&url=${encodeURIComponent(url)}" frameborder="0" allowfullscreen style="width:100%;height:100%"></iframe>`;
    }
    // Google Docs/Sheets/Slides
    else if (url.includes('docs.google.com') || url.includes('sheets.google.com') || url.includes('slides.google.com')) {
      const pubUrl = url.includes('/pub') ? url : url.replace(/\/edit.*/, '/pub');
      embedHtml = `<iframe src="${pubUrl}" frameborder="0" style="width:100%;height:100%"></iframe>`;
    }
    // Generic
    else {
      embedHtml = `<iframe src="${url}" frameborder="0" style="width:100%;height:100%"></iframe>`;
    }

    overlay.innerHTML = `
      <div class="embed-overlay-header">
        <span>${url}</span>
        <button class="embed-overlay-close">&times;</button>
      </div>
      <div class="embed-overlay-body">${embedHtml}</div>
    `;

    overlay.querySelector('.embed-overlay-close').addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  // ===== AUTO TAG COLOR =====
  getAutoTagColor(label) {
    const colors = ['#FF6B6B', '#F4A460', '#FFD966', '#4ECDC4', '#45B7D1', '#4a9eff', '#DDA0DD', '#96CEB4', '#e94560', '#0f3460'];
    // Deterministic color from label hash
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
      hash = ((hash << 5) - hash) + label.charCodeAt(i);
      hash |= 0;
    }
    return colors[Math.abs(hash) % colors.length];
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  window.app = new DarkBoardApp();
  // Remove loading overlay
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.opacity = '0';
    setTimeout(() => loadingOverlay.remove(), 300);
  }
});
