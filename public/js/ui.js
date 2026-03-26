// UI initialization and management
class UI {
  constructor(app) {
    this.app = app;
    this.contextMenu = null;
    this.initToolbar();
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
  }

  initToolbar() {
    const btns = document.querySelectorAll('.tool-btn[data-tool]');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.app.setTool(btn.dataset.tool);
      });
    });
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
      'transparent', '#ffffff', '#e0e0e0', '#888888', '#333333',
      '#FF6B6B', '#FFD966', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#DDA0DD', '#F4A460', '#4a9eff', '#0f3460', '#e94560'
    ];

    const strokeColors = [
      'transparent', '#ffffff', '#e0e0e0', '#888888', '#333333',
      '#FF6B6B', '#FFD966', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#DDA0DD', '#F4A460', '#4a9eff', '#0f3460', '#e94560'
    ];

    const fillRow = document.getElementById('fillColors');
    const strokeRow = document.getElementById('strokeColors');

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
        this.app.updateSelectedElements({ fill: color });
      } else {
        this.app.currentStroke = color;
        this.app.updateSelectedElements({ stroke: color });
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
      this.app.showToast('Aucun element sur le tableau');
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
      this.app.showToast('Rien a exporter');
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
    this.app.showToast('Export PNG termine !');
  }

  initCSVExport() {
    document.getElementById('exportCSV').addEventListener('click', () => {
      this.exportCSV();
    });
  }

  exportCSV() {
    const elements = Array.from(this.app.renderer.elements.values());
    if (elements.length === 0) {
      this.app.showToast('Rien a exporter');
      return;
    }

    const headers = ['id', 'type', 'x', 'y', 'width', 'height', 'text', 'fill', 'stroke', 'children'];
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
    this.app.showToast('Export CSV termine !');
  }

  initJSONExport() {
    document.getElementById('exportJSON').addEventListener('click', () => {
      this.exportJSON();
    });
  }

  exportJSON() {
    const elements = Array.from(this.app.renderer.elements.values());
    const anchors = this.app.workshop && this.app.workshop.anchors ? Array.from(this.app.workshop.anchors.values()) : [];
    if (elements.length === 0) {
      this.app.showToast('Rien a exporter');
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
    this.app.showToast('Export JSON termine !');
  }

  initJSONImport() {
    document.getElementById('importJSON').addEventListener('click', () => {
      this.triggerImport();
    });
  }

  triggerImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.drft';
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
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
      this.app.showToast('Aucun element a importer');
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
    let count = 0;

    for (const orig of elements) {
      const el = deepClone(orig);
      const newId = generateId();
      idMap.set(el.id, newId);
      el.id = newId;
      el.x += offsetX;
      el.y += offsetY;
      if (el.x2 !== undefined) { el.x2 += offsetX; el.y2 += offsetY; }
      if (el.points) {
        el.points = el.points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
      }
      el.zIndex = Date.now() + count;
      count++;
      this.app.addElement(el);
    }

    // Fix references (children, connectors)
    for (const [, el] of this.app.renderer.elements) {
      if (el.children) {
        el.children = el.children.map(cid => idMap.get(cid) || cid);
      }
      if (el.sourceId && idMap.has(el.sourceId)) el.sourceId = idMap.get(el.sourceId);
      if (el.targetId && idMap.has(el.targetId)) el.targetId = idMap.get(el.targetId);
    }

    this.app.renderer.markDirty();
    this.app.showToast(`${count} elements importes !`);
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
        el.cardStatus = item.status || item.cardStatus || 'A faire';
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
      this.app.showToast('Aucun element trouve dans le fichier');
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
      this.app.addElement(el);
    }

    this.app.renderer.markDirty();
    this.app.showToast(`${elements.length} elements importes depuis Draft.io !`);
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

  initThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');

    // Load saved theme
    const savedTheme = localStorage.getItem('darkboard-theme');
    if (savedTheme === 'light') {
      this.setTheme('light');
    }

    toggle.addEventListener('click', () => {
      const isLight = document.body.classList.contains('light-theme');
      this.setTheme(isLight ? 'dark' : 'light');
    });
  }

  setTheme(theme) {
    const icon = document.getElementById('themeIcon');
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
      this.app.renderer.bgColor = '#f5f5f5';
      this.app.renderer.gridColor = 'rgba(0, 0, 0, 0.06)';
    } else {
      document.body.classList.remove('light-theme');
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
      this.app.renderer.bgColor = '#121212';
      this.app.renderer.gridColor = 'rgba(255, 255, 255, 0.04)';
    }
    localStorage.setItem('darkboard-theme', theme);
    this.app.renderer.markDirty();
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
        name: 'Retrospective',
        icon: '🔄',
        desc: '3 colonnes: Ce qui va bien, A ameliorer, Actions',
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
        desc: 'Forces, Faiblesses, Opportunites, Menaces',
        generate: (cx, cy) => this.generateSWOT(cx, cy)
      },
      {
        name: 'Timeline',
        icon: '📅',
        desc: 'Ligne du temps avec etapes cles',
        generate: (cx, cy) => this.generateTimeline(cx, cy)
      },
      {
        name: 'User Journey',
        icon: '🚶',
        desc: 'Parcours utilisateur en 5 etapes',
        generate: (cx, cy) => this.generateUserJourney(cx, cy)
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
        this.app.showToast(`Modele "${tpl.name}" ajoute !`);
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
      s.text = 'Idee ' + (i + 1);
      this.app.addElement(s);
    }
  }

  generateRetro(cx, cy) {
    const labels = ['Ce qui va bien', 'A ameliorer', 'Actions'];
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
    const cols = ['A faire', 'En cours', 'Fait'];
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

    const branches = ['Idee 1', 'Idee 2', 'Idee 3', 'Idee 4', 'Idee 5'];
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

    const steps = ['Etape 1', 'Etape 2', 'Etape 3', 'Etape 4', 'Etape 5'];
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
    const phases = ['Decouverte', 'Consideration', 'Decision', 'Utilisation', 'Fidelisation'];
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
        this.app.showToast('Lien copie !');
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          this.app.showToast('Lien copie dans le presse-papier !');
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
      this.app.showToast(this.app.renderer.snapToGrid ? 'Grille magnetique activee' : 'Grille magnetique desactivee');
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
      this.app.showToast('Ajoutez des ancres pour le mode presentation');
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
}
