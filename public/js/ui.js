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
    this.initThemeToggle();
    this.initTemplates();
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

    // Download
    const link = document.createElement('a');
    link.download = `darkboard-${getBoardId()}.png`;
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
      modal.style.display = '';
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
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          this.app.showToast('Lien copie dans le presse-papier !');
        });
      } else {
        // Fallback
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        this.app.showToast('Lien copie !');
      }
    });
  }
}
