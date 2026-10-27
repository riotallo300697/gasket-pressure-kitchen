/*
 * Gasket's Pressure Kitchen: the control room's parts that never move (the wall,
 * the pipes, the floor, the gauge's face, the lever's box), painted once per
 * layout and canvas size into the renderer's cache.
 */
(function (root) {
  'use strict';

  const { FLOOR, TAU, COLORS, MONO, GAUGE, POD, LEVER, GASKET, markPoint, psiAngle, toStage, disc, roundRect, rivet } = root.GasketArt;

  // The room for a layout: the wall and the floor on its stage, the gauge's face and the
  // machine's fixtures (vent line, lever box, burner plate, shadows) through its views.
  function paintRoom(c, layout) {
    const { width: w, height: h, floor } = layout;
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, w, h);
    paintWall(c, w, floor, layout.name === 'wide' ? [1, 6] : [2]);

    if (layout.name === 'wide') {
      // Stencilled on the wall, faint.
      c.save();
      c.fillStyle = 'rgba(243, 238, 233, 0.035)';
      c.font = `800 92px ${MONO}`;
      c.textAlign = 'center';
      c.fillText('POD 01', POD.x, 216);
      c.restore();

      // Pipes: two along the ceiling, risers at both ends, and the line from the gauge into the pod.
      pipeH(c, 0, w, 104, 18);
      pipeH(c, 0, w, 136, 7);
      pipeV(c, 54, 104, floor, 20);
      pipeV(c, 1236, 104, floor, 14);
      pipeH(c, GAUGE.x + GAUGE.r + 6, markPoint(13.8, 40).x + 6, 440, 9);
      flange(c, GAUGE.x + GAUGE.r + 26, 440, 9, false);
    } else {
      // A pipe under the HUD, thin risers at the sides, and the stencil where there is room for it.
      pipeH(c, 0, w, 146, 9);
      pipeV(c, 12, 146, floor, 6);
      pipeV(c, w - 12, 146, floor, 6);
      if (layout.stencil) {
        c.save();
        c.fillStyle = 'rgba(243, 238, 233, 0.035)';
        c.font = `800 72px ${MONO}`;
        c.textAlign = 'center';
        c.fillText('POD 01', layout.stencil.x, layout.stencil.y);
        c.restore();
      }
    }

    inView(c, layout.machine, () => {
      // The vent line from the hose to Gasket's lever box.
      pipeH(c, 686, LEVER.x - 12, 250, 8);
      pipeV(c, LEVER.x - 19, 250, 440, 8);
      elbow(c, LEVER.x - 19, 250, 8);
      flange(c, 730, 250, 8, false);
      paintLeverBox(c);
    });
    inView(c, layout.gauge, () => paintGauge(c));
    paintFloor(c, w, h, floor, toStage(layout.machine, POD.x, 0).x);
    inView(c, layout.machine, () => paintFixtures(c));
  }

  function inView(c, view, paint) {
    c.save();
    c.transform(view.k, 0, 0, view.k, view.dx, view.dy);
    paint();
    c.restore();
  }

  // Wall panels with rivets; the panels numbered in `grilles` carry vent grilles.
  function paintWall(c, w, floor, grilles) {
    for (let x = 0, i = 0; x < w; x += 160, i += 1) {
      c.fillStyle = i % 2 ? COLORS.panel : '#120C0A';
      c.fillRect(x + 3, 20, 154, floor - 30);
      c.fillStyle = 'rgba(243, 238, 233, 0.025)';
      c.fillRect(x + 3, 20, 154, 2);
      c.fillStyle = 'rgba(0, 0, 0, 0.35)';
      c.fillRect(x + 3, floor - 12, 154, 2);
      for (const [rx, ry] of [
        [x + 13, 32],
        [x + 147, 32],
        [x + 13, floor - 22],
        [x + 147, floor - 22],
      ]) {
        rivet(c, rx, ry, 2.6);
      }
      if (grilles.includes(i)) {
        for (let s = 0; s < 7; s += 1) {
          c.fillStyle = '#080504';
          roundRect(c, x + 34, 190 + s * 14, 92, 6, 3);
          c.fill();
        }
      }
    }
  }

  // The floor: grating in perspective toward the pod, with a hazard edge.
  function paintFloor(c, w, h, floor, towardX) {
    c.fillStyle = '#100B09';
    c.fillRect(0, floor, w, h - floor);
    c.strokeStyle = 'rgba(243, 238, 233, 0.035)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = -400; x <= w + 400; x += 64) {
      c.moveTo(towardX + (x - towardX) * 0.55, floor + 14);
      c.lineTo(x, h);
    }
    for (let k = 0; k < 6; k += 1) {
      const y = floor + 14 + Math.pow(k / 6, 1.6) * (h - floor - 14);
      c.moveTo(0, y);
      c.lineTo(w, y);
    }
    c.stroke();
    hazard(c, 0, floor, w, 12);
  }

  // What stands on the floor, in world coordinates: shadows and the burner plate under the pod.
  function paintFixtures(c) {
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

  // Darkens (or tints) the edges of a layout's stage with an rgba() colour, clear up to `inner`
  // (a share of the distance from the centre to a corner).
  function paintVignette(c, layout, color, inner) {
    const { width: w, height: h } = layout;
    const reach = Math.hypot(w, h) / 2;
    const g = c.createRadialGradient(w / 2, h / 2 + 20, reach * inner, w / 2, h / 2, reach * 1.12);
    g.addColorStop(0, color.replace(/[\d.]+\)$/, '0)')); // the same colour, transparent
    g.addColorStop(1, color);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
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

  root.GasketRoom = { paintRoom, paintVignette };
})(window);
