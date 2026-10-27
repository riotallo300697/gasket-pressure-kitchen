/*
 * Gasket's Pressure Kitchen: everything drawn on the canvas.
 *
 * The scene is laid out on a 1280×720 stage. What never moves (the wall, the
 * pipes, the gauge's face) is painted once per canvas size into a cache; the
 * needle, the pod, the lever, Gasket, the flames and the steam every frame.
 * The renderer keeps its own visual state (the needle's spring, particles,
 * shake), fed by the game's events; it never changes the game.
 */
(function (root) {
  'use strict';

  const W = 1280;
  const H = 720;
  const FLOOR = 604;
  const DEG = Math.PI / 180;
  const TAU = Math.PI * 2;

  // Warm only: no blue or purple anywhere in the room.
  const COLORS = {
    bg: '#0D0908',
    panel: '#140D0B',
    seam: '#1E1512',
    rivet: '#2E221D',
    metalDark: '#241B17',
    metal: '#3E312A',
    metalLight: '#6A564B',
    cream: '#F3EEE9',
    creamShade: '#D3C7BD',
    muted: '#A8968A',
    heat: '#F05A18',
    amber: '#FFB35C',
    ember: '#8A3510',
    danger: '#E8391D',
  };
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

  // Where things stand on the stage.
  const GAUGE = { x: 292, y: 372, r: 150 };
  const POD = { x: 628, y: 580, s: 7 }; // the pod's feet; one unit of the Hotpod mark is s px
  const LEVER = { x: 880, y: 480, length: 130, closed: -35 * DEG, open: 30 * DEG };
  const GASKET = { x: 1100, y: FLOOR };
  const SHOULDER = { x: -34, y: -140 }; // Gasket's lever arm, from his feet
  const ARM = 58; // upper arm and forearm
  const BEACONS = [
    { x: 452, y: 150 },
    { x: 804, y: 150 },
  ];

  // The pod is the Hotpod mark (the site's favicon), drawn in its own 64-unit grid.
  const MARK = {
    lid: 'M18 24.5C19.2 14 44.8 14 46 24.5Z',
    body: 'M14 26.5H50L51 40C51 49 43 52.5 32 52.5S13 49 13 40Z',
    legs: 'M18.5 50.5L21.5 51.6L16.8 60H12.5ZM45.5 50.5L42.5 51.6L47.2 60H51.5Z',
    band: 'M13.4 31.2C24 33.8 40 33.8 50.6 31.2',
  };
  const VALVE = markPoint(32, 4.6); // where the steam leaves the pod
  const LID_CENTER = markPoint(32, 21);

  function markPoint(mx, my) {
    return { x: POD.x + (mx - 32) * POD.s, y: POD.y + (my - 60) * POD.s };
  }

  function psiAngle(psi) {
    return (135 + (270 * psi) / 100) * DEG;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  function create(canvas, options) {
    const ctx = canvas.getContext('2d');
    const reducedMotion = Boolean(options && options.reducedMotion);
    const paths = {};
    for (const key of Object.keys(MARK)) paths[key] = new Path2D(MARK[key]);

    let scale = 1; // device pixels per stage pixel
    let cache = null; // the static room
    let vignette = null;
    let alarmGlow = null;
    const sprites = {
      puff: makePuff(128, '243, 238, 233'),
      soot: makePuff(128, '28, 20, 17'),
      glow: makeGlow(256, '240, 90, 24'),
      hot: makeGlow(256, '255, 179, 92'),
    };

    const fx = {};
    const cracks = makeCracks();
    let pulledOnce = false; // the lever hint shows until the first pull of the visit

    function reset() {
      Object.assign(fx, {
        t: 0,
        needle: 0,
        needleSpeed: 0,
        shake: 0,
        flash: 0,
        particles: [],
        popups: [],
        steamDue: 0,
        leakDue: 0,
        smokeDue: 0,
        lid: null, // the lid in flight after a blowout
        hat: null, // Gasket's toque in flight
        blown: false,
        soot: 0,
        cheer: 0,
        celebrate: 0,
        surgeFlare: 0,
        ringPulse: 0,
        portFlash: 0,
        blink: 0,
        nextBlink: 2,
        bubbleText: '',
        bubbleAge: 0,
        orderUp: 0,
        lastLever: 0,
        hint: 0,
        brink: 0,
      });
    }
    reset();

    function resize(stageScale, dpr) {
      scale = stageScale * dpr;
      canvas.width = Math.max(1, Math.round(W * scale));
      canvas.height = Math.max(1, Math.round(H * scale));
      cache = paintToCanvas((c) => paintRoom(c));
      vignette = paintToCanvas((c) => paintVignette(c, 'rgba(5, 3, 2, 0.78)', 300));
      alarmGlow = paintToCanvas((c) => paintVignette(c, 'rgba(232, 57, 29, 0.9)', 380));
    }

    function paintToCanvas(paint) {
      const layer = makeCanvas(canvas.width, canvas.height);
      const c = layer.getContext('2d');
      c.setTransform(scale, 0, 0, scale, 0, 0);
      paint(c);
      return layer;
    }

    // ---------------------------------------------------------------- events

    function event(e) {
      switch (e.type) {
        case 'combo':
          popup(`×${e.combo} COMBO`, GAUGE.x, GAUGE.y - GAUGE.r - 42, COLORS.amber, 28);
          fx.ringPulse = 1;
          break;
        case 'combo-lost':
          popup('COMBO LOST', GAUGE.x, GAUGE.y - GAUGE.r - 42, COLORS.muted, 18);
          break;
        case 'order-up':
          popup(`+${e.bonus}  ORDER UP!`, POD.x, POD.y - 300, COLORS.amber, 26);
          fx.cheer = 1.6;
          fx.orderUp = 1.6;
          fx.portFlash = 1;
          puffRing(LID_CENTER.x, LID_CENTER.y + 20, 26);
          break;
        case 'shift-complete':
          fx.celebrate = 4;
          fx.cheer = 4;
          confetti(150);
          break;
        case 'surge-warning':
          popup('SURGE INCOMING', POD.x, POD.y - 10, COLORS.amber, 18);
          break;
        case 'surge':
          fx.shake = Math.max(fx.shake, 7);
          fx.surgeFlare = 1;
          break;
        case 'blowout':
          blowout();
          break;
        default:
          break;
      }
    }

    function popup(text, x, y, color, size) {
      fx.popups.push({ text, x, y, color, size, age: 0, life: 1.3 });
    }

    function puffRing(x, y, count) {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * TAU;
        spawn({ kind: 'steam', x, y, vx: Math.cos(a) * rand(140, 220), vy: Math.sin(a) * rand(60, 110) - 60, size: 14, grow: 60, life: rand(0.7, 1.1), drag: 2.4, alpha: 0.55 });
      }
    }

    function confetti(count) {
      const colors = [COLORS.heat, COLORS.amber, COLORS.cream, '#C9461A'];
      for (let i = 0; i < count; i += 1) {
        spawn({
          kind: 'confetti',
          x: rand(40, W - 40),
          y: rand(-140, -10),
          vx: rand(-60, 60),
          vy: rand(80, 220),
          gravity: 160,
          drag: 0.6,
          size: rand(6, 11),
          spin: rand(-9, 9),
          rot: rand(0, TAU),
          life: rand(3.2, 4.6),
          color: colors[i % colors.length],
        });
      }
    }

    function blowout() {
      fx.blown = true;
      fx.flash = 1;
      fx.shake = 28;
      fx.soot = 1;
      fx.lid = { x: LID_CENTER.x, y: LID_CENTER.y, vx: rand(-70, 70), vy: -1350, rot: 0, spin: rand(-7, 7) };
      fx.hat = { x: GASKET.x - 2, y: GASKET.y - 300, vx: rand(-190, -120), vy: -760, rot: 0, spin: rand(-9, -4) };
      for (let i = 0; i < 150; i += 1) {
        const a = -Math.PI / 2 + rand(-1.6, 1.6);
        const speed = rand(250, 950);
        spawn({ kind: 'steam', x: LID_CENTER.x + rand(-60, 60), y: LID_CENTER.y + rand(-10, 30), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size: rand(26, 54), grow: 130, life: rand(1.2, 2.5), drag: 1.9, alpha: 0.85 });
      }
      for (let i = 0; i < 60; i += 1) {
        const a = rand(0, TAU);
        const speed = rand(300, 900);
        spawn({ kind: 'spark', x: LID_CENTER.x, y: LID_CENTER.y + 30, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 200, gravity: 900, drag: 0.8, life: rand(0.5, 1.2) });
      }
      for (let i = 0; i < 18; i += 1) {
        const a = -Math.PI / 2 + rand(-1.3, 1.3);
        const speed = rand(250, 700);
        spawn({ kind: 'bolt', x: LID_CENTER.x + rand(-80, 80), y: LID_CENTER.y + 40, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, gravity: 1300, drag: 0.2, size: rand(6, 10), spin: rand(-14, 14), rot: rand(0, TAU), life: 2.4, floor: FLOOR + rand(-6, 10) });
      }
      fx.needleSpeed += 900;
    }

    function spawn(p) {
      p.age = 0;
      p.rot = p.rot || 0;
      p.spin = p.spin || 0;
      p.gravity = p.gravity || 0;
      p.grow = p.grow || 0;
      if (fx.particles.length > 700) fx.particles.shift();
      fx.particles.push(p);
    }

    // ---------------------------------------------------------------- update

    // `mode` is the page's: ready, playing, paused, blowout, over or won.
    function frame(dt, game, mode, Sim) {
      if (mode !== 'paused') update(dt, game, mode, Sim);
      draw(game, mode, Sim);
    }

    function update(dt, game, mode, Sim) {
      fx.t += dt;
      const band = Sim.band(game.psi);
      const live = mode === 'playing';

      // The needle is a damped spring chasing the pressure; it rattles when the pod runs hot.
      let target = mode === 'ready' ? 0 : game.psi;
      if (live && game.psi > 85) target += ((game.psi - 85) / 15) * 1.6 * Math.sin(fx.t * 53) * Math.sin(fx.t * 7.3);
      if (fx.blown) target = fx.t % 1 < 0.5 && mode === 'blowout' ? 103 : 0;
      const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
      for (let i = 0; i < sub; i += 1) {
        const h = dt / sub;
        fx.needleSpeed += (260 * (target - fx.needle) - 18 * fx.needleSpeed) * h;
        fx.needle += fx.needleSpeed * h;
      }
      if (fx.needle > 104) {
        fx.needle = 104;
        fx.needleSpeed = -Math.abs(fx.needleSpeed) * 0.4; // the stop pin
      }

      // Steam out of the valve while the lever is down.
      if (live) {
        if (game.lever > 0.5 && fx.lastLever <= 0.5) {
          for (let i = 0; i < 14; i += 1) {
            const a = -Math.PI / 2 + rand(-1.2, 1.2);
            const speed = rand(160, 380);
            spawn({ kind: 'steam', x: VALVE.x, y: VALVE.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size: rand(10, 16), grow: 90, life: rand(0.5, 0.9), drag: 3, alpha: 0.7 });
          }
        }
        fx.steamDue += game.vent * 4.5 * dt;
        while (fx.steamDue >= 1) {
          fx.steamDue -= 1;
          const push = 0.5 + game.lever * 0.5;
          spawn({ kind: 'steam', x: VALVE.x + rand(-6, 6), y: VALVE.y + rand(-4, 4), vx: rand(-80, 80), vy: -rand(240, 400) * push, size: rand(12, 20), grow: rand(70, 110), life: rand(1, 1.7), drag: 1.3, alpha: 0.6 });
        }
        // Wisps escaping the lid's seal when it runs hot.
        fx.leakDue += Math.max(0, game.psi - 86) * 1.4 * dt;
        while (fx.leakDue >= 1) {
          fx.leakDue -= 1;
          const side = Math.random() < 0.5 ? -1 : 1;
          const seam = markPoint(32 + side * 17.5, 25.6);
          spawn({ kind: 'steam', x: seam.x, y: seam.y, vx: side * rand(60, 140), vy: -rand(40, 110), size: rand(5, 9), grow: 36, life: rand(0.6, 1), drag: 2, alpha: 0.5 });
          if (band === 'critical' && Math.random() < 0.5) {
            spawn({ kind: 'spark', x: seam.x, y: seam.y, vx: side * rand(80, 260), vy: -rand(80, 260), gravity: 900, drag: 0.6, life: rand(0.3, 0.6) });
          }
        }
        if (band === 'hot' || band === 'critical') fx.shake = Math.max(fx.shake, ((game.psi - 85) / 15) * 4);
      }
      fx.lastLever = live ? game.lever : 0;
      if (live && game.lever > 0.5) pulledOnce = true;
      fx.hint = live && !pulledOnce ? Math.min(1, fx.hint + dt * 2) : Math.max(0, fx.hint - dt * 3);

      // Back from the brink: a close call when the needle drops into the zone after 95 PSI or more.
      if (live && game.psi >= 95) fx.brink = Math.max(fx.brink, game.psi);
      if (live && fx.brink && game.psi <= 85) {
        popup('CLOSE CALL!', POD.x, POD.y - 300, COLORS.amber, 24);
        fx.brink = 0;
      }

      // After a blowout: the lid and the toque fly, smoke pours out of the open pod.
      if (fx.blown) {
        fly(fx.lid, dt, 1100);
        fly(fx.hat, dt, 1500);
        if (fx.hat && fx.hat.y > FLOOR - 18 && fx.hat.vy > 0) {
          fx.hat.y = FLOOR - 18;
          fx.hat.vy *= -0.3;
          fx.hat.vx *= 0.6;
          fx.hat.spin *= 0.5;
        }
        fx.smokeDue += 9 * dt;
        while (fx.smokeDue >= 1) {
          fx.smokeDue -= 1;
          spawn({ kind: 'soot', x: LID_CENTER.x + rand(-60, 60), y: LID_CENTER.y + 50, vx: rand(-20, 20), vy: -rand(60, 120), size: rand(20, 34), grow: 50, life: rand(1.6, 2.6), drag: 0.6, alpha: 0.6 });
        }
      }

      for (const p of fx.particles) {
        p.age += dt;
        const drag = Math.exp(-(p.drag || 0) * dt);
        p.vx *= drag;
        p.vy = p.vy * drag + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size += p.grow * dt;
        p.rot += p.spin * dt;
        if (p.floor && p.y > p.floor) {
          p.y = p.floor;
          p.vy *= -0.35;
          p.vx *= 0.5;
          p.spin *= 0.5;
        }
      }
      let kept = 0;
      for (const p of fx.particles) if (p.age < p.life) fx.particles[kept++] = p;
      fx.particles.length = kept;

      for (const p of fx.popups) p.age += dt;
      fx.popups = fx.popups.filter((p) => p.age < p.life);

      fx.shake = Math.max(0, fx.shake - dt * (fx.shake > 10 ? 30 : 14));
      fx.flash = Math.max(0, fx.flash - dt * 2.2);
      fx.cheer = Math.max(0, fx.cheer - dt);
      fx.celebrate = Math.max(0, fx.celebrate - dt);
      fx.orderUp = Math.max(0, fx.orderUp - dt);
      fx.surgeFlare = Math.max(0, fx.surgeFlare - dt * 1.5);
      fx.ringPulse = Math.max(0, fx.ringPulse - dt * 2);
      fx.portFlash = Math.max(0, fx.portFlash - dt * 1.4);

      fx.nextBlink -= dt;
      if (fx.nextBlink <= 0) {
        fx.blink = 0.13;
        fx.nextBlink = rand(2.2, 5);
      }
      fx.blink = Math.max(0, fx.blink - dt);

      const text = bubbleFor(game, mode, band);
      if (text !== fx.bubbleText) {
        fx.bubbleText = text;
        fx.bubbleAge = 0;
      }
      fx.bubbleAge += dt;
    }

    function fly(o, dt, gravity) {
      if (!o) return;
      o.vy += gravity * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.rot += o.spin * dt;
    }

    // Gasket's line, in the pod's own words: NAPPING, LET HIM COOK, HOLDING PRESSURE, HOLD MY HAT, IN ORBIT.
    function bubbleFor(game, mode, band) {
      if (mode === 'ready') return 'NAPPING';
      if (fx.blown) return 'IN ORBIT';
      if (mode === 'won') return 'SHIFT DONE!';
      if (fx.orderUp > 0) return 'ORDER UP!';
      if (band === 'zone') return 'HOLDING PRESSURE';
      if (band === 'low') return 'LET HIM COOK';
      return 'HOLD MY HAT';
    }

    // ---------------------------------------------------------------- draw

    function draw(game, mode, Sim) {
      const c = ctx;
      const band = Sim.band(game.psi);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = COLORS.bg;
      c.fillRect(0, 0, canvas.width, canvas.height);

      const amount = reducedMotion ? 0 : fx.shake;
      const sx = amount ? Math.sin(fx.t * 91) * amount * 0.8 : 0;
      const sy = amount ? Math.cos(fx.t * 77) * amount * 0.6 : 0;
      c.setTransform(1, 0, 0, 1, Math.round(sx * scale), Math.round(sy * scale));
      if (cache) c.drawImage(cache, 0, 0);
      c.setTransform(scale, 0, 0, scale, sx * scale, sy * scale);

      const heat = mode === 'ready' ? 0.15 : clamp(game.psi / 100, 0, 1);
      drawRoomLight(c, heat);
      drawBeacons(c, game, mode, band);
      drawGaugeFront(c, game, mode, band);
      drawFlames(c, game, mode);
      drawPod(c, game, mode, heat);
      const knob = drawLever(c, mode === 'ready' ? 0 : game.lever);
      drawGasket(c, game, mode, band, knob, heat);
      drawParticles(c);
      drawFlying(c);
      drawPopups(c);
      drawBubble(c);
      drawHint(c, knob);

      // Screen-space layers, not shaken.
      c.setTransform(1, 0, 0, 1, 0, 0);
      if (mode === 'playing' && (band === 'hot' || band === 'critical')) {
        const strength = clamp((game.psi - 85) / 15, 0, 1);
        const pulse = 0.55 + 0.45 * Math.sin(fx.t * (5 + strength * 9));
        c.globalAlpha = strength * pulse * 0.5;
        c.drawImage(alarmGlow, 0, 0);
      }
      if (fx.flash > 0) {
        c.globalAlpha = fx.flash * (reducedMotion ? 0.3 : 0.85);
        c.fillStyle = '#FFE7CF';
        c.fillRect(0, 0, canvas.width, canvas.height);
      }
      c.globalAlpha = 1;
      if (vignette) c.drawImage(vignette, 0, 0);
    }

    function drawRoomLight(c, heat) {
      const glow = 0.12 + 0.55 * heat * heat + fx.surgeFlare * 0.2;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = clamp(glow, 0, 0.9) * (fx.blown ? 0.35 : 1);
      const core = markPoint(32, 41.5);
      c.drawImage(sprites.glow, core.x - 330, core.y - 300, 660, 600);
      c.globalAlpha = clamp(glow * 0.8, 0, 0.8) * (fx.blown ? 0.3 : 1);
      c.drawImage(sprites.glow, POD.x - 260, FLOOR - 40, 520, 90);
      c.restore();
    }

    function drawBeacons(c, game, mode, band) {
      const alarm = !fx.blown && mode === 'playing' && (band === 'hot' || band === 'critical' || game.surge.stage !== 'calm');
      for (const [i, b] of BEACONS.entries()) {
        c.fillStyle = COLORS.metalDark;
        roundRect(c, b.x - 16, b.y + 8, 32, 12, 3);
        c.fill();
        const a = fx.t * (band === 'critical' ? 9 : 6) + i * Math.PI;
        if (alarm) {
          c.save();
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = 0.22;
          c.translate(b.x, b.y);
          c.rotate(a);
          const beam = c.createLinearGradient(0, 0, 240, 0);
          beam.addColorStop(0, 'rgba(255, 179, 92, 0.9)');
          beam.addColorStop(1, 'rgba(255, 179, 92, 0)');
          c.fillStyle = beam;
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(240, -46);
          c.lineTo(240, 46);
          c.closePath();
          c.fill();
          c.restore();
        }
        const lit = alarm ? 0.65 + 0.35 * Math.cos(a) : 0;
        c.fillStyle = alarm ? mix('#5A2A0E', COLORS.amber, lit) : '#3A2416';
        c.beginPath();
        c.arc(b.x, b.y + 8, 15, Math.PI, 0);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(243, 238, 233, 0.25)';
        c.fillRect(b.x - 9, b.y - 2, 4, 8);
        if (alarm) {
          c.save();
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = 0.35 * lit;
          c.drawImage(sprites.hot, b.x - 50, b.y - 42, 100, 100);
          c.restore();
        }
      }
    }

    // ------------------------------------------------------------ the gauge

    function drawGaugeFront(c, game, mode, band) {
      const { x, y, r } = GAUGE;
      // The target band lights up while the needle is in it.
      if (mode === 'playing' && band === 'zone') {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.35 + 0.15 * Math.sin(fx.t * 6) + fx.ringPulse * 0.4;
        c.strokeStyle = COLORS.heat;
        c.lineWidth = 22 + fx.ringPulse * 14;
        c.beginPath();
        c.arc(x, y, r - 24, psiAngle(65), psiAngle(85));
        c.stroke();
        c.restore();
      }
      if (mode === 'playing' && band === 'critical') {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.5 + 0.5 * Math.sin(fx.t * 20);
        c.strokeStyle = COLORS.danger;
        c.lineWidth = 20;
        c.beginPath();
        c.arc(x, y, r - 24, psiAngle(92), psiAngle(100));
        c.stroke();
        c.restore();
      }

      // The needle.
      const a = psiAngle(clamp(fx.needle, -3, 104));
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = 'rgba(0, 0, 0, 0.45)';
      needlePath(c, r, 5, 7);
      c.fill();
      c.fillStyle = COLORS.cream;
      needlePath(c, r, 0, 0);
      c.fill();
      c.fillStyle = COLORS.heat;
      c.beginPath();
      c.moveTo(r - 62, -2.7);
      c.lineTo(r - 18, -1.3);
      c.lineTo(r - 18, 1.3);
      c.lineTo(r - 62, 2.7);
      c.closePath();
      c.fill();
      c.restore();

      // The cap over the needle's pivot.
      const cap = c.createRadialGradient(x - 5, y - 6, 2, x, y, 17);
      cap.addColorStop(0, '#8A7466');
      cap.addColorStop(1, '#241B17');
      c.fillStyle = cap;
      disc(c, x, y, 16);
      c.fillStyle = COLORS.heat;
      disc(c, x, y, 4.5);

      // The glass: a soft reflection, and cracks once the valve has blown.
      c.save();
      c.globalAlpha = 0.07;
      c.fillStyle = COLORS.cream;
      c.beginPath();
      c.ellipse(x - 38, y - 62, r * 0.62, r * 0.32, -0.55, 0, TAU);
      c.fill();
      c.restore();
      if (fx.blown) {
        c.save();
        c.strokeStyle = 'rgba(243, 238, 233, 0.55)';
        c.lineWidth = 1.2;
        c.beginPath();
        for (const crack of cracks) {
          c.moveTo(x + crack[0][0], y + crack[0][1]);
          for (const [px, py] of crack.slice(1)) c.lineTo(x + px, y + py);
        }
        c.stroke();
        c.restore();
      }
    }

    function needlePath(c, r, ox, oy) {
      c.beginPath();
      c.moveTo(-32 + ox, -5.5 + oy);
      c.lineTo(r - 18 + ox, -1.3 + oy);
      c.lineTo(r - 12 + ox, oy);
      c.lineTo(r - 18 + ox, 1.3 + oy);
      c.lineTo(-32 + ox, 5.5 + oy);
      c.closePath();
    }

    // -------------------------------------------------------------- the pod

    function drawFlames(c, game, mode) {
      if (fx.blown) return;
      const T = root.GasketSim ? root.GasketSim.TUNING : null;
      const power = mode === 'ready' ? 0.12 : clamp(game.heat / (T ? T.heatMax : 16), 0.15, 1.4) + fx.surgeFlare * 0.3;
      const base = markPoint(32, 56.4);
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i += 1) {
        const fxp = base.x + (i - 4) * 15;
        const flick = 0.75 + 0.25 * Math.sin(fx.t * (13 + i * 1.7) + i * 2.1) + 0.12 * Math.sin(fx.t * 31 + i);
        const h = (14 + 46 * power) * flick * (1 - Math.abs(i - 4) * 0.08);
        flame(c, fxp, base.y, 8, h, 'rgba(240, 90, 24, 0.75)');
        flame(c, fxp, base.y, 4.5, h * 0.62, 'rgba(255, 179, 92, 0.8)');
        flame(c, fxp, base.y, 2, h * 0.3, 'rgba(243, 238, 233, 0.6)');
      }
      c.restore();
    }

    function flame(c, x, y, w, h, color) {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(x - w, y);
      c.quadraticCurveTo(x - w * 0.9, y - h * 0.55, x, y - h);
      c.quadraticCurveTo(x + w * 0.9, y - h * 0.55, x + w, y);
      c.closePath();
      c.fill();
    }

    function drawPod(c, game, mode, heat) {
      const psi = mode === 'ready' ? 0 : game.psi;
      const rattle = mode === 'playing' ? clamp((psi - 80) / 20, 0, 1) : 0;
      const jx = rattle ? Math.sin(fx.t * 64) * rattle * rattle * 2.6 : 0;
      const jy = rattle ? Math.cos(fx.t * 71) * rattle * rattle * 1.4 : 0;

      c.save();
      c.translate(POD.x + jx, POD.y + jy);
      c.scale(POD.s, POD.s);
      c.translate(-32, -60);
      c.lineJoin = 'round';

      // Legs and body: the cream of the Hotpod mark, shaded like a drum.
      c.fillStyle = '#B9ACA1';
      c.fill(paths.legs);
      const body = c.createLinearGradient(13, 0, 51, 0);
      body.addColorStop(0, '#FFF9F3');
      body.addColorStop(0.35, COLORS.cream);
      body.addColorStop(0.8, '#C9BCB1');
      body.addColorStop(1, '#9C8F84');
      c.fillStyle = fx.blown ? '#6E625A' : body;
      c.fill(paths.body);
      // The heat soaks into the metal from the bottom.
      const soak = clamp((psi - 55) / 45, 0, 1) * (fx.blown ? 0 : 1);
      if (soak > 0) {
        const hot = c.createLinearGradient(0, 52.5, 0, 28);
        hot.addColorStop(0, `rgba(240, 90, 24, ${0.55 * soak})`);
        hot.addColorStop(1, 'rgba(240, 90, 24, 0)');
        c.fillStyle = hot;
        c.fill(paths.body);
      }
      c.strokeStyle = 'rgba(13, 9, 8, 0.55)';
      c.lineWidth = 0.32;
      c.stroke(paths.body);
      if (soak > 0.6 && mode === 'playing') {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = `rgba(232, 57, 29, ${(soak - 0.6) * 1.6 * (0.6 + 0.4 * Math.sin(fx.t * 14))})`;
        c.lineWidth = 0.7;
        c.stroke(paths.body);
        c.restore();
      }

      // Rivets and the name plate.
      c.fillStyle = 'rgba(13, 9, 8, 0.35)';
      for (let i = 0; i < 9; i += 1) disc(c, 17 + i * 3.75, 28.4, 0.32);
      c.fillStyle = 'rgba(13, 9, 8, 0.6)';
      c.font = `700 1.9px ${MONO}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('POD 01', 19.6, 41.6);
      c.fillText('100 PSI', 44.5, 41.6);

      // The orange band, glowing with the pressure.
      c.strokeStyle = COLORS.heat;
      c.lineWidth = 2.6;
      c.lineCap = 'round';
      c.stroke(paths.band);
      if (!fx.blown && heat > 0.3) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = (heat - 0.3) * 0.9;
        c.strokeStyle = COLORS.amber;
        c.lineWidth = 1.2;
        c.stroke(paths.band);
        c.restore();
      }

      drawPorthole(c, psi, heat);

      // The lid: it jumps on its seal when the pressure runs high, and it is gone after a blowout.
      if (!fx.blown) {
        const hop = rattle > 0.35 ? Math.max(0, Math.sin(fx.t * 38)) * (rattle - 0.35) * 1.1 : 0;
        c.save();
        c.translate(0, -hop);
        const lid = c.createLinearGradient(18, 0, 46, 0);
        lid.addColorStop(0, '#FFF9F3');
        lid.addColorStop(0.5, COLORS.cream);
        lid.addColorStop(1, '#A99C91');
        c.fillStyle = lid;
        c.fill(paths.lid);
        c.strokeStyle = 'rgba(13, 9, 8, 0.55)';
        c.lineWidth = 0.32;
        c.stroke(paths.lid);
        drawValveStem(c, rattle, game);
        c.restore();
      } else {
        // The open rim, glowing inside.
        c.fillStyle = '#2A1A12';
        c.beginPath();
        c.ellipse(32, 26.6, 17.6, 1.6, 0, 0, TAU);
        c.fill();
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(240, 90, 24, ${0.5 + 0.2 * Math.sin(fx.t * 9)})`;
        c.beginPath();
        c.ellipse(32, 26.7, 15, 1.1, 0, 0, TAU);
        c.fill();
        c.restore();
      }
      c.restore();

      // The hose from the valve to Gasket's lever, flexing with the pod.
      const valve = markPoint(33.5, 13.4);
      c.strokeStyle = '#2B211C';
      c.lineWidth = 9;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(valve.x + jx, valve.y + jy);
      c.quadraticCurveTo(valve.x + 24, 252, 690, 250);
      c.stroke();
      c.strokeStyle = 'rgba(243, 238, 233, 0.12)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(valve.x + jx, valve.y + jy - 2.5);
      c.quadraticCurveTo(valve.x + 24, 249.5, 690, 247.5);
      c.stroke();
    }

    function drawPorthole(c, psi, heat) {
      const cx = 32;
      const cy = 41.5;
      c.fillStyle = '#3A2E28';
      disc(c, cx, cy, 6.5);
      c.fillStyle = '#5E4C41';
      disc(c, cx, cy, 5.9);
      const t = clamp(psi / 100, 0, 1);
      const inner = fx.blown ? '#3A2416' : mix(COLORS.ember, t > 0.85 ? '#FFE3C2' : COLORS.amber, clamp(t * 1.15, 0, 1));
      const outer = fx.blown ? '#1A110D' : mix('#3A1A0E', COLORS.heat, clamp(t * 1.3, 0, 1));
      const g = c.createRadialGradient(cx - 1, cy - 1.4, 0.4, cx, cy, 5.2);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      c.fillStyle = g;
      disc(c, cx, cy, 5.2);

      // Whatever is cooking bubbles harder as the pressure climbs.
      if (!fx.blown) {
        c.save();
        c.beginPath();
        c.arc(cx, cy, 5.2, 0, TAU);
        c.clip();
        c.fillStyle = `rgba(255, 240, 222, ${0.25 + 0.35 * t})`;
        const speed = 1 + t * 5;
        for (let i = 0; i < 7; i += 1) {
          const phase = (fx.t * speed * (0.6 + i * 0.09) + i * 0.37) % 1;
          disc(c, cx - 3.6 + ((i * 1.31) % 7.2), cy + 5 - phase * 10, 0.35 + ((i * 7) % 3) * 0.18);
        }
        c.restore();
      }
      if (fx.portFlash > 0) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = fx.portFlash;
        c.drawImage(sprites.hot, cx - 12, cy - 12, 24, 24);
        c.restore();
      }
      c.fillStyle = 'rgba(255, 249, 243, 0.35)';
      c.beginPath();
      c.ellipse(cx - 2, cy - 2.6, 2.2, 1, -0.6, 0, TAU);
      c.fill();
      if (heat > 0.5 && !fx.blown) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = (heat - 0.5) * 1.2;
        c.drawImage(sprites.glow, cx - 14, cy - 14, 28, 28);
        c.restore();
      }
    }

    // The stem and ball on the lid (the Hotpod mark's antenna) is the vent valve.
    function drawValveStem(c, rattle, game) {
      const tilt = rattle > 0.2 ? Math.sin(fx.t * 47) * rattle * 0.22 : 0;
      c.save();
      c.translate(32, 16);
      c.rotate(tilt);
      c.fillStyle = '#CFC4BA';
      c.fillRect(-1.5, -7, 3, 7);
      c.fillStyle = 'rgba(13, 9, 8, 0.35)';
      c.fillRect(-1.5, -4.2, 3, 0.6);
      const open = game.lever || 0;
      c.fillStyle = COLORS.heat;
      disc(c, 0, -9 - open * 0.8, 2.6);
      c.fillStyle = 'rgba(255, 249, 243, 0.5)';
      disc(c, -0.8, -9.9 - open * 0.8, 0.8);
      c.restore();
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.35 + 0.4 * Math.max(open, 0.5 + 0.5 * Math.sin(fx.t * (3 + rattle * 20)));
      c.drawImage(sprites.glow, 32 - 7, 7 - 7, 14, 14);
      c.restore();
    }

    // ------------------------------------------------------------ the lever

    function drawLever(c, lever) {
      const a = LEVER.closed + (LEVER.open - LEVER.closed) * lever;
      const kx = LEVER.x + Math.cos(a) * LEVER.length;
      const ky = LEVER.y + Math.sin(a) * LEVER.length;
      c.save();
      c.translate(LEVER.x, LEVER.y);
      c.rotate(a);
      c.fillStyle = 'rgba(0, 0, 0, 0.4)';
      roundRect(c, -10, -3, LEVER.length + 6, 16, 8);
      c.fill();
      const bar = c.createLinearGradient(0, -8, 0, 8);
      bar.addColorStop(0, '#8A7466');
      bar.addColorStop(0.45, '#4E3F36');
      bar.addColorStop(1, '#1E1613');
      c.fillStyle = bar;
      roundRect(c, -12, -8, LEVER.length + 6, 16, 8);
      c.fill();
      c.restore();

      // The knob: the hottest orange in the room, because it is the thing to grab.
      c.fillStyle = 'rgba(0, 0, 0, 0.4)';
      disc(c, kx + 3, ky + 5, 18);
      const knob = c.createRadialGradient(kx - 6, ky - 7, 2, kx, ky, 19);
      knob.addColorStop(0, COLORS.amber);
      knob.addColorStop(0.55, COLORS.heat);
      knob.addColorStop(1, '#9A3110');
      c.fillStyle = knob;
      disc(c, kx, ky, 18);

      const cap = c.createRadialGradient(LEVER.x - 4, LEVER.y - 5, 1, LEVER.x, LEVER.y, 15);
      cap.addColorStop(0, '#8A7466');
      cap.addColorStop(1, '#1E1613');
      c.fillStyle = cap;
      disc(c, LEVER.x, LEVER.y, 14);
      c.fillStyle = COLORS.metalDark;
      disc(c, LEVER.x, LEVER.y, 4);
      return { x: kx, y: ky };
    }

    // ------------------------------------------------------------- Gasket

    function moodFor(game, mode, band) {
      if (fx.blown) return 'dazed';
      if (mode === 'ready') return 'napping';
      if (fx.cheer > 0 || mode === 'won') return 'cheer';
      if (band === 'critical') return 'panic';
      if (band === 'hot') return 'worried';
      if (band === 'zone') return 'happy';
      return 'idle';
    }

    function drawGasket(c, game, mode, band, knob, heat) {
      const mood = moodFor(game, mode, band);
      const t = fx.t;
      const lever = mode === 'ready' ? 0 : game.lever;
      const tremble = mood === 'panic' ? Math.sin(t * 60) * 1.4 : 0;
      const bob = Math.sin(t * (mood === 'napping' ? 1.3 : 2.4)) * 2 + (mood === 'cheer' ? -Math.abs(Math.sin(t * 9)) * 10 : 0);
      const lean = mood === 'napping' ? 0.05 : -0.02 + lever * 0.05;

      c.save();
      c.translate(GASKET.x, GASKET.y);
      drawTail(c, t, mood);
      c.rotate(lean);
      c.translate(tremble, bob);
      drawFarArm(c, mood, t);
      drawLegs(c);
      drawBody(c, heat);
      drawHead(c, mood, t);
      c.restore();

      // The near arm reaches the lever's knob: two segments, elbow down.
      const cos = Math.cos(lean);
      const sin = Math.sin(lean);
      const sx = GASKET.x + (SHOULDER.x + tremble) * cos - (SHOULDER.y + bob) * sin;
      const sy = GASKET.y + (SHOULDER.x + tremble) * sin + (SHOULDER.y + bob) * cos;
      let dx = knob.x - sx;
      let dy = knob.y - sy;
      const d = clamp(Math.hypot(dx, dy), 12, ARM * 2 - 0.5);
      const toward = Math.atan2(dy, dx);
      const bend = Math.acos(clamp(d / (2 * ARM), -1, 1));
      const e1 = { x: sx + Math.cos(toward + bend) * ARM, y: sy + Math.sin(toward + bend) * ARM };
      const e2 = { x: sx + Math.cos(toward - bend) * ARM, y: sy + Math.sin(toward - bend) * ARM };
      const elbow = e1.y > e2.y ? e1 : e2;
      dx = Math.cos(toward) * d;
      dy = Math.sin(toward) * d;
      const hand = { x: sx + dx, y: sy + dy };
      limb(c, sx, sy, elbow.x, elbow.y, 17, '#5C4A40', '#3A2E28');
      limb(c, elbow.x, elbow.y, hand.x, hand.y, 14, '#6A564B', '#3E312A');
      c.fillStyle = '#2A211D';
      disc(c, elbow.x, elbow.y, 8);
      // The paw closes over the knob.
      c.fillStyle = '#4A3B33';
      disc(c, hand.x + 4, hand.y + 3, 11);
      c.strokeStyle = '#2A211D';
      c.lineWidth = 4;
      c.lineCap = 'round';
      for (let i = -1; i <= 1; i += 1) {
        c.beginPath();
        c.moveTo(hand.x + 6, hand.y + i * 6);
        c.lineTo(hand.x - 8, hand.y + i * 7 - 2);
        c.stroke();
      }
      if (fx.soot > 0) {
        c.fillStyle = `rgba(18, 12, 10, ${0.45 * fx.soot})`;
        disc(c, hand.x, hand.y, 9);
      }
    }

    function limb(c, x1, y1, x2, y2, width, light, dark) {
      c.lineCap = 'round';
      c.strokeStyle = dark;
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
      c.strokeStyle = light;
      c.lineWidth = width * 0.45;
      c.beginPath();
      c.moveTo(x1, y1 - width * 0.18);
      c.lineTo(x2, y2 - width * 0.18);
      c.stroke();
    }

    // A rat's tail, as a robot builds one: a segmented cable ending in a plug.
    function drawTail(c, t, mood) {
      const sway = Math.sin(t * (mood === 'panic' ? 9 : 1.6)) * (mood === 'napping' ? 4 : 12);
      const pts = [];
      const n = 16;
      for (let i = 0; i <= n; i += 1) {
        const u = i / n;
        const x = bezier(40, 104, 138, 152 + sway * 0.7, u);
        const y = bezier(-62, -4, 12, -46 - sway * 0.5, u);
        pts.push([x, y]);
      }
      for (let i = 0; i < pts.length; i += 1) {
        const w = 11 * (1 - (i / n) * 0.7);
        c.fillStyle = i % 2 ? '#4E3F36' : '#6A564B';
        disc(c, pts[i][0], pts[i][1], w / 2 + 1);
      }
      const tip = pts[pts.length - 1];
      c.fillStyle = COLORS.heat;
      disc(c, tip[0], tip[1], 4.2);
    }

    function drawLegs(c) {
      c.fillStyle = '#3E312A';
      c.fillRect(-38, -46, 18, 36);
      c.fillRect(12, -46, 16, 36);
      c.fillStyle = '#2A211D';
      ellipse(c, -32, -9, 27, 11);
      ellipse(c, 22, -9, 24, 10);
      c.fillStyle = 'rgba(243, 238, 233, 0.12)';
      ellipse(c, -38, -14, 12, 3);
      ellipse(c, 16, -13, 10, 3);
    }

    function drawBody(c, heat) {
      const body = c.createLinearGradient(-56, 0, 56, 0);
      body.addColorStop(0, '#8A7466');
      body.addColorStop(0.5, '#5C4A40');
      body.addColorStop(1, '#2E2420');
      c.fillStyle = body;
      ellipse(c, 0, -112, 54, 72);
      // The pod's glow lights his side.
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgba(240, 90, 24, ${0.15 + 0.5 * heat})`;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(0, -112, 53, 71, 0, Math.PI * 0.62, Math.PI * 1.32);
      c.stroke();
      c.restore();

      // Apron, with the pod's dot on the pocket.
      c.fillStyle = COLORS.cream;
      c.beginPath();
      c.moveTo(-30, -176);
      c.lineTo(16, -176);
      c.lineTo(18, -150);
      c.quadraticCurveTo(42, -146, 38, -100);
      c.quadraticCurveTo(34, -52, 0, -46);
      c.quadraticCurveTo(-36, -50, -44, -100);
      c.quadraticCurveTo(-48, -146, -32, -150);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(13, 9, 8, 0.12)';
      c.fillRect(-26, -112, 36, 3);
      c.strokeStyle = 'rgba(13, 9, 8, 0.25)';
      c.lineWidth = 1.5;
      roundRect(c, -18, -104, 26, 22, 4);
      c.stroke();
      c.fillStyle = COLORS.heat;
      disc(c, -5, -93, 4.5);
      // Kerchief.
      c.fillStyle = COLORS.heat;
      c.beginPath();
      c.moveTo(-36, -184);
      c.lineTo(26, -184);
      c.lineTo(-2, -160);
      c.closePath();
      c.fill();
      c.fillStyle = '#B8410F';
      c.beginPath();
      c.moveTo(-6, -184);
      c.lineTo(8, -184);
      c.lineTo(1, -172);
      c.closePath();
      c.fill();
      if (fx.soot > 0) {
        c.fillStyle = `rgba(18, 12, 10, ${0.55 * fx.soot})`;
        ellipse(c, -14, -120, 26, 18);
        ellipse(c, 16, -70, 18, 12);
        ellipse(c, -30, -160, 12, 8);
      }
    }

    function drawFarArm(c, mood, t) {
      const shoulder = { x: 30, y: -142 };
      let hand = { x: 48, y: -88 };
      let elbow = { x: 62, y: -120 };
      if (mood === 'cheer') {
        const wave = Math.sin(t * 12) * 8;
        hand = { x: 58 + wave, y: -238 };
        elbow = { x: 70, y: -186 };
      } else if (mood === 'panic' || mood === 'worried') {
        hand = { x: 8, y: -222 }; // a paw on the head
        elbow = { x: 56, y: -190 };
      }
      limb(c, shoulder.x, shoulder.y, elbow.x, elbow.y, 15, '#5C4A40', '#2E2420');
      limb(c, elbow.x, elbow.y, hand.x, hand.y, 13, '#5C4A40', '#2E2420');
      c.fillStyle = '#3A2E28';
      disc(c, hand.x, hand.y, 9);
    }

    function drawHead(c, mood, t) {
      const ear = mood === 'worried' || mood === 'panic' ? -0.35 : mood === 'napping' ? 0.15 : Math.sin(t * 0.9) * 0.06;
      // Ears behind the head.
      drawEar(c, 26, -268, 24, ear + 0.2);
      drawEar(c, -10, -282, 28, ear - 0.15);

      // Head and snout.
      const head = c.createLinearGradient(-90, -270, 40, -190);
      head.addColorStop(0, '#9A8476');
      head.addColorStop(0.5, '#6A564B');
      head.addColorStop(1, '#3A2E28');
      c.fillStyle = head;
      disc(c, -2, -232, 44);
      c.beginPath();
      c.moveTo(-30, -264);
      c.quadraticCurveTo(-70, -252, -88, -226);
      c.quadraticCurveTo(-74, -204, -34, -198);
      c.closePath();
      c.fill();
      // Mouth.
      c.strokeStyle = '#2A211D';
      c.lineWidth = 2.4;
      c.lineCap = 'round';
      c.beginPath();
      if (mood === 'panic') {
        c.ellipse(-60, -210, 5, 6, 0, 0, TAU);
      } else if (mood === 'worried' || mood === 'dazed') {
        c.moveTo(-74, -210);
        c.lineTo(-66, -214);
        c.lineTo(-58, -209);
        c.lineTo(-50, -213);
      } else if (mood === 'happy' || mood === 'cheer') {
        c.moveTo(-74, -214);
        c.quadraticCurveTo(-62, -203, -48, -212);
      } else {
        c.moveTo(-72, -212);
        c.lineTo(-52, -210);
      }
      c.stroke();
      // Nose.
      c.fillStyle = COLORS.heat;
      disc(c, -88, -226, 6.5);
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.5;
      c.drawImage(sprites.glow, -88 - 14, -226 - 14, 28, 28);
      c.restore();
      // Whiskers.
      c.strokeStyle = 'rgba(243, 238, 233, 0.55)';
      c.lineWidth = 1.4;
      c.beginPath();
      for (const [ex, ey] of [
        [-122, -240],
        [-126, -224],
        [-120, -208],
      ]) {
        const twitch = Math.sin(t * 3 + ey) * 2;
        c.moveTo(-70, -222);
        if (fx.soot > 0) {
          c.lineTo(-86, -226 + (ey + 224) * 0.3 + 4);
          c.lineTo(-100, -222 + (ey + 224) * 0.6 - 4);
          c.lineTo(ex + 8, ey + twitch);
        } else {
          c.quadraticCurveTo(-96, -224 + (ey + 224) * 0.4, ex, ey + twitch);
        }
      }
      c.stroke();

      // Visor and eyes.
      c.save();
      c.translate(-30, -238);
      c.rotate(-0.08);
      c.fillStyle = '#120C0A';
      roundRect(c, -28, -14, 60, 27, 12);
      c.fill();
      c.fillStyle = 'rgba(243, 238, 233, 0.14)';
      roundRect(c, -22, -11, 30, 3, 1.5);
      c.fill();
      drawEyes(c, mood);
      c.restore();

      if (mood === 'worried' || mood === 'panic') {
        // A bead of oil on the brow.
        const drip = (t * 0.8) % 1;
        c.fillStyle = COLORS.amber;
        c.beginPath();
        c.moveTo(18, -262 + drip * 22);
        c.quadraticCurveTo(24, -252 + drip * 22, 18, -248 + drip * 22);
        c.quadraticCurveTo(12, -252 + drip * 22, 18, -262 + drip * 22);
        c.fill();
      }
      if (mood === 'napping') {
        c.fillStyle = COLORS.cream;
        c.textAlign = 'center';
        for (let i = 0; i < 3; i += 1) {
          const phase = (t * 0.45 + i / 3) % 1;
          c.globalAlpha = Math.sin(phase * Math.PI) * 0.8;
          c.font = `700 ${14 + phase * 12}px ${MONO}`;
          c.fillText('z', -40 - phase * 30, -290 - phase * 50);
        }
        c.globalAlpha = 1;
      }
      if (fx.soot > 0) {
        c.fillStyle = `rgba(18, 12, 10, ${0.5 * fx.soot})`;
        ellipse(c, 10, -250, 20, 14);
        ellipse(c, -58, -232, 12, 8);
      }
      if (!fx.blown) drawToque(c, mood, t);
    }

    function drawEar(c, x, y, r, tilt) {
      c.save();
      c.translate(x, y);
      c.rotate(tilt);
      c.fillStyle = '#5C4A40';
      ellipse(c, 0, 0, r, r * 0.92);
      c.fillStyle = '#3A1A0E';
      ellipse(c, -2, 2, r * 0.66, r * 0.6);
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.45;
      c.drawImage(sprites.glow, -r * 0.7, -r * 0.6, r * 1.3, r * 1.3);
      c.restore();
      c.restore();
    }

    function drawEyes(c, mood) {
      const eyes = [
        [-13, 0],
        [12, -1],
      ];
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = COLORS.amber;
      c.strokeStyle = COLORS.amber;
      c.lineWidth = 3.2;
      c.lineCap = 'round';
      const closed = fx.blink > 0 && mood !== 'napping' && mood !== 'dazed';
      for (const [ex, ey] of eyes) {
        c.beginPath();
        if (mood === 'napping') {
          c.moveTo(ex - 6, ey + 2);
          c.lineTo(ex + 6, ey + 2);
          c.stroke();
        } else if (mood === 'dazed') {
          c.moveTo(ex - 5, ey - 5);
          c.lineTo(ex + 5, ey + 5);
          c.moveTo(ex + 5, ey - 5);
          c.lineTo(ex - 5, ey + 5);
          c.stroke();
        } else if (closed) {
          c.moveTo(ex - 6, ey);
          c.lineTo(ex + 6, ey);
          c.stroke();
        } else if (mood === 'happy' || mood === 'cheer') {
          c.arc(ex, ey + 4, 6, Math.PI * 1.1, Math.PI * 1.9);
          c.stroke();
        } else if (mood === 'panic') {
          c.lineWidth = 2.2;
          c.arc(ex, ey, 7, 0, TAU);
          c.stroke();
          c.beginPath();
          c.arc(ex + Math.sin(fx.t * 40) * 1.5, ey, 2, 0, TAU);
          c.fill();
        } else if (mood === 'worried') {
          roundRect(c, ex - 4, ey - 4, 8, 10, 3);
          c.fill();
          c.beginPath();
          c.moveTo(ex - 6, ey - 10 + (ex < 0 ? -2 : 2));
          c.lineTo(ex + 6, ey - 10 + (ex < 0 ? 2 : -2));
          c.stroke();
        } else {
          roundRect(c, ex - 4, ey - 6, 8, 12, 3);
          c.fill();
        }
      }
      c.restore();
    }

    function drawToque(c, mood, t) {
      c.save();
      c.translate(-2, -276);
      c.rotate(-0.1 + (mood === 'panic' ? Math.sin(t * 30) * 0.06 : 0));
      toque(c, fx.soot);
      c.restore();
    }

    function toque(c, soot) {
      const cloth = soot > 0 ? '#6E625A' : COLORS.cream;
      c.fillStyle = cloth;
      disc(c, -20, -30, 19);
      disc(c, 2, -38, 24);
      disc(c, 22, -28, 18);
      c.fillRect(-34, -26, 66, 16);
      c.fillStyle = soot > 0 ? '#57493F' : COLORS.creamShade;
      roundRect(c, -36, -12, 70, 16, 3);
      c.fill();
      c.strokeStyle = 'rgba(13, 9, 8, 0.15)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-10, -12);
      c.lineTo(-12, -28);
      c.moveTo(12, -12);
      c.lineTo(14, -30);
      c.stroke();
    }

    // ---------------------------------------------------------- particles

    function drawParticles(c) {
      for (const p of fx.particles) {
        const life = p.age / p.life;
        if (p.kind === 'steam' || p.kind === 'soot') {
          const a = (p.alpha || 0.6) * Math.pow(1 - life, 1.4);
          if (a <= 0.01) continue;
          c.globalAlpha = a;
          c.drawImage(p.kind === 'steam' ? sprites.puff : sprites.soot, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        } else if (p.kind === 'spark') {
          c.globalAlpha = 1 - life;
          c.strokeStyle = life < 0.4 ? COLORS.amber : COLORS.heat;
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
          c.stroke();
        } else if (p.kind === 'bolt') {
          c.globalAlpha = life > 0.8 ? (1 - life) * 5 : 1;
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.fillStyle = '#8A7466';
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          c.fillStyle = '#3E312A';
          c.fillRect(-p.size / 2, -p.size / 2, p.size / 3, p.size);
          c.restore();
        } else if (p.kind === 'confetti') {
          c.globalAlpha = life > 0.8 ? (1 - life) * 5 : 1;
          c.save();
          c.translate(p.x + Math.sin(p.age * 5 + p.rot) * 10, p.y);
          c.rotate(p.rot);
          c.fillStyle = p.color;
          c.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.age * 6 + p.rot)) + 1);
          c.restore();
        }
      }
      c.globalAlpha = 1;
    }

    function drawFlying(c) {
      if (fx.lid && fx.lid.y > -200) {
        c.save();
        c.translate(fx.lid.x, fx.lid.y);
        c.rotate(fx.lid.rot);
        c.scale(POD.s, POD.s);
        c.translate(-32, -21);
        c.fillStyle = '#B9ACA1';
        c.fill(paths.lid);
        c.fillStyle = '#CFC4BA';
        c.fillRect(30.5, 9, 3, 7);
        c.fillStyle = COLORS.heat;
        disc(c, 32, 7, 2.6);
        c.restore();
      }
      if (fx.hat) {
        c.save();
        c.translate(fx.hat.x, fx.hat.y);
        c.rotate(fx.hat.rot);
        toque(c, 0);
        c.restore();
      }
    }

    function drawPopups(c) {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const p of fx.popups) {
        const life = p.age / p.life;
        const rise = 1 - Math.pow(1 - Math.min(1, life * 2), 3);
        const grow = life < 0.15 ? 0.7 + life * 2 : 1;
        c.globalAlpha = life > 0.7 ? (1 - life) / 0.3 : 1;
        c.font = `800 ${Math.round(p.size * grow)}px ${MONO}`;
        c.lineWidth = 5;
        c.strokeStyle = COLORS.bg;
        c.strokeText(p.text, p.x, p.y - rise * 40);
        c.fillStyle = p.color;
        c.fillText(p.text, p.x, p.y - rise * 40);
      }
      c.globalAlpha = 1;
    }

    // A pointer to the lever for a first-time cook.
    function drawHint(c, knob) {
      if (fx.hint <= 0) return;
      const pulse = 0.75 + 0.25 * Math.sin(fx.t * 6);
      const x = knob.x - 150;
      const y = knob.y - 64;
      c.save();
      c.globalAlpha = fx.hint * pulse;
      c.font = `800 15px ${MONO}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const w = c.measureText('HOLD SPACE').width + 28;
      c.fillStyle = 'rgba(13, 9, 8, 0.92)';
      roundRect(c, x - w / 2, y - 26, w, 52, 6);
      c.fill();
      c.strokeStyle = COLORS.amber;
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = COLORS.cream;
      c.fillText('HOLD SPACE', x, y - 8);
      c.font = `700 11px ${MONO}`;
      c.fillStyle = COLORS.amber;
      c.fillText('OR CLICK & HOLD', x, y + 11);
      // An arrow to the knob.
      const tx = knob.x - 22;
      const ty = knob.y - 10;
      const sx = x + w / 2 + 4;
      c.strokeStyle = COLORS.amber;
      c.lineWidth = 3;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(sx, y);
      c.quadraticCurveTo(tx - 10, y, tx, ty);
      c.stroke();
      const a = Math.atan2(ty - y, tx - (tx - 10));
      c.beginPath();
      c.moveTo(tx, ty);
      c.lineTo(tx - Math.cos(a - 0.5) * 11, ty - Math.sin(a - 0.5) * 11);
      c.moveTo(tx, ty);
      c.lineTo(tx - Math.cos(a + 0.5) * 11, ty - Math.sin(a + 0.5) * 11);
      c.stroke();
      c.restore();
    }

    function drawBubble(c) {
      const text = fx.bubbleText;
      if (!text) return;
      const pop = Math.min(1, fx.bubbleAge / 0.16);
      const s = 0.85 + 0.15 * (1 - Math.pow(1 - pop, 3));
      c.save();
      c.translate(GASKET.x - 58, GASKET.y - 360);
      c.scale(s, s);
      c.font = `800 16px ${MONO}`;
      const w = c.measureText(text).width + 26;
      c.fillStyle = COLORS.cream;
      roundRect(c, -w / 2, -18, w, 36, 8);
      c.fill();
      c.beginPath();
      c.moveTo(6, 16);
      c.lineTo(26, 16);
      c.lineTo(30, 34);
      c.closePath();
      c.fill();
      c.fillStyle = COLORS.bg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, 0, 1);
      c.restore();
    }

    // ------------------------------------------------------- the static room

    function paintRoom(c) {
      c.fillStyle = COLORS.bg;
      c.fillRect(0, 0, W, H);

      // Wall panels with rivets; a couple of them carry vent grilles.
      for (let x = 0, i = 0; x < W; x += 160, i += 1) {
        c.fillStyle = i % 2 ? COLORS.panel : '#120C0A';
        c.fillRect(x + 3, 20, 154, FLOOR - 30);
        c.fillStyle = 'rgba(243, 238, 233, 0.025)';
        c.fillRect(x + 3, 20, 154, 2);
        c.fillStyle = 'rgba(0, 0, 0, 0.35)';
        c.fillRect(x + 3, FLOOR - 12, 154, 2);
        for (const [rx, ry] of [
          [x + 13, 32],
          [x + 147, 32],
          [x + 13, FLOOR - 22],
          [x + 147, FLOOR - 22],
        ]) {
          rivet(c, rx, ry, 2.6);
        }
        if (i === 1 || i === 6) {
          for (let s = 0; s < 7; s += 1) {
            c.fillStyle = '#080504';
            roundRect(c, x + 34, 190 + s * 14, 92, 6, 3);
            c.fill();
          }
        }
      }

      // Stencilled on the wall, faint.
      c.save();
      c.fillStyle = 'rgba(243, 238, 233, 0.035)';
      c.font = `800 92px ${MONO}`;
      c.textAlign = 'center';
      c.fillText('POD 01', POD.x, 216);
      c.restore();

      // Pipes: two along the ceiling, risers at both ends.
      pipeH(c, 0, W, 104, 18);
      pipeH(c, 0, W, 136, 7);
      pipeV(c, 54, 104, FLOOR, 20);
      pipeV(c, 1236, 104, FLOOR, 14);

      // The line from the gauge into the pod.
      pipeH(c, GAUGE.x + GAUGE.r + 6, markPoint(13.8, 40).x + 6, 440, 9);
      flange(c, GAUGE.x + GAUGE.r + 26, 440, 9, false);

      // The vent line from the hose to Gasket's lever box.
      pipeH(c, 686, LEVER.x - 12, 250, 8);
      pipeV(c, LEVER.x - 19, 250, 440, 8);
      elbow(c, LEVER.x - 19, 250, 8);
      flange(c, 730, 250, 8, false);

      paintLeverBox(c);
      paintGauge(c);

      // Floor: grating in perspective, a hazard edge, the burner plate and the pod's shadow.
      c.fillStyle = '#100B09';
      c.fillRect(0, FLOOR, W, H - FLOOR);
      c.strokeStyle = 'rgba(243, 238, 233, 0.035)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = -400; x <= W + 400; x += 64) {
        c.moveTo(POD.x + (x - POD.x) * 0.55, FLOOR + 14);
        c.lineTo(x, H);
      }
      for (let k = 0; k < 6; k += 1) {
        const y = FLOOR + 14 + Math.pow(k / 6, 1.6) * (H - FLOOR - 14);
        c.moveTo(0, y);
        c.lineTo(W, y);
      }
      c.stroke();
      hazard(c, 0, FLOOR, W, 12);

      c.fillStyle = 'rgba(0, 0, 0, 0.55)';
      c.beginPath();
      c.ellipse(POD.x, FLOOR + 6, 170, 14, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.ellipse(GASKET.x + 20, FLOOR + 4, 110, 10, 0, 0, TAU);
      c.fill();
      const plate = c.createLinearGradient(0, 566, 0, FLOOR);
      plate.addColorStop(0, '#4A3B33');
      plate.addColorStop(1, '#1A1310');
      c.fillStyle = plate;
      roundRect(c, POD.x - 104, 568, 208, 34, 4);
      c.fill();
      c.fillStyle = '#0B0706';
      roundRect(c, POD.x - 78, 572, 156, 8, 4);
      c.fill();
      for (let i = 0; i < 4; i += 1) rivet(c, POD.x - 90 + i * 60, 592, 2.6);
    }

    function paintLeverBox(c) {
      const x = LEVER.x - 52;
      const y = 434;
      const box = c.createLinearGradient(x, 0, x + 60, 0);
      box.addColorStop(0, '#4E3F36');
      box.addColorStop(1, '#1E1613');
      c.fillStyle = 'rgba(0, 0, 0, 0.45)';
      roundRect(c, x + 5, y + 8, 62, 96, 6);
      c.fill();
      c.fillStyle = box;
      roundRect(c, x, y, 62, 96, 6);
      c.fill();
      for (const [rx, ry] of [
        [x + 8, y + 8],
        [x + 54, y + 8],
        [x + 8, y + 88],
        [x + 54, y + 88],
      ]) {
        rivet(c, rx, ry, 2.6);
      }
      // The label plate.
      c.fillStyle = '#0D0908';
      roundRect(c, x + 8, y + 18, 34, 18, 3);
      c.fill();
      c.fillStyle = COLORS.heat;
      c.font = `800 11px ${MONO}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('VENT', x + 25, y + 27.5);

      // The quadrant the lever travels: SHUT up top, OPEN when pulled down.
      c.strokeStyle = 'rgba(243, 238, 233, 0.12)';
      c.lineWidth = 10;
      c.beginPath();
      c.arc(LEVER.x, LEVER.y, 62, LEVER.closed - 0.06, LEVER.open + 0.06);
      c.stroke();
      c.strokeStyle = 'rgba(240, 90, 24, 0.55)';
      c.lineWidth = 10;
      c.beginPath();
      c.arc(LEVER.x, LEVER.y, 62, LEVER.open - 0.3, LEVER.open + 0.06);
      c.stroke();
      c.fillStyle = COLORS.muted;
      c.font = `700 11px ${MONO}`;
      const shut = { x: LEVER.x + Math.cos(LEVER.closed - 0.25) * 84, y: LEVER.y + Math.sin(LEVER.closed - 0.25) * 84 };
      const open = { x: LEVER.x + Math.cos(LEVER.open + 0.3) * 84, y: LEVER.y + Math.sin(LEVER.open + 0.3) * 84 };
      c.fillText('SHUT', shut.x, shut.y);
      c.fillStyle = COLORS.heat;
      c.fillText('OPEN', open.x, open.y);
    }

    function paintGauge(c) {
      const { x, y, r } = GAUGE;
      c.fillStyle = 'rgba(0, 0, 0, 0.5)';
      disc(c, x + 8, y + 12, r + 20);
      const bezel = c.createLinearGradient(x - r, y - r, x + r, y + r);
      bezel.addColorStop(0, '#7B675B');
      bezel.addColorStop(0.45, '#3E312A');
      bezel.addColorStop(1, '#17110E');
      c.fillStyle = bezel;
      disc(c, x, y, r + 18);
      c.fillStyle = '#0F0A08';
      disc(c, x, y, r + 5);
      for (let i = 0; i < 8; i += 1) {
        const a = (i * TAU) / 8 + TAU / 16;
        rivet(c, x + Math.cos(a) * (r + 11.5), y + Math.sin(a) * (r + 11.5), 3);
      }
      const face = c.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.1, x, y, r);
      face.addColorStop(0, '#241A16');
      face.addColorStop(1, '#0E0907');
      c.fillStyle = face;
      disc(c, x, y, r);

      // The target zone, and the red band below the blowout.
      c.lineCap = 'butt';
      c.strokeStyle = COLORS.heat;
      c.lineWidth = 16;
      c.beginPath();
      c.arc(x, y, r - 24, psiAngle(65), psiAngle(85));
      c.stroke();
      for (let p = 92; p < 100; p += 2) {
        c.strokeStyle = (p / 2) % 2 ? COLORS.danger : '#5A1A0C';
        c.beginPath();
        c.arc(x, y, r - 24, psiAngle(p), psiAngle(p + 2));
        c.stroke();
      }
      c.strokeStyle = 'rgba(232, 57, 29, 0.35)';
      c.beginPath();
      c.arc(x, y, r - 24, psiAngle(85.4), psiAngle(92));
      c.stroke();

      for (let p = 0; p <= 100; p += 2) {
        const a = psiAngle(p);
        const major = p % 10 === 0;
        const len = major ? 20 : p % 5 === 0 ? 13 : 8;
        c.strokeStyle = major ? COLORS.cream : 'rgba(243, 238, 233, 0.45)';
        c.lineWidth = major ? 3 : 1.4;
        c.beginPath();
        c.moveTo(x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8));
        c.lineTo(x + Math.cos(a) * (r - 8 - len), y + Math.sin(a) * (r - 8 - len));
        c.stroke();
      }
      c.font = `700 19px ${MONO}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (let p = 0; p <= 100; p += 10) {
        const a = psiAngle(p);
        c.fillStyle = p >= 65 && p <= 85 ? COLORS.amber : p > 85 ? '#F07A5E' : COLORS.cream;
        c.fillText(String(p), x + Math.cos(a) * (r - 54), y + Math.sin(a) * (r - 54));
      }
      c.fillStyle = COLORS.muted;
      c.font = `700 16px ${MONO}`;
      c.fillText('PSI', x, y + 50);
      c.fillStyle = COLORS.heat;
      c.font = `700 13px ${MONO}`;
      c.fillText('TARGET 65–85', x, y + 74);
      c.fillStyle = 'rgba(243, 238, 233, 0.35)';
      c.font = `700 11px ${MONO}`;
      c.fillText('POD 01 · PRESSURE', x, y - 46);
      // The stop pin past 100.
      const pin = psiAngle(104);
      c.fillStyle = COLORS.metalLight;
      disc(c, x + Math.cos(pin) * (r - 20), y + Math.sin(pin) * (r - 20), 4);
    }

    function paintVignette(c, color, inner) {
      const g = c.createRadialGradient(W / 2, H / 2 + 20, inner, W / 2, H / 2, 820);
      g.addColorStop(0, color.replace(/[\d.]+\)$/, '0)'));
      g.addColorStop(1, color);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }

    return { resize, reset, event, frame };
  }

  // ------------------------------------------------------------- helpers

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function makePuff(size, rgb) {
    const c = makeCanvas(size, size);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, `rgba(${rgb}, 0.95)`);
    g.addColorStop(0.4, `rgba(${rgb}, 0.5)`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return c;
  }

  function makeGlow(size, rgb) {
    const c = makeCanvas(size, size);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, `rgba(${rgb}, 1)`);
    g.addColorStop(0.25, `rgba(${rgb}, 0.45)`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return c;
  }

  // Crack lines across the gauge glass, from a point near its centre.
  function makeCracks() {
    const lines = [];
    for (let i = 0; i < 7; i += 1) {
      let a = i * 0.9 + 0.3;
      let px = -24;
      let py = -30;
      const line = [[px, py]];
      for (let k = 0; k < 5; k += 1) {
        a += (Math.sin(i * 7 + k * 3) * 0.5);
        px += Math.cos(a) * 26;
        py += Math.sin(a) * 26;
        if (Math.hypot(px, py) > 145) break;
        line.push([px, py]);
      }
      lines.push(line);
    }
    return lines;
  }

  function disc(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }

  function ellipse(c, x, y, rx, ry) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, TAU);
    c.fill();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function rivet(c, x, y, r) {
    c.fillStyle = COLORS.rivet;
    disc(c, x, y, r);
    c.fillStyle = 'rgba(243, 238, 233, 0.12)';
    disc(c, x - r * 0.3, y - r * 0.3, r * 0.45);
  }

  function pipeH(c, x0, x1, y, r) {
    const g = c.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, '#16100D');
    g.addColorStop(0.3, '#4A3B33');
    g.addColorStop(0.45, '#5A483E');
    g.addColorStop(1, '#100B09');
    c.fillStyle = g;
    c.fillRect(x0, y - r, x1 - x0, r * 2);
    for (let x = x0 + 150; x < x1 - 30 && r > 12; x += 280) flange(c, x, y, r, false);
  }

  function pipeV(c, x, y0, y1, r) {
    const g = c.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, '#16100D');
    g.addColorStop(0.3, '#4A3B33');
    g.addColorStop(0.45, '#5A483E');
    g.addColorStop(1, '#100B09');
    c.fillStyle = g;
    c.fillRect(x - r, y0, r * 2, y1 - y0);
    for (let y = y0 + 140; y < y1 - 30 && r > 12; y += 200) flange(c, x, y, r, true);
  }

  function elbow(c, x, y, r) {
    c.fillStyle = '#3E312A';
    disc(c, x, y, r * 1.35);
    c.fillStyle = 'rgba(243, 238, 233, 0.08)';
    disc(c, x - r * 0.4, y - r * 0.4, r * 0.6);
  }

  function flange(c, x, y, r, vertical) {
    c.fillStyle = '#2E241F';
    if (vertical) c.fillRect(x - r - 5, y - 6, r * 2 + 10, 12);
    else c.fillRect(x - 6, y - r - 5, 12, r * 2 + 10);
    c.fillStyle = 'rgba(243, 238, 233, 0.1)';
    if (vertical) c.fillRect(x - r - 5, y - 6, r * 2 + 10, 2);
    else c.fillRect(x - 6, y - r - 5, 2, r * 2 + 10);
  }

  function hazard(c, x, y, w, h) {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.fillStyle = '#1A110D';
    c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(240, 90, 24, 0.8)';
    for (let sx = x - h; sx < x + w + h; sx += 28) {
      c.beginPath();
      c.moveTo(sx, y + h);
      c.lineTo(sx + 14, y + h);
      c.lineTo(sx + 14 + h, y);
      c.lineTo(sx + h, y);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  function bezier(a, b, cc, d, t) {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * cc + t * t * t * d;
  }

  // Mixes two #RRGGBB colours.
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (shift) => Math.round(lerp((pa >> shift) & 255, (pb >> shift) & 255, clamp(t, 0, 1)));
    return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
  }

  root.GasketRender = { create, W, H };
})(window);
