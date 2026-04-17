// #198: ui.js - UI initialization and management for DarkBoard.
// Handles toolbar, property panel, help overlay, search, themes, views (table/kanban), and all UI interactions.
class UI {
  constructor(app) {
    this.app = app;
    this.contextMenu = null;
    this.initToolbar();
    this.initUndoRedo();
    this.initColorPanel();
    this.initZoomControls();
    this.initShareButton();
    this.initExportButton();
    this.initCSVExport();
    this.initJSONExport();
    this.initJSONImport();
    this.initThemeToggle();
    this.initTemplates();
    this.initMinimap();
    this.initSnapToGrid();
    this.initLaserPointer();
    this.initPresentationMode();
    this.initHelpOverlay();
    this.initViewModes();
    this.initR2Features(); // #R2-101-150: New feature UI bindings
  }

  // #R2-101-150: Initialize new feature UI bindings
  initR2Features() {
    // #R2-134: Presence tracking - detect idle state
    let idleTimer = null;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (this.app.sync && this.app.sync.sendPresence) {
        this.app.sync.sendPresence('online');
      }
      idleTimer = setTimeout(() => {
        if (this.app.sync && this.app.sync.sendPresence) {
          this.app.sync.sendPresence('idle');
        }
      }, 120000); // 2 minutes idle
    };
    document.addEventListener('mousemove', resetIdle, { passive: true });
    document.addEventListener('keydown', resetIdle, { passive: true });

