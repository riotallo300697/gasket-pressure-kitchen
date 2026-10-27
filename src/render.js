/*
 * Gasket's Pressure Kitchen: everything drawn on the canvas.
 *
 * The scene is drawn in world coordinates (the wide stage's) and placed on the
 * stage through the layout's two views, the gauge and the machine (art.js).
 * What never moves (the wall, the pipes, the gauge's face) is painted once per
 * layout and canvas size into a cache; the needle, the pod, the lever, Gasket,
 * the flames and the steam every frame. Text (popups, Gasket's line, the lever
 * hint) and confetti are drawn on the stage itself, so they stay readable when
 * the machine is drawn small. The renderer keeps its own visual state (the
 * needle's spring, particles, shake), fed by the game's events; it never
 * changes the game.
 */
(function (root) {
  'use strict';

  const { FLOOR, TAU, COLORS, MONO, GAUGE, POD, LEVER, MARK, VALVE, LID_CENTER, GASKET } = root.GasketArt;
  const { wideLayout, toStage, markPoint, psiAngle, clamp, rand, mix, makeCanvas, makePuff, makeGlow, disc, roundRect } = root.GasketArt;
  const Room = root.GasketRoom;
  const Chef = root.GasketChef;

  function create(canvas, options) {
    const ctx = canvas.getContext('2d');
    const reducedMotion = Boolean(options && options.reducedMotion);
    const touch = Boolean(options && options.touch); // the lever hint says touch rather than Space
    const paths = {};
    for (const key of Object.keys(MARK)) paths[key] = new Path2D(MARK[key]);

    let layout = wideLayout();
    let scale = 1; // device pixels per stage pixel
    let shakeX = 0; // this frame's shake, in stage pixels
    let shakeY = 0;
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
        particles: [], // steam, sparks, bolts and soot, in world coordinates
        confetti: [], // on the stage
        popups: [], // on the stage
        steamDue: 0,
        leakDue: 0,
        smokeDue: 0,
        lid: null, // the lid in flight after a blowout
        hat: null, // Gasket's toque in flight
        blown: false,
        blownAt: 0,
        soot: 0,
        cheer: 0,
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

    // A layout from art.js, the stage's CSS scale and the device's pixel ratio.
    function resize(nextLayout, stageScale, dpr) {
      layout = nextLayout;
      scale = stageScale * dpr;
      canvas.width = Math.max(1, Math.round(layout.width * scale));
      canvas.height = Math.max(1, Math.round(layout.height * scale));
      cache = paintToCanvas((c) => Room.paintRoom(c, layout));
      vignette = paintToCanvas((c) => Room.paintVignette(c, layout, 'rgba(5, 3, 2, 0.78)', 0.41));
      alarmGlow = paintToCanvas((c) => Room.paintVignette(c, layout, 'rgba(232, 57, 29, 0.9)', 0.52));
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
          popup(`×${e.combo} COMBO`, layout.combo, COLORS.amber, 28);
          fx.ringPulse = 1;
          break;
        case 'combo-lost':
          popup('COMBO LOST', layout.combo, COLORS.muted, 18);
          break;
        case 'order-up':
          popup(`+${e.bonus}  ORDER UP!`, toStage(layout.machine, POD.x, POD.y - 300), COLORS.amber, 26);
          fx.cheer = 1.6;
          fx.orderUp = 1.6;
          fx.portFlash = 1;
          puffRing(LID_CENTER.x, LID_CENTER.y + 20, 26);
          break;
        case 'shift-complete':
          fx.cheer = 4;
          confetti(150);
          break;
        case 'surge-warning':
          popup('SURGE INCOMING', toStage(layout.machine, POD.x, POD.y - 10), COLORS.amber, 18);
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

    // A line of text that rises and fades at a stage point.
    function popup(text, at, color, size) {
      fx.popups.push({ text, x: at.x, y: at.y, color, size: size * layout.text, age: 0, life: 1.3 });
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
        fx.confetti.push({
          age: 0,
          x: rand(20, layout.width - 20),
          y: rand(-140, -10),
          vx: rand(-60, 60),
          vy: rand(80, 220),
          gravity: 160,
          drag: 0.6,
          size: rand(6, 11),
          spin: rand(-9, 9),
          rot: rand(0, TAU),
          grow: 0,
          life: rand(3.2, 4.6),
          color: colors[i % colors.length],
        });
      }
    }

    function blowout() {
      fx.blown = true;
      fx.blownAt = fx.t;
      fx.flash = 1;
      fx.shake = 28;
      fx.soot = 1;
      fx.lid = { x: LID_CENTER.x, y: LID_CENTER.y, vx: rand(-70, 70), vy: -1350, rot: 0, spin: rand(-7, 7) };
      fx.hat = { x: GASKET.x - 2, y: GASKET.y - 300, vx: rand(-190, -120), vy: -760, rot: 0, spin: rand(-9, -4) };
      for (let i = 0; i < 70; i += 1) {
        const a = -Math.PI / 2 + rand(-1.6, 1.6);
        const speed = rand(250, 950);
        spawn({ kind: 'steam', x: LID_CENTER.x + rand(-60, 60), y: LID_CENTER.y + rand(-10, 30), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size: rand(30, 60), grow: 70, life: rand(0.9, 1.8), drag: 1.9, alpha: 0.9 });
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
      if (fx.blown) target = fx.t - fx.blownAt < 0.7 ? 103 : 0; // pinned on the stop, then limp
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
      }
      fx.lastLever = live ? game.lever : 0;
      if (live && game.lever > 0.5) pulledOnce = true;
      fx.hint = live && !pulledOnce ? Math.min(1, fx.hint + dt * 2) : Math.max(0, fx.hint - dt * 3);

      // Back from the brink: a close call when the needle drops into the zone after 95 PSI or more.
      if (live && game.psi >= 95) fx.brink = Math.max(fx.brink, game.psi);
      if (live && fx.brink && game.psi <= 85) {
        popup('CLOSE CALL!', toStage(layout.machine, POD.x, POD.y - 300), COLORS.amber, 24);
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
        fx.smokeDue += 6 * dt;
        while (fx.smokeDue >= 1) {
          fx.smokeDue -= 1;
          spawn({ kind: 'soot', x: LID_CENTER.x + rand(-60, 60), y: LID_CENTER.y + 50, vx: rand(-20, 20), vy: -rand(60, 120), size: rand(20, 34), grow: 30, life: rand(1.6, 2.4), drag: 0.6, alpha: 0.6 });
        }
      }

      moveParticles(fx.particles, dt);
      moveParticles(fx.confetti, dt);

      for (const p of fx.popups) p.age += dt;
      fx.popups = fx.popups.filter((p) => p.age < p.life);

      fx.shake = Math.max(0, fx.shake - dt * (fx.shake > 10 ? 30 : 14));
      fx.flash = Math.max(0, fx.flash - dt * 2.2);
      fx.cheer = Math.max(0, fx.cheer - dt);
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

      const text = bubbleFor(mode, band);
      if (text !== fx.bubbleText) {
        fx.bubbleText = text;
        fx.bubbleAge = 0;
      }
      fx.bubbleAge += dt;
    }

    // Ages, moves and drops the dead, in place.
    function moveParticles(list, dt) {
      let kept = 0;
      for (const p of list) {
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
        if (p.age < p.life) list[kept++] = p;
      }
      list.length = kept;
    }

    function fly(o, dt, gravity) {
      if (!o) return;
      o.vy += gravity * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.rot += o.spin * dt;
    }

    // Gasket's line, in the pod's own words: NAPPING, LET HIM COOK, HOLDING PRESSURE, HOLD MY HAT, IN ORBIT.
    function bubbleFor(mode, band) {
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

      const amount = reducedMotion ? 0 : fx.shake * (layout.name === 'wide' ? 1 : 0.7);
      shakeX = amount ? Math.sin(fx.t * 91) * amount * 0.8 : 0;
      shakeY = amount ? Math.cos(fx.t * 77) * amount * 0.6 : 0;
      c.setTransform(1, 0, 0, 1, Math.round(shakeX * scale), Math.round(shakeY * scale));
      if (cache) c.drawImage(cache, 0, 0);

      const heat = mode === 'ready' ? 0.15 : clamp(game.psi / 100, 0, 1);
      inView(c, layout.machine);
      drawRoomLight(c, heat);
      onStage(c);
      drawBeacons(c, game, mode, band);
      inView(c, layout.gauge);
      drawGaugeFront(c, game, mode, band);
      inView(c, layout.machine);
      drawFlames(c, mode === 'ready' ? 0.12 : clamp(game.heat / Sim.TUNING.heatMax, 0.15, 1.4));
      drawPod(c, game, mode, heat);
      const knob = drawLever(c, mode === 'ready' ? 0 : game.lever);
      Chef.draw(c, {
        mood: moodFor(mode, band),
        t: fx.t,
        lever: mode === 'ready' ? 0 : game.lever,
        knob,
        heat,
        soot: fx.soot,
        blink: fx.blink,
        hatOn: !fx.blown,
      });
      drawParticles(c);
      drawFlying(c);
      onStage(c);
      drawConfetti(c);
      drawPopups(c);
      if (fx.hint > 0) drawHint(c, toStage(layout.machine, knob.x, knob.y));
      else drawBubble(c);

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

    // Draws in a view's world coordinates from here on, shaken with the stage.
    function inView(c, view) {
      c.setTransform(scale * view.k, 0, 0, scale * view.k, scale * (view.dx + shakeX), scale * (view.dy + shakeY));
    }

    // Draws in stage coordinates from here on, shaken.
    function onStage(c) {
      c.setTransform(scale, 0, 0, scale, scale * shakeX, scale * shakeY);
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
      const reach = layout.beaconReach;
      for (const [i, b] of layout.beacons.entries()) {
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
          const beam = c.createLinearGradient(0, 0, reach, 0);
          beam.addColorStop(0, 'rgba(255, 179, 92, 0.9)');
          beam.addColorStop(1, 'rgba(255, 179, 92, 0)');
          c.fillStyle = beam;
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(reach, -reach * 0.19);
          c.lineTo(reach, reach * 0.19);
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

    // `burner` is the heat as a share of the most the burner gives.
    function drawFlames(c, burner) {
      if (fx.blown) return;
      const power = burner + fx.surgeFlare * 0.3;
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
      // A hot pod rattles on its feet; the room itself stays still (it shakes only on a surge or a blowout).
      const rattle = mode === 'playing' ? clamp((psi - 80) / 20, 0, 1) : 0;
      const jx = rattle ? Math.sin(fx.t * 64) * rattle * rattle * 3.4 : 0;
      const jy = rattle ? Math.cos(fx.t * 71) * rattle * rattle * 1.8 : 0;

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
        drawValveStem(c, rattle, mode === 'ready' ? 0 : game.lever);
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
    function drawValveStem(c, rattle, open) {
      const tilt = rattle > 0.2 ? Math.sin(fx.t * 47) * rattle * 0.22 : 0;
      c.save();
      c.translate(32, 16);
      c.rotate(tilt);
      c.fillStyle = '#CFC4BA';
      c.fillRect(-1.5, -7, 3, 7);
      c.fillStyle = 'rgba(13, 9, 8, 0.35)';
      c.fillRect(-1.5, -4.2, 3, 0.6);
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

    function moodFor(mode, band) {
      if (fx.blown) return 'dazed';
      if (mode === 'ready') return 'napping';
      if (fx.cheer > 0 || mode === 'won') return 'cheer';
      if (band === 'critical') return 'panic';
      if (band === 'hot') return 'worried';
      if (band === 'zone') return 'happy';
      return 'idle';
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
        }
      }
      c.globalAlpha = 1;
    }

    function drawConfetti(c) {
      for (const p of fx.confetti) {
        const life = p.age / p.life;
        c.globalAlpha = life > 0.8 ? (1 - life) * 5 : 1;
        c.save();
        c.translate(p.x + Math.sin(p.age * 5 + p.rot) * 10, p.y);
        c.rotate(p.rot);
        c.fillStyle = p.color;
        c.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.age * 6 + p.rot)) + 1);
        c.restore();
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
        Chef.toque(c, 0);
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
        const half = c.measureText(p.text).width / 2 + 10;
        const x = clamp(p.x, half, layout.width - half);
        const y = p.y - rise * 40 * layout.text;
        c.lineWidth = 5;
        c.strokeStyle = COLORS.bg;
        c.strokeText(p.text, x, y);
        c.fillStyle = p.color;
        c.fillText(p.text, x, y);
      }
      c.globalAlpha = 1;
    }

    // A pointer to the lever for a first-time cook, given the knob's stage point: beside the knob
    // on a wide stage, above it on a tall one.
    function drawHint(c, knob) {
      const ts = layout.text;
      const wide = layout.name === 'wide';
      const [first, second] = touch ? ['TOUCH & HOLD', 'ANYWHERE TO VENT'] : ['HOLD SPACE', 'OR CLICK & HOLD'];
      const big = `800 ${15 * ts}px ${MONO}`;
      const small = `700 ${11 * ts}px ${MONO}`;
      c.save();
      c.font = big;
      let w = c.measureText(first).width;
      c.font = small;
      w = Math.max(w, c.measureText(second).width) + 28 * ts;
      const h = 52 * ts;
      const x = clamp(knob.x + (wide ? -150 : -30) * ts, w / 2 + 8, layout.width - w / 2 - 8);
      const y = knob.y + (wide ? -64 : -100) * ts;
      c.globalAlpha = fx.hint * (0.75 + 0.25 * Math.sin(fx.t * 6));
      c.fillStyle = 'rgba(13, 9, 8, 0.92)';
      roundRect(c, x - w / 2, y - h / 2, w, h, 6);
      c.fill();
      c.strokeStyle = COLORS.amber;
      c.lineWidth = 2;
      c.stroke();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = big;
      c.fillStyle = COLORS.cream;
      c.fillText(first, x, y - 8 * ts);
      c.font = small;
      c.fillStyle = COLORS.amber;
      c.fillText(second, x, y + 11 * ts);

      // An arrow from the box to the knob.
      const start = wide ? { x: x + w / 2 + 4, y } : { x, y: y + h / 2 + 4 };
      const end = wide ? { x: knob.x - 22, y: knob.y - 10 } : { x: knob.x - 4, y: knob.y - 22 * ts };
      const bend = wide ? { x: end.x - 10, y: start.y } : { x: start.x, y: end.y - 12 };
      c.strokeStyle = COLORS.amber;
      c.lineWidth = 3;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(start.x, start.y);
      c.quadraticCurveTo(bend.x, bend.y, end.x, end.y);
      c.stroke();
      const a = Math.atan2(end.y - bend.y, end.x - bend.x); // the curve's heading where it meets the knob
      c.beginPath();
      c.moveTo(end.x, end.y);
      c.lineTo(end.x - Math.cos(a - 0.5) * 11, end.y - Math.sin(a - 0.5) * 11);
      c.moveTo(end.x, end.y);
      c.lineTo(end.x - Math.cos(a + 0.5) * 11, end.y - Math.sin(a + 0.5) * 11);
      c.stroke();
      c.restore();
    }

    // Gasket's line, in a bubble whose tail points at his toque.
    function drawBubble(c) {
      const text = fx.bubbleText;
      if (!text) return;
      const ts = layout.text;
      const tip = toStage(layout.machine, GASKET.x - 28, GASKET.y - 326);
      const pop = Math.min(1, fx.bubbleAge / 0.16);
      const s = 0.85 + 0.15 * (1 - Math.pow(1 - pop, 3));
      c.save();
      c.font = `800 ${16 * ts}px ${MONO}`;
      const w = c.measureText(text).width + 26 * ts;
      const h = 36 * ts;
      const x = clamp(tip.x - 30 * ts, w / 2 + 8, layout.width - w / 2 - 8);
      const y = tip.y - 34 * ts;
      c.translate(x, y);
      c.scale(s, s);
      c.fillStyle = COLORS.cream;
      roundRect(c, -w / 2, -h / 2, w, h, 8 * ts);
      c.fill();
      const base = clamp(tip.x - x - 14 * ts, -w / 2 + 14 * ts, w / 2 - 14 * ts);
      c.beginPath();
      c.moveTo(base - 10 * ts, h / 2 - 2);
      c.lineTo(base + 10 * ts, h / 2 - 2);
      c.lineTo(tip.x - x, tip.y - y);
      c.closePath();
      c.fill();
      c.fillStyle = COLORS.bg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, 0, 1);
      c.restore();
    }

    // This frame's shake in stage pixels, for what the page lays over the canvas (the readout).
    function shake() {
      return { x: shakeX, y: shakeY };
    }

    return { resize, reset, event, frame, shake };
  }

  // ------------------------------------------------------------- helpers

  // Crack lines across the gauge glass, from a point near its centre.
  function makeCracks() {
    const lines = [];
    for (let i = 0; i < 7; i += 1) {
      let a = i * 0.9 + 0.3;
      let px = -24;
      let py = -30;
      const line = [[px, py]];
      for (let k = 0; k < 5; k += 1) {
        a += Math.sin(i * 7 + k * 3) * 0.5;
        px += Math.cos(a) * 26;
        py += Math.sin(a) * 26;
        if (Math.hypot(px, py) > 145) break;
        line.push([px, py]);
      }
      lines.push(line);
    }
    return lines;
  }

  root.GasketRender = { create };
})(window);
