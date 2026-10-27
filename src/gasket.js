/*
 * Gasket's Pressure Kitchen: Gasket, the robot rat chef at the lever.
 *
 * He is drawn from his feet up, facing the lever; his near arm (two segments,
 * elbow down) reaches wherever the lever's knob is. A pose says how he looks
 * this frame: { mood, t, lever, knob, heat, soot, blink, hatOn }, where mood is
 * napping, idle, happy, worried, panic, cheer or dazed.
 */
(function (root) {
  'use strict';

  const { TAU, COLORS, MONO, GASKET, SHOULDER, ARM, clamp, disc, ellipse, roundRect, bezier, makeGlow } = root.GasketArt;
  const glow = makeGlow(64, '240, 90, 24');

  function draw(c, pose) {
    const { mood, t, lever, knob, heat } = pose;
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
    drawBody(c, heat, pose.soot);
    drawHead(c, pose);
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
    if (pose.soot > 0) {
      c.fillStyle = `rgba(18, 12, 10, ${0.45 * pose.soot})`;
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

  function drawBody(c, heat, soot) {
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
    if (soot > 0) {
      c.fillStyle = `rgba(18, 12, 10, ${0.55 * soot})`;
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

  function drawHead(c, pose) {
    const { mood, t, soot } = pose;
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
    c.drawImage(glow, -88 - 14, -226 - 14, 28, 28);
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
      if (soot > 0) {
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
    drawEyes(c, pose);
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
    if (soot > 0) {
      c.fillStyle = `rgba(18, 12, 10, ${0.5 * soot})`;
      ellipse(c, 10, -250, 20, 14);
      ellipse(c, -58, -232, 12, 8);
    }
    if (pose.hatOn) drawToque(c, pose);
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
    c.drawImage(glow, -r * 0.7, -r * 0.6, r * 1.3, r * 1.3);
    c.restore();
    c.restore();
  }

  function drawEyes(c, pose) {
    const { mood } = pose;
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
    const closed = pose.blink > 0 && mood !== 'napping' && mood !== 'dazed';
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
        c.arc(ex + Math.sin(pose.t * 40) * 1.5, ey, 2, 0, TAU);
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

  function drawToque(c, pose) {
    c.save();
    c.translate(-2, -276);
    c.rotate(-0.1 + (pose.mood === 'panic' ? Math.sin(pose.t * 30) * 0.06 : 0));
    toque(c, pose.soot);
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

  root.GasketChef = { draw, toque };
})(window);
