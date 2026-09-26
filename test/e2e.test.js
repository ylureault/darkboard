// Real-browser smoke test for DarkBoard.
// Boots the server, drives Chromium, and fails on any console error / page error.
//
//   npm run test:e2e
//
// Requires playwright-core and a Chromium build. Set CHROMIUM_PATH to override
// the default lookup. Skips (exit 0) with a notice when neither is available.
const path = require('path');

const PORT = process.env.E2E_PORT || 39911;
const EXEC = process.env.CHROMIUM_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let chromium;
try {
  chromium = require('playwright-core').chromium;
} catch (e) {
  console.log('\n--- E2E skipped: playwright-core is not installed ---');
  console.log('    npm install --no-save playwright-core\n');
  process.exit(0);
}
if (!require('fs').existsSync(EXEC)) {
  console.log(`\n--- E2E skipped: no Chromium at ${EXEC} ---`);
  console.log('    set CHROMIUM_PATH to a Chromium executable\n');
  process.exit(0);
}

const errors = [];
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}${ok || !detail ? '' : '\n        ' + detail}`);
}

(async () => {
  process.env.PORT = String(PORT);
  require(path.join(__dirname, '..', 'server.js'));
  await new Promise((r) => setTimeout(r, 1200));

  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  const boardId = 'e2e-' + Date.now().toString(36);
  // Create the board first so the client joins instead of showing "not found".
  await page.goto(`http://127.0.0.1:${PORT}/new`, { waitUntil: 'load' });

  // --- Join ---
  await page.waitForTimeout(600);
  const dialogVisible = await page.evaluate(() => {
    const d = document.getElementById('nameDialog');
    return !!d && getComputedStyle(d).display !== 'none';
  });
  check('nothing covers the join dialog on a first visit', !(await page.evaluate(() => {
    const d = document.getElementById('nameDialog');
    if (!d || getComputedStyle(d).display === 'none') return false;
    const btn = document.getElementById('nameSubmit');
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !(top === btn || btn.contains(top));
  })), 'an overlay intercepts the Rejoindre button');
  if (dialogVisible) {
    await page.fill('#nameInput', 'E2E Tester');
    await page.click('#nameSubmit', { timeout: 5000 }).catch(async () => {
      await page.keyboard.press('Enter');
    });
  }
  await page.waitForTimeout(1500);

  check('app booted', await page.evaluate(() => !!window.app && !!window.app.renderer));
  check('websocket connected', await page.evaluate(() => !!window.app.sync && window.app.sync.connected === true));

  const canvasBox = await page.locator('#canvas').boundingBox();
  const cx = Math.round(canvasBox.x + canvasBox.width / 2);
  const cy = Math.round(canvasBox.y + canvasBox.height / 2);

  // --- Create elements by double-click (sticky) ---
  await page.mouse.dblclick(cx - 300, cy - 150);
  await page.waitForTimeout(400);
  await page.keyboard.type('Alpha');
  await page.keyboard.press('Escape');       // must DISCARD
  await page.waitForTimeout(300);
  const afterEscape = await page.evaluate(() => {
    const els = [...window.app.renderer.elements.values()];
    return { count: els.length, texts: els.map((e) => e.text || '') };
  });
  check('double-click creates an element', afterEscape.count === 1, JSON.stringify(afterEscape));
  check('Escape discards the edit (does not commit text)',
    !afterEscape.texts.some((t) => t === 'Alpha'), JSON.stringify(afterEscape.texts));
  check('no orphan text editor left in DOM',
    await page.evaluate(() => document.querySelectorAll('.text-edit-overlay').length === 0));

  // --- Programmatic element creation for deterministic geometry tests ---
  await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.clear();
    app.renderer.selectedIds.clear();
    const mk = (o) => Object.assign({
      id: o.id, type: 'rect', x: 0, y: 0, width: 100, height: 60,
      fill: '#4a9eff', stroke: '#4a9eff', strokeWidth: 2, zIndex: 1,
    }, o);
    app.renderer.elements.set('a', mk({ id: 'a', x: 0, y: 0, zIndex: 1 }));
    app.renderer.elements.set('b', mk({ id: 'b', x: 300, y: 80, zIndex: 2 }));
    app.renderer.elements.set('c', mk({ id: 'c', x: 600, y: 200, zIndex: 3 }));
    // A line: no width/height, absolute x2/y2
    app.renderer.elements.set('L', {
      id: 'L', type: 'line', x: 100, y: 400, x2: 260, y2: 470,
      stroke: '#e94560', strokeWidth: 2, zIndex: 4,
    });
    // A freehand stroke: absolute points[]
    app.renderer.elements.set('F', {
      id: 'F', type: 'freehand', x: 100, y: 600,
      points: [{ x: 100, y: 600 }, { x: 160, y: 640 }, { x: 220, y: 600 }],
      stroke: '#4ecdc4', strokeWidth: 3, zIndex: 5,
    });
    app.history.undoStack.length = 0;
    app.history.redoStack.length = 0;
    app.renderer.markDirty();
  });

  // --- z-ordering: bringForward used to be a no-op ---
  const zres = await page.evaluate(() => {
    const app = window.app;
    app.renderer.selectedIds.clear();
    app.renderer.selectedIds.add('a');           // bottom-most of a/b/c
    const before = app.renderer.elements.get('a').zIndex;
    app.bringForward();
    const afterFwd = app.renderer.elements.get('a').zIndex;
    const order = () => [...app.renderer.elements.values()]
      .filter((e) => ['a', 'b', 'c'].includes(e.id))
      .sort((p, q) => (p.zIndex || 0) - (q.zIndex || 0)).map((e) => e.id).join('');
    const orderAfterFwd = order();
    app.undo();
    return { before, afterFwd, orderAfterFwd, orderAfterUndo: order() };
  });
  check('bringForward actually moves the element up one step',
    zres.afterFwd > zres.before && zres.orderAfterFwd === 'bac', JSON.stringify(zres));
  check('bringForward is undoable', zres.orderAfterUndo === 'abc', JSON.stringify(zres));

  const zres2 = await page.evaluate(() => {
    const app = window.app;
    app.renderer.selectedIds.clear();
    app.renderer.selectedIds.add('c');           // top-most
    app.sendBackward();
    const order = [...app.renderer.elements.values()]
      .filter((e) => ['a', 'b', 'c'].includes(e.id))
      .sort((p, q) => (p.zIndex || 0) - (q.zIndex || 0)).map((e) => e.id).join('');
    return { order };
  });
  check('sendBackward moves down one step (not to the top)',
    zres2.order === 'acb', JSON.stringify(zres2));

  // --- align must translate lines and freehand, not warp them ---
  const align = await page.evaluate(() => {
    const app = window.app;
    const L0 = { ...app.renderer.elements.get('L') };
    const F0 = JSON.parse(JSON.stringify(app.renderer.elements.get('F')));
    const lenBefore = Math.hypot(L0.x2 - L0.x, L0.y2 - L0.y);

    app.renderer.selectedIds.clear();
    ['a', 'L', 'F'].forEach((id) => app.renderer.selectedIds.add(id));
    app.alignSelected('top');

    const L1 = app.renderer.elements.get('L');
    const F1 = app.renderer.elements.get('F');
    const lenAfter = Math.hypot(L1.x2 - L1.x, L1.y2 - L1.y);
    const fDx = F1.points[0].x - F0.points[0].x;
    const fDy = F1.points[0].y - F0.points[0].y;
    const fShapeKept = F1.points.every((p, i) =>
      Math.abs((p.x - F0.points[i].x) - fDx) < 0.001 &&
      Math.abs((p.y - F0.points[i].y) - fDy) < 0.001);
    return { lenBefore, lenAfter, fMovedBy: [fDx, fDy], fShapeKept, L1y: L1.y, L1y2: L1.y2 };
  });
  check('align keeps a line\'s length (translates both endpoints)',
    Math.abs(align.lenAfter - align.lenBefore) < 0.001, JSON.stringify(align));
  check('align translates a freehand stroke rigidly',
    align.fShapeKept && (align.fMovedBy[0] !== 0 || align.fMovedBy[1] !== 0), JSON.stringify(align));

  // --- undo of a property that was previously unset must be syncable ---
  const undoSync = await page.evaluate(() => {
    const app = window.app;
    app.renderer.selectedIds.clear();
    app.renderer.selectedIds.add('b');
    const sent = [];
    const orig = app.sync.sendOps.bind(app.sync);
    app.sync.sendOps = (ops) => { sent.push(JSON.parse(JSON.stringify(ops))); return orig(ops); };
    app.updateSelectedElements({ shadow: true });   // 'shadow' was never set before
    app.undo();
    app.sync.sendOps = orig;
    const last = sent[sent.length - 1];
    return { sentCount: sent.length, lastProps: last && last[0] && last[0].props };
  });
  check('undo of a newly-set property survives JSON (reaches other clients)',
    undoSync.lastProps && Object.keys(undoSync.lastProps).length > 0,
    JSON.stringify(undoSync));

  // --- deleting a connected shape: one undo restores shape + connector ---
  const delUndo = await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.set('conn', {
      id: 'conn', type: 'connector', x: 100, y: 30, x2: 300, y2: 110,
      sourceId: 'a', targetId: 'b', stroke: '#888', strokeWidth: 2, zIndex: 9,
    });
    app.history.undoStack.length = 0;
    app.renderer.selectedIds.clear();
    app.renderer.selectedIds.add('a');
    app._doDeleteSelected();
    const afterDelete = {
      a: app.renderer.elements.has('a'),
      conn: app.renderer.elements.has('conn'),
      undoDepth: app.history.undoStack.length,
    };
    app.undo();
    return {
      afterDelete,
      afterUndo: { a: app.renderer.elements.has('a'), conn: app.renderer.elements.has('conn') },
    };
  });
  check('deleting a shape removes its connector',
    delUndo.afterDelete.a === false && delUndo.afterDelete.conn === false, JSON.stringify(delUndo));
  check('one undo restores both the shape and its connector',
    delUndo.afterUndo.a === true && delUndo.afterUndo.conn === true &&
    delUndo.afterDelete.undoDepth === 1, JSON.stringify(delUndo));

  // --- locked elements: eraser and delete must both refuse ---
  const locked = await page.evaluate(() => {
    const app = window.app;
    const el = app.renderer.elements.get('b');
    el.locked = true;
    app.renderer.elements.set('lconn', {
      id: 'lconn', type: 'connector', x: 0, y: 0, x2: 10, y2: 10,
      sourceId: 'b', targetId: 'c', stroke: '#888', zIndex: 9,
    });
    app.renderer.selectedIds.clear();
    app.renderer.selectedIds.add('b');
    app._doDeleteSelected();
    const r = { bAlive: app.renderer.elements.has('b'), connAlive: app.renderer.elements.has('lconn') };
    el.locked = false;
    return r;
  });
  check('a locked element survives Delete', locked.bAlive === true, JSON.stringify(locked));
  check('a locked element keeps its connectors', locked.connAlive === true, JSON.stringify(locked));

  // --- envelope containment: undo must not evict the child ---
  const envelope = await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.clear();
    app.renderer.elements.set('env', {
      id: 'env', type: 'envelope', x: 0, y: 0, width: 600, height: 400,
      children: ['kid'], fill: 'transparent', stroke: '#888', zIndex: 1,
    });
    app.renderer.elements.set('kid', {
      id: 'kid', type: 'rect', x: 100, y: 100, width: 80, height: 50,
      fill: '#4a9eff', stroke: '#4a9eff', zIndex: 2,
    });
    app.history.undoStack.length = 0;
    // Move the child around *inside* the envelope it already belongs to.
    const kid = app.renderer.elements.get('kid');
    kid.x = 200; kid.y = 180;
    app.updateEnvelopeContainment(new Map([['kid', kid]]));
    const pushed = app.history.undoStack.length;
    app.undo();
    return {
      pushed,
      childrenAfterUndo: [...(app.renderer.elements.get('env').children || [])],
    };
  });
  check('moving a child inside its own envelope records no spurious undo',
    envelope.pushed === 0, JSON.stringify(envelope));
  check('undo does not evict a child from its envelope',
    envelope.childrenAfterUndo.includes('kid'), JSON.stringify(envelope));

  // --- ungroup with nothing grouped must not burn an undo slot ---
  const ungroup = await page.evaluate(() => {
    const app = window.app;
    app.history.undoStack.length = 0;
    app.renderer.selectedIds.clear();
    app.renderer.selectedIds.add('kid');
    app.ungroupSelected();
    return { depth: app.history.undoStack.length };
  });
  check('ungroup with nothing grouped records no undo entry',
    ungroup.depth === 0, JSON.stringify(ungroup));

  // --- minimap: hit test must agree with where it is drawn ---
  const minimap = await page.evaluate(() => {
    const app = window.app;
    app.renderer.minimapEnabled = true;
    app.renderer.markDirty();
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = app.renderer._getMinimapRect();
      const inside = app.renderer.hitTestMinimap(r.mmX + r.mmW / 2, r.mmY + r.headerH + r.mmH / 2);
      const outsideLeft = app.renderer.hitTestMinimap(r.mmX - 40, r.mmY + r.headerH + r.mmH / 2);
      const onHeader = app.renderer.hitTestMinimap(r.mmX + r.mmW / 2, r.mmY + 4);
      res({
        rect: r, hasExtents: !!app.renderer._minimapExtents,
        insideHit: !!inside, outsideHit: !!outsideLeft, headerHit: !!onHeader,
        fitsViewport: r.mmX >= 0 && r.mmY >= 0 &&
          r.mmX + r.mmW <= window.innerWidth && r.mmY + r.totalH <= window.innerHeight,
      });
    })));
  });
  check('minimap fits inside the viewport', minimap.fitsViewport, JSON.stringify(minimap.rect));
  check('minimap hit test hits inside the body and misses outside',
    minimap.insideHit && !minimap.outsideHit, JSON.stringify(minimap));
  check('minimap header is not a navigation target', !minimap.headerHit, JSON.stringify(minimap));

  const emptyMinimap = await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.clear();
    app.renderer.markDirty();
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = app.renderer._getMinimapRect();
      res({
        extents: app.renderer._minimapExtents,
        hit: app.renderer.hitTestMinimap(r.mmX + r.mmW / 2, r.mmY + r.headerH + r.mmH / 2),
      });
    })));
  });
  check('emptying the board clears stale minimap extents',
    emptyMinimap.extents === null && emptyMinimap.hit === null, JSON.stringify(emptyMinimap));

  // --- card editor: one undo entry per editing session, and the floating toolbar survives ---
  const card = await page.evaluate(async () => {
    const app = window.app;
    app.renderer.elements.clear();
    app.renderer.elements.set('card1', {
      id: 'card1', type: 'card', x: 0, y: 0, width: 240, height: 140,
      text: '', fill: '#2a2a2a', stroke: '#4a9eff', zIndex: 1,
    });
    app.history.undoStack.length = 0;
    app.startTextEdit(app.renderer.elements.get('card1'));
    const poisoned = app.textEditElement !== null;

    const field = document.querySelector('.card-field');
    let depthAfterTyping = null;
    if (field) {
      for (const ch of 'Hello') {
        field.value += ch;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      depthAfterTyping = app.history.undoStack.length;
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return {
      poisoned,
      hasPanel: !!document.querySelector('.card-editor-panel'),
      depthAfterTyping,
      depthAfterCommit: app.history.undoStack.length,
    };
  });
  check('card editor does not poison textEditElement',
    card.poisoned === false, JSON.stringify(card));
  check('typing in a card field records no undo entry per keystroke',
    card.depthAfterTyping === 0, JSON.stringify(card));
  check('card field commits exactly one undo entry',
    card.depthAfterCommit === 1, JSON.stringify(card));

  // --- tool switching while editing must close the editor ---
  const toolSwitch = await page.evaluate(async () => {
    const app = window.app;
    app.renderer.elements.clear();
    document.querySelectorAll('.card-editor-panel').forEach((n) => n.remove());
    app.renderer.elements.set('s1', {
      id: 's1', type: 'sticky', x: 0, y: 0, width: 200, height: 200,
      text: '', fill: '#FFD966', stroke: '#FFD966', zIndex: 1,
    });
    app.startTextEdit(app.renderer.elements.get('s1'));
    const opened = document.querySelectorAll('.text-edit-overlay').length;
    app.setTool('rect');
    await new Promise((r) => setTimeout(r, 120));
    return { opened, stillOpen: document.querySelectorAll('.text-edit-overlay').length };
  });
  check('switching tools closes an open text editor',
    toolSwitch.opened === 1 && toolSwitch.stillOpen === 0, JSON.stringify(toolSwitch));

  // --- element flash actually drives the canvas renderer ---
  const flash = await page.evaluate(() => {
    const app = window.app;
    const el = app.renderer.elements.get('s1');
    app._flashCreatedElement(el);
    return { mapped: !!(app.renderer._flashMap && app.renderer._flashMap.has('s1')) };
  });
  check('element flash populates the canvas flash map', flash.mapped, JSON.stringify(flash));

  // --- CSS sanity: the polished selectors actually match live elements ---
  const css = await page.evaluate(() => {
    const share = document.getElementById('shareBtn');
    const out = {};
    if (share) {
      const s = getComputedStyle(share);
      out.shareHasGradient = s.backgroundImage.includes('gradient');
    }
    const toastEl = document.querySelector('.toast');
    out.toastZ = toastEl ? getComputedStyle(toastEl).zIndex : null;
    out.smoothScrollScoped = getComputedStyle(document.querySelector('#canvas')).scrollBehavior;
    return out;
  });
  check('share button picks up its gradient style', css.shareHasGradient === true, JSON.stringify(css));

  // --- a tagged element must not kill the render loop ---
  const tagged = await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.clear();
    app.renderer.elements.set('tg', {
      id: 'tg', type: 'sticky', x: 0, y: 0, width: 200, height: 200,
      text: 'tagged', fill: '#FFD966', stroke: '#FFD966', zIndex: 1,
      tags: [{ label: 'urgent', color: '#e94560' }],
    });
    app.renderer.markDirty();
    const before = app.renderer._frameCount;
    return new Promise((res) => setTimeout(() => {
      // Force more frames; if the loop died, dirty stays true forever.
      app.renderer.markDirty();
      setTimeout(() => res({
        stillDirty: app.renderer.dirty,
        advanced: app.renderer._frameCount !== before,
      }), 300);
    }, 300));
  });
  check('a tagged element does not freeze the render loop',
    tagged.stillDirty === false, JSON.stringify(tagged));

  // --- prioritization matrix produces real, addressable elements ---
  const matrix = await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.clear();
    // Two voted stickies so the matrix has something to place.
    for (let i = 0; i < 2; i++) {
      app.renderer.elements.set('s' + i, {
        id: 's' + i, type: 'sticky', x: i * 300, y: 0, width: 140, height: 140,
        text: 'idea ' + i, fill: '#FFD966', stroke: '#FFD966', zIndex: i + 1,
      });
    }
    app.workshop.voteResults = { s0: 3, s1: 1 };
    app.workshop.isFacilitator = true;
    app.history.undoStack.length = 0;
    const before = app.renderer.elements.size;
    app.workshop.showPrioritizationMatrix();
    const els = [...app.renderer.elements.entries()];
    return {
      before, after: els.length,
      undefinedKey: app.renderer.elements.has(undefined),
      keysMatchIds: els.every(([k, v]) => k === v.id),
      allSized: els.filter((e) => e[1].type === 'frame' || e[1].type === 'rect')
        .every(([, v]) => Number.isFinite(v.width) && v.width > 0 && Number.isFinite(v.height) && v.height > 0),
      stickyMoved: app.renderer.elements.get('s0').y !== 0 || app.renderer.elements.get('s0').x !== 0,
      undoDepth: app.history.undoStack.length,
    };
  });
  check('prioritization matrix creates every element (no undefined key)',
    matrix.undefinedKey === false && matrix.keysMatchIds && matrix.after > matrix.before + 4,
    JSON.stringify(matrix));
  check('matrix elements have real width/height', matrix.allSized, JSON.stringify(matrix));
  check('matrix repositions the voted stickies', matrix.stickyMoved, JSON.stringify(matrix));
  check('matrix is one undo entry', matrix.undoDepth === 1, JSON.stringify(matrix));

  // --- CSV round-trip with an rgba fill and tags ---
  const csvRound = await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.clear();
    app.renderer.elements.set('z1', {
      id: 'z1', type: 'frame', x: 10, y: 20, width: 300, height: 200,
      text: 'Zone A', fill: 'rgba(74, 158, 255, 0.05)', stroke: '#4a9eff',
      zIndex: 1, tags: [{ label: 'alpha', color: '#e94560' }],
    });
    // Build the CSV exactly as exportCSV does, then parse it back.
    const headers = ['id', 'type', 'x', 'y', 'width', 'height', 'text', 'fill', 'stroke', 'tags', 'children'];
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const el = app.renderer.elements.get('z1');
    const row = [q(el.id), q(el.type), 10, 20, 300, 200, q(el.text), q(el.fill), q(el.stroke),
      q(el.tags.map((t) => t.label).join(';')), q('')].join(',');
    const csv = headers.join(',') + '\n' + row;
    const parsed = app.ui.parseCSVRows(csv);
    return { cols: parsed[1].length, expected: headers.length, fill: parsed[1][7], tags: parsed[1][9] };
  });
  check('CSV export/parse keeps column alignment with an rgba fill',
    csvRound.cols === csvRound.expected && csvRound.fill === 'rgba(74, 158, 255, 0.05)' && csvRound.tags === 'alpha',
    JSON.stringify(csvRound));

  // --- CSV import gives linear types usable endpoints ---
  const csvConn = await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.clear();
    const csv = 'id,type,x,y,width,height,text\n"c1","connector",0,0,200,100,""\n"f1","freehand",0,300,120,60,""';
    app.ui.importCSV(csv, 'test.csv');
    const els = [...app.renderer.elements.values()];
    const conn = els.find((e) => e.type === 'connector');
    const fh = els.find((e) => e.type === 'freehand');
    const bounds = conn ? window.getElementBounds(conn) : null;
    return {
      connHasEnds: !!conn && Number.isFinite(conn.x2) && Number.isFinite(conn.y2),
      boundsFinite: !!bounds && Number.isFinite(bounds.w) && Number.isFinite(bounds.h),
      fhHasPoints: !!fh && Array.isArray(fh.points) && fh.points.length > 1,
    };
  }).catch(() => null);
  if (csvConn) {
    check('CSV-imported connectors get finite endpoints',
      csvConn.connHasEnds && csvConn.boundsFinite, JSON.stringify(csvConn));
    check('CSV-imported freehand gets points', csvConn.fhHasPoints, JSON.stringify(csvConn));
  }

  // --- importing arbitrary JSON must be refused, not injected ---
  const junk = await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.clear();
    app.ui.importDarkBoard({ elements: [{ foo: 'bar' }, 'nope', 42, { type: 'sticky' }] });
    const els = [...app.renderer.elements.values()];
    return { count: els.length, anyNaN: els.some((e) => !Number.isFinite(e.x) || !Number.isFinite(e.y)) };
  });
  check('arbitrary JSON is rejected instead of injecting NaN elements',
    junk.count === 0 && junk.anyNaN === false, JSON.stringify(junk));

  // --- replace must keep richText consistent with plain text ---
  const rich = await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.clear();
    // 'hello' spans an inline <b>, so a naive HTML regex would miss it.
    app.renderer.elements.set('r1', {
      id: 'r1', type: 'sticky', x: 0, y: 0, width: 200, height: 200,
      text: 'hello world', richText: 'he<b>llo</b> world',
      fill: '#FFD966', stroke: '#FFD966', zIndex: 1,
    });
    // And one where the query looks like markup.
    app.renderer.elements.set('r2', {
      id: 'r2', type: 'sticky', x: 300, y: 0, width: 200, height: 200,
      text: 'keep b safe', richText: '<b>keep</b> b safe',
      fill: '#FFD966', stroke: '#FFD966', zIndex: 2,
    });
    app.createSearchPanel && app.createSearchPanel();
    app.replaceAll('hello', 'bonjour');
    app.replaceAll('b', 'B');
    const r1 = app.renderer.elements.get('r1');
    const r2 = app.renderer.elements.get('r2');
    const rendered = (el) => el.richText || el.text;
    return {
      r1text: r1.text,
      r1rendered: rendered(r1),
      r2rendered: rendered(r2),
      r2HasBoldTag: /<b>/i.test(r2.richText || ''),
    };
  });
  check('replace across inline markup is visible on canvas',
    !/hello/i.test(rich.r1rendered) && /bonjour/i.test(rich.r1rendered), JSON.stringify(rich));
  check('replace does not rewrite HTML tag names',
    rich.r2HasBoldTag === true, JSON.stringify(rich));

  // --- Ctrl+F twice must clear highlights ---
  const highlights = await page.evaluate(() => {
    const app = window.app;
    app.toggleSearchPanel();
    const input = app.searchPanel.querySelector('.search-input');
    input.value = 'B';
    app.performSearch('B');
    const during = [...app.renderer.elements.values()].filter((e) => e._searchHighlight).length;
    app.toggleSearchPanel();
    const after = [...app.renderer.elements.values()].filter((e) => e._searchHighlight).length;
    return { during, after };
  });
  check('toggling the search panel closed clears the highlights',
    highlights.after === 0, JSON.stringify(highlights));

  // --- retro template is one batch / one undo ---
  const retro = await page.evaluate(() => {
    const app = window.app;
    app.renderer.elements.clear();
    app.history.undoStack.length = 0;
    let opCalls = 0;
    const orig = app.sync.sendOps.bind(app.sync);
    app.sync.sendOps = (ops) => { opCalls++; return orig(ops); };
    app.workshop.generateRetroTemplate();
    app.sync.sendOps = orig;
    return { count: app.renderer.elements.size, opCalls, undoDepth: app.history.undoStack.length };
  });
  check('retro template creates 6 elements in one op and one undo entry',
    retro.count === 6 && retro.opCalls === 1 && retro.undoDepth === 1, JSON.stringify(retro));

  // --- interaction smoke: drag, undo/redo via keyboard ---
  await page.evaluate(() => {
    const app = window.app;
    // Close anything a previous step left open so it can't cover the canvas.
    if (app.searchPanel) app.closeSearchPanel();
    document.querySelectorAll('.card-editor-panel,.tour-overlay,.tour-tooltip,.tour-highlight,.confirm-overlay').forEach((n) => n.remove());
    const help = document.getElementById('helpOverlay');
    if (help) help.style.display = 'none';
    app.renderer.elements.clear();
    app.renderer.selectedIds.clear();
    app.setTool('select');
    app.renderer.camera.x = 0; app.renderer.camera.y = 0; app.renderer.camera.zoom = 1;
    const c = app.renderer.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    window.__dragOrigin = { x: Math.round(c.x - 100), y: Math.round(c.y - 60) };
    app.renderer.elements.set('drag1', {
      id: 'drag1', type: 'rect', x: window.__dragOrigin.x, y: window.__dragOrigin.y, width: 200, height: 120,
      fill: '#4a9eff', stroke: '#4a9eff', strokeWidth: 2, zIndex: 1,
    });
    app.history.undoStack.length = 0;
    app.renderer.markDirty();
  });
  const dragStart = await page.evaluate(() => {
    const o = window.__dragOrigin;
    const s = window.app.renderer.worldToScreen(o.x + 100, o.y + 60);
    const x = Math.round(s.x), y = Math.round(s.y);
    const top = document.elementFromPoint(x, y);
    return {
      x, y,
      topId: top ? (top.id || top.className || top.tagName) : null,
      hits: !!window.app.renderer.hitTest(o.x + 100, o.y + 60),
    };
  });
  check('the drag target is on open canvas (nothing covering it)',
    dragStart.topId === 'canvas' && dragStart.hits, JSON.stringify(dragStart));
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 120, dragStart.y + 90, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const dragged = await page.evaluate(() => {
    const el = window.app.renderer.elements.get('drag1');
    const o = window.__dragOrigin;
    return { dx: Math.round(el.x - o.x), dy: Math.round(el.y - o.y), depth: window.app.history.undoStack.length };
  });
  check('dragging moves the element and records one undo entry',
    dragged.dx > 0 && dragged.dy > 0 && dragged.depth === 1, JSON.stringify(dragged));

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  const undone = await page.evaluate(() => {
    const el = window.app.renderer.elements.get('drag1');
    const o = window.__dragOrigin;
    return { dx: Math.round(el.x - o.x), dy: Math.round(el.y - o.y) };
  });
  check('Ctrl+Z restores the pre-drag position',
    undone.dx === 0 && undone.dy === 0, JSON.stringify(undone));

  await page.keyboard.press('Control+y');
  await page.waitForTimeout(350);
  const redone = await page.evaluate(() => {
    const el = window.app.renderer.elements.get('drag1');
    const o = window.__dragOrigin;
    return { dx: Math.round(el.x - o.x) };
  });
  check('Ctrl+Y re-applies the drag', redone.dx === dragged.dx, JSON.stringify({ redone, dragged }));

  // --- no pending drag state after the pointer leaves mid-drag ---
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 40, dragStart.y + 40, { steps: 4 });
  await page.mouse.move(2, 2, { steps: 4 });   // leave the canvas
  await page.mouse.up();
  await page.waitForTimeout(200);
  check('drag state is cleared when the pointer leaves the canvas',
    await page.evaluate(() => window.app.input.isDragging === false &&
      window.app.input.pointerDown === false));

  // --- dragging a frame with children + connectors is ONE undo entry ---
  await page.evaluate(() => {
    const app = window.app;
    if (app.searchPanel) app.closeSearchPanel();
    document.querySelectorAll('.card-editor-panel,.tour-overlay,.tour-tooltip,.tour-highlight,.confirm-overlay').forEach((n) => n.remove());
    const help = document.getElementById('helpOverlay');
    if (help) help.style.display = 'none';
    app.renderer.elements.clear();
    app.renderer.selectedIds.clear();
    app.setTool('select');
    app.renderer.camera.x = 0; app.renderer.camera.y = 0; app.renderer.camera.zoom = 1;
    // Anchor the frame near the viewport centre so its title bar is well clear
    // of the toolbar and of the edge auto-scroll margin.
    const c = app.renderer.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    const fx = Math.round(c.x - 200), fy = Math.round(c.y - 100);
    window.__frameOrigin = { x: fx, y: fy };
    app.renderer.elements.set('fr', {
      id: 'fr', type: 'frame', x: fx, y: fy, width: 400, height: 300,
      text: 'Frame', fill: 'transparent', stroke: '#4a9eff', strokeWidth: 2, zIndex: 1,
    });
    app.renderer.elements.set('kid', {
      id: 'kid', type: 'rect', x: fx + 40, y: fy + 60, width: 100, height: 60,
      fill: '#FFD966', stroke: '#FFD966', strokeWidth: 2, zIndex: 2,
    });
    app.renderer.elements.set('out', {
      id: 'out', type: 'rect', x: fx + 900, y: fy + 60, width: 100, height: 60,
      fill: '#4ecdc4', stroke: '#4ecdc4', strokeWidth: 2, zIndex: 3,
    });
    app.renderer.elements.set('cn', {
      id: 'cn', type: 'connector', x: fx + 140, y: fy + 90, x2: fx + 900, y2: fy + 90,
      sourceId: 'kid', targetId: 'out', stroke: '#888', strokeWidth: 2, zIndex: 4,
    });
    app.history.undoStack.length = 0;
    if (app.refreshFloatingToolbar) app.refreshFloatingToolbar();
    app.renderer.markDirty();
  });
  await page.waitForTimeout(250);
  const framePick = await page.evaluate(() => {
    const app = window.app;
    const o = window.__frameOrigin;
    // The frame's title bar sits just above its body and is hit-testable.
    const wx = o.x + 200, wy = o.y - 10;
    const s = app.renderer.worldToScreen(wx, wy);
    const x = Math.round(s.x), y = Math.round(s.y);
    const hit = app.renderer.hitTest(wx, wy);
    const top = document.elementFromPoint(x, y);
    return {
      x, y,
      grabbed: hit ? hit.id : null,
      topId: top ? (top.id || top.className || top.tagName) : null,
    };
  });
  check('the frame title bar is grabbable on open canvas',
    framePick.grabbed === 'fr' && framePick.topId === 'canvas', JSON.stringify(framePick));

  const beforeFrameDrag = await page.evaluate(() => {
    const g = (id) => { const e = window.app.renderer.elements.get(id); return { x: Math.round(e.x), y: Math.round(e.y) }; };
    return { fr: g('fr'), kid: g('kid'), cn: g('cn') };
  });
  await page.mouse.move(framePick.x, framePick.y);
  await page.mouse.down();
  await page.mouse.move(framePick.x + 100, framePick.y + 70, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(450);
  const afterFrameDrag = await page.evaluate(() => {
    const g = (id) => { const e = window.app.renderer.elements.get(id); return { x: Math.round(e.x), y: Math.round(e.y) }; };
    return { fr: g('fr'), kid: g('kid'), cn: g('cn'), depth: window.app.history.undoStack.length };
  });
  check('dragging a frame moves its child and re-routes its connector',
    afterFrameDrag.fr.x !== beforeFrameDrag.fr.x &&
    afterFrameDrag.kid.x !== beforeFrameDrag.kid.x &&
    afterFrameDrag.cn.x !== beforeFrameDrag.cn.x,
    JSON.stringify({ before: beforeFrameDrag, after: afterFrameDrag }));
  check('dragging a frame with children and a connector is one undo entry',
    afterFrameDrag.depth === 1, JSON.stringify(afterFrameDrag));

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  const afterFrameUndo = await page.evaluate(() => {
    const g = (id) => { const e = window.app.renderer.elements.get(id); return { x: Math.round(e.x), y: Math.round(e.y) }; };
    return { fr: g('fr'), kid: g('kid'), cn: g('cn') };
  });
  check('one Ctrl+Z restores frame, child and connector together',
    afterFrameUndo.fr.x === beforeFrameDrag.fr.x &&
    afterFrameUndo.kid.x === beforeFrameDrag.kid.x &&
    afterFrameUndo.cn.x === beforeFrameDrag.cn.x,
    JSON.stringify({ before: beforeFrameDrag, afterUndo: afterFrameUndo }));

  await page.waitForTimeout(400);
  await browser.close();

  console.log('\n--- Console / page errors ---');
  if (errors.length === 0) {
    console.log('  none');
  } else {
    for (const e of [...new Set(errors)]) console.log('  ' + e);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n--- E2E: ${results.length - failed} passed, ${failed} failed, ${new Set(errors).size} distinct runtime errors ---`);
  process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error('E2E harness crashed:', e);
  process.exit(2);
});