    // #R2-131: Typing indicator on text edit
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.addEventListener('input', () => {
        if (this.app.sync && this.app.sync.sendTyping) {
          this.app.sync.sendTyping();
        }
      });
    }
  }

  initToolbar() {
    const btns = document.querySelectorAll('.tool-btn[data-tool]');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.app.setTool(btn.dataset.tool);
      });
    });
  }

  initUndoRedo() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => this.app.undo());
    }
    if (redoBtn) {
      redoBtn.addEventListener('click', () => this.app.redo());
    }
  }

  updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = !this.app.history.canUndo();
    if (redoBtn) redoBtn.disabled = !this.app.history.canRedo();
  }

  updateToolbar(toolName) {
    const btns = document.querySelectorAll('.tool-btn[data-tool]');
    btns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
    const tool = Tools[toolName];
    if (tool) {
      this.app.renderer.canvas.style.cursor = tool.cursor;
    }
  }

  initColorPanel() {
    const fillColors = [
      'transparent', '#ffffff', '#888888', '#333333',
      '#FF6B6B', '#FFD966', '#4ECDC4', '#45B7D1', '#96CEB4', '#4a9eff'
    ];

    const strokeColors = [
      'transparent', '#ffffff', '#888888', '#333333',
      '#FF6B6B', '#FFD966', '#4ECDC4', '#45B7D1', '#96CEB4', '#4a9eff'
    ];

    const fillRow = document.getElementById('fillColors');
    const strokeRow = document.getElementById('strokeColors');

    // #143 - Recent colors row
    const recentColors = this.app.getRecentColors ? this.app.getRecentColors() : [];
    if (recentColors.length > 0) {
      const recentLabel = document.createElement('span');
      recentLabel.className = 'color-recent-label';
      recentLabel.textContent = 'Recents';
      const recentRow = document.createElement('div');
      recentRow.className = 'color-recent-row';
      recentRow.id = 'recentFillColors';
      recentColors.forEach(color => {
        const swatch = this.createSwatch(color, 'fill');
        recentRow.appendChild(swatch);
      });
      const fillSection = fillRow.parentElement;
      fillSection.insertBefore(recentRow, fillRow);
      fillSection.insertBefore(recentLabel, recentRow);
    }

    fillColors.forEach(color => {
      const swatch = this.createSwatch(color, 'fill');
      if (color === this.app.currentFill) swatch.classList.add('active');
      fillRow.appendChild(swatch);
    });

    strokeColors.forEach(color => {
      const swatch = this.createSwatch(color, 'stroke');
      if (color === this.app.currentStroke) swatch.classList.add('active');
      strokeRow.appendChild(swatch);
    });

    // Stroke widths
    const widths = [1, 2, 4, 8];
    const widthRow = document.getElementById('strokeWidths');
    widths.forEach(w => {
      const btn = document.createElement('button');
      btn.className = 'stroke-btn' + (w === this.app.currentStrokeWidth ? ' active' : '');
      btn.textContent = w;
      btn.addEventListener('click', () => {
        this.app.currentStrokeWidth = w;
        widthRow.querySelectorAll('.stroke-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.app.updateSelectedElements({ strokeWidth: w });
      });
      widthRow.appendChild(btn);
    });

    // Toggle color panel
    const toggle = document.getElementById('colorPanelToggle');
    const panel = document.getElementById('colorPanel');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : 'flex';
        toggle.classList.toggle('active', !visible);
      });
      // Close panel when clicking outside
      document.addEventListener('pointerdown', (e) => {
        if (panel.style.display !== 'none' && !panel.contains(e.target) && !toggle.contains(e.target)) {
          panel.style.display = 'none';
          toggle.classList.remove('active');
        }
      });
    }
  }

  createSwatch(color, type) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    if (color === 'transparent') {
      swatch.style.background = '#1e1e1e';
      swatch.style.backgroundImage = 'linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%), linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%)';
      swatch.style.backgroundSize = '8px 8px';
      swatch.style.backgroundPosition = '0 0, 4px 4px';
    } else {
      swatch.style.background = color;
    }

    swatch.addEventListener('click', () => {
      const row = swatch.parentElement;
      row.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');

      if (type === 'fill') {
        this.app.currentFill = color;
        // #149 - Update all selected stickies simultaneously
        this.app.updateSelectedElements({ fill: color });
      } else {
        this.app.currentStroke = color;
        this.app.updateSelectedElements({ stroke: color });
      }
      // #143 - Track recent color
      if (this.app.trackRecentColor) this.app.trackRecentColor(color);

      // Update color indicator
      const indicatorId = type === 'fill' ? 'colorIndicatorFill' : 'colorIndicatorStroke';
      const indicator = document.getElementById(indicatorId);
      if (indicator) {
        if (color === 'transparent') {
          indicator.style.background = '#1e1e1e';
          indicator.style.backgroundImage = 'linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%), linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%)';
          indicator.style.backgroundSize = '6px 6px';
          indicator.style.backgroundPosition = '0 0, 3px 3px';
        } else {
          indicator.style.background = color;
          indicator.style.backgroundImage = 'none';
        }
      }
    });

    return swatch;
  }

  initZoomControls() {
    document.getElementById('zoomIn').addEventListener('click', () => {
      const z = this.app.renderer.camera.zoom * 1.2;
      this.app.renderer.setZoom(z);
      this.app.updateZoomDisplay();
    });

    document.getElementById('zoomOut').addEventListener('click', () => {
      const z = this.app.renderer.camera.zoom / 1.2;
      this.app.renderer.setZoom(z);
      this.app.updateZoomDisplay();
    });

    document.getElementById('zoomLevel').addEventListener('click', () => {
      this.app.renderer.camera.zoom = 1;
      this.app.renderer.camera.x = 0;
      this.app.renderer.camera.y = 0;
      this.app.renderer.markDirty();
      this.app.updateZoomDisplay();
    });

    document.getElementById('zoomFit').addEventListener('click', () => {
      this.fitToScreen();
    });
  }

  fitToScreen() {
    const elements = Array.from(this.app.renderer.elements.values());
    if (elements.length === 0) {
      this.app.showToast('Aucun élément sur le tableau');
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      const bounds = getElementBounds(el);
      if (bounds.x < minX) minX = bounds.x;
      if (bounds.y < minY) minY = bounds.y;
      if (bounds.x + bounds.w > maxX) maxX = bounds.x + bounds.w;
      if (bounds.y + bounds.h > maxY) maxY = bounds.y + bounds.h;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 80;
    const scaleX = (window.innerWidth - padding * 2) / contentW;
    const scaleY = (window.innerHeight - padding * 2) / contentH;
    const zoom = clamp(Math.min(scaleX, scaleY), 0.1, 5);
    const centerX = minX + contentW / 2;
    const centerY = minY + contentH / 2;

    this.app.animateToView(centerX, centerY, zoom);
  }

  initExportButton() {
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportPNG();
    });
  }

  exportPNG() {
    const elements = Array.from(this.app.renderer.elements.values());
    if (elements.length === 0) {
      this.app.showToast('Rien à exporter');
      return;
    }

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      const bounds = getElementBounds(el);
      if (bounds.x < minX) minX = bounds.x;
      if (bounds.y < minY) minY = bounds.y;
      if (bounds.x + bounds.w > maxX) maxX = bounds.x + bounds.w;
      if (bounds.y + bounds.h > maxY) maxY = bounds.y + bounds.h;
    }

    const pad = 40;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w * 2;
    exportCanvas.height = h * 2;
    const ctx = exportCanvas.getContext('2d');
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = this.app.renderer.bgColor || '#121212';
    ctx.fillRect(0, 0, w, h);

    // Translate to fit
    ctx.translate(-minX + pad, -minY + pad);

    // Render all elements
    const sorted = elements.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    for (const el of sorted) {
      renderElement(ctx, el, false, { zoom: 1 });
    }

    // Insuffle watermark
    ctx.translate(minX - pad, minY - pad); // back to export coords
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    // Gradient-like branding
    ctx.fillStyle = '#4a9eff';
    ctx.fillText('Insuffle', w - 16, h - 12);
    ctx.globalAlpha = 0.35;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('Insuffle Academie — DarkBoard', w - 16, h - 28);
    ctx.restore();

    // Download
    const link = document.createElement('a');
    link.download = `insuffle-darkboard-${getBoardId()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
    // #136 - Export success feedback with thumbnail preview
    this.app.showToast('PNG exporte!', 'success');
  }

  initCSVExport() {
    document.getElementById('exportCSV').addEventListener('click', () => {
      this.exportCSV();
    });
  }

  exportCSV() {
    const elements = Array.from(this.app.renderer.elements.values());
    if (elements.length === 0) {
      this.app.showToast('Rien à exporter');
      return;
    }

    const headers = ['id', 'type', 'x', 'y', 'width', 'height', 'text', 'fill', 'stroke', 'tags', 'children'];
    const rows = [headers.join(',')];

    for (const el of elements) {
      const row = [
        el.id,
        el.type,
        Math.round(el.x),
        Math.round(el.y),
        Math.round(el.width || 0),
        Math.round(el.height || 0),
        '"' + (el.text || '').replace(/"/g, '""') + '"',
        el.fill || '',
        el.stroke || '',
        el.tags ? el.tags.map(t => t.label).join(';') : '',
        el.children ? el.children.join(';') : ''
      ];
      rows.push(row.join(','));
    }

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = `darkboard-${getBoardId()}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    this.app.showToast('Export CSV terminé !', 'success');
  }

  initJSONExport() {
    document.getElementById('exportJSON').addEventListener('click', () => {
      this.exportJSON();
    });
  }

  // #145 - Export all (JSON + PNG sequentially)
  exportAll() {
    this.exportJSON();
    setTimeout(() => {
      this.exportPNG();
      this.app.showToast('Export complet (JSON + PNG) terminé !', 'success');
    }, 500);
  }

  exportJSON() {
    const elements = Array.from(this.app.renderer.elements.values());
    const anchors = this.app.workshop && this.app.workshop.anchors ? Array.from(this.app.workshop.anchors.values()) : [];
    if (elements.length === 0) {
      this.app.showToast('Rien à exporter');
      return;
    }

    const data = {
      format: 'darkboard',
      version: 1,
      boardId: getBoardId(),
      exportedAt: new Date().toISOString(),
      elements: elements,
      anchors: anchors
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = `darkboard-${getBoardId()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    this.app.showToast('Export JSON terminé !', 'success');
  }

  initJSONImport() {
    document.getElementById('importJSON').addEventListener('click', () => {
      this.triggerImport();
    });
  }

  triggerImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.drft,.rtb,.csv,.md,.markdown';
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            this.importMarkdown(ev.target.result);
          } catch (err) {
            console.error('Markdown import error:', err);
            this.app.showToast('Erreur lors de l\'import Markdown');
          }
        };
        reader.readAsText(file);
      } else if (file.name.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            this.importCSV(ev.target.result, file.name);
          } catch (err) {
            console.error('CSV import error:', err);
            this.app.showToast('Erreur lors de l\'import CSV');
          }
        };
        reader.readAsText(file);
      } else if (file.name.endsWith('.rtb')) {
        // .rtb files are ZIP archives - read as ArrayBuffer
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            this.importRTB(ev.target.result, file.name);
          } catch (err) {
            console.error('RTB import error:', err);
            this.app.showToast('Erreur lors de l\'import du fichier .rtb');
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            this.importData(data, file.name);
          } catch (err) {
            this.app.showToast('Fichier invalide : JSON attendu');
          }
        };
        reader.readAsText(file);
      }
    });
    input.click();
  }

  importData(data, filename) {
    // Detect format
    if (data.format === 'darkboard' && data.elements) {
      this.importDarkBoard(data);
    } else if (data.cards || data.stickies || data.items || data.objects) {
      this.importDraftIO(data);
    } else if (Array.isArray(data)) {
      // Array of elements (simple format)
      this.importDarkBoard({ elements: data, anchors: [] });
    } else if (data.elements && !data.format) {
      // Generic elements export
      this.importDarkBoard(data);
    } else if (data.widgets) {
      // Miro format with widgets array
      this.importMiroData(data);
    } else {
      // Try Draft.io-like structure: look for any array of objects with position data
      const arrays = Object.values(data).filter(v => Array.isArray(v) && v.length > 0);
      if (arrays.length > 0) {
        this.importGenericBoard(data);
      } else {
        this.app.showToast('Format non reconnu');
      }
    }
  }

  importDarkBoard(data) {
    const elements = data.elements || [];
    if (elements.length === 0) {
      this.app.showToast('Aucun élément à importer');
      return;
    }

    // Find bounding box to center imported content
    let minX = Infinity, minY = Infinity;
    for (const el of elements) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
    }

    // Offset to place near current camera position
    const camX = this.app.renderer.camera.x;
    const camY = this.app.renderer.camera.y;
    const offsetX = camX - minX - 200;
    const offsetY = camY - minY - 200;

    // Map old IDs to new IDs for references (children, connectors)
    const idMap = new Map();
    const prepared = [];

    for (let i = 0; i < elements.length; i++) {
      const el = deepClone(elements[i]);
      const newId = generateId();
      idMap.set(el.id, newId);
      el.id = newId;
      el.x += offsetX;
      el.y += offsetY;
      if (el.x2 !== undefined) { el.x2 += offsetX; el.y2 += offsetY; }
      if (el.points) {
        el.points = el.points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
      }
      el.zIndex = Date.now() + i;
      prepared.push(el);
    }

    // Fix references (children, connectors) before adding to the board,
    // so the batch op carries the correct linked IDs.
    for (const el of prepared) {
      if (el.children) {
        el.children = el.children.map(cid => idMap.get(cid) || cid);
      }
      if (el.sourceId && idMap.has(el.sourceId)) el.sourceId = idMap.get(el.sourceId);
      if (el.targetId && idMap.has(el.targetId)) el.targetId = idMap.get(el.targetId);
    }

    // Send all elements in a single sync op to avoid tripping the
    // per-client 100 ops/sec rate limiter on large imports.
    this.app.addElementsBatch(prepared);
    this.app.showToast(`${prepared.length} éléments importés !`);
  }

  importDraftIO(data) {
    // Draft.io .drft files contain cards, stickies, lists, envelopes, etc.
    const elements = [];
    let x = 0, y = 0;
    const spacing = 220;
    const perRow = 5;

    // Extract items from various Draft.io structures
    const items = data.cards || data.stickies || data.items || data.objects || [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const col = i % perRow;
      const row = Math.floor(i / perRow);

      const el = {
        id: generateId(),
        type: 'sticky',
        x: item.x ?? item.position?.x ?? (col * spacing),
        y: item.y ?? item.position?.y ?? (row * spacing),
        width: item.width || item.w || 200,
        height: item.height || item.h || 200,
        fill: item.color || item.fill || item.backgroundColor || '#FFD966',
        stroke: 'transparent',
        text: item.text || item.content || item.title || item.label || item.name || '',
        richText: item.richText || null,
        fontSize: item.fontSize || 16,
        zIndex: Date.now() + i,
        rotation: item.rotation || 0,
        locked: false,
        groupId: null
      };

      // Handle Draft.io card type → DarkBoard card
      if (item.type === 'card' || item.cardTitle) {
        el.type = 'card';
        el.width = item.width || 280;
        el.height = item.height || 180;
        el.cardTitle = item.cardTitle || item.title || item.text || '';
        el.cardDescription = item.cardDescription || item.description || item.content || '';
        el.cardStatus = item.status || item.cardStatus || 'À faire';
        el.cardPriority = item.priority || item.cardPriority || 'Moyenne';
        el.fill = item.color || item.fill || '#4a9eff';
      }

      // Handle list type
      if (item.type === 'list') {
        el.type = 'list';
        el.width = item.width || 280;
        el.height = item.height || 300;
        el.listItems = item.listItems || item.items || [];
      }

      // Handle envelope/group type
      if (item.type === 'envelope' || item.type === 'group' || item.type === 'container') {
        el.type = 'envelope';
        el.width = item.width || 300;
        el.height = item.height || 250;
        el.children = [];
      }

      elements.push(el);
    }

    if (elements.length === 0) {
      this.app.showToast('Aucun élément trouvé dans le fichier');
      return;
    }

    // Place near camera
    const camX = this.app.renderer.camera.x;
    const camY = this.app.renderer.camera.y;
    let minX = Infinity, minY = Infinity;
    for (const el of elements) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
    }
    const offsetX = camX - minX - 200;
    const offsetY = camY - minY - 200;

    for (const el of elements) {
      el.x += offsetX;
      el.y += offsetY;
    }
    // Batch to avoid the rate limiter on large imports.
    this.app.addElementsBatch(elements);
    this.app.showToast(`${elements.length} éléments importés depuis Draft.io !`);
  }

  importGenericBoard(data) {
    // Try to find any array that looks like board elements
    const arrays = Object.entries(data)
      .filter(([, v]) => Array.isArray(v) && v.length > 0)
      .sort((a, b) => b[1].length - a[1].length);

    if (arrays.length === 0) {
      this.app.showToast('Format non reconnu');
      return;
    }

    // Use the largest array as the source
    const [key, items] = arrays[0];
    this.importDraftIO({ items });
  }

  // ========================= MARKDOWN IMPORT =========================

  importMarkdown(text) {
    const lines = text.split('\n');
    const ops = [];
    let x = 100, y = 100;
    const gap = 16;
    let lastType = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Headers -> frames
      if (/^#{1,3}\s/.test(trimmed)) {
        const headerText = trimmed.replace(/^#+\s*/, '');
        const frame = createFrame(x, y, 600, 40, headerText);
        frame.id = generateId();
        ops.push({ type: 'add', elementId: frame.id, element: frame });
        y += 60;
        lastType = 'header';
        continue;
      }

      // List items -> stickies
      if (/^[-*+]\s|^\d+\.\s/.test(trimmed)) {
        const itemText = trimmed.replace(/^[-*+]\s*|^\d+\.\s*/, '');
        const sticky = createSticky(x, y);
        sticky.id = generateId();
        sticky.text = itemText;
        sticky.width = 200;
        sticky.height = 150;
        ops.push({ type: 'add', elementId: sticky.id, element: sticky });
        // Grid layout for list items
        x += 220;
        if (x > 900) { x = 100; y += 170; }
        lastType = 'list';
        continue;
      }

      // Regular text -> text element
      const textEl = createTextElement(x, y);
      textEl.id = generateId();
      textEl.text = trimmed;
      textEl.width = 600;
      ops.push({ type: 'add', elementId: textEl.id, element: textEl });
      y += 50;
      lastType = 'text';
    }

    if (ops.length === 0) {
      this.app.showToast('Fichier Markdown vide');
      return;
    }

    // Batch via the shared helper so history + WS stay consistent with other imports.
    this.app.addElementsBatch(ops.map(op => op.element));
    this.app.showToast(`${ops.length} éléments importés depuis Markdown`);
  }

  // ========================= CSV IMPORT =========================

  importCSV(text, filename) {
    const rows = this.parseCSVRows(text);
    if (rows.length < 2) {
      this.app.showToast('Fichier CSV vide ou invalide');
      return;
    }

    // Header row
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const dataRows = rows.slice(1).filter(r => r.length >= 2);

    if (dataRows.length === 0) {
      this.app.showToast('Aucune donnée dans le CSV');
      return;
    }

    // Build column index map
    const col = (name) => {
      // Try exact match first, then fuzzy
      let idx = headers.indexOf(name);
      if (idx !== -1) return idx;
      // Fuzzy matching for common column names
      const aliases = {
        'type': ['type', 'element_type', 'kind'],
        'text': ['text', 'title', 'content', 'label', 'name', 'description', 'texte', 'titre', 'contenu'],
        'x': ['x', 'posx', 'pos_x', 'left', 'position_x'],
        'y': ['y', 'posy', 'pos_y', 'top', 'position_y'],
        'width': ['width', 'w', 'largeur'],
        'height': ['height', 'h', 'hauteur'],
        'color': ['color', 'fill', 'couleur', 'background', 'bg', 'backgroundcolor', 'fill_color'],
        'stroke': ['stroke', 'border', 'bordercolor', 'stroke_color', 'contour'],
        'tags': ['tags', 'tag', 'etiquettes', 'etiquette', 'labels', 'label', 'categories', 'category'],
        'id': ['id', 'database_id', 'element_id', 'uid'],
        'fontsize': ['fontsize', 'font_size', 'size', 'taille'],
        'rotation': ['rotation', 'angle', 'rotate'],
        'status': ['status', 'statut', 'cardstatus', 'card_status'],
        'priority': ['priority', 'priorite', 'cardpriority'],
        'assignee': ['assignee', 'assigné', 'responsable', 'owner'],
      };
      const aliasList = aliases[name] || [name];
      for (const alias of aliasList) {
        idx = headers.indexOf(alias);
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const getVal = (row, name) => {
      const idx = col(name);
      return idx !== -1 && idx < row.length ? row[idx].trim() : '';
    };

    const getNum = (row, name, def) => {
      const v = getVal(row, name);
      const n = parseFloat(v);
      return isNaN(n) ? def : n;
    };

    const elements = [];

    // Type column detection
    const hasType = col('type') !== -1;
    const hasX = col('x') !== -1;
    const hasY = col('y') !== -1;

    // Default spacing when no coordinates
    const spacing = 220;
    const perRow = 5;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rawType = getVal(row, 'type').toLowerCase();
      const text = getVal(row, 'text');

      // Skip completely empty rows
      if (!text && !rawType) continue;

      // Map CSV type to DarkBoard type
      let dbType = 'sticky';
      if (rawType === 'textbox' || rawType === 'text' || rawType === 'label') dbType = 'text';
      else if (rawType === 'chunk' || rawType === 'frame' || rawType === 'section' || rawType === 'zone') dbType = 'frame';
      else if (rawType === 'rect' || rawType === 'rectangle' || rawType === 'shape') dbType = 'rect';
      else if (rawType === 'circle' || rawType === 'ellipse') dbType = 'circle';
      else if (rawType === 'diamond' || rawType === 'losange') dbType = 'diamond';
      else if (rawType === 'card' || rawType === 'carte') dbType = 'card';
      else if (rawType === 'sticky' || rawType === 'postit' || rawType === 'post-it' || rawType === 'note') dbType = 'sticky';
      else if (rawType === 'connector' || rawType === 'line' || rawType === 'arrow' || rawType === 'fleche') dbType = 'connector';
      else if (rawType === 'envelope' || rawType === 'enveloppe') dbType = 'envelope';
      else if (rawType === 'list' || rawType === 'liste') dbType = 'list';

      // Position: use CSV values or auto-layout in grid
      const autoCol = i % perRow;
      const autoRow = Math.floor(i / perRow);
      const x = hasX ? getNum(row, 'x', autoCol * spacing) : autoCol * spacing;
      const y = hasY ? getNum(row, 'y', autoRow * spacing) : autoRow * spacing;
      const width = getNum(row, 'width', dbType === 'frame' ? 500 : dbType === 'card' ? 280 : 200);
      const height = getNum(row, 'height', dbType === 'frame' ? 500 : dbType === 'card' ? 180 : 200);

      // Color
      let color = getVal(row, 'color') || '';
      if (color === 'transparent' || color === '') {
        if (dbType === 'sticky') color = STICKY_COLORS[i % STICKY_COLORS.length];
        else if (dbType === 'frame') color = 'transparent';
        else if (dbType === 'text') color = 'transparent';
        else color = 'transparent';
      }

      const stroke = getVal(row, 'stroke') || (dbType === 'sticky' ? 'transparent' : '#888888');
      const fontSize = getNum(row, 'fontsize', dbType === 'text' ? 20 : 16);
      const rotation = getNum(row, 'rotation', 0);

      const el = {
        id: generateId(),
        type: dbType,
        x: x,
        y: y,
        width: width,
        height: height,
        fill: color,
        stroke: stroke,
        strokeWidth: 2,
        text: text,
        fontSize: fontSize,
        zIndex: Date.now() + i,
        rotation: rotation,
        locked: false,
        groupId: null,
        tags: []
      };

      // Parse tags
      const tagsStr = getVal(row, 'tags');
      if (tagsStr) {
        const TAG_COLORS = ['#FF6B6B', '#F4A460', '#FFD966', '#4ECDC4', '#45B7D1', '#4a9eff', '#DDA0DD', '#96CEB4'];
        const tagLabels = tagsStr.split(';').map(t => t.trim()).filter(t => t);
        el.tags = tagLabels.map((label, j) => ({
          label,
          color: TAG_COLORS[j % TAG_COLORS.length]
        }));
      }

      // Card-specific fields
      if (dbType === 'card') {
        el.cardTitle = text;
        el.cardDescription = getVal(row, 'text') || '';
        el.cardStatus = getVal(row, 'status') || 'À faire';
        el.cardPriority = getVal(row, 'priority') || 'Moyenne';
        el.cardAssignee = getVal(row, 'assignee') || '';
        el.fill = color || '#4a9eff';
      }

      // Frame-specific
      if (dbType === 'frame') {
        el.stroke = color !== 'transparent' ? color : '#4a9eff';
        el.fill = 'transparent';
        el.children = [];
      }

      // Text-specific
      if (dbType === 'text') {
        el.fill = 'transparent';
        el.stroke = 'transparent';
        el.fontSize = fontSize || 20;
      }

      elements.push(el);
    }

    if (elements.length === 0) {
      this.app.showToast('Aucun élément trouvé dans le CSV');
      return;
    }

    // Place near camera
    const camX = this.app.renderer.camera.x;
    const camY = this.app.renderer.camera.y;
    let minX = Infinity, minY = Infinity;
    for (const el of elements) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
    }
    const offsetX = camX - minX;
    const offsetY = camY - minY;

    for (const el of elements) {
      el.x += offsetX;
      el.y += offsetY;
      if (el.x2 !== undefined) { el.x2 += offsetX; el.y2 += offsetY; }
    }
    // Batch to avoid tripping the 100 ops/sec WS rate limiter on large CSVs.
    this.app.addElementsBatch(elements);
    this.app.showToast(`${elements.length} éléments importés depuis CSV !`);
  }

  parseCSVRows(text) {
    // Auto-detect separator: tab, semicolon, or comma
    const firstLine = text.split(/\r?\n/)[0] || '';
    let sep = ',';
    if (firstLine.includes('\t') && firstLine.split('\t').length > firstLine.split(',').length) {
      sep = '\t';
    } else if (firstLine.includes(';') && !firstLine.includes(',')) {
      sep = ';';
    }

    // RFC 4180 compliant parser - handles quoted fields, newlines in quotes, escaped quotes
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          field += ch;
          i++;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
        } else if (ch === sep) {
          row.push(field);
          field = '';
          i++;
        } else if (ch === '\n' || ch === '\r') {
          row.push(field);
          field = '';
          rows.push(row);
          row = [];
          if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
          i++;
        } else {
          field += ch;
          i++;
        }
      }
    }

    if (field || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  importRTB(buffer, filename) {
    // Minimal ZIP extraction - find JSON files in the archive
    const bytes = new Uint8Array(buffer);
    const jsonFiles = this.extractZipEntries(bytes);

    if (jsonFiles.length === 0) {
      // Maybe it's just JSON with .rtb extension
      try {
        const text = new TextDecoder().decode(bytes);
        const data = JSON.parse(text);
        this.importMiroData(data);
        return;
      } catch(e) {
        this.app.showToast('Fichier .rtb non reconnu');
        return;
      }
    }

    // Try to find the main board data
    let boardData = null;
    for (const entry of jsonFiles) {
      try {
        const data = JSON.parse(entry.text);
        // Miro typically has widgets array or items
        if (data.widgets || data.items || data.objects || data.elements || Array.isArray(data)) {
          boardData = data;
          break;
        }
      } catch(e) {
        continue;
      }
    }

    if (!boardData) {
      // Use first JSON file if nothing specific found
      try {
        boardData = JSON.parse(jsonFiles[0].text);
      } catch(e) {
        this.app.showToast('Aucune donnée trouvée dans le fichier .rtb');
        return;
      }
    }

    this.importMiroData(boardData);
  }

  extractZipEntries(bytes) {
    // Minimal ZIP parser - extracts uncompressed (stored) text entries
    const entries = [];
    const decoder = new TextDecoder();
    let offset = 0;

    while (offset < bytes.length - 4) {
      // Look for local file header signature: PK\x03\x04
      if (bytes[offset] === 0x50 && bytes[offset+1] === 0x4B &&
          bytes[offset+2] === 0x03 && bytes[offset+3] === 0x04) {

        const compressionMethod = bytes[offset + 8] | (bytes[offset + 9] << 8);
        const compressedSize = bytes[offset + 18] | (bytes[offset + 19] << 8) |
                               (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24);
        const uncompressedSize = bytes[offset + 22] | (bytes[offset + 23] << 8) |
                                  (bytes[offset + 24] << 16) | (bytes[offset + 25] << 24);
        const nameLen = bytes[offset + 26] | (bytes[offset + 27] << 8);
        const extraLen = bytes[offset + 28] | (bytes[offset + 29] << 8);

        const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLen));
        const dataStart = offset + 30 + nameLen + extraLen;
        const dataEnd = dataStart + compressedSize;

        if (name.endsWith('.json') || name.endsWith('.txt') || !name.includes('.')) {
          if (compressionMethod === 0 && compressedSize > 0) {
            // Stored (uncompressed)
            const text = decoder.decode(bytes.slice(dataStart, dataEnd));
            entries.push({ name, text });
          } else if (compressionMethod === 8 && compressedSize > 0) {
            // Deflate - try using DecompressionStream if available
            try {
              const compressed = bytes.slice(dataStart, dataEnd);
              // Synchronous inflate attempt using a raw deflate approach
              // For browser compatibility, try the async path
              const blob = new Blob([compressed]);
              // We'll handle this asynchronously - skip for now and try stored entries
            } catch(e) {
              // Skip compressed entries we can't decode
            }
          }
        }

        offset = dataEnd > offset ? dataEnd : offset + 1;
      } else {
        offset++;
      }
    }

    return entries;
  }

  importMiroData(data) {
    // Miro widget format: { widgets: [ { type, x, y, width, height, text, style, ... } ] }
    const widgets = data.widgets || data.items || data.objects || data.elements ||
                    (Array.isArray(data) ? data : []);

    if (widgets.length === 0) {
      // Try nested structures
      const arrays = Object.values(data).filter(v => Array.isArray(v) && v.length > 0);
      if (arrays.length > 0) {
        this.importMiroWidgets(arrays.sort((a, b) => b.length - a.length)[0]);
      } else {
        this.app.showToast('Aucun élément trouvé dans le fichier Miro');
      }
      return;
    }

    this.importMiroWidgets(widgets);
  }

  importMiroWidgets(widgets) {
    const elements = [];
    const colorMap = {
      'light_yellow': '#FFD966', 'yellow': '#FFD966',
      'light_green': '#96CEB4', 'green': '#4ECDC4',
      'light_blue': '#45B7D1', 'blue': '#4a9eff',
      'light_pink': '#FF6B6B', 'pink': '#FF6B6B', 'red': '#FF6B6B',
      'light_purple': '#DDA0DD', 'purple': '#DDA0DD',
      'orange': '#F4A460',
      'gray': '#888888', 'dark': '#333333',
      'white': '#ffffff',
    };

    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i];
      const type = (w.type || '').toLowerCase();

      // Map Miro types to DarkBoard types
      let dbType = 'sticky';
      if (type.includes('shape') || type === 'rectangle' || type === 'rect') dbType = 'rect';
      else if (type.includes('circle') || type === 'ellipse') dbType = 'circle';
      else if (type.includes('text')) dbType = 'text';
      else if (type.includes('line') || type.includes('connector') || type.includes('arrow')) dbType = 'connector';
      else if (type.includes('frame') || type.includes('group')) dbType = 'frame';
      else if (type.includes('sticky') || type.includes('sticker') || type.includes('card') || type.includes('note')) dbType = 'sticky';
      else if (type.includes('image')) dbType = 'rect'; // Fallback for images

      // Extract position - Miro uses center coordinates
      const cx = w.x || w.posX || (w.position && w.position.x) || (w.bounds && w.bounds.x) || 0;
      const cy = w.y || w.posY || (w.position && w.position.y) || (w.bounds && w.bounds.y) || 0;
      const width = w.width || (w.bounds && w.bounds.width) || (w.style && w.style.width) || 200;
      const height = w.height || (w.bounds && w.bounds.height) || (w.style && w.style.height) || 200;

      // Extract text
      let text = w.text || w.title || w.plainText || w.content || '';
      // Strip basic HTML tags from Miro text
      if (typeof text === 'string') {
        text = text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
      }

      // Extract color
      let fill = '#FFD966';
      const styleColor = w.backgroundColor || (w.style && (w.style.backgroundColor || w.style.fillColor || w.style.stickerBackgroundColor)) || w.color || w.fill;
      if (styleColor) {
        fill = colorMap[styleColor] || styleColor;
        // Ensure it starts with # if it's a hex without it
        if (fill.match(/^[0-9a-fA-F]{6}$/)) fill = '#' + fill;
      }

      const el = {
        id: generateId(),
        type: dbType,
        x: cx - width / 2,
        y: cy - height / 2,
        width: width,
        height: height,
        fill: fill,
        stroke: dbType === 'sticky' ? 'transparent' : (w.borderColor || (w.style && w.style.borderColor) || '#888888'),
        text: text,
        fontSize: w.fontSize || (w.style && w.style.fontSize) || 16,
        zIndex: Date.now() + i,
        rotation: w.rotation || 0,
        locked: false,
        groupId: null
      };

      // Handle connectors
      if (dbType === 'connector') {
        el.x2 = el.x + width;
        el.y2 = el.y + height;
        if (w.startPosition) { el.x = w.startPosition.x || el.x; el.y = w.startPosition.y || el.y; }
        if (w.endPosition) { el.x2 = w.endPosition.x || el.x2; el.y2 = w.endPosition.y || el.y2; }
      }

      // Handle frames
      if (dbType === 'frame') {
        el.stroke = '#4a9eff';
        el.text = w.title || w.text || 'Frame';
        el.children = [];
      }

      elements.push(el);
    }

    if (elements.length === 0) {
      this.app.showToast('Aucun élément trouvé dans le fichier Miro');
      return;
    }

    // Place near camera
    const camX = this.app.renderer.camera.x;
    const camY = this.app.renderer.camera.y;
    let minX = Infinity, minY = Infinity;
    for (const el of elements) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
    }
    const offsetX = camX - minX - 200;
    const offsetY = camY - minY - 200;

    for (const el of elements) {
      el.x += offsetX;
      el.y += offsetY;
      if (el.x2 !== undefined) { el.x2 += offsetX; el.y2 += offsetY; }
    }
    // Batch to avoid tripping the 100 ops/sec WS rate limiter on large Miro exports.
    this.app.addElementsBatch(elements);
    this.app.showToast(`${elements.length} éléments importés depuis Miro !`);
  }

  initThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');

    // #R2-97 system theme auto-detection that respects override
    const savedTheme = localStorage.getItem('darkboard-theme');
    if (savedTheme === 'light') {
      this.setTheme('light', false);
    } else if (savedTheme === 'dark') {
      this.setTheme('dark', false);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      this.setTheme('light', false);
    }

    // Listen for system theme changes when no manual override
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
        const manualTheme = localStorage.getItem('darkboard-theme');
        if (!manualTheme) {
          this.setTheme(e.matches ? 'light' : 'dark', true);
        }
      });
    }

    toggle.addEventListener('click', () => {
      const isLight = document.body.classList.contains('light-theme');
      this.setTheme(isLight ? 'dark' : 'light', true);
      localStorage.setItem('darkboard-theme', isLight ? 'dark' : 'light'); // #R2-97 manual override
    });

    // #R2-83 ripple effect on button clicks
    this.initRippleEffect();
  }

  // #R2-91 #R2-100 smooth theme transition with fade
  setTheme(theme, animate = true) {
    const icon = document.getElementById('themeIcon');
    if (animate) {
      document.body.classList.add('theme-transitioning');
      setTimeout(() => document.body.classList.remove('theme-transitioning'), 250);
    }
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
      this.app.renderer.bgColor = '#f5f4f2';
      this.app.renderer.gridColor = 'rgba(0, 0, 0, 0.06)';
    } else {
      document.body.classList.remove('light-theme');
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
      this.app.renderer.bgColor = '#121212';
      this.app.renderer.gridColor = 'rgba(255, 255, 255, 0.04)';
    }
    if (animate) localStorage.setItem('darkboard-theme', theme);
    this.app.renderer.markDirty();
  }

  // #R2-83 ripple effect initialization
  initRippleEffect() {
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.tool-btn, .bb-btn, .fctl-btn, .modal-btn, .ftb-btn');
      if (!btn || btn.disabled) return;
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple-effect';
      ripple.style.left = (e.clientX - rect.left) + 'px';
      ripple.style.top = (e.clientY - rect.top) + 'px';
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }

  initTemplates() {
    const btn = document.getElementById('templateBtn');
    const modal = document.getElementById('templateModal');
    const close = document.getElementById('templateClose');
    const grid = document.getElementById('templateGrid');

    const templates = [
      {
        name: 'Brainstorming',
        icon: '🧠',
        desc: 'Post-its pour capturer des idees en groupe',
        generate: (cx, cy) => this.generateBrainstorming(cx, cy)
      },
      {
        name: 'Rétrospective',
        icon: '🔄',
        desc: '3 colonnes: Ce qui va bien, À améliorer, Actions',
        generate: (cx, cy) => this.generateRetro(cx, cy)
      },
      {
        name: 'Matrice 2x2',
        icon: '📊',
        desc: '4 quadrants pour prioriser (impact/effort)',
        generate: (cx, cy) => this.generateMatrix(cx, cy)
      },
      {
        name: 'Kanban',
        icon: '📋',
        desc: 'Colonnes A faire, En cours, Fait',
        generate: (cx, cy) => this.generateKanban(cx, cy)
      },
      {
        name: 'Mind Map',
        icon: '🗺️',
        desc: 'Structure radiale autour d\'un sujet central',
        generate: (cx, cy) => this.generateMindMap(cx, cy)
      },
      {
        name: 'SWOT',
        icon: '⚡',
        desc: 'Forces, Faiblesses, Opportunités, Menaces',
        generate: (cx, cy) => this.generateSWOT(cx, cy)
      },
      {
        name: 'Timeline',
        icon: '📅',
        desc: 'Ligne du temps avec étapes clés',
        generate: (cx, cy) => this.generateTimeline(cx, cy)
      },
      {
        name: 'User Journey',
        icon: '🚶',
        desc: 'Parcours utilisateur en 5 étapes',
        generate: (cx, cy) => this.generateUserJourney(cx, cy)
      },
      {
        name: 'Carte d\'empathie',
        icon: '🧠',
        desc: 'Comprendre les pensées, émotions et comportements d\'un utilisateur',
        generate: (cx, cy) => this.generateEmpathyMap(cx, cy)
      },
      {
        name: 'Value Proposition',
        icon: '💎',
        desc: 'Aligner votre offre avec les besoins de vos clients',
        generate: (cx, cy) => this.generateValueProposition(cx, cy)
      },
      {
        name: 'Business Model Canvas',
        icon: '📈',
        desc: 'Les 9 blocs clés de votre modèle économique',
        generate: (cx, cy) => this.generateBusinessModelCanvas(cx, cy)
      },
      {
        name: 'Lean Canvas',
        icon: '🚀',
        desc: 'Modèle d\'affaires pour les startups',
        generate: (cx, cy) => this.generateLeanCanvas(cx, cy)
      },
      {
        name: 'Speed Boat',
        icon: '⛵',
        desc: 'Moteurs, ancres, objectif — rétrospective ludique',
        generate: (cx, cy) => this.generateSpeedBoat(cx, cy)
      },
      {
        name: 'Starfish',
        icon: '⭐',
        desc: 'Plus, Moins, Commencer, Arrêter, Continuer',
        generate: (cx, cy) => this.generateStarfish(cx, cy)
      },
      {
        name: 'Impact / Effort',
        icon: '⚖️',
        desc: 'Prioriser les actions par impact et effort',
        generate: (cx, cy) => this.generateImpactEffort(cx, cy)
      },
      {
        name: 'Rétrospective 4L',
        icon: '❤️',
        desc: 'Liked, Learned, Lacked, Longed for',
        generate: (cx, cy) => this.generateRetro4L(cx, cy)
      },
      {
        name: 'Product Vision Board',
        icon: '🔭',
        desc: 'Vision, public cible, besoins, produit, objectifs',
        generate: (cx, cy) => this.generateProductVisionBoard(cx, cy)
      },
      {
        name: 'Stakeholder Map',
        icon: '🎯',
        desc: 'Cartographier les parties prenantes par influence et intérêt',
        generate: (cx, cy) => this.generateStakeholderMap(cx, cy)
      }
    ];

    // Build grid
    for (const tpl of templates) {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div class="template-preview">${tpl.icon}</div>
        <h3>${tpl.name}</h3>
        <p>${tpl.desc}</p>
      `;
      card.addEventListener('click', () => {
        const cx = this.app.renderer.camera.x;
        const cy = this.app.renderer.camera.y;
        tpl.generate(cx, cy);
        modal.style.display = 'none';
        this.app.showToast(`Modèle "${tpl.name}" ajouté !`);
      });
      grid.appendChild(card);
    }

    btn.addEventListener('click', () => {
      modal.style.display = 'flex';
    });
    close.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  // Template generators
  generateBrainstorming(cx, cy) {
    const title = createTextElement(cx - 100, cy - 300);
    title.text = 'Brainstorming';
    title.fontSize = 28;
    title.width = 300;
    this.app.addElement(title);

    const colors = STICKY_COLORS;
    for (let i = 0; i < 6; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const s = createSticky(cx - 330 + col * 220, cy - 200 + row * 220);
      s.fill = colors[i % colors.length];
      s.text = 'Idée ' + (i + 1);
      this.app.addElement(s);
    }
  }

  generateRetro(cx, cy) {
    const labels = ['Ce qui va bien', 'À améliorer', 'Actions'];
    const frameColors = ['#4ecdc4', '#ff6b6b', '#4a9eff'];
    for (let i = 0; i < 3; i++) {
      const f = createFrame(cx - 480 + i * 320, cy - 250, 300, 500, labels[i]);
      f.stroke = frameColors[i];
      f.fill = frameColors[i] + '10';
      this.app.addElement(f);

      for (let j = 0; j < 2; j++) {
        const s = createSticky(cx - 460 + i * 320, cy - 180 + j * 220);
        s.text = '';
        s.fill = frameColors[i] + '80';
        this.app.addElement(s);
      }
    }
  }

  generateMatrix(cx, cy) {
    const size = 400;
    // Axes
    const hLine = createElement('line', { x: cx - size, y: cy, x2: cx + size, y2: cy, stroke: '#888', strokeWidth: 2 });
    const vLine = createElement('line', { x: cx, y: cy - size, x2: cx, y2: cy + size, stroke: '#888', strokeWidth: 2 });
    this.app.addElement(hLine);
    this.app.addElement(vLine);

    const labels = [
      { text: 'Impact fort / Effort faible', x: cx - size + 20, y: cy - size + 20 },
      { text: 'Impact fort / Effort fort', x: cx + 20, y: cy - size + 20 },
      { text: 'Impact faible / Effort faible', x: cx - size + 20, y: cy + 20 },
      { text: 'Impact faible / Effort fort', x: cx + 20, y: cy + 20 },
    ];
    for (const l of labels) {
      const t = createTextElement(l.x, l.y);
      t.text = l.text;
      t.fontSize = 14;
      t.width = 300;
      this.app.addElement(t);
    }
  }

  generateKanban(cx, cy) {
    const cols = ['À faire', 'En cours', 'Fait'];
    const colors = ['#ff6b6b', '#ffd966', '#4ecdc4'];
    for (let i = 0; i < 3; i++) {
      const f = createFrame(cx - 480 + i * 320, cy - 300, 300, 600, cols[i]);
      f.stroke = colors[i];
      f.fill = colors[i] + '08';
      this.app.addElement(f);
    }
  }

  generateMindMap(cx, cy) {
    // Central topic
    const center = createElement('circle', {
      x: cx - 60, y: cy - 60, width: 120, height: 120,
      fill: '#4a9eff', stroke: '#4a9eff', strokeWidth: 2, text: 'Sujet', fontSize: 18
    });
    this.app.addElement(center);

    const branches = ['Idée 1', 'Idée 2', 'Idée 3', 'Idée 4', 'Idée 5'];
    const angles = branches.map((_, i) => (i * 2 * Math.PI / branches.length) - Math.PI / 2);
    const dist = 250;

    for (let i = 0; i < branches.length; i++) {
      const bx = cx + Math.cos(angles[i]) * dist;
      const by = cy + Math.sin(angles[i]) * dist;

      const arrow = createElement('arrow', {
        x: cx, y: cy, x2: bx, y2: by,
        stroke: STICKY_COLORS[i % STICKY_COLORS.length], strokeWidth: 2
      });
      this.app.addElement(arrow);

      const s = createSticky(bx - 80, by - 80);
      s.width = 160;
      s.height = 100;
      s.fill = STICKY_COLORS[i % STICKY_COLORS.length];
      s.text = branches[i];
      this.app.addElement(s);
    }
  }

  generateSWOT(cx, cy) {
    const labels = ['Forces', 'Faiblesses', 'Opportunites', 'Menaces'];
    const colors = ['#4ecdc4', '#ff6b6b', '#4a9eff', '#ffd966'];
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const f = createFrame(cx - 310 + col * 320, cy - 260 + row * 280, 300, 260, labels[i]);
      f.stroke = colors[i];
      f.fill = colors[i] + '10';
      this.app.addElement(f);
    }
  }

  generateTimeline(cx, cy) {
    // Horizontal line
    const line = createElement('line', {
      x: cx - 500, y: cy, x2: cx + 500, y2: cy,
      stroke: '#888', strokeWidth: 3
    });
    this.app.addElement(line);

    const steps = ['Étape 1', 'Étape 2', 'Étape 3', 'Étape 4', 'Étape 5'];
    for (let i = 0; i < steps.length; i++) {
      const x = cx - 400 + i * 200;
      const dot = createElement('circle', {
        x: x - 10, y: cy - 10, width: 20, height: 20,
        fill: '#4a9eff', stroke: '#4a9eff', strokeWidth: 1
      });
      this.app.addElement(dot);

      const above = (i % 2 === 0);
      const s = createSticky(x - 80, above ? cy - 180 : cy + 40);
      s.width = 160;
      s.height = 120;
      s.text = steps[i];
      this.app.addElement(s);

      const connector = createElement('line', {
        x: x, y: cy, x2: x, y2: above ? cy - 60 : cy + 40,
        stroke: '#666', strokeWidth: 1
      });
      this.app.addElement(connector);
    }
  }

  generateUserJourney(cx, cy) {
    const phases = ['Découverte', 'Considération', 'Décision', 'Utilisation', 'Fidélisation'];
    const colors = ['#45B7D1', '#4ECDC4', '#96CEB4', '#FFD966', '#FF6B6B'];

    for (let i = 0; i < phases.length; i++) {
      const x = cx - 500 + i * 210;
      const f = createFrame(x, cy - 200, 200, 400, phases[i]);
      f.stroke = colors[i];
      f.fill = colors[i] + '10';
      this.app.addElement(f);

      if (i < phases.length - 1) {
        const arrow = createElement('arrow', {
          x: x + 200, y: cy, x2: x + 210, y2: cy,
          stroke: '#666', strokeWidth: 2
        });
        this.app.addElement(arrow);
      }
    }
  }

  generateEmpathyMap(cx, cy) {
    // Title
    const title = createTextElement(cx - 100, cy - 420);
    title.text = 'Carte d\'empathie';
    title.fontSize = 28;
    title.width = 200;
    this.app.addElement(title);

    // Persona circle in center
    const persona = createElement('circle', {
      x: cx - 60, y: cy - 60, width: 120, height: 120,
      fill: '#4a9eff', stroke: '#4a9eff', text: 'Persona'
    });
    this.app.addElement(persona);

    // 6 zones
    const zones = [
      { label: 'Pense & Ressent', x: cx - 400, y: cy - 380, w: 380, h: 300, color: '#FF6B6B' },
      { label: 'Voit', x: cx + 20, y: cy - 380, w: 380, h: 300, color: '#FFD966' },
      { label: 'Dit & Fait', x: cx - 400, y: cy - 60, w: 380, h: 300, color: '#4ECDC4' },
      { label: 'Entend', x: cx + 20, y: cy - 60, w: 380, h: 300, color: '#45B7D1' },
      { label: 'Douleurs (Pains)', x: cx - 400, y: cy + 260, w: 380, h: 200, color: '#e94560' },
      { label: 'Gains', x: cx + 20, y: cy + 260, w: 380, h: 200, color: '#4ecdc4' },
    ];

    for (const z of zones) {
      const f = createFrame(z.x, z.y, z.w, z.h, z.label);
      f.stroke = z.color;
      f.fill = z.color + '10';
      this.app.addElement(f);

      // Add an empty sticky inside
      const s = createSticky(z.x + 10, z.y + 40);
      s.width = 160;
      s.height = 120;
      s.fill = z.color + '40';
      s.text = '';
      this.app.addElement(s);
    }
  }

  generateValueProposition(cx, cy) {
    const title = createTextElement(cx - 150, cy - 420);
    title.text = 'Value Proposition Canvas';
    title.fontSize = 28;
    title.width = 300;
    this.app.addElement(title);

    // Right side: Customer Profile (circle shape using frame)
    const custTitle = createTextElement(cx + 180, cy - 360);
    custTitle.text = 'Profil Client';
    custTitle.fontSize = 20;
    custTitle.width = 200;
    this.app.addElement(custTitle);

    const custZones = [
      { label: 'Jobs-to-be-Done', x: cx + 100, y: cy - 320, w: 280, h: 200, color: '#45B7D1' },
      { label: 'Pains (Douleurs)', x: cx + 100, y: cy - 100, w: 280, h: 200, color: '#FF6B6B' },
      { label: 'Gains', x: cx + 100, y: cy + 120, w: 280, h: 200, color: '#4ECDC4' },
    ];

    for (const z of custZones) {
      const f = createFrame(z.x, z.y, z.w, z.h, z.label);
      f.stroke = z.color;
      f.fill = z.color + '10';
      this.app.addElement(f);
    }

    // Left side: Value Map
    const valTitle = createTextElement(cx - 380, cy - 360);
    valTitle.text = 'Proposition de Valeur';
    valTitle.fontSize = 20;
    valTitle.width = 250;
    this.app.addElement(valTitle);

    const valZones = [
      { label: 'Produits & Services', x: cx - 400, y: cy - 320, w: 280, h: 200, color: '#4a9eff' },
      { label: 'Pain Relievers', x: cx - 400, y: cy - 100, w: 280, h: 200, color: '#F4A460' },
      { label: 'Gain Creators', x: cx - 400, y: cy + 120, w: 280, h: 200, color: '#96CEB4' },
    ];

    for (const z of valZones) {
      const f = createFrame(z.x, z.y, z.w, z.h, z.label);
      f.stroke = z.color;
      f.fill = z.color + '10';
      this.app.addElement(f);
    }

    // Arrow connecting both
    const arrow = createElement('arrow', {
      x: cx + 80, y: cy, x2: cx - 100, y2: cy,
      stroke: '#888', strokeWidth: 3
    });
    this.app.addElement(arrow);
  }

  generateBusinessModelCanvas(cx, cy) {
    const title = createTextElement(cx - 200, cy - 480);
    title.text = 'Business Model Canvas';
    title.fontSize = 28;
    title.width = 400;
    this.app.addElement(title);

    const colW = 200;
    const rowH = 250;
    const startX = cx - 500;
    const startY = cy - 420;

    // 9 blocks of the BMC
    const blocks = [
      { label: 'Partenaires Clés', x: startX, y: startY, w: colW, h: rowH * 2, color: '#DDA0DD' },
      { label: 'Activités Clés', x: startX + colW, y: startY, w: colW, h: rowH, color: '#45B7D1' },
      { label: 'Ressources Clés', x: startX + colW, y: startY + rowH, w: colW, h: rowH, color: '#45B7D1' },
      { label: 'Propositions de Valeur', x: startX + colW * 2, y: startY, w: colW, h: rowH * 2, color: '#FFD966' },
      { label: 'Relations Clients', x: startX + colW * 3, y: startY, w: colW, h: rowH, color: '#4ECDC4' },
      { label: 'Canaux', x: startX + colW * 3, y: startY + rowH, w: colW, h: rowH, color: '#4ECDC4' },
      { label: 'Segments Clients', x: startX + colW * 4, y: startY, w: colW, h: rowH * 2, color: '#FF6B6B' },
      { label: 'Structure de Coûts', x: startX, y: startY + rowH * 2, w: colW * 2.5, h: rowH, color: '#F4A460' },
      { label: 'Sources de Revenus', x: startX + colW * 2.5, y: startY + rowH * 2, w: colW * 2.5, h: rowH, color: '#96CEB4' },
    ];

    for (const b of blocks) {
      const f = createFrame(b.x, b.y, b.w, b.h, b.label);
      f.stroke = b.color;
      f.fill = b.color + '10';
      this.app.addElement(f);
    }
  }

  generateLeanCanvas(cx, cy) {
    const title = createTextElement(cx - 100, cy - 480);
    title.text = 'Lean Canvas';
    title.fontSize = 28;
    title.width = 200;
    this.app.addElement(title);

    const colW = 200;
    const rowH = 250;
    const startX = cx - 500;
    const startY = cy - 420;

    const blocks = [
      { label: 'Problème', x: startX, y: startY, w: colW, h: rowH, color: '#FF6B6B' },
      { label: 'Alternatives existantes', x: startX, y: startY + rowH, w: colW, h: rowH, color: '#FF6B6B' },
      { label: 'Solution', x: startX + colW, y: startY, w: colW, h: rowH, color: '#4ECDC4' },
      { label: 'Métriques clés', x: startX + colW, y: startY + rowH, w: colW, h: rowH, color: '#45B7D1' },
      { label: 'Proposition de Valeur Unique', x: startX + colW * 2, y: startY, w: colW, h: rowH * 2, color: '#FFD966' },
      { label: 'Avantage Compétitif', x: startX + colW * 3, y: startY, w: colW, h: rowH, color: '#DDA0DD' },
      { label: 'Canaux', x: startX + colW * 3, y: startY + rowH, w: colW, h: rowH, color: '#96CEB4' },
      { label: 'Segments Clients', x: startX + colW * 4, y: startY, w: colW, h: rowH, color: '#F4A460' },
      { label: 'Early Adopters', x: startX + colW * 4, y: startY + rowH, w: colW, h: rowH, color: '#F4A460' },
      { label: 'Structure de Coûts', x: startX, y: startY + rowH * 2, w: colW * 2.5, h: 200, color: '#e94560' },
      { label: 'Sources de Revenus', x: startX + colW * 2.5, y: startY + rowH * 2, w: colW * 2.5, h: 200, color: '#4a9eff' },
    ];

    for (const b of blocks) {
      const f = createFrame(b.x, b.y, b.w, b.h, b.label);
      f.stroke = b.color;
      f.fill = b.color + '10';
      this.app.addElement(f);
    }
  }

  generateSpeedBoat(cx, cy) {
    const title = createTextElement(cx - 100, cy - 400);
    title.text = 'Speed Boat';
    title.fontSize = 28;
    title.width = 200;
    this.app.addElement(title);

    // Destination (right)
    const dest = createFrame(cx + 300, cy - 200, 250, 300, 'Objectif / Île');
    dest.stroke = '#4ECDC4';
    dest.fill = '#4ECDC4' + '10';
    this.app.addElement(dest);

    // Wind (top - motors)
    const wind = createFrame(cx - 200, cy - 350, 400, 200, 'Vent (Moteurs)');
    wind.stroke = '#4a9eff';
    wind.fill = '#4a9eff' + '10';
    this.app.addElement(wind);

    // Anchors (bottom)
    const anchors = createFrame(cx - 200, cy + 50, 400, 200, 'Ancres (Freins)');
    anchors.stroke = '#FF6B6B';
    anchors.fill = '#FF6B6B' + '10';
    this.app.addElement(anchors);

    // Boat (center)
    const boat = createSticky(cx - 60, cy - 80);
    boat.width = 120;
    boat.height = 120;
    boat.fill = '#FFD966';
    boat.text = 'Notre équipe';
    boat.fontSize = 14;
    this.app.addElement(boat);

    // Rocks
    const rocks = createFrame(cx - 200, cy + 280, 400, 150, 'Rochers (Risques)');
    rocks.stroke = '#e94560';
    rocks.fill = '#e94560' + '10';
    this.app.addElement(rocks);
  }

  generateStarfish(cx, cy) {
    const title = createTextElement(cx - 80, cy - 420);
    title.text = 'Starfish';
    title.fontSize = 28;
    title.width = 160;
    this.app.addElement(title);

    const zones = [
      { label: 'Continuer', color: '#4ECDC4' },
      { label: 'Plus de', color: '#96CEB4' },
      { label: 'Commencer', color: '#4a9eff' },
      { label: 'Moins de', color: '#FFD966' },
      { label: 'Arrêter', color: '#FF6B6B' },
    ];

    const radius = 300;
    for (let i = 0; i < zones.length; i++) {
      const angle = (i * 2 * Math.PI / zones.length) - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius - 130;
      const y = cy + Math.sin(angle) * radius - 130;
      const f = createFrame(x, y, 260, 260, zones[i].label);
      f.stroke = zones[i].color;
      f.fill = zones[i].color + '10';
      this.app.addElement(f);
    }
  }

  generateImpactEffort(cx, cy) {
    const title = createTextElement(cx - 100, cy - 460);
    title.text = 'Impact / Effort';
    title.fontSize = 28;
    title.width = 200;
    this.app.addElement(title);

    const size = 400;
    // Quadrants
    const quads = [
      { label: 'Quick Wins', desc: 'Fort impact, faible effort', x: cx - size, y: cy - size, color: '#4ECDC4' },
      { label: 'Projets majeurs', desc: 'Fort impact, fort effort', x: cx, y: cy - size, color: '#FFD966' },
      { label: 'Petites tâches', desc: 'Faible impact, faible effort', x: cx - size, y: cy, color: '#96CEB4' },
      { label: 'Ingrat', desc: 'Faible impact, fort effort', x: cx, y: cy, color: '#FF6B6B' },
    ];

    for (const q of quads) {
      const f = createFrame(q.x, q.y, size, size, q.label);
      f.stroke = q.color;
      f.fill = q.color + '10';
      this.app.addElement(f);
    }

    // Axis labels
    const yLabel = createTextElement(cx - size - 80, cy - 20);
    yLabel.text = 'IMPACT ↑';
    yLabel.fontSize = 16;
    yLabel.width = 70;
    this.app.addElement(yLabel);

    const xLabel = createTextElement(cx - 20, cy + size + 20);
    xLabel.text = 'EFFORT →';
    xLabel.fontSize = 16;
    xLabel.width = 80;
    this.app.addElement(xLabel);
  }

  generateRetro4L(cx, cy) {
    const title = createTextElement(cx - 60, cy - 420);
    title.text = 'Retro 4L';
    title.fontSize = 28;
    title.width = 120;
    this.app.addElement(title);

    const size = 380;
    const quads = [
      { label: 'Liked (Aime)', x: cx - size, y: cy - size, color: '#4ECDC4' },
      { label: 'Learned (Appris)', x: cx + 20, y: cy - size, color: '#4a9eff' },
      { label: 'Lacked (Manque)', x: cx - size, y: cy + 20, color: '#FF6B6B' },
      { label: 'Longed for (Souhaite)', x: cx + 20, y: cy + 20, color: '#FFD966' },
    ];

    for (const q of quads) {
      const f = createFrame(q.x, q.y, size, size, q.label);
      f.stroke = q.color;
      f.fill = q.color + '10';
      this.app.addElement(f);
    }
  }

  generateProductVisionBoard(cx, cy) {
    const title = createTextElement(cx - 150, cy - 420);
    title.text = 'Product Vision Board';
    title.fontSize = 28;
    title.width = 300;
    this.app.addElement(title);

    const w = 900;
    const rowH = 150;
    const startX = cx - w / 2;
    const startY = cy - 350;

    const rows = [
      { label: 'Vision', color: '#4a9eff' },
      { label: 'Public Cible', color: '#45B7D1' },
      { label: 'Besoins', color: '#FF6B6B' },
      { label: 'Produit', color: '#4ECDC4' },
      { label: 'Objectifs Business', color: '#FFD966' },
    ];

    for (let i = 0; i < rows.length; i++) {
      const f = createFrame(startX, startY + i * (rowH + 10), w, rowH, rows[i].label);
      f.stroke = rows[i].color;
      f.fill = rows[i].color + '10';
      this.app.addElement(f);
    }
  }

  generateStakeholderMap(cx, cy) {
    const title = createTextElement(cx - 120, cy - 460);
    title.text = 'Stakeholder Map';
    title.fontSize = 28;
    title.width = 240;
    this.app.addElement(title);

    const size = 400;
    const quads = [
      { label: 'Gérer de près', desc: 'Fort pouvoir, fort intérêt', x: cx - size, y: cy - size, color: '#FF6B6B' },
      { label: 'Satisfaire', desc: 'Fort pouvoir, faible intérêt', x: cx, y: cy - size, color: '#FFD966' },
      { label: 'Informer', desc: 'Faible pouvoir, fort intérêt', x: cx - size, y: cy, color: '#4ECDC4' },
      { label: 'Surveiller', desc: 'Faible pouvoir, faible intérêt', x: cx, y: cy, color: '#96CEB4' },
    ];

    for (const q of quads) {
      const f = createFrame(q.x, q.y, size, size, q.label);
      f.stroke = q.color;
      f.fill = q.color + '10';
      this.app.addElement(f);
    }

    // Axis labels
    const yLabel = createTextElement(cx - size - 80, cy - 20);
    yLabel.text = 'POUVOIR ↑';
    yLabel.fontSize = 16;
    yLabel.width = 80;
    this.app.addElement(yLabel);

    const xLabel = createTextElement(cx - 20, cy + size + 20);
    xLabel.text = 'INTERET →';
    xLabel.fontSize = 16;
    xLabel.width = 80;
    this.app.addElement(xLabel);
  }

  initShareButton() {
    document.getElementById('shareBtn').addEventListener('click', () => {
      const url = window.location.href;
      const fallbackCopy = () => {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        this.app.showToast('Lien copié !');
      };
      // #R2-183: Track share for getting started checklist
      localStorage.setItem('darkboard-shared', '1');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          this.app.showToast('Lien copié dans le presse-papier !');
        }).catch(() => {
          fallbackCopy();
        });
      } else {
        fallbackCopy();
      }
    });
  }

  // Minimap toggle
  initMinimap() {
    const btn = document.getElementById('toggleMinimap');
    if (!btn) return;
    btn.addEventListener('click', () => {
      this.app.renderer.minimapEnabled = !this.app.renderer.minimapEnabled;
      btn.classList.toggle('active', this.app.renderer.minimapEnabled);
      this.app.renderer.markDirty();
    });
  }

  // Snap to grid toggle
  initSnapToGrid() {
    const btn = document.getElementById('toggleSnap');
    if (!btn) return;
    btn.addEventListener('click', () => {
      this.app.renderer.snapToGrid = !this.app.renderer.snapToGrid;
      btn.classList.toggle('active', this.app.renderer.snapToGrid);
      this.app.showToast(this.app.renderer.snapToGrid ? 'Grille magnétique activée' : 'Grille magnétique désactivée');
    });
  }

  // Laser pointer mode
  initLaserPointer() {
    const btn = document.getElementById('laserBtn');
    if (!btn) return;
    this.laserActive = false;

    btn.addEventListener('click', () => {
      this.laserActive = !this.laserActive;
      btn.classList.toggle('active', this.laserActive);
      if (this.laserActive) {
        this.app.setTool('select');
        this.app.renderer.canvas.style.cursor = 'crosshair';
        // Override pointer move to show laser
        this._originalOnPointerMove = this.app.input.onPointerMove.bind(this.app.input);
        const renderer = this.app.renderer;
        const sync = this.app.sync;
        const userId = this.app.userId;
        const userName = this.app.userName;
        document.addEventListener('mousemove', this._laserMove = (e) => {
          if (!this.laserActive) return;
          const world = renderer.screenToWorld(e.clientX, e.clientY);
          renderer.laserPointers.set('local', { x: world.x, y: world.y, color: '#ff0000' });
          renderer.markDirty();
          // Send laser position to peers via cursor channel
          sync.sendLaser && sync.sendLaser(world.x, world.y);
        });
      } else {
        this.app.renderer.canvas.style.cursor = 'default';
        this.app.renderer.laserPointers.delete('local');
        this.app.renderer.markDirty();
        if (this._laserMove) {
          document.removeEventListener('mousemove', this._laserMove);
          this._laserMove = null;
        }
      }
    });
  }

  // Presentation mode using anchors
  initPresentationMode() {
    const btn = document.getElementById('presentBtn');
    const controls = document.getElementById('presentationControls');
    if (!btn || !controls) return;
    this.presentationActive = false;
    this.presentationIndex = 0;

    btn.addEventListener('click', () => {
      this.startPresentation();
    });

    document.getElementById('presNext').addEventListener('click', () => {
      this.presentationNavigate(1);
    });

    document.getElementById('presPrev').addEventListener('click', () => {
      this.presentationNavigate(-1);
    });

    document.getElementById('presExit').addEventListener('click', () => {
      this.stopPresentation();
    });

    // Presentation mode keys are handled in input.js onKeyDown
  }

  startPresentation() {
    if (!this.app.workshop || !this.app.workshop.anchors || this.app.workshop.anchors.size === 0) {
      this.app.showToast('Ajoutez des ancres pour le mode présentation');
      return;
    }
    this.presentationActive = true;
    this.presentationIndex = 0;
    document.getElementById('presentationControls').style.display = 'flex';
    document.getElementById('toolbar').style.display = 'none';
    this.navigateToAnchor(0);
  }

  stopPresentation() {
    this.presentationActive = false;
    document.getElementById('presentationControls').style.display = 'none';
    document.getElementById('toolbar').style.display = 'flex';
  }

  presentationNavigate(dir) {
    const anchors = this.app.workshop ? Array.from(this.app.workshop.anchors.values()) : [];
    if (anchors.length === 0) return;
    this.presentationIndex = Math.max(0, Math.min(anchors.length - 1, this.presentationIndex + dir));
    this.navigateToAnchor(this.presentationIndex);
  }

  navigateToAnchor(index) {
    const anchors = this.app.workshop ? Array.from(this.app.workshop.anchors.values()) : [];
    if (anchors.length === 0 || index < 0 || index >= anchors.length) return;
    const anchor = anchors[index];
    document.getElementById('presIndicator').textContent = `${index + 1}/${anchors.length}`;
    this.app.animateToView(anchor.x, anchor.y, anchor.zoom || 1);
  }

  // Help overlay
  initHelpOverlay() {
    const overlay = document.getElementById('helpOverlay');
    const helpBtn = document.getElementById('helpBtn');
    const helpClose = document.getElementById('helpClose');
    if (!overlay || !helpBtn) return;

    // #200: Display version number in help overlay
    const versionEl = overlay.querySelector('.help-version') || (() => {
      const v = document.createElement('div');
      v.className = 'help-version';
      v.style.cssText = 'text-align:center;color:#666;font-size:0.8rem;margin-top:1rem;';
      v.textContent = 'DarkBoard v' + (typeof DARKBOARD_VERSION !== 'undefined' ? DARKBOARD_VERSION : '2.0.0');
      const content = overlay.querySelector('.help-content') || overlay.firstElementChild;
      if (content) content.appendChild(v);
      return v;
    })();

    const show = () => { overlay.style.display = 'flex'; };
    const hide = () => { overlay.style.display = 'none'; };

    helpBtn.addEventListener('click', show);
    helpClose.addEventListener('click', hide);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hide();
    });

    // Show help on first visit
    if (!localStorage.getItem('darkboard-onboarded')) {
      localStorage.setItem('darkboard-onboarded', '1');
      setTimeout(show, 800);
    }
  }

  showHelp() {
    const overlay = document.getElementById('helpOverlay');
    if (overlay) overlay.style.display = 'flex';
  }

  hideHelp() {
    const overlay = document.getElementById('helpOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ========================= VIEW MODES =========================

  initViewModes() {
    // Table view
    document.getElementById('tableViewBtn')?.addEventListener('click', () => this.openTableView());
    document.getElementById('tableViewClose')?.addEventListener('click', () => this.closeTableView());
    document.getElementById('tableSearch')?.addEventListener('input', () => this.renderTableRows());
    document.getElementById('tableTagFilter')?.addEventListener('change', () => this.renderTableRows());

    // Kanban view
    document.getElementById('kanbanViewBtn')?.addEventListener('click', () => this.openKanbanView());
    document.getElementById('kanbanViewClose')?.addEventListener('click', () => this.closeKanbanView());
    document.getElementById('kanbanSearch')?.addEventListener('input', () => this.renderKanbanCards());

    // Escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('tableViewOverlay')?.style.display !== 'none') this.closeTableView();
        if (document.getElementById('kanbanViewOverlay')?.style.display !== 'none') this.closeKanbanView();
      }
    });
  }

  // Collect all unique tags across stickies
  getAllTags() {
    const tagMap = new Map(); // label -> color
    for (const [, el] of this.app.renderer.elements) {
      if (el.tags && el.tags.length > 0) {
        for (const t of el.tags) {
          if (!tagMap.has(t.label)) tagMap.set(t.label, t.color);
        }
      }
    }
    return tagMap;
  }

  // Get stickies (filtered)
  getStickies(search, tagFilter) {
    const results = [];
    for (const [, el] of this.app.renderer.elements) {
      if (el.type !== 'sticky') continue;
      if (search) {
        const s = search.toLowerCase();
        const text = (el.text || '').toLowerCase();
        const tagLabels = (el.tags || []).map(t => t.label.toLowerCase()).join(' ');
        if (!text.includes(s) && !tagLabels.includes(s)) continue;
      }
      if (tagFilter) {
        if (!el.tags || !el.tags.some(t => t.label === tagFilter)) continue;
      }
      results.push(el);
    }
    return results;
  }

  // ---- TABLE VIEW ----

  openTableView() {
    const overlay = document.getElementById('tableViewOverlay');
    overlay.style.display = 'flex';
    this.populateTagFilter();
    this.renderTableRows();
  }

  closeTableView() {
    document.getElementById('tableViewOverlay').style.display = 'none';
  }

  populateTagFilter() {
    const select = document.getElementById('tableTagFilter');
    const tags = this.getAllTags();
    // Keep first option
    select.innerHTML = '<option value="">Tous les tags</option>';
    for (const [label, color] of tags) {
      const opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      select.appendChild(opt);
    }
  }

  renderTableRows() {
    const body = document.getElementById('tableViewBody');
    const search = document.getElementById('tableSearch')?.value || '';
    const tagFilter = document.getElementById('tableTagFilter')?.value || '';
    const stickies = this.getStickies(search, tagFilter);

    // Sort state
    if (!this._tableSortCol) this._tableSortCol = 'text';
    if (!this._tableSortDir) this._tableSortDir = 'asc';

    const col = this._tableSortCol;
    const dir = this._tableSortDir === 'asc' ? 1 : -1;

    stickies.sort((a, b) => {
      let va, vb;
      if (col === 'text') {
        va = (a.text || '').toLowerCase();
        vb = (b.text || '').toLowerCase();
      } else if (col === 'tags') {
        va = (a.tags || []).map(t => t.label).join(', ').toLowerCase();
        vb = (b.tags || []).map(t => t.label).join(', ').toLowerCase();
      } else if (col === 'color') {
        va = a.fill || '';
        vb = b.fill || '';
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    const arrow = (c) => c === col ? `<span class="sort-arrow">${dir === 1 ? '▲' : '▼'}</span>` : '';

    body.innerHTML = `
      <table class="view-table">
        <thead>
          <tr>
            <th class="td-color" data-col="color">Couleur ${arrow('color')}</th>
            <th data-col="text" class="${col === 'text' ? 'sorted' : ''}">Contenu ${arrow('text')}</th>
            <th data-col="tags" class="${col === 'tags' ? 'sorted' : ''}">Tags ${arrow('tags')}</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${stickies.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:40px">Aucun post-it trouve</td></tr>' :
            stickies.map(el => `
              <tr data-id="${el.id}">
                <td class="td-color"><span class="color-dot" style="background:${el.fill || '#FFD966'}"></span></td>
                <td class="td-text">${this.escapeHtml(el.text || '(vide)')}</td>
                <td class="td-tags">${(el.tags || []).map(t =>
                  `<span class="tag-mini" style="background:${t.color || '#888'}; color:${isLightColor(t.color || '#888') ? '#1a1a1a' : '#fff'}">${this.escapeHtml(t.label)}</span>`
                ).join('')}</td>
                <td class="td-actions">
                  <button data-goto="${el.id}">Voir</button>
                  <button data-edittags="${el.id}">Tags</button>
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    `;

    // Sort handlers
    body.querySelectorAll('thead th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const c = th.dataset.col;
        if (this._tableSortCol === c) {
          this._tableSortDir = this._tableSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this._tableSortCol = c;
          this._tableSortDir = 'asc';
        }
        this.renderTableRows();
      });
    });

    // Row actions
    body.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = this.app.renderer.elements.get(btn.dataset.goto);
        if (el) {
          this.closeTableView();
          this.app.renderer.camera.x = el.x + (el.width || 200) / 2;
          this.app.renderer.camera.y = el.y + (el.height || 200) / 2;
          this.app.renderer.selectedIds.clear();
          this.app.renderer.selectedIds.add(el.id);
          this.app.renderer.markDirty();
          this.app.updateZoomDisplay();
        }
      });
    });

    body.querySelectorAll('[data-edittags]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = this.app.renderer.elements.get(btn.dataset.edittags);
        if (el) {
          this.closeTableView();
          this.app.showTagEditor(el);
        }
      });
    });

    // Click row to select
    body.querySelectorAll('tbody tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => {
        const el = this.app.renderer.elements.get(tr.dataset.id);
        if (el) {
          this.closeTableView();
          this.app.renderer.camera.x = el.x + (el.width || 200) / 2;
          this.app.renderer.camera.y = el.y + (el.height || 200) / 2;
          this.app.renderer.selectedIds.clear();
          this.app.renderer.selectedIds.add(el.id);
          this.app.renderer.markDirty();
          this.app.updateZoomDisplay();
        }
      });
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---- KANBAN VIEW ----

  openKanbanView() {
    const overlay = document.getElementById('kanbanViewOverlay');
    overlay.style.display = 'flex';
    this.renderKanbanCards();
  }

  closeKanbanView() {
    document.getElementById('kanbanViewOverlay').style.display = 'none';
  }

  renderKanbanCards() {
    const body = document.getElementById('kanbanViewBody');
    const search = document.getElementById('kanbanSearch')?.value || '';
    const allTags = this.getAllTags();
    const stickies = this.getStickies(search, '');

    // Build columns: one per unique tag + "Sans tag"
    const columns = new Map();
    columns.set('__none__', { label: 'Sans tag', color: '#888888', items: [] });
    for (const [label, color] of allTags) {
      columns.set(label, { label, color, items: [] });
    }

    // Assign stickies to columns (a sticky appears in each of its tag columns)
    for (const el of stickies) {
      if (!el.tags || el.tags.length === 0) {
        columns.get('__none__').items.push(el);
      } else {
        for (const t of el.tags) {
          if (columns.has(t.label)) {
            columns.get(t.label).items.push(el);
          }
        }
      }
    }

    // Remove empty "Sans tag" if all stickies have tags
    if (columns.get('__none__').items.length === 0 && columns.size > 1) {
      columns.delete('__none__');
    }

    body.innerHTML = '';

    for (const [colKey, col] of columns) {
      const colDiv = document.createElement('div');
      colDiv.className = 'kanban-column';
      colDiv.dataset.tag = colKey;

      const textColor = isLightColor(col.color) ? '#1a1a1a' : '#fff';

      colDiv.innerHTML = `
        <div class="kanban-column-header">
          <span class="col-tag" style="background:${col.color}; color:${textColor}">${this.escapeHtml(col.label)}</span>
          <span class="col-count">${col.items.length}</span>
        </div>
        <div class="kanban-column-cards" data-tag="${colKey}">
          ${col.items.map(el => `
            <div class="kanban-card" draggable="true" data-id="${el.id}">
              <div class="kanban-card-color" style="background:${el.fill || '#FFD966'}"></div>
              <div class="kanban-card-text">${this.escapeHtml(el.text || '(vide)')}</div>
              ${el.tags && el.tags.length > 0 ? `
                <div class="kanban-card-tags">
                  ${el.tags.map(t => `<span class="kanban-card-tag" style="background:${t.color || '#888'}; color:${isLightColor(t.color || '#888') ? '#1a1a1a' : '#fff'}">${this.escapeHtml(t.label)}</span>`).join('')}
                </div>
              ` : ''}
              <button class="kanban-card-goto" data-goto="${el.id}">Voir</button>
            </div>
          `).join('')}
        </div>
      `;

      body.appendChild(colDiv);
    }

    // Drag & drop between columns
    this.initKanbanDragDrop(body);

    // Goto buttons
    body.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = this.app.renderer.elements.get(btn.dataset.goto);
        if (el) {
          this.closeKanbanView();
          this.app.renderer.camera.x = el.x + (el.width || 200) / 2;
          this.app.renderer.camera.y = el.y + (el.height || 200) / 2;
          this.app.renderer.selectedIds.clear();
          this.app.renderer.selectedIds.add(el.id);
          this.app.renderer.markDirty();
          this.app.updateZoomDisplay();
        }
      });
    });
  }

  initKanbanDragDrop(container) {
    let draggedId = null;
    let draggedFromTag = null;

    container.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        draggedId = card.dataset.id;
        draggedFromTag = card.closest('.kanban-column-cards')?.dataset.tag;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        container.querySelectorAll('.kanban-column-cards').forEach(c => c.classList.remove('drag-over'));
      });
    });

    container.querySelectorAll('.kanban-column-cards').forEach(col => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave', () => {
        col.classList.remove('drag-over');
      });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        if (!draggedId) return;

        const targetTag = col.dataset.tag;
        if (targetTag === draggedFromTag) return;

        const el = this.app.renderer.elements.get(draggedId);
        if (!el) return;

        const oldTags = [...(el.tags || [])];

        // Remove old tag (the column it was dragged from)
        if (draggedFromTag && draggedFromTag !== '__none__') {
          el.tags = (el.tags || []).filter(t => t.label !== draggedFromTag);
        }

        // Add new tag (the column it was dropped on)
        if (targetTag !== '__none__') {
          if (!(el.tags || []).some(t => t.label === targetTag)) {
            if (!el.tags) el.tags = [];
            const allTags = this.getAllTags();
            const color = allTags.get(targetTag) || '#888888';
            el.tags.push({ label: targetTag, color });
          }
        }

        // Sync
        const ops = [{ type: 'update', elementId: el.id, props: { tags: [...el.tags] } }];
        const inverseOps = [{ type: 'update', elementId: el.id, props: { tags: oldTags } }];
        this.app.history.push(ops, inverseOps);
        this.app.sync.sendOps(ops);
        this.app.renderer.markDirty();
        if (this.app.ui) this.app.ui.updateUndoRedoButtons();

        // Re-render kanban
        this.renderKanbanCards();
      });
    });
  }
}
