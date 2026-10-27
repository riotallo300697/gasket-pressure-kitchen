/*
 * Gasket's Pressure Kitchen: the page. Input, the loop, the screens and the HUD.
 *
 * Modes: ready (title screen) → playing ⇄ paused → blowout (the explosion plays)
 * → over (game-over screen) → playing again. Serving the shift's last order
 * stops on the won screen, from which the cook keeps cooking or starts over.
 */
(function () {
  'use strict';

  const Sim = window.GasketSim;
  const Art = window.GasketArt;
  const { TUNING } = Sim;
  const STEP = 1 / 120; // the game advances in fixed steps, whatever the frame rate
  const BLOWOUT_SCREEN_AFTER = 1.2; // seconds of explosion before the game-over screen
  const WIN_SCREEN_AFTER = 0.9;
  const KEY_GUARD = 0.5; // a screen ignores Space and Enter this long, so a panicked press can't skip it
  const MIN_PULL = 0.12; // seconds the lever stays down for any press, even one released at once

  const $ = (id) => document.getElementById(id);
  const ui = {
    room: $('room'),
    stage: $('stage'),
    canvas: $('scene'),
    score: $('score'),
    combo: $('combo'),
    comboFill: $('combo-fill'),
    status: $('status'),
    orderLabel: $('order-label'),
    dish: $('dish'),
    orderFill: $('order-fill'),
    served: $('served'),
    meter: $('psi'),
    psi: $('psi-value'),
    sound: $('sound'),
    start: $('start-screen'),
    startBest: $('start-best'),
    pause: $('pause-screen'),
    over: $('over-screen'),
    overScore: $('over-score'),
    overBest: $('over-best'),
    overStats: $('over-stats'),
    win: $('win-screen'),
    winScore: $('win-score'),
    winStats: $('win-stats'),
    announcer: $('announcer'),
  };

  const store = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (err) {
        return null; // storage blocked (private mode, file:// in some browsers): nothing remembered
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch (err) {
        /* see get() */
      }
    },
  };

  const media = (query) => Boolean(window.matchMedia && window.matchMedia(query).matches);
  const renderer = window.GasketRender.create(ui.canvas, {
    reducedMotion: media('(prefers-reduced-motion: reduce)'),
    touch: media('(pointer: coarse)'),
  });
  const audio = window.GasketAudio.create(store.get('gasket.muted') === '1');

  let game = Sim.createGame(newSeed());
  let mode = 'ready';
  let modeTime = 0;
  let best = Number(store.get('gasket.best')) || 0;
  let acc = 0;
  let last = performance.now();
  let wasVenting = false;
  let pullUntil = 0; // game time until which the last press holds the lever down
  const held = { key: false };
  const pointers = new Set();

  // ------------------------------------------------------------ the modes

  function setMode(next) {
    mode = next;
    modeTime = 0;
    ui.stage.dataset.mode = next;
    ui.start.hidden = next !== 'ready';
    ui.pause.hidden = next !== 'paused';
    ui.over.hidden = true; // the over and won screens appear after their animations
    ui.win.hidden = true;
    audio.suspend(next === 'paused');
  }

  function startGame() {
    audio.unlock();
    game = Sim.createGame(newSeed());
    renderer.reset();
    acc = 0;
    releaseAll();
    setMode('playing');
    audio.play('start');
    ui.canvas.focus({ preventScroll: true });
    announce(`Cooking. Keep the pressure between ${TUNING.zoneLow} and ${TUNING.zoneHigh} PSI.`);
  }

  function pause() {
    if (mode !== 'playing') return;
    releaseAll();
    setMode('paused');
    focusButton(ui.pause);
  }

  function resume() {
    if (mode !== 'paused') return;
    setMode('playing');
    ui.canvas.focus({ preventScroll: true });
  }

  function keepCooking() {
    if (mode !== 'won') return;
    setMode('playing');
    ui.canvas.focus({ preventScroll: true });
    announce('Overtime. The burner keeps climbing.');
  }

  function blowout() {
    releaseAll();
    setMode('blowout');
    const s = Sim.summary(game);
    const newBest = s.score > best;
    if (newBest) {
      best = s.score;
      store.set('gasket.best', best);
    }
    ui.overScore.textContent = formatScore(s.score);
    ui.overBest.textContent = newBest && s.score > 0 ? 'New best!' : `Best ${formatScore(best)}`;
    ui.overBest.classList.toggle('is-new', newBest && s.score > 0);
    fillStats(ui.overStats, s);
    announce(`Valve blowout. Game over. Final score ${formatScore(s.score)}.`);
  }

  function shiftComplete() {
    releaseAll();
    setMode('won');
    const s = Sim.summary(game);
    if (s.score > best) {
      best = s.score;
      store.set('gasket.best', best);
    }
    ui.winScore.textContent = formatScore(s.score);
    fillStats(ui.winStats, s);
    announce(`Shift complete! ${s.served} orders served. Score ${formatScore(s.score)}.`);
  }

  function onGameEvent(e) {
    renderer.event(e);
    audio.play(e.type, e);
    if (e.type === 'order-up') {
      bump(ui.score);
      bump(ui.dish.parentElement);
      announce(`Order up: ${e.dish}. Plus ${e.bonus} points.`);
    } else if (e.type === 'shift-complete') {
      shiftComplete();
    } else if (e.type === 'blowout') {
      blowout();
    }
  }

  // ------------------------------------------------------------ the loop

  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    modeTime += dt;

    if (mode === 'playing') {
      acc += dt;
      while (acc >= STEP && mode === 'playing') {
        const venting = held.key || pointers.size > 0 || game.time < pullUntil;
        if (venting && !wasVenting) audio.play('lever');
        wasVenting = venting;
        Sim.step(game, STEP, venting);
        acc -= STEP;
        for (const e of Sim.takeEvents(game)) onGameEvent(e);
      }
    } else {
      acc = 0;
      wasVenting = false;
    }

    if (mode === 'blowout' && modeTime >= BLOWOUT_SCREEN_AFTER) {
      setMode('over');
      ui.over.hidden = false;
      focusButton(ui.over);
    }
    if (mode === 'won' && ui.win.hidden && modeTime >= WIN_SCREEN_AFTER) {
      ui.win.hidden = false;
      focusButton(ui.win);
    }

    const band = Sim.band(game.psi);
    renderer.frame(dt, game, mode, Sim);
    followShake();
    audio.update(dt, game, mode, band);
    updateHud(band);
    window.requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------- the HUD

  const shown = {};

  function show(key, el, text) {
    if (shown[key] === text) return;
    shown[key] = text;
    el.textContent = text;
  }

  function setAttr(key, el, name, value) {
    if (shown[key] === value) return;
    shown[key] = value;
    el.setAttribute(name, value);
  }

  function updateHud(band) {
    show('score', ui.score, formatScore(game.score));
    show('combo', ui.combo, `×${game.combo}`);
    setAttr('combo-fill', ui.comboFill, 'style', `transform: scaleX(${step(Sim.comboProgress(game), 50)})`);
    setAttr('combo-level', ui.combo, 'data-level', String(game.combo));

    const [text, tone] = statusFor(band);
    show('status', ui.status, text);
    setAttr('status-tone', ui.status, 'data-tone', tone);

    const order = game.order;
    const overtime = order.number > TUNING.shiftOrders;
    show('order', ui.orderLabel, overtime ? `Order ${pad(order.number, 2)} · overtime` : `Order ${pad(order.number, 2)} / ${pad(TUNING.shiftOrders, 2)}`);
    show('dish', ui.dish, order.dish);
    setAttr('order-fill', ui.orderFill, 'style', `transform: scaleX(${step(order.cooked / order.cookTime, 100)})`);
    show('served', ui.served, `Served ${game.served} · Best ${formatScore(best)}`);

    const psi = mode === 'ready' ? 0 : Math.round(game.psi);
    show('psi', ui.psi, pad(psi, 3));
    setAttr('psi-now', ui.meter, 'aria-valuenow', String(psi));
    setAttr('psi-band', ui.meter, 'data-band', mode === 'ready' ? 'low' : band);
  }

  // A share rounded to so many steps, as a string: bars move in steps a player can see, not every frame.
  function step(share, steps) {
    return String(Math.round(Math.min(1, Math.max(0, share)) * steps) / steps);
  }

  function statusFor(band) {
    if (mode === 'ready') return ['Press Space to start', 'idle'];
    if (mode === 'paused') return ['Paused', 'idle'];
    if (mode === 'blowout' || mode === 'over') return ['Valve blowout!', 'critical'];
    if (mode === 'won') return ['Shift complete!', 'zone'];
    const surge = game.surge.stage;
    if (band === 'critical') return ['Valve critical — vent now!', 'critical'];
    if (surge === 'warning') return ['Surge incoming — vent early', 'hot'];
    if (band === 'hot') return ['Too hot — vent steam!', 'hot'];
    if (surge === 'surge') return ['Burner surge — hold the lever', 'hot'];
    if (band === 'zone') return ['In the zone — cooking', 'zone'];
    return ['Too low — let it build', 'low'];
  }

  function fillStats(list, s) {
    const rows = [
      ['Orders served', String(s.served)],
      ['In the zone', `${Math.round(s.zoneShare * 100)}%`],
      ['Best combo', `×${s.bestCombo}`],
      ['Time cooking', formatTime(s.time)],
    ];
    list.replaceChildren(
      ...rows.map(([term, value]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = term;
        dd.textContent = value;
        row.append(dt, dd);
        return row;
      })
    );
  }

  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth; // restart the animation
    el.classList.add('bump');
  }

  function announce(text) {
    ui.announcer.textContent = text;
  }

  function focusButton(screen) {
    const button = screen.querySelector('button');
    if (button) button.focus({ preventScroll: true });
  }

  // ----------------------------------------------------------- the input

  const isSpace = (e) => e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const space = isSpace(e);
    if (space || e.key === 'Enter') {
      e.preventDefault(); // Space never scrolls, and buttons answer through here, after the guard
      if (e.repeat) return;
      if (mode !== 'playing') {
        if (!screenReady()) return;
        if (e.target instanceof HTMLButtonElement) e.target.click();
        else screenAction();
      } else if (!space && e.target === ui.sound) {
        toggleSound();
      }
      // A Space that starts or resumes the game pulls the lever too, for as long as it is held.
      if (space && mode === 'playing') {
        held.key = true;
        pull();
      }
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (mode === 'playing') pause();
      else if (mode === 'paused') resume();
    } else if (e.key === 'm' || e.key === 'M') {
      toggleSound();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (!isSpace(e)) return;
    e.preventDefault();
    held.key = false;
  });

  // Whether the screen on show takes Space and Enter yet.
  function screenReady() {
    if (mode === 'over') return modeTime >= KEY_GUARD;
    if (mode === 'won') return !ui.win.hidden && modeTime >= WIN_SCREEN_AFTER + KEY_GUARD;
    return mode === 'ready' || mode === 'paused';
  }

  // Space or Enter on a screen: its main action.
  function screenAction() {
    if (mode === 'ready' || mode === 'over') startGame();
    else if (mode === 'paused') resume();
    else if (mode === 'won') keepCooking();
  }

  // Click, touch or pen anywhere on the room pulls the lever.
  ui.canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (mode !== 'playing') return;
    pointers.add(e.pointerId);
    pull();
    try {
      ui.canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* the pointer is already gone */
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    ui.canvas.addEventListener(type, (e) => pointers.delete(e.pointerId));
  }
  ui.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  ui.start.addEventListener('click', startGame);
  ui.pause.addEventListener('click', resume);
  $('again-button').addEventListener('click', startGame);
  $('keep-button').addEventListener('click', keepCooking);
  $('win-again-button').addEventListener('click', startGame);
  ui.sound.addEventListener('click', toggleSound);
  ui.sound.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus off it, Space stays the lever

  // Any press moves the lever, however short: a tap is a short burst of steam.
  function pull() {
    pullUntil = game.time + MIN_PULL;
  }

  function releaseAll() {
    held.key = false;
    pointers.clear();
    pullUntil = 0;
  }

  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  function toggleSound() {
    audio.unlock();
    audio.setMuted(!audio.isMuted());
    store.set('gasket.muted', audio.isMuted() ? '1' : '0');
    renderSound();
  }

  function renderSound() {
    const on = !audio.isMuted();
    ui.sound.textContent = on ? 'Sound on' : 'Sound off';
    ui.sound.setAttribute('aria-pressed', String(on));
  }

  // ------------------------------------------------------------- the stage

  // The readout sits on the gauge, over the canvas: it shakes with it.
  let readoutBase = '';
  let readoutShaken = '';
  function followShake() {
    const s = renderer.shake();
    const moved = s.x || s.y ? `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) ` : '';
    const transform = moved + readoutBase;
    if (transform !== readoutShaken) {
      readoutShaken = transform;
      ui.meter.style.transform = transform;
    }
  }

  // Upright screens (phones held upright) get the tall layout, as tall as their shape allows;
  // the others the wide one. The stage then scales to fit the window.
  function fit() {
    const w = ui.room.clientWidth;
    const h = ui.room.clientHeight;
    const layout = w / h < 0.85 ? Art.tallLayout(Math.round(Math.min(1100, Math.max(800, (450 * h) / w)))) : Art.wideLayout();
    const scale = Math.min(w / layout.width, h / layout.height);
    ui.stage.dataset.layout = layout.name;
    ui.stage.dataset.compact = String(layout.name === 'wide' && scale < 0.8); // a phone held sideways: bigger type
    ui.stage.style.width = `${layout.width}px`;
    ui.stage.style.height = `${layout.height}px`;
    ui.stage.style.setProperty('--scale', String(scale));
    const readout = Art.toStage(layout.gauge, Art.READOUT.x, Art.READOUT.y);
    ui.meter.style.left = `${readout.x}px`;
    ui.meter.style.top = `${readout.y}px`;
    readoutBase = `scale(${layout.gauge.k})`;
    readoutShaken = '';
    // At most 2 device pixels per stage pixel: sharp enough, and cheap on big screens.
    renderer.resize(layout, scale, Math.min(2 / scale, window.devicePixelRatio || 1));
  }

  // ------------------------------------------------------------- helpers

  function newSeed() {
    return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  }

  function formatScore(n) {
    return Math.floor(n).toLocaleString('en-US');
  }

  function formatTime(seconds) {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function pad(n, width) {
    return String(n).padStart(width, '0');
  }

  window.addEventListener('resize', fit);
  fit();
  renderSound();
  ui.startBest.textContent = best > 0 ? `Best ${formatScore(best)}` : '';
  setMode('ready');
  focusButton(ui.start);
  window.requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
})();
