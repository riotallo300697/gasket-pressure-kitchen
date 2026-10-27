/*
 * Gasket's Pressure Kitchen: sound, all of it made on the spot with Web Audio
 * (noise and oscillators, no files). Browsers only allow sound after a press,
 * so nothing starts until unlock() is called from one.
 */
(function (root) {
  'use strict';

  function create(startMuted) {
    let ctx = null;
    let master = null;
    let hiss = null; // steam out of the valve
    let rumble = null; // the pod boiling
    let noise = null;
    let muted = Boolean(startMuted);
    let alarmIn = 0;

    function unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return;
      }
      const AudioContext = root.AudioContext || root.webkitAudioContext;
      if (!AudioContext) return;
      try {
        ctx = new AudioContext();
      } catch (err) {
        ctx = null;
        return;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      noise = noiseBuffer(2);
      hiss = loop(filter('bandpass', 2600, 0.6), filter('highpass', 700, 0.7));
      rumble = loop(filter('lowpass', 150, 0.9));
    }

    function noiseBuffer(seconds) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    function filter(type, frequency, q) {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = q;
      return f;
    }

    // A looping noise source through filters into a gain that starts silent.
    function loop(...filters) {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      let node = source;
      for (const f of filters) {
        node.connect(f);
        node = f;
      }
      node.connect(gain);
      gain.connect(master);
      source.start();
      return gain;
    }

    // Follows the game every frame: the hiss with the steam, the rumble with the pressure, alarms when hot.
    function update(dt, game, mode, band) {
      if (!ctx) return;
      const now = ctx.currentTime;
      const live = mode === 'playing';
      const steam = live ? Math.min(0.5, game.vent / 30) : 0;
      const boil = live ? 0.04 + 0.22 * Math.pow(game.psi / 100, 2) : 0;
      hiss.gain.setTargetAtTime(steam, now, 0.03);
      rumble.gain.setTargetAtTime(boil, now, 0.12);

      alarmIn -= dt;
      if (live && (band === 'hot' || band === 'critical') && alarmIn <= 0) {
        const critical = band === 'critical';
        tone(critical ? 880 : 740, 0.07, 'square', critical ? 0.07 : 0.04);
        if (critical) tone(660, 0.07, 'square', 0.06, 0.12);
        alarmIn = critical ? 0.32 : 0.75;
      }
    }

    // One-off sounds for the game's events and the page's moments.
    function play(name, detail) {
      if (!ctx) return;
      switch (name) {
        case 'start':
          sweep(220, 520, 0.18, 'triangle', 0.08);
          thump(0.08);
          break;
        case 'lever':
          click(500, 0.06, 0.12);
          break;
        case 'zone-enter':
          tone(660, 0.05, 'sine', 0.05);
          break;
        case 'combo':
          sweep(400 + 120 * detail.combo, 800 + 160 * detail.combo, 0.12, 'triangle', 0.08);
          break;
        case 'combo-lost':
          sweep(420, 220, 0.18, 'triangle', 0.05);
          break;
        case 'order-up':
          tone(988, 0.6, 'sine', 0.12);
          tone(1319, 0.7, 'sine', 0.09, 0.09);
          break;
        case 'surge-warning':
          tone(110, 0.22, 'sawtooth', 0.05);
          tone(110, 0.22, 'sawtooth', 0.05, 0.32);
          break;
        case 'surge':
          whoosh(300, 1400, 0.6, 0.18);
          break;
        case 'blowout':
          whoosh(3200, 160, 1.4, 0.65);
          thump(0.6);
          click(210, 0.3, 0.2);
          sweep(1800, 280, 1.3, 'sine', 0.06, 0.45); // the lid, on its way to orbit
          break;
        case 'shift-complete':
          [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.09, i * 0.12));
          break;
        default:
          break;
      }
    }

    function tone(freq, duration, type, volume, delay = 0) {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      envelope(gain, t, volume, duration);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }

    function sweep(from, to, duration, type, volume, delay = 0) {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + duration);
      envelope(gain, t, volume, duration);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }

    function thump(volume) {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.5);
      envelope(gain, t, volume, 0.55);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.6);
    }

    function click(frequency, duration, volume) {
      const t = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const f = filter('lowpass', frequency, 1);
      const gain = ctx.createGain();
      envelope(gain, t, volume, duration);
      source.connect(f).connect(gain).connect(master);
      source.start(t, Math.random());
      source.stop(t + duration + 0.05);
    }

    function whoosh(from, to, duration, volume) {
      const t = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const f = filter('lowpass', from, 0.8);
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(to, t + duration);
      const gain = ctx.createGain();
      envelope(gain, t, volume, duration);
      source.connect(f).connect(gain).connect(master);
      source.start(t);
      source.stop(t + duration + 0.05);
    }

    function envelope(gain, t, volume, duration) {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    }

    function setMuted(value) {
      muted = Boolean(value);
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.02);
    }

    // Silence while the game is paused or the tab is hidden.
    function suspend(value) {
      if (!ctx) return;
      if (value && ctx.state === 'running') ctx.suspend().catch(() => {});
      if (!value && ctx.state === 'suspended') ctx.resume().catch(() => {});
    }

    return { unlock, update, play, setMuted, suspend, isMuted: () => muted };
  }

  root.GasketAudio = { create };
})(window);
