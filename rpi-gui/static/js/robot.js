/* =====================================================================
 * KACHOW — couche robot
 * ---------------------------------------------------------------------
 * Fait le lien entre l'interface et :
 *   • le vrai robot, via Socket.IO vers app.py (événement 'move'),
 *   • un simulateur 2D (mode démo) qui sert aussi d'odométrie estimée.
 *
 * Contrat avec le back-end EXISTANT (inchangé) :
 *   client → serveur : 'move' { direction: forward|backward|left|right|stop }
 *   serveur → client : 'cpu_temp' { temp }
 *   flux vidéo       : GET /video_feed (MJPEG + YOLO)
 *
 * Événements OPTIONNELS écoutés (si app.py les émet un jour) :
 *   'telemetry'  { battery, dist_front, dist_back, heading,
 *                  bump: {front, back, left, right} }
 *   'detections' [ { label, conf } ]
 *   'voice'      { word }
 * Événement OPTIONNEL émis pour les fonctions pas encore câblées :
 *   'action'     { type, ... }   (ignoré sans danger par app.py actuel)
 * ===================================================================== */
(function () {
  'use strict';

  // Ce que le firmware ESP32 actuel sait faire (F/B/L/R/S).
  const FIRMWARE = { forward: 'F', backward: 'B', left: 'L', right: 'R', stop: 'S' };

  const CAPS = [
    { key: 'forward',  label: 'Avancer',              serial: 'F', ok: true },
    { key: 'backward', label: 'Reculer',              serial: 'B', ok: true },
    { key: 'left',     label: 'Rotation gauche',      serial: 'L', ok: true },
    { key: 'right',    label: 'Rotation droite',      serial: 'R', ok: true },
    { key: 'stop',     label: 'Arrêt',                serial: 'S', ok: true },
    { key: 'gripper',  label: 'Pince ouvrir / fermer / lever', serial: '—', ok: false },
    { key: 'led',      label: 'LED témoin',           serial: '—', ok: false },
    { key: 'audio',    label: 'Haut-parleur / synthèse vocale', serial: '—', ok: false },
    { key: 'sensors',  label: 'Télémétrie (HC-SR04, chocs, IMU, batterie)', serial: '—', ok: false },
  ];

  const CMD_LABEL = {
    forward: 'F · avant', backward: 'B · arrière', left: 'L · rotation gauche',
    right: 'R · rotation droite', stop: 'S · arrêt',
  };

  // ---------- préférences ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('kachow.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('kachow.' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
  };

  // ---------- monde simulé (cm) ----------
  const ARENA = { w: 300, h: 200 };
  const OBSTACLES = [
    { kind: 'rect', x: 55, y: 25, w: 46, h: 26 },
    { kind: 'rect', x: -95, y: 45, w: 34, h: 34 },
    { kind: 'rect', x: -20, y: 85, w: 90, h: 10 },
  ];
  const BALL = { x: 105, y: -55, r: 4, label: 'balle' };
  const ROBOT_R = 14;
  const START = { x: -60, y: -55, th: 0 };

  const listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, data) { (listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  const state = {
    mode: 'demo',          // 'robot' | 'demo'
    connected: false,
    transport: '—',
    cpu: null,
    battery: null,         // %
    camera: 'off',         // 'live' | 'off'
    cmd: 'stop',
    pose: { ...START },
    trail: [],
    dist: { front: null, back: null },
    bump: { front: false, back: false, left: false, right: false },
    heading: null,
    objects: [],
    word: null,            // { w, t }
    stimObject: '',
    gripper: { open: true, up: false },
    led: null,
    telemetry: false,
    ballHeld: false,
  };

  const cal = Object.assign({ lin: 25, rot: 90 }, store.get('cal', {}));
  const opts = Object.assign({ forceDemo: false, haptic: true, speech: true }, store.get('opts', {}));

  let socket = null;

  // ---------- Socket.IO ----------
  function connect() {
    if (opts.forceDemo || typeof window.io !== 'function' || location.protocol === 'file:') {
      setMode('demo'); return;
    }
    try {
      socket = window.io({ reconnection: true, timeout: 4000, transports: ['websocket', 'polling'] });
    } catch (e) { setMode('demo'); return; }

    socket.on('connect', () => {
      state.connected = true;
      state.transport = socket.io.engine && socket.io.engine.transport ? socket.io.engine.transport.name : 'websocket';
      setMode('robot');
      emit('log', { lvl: 'ok', msg: 'Connecté à la Raspberry Pi (' + location.host + ')' });
    });
    socket.on('disconnect', () => {
      state.connected = false;
      setMode('demo');
      emit('log', { lvl: 'warn', msg: 'Liaison perdue — bascule en simulateur. Le robot garde sa dernière commande : vérifiez qu\'il est arrêté.' });
    });
    socket.on('connect_error', () => { if (!state.connected) setMode('demo'); });

    socket.on('cpu_temp', d => { state.cpu = d && typeof d.temp === 'number' ? d.temp : null; emit('status'); });
    socket.on('telemetry', d => {
      if (!d) return;
      state.telemetry = true;
      if (d.battery != null) state.battery = d.battery;
      if (d.dist_front != null) state.dist.front = d.dist_front;
      if (d.dist_back != null) state.dist.back = d.dist_back;
      if (d.heading != null) state.heading = d.heading;
      if (d.bump) Object.assign(state.bump, d.bump);
      emit('status'); emit('sensors');
    });
    socket.on('detections', d => { state.objects = Array.isArray(d) ? d : []; emit('sensors'); });
    socket.on('voice', d => { if (d && d.word) heardWord(d.word); });
  }

  function setMode(m) {
    if (opts.forceDemo) m = 'demo';
    if (state.mode === m) { emit('status'); return; }
    state.mode = m;
    if (m === 'robot') {
      // l'odométrie repart de zéro, sans obstacles connus
      state.pose = { x: 0, y: 0, th: 0 }; state.trail = [];
      state.dist = { front: null, back: null }; state.heading = null;
    } else {
      state.pose = { ...START }; state.trail = []; state.ballHeld = false;
    }
    emit('mode', m); emit('status');
  }

  // ---------- commandes ----------
  function drive(cmd) {
    if (!FIRMWARE[cmd]) return;            // seulement F / B / L / R / S
    if (state.cmd === cmd) return;
    state.cmd = cmd;
    if (state.mode === 'robot' && socket && socket.connected) socket.emit('move', { direction: cmd });
    emit('cmd', cmd);
  }

  function stop() {
    state.cmd = '__';               // force l'envoi même si déjà à l'arrêt
    drive('stop');
    if (state.mode === 'robot' && socket && socket.connected) {
      setTimeout(() => socket.emit('move', { direction: 'stop' }), 60);  // redondance de sécurité
    }
  }

  function action(type, data) {
    data = data || {};
    if (type === 'gripper') {
      if (data.op === 'open') { state.gripper.open = true; state.ballHeld = false; }
      if (data.op === 'close') {
        state.gripper.open = false;
        if (state.mode === 'demo' && ballInReach()) state.ballHeld = true;
      }
      if (data.op === 'up') state.gripper.up = true;
      if (data.op === 'down') state.gripper.up = false;
    }
    if (type === 'led') state.led = data.color || null;
    if (state.mode === 'robot' && socket && socket.connected) socket.emit('action', Object.assign({ type }, data));
    emit('action', { type, data });
  }

  function heardWord(w) {
    state.word = { w: String(w).toLowerCase(), t: performance.now() };
    emit('log', { lvl: 'info', msg: 'Mot entendu : « ' + state.word.w + ' »' });
    emit('word', state.word.w);
  }

  // ---------- simulateur ----------
  function hitsObstacle(x, y, r) {
    if (x - r < -ARENA.w / 2 || x + r > ARENA.w / 2 || y - r < -ARENA.h / 2 || y + r > ARENA.h / 2) {
      const cx = Math.max(-ARENA.w / 2, Math.min(ARENA.w / 2, x));
      const cy = Math.max(-ARENA.h / 2, Math.min(ARENA.h / 2, y));
      // point de contact sur le mur
      let px = x, py = y;
      if (x - r < -ARENA.w / 2) px = -ARENA.w / 2; else if (x + r > ARENA.w / 2) px = ARENA.w / 2; else px = cx;
      if (y - r < -ARENA.h / 2) py = -ARENA.h / 2; else if (y + r > ARENA.h / 2) py = ARENA.h / 2; else py = cy;
      return { x: px, y: py };
    }
    for (const o of OBSTACLES) {
      const px = Math.max(o.x - o.w / 2, Math.min(o.x + o.w / 2, x));
      const py = Math.max(o.y - o.h / 2, Math.min(o.y + o.h / 2, y));
      if ((px - x) ** 2 + (py - y) ** 2 < r * r) return { x: px, y: py };
    }
    if (!state.ballHeld && (BALL.x - x) ** 2 + (BALL.y - y) ** 2 < (r + BALL.r - 6) ** 2) return { x: BALL.x, y: BALL.y };
    return null;
  }

  function pointBlocked(x, y) {
    if (Math.abs(x) > ARENA.w / 2 || Math.abs(y) > ARENA.h / 2) return true;
    for (const o of OBSTACLES) if (Math.abs(x - o.x) <= o.w / 2 && Math.abs(y - o.y) <= o.h / 2) return true;
    if (!state.ballHeld && (BALL.x - x) ** 2 + (BALL.y - y) ** 2 <= BALL.r * BALL.r) return true;
    return false;
  }

  function ray(x, y, th) {
    const dx = Math.sin(th), dy = Math.cos(th);
    for (let d = 0; d <= 400; d += 1) if (pointBlocked(x + dx * d, y + dy * d)) return d;
    return 400;
  }

  function ballInReach() {
    const p = state.pose;
    const fx = p.x + Math.sin(p.th) * 17, fy = p.y + Math.cos(p.th) * 17;
    return Math.hypot(BALL.x - fx, BALL.y - fy) < 9;
  }

  function relSide(px, py) {
    const p = state.pose;
    let a = Math.atan2(px - p.x, py - p.y) - p.th;
    a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const d = a * 180 / Math.PI;
    if (Math.abs(d) <= 45) return 'front';
    if (Math.abs(d) >= 135) return 'back';
    return d > 0 ? 'right' : 'left';
  }

  let last = performance.now();
  let bumpTimer = null;
  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const p = state.pose;
    let vF = 0, vS = 0, w = 0;
    switch (state.cmd) {
      case 'forward': vF = cal.lin; break;
      case 'backward': vF = -cal.lin; break;
      case 'left': w = -cal.rot; break;
      case 'right': w = cal.rot; break;
    }
    if (vF || vS || w) {
      const th = p.th + (w * Math.PI / 180) * dt;
      const nx = p.x + (Math.sin(p.th) * vF + Math.cos(p.th) * vS) * dt;
      const ny = p.y + (Math.cos(p.th) * vF - Math.sin(p.th) * vS) * dt;
      const hit = state.mode === 'demo' ? hitsObstacle(nx, ny, ROBOT_R) : null;
      if (hit && (vF || vS)) {
        const side = relSide(hit.x, hit.y);
        state.cmd = 'stop';
        state.bump[side] = true;
        emit('cmd', 'stop');
        emit('bump', side);
        clearTimeout(bumpTimer);
        bumpTimer = setTimeout(() => { state.bump = { front: false, back: false, left: false, right: false }; emit('sensors'); }, 1200);
      } else {
        p.x = nx; p.y = ny; p.th = th;
        const lt = state.trail[state.trail.length - 1];
        if (!lt || Math.hypot(lt.x - p.x, lt.y - p.y) > 2) {
          state.trail.push({ x: p.x, y: p.y });
          if (state.trail.length > 600) state.trail.shift();
        }
      }
    }
    if (state.mode === 'demo') {
      state.dist.front = ray(p.x + Math.sin(p.th) * 13, p.y + Math.cos(p.th) * 13, p.th);
      state.dist.back = ray(p.x - Math.sin(p.th) * 13, p.y - Math.cos(p.th) * 13, p.th + Math.PI);
      state.heading = ((p.th * 180 / Math.PI) % 360 + 360) % 360;
      // caméra simulée : cône de 60° devant le robot
      const objs = [];
      if (!state.ballHeld) {
        const d = Math.hypot(BALL.x - p.x, BALL.y - p.y);
        let a = Math.atan2(BALL.x - p.x, BALL.y - p.y) - p.th;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (d < 220 && Math.abs(a) < Math.PI / 6) objs.push({ label: BALL.label, conf: Math.max(0.5, 0.97 - d / 600) });
      }
      if (state.stimObject) objs.push({ label: state.stimObject, conf: 0.9 });
      state.objects = objs;
    } else if (!state.telemetry) {
      if (state.stimObject) state.objects = [{ label: state.stimObject, conf: 0.9 }];
    }
    emit('tick');
    requestAnimationFrame(step);
  }

  function resetPose() {
    state.pose = state.mode === 'demo' ? { ...START } : { x: 0, y: 0, th: 0 };
    state.trail = []; state.ballHeld = false;
    emit('tick');
  }

  // ---------- rendu de la carte ----------
  function drawMap(canvas, opt) {
    opt = opt || {};
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }
    const css = getComputedStyle(document.documentElement);
    const col = n => css.getPropertyValue(n).trim();
    const demo = state.mode === 'demo';
    const p = state.pose;

    const viewW = ARENA.w + 24, viewH = ARENA.h + 24;
    const s = Math.min(cw / viewW, ch / viewH);
    // en mode robot (odométrie), la vue suit le robot
    const ox = demo ? 0 : p.x, oy = demo ? 0 : p.y;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(s, -s);
    ctx.translate(-ox, -oy);

    // grille 10 cm / 50 cm
    const gx0 = Math.floor((ox - cw / s / 2) / 10) * 10, gx1 = ox + cw / s / 2;
    const gy0 = Math.floor((oy - ch / s / 2) / 10) * 10, gy1 = oy + ch / s / 2;
    ctx.lineWidth = 1 / s;
    for (let x = gx0; x <= gx1; x += 10) {
      ctx.strokeStyle = x % 50 === 0 ? col('--grid-strong') : col('--grid');
      ctx.beginPath(); ctx.moveTo(x, gy0); ctx.lineTo(x, gy1); ctx.stroke();
    }
    for (let y = gy0; y <= gy1; y += 10) {
      ctx.strokeStyle = y % 50 === 0 ? col('--grid-strong') : col('--grid');
      ctx.beginPath(); ctx.moveTo(gx0, y); ctx.lineTo(gx1, y); ctx.stroke();
    }

    if (demo) {
      ctx.strokeStyle = col('--line-strong'); ctx.lineWidth = 2 / s;
      ctx.strokeRect(-ARENA.w / 2, -ARENA.h / 2, ARENA.w, ARENA.h);
      ctx.fillStyle = col('--obstacle');
      for (const o of OBSTACLES) {
        ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
        ctx.strokeStyle = col('--line-strong'); ctx.lineWidth = 1 / s;
        ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      }
      if (!state.ballHeld) {
        ctx.fillStyle = col('--ball');
        ctx.beginPath(); ctx.arc(BALL.x, BALL.y, BALL.r, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // origine de l'odométrie
      ctx.strokeStyle = col('--line-strong'); ctx.lineWidth = 1.5 / s;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
    }

    // trace
    if (state.trail.length > 1) {
      ctx.strokeStyle = col('--trail'); ctx.lineWidth = 2 / s; ctx.lineJoin = 'round';
      ctx.setLineDash([4 / s, 4 / s]);
      ctx.beginPath(); ctx.moveTo(state.trail[0].x, state.trail[0].y);
      for (const t of state.trail) ctx.lineTo(t.x, t.y);
      ctx.stroke(); ctx.setLineDash([]);
    }

    // robot
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-p.th);
    // faisceaux ultrason
    if (demo) {
      ctx.fillStyle = col('--beam');
      for (const [dir, d] of [[1, state.dist.front], [-1, state.dist.back]]) {
        if (d == null) continue;
        const L = d + 13;
        ctx.beginPath(); ctx.moveTo(0, 13 * dir);
        ctx.lineTo(Math.tan(0.13) * L, L * dir); ctx.lineTo(-Math.tan(0.13) * L, L * dir); ctx.closePath(); ctx.fill();
      }
      // cône caméra
      ctx.fillStyle = col('--cam-cone');
      ctx.beginPath(); ctx.moveTo(0, 12);
      ctx.arc(0, 12, 70, Math.PI / 2 - Math.PI / 6, Math.PI / 2 + Math.PI / 6); ctx.closePath(); ctx.fill();
    }
    // roues mecanum
    ctx.fillStyle = col('--wheel');
    for (const [wx, wy] of [[-12, 8], [12, 8], [-12, -8], [12, -8]]) {
      ctx.fillRect(wx - 3, wy - 5, 6, 10);
    }
    // châssis
    const bump = Object.values(state.bump).some(Boolean);
    ctx.fillStyle = bump ? col('--danger') : col('--robot');
    roundRect(ctx, -9, -13, 18, 26, 3); ctx.fill();
    // pince
    ctx.strokeStyle = col('--robot-accent'); ctx.lineWidth = 2 / s * 1.4; ctx.lineCap = 'round';
    const g = state.gripper.open ? 5 : 2;
    ctx.beginPath(); ctx.moveTo(-4, 13); ctx.lineTo(-g, 19); ctx.moveTo(4, 13); ctx.lineTo(g, 19); ctx.stroke();
    if (state.ballHeld) { ctx.fillStyle = col('--ball'); ctx.beginPath(); ctx.arc(0, 17, 3.5, 0, Math.PI * 2); ctx.fill(); }
    // flèche de cap
    ctx.fillStyle = col('--robot-accent');
    ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(4, 2); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill();
    // LED
    if (state.led) {
      ctx.fillStyle = ({ rouge: '#ff4d4d', vert: '#3ddc84', bleu: '#4da3ff', jaune: '#ffd23f', blanc: '#ffffff' })[state.led] || '#fff';
      ctx.beginPath(); ctx.arc(0, -7, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.restore();

    if (!demo) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = col('--muted');
      ctx.font = '11px ' + col('--font-mono');
      ctx.fillText('Odométrie estimée (à partir des commandes envoyées)', 10, ch - 10);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // ---------- son ----------
  let actx = null;
  function beep(ms, freq) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = freq || 880;
      g.gain.value = 0.04;
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + (ms || 200) / 1000);
    } catch (e) { /* audio indisponible */ }
  }
  function say(text) {
    if (!opts.speech) return;
    try {
      const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR';
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch (e) { /* synthèse indisponible */ }
  }

  window.Robot = {
    state, cal, opts, CAPS, CMD_LABEL, FIRMWARE,
    on, emit, connect, drive, stop, action, heardWord, resetPose, drawMap, beep, say,
    saveCal() { store.set('cal', cal); },
    saveOpts() { store.set('opts', opts); },
    setForceDemo(v) {
      opts.forceDemo = v; store.set('opts', opts);
      if (v) setMode('demo');
      else if (socket && socket.connected) setMode('robot');
      else if (!socket) connect();
    },
    get socket() { return socket; },
    store,
    start() { connect(); requestAnimationFrame(step); },
  };
})();
