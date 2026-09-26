// toolgroups.js — collapses related controls into one button plus a flyout.
//
// The working surface used to show ~60 controls at once (21 tools on top, 18
// facilitator actions on the left, 20 in the bottom bar). This module folds the
// related ones together so the default view is a handful of choices, without
// losing anything: the original buttons are MOVED into the flyouts, never
// recreated, so their ids, titles, listeners and keyboard shortcuts keep
// working exactly as before.

// Drawing tools that share a purpose. The group button shows whichever member
// you used last, the way a shapes menu behaves in any design tool.
const TOOL_GROUPS = [
  { id: 'shapes', label: 'Formes', tools: ['rect', 'circle', 'diamond', 'triangle'] },
  { id: 'lines', label: 'Traits', tools: ['line', 'arrow', 'connector'] },
  { id: 'zones', label: 'Zones', tools: ['frame', 'envelope', 'zoomZone'] },
  { id: 'blocks', label: 'Blocs', tools: ['card', 'list', 'mindmap', 'embed'] },
];

// Bottom-bar actions. These are one-shot commands rather than modes, so the
// group button keeps a fixed label and opens a plain menu.
const ACTION_GROUPS = [
  {
    id: 'views', label: 'Vues',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    members: ['tableViewBtn', 'kanbanViewBtn', 'presentBtn'],
  },
  {
    id: 'tools', label: 'Outils',
    icon: '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
    members: ['laserBtn', 'audioToggle', 'chatToggle'],
  },
  {
    id: 'file', label: 'Fichier',
    icon: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    members: ['exportBtn', 'exportCSV', 'exportJSON', 'importJSON'],
  },
];

const CHEVRON_SVG = '<svg class="grp-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="6,9 12,15 18,9"/></svg>';

function closeAllFlyouts(except) {
  document.querySelectorAll('.ctl-group.open').forEach((g) => {
    if (g !== except) g.classList.remove('open');
  });
}

// Build one group around `members`, inserted where the first member sat.
function buildGroup(spec, members, opts) {
  const first = members[0];
  const group = document.createElement('div');
  group.className = 'ctl-group ctl-group-' + (opts.kind || 'tool');
  group.dataset.group = spec.id;
  first.parentNode.insertBefore(group, first);

  const main = document.createElement('button');
  main.type = 'button';
  main.className = opts.btnClass;
  main.setAttribute('aria-haspopup', 'true');
  main.setAttribute('aria-expanded', 'false');
  main.setAttribute('aria-label', spec.label);
  main.title = spec.label;
  group.appendChild(main);

  const flyout = document.createElement('div');
  flyout.className = 'ctl-flyout';
  flyout.setAttribute('role', 'menu');
  const head = document.createElement('div');
  head.className = 'ctl-flyout-title';
  head.textContent = spec.label;
  flyout.appendChild(head);
  for (const m of members) {
    m.parentNode.removeChild(m);
    m.classList.add('ctl-flyout-item');
    // Tool buttons are icon-only in the bar; spell the name out in the menu.
    if (opts.kind === 'tool' && !m.dataset.label) {
      m.dataset.label = (m.title || m.dataset.tool || '').replace(/\s*\([^)]*\)\s*$/, '');
    }
    flyout.appendChild(m);
  }
  group.appendChild(flyout);

  const toggle = (force) => {
    const willOpen = force === undefined ? !group.classList.contains('open') : force;
    closeAllFlyouts(willOpen ? group : null);
    group.classList.toggle('open', willOpen);
    main.setAttribute('aria-expanded', String(willOpen));
  };

  group.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && group.classList.contains('open')) {
      toggle(false);
      main.focus();
      e.stopPropagation();
    }
  });

  return { group, main, flyout, members, toggle };
}

// Tool groups: the main button acts as the last-used tool; the chevron opens the
// menu. Clicking the button while its tool is already active also opens it, so
// the other shapes are always one click away.
function initToolGroups(app) {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;

  const groups = [];
  for (const spec of TOOL_GROUPS) {
    const members = spec.tools
      .map((t) => toolbar.querySelector(`.tool-btn[data-tool="${t}"]`))
      .filter(Boolean);
    if (members.length < 2) continue;

    const g = buildGroup(spec, members, { kind: 'tool', btnClass: 'tool-btn ctl-group-btn' });
    const saved = localStorage.getItem('darkboard-group-' + spec.id);
    g.current = members.find((m) => m.dataset.tool === saved) || members[0];

    const paint = () => {
      const svg = g.current.querySelector('svg');
      g.main.innerHTML = (svg ? svg.outerHTML : '') + CHEVRON_SVG;
      g.main.title = spec.label + ' — ' + (g.current.title || g.current.dataset.tool);
    };
    paint();

    g.main.addEventListener('click', (e) => {
      // The chevron corner opens the menu; the rest of the button uses the tool.
      const r = g.main.getBoundingClientRect();
      const onChevron = (e.clientX - r.left) > r.width - 14 && (e.clientY - r.top) > r.height - 14;
      const alreadyActive = g.current.dataset.tool === app.currentTool;
      if (onChevron || alreadyActive) { g.toggle(); return; }
      g.toggle(false);
      g.current.click();
    });

    for (const m of g.members) {
      m.addEventListener('click', () => {
        g.current = m;
        localStorage.setItem('darkboard-group-' + spec.id, m.dataset.tool);
        paint();
        g.toggle(false);
      });
    }

    g.refresh = () => {
      const active = g.members.find((m) => m.dataset.tool === app.currentTool);
      if (active && active !== g.current) { g.current = active; paint(); }
      g.group.classList.toggle('active', !!active);
      g.main.classList.toggle('active', !!active);
    };
    groups.push(g);
  }

  document.addEventListener('darkboard:toolchange', () => groups.forEach((g) => g.refresh()));
  groups.forEach((g) => g.refresh());
}

