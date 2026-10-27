// The rules of the game, stepped in Node: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../src/sim.js');

const { TUNING } = Sim;
const DT = 1 / 120;

// Steps a game for `seconds`; `vent` is a boolean or a function of the game. Returns the events.
function run(game, seconds, vent = false) {
  const events = [];
  const end = game.time + seconds;
  while (!game.over && game.time < end - 1e-9) {
    Sim.step(game, DT, typeof vent === 'function' ? vent(game) : vent);
    events.push(...Sim.takeEvents(game));
  }
  return events;
}

// A cook who vents above `high` and lets go below `low`.
function cook(low, high) {
  let venting = false;
  return (game) => (venting = game.psi > high ? true : game.psi < low ? false : venting);
}

// A game sitting at `psi` with the lever closed.
function gameAt(psi, seed = 7) {
  const game = Sim.createGame(seed);
  game.psi = psi;
  return game;
}

test('a new game starts below the zone, cooking, with nothing scored', () => {
  const game = Sim.createGame(1);
  assert.equal(game.psi, TUNING.startPsi);
  assert.ok(game.psi < TUNING.zoneLow);
  assert.equal(game.over, false);
  assert.equal(game.score, 0);
  assert.equal(game.combo, 1);
  assert.equal(game.order.number, 1);
});

test('pressure rises continuously while nobody touches the lever', () => {
  const game = Sim.createGame(1);
  let last = game.psi;
  for (let i = 0; i < 4; i += 1) {
    run(game, 1);
    assert.ok(game.psi > last + 4, `${game.psi} after ${last}`);
    last = game.psi;
  }
});

test('holding the lever vents steam and brings the pressure down', () => {
  const game = gameAt(80);
  run(game, 1, true);
  assert.ok(game.psi < 72, `still at ${game.psi}`);
  assert.ok(game.vent > game.heat);
});

test('the lever answers a press within a few frames and springs back on release', () => {
  const game = gameAt(70);
  run(game, 0.1, true);
  assert.ok(game.lever > 0.85, `lever at ${game.lever}`);
  run(game, 0.3, false);
  assert.ok(game.lever < 0.05, `lever at ${game.lever}`);
});

test('a short tap trims a few PSI, a long hold a lot more', () => {
  const tap = gameAt(80);
  run(tap, 0.12, true);
  run(tap, 1.08, false);
  const hold = gameAt(80);
  run(hold, 0.9, true);
  run(hold, 0.3, false);
  const free = gameAt(80);
  run(free, 1.2, false);
  assert.ok(free.psi - tap.psi > 1 && free.psi - tap.psi < 8, `tap trimmed ${free.psi - tap.psi}`);
  assert.ok(tap.psi - hold.psi > 8, `hold trimmed only ${tap.psi - hold.psi} more`);
});

test('venting forever settles low instead of going negative', () => {
  const game = Sim.createGame(1);
  run(game, 60, true);
  assert.ok(game.psi > 0 && game.psi < TUNING.zoneLow);
  assert.equal(game.score, 0);
});

test('points come only in the 65–85 PSI zone', () => {
  const low = gameAt(40);
  run(low, 2, cook(40, 50));
  assert.equal(low.score, 0);

  const zone = gameAt(75);
  const events = run(zone, 2, cook(72, 78));
  assert.ok(zone.score >= 2 * TUNING.pointsPerSecond - 1, `scored ${zone.score}`);
  assert.equal(events.filter((e) => e.type === 'zone-enter').length, 1);
});

test('both ends of the zone count as in it', () => {
  assert.equal(Sim.band(TUNING.zoneLow), 'zone');
  assert.equal(Sim.band(TUNING.zoneHigh), 'zone');
  assert.equal(Sim.band(TUNING.zoneLow - 0.01), 'low');
  assert.equal(Sim.band(TUNING.zoneHigh + 0.01), 'hot');
  assert.equal(Sim.band(TUNING.criticalPsi), 'critical');
  assert.equal(Sim.band(TUNING.maxPsi), 'blowout');
});

test('the combo climbs ×1 to ×5 with time in the zone', () => {
  assert.deepEqual([0, 2.9, 3, 6, 10, 15, 60].map(Sim.comboFor), [1, 1, 2, 3, 4, 5, 5]);
  const game = gameAt(75);
  const events = run(game, 16, cook(72, 78));
  assert.equal(game.combo, 5);
  assert.deepEqual(events.filter((e) => e.type === 'combo').map((e) => e.combo), [2, 3, 4, 5]);
});

