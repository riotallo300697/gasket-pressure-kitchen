/*
 * Gasket's Pressure Kitchen: the rules of the game, with no DOM and no drawing.
 *
 * The page steps a game 120 times a second (src/main.js); the tests step it in
 * Node (test/sim.test.js). A game is plain data: everything random comes from
 * its seed, so the same seed and the same presses replay the same game.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GasketSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Every number that shapes the game, in one place.
  const TUNING = Object.freeze({
    maxPsi: 100, // the valve blows here
    zoneLow: 65, // the target cooking zone, both ends included
    zoneHigh: 85,
    criticalPsi: 92, // alarms from here up
    startPsi: 45,

    heatStart: 6, // PSI per second the burner adds while cooking the first order
    heatPerOrder: 0.75, // each order served turns the burner up this much...
    heatMax: 16, // ...up to here, deep in overtime
    heatClimb: 0.3, // a hotter pod climbs faster: ×0.85 at 0 PSI, ×1.15 at 100 PSI
    heatFlicker: 0.12, // the flame's slow wobble, as a share of the heat

    ventRate: 0.24, // share of the pressure the fully open valve lets out per second
    leverPull: 22, // 1/s: how fast the lever follows a press...
    leverReturn: 14, // ...and how fast its spring brings it back up

    pointsPerSecond: 10, // in the zone, times the combo
    comboAt: [0, 3, 6, 10, 15], // seconds in the zone without a break for ×1 … ×5
    comboGrace: 0.4, // seconds the needle may spend out of the zone before the combo breaks

    orderTimeStart: 8, // seconds in the zone to cook the first order
    orderTimeStep: 1,
    orderTimeMax: 14,
    orderBonus: 150, // points for serving order n: orderBonus + orderBonusStep × (n - 1)
    orderBonusStep: 50,
    shiftOrders: 8, // serve this many to complete the shift (then overtime, if the cook wants)

    surgeFromOrder: 2, // the burner starts surging once the first order is out
    surgeGap: [7, 14], // seconds of calm between surges
    surgeWarning: 1.5, // seconds of warning before one hits
    surgeLength: [2.5, 3.5],
    surgeBoost: 0.5, // the heat at the height of a surge: ×1.5
    surgeRamp: 0.4, // seconds a surge takes to build up or die down
  });

  const DISHES = Object.freeze([
    'Cheddar Chowder',
    'Ember Dumplings',
    'Piston Pho',
    'Rivet Risotto',
    'Boiler Bao',
    'Gouda Goulash',
    'Molten Mac & Bolts',
    'Turbine Tagine',
    'Spark-Plug Stew',
    'Full-Pressure Fondue',
  ]);

  function createGame(seed) {
    const g = {
      seed: seed >>> 0,
      rngState: seed >>> 0,
      over: false, // true once the valve has blown
      time: 0, // seconds of cooking
      psi: TUNING.startPsi,
      lever: 0, // 0 = closed, 1 = pulled all the way down
      heat: 0, // PSI per second the burner adds right now
      vent: 0, // PSI per second the valve lets out right now
      points: 0, // exact score; `score` is its whole part
      score: 0,
      combo: 1,
      bestCombo: 1,
      inZone: false,
      streak: 0, // seconds in the zone without a break
      outside: 0, // seconds since the needle left the zone
      zoneTime: 0, // seconds in the zone, whole game
      served: 0,
      shiftDone: false,
      order: newOrder(1),
      surge: { stage: 'calm', timer: 0, level: 0 }, // stage: calm, warning or surge
      flicker: [0, 0],
      events: [],
    };
    g.flicker = [random(g) * 2 * Math.PI, random(g) * 2 * Math.PI];
    g.surge.timer = between(g, TUNING.surgeGap);
    g.heat = burnerHeat(g);
    return g;
  }

  // Advances the game by dt seconds; `venting` is whether the cook holds the lever.
  function step(g, dt, venting) {
    if (g.over || !(dt > 0)) return g;
    const T = TUNING;
    g.time += dt;

    const target = venting ? 1 : 0;
    const rate = target > g.lever ? T.leverPull : T.leverReturn;
    g.lever += (target - g.lever) * (1 - Math.exp(-rate * dt));

    updateSurge(g, dt);
    g.heat = burnerHeat(g);
    // The valve is an orifice: it lets out a share of whatever pressure is behind it.
    g.vent = T.ventRate * g.lever * g.psi;
    g.psi = Math.max(0, g.psi + (g.heat - g.vent) * dt);

    if (g.psi >= T.maxPsi) {
      g.psi = T.maxPsi;
      blowOut(g);
      return g;
    }
    updateZone(g, dt);
    g.score = Math.floor(g.points);
    return g;
  }

  function burnerHeat(g) {
    const T = TUNING;
    const base = Math.min(T.heatMax, T.heatStart + T.heatPerOrder * (g.order.number - 1));
    const wobble = 0.6 * Math.sin(0.9 * g.time + g.flicker[0]) + 0.4 * Math.sin(2.3 * g.time + g.flicker[1]);
    const climb = 1 - T.heatClimb / 2 + (T.heatClimb * g.psi) / T.maxPsi;
    return base * (1 + T.heatFlicker * wobble) * climb * (1 + T.surgeBoost * g.surge.level);
  }

  function updateSurge(g, dt) {
    const T = TUNING;
    const s = g.surge;
    if (g.order.number >= T.surgeFromOrder) {
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.stage === 'calm') {
          s.stage = 'warning';
          s.timer += T.surgeWarning;
          emit(g, 'surge-warning');
        } else if (s.stage === 'warning') {
          s.stage = 'surge';
          s.timer += between(g, T.surgeLength);
          emit(g, 'surge');
        } else {
          s.stage = 'calm';
          s.timer += between(g, T.surgeGap);
          emit(g, 'surge-end');
        }
      }
    }
    const target = s.stage === 'surge' ? 1 : 0;
    const change = dt / T.surgeRamp;
    s.level = target > s.level ? Math.min(target, s.level + change) : Math.max(target, s.level - change);
  }

  function updateZone(g, dt) {
    const T = TUNING;
    if (g.psi >= T.zoneLow && g.psi <= T.zoneHigh) {
      if (!g.inZone) emit(g, 'zone-enter');
      g.inZone = true;
      g.outside = 0;
      g.streak += dt;
      g.zoneTime += dt;
      const combo = comboFor(g.streak);
      if (combo > g.combo) {
        g.combo = combo;
        g.bestCombo = Math.max(g.bestCombo, combo);
        emit(g, 'combo', { combo });
      }
      g.points += T.pointsPerSecond * g.combo * dt;
      g.order.cooked += dt;
      if (g.order.cooked >= g.order.cookTime) serveOrder(g);
    } else {
      if (g.inZone) emit(g, 'zone-exit', { side: g.psi > T.zoneHigh ? 'high' : 'low' });
      g.inZone = false;
      g.outside += dt;
      if (g.streak > 0 && g.outside >= T.comboGrace) {
        if (g.combo > 1) emit(g, 'combo-lost', { combo: g.combo });
        g.streak = 0;
        g.combo = 1;
      }
    }
  }

  function serveOrder(g) {
    const T = TUNING;
    const done = g.order;
    const bonus = T.orderBonus + T.orderBonusStep * (done.number - 1);
    g.points += bonus;
    g.served += 1;
    g.order = newOrder(done.number + 1);
    emit(g, 'order-up', { number: done.number, dish: done.dish, bonus });
    if (g.served === T.shiftOrders && !g.shiftDone) {
      g.shiftDone = true;
      emit(g, 'shift-complete', { served: g.served });
    }
  }

  function blowOut(g) {
    g.over = true;
    g.inZone = false;
    g.score = Math.floor(g.points);
    emit(g, 'blowout', { score: g.score });
  }

  function newOrder(number) {
    const T = TUNING;
    return {
      number,
      dish: DISHES[(number - 1) % DISHES.length],
      cookTime: Math.min(T.orderTimeMax, T.orderTimeStart + T.orderTimeStep * (number - 1)),
      cooked: 0,
    };
  }

  // ×1 … ×5 for so many seconds in the zone without a break.
  function comboFor(streak) {
    let combo = 0;
    for (const at of TUNING.comboAt) if (streak >= at) combo += 1;
    return Math.max(1, combo);
  }

  // How far the current streak is from the next combo, 0 to 1 (1 at the top combo).
  function comboProgress(g) {
    const at = TUNING.comboAt;
    if (g.combo >= at.length) return 1;
    const from = at[g.combo - 1];
    return Math.min(1, Math.max(0, (g.streak - from) / (at[g.combo] - from)));
  }

  // Where a pressure sits: low, zone, hot, critical or blowout.
  function band(psi) {
    const T = TUNING;
    if (psi >= T.maxPsi) return 'blowout';
    if (psi >= T.criticalPsi) return 'critical';
    if (psi > T.zoneHigh) return 'hot';
    if (psi >= T.zoneLow) return 'zone';
    return 'low';
  }

  function summary(g) {
    return {
      score: g.score,
      served: g.served,
      bestCombo: g.bestCombo,
      time: g.time,
      zoneShare: g.time > 0 ? g.zoneTime / g.time : 0,
      shiftDone: g.shiftDone,
    };
  }

  // Hands over the events since the last call: zone-enter, zone-exit, combo, combo-lost,
  // order-up, shift-complete, surge-warning, surge, surge-end and blowout.
  function takeEvents(g) {
    const events = g.events;
    g.events = [];
    return events;
  }

  function emit(g, type, detail) {
    g.events.push(Object.assign({ type, time: g.time }, detail));
  }

  // mulberry32: small, fast and good enough for flames and surges.
  function random(g) {
    g.rngState = (g.rngState + 0x6d2b79f5) >>> 0;
    let t = g.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function between(g, range) {
    return range[0] + (range[1] - range[0]) * random(g);
  }

  return { TUNING, DISHES, createGame, step, comboFor, comboProgress, band, summary, takeEvents };
});
