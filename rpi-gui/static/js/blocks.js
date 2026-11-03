/* =====================================================================
 * KACHOW — éditeur de blocs (type Scratch) + interpréteur
 * Sans dépendance : fonctionne hors-ligne sur le point d'accès du robot.
 * ===================================================================== */
(function () {
  'use strict';
  const R = window.Robot;

  // ---------------------------------------------------------------- catalogue
  const CATS = [
    { id: 'move',  label: 'Mouvement', color: 'var(--c-move)' },
    { id: 'act',   label: 'Actions',   color: 'var(--c-act)' },
    { id: 'sense', label: 'Capteurs',  color: 'var(--c-sense)' },
    { id: 'ctrl',  label: 'Contrôle',  color: 'var(--c-ctrl)' },
  ];

  const SIDE4 = [['any', 'n\'importe quel côté'], ['front', 'avant'], ['back', 'arrière'], ['left', 'gauche'], ['right', 'droite']];
  const US = [['front', 'AV'], ['back', 'AR']];
  const OPS = [['<', '<'], ['>', '>']];
  const LABELS = [['any', 'un objet'], ['balle', 'balle'], ['personne', 'personne'], ['bouteille', 'bouteille'], ['cube rouge', 'cube rouge']];
  const WORDS = [['avant', 'avant'], ['arrière', 'arrière'], ['droite', 'droite'], ['gauche', 'gauche'], ['stop', 'stop']];
  const COLORS = [['rouge', 'rouge'], ['vert', 'vert'], ['bleu', 'bleu'], ['jaune', 'jaune'], ['blanc', 'blanc']];
  const SOUNDS = [['bonjour.mp3', 'bonjour.mp3'], ['alerte.mp3', 'alerte.mp3'], ['victoire.mp3', 'victoire.mp3']];

  const num = (k, v, min, max) => ({ k, t: 'num', v, min, max });
  const sel = (k, o, v) => ({ k, t: 'sel', o, v: v == null ? o[0][0] : v });
  const txt = (k, v) => ({ k, t: 'txt', v });
  const SLOT = { slot: true };

  const DEFS = {
    // --- Mouvement ---
    fwd:   { cat: 'move', parts: ['Avancer de', num('d', 50, 1, 500), 'cm'],
             run: (n, x) => x.move('forward', n.p.d / R.cal.lin), code: p => `avancer(${p.d})` },
    back:  { cat: 'move', parts: ['Reculer de', num('d', 50, 1, 500), 'cm'],
             run: (n, x) => x.move('backward', n.p.d / R.cal.lin), code: p => `reculer(${p.d})` },
    rotR:  { cat: 'move', parts: ['Tourner à droite de', num('a', 90, 1, 3600), '°'],
             run: (n, x) => x.move('right', n.p.a / R.cal.rot), code: p => `tourner_droite(${p.a})` },
    rotL:  { cat: 'move', parts: ['Tourner à gauche de', num('a', 90, 1, 3600), '°'],
             run: (n, x) => x.move('left', n.p.a / R.cal.rot), code: p => `tourner_gauche(${p.a})` },
    fwdT:  { cat: 'move', parts: ['Avancer pendant', num('s', 1, 0.1, 60), 's'],
             run: (n, x) => x.move('forward', n.p.s), code: p => `avancer_pendant(${p.s})` },
    halt:  { cat: 'move', parts: ['Arrêter les moteurs'],
             run: () => R.drive('stop'), code: () => `arreter()` },

    // --- Actions ---
    gOpen: { cat: 'act', sim: true, parts: ['Ouvrir la pince'],
             run: async (n, x) => { R.action('gripper', { op: 'open' }); await x.sleep(400); }, code: () => `pince.ouvrir()` },
    gClose:{ cat: 'act', sim: true, parts: ['Fermer la pince'],
             run: async (n, x) => { R.action('gripper', { op: 'close' }); await x.sleep(400); }, code: () => `pince.fermer()` },
    gLift: { cat: 'act', sim: true, parts: [sel('o', [['up', 'Lever'], ['down', 'Baisser']]), 'la pince'],
             run: async (n, x) => { R.action('gripper', { op: n.p.o }); await x.sleep(400); }, code: p => `pince.${p.o === 'up' ? 'lever' : 'baisser'}()` },
    ledOn: { cat: 'act', sim: true, parts: ['Allumer LED', sel('c', COLORS)],
             run: n => R.action('led', { color: n.p.c }), code: p => `led.allumer("${p.c}")` },
    ledOff:{ cat: 'act', sim: true, parts: ['Éteindre LED'],
             run: () => R.action('led', { color: null }), code: () => `led.eteindre()` },
    say:   { cat: 'act', sim: true, parts: ['Dire', txt('t', 'Bonjour !')],
             run: async (n, x) => { R.action('say', { text: n.p.t }); R.say(n.p.t); x.log('🔊 « ' + n.p.t + ' »'); await x.sleep(300 + n.p.t.length * 60); },
             code: p => `dire(${JSON.stringify(p.t)})` },
    play:  { cat: 'act', sim: true, parts: ['Jouer l\'audio', sel('f', SOUNDS)],
             run: async (n, x) => { R.action('audio', { file: n.p.f }); R.beep(150, 660); x.log('🎵 ' + n.p.f); await x.sleep(600); },
             code: p => `jouer_audio("${p.f}")` },
    beep:  { cat: 'act', sim: true, parts: ['Bip pendant', num('ms', 300, 50, 5000), 'ms'],
             run: async (n, x) => { R.action('beep', { ms: n.p.ms }); R.beep(n.p.ms); await x.sleep(n.p.ms); },
             code: p => `bip(${p.ms})` },
    print: { cat: 'act', parts: ['Afficher', txt('t', 'Coucou')],
             run: (n, x) => x.log('› ' + n.p.t), code: p => `afficher(${JSON.stringify(p.t)})` },

    // --- Capteurs (mesures + conditions) ---
    measure: { cat: 'sense', parts: ['Mesurer distance', sel('s', US)],
             run: (n, x) => { const d = R.state.dist[n.p.s]; x.log('📏 Distance ' + (n.p.s === 'front' ? 'AV' : 'AR') + ' : ' + (d == null ? 'indisponible' : Math.round(d) + ' cm')); },
             code: p => `print(distance("${p.s === 'front' ? 'AV' : 'AR'}"))` },
    cBump: { cat: 'sense', cond: true, parts: ['choc', sel('s', SIDE4), 'actif'],
             eval: n => n.p.s === 'any' ? Object.values(R.state.bump).some(Boolean) : !!R.state.bump[n.p.s],
             code: p => p.s === 'any' ? `choc()` : `choc("${p.s}")` },
    cDist: { cat: 'sense', cond: true, parts: ['distance', sel('s', US), sel('op', OPS), num('v', 20, 0, 400), 'cm'],
             eval: (n, x) => { const d = R.state.dist[n.p.s]; if (d == null) { x.warnOnce('dist', 'Distance indisponible (télémétrie non émise par app.py) → condition fausse.'); return false; } return n.p.op === '<' ? d < n.p.v : d > n.p.v; },
             code: p => `distance("${p.s === 'front' ? 'AV' : 'AR'}") ${p.op} ${p.v}` },
    cObj:  { cat: 'sense', cond: true, parts: ['caméra voit', sel('l', LABELS)],
             eval: n => R.state.objects.some(o => n.p.l === 'any' || o.label === n.p.l),
             code: p => p.l === 'any' ? `camera.objet()` : `camera.voit("${p.l}")` },
    cWord: { cat: 'sense', cond: true, parts: ['mot', sel('w', WORDS), 'entendu'],
             eval: n => { const w = R.state.word; if (w && w.w === n.p.w && performance.now() - w.t < 4000) { R.state.word = null; return true; } return false; },
             code: p => `micro.entendu("${p.w}")` },
    cPos:  { cat: 'sense', cond: true, parts: ['position', sel('a', [['x', 'x'], ['y', 'y']]), sel('op', OPS), num('v', 50, -1000, 1000), 'cm'],
             eval: n => { const v = R.state.pose[n.p.a]; return n.p.op === '<' ? v < n.p.v : v > n.p.v; },
             code: p => `position.${p.a} ${p.op} ${p.v}` },
    cHead: { cat: 'sense', cond: true, parts: ['cap', sel('op', OPS), num('v', 90, 0, 360), '°'],
             eval: n => { const h = R.state.heading != null ? R.state.heading : ((R.state.pose.th * 180 / Math.PI) % 360 + 360) % 360; return n.p.op === '<' ? h < n.p.v : h > n.p.v; },
             code: p => `cap() ${p.op} ${p.v}` },

    // --- Contrôle ---
    if:    { cat: 'ctrl', c: 1, parts: ['si', SLOT, 'alors'],
             run: async (n, x) => { if (x.cond(n.cond)) await x.list(n.body); },
             code: (p, n, g) => `if ${g.cond(n.cond)}:\n${g.list(n.body)}` },
    ifElse:{ cat: 'ctrl', c: 2, parts: ['si', SLOT, 'alors'],
             run: async (n, x) => { if (x.cond(n.cond)) await x.list(n.body); else await x.list(n.else); },
             code: (p, n, g) => `if ${g.cond(n.cond)}:\n${g.list(n.body)}\nelse:\n${g.list(n.else)}` },
    rep:   { cat: 'ctrl', c: 1, parts: ['répéter', num('n', 4, 1, 999), 'fois'],
             run: async (n, x) => { for (let i = 0; i < n.p.n; i++) { await x.list(n.body); await x.sleep(0); } },
             code: (p, n, g) => `for _ in range(${p.n}):\n${g.list(n.body)}` },
    until: { cat: 'ctrl', c: 1, parts: ['répéter jusqu\'à', SLOT],
             run: async (n, x) => { while (!x.cond(n.cond)) { await x.list(n.body); await x.sleep(20); } },
             code: (p, n, g) => `while not (${g.cond(n.cond)}):\n${g.list(n.body)}` },
    ever:  { cat: 'ctrl', c: 1, cap: true, parts: ['répéter indéfiniment'],
             run: async (n, x) => { for (;;) { await x.list(n.body); await x.sleep(20); } },
             code: (p, n, g) => `while True:\n${g.list(n.body)}` },
    wait:  { cat: 'ctrl', parts: ['attendre', num('s', 1, 0, 600), 's'],
             run: (n, x) => x.sleep(n.p.s * 1000), code: p => `attendre(${p.s})` },
    waitU: { cat: 'ctrl', parts: ['attendre jusqu\'à', SLOT],
             run: async (n, x) => { while (!x.cond(n.cond)) await x.sleep(30); },
             code: (p, n, g) => `attendre_que(${g.cond(n.cond)})` },
    end:   { cat: 'ctrl', cap: true, parts: ['arrêter le programme'],
             run: (n, x) => x.end(), code: () => `return` },
  };

  // ---------------------------------------------------------------- modèle
  let uid = 1;
  const newId = () => 'b' + (uid++) + Math.random().toString(36).slice(2, 6);

  function make(type, p) {
    const d = DEFS[type];
    const n = { id: newId(), type, p: {} };
    d.parts.forEach(pt => { if (pt && pt.k) n.p[pt.k] = pt.v; });
    if (p) Object.assign(n.p, p);
    if (d.parts.some(pt => pt && pt.slot)) n.cond = null;
    if (d.c) n.body = [];
    if (d.c === 2) n.else = [];
    return n;
  }

  let program = loadProgram();

  function loadProgram() {
    const saved = R.store.get('program', null);
    if (saved && Array.isArray(saved) && validList(saved)) { reId(saved); return saved; }
    return example('square');
  }
  function validList(l) {
    return Array.isArray(l) && l.every(n => n && DEFS[n.type] && (!n.body || validList(n.body)) && (!n.else || validList(n.else)) && (!n.cond || validList([n.cond])));
  }
  function reId(list) {
    (list || []).forEach(n => { n.id = newId(); if (n.cond) reId([n.cond]); reId(n.body); reId(n.else); });
  }
  function save() { R.store.set('program', program); }

  // retrouve un nœud et son conteneur
  function locate(id, list, parent, key) {
    list = list || program;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.id === id) return { list, index: i, node: n, parent, key };
      if (n.cond && n.cond.id === id) return { owner: n, node: n.cond, slot: true };
      for (const k of ['body', 'else']) if (n[k]) { const r = locate(id, n[k], n, k); if (r) return r; }
    }
    return null;
  }

  function listFor(stackEl) {
    const owner = stackEl.dataset.owner;
    if (owner === 'root') return program;
    const loc = locate(owner);
    return loc ? loc.node[stackEl.dataset.key] : null;
  }

  function detach(id) {
    const loc = locate(id);
    if (!loc) return null;
    if (loc.slot) { loc.owner.cond = null; return loc.node; }
    loc.list.splice(loc.index, 1);
    return loc.node;
  }

  // ---------------------------------------------------------------- rendu
  const $ = s => document.querySelector(s);
  let wsRoot, paletteList, paletteCats, trashEl, dropLine;
  let currentCat = 'move';

  function renderBlock(n, palette) {
    const d = DEFS[n.type];
    const el = document.createElement('div');
    el.className = 'blk cat-' + d.cat + (d.cond ? ' is-cond' : '') + (d.c ? ' is-c' : '') + (d.cap ? ' is-cap' : '');
    el.dataset.id = n.id;
    el.dataset.type = n.type;
    if (palette) el.dataset.palette = '1';

    const row = document.createElement('div');
    row.className = 'blk-row';
    d.parts.forEach(pt => row.appendChild(renderPart(pt, n, palette)));
    if (d.sim) {
      const b = document.createElement('span');
      b.className = 'sim-badge'; b.title = 'Pas encore géré par le firmware : actif en simulation';
      b.textContent = 'sim';
      row.appendChild(b);
    }
    el.appendChild(row);

    if (d.c) {
      el.appendChild(renderMouth(n, 'body', palette));
      if (d.c === 2) {
        const r2 = document.createElement('div'); r2.className = 'blk-row blk-else'; r2.textContent = 'sinon';
        el.appendChild(r2);
        el.appendChild(renderMouth(n, 'else', palette));
      }
      const foot = document.createElement('div'); foot.className = 'blk-foot';
      el.appendChild(foot);
    }
    return el;
  }

  function renderMouth(n, key, palette) {
    const m = document.createElement('div'); m.className = 'blk-mouth';
    const st = document.createElement('div'); st.className = 'stack';
    if (!palette) { st.dataset.owner = n.id; st.dataset.key = key; (n[key] || []).forEach(c => st.appendChild(renderBlock(c))); }
    m.appendChild(st);
    return m;
  }

  function renderPart(pt, n, palette) {
    if (typeof pt === 'string') { const s = document.createElement('span'); s.className = 'blk-txt'; s.textContent = pt; return s; }
    if (pt.slot) {
      const s = document.createElement('span'); s.className = 'slot';
      if (!palette) s.dataset.owner = n.id;
      if (n.cond && !palette) s.appendChild(renderBlock(n.cond)); else s.classList.add('is-empty');
      return s;
    }
    let input;
    if (pt.t === 'sel') {
      input = document.createElement('select');
      pt.o.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; input.appendChild(o); });
      input.value = n.p[pt.k];
    } else {
      input = document.createElement('input');
      input.type = pt.t === 'num' ? 'number' : 'text';
      if (pt.t === 'num') { input.min = pt.min; input.max = pt.max; input.step = 'any'; input.inputMode = 'decimal'; }
      input.value = n.p[pt.k];
      autosize(input);
    }
    input.className = 'blk-in';
    input.dataset.k = pt.k;
    if (palette) input.tabIndex = -1;
    input.addEventListener('input', () => {
      if (pt.t === 'num') {
        let v = parseFloat(input.value);
        if (!isNaN(v)) { v = Math.max(pt.min, Math.min(pt.max, v)); n.p[pt.k] = v; }
      } else n.p[pt.k] = input.value;
      if (input.tagName === 'INPUT') autosize(input);
      if (!palette) changed(false);
    });
    input.addEventListener('blur', () => { if (pt.t === 'num') input.value = n.p[pt.k]; });
    return input;
  }

  function autosize(input) { input.style.width = 'calc(' + Math.max(1.4, String(input.value).length + 0.6) + 'ch + 20px)'; }

  function renderWorkspace() {
    wsRoot.innerHTML = '';
    const hat = document.createElement('div');
    hat.className = 'blk hat';
    hat.innerHTML = '<div class="blk-row"><i class="hat-flag"></i><span class="blk-txt">Au départ</span></div>';
    const st = document.createElement('div');
    st.className = 'stack root-stack'; st.dataset.owner = 'root'; st.dataset.key = 'root';
    program.forEach(n => st.appendChild(renderBlock(n)));
    const wrap = document.createElement('div'); wrap.className = 'script';
    wrap.appendChild(hat); wrap.appendChild(st);
    wsRoot.appendChild(wrap);
    if (!program.length) {
      const e = document.createElement('div'); e.className = 'ws-empty';
      e.innerHTML = 'Glissez des blocs ici depuis la bibliothèque<br><small>ou touchez un bloc pour l\'ajouter à la fin</small>';
      st.appendChild(e);
    }
  }

  function renderPalette() {
    paletteCats.innerHTML = '';
    CATS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'pcat pcat-' + c.id + (c.id === currentCat ? ' is-active' : '');
      b.style.setProperty('--cc', c.color);
      b.innerHTML = '<i></i><span>' + c.label + '</span>';
      b.onclick = () => { currentCat = c.id; renderPalette(); };
      paletteCats.appendChild(b);
    });
    paletteList.innerHTML = '';
    const cat = CATS.find(c => c.id === currentCat);
    const h = document.createElement('div'); h.className = 'pal-title'; h.textContent = cat.label;
    paletteList.appendChild(h);
    let condHeader = false;
    Object.keys(DEFS).filter(t => DEFS[t].cat === currentCat).forEach(t => {
      if (DEFS[t].cond && !condHeader) {
        condHeader = true;
        const s = document.createElement('div'); s.className = 'pal-sub'; s.textContent = 'Conditions — à déposer dans un « si »';
        paletteList.appendChild(s);
      }
      paletteList.appendChild(renderBlock(make(t), true));
    });
  }

  // ---------------------------------------------------------------- glisser-déposer
  let drag = null;

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('input, select, textarea, button')) return;
    const el = e.target.closest('.blk');
    if (!el || el.classList.contains('hat') || running) return;
    const fromPalette = !!el.dataset.palette;
    drag = {
      el, fromPalette, id: el.dataset.id, type: el.dataset.type,
      x0: e.clientX, y0: e.clientY, started: false, pointerId: e.pointerId,
    };
    const r = el.getBoundingClientRect();
    drag.offX = e.clientX - r.left; drag.offY = e.clientY - r.top;
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.started = true;
      const ghost = drag.el.cloneNode(true);
      ghost.classList.add('ghost');
      ghost.style.width = drag.el.getBoundingClientRect().width + 'px';
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      if (!drag.fromPalette) drag.el.classList.add('drag-src');
      document.body.classList.add('is-dragging');
      try { drag.el.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - drag.offX}px, ${e.clientY - drag.offY}px)`;
    drag.target = findTarget(e.clientX, e.clientY);
    showTarget(drag.target);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag; drag = null;
    document.body.classList.remove('is-dragging');
    hideTarget();
    if (!d.started) {
      if (d.fromPalette) quickAdd(d.type);
      return;
    }
    d.ghost.remove();
    d.el.classList.remove('drag-src');
    const t = d.target;
    if (!t) return;
    if (t.kind === 'delete') {
      if (!d.fromPalette) { detach(d.id); changed(true); }
      return;
    }
    const node = d.fromPalette ? make(d.type) : detach(d.id);
    if (!node) return;
    if (t.kind === 'slot') {
      const owner = locate(t.owner).node;
      owner.cond = node;
    } else {
      const list = t.stack.dataset.owner === 'root' ? program : locate(t.stack.dataset.owner).node[t.stack.dataset.key];
      list.splice(Math.min(t.index, list.length), 0, node);
    }
    changed(true);
    flash(node.id);
  }

  function onPointerCancel() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    drag.el.classList.remove('drag-src');
    document.body.classList.remove('is-dragging');
    hideTarget();
    drag = null;
  }

  function findTarget(x, y) {
    const under = document.elementFromPoint(x, y);
    if (!under) return null;
    if (under.closest('#palette') || under.closest('#trash')) return { kind: 'delete' };
    const canvas = under.closest('#ws-canvas');
    if (!canvas) return null;
    const isCond = !!DEFS[drag.type].cond;

    if (isCond) {
      // emplacement hexagonal le plus proche sous le pointeur
      let slot = under.closest('.slot');
      if (slot && (!slot.dataset.owner || drag.el.contains(slot))) slot = null;
      if (!slot) {
        let best = null, bd = 40;
        wsRoot.querySelectorAll('.slot[data-owner]').forEach(s => {
          if (drag.el.contains(s)) return;
          const r = s.getBoundingClientRect();
          const dd = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
          if (dd < bd) { bd = dd; best = s; }
        });
        slot = best;
      }
      return slot ? { kind: 'slot', owner: slot.dataset.owner, el: slot } : null;
    }

    let stack = under.closest('.stack');
    if (stack && (!stack.dataset.owner || (!drag.fromPalette && drag.el.contains(stack)))) stack = null;
    if (!stack) {
      // au-dessus d'un bloc d'une pile ? sinon pile racine
      const blk = under.closest('.blk');
      stack = blk && blk.parentElement && blk.parentElement.classList.contains('stack') && !(!drag.fromPalette && drag.el.contains(blk.parentElement))
        ? blk.parentElement : wsRoot.querySelector('.root-stack');
    }
    const kids = [...stack.children].filter(c => c.classList.contains('blk') && c !== drag.el);
    let index = kids.length;
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      const mid = kids[i].classList.contains('is-c') ? r.top + 18 : r.top + r.height / 2;
      if (y < mid) { index = i; break; }
    }
    // index dans le modèle (en tenant compte du bloc déplacé)
    const all = [...stack.children].filter(c => c.classList.contains('blk'));
    const ref = kids[index];
    let modelIndex = ref ? all.indexOf(ref) : all.length;
    if (!drag.fromPalette) {
      const srcIdx = all.indexOf(drag.el);
      if (srcIdx !== -1 && srcIdx < modelIndex) modelIndex -= 1;
    }
    let lineY, lineX, lineW;
    const sr = stack.getBoundingClientRect();
    if (ref) lineY = ref.getBoundingClientRect().top - 3;
    else if (kids.length) lineY = kids[kids.length - 1].getBoundingClientRect().bottom + 1;
    else lineY = sr.top + 4;
    lineX = sr.left; lineW = Math.max(120, Math.min(sr.width, 260));
    return { kind: 'stack', stack, index: modelIndex, line: { x: lineX, y: lineY, w: lineW } };
  }

  function showTarget(t) {
    trashEl.classList.toggle('is-hot', !!t && t.kind === 'delete' && !drag.fromPalette);
    document.querySelectorAll('.slot.is-target').forEach(s => s.classList.remove('is-target'));
    dropLine.hidden = true;
    if (!t) return;
    if (t.kind === 'slot') t.el.classList.add('is-target');
    if (t.kind === 'stack') {
      dropLine.hidden = false;
      dropLine.style.transform = `translate(${t.line.x}px, ${t.line.y}px)`;
      dropLine.style.width = t.line.w + 'px';
    }
  }
  function hideTarget() {
    trashEl.classList.remove('is-hot');
    document.querySelectorAll('.slot.is-target').forEach(s => s.classList.remove('is-target'));
    dropLine.hidden = true;
  }

  function quickAdd(type) {
    const d = DEFS[type];
    const n = make(type);
    if (d.cond) {
      // place la condition dans le premier « si » vide
      const owner = findEmptySlot(program);
      if (!owner) { toast('Ajoutez d\'abord un bloc « si » ou « répéter jusqu\'à »'); return; }
      owner.cond = n;
    } else program.push(n);
    changed(true);
    flash(n.id);
  }
  function findEmptySlot(list) {
    for (const n of list) {
      if ('cond' in n && !n.cond) return n;
      for (const k of ['body', 'else']) if (n[k]) { const r = findEmptySlot(n[k]); if (r) return r; }
    }
    return null;
  }

  function flash(id) {
    const el = wsRoot.querySelector(`[data-id="${id}"]`);
    if (el) { el.classList.add('is-new'); setTimeout(() => el.classList.remove('is-new'), 500); }
  }

  // ---------------------------------------------------------------- génération de code
  function genCode() {
    const ind = s => s.split('\n').map(l => '    ' + l).join('\n');
    const g = {
      list: (l) => ind(l && l.length ? l.map(genNode).join('\n') : 'pass'),
      cond: (c) => c ? DEFS[c.type].code(c.p, c, g) : '???',
    };
    function genNode(n) { return DEFS[n.type].code(n.p, n, g); }
    return '# Programme généré depuis les blocs\nfrom kachow import *\n\ndef au_lancement():\n' + g.list(program) + '\n';
  }

  function highlightCode(src) {
    const esc = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc
      .replace(/(#.*)$/gm, '<span class="tk-c">$1</span>')
      .replace(/("[^"]*")/g, '<span class="tk-s">$1</span>')
      .replace(/\b(def|if|else|for|in|range|while|not|True|return|pass|from|import)\b/g, '<span class="tk-k">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tk-n">$1</span>');
  }

  // ---------------------------------------------------------------- interpréteur
  let running = null;
  class Abort extends Error {}

  function makeCtx(token) {
    const warned = {};
    const ctx = {
      sleep(ms) {
        return new Promise((res, rej) => {
          if (token.aborted) return rej(new Abort());
          const t = setTimeout(() => { token.wakers.delete(w); token.aborted ? rej(new Abort()) : res(); }, ms);
          const w = () => { clearTimeout(t); rej(new Abort()); };
          token.wakers.add(w);
        });
      },
      async move(cmd, seconds) {
        if (token.aborted) throw new Abort();
        R.drive(cmd);
        let bumped = false;
        const onBump = () => { bumped = true; };
        token.bumpWatch = onBump;
        try {
          const end = performance.now() + seconds * 1000;
          while (performance.now() < end && !bumped) await ctx.sleep(Math.min(40, end - performance.now()));
        } finally {
          token.bumpWatch = null;
          R.drive('stop');
        }
        await ctx.sleep(120);  // laisse le robot s'immobiliser
      },
      cond(c) {
        if (!c) { ctx.warnOnce('empty', 'Condition vide → considérée fausse.'); return false; }
        return !!DEFS[c.type].eval(c, ctx);
      },
      async list(l) { for (const n of (l || [])) await runNode(n, ctx, token); },
      log: (m, lvl) => UI.log(m, lvl || 'info'),
      warnOnce(k, m) { if (!warned[k]) { warned[k] = true; UI.log(m, 'warn'); } },
      end() { throw new Abort('end'); },
    };
    return ctx;
  }

  async function runNode(n, ctx, token) {
    if (token.aborted) throw new Abort();
    const el = wsRoot.querySelector(`[data-id="${n.id}"]`);
    wsRoot.querySelectorAll('.blk.is-running').forEach(b => b.classList.remove('is-running'));
    if (el) {
      el.classList.add('is-running');
      if (!DEFS[n.type].c) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    await DEFS[n.type].run(n, ctx);
    if (el && !DEFS[n.type].c) el.classList.remove('is-running');
  }

  async function run() {
    if (running) return;
    if (!program.length) { toast('Le programme est vide'); return; }
    const token = { aborted: false, wakers: new Set(), bumpWatch: null };
    running = token;
    UI.setRunning(true);
    UI.log('▶ Programme lancé (' + (R.state.mode === 'robot' ? 'robot' : 'simulateur') + ')', 'ok');
    const ctx = makeCtx(token);
    try {
      await ctx.list(program);
      UI.log('■ Programme terminé', 'ok');
    } catch (e) {
      if (e instanceof Abort) UI.log(e.message === 'end' ? '■ Programme arrêté par un bloc' : '■ Programme interrompu', 'warn');
      else { console.error(e); UI.log('Erreur : ' + e.message, 'err'); }
    } finally {
      R.stop();
      running = null;
      wsRoot.querySelectorAll('.blk.is-running').forEach(b => b.classList.remove('is-running'));
      UI.setRunning(false);
    }
  }

  function abort() {
    if (!running) return;
    running.aborted = true;
    running.wakers.forEach(w => w());
    running.wakers.clear();
    R.stop();
  }

  R.on('bump', () => { if (running && running.bumpWatch) running.bumpWatch(); });

  // ---------------------------------------------------------------- exemples
  function example(name) {
    const m = make;
    const c = (t, p, body, cond, els) => { const n = m(t, p); if (body) n.body = body; if (cond !== undefined) n.cond = cond; if (els) n.else = els; return n; };
    switch (name) {
      case 'square':
        return [
          m('ledOn', { c: 'vert' }),
          c('rep', { n: 4 }, [m('fwd', { d: 50 }), m('rotR', { a: 90 })]),
          m('ledOff'), m('say', { t: 'Carré terminé' }),
        ];
      case 'patrol':
        return [
          c('rep', { n: 12 }, [
            c('ifElse', {}, [m('beep', { ms: 200 }), m('back', { d: 10 }), m('rotL', { a: 90 })],
              m('cDist', { s: 'front', op: '<', v: 25 }),
              [m('fwd', { d: 20 })]),
          ]),
          m('say', { t: 'Patrouille terminée' }),
        ];
      case 'fetch':
        return [
          m('gOpen'),
          c('until', {}, [m('rotR', { a: 15 })], m('cObj', { l: 'balle' })),
          m('say', { t: 'Balle repérée' }),
          c('until', {}, [m('fwd', { d: 5 })], m('cDist', { s: 'front', op: '<', v: 4 })),
          m('gClose'), m('gLift', { o: 'up' }),
          m('ledOn', { c: 'bleu' }), m('say', { t: 'J\'ai la balle' }),
        ];
      case 'voice':
        return [
          m('say', { t: 'J\'écoute' }),
          c('ever', {}, [
            c('if', {}, [m('fwd', { d: 50 })], m('cWord', { w: 'avant' })),
            c('if', {}, [m('back', { d: 50 })], m('cWord', { w: 'arrière' })),
            c('if', {}, [m('rotR', { a: 90 })], m('cWord', { w: 'droite' })),
            c('if', {}, [m('rotL', { a: 90 })], m('cWord', { w: 'gauche' })),
            c('if', {}, [m('beep', { ms: 1000 }), m('end')], m('cWord', { w: 'stop' })),
          ]),
        ];
    }
    return [];
  }

  // ---------------------------------------------------------------- utilitaires UI
  let UI = { log() {}, setRunning() {}, toast() {} };
  function toast(m) { UI.toast(m); }

  function changed(rerender) {
    save();
    if (rerender) renderWorkspace();
    const code = document.getElementById('side-code');
    if (code) code.innerHTML = highlightCode(genCode());
  }

  function exportJSON() {
    const data = JSON.stringify({ app: 'kachow', version: 1, program }, (k, v) => k === 'id' ? undefined : v, 2);
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      a.download = 'programme-kachow.json';
      document.body.appendChild(a); a.click(); a.remove();
      toast('Programme exporté');
    } catch (e) {
      try { navigator.clipboard.writeText(data); toast('Programme copié dans le presse-papiers'); } catch (_) { toast('Export impossible ici'); }
    }
  }

  function importJSON(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const obj = JSON.parse(fr.result);
        const list = Array.isArray(obj) ? obj : obj.program;
        if (!Array.isArray(list)) throw new Error('format');
        if (!validList(list)) throw new Error('bloc inconnu');
        reId(list); program = list; changed(true); toast('Programme importé');
      } catch (e) { toast('Fichier invalide (' + e.message + ')'); }
    };
    fr.readAsText(file);
  }

  // ---------------------------------------------------------------- init
  function init(ui) {
    UI = ui;
    wsRoot = $('#ws-root'); paletteList = $('#palette-list'); paletteCats = $('#palette-cats'); trashEl = $('#trash');
    dropLine = document.createElement('div'); dropLine.className = 'drop-line'; dropLine.hidden = true;
    document.body.appendChild(dropLine);

    renderPalette();
    renderWorkspace();
    changed(false);

    document.addEventListener('pointerdown', e => { if (e.target.closest('#palette-list, #ws-root')) onPointerDown(e); });
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);

    $('#run-btn').onclick = run;
    $('#stop-btn').onclick = abort;
    $('#ws-clear').onclick = () => { if (running) return; program = []; changed(true); };
    $('#ws-export').onclick = exportJSON;
    $('#ws-import').onchange = e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; };
    $('#examples').onchange = e => {
      if (!e.target.value || running) return;
      program = example(e.target.value); changed(true);
      UI.log('Exemple chargé : ' + e.target.selectedOptions[0].textContent, 'info');
      e.target.value = '';
    };
  }

  window.Blocks = { init, run, abort, isRunning: () => !!running, DEFS };
})();