test('a dip shorter than the grace keeps the combo, a longer one breaks it', () => {
  const game = gameAt(75);
  run(game, 7, cook(72, 78));
  assert.equal(game.combo, 3);
  game.psi = 60; // knocked out of the zone
  run(game, TUNING.comboGrace / 2, false);
  assert.equal(game.combo, 3);
  game.psi = 50;
  const events = run(game, TUNING.comboGrace, true);
  assert.equal(game.combo, 1);
  assert.ok(events.some((e) => e.type === 'combo-lost' && e.combo === 3));
});

test('enough time in the zone serves the order, with its bonus, and starts the next', () => {
  const game = gameAt(75);
  const events = run(game, TUNING.orderTimeStart + 0.05, cook(72, 78));
  const up = events.find((e) => e.type === 'order-up');
  assert.ok(up, 'no order served');
  assert.equal(up.number, 1);
  assert.equal(up.dish, Sim.DISHES[0]);
  assert.equal(up.bonus, TUNING.orderBonus);
  assert.equal(game.served, 1);
  assert.equal(game.order.number, 2);
  assert.ok(game.score >= TUNING.orderBonus + TUNING.orderTimeStart * TUNING.pointsPerSecond);
});

test('the burner turns up with every order served', () => {
  const first = gameAt(75);
  const later = gameAt(75);
  later.order.number = 6;
  Sim.step(first, DT, false);
  Sim.step(later, DT, false);
  assert.ok(later.heat > first.heat * 1.4, `${later.heat} vs ${first.heat}`);
});

test('surges wait for the first order to be out, then always come with a warning', () => {
  const game = gameAt(75);
  const firstOrder = run(game, TUNING.orderTimeStart - 0.5, cook(72, 78));
  assert.ok(!firstOrder.some((e) => e.type.startsWith('surge')));

  const events = run(game, 60, cook(70, 76)).filter((e) => e.type.startsWith('surge'));
  assert.ok(events.length >= 6, `only ${events.length} surge events`);
  events.forEach((e, i) => assert.equal(e.type, ['surge-warning', 'surge', 'surge-end'][i % 3]));
  const warning = events[0];
  const hit = events[1];
  assert.ok(Math.abs(hit.time - warning.time - TUNING.surgeWarning) < 0.02);
});

test('hitting 100 PSI blows the valve and ends the game', () => {
  const game = gameAt(95);
  const events = run(game, 5, false);
  assert.equal(game.over, true);
  assert.equal(game.psi, TUNING.maxPsi);
  const blowout = events.filter((e) => e.type === 'blowout');
  assert.equal(blowout.length, 1);
  assert.equal(blowout[0].score, game.score);

  const before = JSON.stringify(game);
  Sim.step(game, DT, true);
  assert.equal(JSON.stringify(game), before, 'a blown game must not change');
});

test('left alone, the pod blows within a quarter of a minute', () => {
  const game = Sim.createGame(3);
  run(game, 15, false);
  assert.equal(game.over, true);
  assert.ok(game.time > 5, `blew after ${game.time} s`);
});

test('a steady cook completes the eight-order shift', () => {
  const game = Sim.createGame(11);
  const events = run(game, 240, cook(70, 77));
  const shift = events.filter((e) => e.type === 'shift-complete');
  assert.equal(shift.length, 1);
  assert.equal(shift[0].served, TUNING.shiftOrders);
  assert.equal(game.shiftDone, true);
  assert.ok(game.over === false || game.served > TUNING.shiftOrders);
});

test('the same seed and the same presses replay the same game', () => {
  const a = Sim.createGame(42);
  const b = Sim.createGame(42);
  run(a, 30, cook(69, 79));
  run(b, 30, cook(69, 79));
  assert.deepEqual(a, b);
  const c = Sim.createGame(43);
  run(c, 30, cook(69, 79));
  assert.notDeepEqual(a.flicker, c.flicker);
});

test('summary reports the run for the game-over screen', () => {
  const game = gameAt(75);
  run(game, 20, cook(72, 78));
  game.psi = 99.9;
  run(game, 1, false);
  const s = Sim.summary(game);
  assert.equal(s.score, game.score);
  assert.equal(s.served, game.served);
  assert.equal(s.bestCombo, 5);
  assert.ok(s.zoneShare > 0.9 && s.zoneShare <= 1);
});
