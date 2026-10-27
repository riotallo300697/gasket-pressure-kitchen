/*
 * Gasket's Pressure Kitchen: what the room, Gasket and the renderer share: the
 * stage's size and layout, the palette, and small canvas helpers.
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
    rivet: '#2E221D',
    metalDark: '#241B17',
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

  root.GasketArt = {
    W, H, FLOOR, DEG, TAU, COLORS, MONO,
    GAUGE, POD, LEVER, GASKET, SHOULDER, ARM, BEACONS, MARK, VALVE, LID_CENTER,
    markPoint, psiAngle, clamp, rand, bezier, mix,
    makeCanvas, makePuff, makeGlow, disc, ellipse, roundRect, rivet,
  };
})(window);
