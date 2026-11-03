/* =====================================================================
 * KACHOW — interface : onglets, pilotage, indicateurs, réglages
 * ===================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const R = window.Robot;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const S = R.state;

  // ------------------------------------------------------------ journal
  const logs = [$('#log-drive'), $('#log-prog')];
  function log(msg, lvl) {
    const t = new Date().toLocaleTimeString('fr-FR', { hour12: false });
    logs.forEach(ol => {
      if (!ol) return;
      const li = document.createElement('li');
      li.className = 'lvl-' + (lvl || 'info');
      li.innerHTML = '<time>' + t + '</time><span></span>';
      li.lastChild.textContent = msg;
      ol.appendChild(li);
      while (ol.children.length > 200) ol.firstChild.remove();
      ol.scrollTop = ol.scrollHeight;
    });
  }
  $$('[data-clear-log]').forEach(b => b.onclick = () => logs.forEach(l => l && (l.innerHTML = '')));
  R.on('log', d => log(d.msg, d.lvl));

  let toastT;
  function toast(m) {
    const t = $('#toast'); t.textContent = m; t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2200);
  }

  // ------------------------------------------------------------ onglets (#pilotage, #programmation, #reglages)
  const VIEW_HASH = { drive: 'pilotage', program: 'programmation', settings: 'reglages' };
  const HASH_VIEW = Object.fromEntries(Object.entries(VIEW_HASH).map(([a, b]) => [b, a]));
  let view = 'drive';
  function showView(v, push) {
    view = v;
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === v));
    $$('.view').forEach(s => s.classList.toggle('is-active', s.id === 'view-' + v));
    if (push) { try { history.replaceState(null, '', '#' + VIEW_HASH[v]); } catch (e) { location.hash = VIEW_HASH[v]; } }
    if (v !== 'drive') releasePad();
    placeCamera();
  }
  $$('.tab').forEach(t => t.onclick = () => showView(t.dataset.view, true));
  window.addEventListener('hashchange', () => { const v = HASH_VIEW[location.hash.slice(1)]; if (v) showView(v); });

  // segmented controls
  function seg(id, fn) {
    const el = $(id);
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      el.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
      fn(b.dataset.v);
    });
    return v => { el.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x.dataset.v === v)); fn(v); };
  }
  const setVision = seg('#vision-seg', v => { $('#cam-wrap').hidden = v !== 'cam'; $('#map-wrap').hidden = v !== 'map'; });
  let sideView = 'view';
  seg('#side-seg', v => { sideView = v; $('#side-view').hidden = v !== 'view'; $('#side-code').hidden = v !== 'code'; placeCamera(); });

  // un seul flux MJPEG (YOLO tourne une seule fois sur la RPi) : on déplace le même élément
  const camModule = $('#cam-module');
  function placeCamera() {
    const host = (view === 'program' && sideView === 'view' && S.mode === 'robot') ? $('#side-cam') : $('#cam-wrap');
    if (camModule.parentElement !== host) host.appendChild(camModule);
  }

  // thème clair / sombre (« auto » suit le réglage du système)
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  let themePref = R.store.get('themePref', document.documentElement.dataset.defaultTheme || 'dark');
  function applyTheme(pref) {
    themePref = pref; R.store.set('themePref', pref);
    const t = pref === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : pref;
    document.documentElement.dataset.theme = t;
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'light' ? '#f7efe4' : '#120a07';
    $$('#theme-pick button').forEach(b => b.classList.toggle('is-active', b.dataset.t === pref));
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (themePref === 'auto') applyTheme('auto'); });
  $('#theme-btn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next); toast(next === 'light' ? 'Thème clair' : 'Thème sombre');
  };
  $('#theme-pick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) applyTheme(b.dataset.t); });
  applyTheme(themePref);

  // ------------------------------------------------------------ caméra
  const img = $('#camera-feed');
  function setCamera(on) {
    if (on && img.dataset.src && S.mode === 'robot') {
      if (document.readyState !== 'complete') {      // flux MJPEG infini : on attend la fin du chargement de la page
        window.addEventListener('load', () => setCamera(S.mode === 'robot'), { once: true });
        return;
      }
      if (!img.getAttribute('src')) {
        img.onerror = () => { S.camera = 'off'; updateStatus(); camModule.classList.add('is-off'); };
        img.onload = () => { S.camera = 'live'; updateStatus(); camModule.classList.remove('is-off'); };
        img.src = img.dataset.src;
        S.camera = 'wait';
      }
      camModule.classList.remove('is-off');
    } else {
      img.removeAttribute('src');
      S.camera = 'off';
      camModule.classList.add('is-off');
    }
  }

  // ------------------------------------------------------------ statut
  function updateStatus() {
    const robot = S.mode === 'robot';
    const link = $('#chip-link');
    link.dataset.state = robot ? 'ok' : (R.opts.forceDemo ? 'idle' : 'warn');
    $('#st-link').textContent = robot ? 'Robot' : 'Démo';

    const b = S.battery;
    $('#st-batt').textContent = b == null ? '—' : Math.round(b) + ' %';
    $('#batt-fill').style.width = (b == null ? 0 : Math.max(4, Math.min(100, b))) + '%';
    $('#chip-batt').dataset.state = b == null ? 'idle' : b < 20 ? 'err' : b < 40 ? 'warn' : 'ok';

    const c = S.cpu;
    $('#st-cpu').textContent = c == null ? '—' : c.toFixed(1) + ' °C';
    $('#chip-cpu').dataset.state = c == null ? 'idle' : c >= 80 ? 'err' : c >= 70 ? 'warn' : 'ok';

    $('#st-cam').textContent = S.camera === 'live' ? 'Live' : S.camera === 'wait' ? '…' : 'Off';
    $('#chip-cam').dataset.state = S.camera === 'live' ? 'ok' : S.camera === 'wait' ? 'warn' : 'idle';

    $('#mode-banner').hidden = robot;
    document.body.dataset.mode = S.mode;
    $('#sensor-src').textContent = 'source : ' + (robot ? (S.telemetry ? 'télémétrie robot' : 'odométrie estimée') : 'simulateur');
    $('#kv-mode').textContent = robot ? 'Robot réel (Socket.IO → USB série → ESP32)' : 'Démo (simulateur local)';
    $('#kv-transport').textContent = robot ? 'Socket.IO / ' + (S.transport || 'websocket') : '—';
  }
  R.on('status', updateStatus);
  R.on('mode', m => {
    setCamera(m === 'robot');
    setVision(m === 'robot' ? 'cam' : 'map');   // en réel : caméra seule, pas de carte
    placeCamera();
    $('#opt-demo').checked = R.opts.forceDemo;
    if (m === 'demo') log('Mode démo : commandes envoyées au simulateur', 'info');
  });

  // ------------------------------------------------------------ pavé de commande
  const pad = $('#pad');
  let padCmd = null, padBtn = null, padPointer = null;

  function press(cmd, btn) {
    if (window.Blocks && Blocks.isRunning()) { toast('Un programme est en cours — arrêtez-le d\'abord'); return; }
    if (padCmd === cmd) return;
    if (padBtn) padBtn.classList.remove('is-pressed');
    padCmd = cmd; padBtn = btn;
    if (btn) btn.classList.add('is-pressed');
    if (R.opts.haptic && navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* rien */ } }
    R.drive(cmd);
  }
  function releasePad() {
    if (padBtn) padBtn.classList.remove('is-pressed');
    if (padCmd && padCmd !== 'stop') R.drive('stop');
    padCmd = null; padBtn = null; padPointer = null;
  }

  pad.addEventListener('pointerdown', e => {
    const b = e.target.closest('.pad-btn'); if (!b) return;
    e.preventDefault();
    padPointer = e.pointerId;
    try { b.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
    if (b.dataset.cmd === 'stop') { emergencyStop(); return; }
    press(b.dataset.cmd, b);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev =>
    pad.addEventListener(ev, e => { if (e.pointerId === padPointer) releasePad(); }));
  pad.addEventListener('contextmenu', e => e.preventDefault());

  // clavier
  // touches par caractère (AZERTY et QWERTY) + flèches
  const KEYS = {
    ArrowUp: 'forward', z: 'forward', w: 'forward',
    ArrowDown: 'backward', s: 'backward',
    ArrowLeft: 'left', q: 'left',
    ArrowRight: 'right', d: 'right',
  };
  const keyOf = e => e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const held = new Set();
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); emergencyStop(); return; }
    if (view !== 'drive' || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = keyOf(e), cmd = KEYS[k]; if (!cmd) return;
    e.preventDefault();
    if (e.repeat) return;
    held.add(k);
    press(cmd, pad.querySelector(`[data-cmd="${cmd}"]`));
  });
  window.addEventListener('keyup', e => {
    const k = keyOf(e);
    if (!held.has(k)) return;
    held.delete(k);
    if (!held.size) releasePad();
    else { const last = [...held].pop(); press(KEYS[last], pad.querySelector(`[data-cmd="${KEYS[last]}"]`)); }
  });
  // sécurité : on coupe si la page perd le focus
  window.addEventListener('blur', () => { held.clear(); releasePad(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { held.clear(); releasePad(); } });

  R.on('cmd', c => {
    $('#cmd-now').textContent = R.CMD_LABEL[c] || c;
    $('#cmd-now').dataset.moving = c !== 'stop';
  });

  function emergencyStop() {
    if (window.Blocks) Blocks.abort();
    held.clear();
    releasePad();
    R.stop();
    const b = $('#estop'); b.classList.add('is-hit'); setTimeout(() => b.classList.remove('is-hit'), 300);
    log('Arrêt d\'urgence', 'err');
  }
  $('#estop').onclick = emergencyStop;

  // collision
  const SIDE_FR = { front: 'avant', back: 'arrière', left: 'gauche', right: 'droite' };
  R.on('bump', side => {
    log('Collision ' + SIDE_FR[side] + ' — mouvement interrompu', 'err');
    R.beep(1000, 880);
    setTimeout(() => R.say('Collision ' + SIDE_FR[side]), 1050);
    if (padCmd) releasePad();
  });

  // ------------------------------------------------------------ capteurs
  let lastSensors = 0;
  function updateSensors() {
    const fmt = d => d == null ? '—' : (d >= 400 ? '> 400' : Math.round(d)) + ' cm';
    const pct = d => d == null ? 0 : Math.max(0, Math.min(100, 100 - d / 2));
    for (const [k, id] of [['front', 's-dfront'], ['back', 's-dback']]) {
      const d = S.dist[k];
      $('#' + id).textContent = fmt(d);
      const bar = $('#' + id + '-bar');
      bar.style.width = pct(d) + '%';
      bar.dataset.level = d == null ? '' : d < 15 ? 'err' : d < 35 ? 'warn' : 'ok';
    }
    $$('#bumpers i').forEach(i => i.classList.toggle('is-on', !!S.bump[i.dataset.side]));
    const h = S.heading != null ? S.heading : ((S.pose.th * 180 / Math.PI) % 360 + 360) % 360;
    $('#s-heading').textContent = Math.round(h) + '°';
    $('#compass-needle').style.transform = `rotate(${h}deg)`;
    const det = S.objects.map(o => o.label + ' ' + Math.round(o.conf * 100) + '%').join(' · ');
    $('#hud-det').textContent = det || 'aucun objet';
    const pose = `x ${Math.round(S.pose.x)} · y ${Math.round(S.pose.y)} · θ ${Math.round(h)}°`;
    $('#pose-drive').textContent = pose; $('#pose-prog').textContent = pose;
  }
  R.on('sensors', updateSensors);

  const mapDrive = $('#map-drive'), mapProg = $('#map-prog');
  R.on('tick', () => {
    const now = performance.now();
    if (now - lastSensors > 100) { lastSensors = now; updateSensors(); }
    if (S.mode !== 'demo') return;               // pas de carte sur le robot réel
    if (view === 'drive' && !$('#map-wrap').hidden) R.drawMap(mapDrive);
    if (view === 'program' && sideView === 'view') R.drawMap(mapProg);
  });
  $('#reset-pose').onclick = () => { R.resetPose(); log('Position réinitialisée', 'info'); };

  // ------------------------------------------------------------ stimuli (tests des conditions)
  $('#stim-object').onchange = e => { S.stimObject = e.target.value; };
  $('#stim-words').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    R.heardWord(b.dataset.w);
    b.classList.add('is-hit'); setTimeout(() => b.classList.remove('is-hit'), 300);
  });

  // ------------------------------------------------------------ réglages
  $('#kv-url').textContent = location.protocol.startsWith('http') ? location.origin : '— (fichier local)';
  const wifi = R.store.get('wifi', 'ap');
  $$('#wifi-mode input').forEach(r => { r.checked = r.value === wifi; r.onchange = () => R.store.set('wifi', r.value); });

  for (const [id, k] of [['#cal-lin', 'lin'], ['#cal-rot', 'rot']]) {
    const el = $(id); el.value = R.cal[k];
    el.onchange = () => { const v = parseFloat(el.value); if (v > 0) { R.cal[k] = v; R.saveCal(); toast('Calibration enregistrée'); } else el.value = R.cal[k]; };
  }
  $('#cal-test').onclick = async () => {
    if (Blocks.isRunning()) return;
    const ms = 50 / R.cal.lin * 1000;
    log(`Test calibration : avance ${(ms / 1000).toFixed(2)} s — mesurez la distance réelle`, 'info');
    R.drive('forward');
    setTimeout(() => { R.drive('stop'); log('Test terminé. Ajustez la vitesse linéaire si la distance ≠ 50 cm.', 'ok'); }, ms);
  };

  const caps = $('#caps-table');
  caps.innerHTML = '<thead><tr><th>Fonction</th><th>Série</th><th>État</th></tr></thead><tbody>' +
    R.CAPS.map(c => `<tr><td>${c.label}</td><td><code>${c.serial}</code></td><td><span class="tag ${c.ok ? 'tag-ok' : 'tag-sim'}">${c.ok ? 'firmware' : 'à venir'}</span></td></tr>`).join('') +
    '</tbody>';

  $('#opt-demo').checked = R.opts.forceDemo;
  $('#opt-demo').onchange = e => R.setForceDemo(e.target.checked);
  $('#opt-haptic').checked = R.opts.haptic;
  $('#opt-haptic').onchange = e => { R.opts.haptic = e.target.checked; R.saveOpts(); };
  $('#opt-speech').checked = R.opts.speech;
  $('#opt-speech').onchange = e => { R.opts.speech = e.target.checked; R.saveOpts(); };

  // ------------------------------------------------------------ programmation
  Blocks.init({
    log,
    toast,
    setRunning(on) {
      $('#run-btn').disabled = on;
      $('#stop-btn').disabled = !on;
      $('#run-state').textContent = on ? 'En cours…' : 'Prêt';
      $('#run-state').dataset.on = on;
      document.body.classList.toggle('is-running', on);
    },
  });

  // ------------------------------------------------------------ démarrage
  setCamera(false);
  setVision('map');
  { const v = HASH_VIEW[location.hash.slice(1)]; if (v) showView(v); }
  updateStatus();
  R.start();
  log('Interface prête', 'ok');
});
