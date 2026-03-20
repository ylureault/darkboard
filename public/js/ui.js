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
    ctx.fillStyle = '#121212';
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