// Action groups: a labelled button that opens a menu of commands.
function initActionGroups() {
  for (const spec of ACTION_GROUPS) {
    const members = spec.members
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (members.length < 2) continue;

    const g = buildGroup(spec, members, { kind: 'action', btnClass: 'bb-btn bb-btn-label ctl-group-btn' });
    g.main.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">${spec.icon}</svg>` +
      `<span>${spec.label}</span>` + CHEVRON_SVG;
    g.main.addEventListener('click', () => g.toggle());
    for (const m of g.members) m.addEventListener('click', () => g.toggle(false));
  }
}

// The facilitator panel listed 19 actions in one flat column that ran off the
// bottom of the screen. Group them by what they're for, and let the whole thing
// collapse to its header — most of a session doesn't need it open.
const FACILITATOR_SECTIONS = [
  { label: 'Rythme', ids: ['btnTimer', 'btnTimerPresets', 'btnBreakTimer'] },
  { label: 'Décider', ids: ['btnVote', 'btnVoteCSV', 'btnROTI', 'btnMatrix'] },
  { label: 'Participer', ids: ['btnIsolation', 'btnFollow', 'btnRoundRobin', 'btnFishbowl', 'btnCheckin', 'btnSentiment'] },
  { label: 'Produire', ids: ['btnBrainstorm', 'btnAutoCluster', 'btnWordCloud', 'btnHeatmap', 'btnParkingLot', 'btnRetroTemplate'] },
];

function initFacilitatorPanel() {
  const panel = document.getElementById('facilitatorPanel');
  if (!panel || panel.dataset.grouped) return;
  const controls = panel.querySelector('.facilitator-controls');
  const header = panel.querySelector('.facilitator-label');
  if (!controls || !header) return;
  panel.dataset.grouped = '1';

  // Drop the old ad-hoc separators; sections replace them.
  controls.querySelectorAll('.fctl-separator').forEach((n) => n.remove());

  const placed = new Set();
  const frag = document.createDocumentFragment();
  for (const section of FACILITATOR_SECTIONS) {
    const btns = section.ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (btns.length === 0) continue;
    const head = document.createElement('div');
    head.className = 'fctl-section';
    head.textContent = section.label;
    frag.appendChild(head);
    for (const b of btns) { frag.appendChild(b); placed.add(b); }
  }
  // Anything not in the map keeps working — append it under a catch-all.
  const leftovers = [...controls.querySelectorAll('.fctl-btn')].filter((b) => !placed.has(b));
  if (leftovers.length) {
    const head = document.createElement('div');
    head.className = 'fctl-section';
    head.textContent = 'Autres';
    frag.appendChild(head);
    for (const b of leftovers) frag.appendChild(b);
  }
  controls.appendChild(frag);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'fctl-collapse';
  toggle.innerHTML = CHEVRON_SVG;
  header.appendChild(toggle);
  header.classList.add('fctl-header');

  const collapsed = localStorage.getItem('darkboard-fctl-open') !== '1';
  panel.classList.toggle('collapsed', collapsed);
  const setOpen = (open) => {
    panel.classList.toggle('collapsed', !open);
    localStorage.setItem('darkboard-fctl-open', open ? '1' : '0');
    toggle.setAttribute('aria-expanded', String(open));
  };
  setOpen(!collapsed);
  header.addEventListener('click', () => setOpen(panel.classList.contains('collapsed')));
  toggle.setAttribute('aria-label', 'Afficher ou masquer les outils d\'animation');
}

function initControlGroups(app) {
  initToolGroups(app);
  initActionGroups();
  initFacilitatorPanel();
  // The panel only appears once you become facilitator, so group it then too.
  const panel = document.getElementById('facilitatorPanel');
  if (panel && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => initFacilitatorPanel())
      .observe(panel, { attributes: true, attributeFilter: ['style'] });
  }
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.ctl-group')) closeAllFlyouts(null);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllFlyouts(null);
  });
}
