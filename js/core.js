'use strict';
// PALM PARTY - shared helpers (rng, audio, drawing, particles)
(function () {
  const PP = (window.PP = {});
  PP.games = [];
  PP.register = (def) => PP.games.push(def);

  PP.COLORS = [
    { main: '#2f80ff', dark: '#163f9e', light: '#a9cbff', name: 'P1' },
    { main: '#ff8c1a', dark: '#9a4a00', light: '#ffd3a1', name: 'P2' },
  ];
  PP.FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif';

  // mulberry32: same seed => same course for both players
  PP.rng = function (seed) {
    let a = seed >>> 0;
    const r = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + r() * (hi - lo);
    r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    return r;
  };

  PP.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  PP.lerp = (a, b, t) => a + (b - a) * t;
  PP.dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };

  // ---------- drawing ----------
  PP.text = function (g, s, x, y, size, fill, opt) {
    opt = opt || {};
    g.font = `${opt.weight || 800} ${size}px ${PP.FONT}`;
    g.textAlign = opt.align || 'center';
    g.textBaseline = opt.base || 'middle';
    if (opt.stroke !== false) {
      g.lineJoin = 'round';
      g.lineWidth = opt.lw || Math.max(2.5, size * 0.2);
      g.strokeStyle = opt.stroke || 'rgba(22,26,48,.9)';
      g.strokeText(s, x, y);
    }
    g.fillStyle = fill;
    g.fillText(s, x, y);
  };
  PP.rrect = function (g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  PP.circle = function (g, x, y, r, fill, stroke, lw) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.lineWidth = lw || 2; g.strokeStyle = stroke; g.stroke(); }
  };
  PP.heart = function (g, x, y, s, fill) {
    g.beginPath();
    g.moveTo(x, y + s * 0.35);
    g.bezierCurveTo(x - s * 0.9, y - s * 0.3, x - s * 0.45, y - s * 0.95, x, y - s * 0.45);
    g.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s * 0.9, y - s * 0.3, x, y + s * 0.35);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(22,26,48,.9)';
    g.stroke();
  };

  class Particles {
    constructor() { this.a = []; }
    burst(x, y, color, n, speed, size, life, grav) {
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random() * 0.7);
        this.a.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, c: color, s: size * (0.6 + Math.random() * 0.6), l: life * (0.6 + Math.random() * 0.4), m: 0, g: grav || 0 });
      }
      if (this.a.length > 600) this.a.splice(0, this.a.length - 600);
    }
    update(dt) {
      const a = this.a;
      for (let i = a.length - 1; i >= 0; i--) {
        const p = a[i];
        p.m += dt;
        if (p.m >= p.l) { a.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
        p.vx *= 0.97; p.vy *= 0.97;
      }
    }
    draw(g) {
      for (const p of this.a) {
        const k = 1 - p.m / p.l;
        g.globalAlpha = k;
        g.fillStyle = p.c;
        g.beginPath();
        g.arc(p.x, p.y, p.s * (0.4 + 0.6 * k), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  }
  PP.Particles = Particles;

  class Floaters {
    constructor() { this.a = []; }
    add(x, y, s, color, size, rot) { this.a.push({ x, y, s, c: color || '#fff', size: size || 20, t: 0, rot: !!rot }); }
    update(dt) {
      for (let i = this.a.length - 1; i >= 0; i--) {
        const f = this.a[i];
        f.t += dt;
        f.y += (f.rot ? 40 : -40) * dt;
        if (f.t > 1) this.a.splice(i, 1);
      }
    }
    draw(g) {
      for (const f of this.a) {
        const k = f.t < 0.12 ? f.t / 0.12 : 1;
        g.globalAlpha = f.t > 0.7 ? Math.max(0, (1 - f.t) / 0.3) : 1;
        if (f.rot) {
          g.save(); g.translate(f.x, f.y); g.rotate(Math.PI);
          PP.text(g, f.s, 0, 0, f.size * (0.6 + 0.4 * k), f.c);
          g.restore();
        } else PP.text(g, f.s, f.x, f.y, f.size * (0.6 + 0.4 * k), f.c);
      }
      g.globalAlpha = 1;
    }
  }
  PP.Floaters = Floaters;

  // ---------- storage ----------
  PP.store = {
    get(k, d) {
      try { const v = localStorage.getItem('palmparty_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('palmparty_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    },
  };

  PP.vibrate = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } };

  // ---------- audio (all synthesized) ----------
  PP.audio = (function () {
    let ac = null, master = null, muted = !!PP.store.get('muted', false), noiseBuf = null;
    function unlock() {
      if (!ac) {
        try {
          ac = new (window.AudioContext || window.webkitAudioContext)();
          master = ac.createGain();
          master.gain.value = 0.32;
          master.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        } catch (e) { ac = null; }
      }
      if (ac && ac.state === 'suspended') ac.resume();
    }
    function tone(freq, dur, type, vol, slide, delay) {
      if (!ac || muted) return;
      const t = ac.currentTime + (delay || 0);
      const o = ac.createOscillator(), gn = ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      gn.gain.setValueAtTime(vol == null ? 0.25 : vol, t);
      gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(gn); gn.connect(master);
      o.start(t); o.stop(t + dur + 0.03);
    }
    function noise(dur, vol, freq, delay) {
      if (!ac || muted) return;
      const t = ac.currentTime + (delay || 0);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain();
      s.buffer = noiseBuf;
      f.type = 'lowpass'; f.frequency.value = freq || 1200;
      gn.gain.setValueAtTime(vol || 0.3, t);
      gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(f); f.connect(gn); gn.connect(master);
      s.start(t); s.stop(t + dur + 0.03);
    }
    const seq = (notes, step, type, vol, len) => notes.forEach((f, i) => tone(f, len || step * 1.4, type, vol, 0, i * step));
    let lastShot = 0;
    const sfx = {
      tap: () => tone(880, 0.05, 'sine', 0.18),
      coin: () => { tone(988, 0.05, 'square', 0.1); tone(1319, 0.12, 'square', 0.1, 0, 0.05); },
      jump: () => tone(320, 0.18, 'triangle', 0.28, 2.4),
      move: () => tone(520, 0.04, 'sine', 0.1, 1.4),
      hit: () => { noise(0.25, 0.45, 900); tone(170, 0.25, 'sawtooth', 0.2, 0.4); },
      pop: () => tone(620, 0.08, 'square', 0.12, 0.35),
      power: () => seq([660, 880, 1175], 0.06, 'triangle', 0.22),
      capture: (n) => seq([523, 659, 784, 1047, 1319].slice(0, Math.min(5, 2 + n)), 0.055, 'triangle', 0.24),
      loop: () => tone(300, 0.12, 'sine', 0.12, 1.8),
      hunt: () => seq([392, 523, 784], 0.07, 'square', 0.16),
      gateGood: () => { tone(660, 0.08, 'sine', 0.28); tone(990, 0.16, 'sine', 0.28, 0, 0.07); },
      gateBad: () => tone(330, 0.24, 'sawtooth', 0.18, 0.5),
      shoot: () => {
        if (!ac) return;
        if (ac.currentTime - lastShot < 0.09) return;
        lastShot = ac.currentTime;
        tone(1500, 0.03, 'square', 0.03, 0.5);
      },
      count: () => tone(660, 0.12, 'sine', 0.3),
      go: () => tone(1320, 0.32, 'sine', 0.3),
      clear: () => seq([523, 659, 784, 1047], 0.09, 'square', 0.16, 0.2),
      win: () => seq([523, 659, 784, 1047, 784, 1047], 0.11, 'square', 0.16, 0.18),
      end: () => seq([784, 659, 523], 0.14, 'triangle', 0.22, 0.2),
      lose: () => seq([392, 330, 262], 0.16, 'triangle', 0.22, 0.22),
    };
    return {
      unlock, sfx,
      get muted() { return muted; },
      setMuted(m) { muted = m; PP.store.set('muted', m); },
    };
  })();
})();
