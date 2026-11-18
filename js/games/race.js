'use strict';
// DRIFT CIRCUIT - one-touch top-down race (hold left/right side to steer, throttle is automatic)
(function () {
  const HW = 30;    // track half width
  const LAPS = 5;
  const SP = 6;     // spacing of resampled track points
  const TRACKS = [
    { name: 'オーバル', pts: [[0.2, 0.12], [0.8, 0.12], [0.88, 0.5], [0.8, 0.88], [0.2, 0.88], [0.12, 0.5]] },
    { name: 'ヘアピン', pts: [[0.18, 0.1], [0.82, 0.1], [0.86, 0.34], [0.4, 0.5], [0.86, 0.66], [0.84, 0.9], [0.18, 0.9], [0.13, 0.5]] },
    { name: 'エスカーブ', pts: [[0.2, 0.1], [0.8, 0.1], [0.86, 0.3], [0.42, 0.38], [0.42, 0.56], [0.82, 0.62], [0.86, 0.86], [0.5, 0.9], [0.16, 0.86], [0.13, 0.5]] },
  ];
  const CPU_COL = [
    { main: '#9b5de5', dark: '#4c1d95', light: '#d6c2ff', name: 'CPU' },
    { main: '#14b88a', dark: '#065f46', light: '#a7f3d0', name: 'CPU' },
  ];

  function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

  function buildTrack(def, ar) {
    const P = def.pts.map(([u, v]) => ({ x: ar.x + u * ar.w, y: ar.y + v * ar.h }));
    const n = P.length, S = [];
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      for (let k = 0; k < 40; k++) {
        const t = k / 40, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        S.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    // resample at equal spacing so "index" == distance
    const out = [{ x: S[0].x, y: S[0].y }];
    let prev = S[0], acc = 0;
    for (let i = 1; i <= S.length; i++) {
      const cur = S[i % S.length];
      let d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      while (acc + d >= SP) {
        const t = (SP - acc) / d;
        const np = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
        out.push(np); prev = np; acc = 0;
        d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      }
      acc += d; prev = cur;
    }
    if (Math.hypot(out[out.length - 1].x - out[0].x, out[out.length - 1].y - out[0].y) < SP * 0.5) out.pop();
    return out;
  }

  class Race {
    constructor(o) {
      this.w = o.w; this.h = o.h;
      this.np = o.players.length; this.vs = o.versus;
      const r = PP.rng(o.seed);
      const top = this.np === 2 ? 50 : 72, bot = this.np === 2 ? 50 : 10;
      this.ar = { x: 8, y: top, w: this.w - 16, h: this.h - top - bot };
      this.track = TRACKS[Math.floor(r() * TRACKS.length)];
      this.S = buildTrack(this.track, this.ar);
      this.N = this.S.length;
      this.pads = [0.16, 0.5, 0.8].map((f) => Math.floor(f * this.N));
      this.t = 0; this.done = false; this.firstFin = -1;
      this.cars = [];
      const N = this.N;
      if (this.np === 1) {
        this.cars.push(this.mkCar(N - 12, 0, o.players[0].color, false, 1));
        this.cars.push(this.mkCar(N - 5, -13, CPU_COL[0], true, 0.76));
        this.cars.push(this.mkCar(N - 5, 13, CPU_COL[1], true, 0.83));
      } else {
        this.cars.push(this.mkCar(N - 5, 13, o.players[0].color, false, 1));
        this.cars.push(this.mkCar(N - 5, -13, o.players[1].color, false, 1));
      }
      this.humans = this.cars.filter((c) => !c.cpu);
      this.humans.forEach((c, i) => { c.pid = i; });
      this.skids = [];
      this.parts = new PP.Particles(); this.fl = new PP.Floaters();
      this.shake = 0;
    }
    tan(i) {
      const a = this.S[(i - 1 + this.N) % this.N], b = this.S[(i + 1) % this.N];
      return Math.atan2(b.y - a.y, b.x - a.x);
    }
    mkCar(idx, off, c, cpu, skill) {
      const p = this.S[idx], tg = this.tan(idx);
      return {
        x: p.x - Math.sin(tg) * off, y: p.y + Math.cos(tg) * off, a: tg, vx: 0, vy: 0,
        c, cpu, skill, idx, lap: 0, half: true, steer: 0, kl: false, kr: false, touch: new Map(),
        drift: 0, boostT: 0, finishT: -1, bestLap: Infinity, lapStart: 0, off: false,
      };
    }
    prog(c) { return c.lap * this.N + c.idx; }
    rank(c) {
      const sorted = this.cars.slice().sort((a, b) => {
        if (a.finishT >= 0 && b.finishT >= 0) return a.finishT - b.finishT;
        if (a.finishT >= 0) return -1;
        if (b.finishT >= 0) return 1;
        return this.prog(b) - this.prog(a);
      });
      return sorted.indexOf(c) + 1;
    }
    flip(c) { return this.vs && c.pid === 1; }

    update(dt) {
      this.parts.update(dt); this.fl.update(dt);
      this.shake = Math.max(0, this.shake - dt * 30);
      if (this.done) return;
      this.t += dt;
      for (const c of this.cars) {
        if (c.cpu || c.finishT >= 0) this.autoSteer(c);
        else {
          let s = (c.kl ? -1 : 0) + (c.kr ? 1 : 0);
          for (const d of c.touch.values()) s += d;
          c.steer = PP.clamp(s, -1, 1);
        }
        this.physics(c, dt);
        this.updIdx(c);
      }
      this.collide();
      for (const s of this.skids) s.t -= dt;
      if (this.skids.length > 500) this.skids.splice(0, this.skids.length - 500);
      // end conditions
      const fin = this.humans.filter((c) => c.finishT >= 0).length;
      if (fin > 0 && this.firstFin < 0) this.firstFin = this.t;
      if (fin === this.humans.length) this.done = true;
      else if (this.vs && this.firstFin >= 0 && this.t - this.firstFin > 15) this.done = true;
      else if (this.t > 180) this.done = true;
    }
    autoSteer(c) {
      const tg = this.S[(c.idx + 14) % this.N];
      const want = Math.atan2(tg.y - c.y, tg.x - c.x);
      c.steer = PP.clamp(angDiff(want, c.a) * 2.6, -1, 1);
    }
    physics(c, dt) {
      const fx = Math.cos(c.a), fy = Math.sin(c.a);
      let fwd = c.vx * fx + c.vy * fy, lat = -c.vx * fy + c.vy * fx;
      const sp = this.S[c.idx];
      c.off = PP.dist2(c.x, c.y, sp.x, sp.y) > (HW + 2) * (HW + 2);
      let vmax = c.off ? 95 : 228;
      if (c.boostT > 0) { c.boostT -= dt; vmax = c.off ? 150 : 320; }
      if (c.cpu) vmax *= c.skill;
      if (c.finishT >= 0) vmax = 120;
      if (Math.abs(c.steer) > 0.5 && !c.off) vmax *= 0.93;
      if (fwd < vmax) fwd = Math.min(vmax, fwd + (c.boostT > 0 ? 600 : 290) * dt);
      else fwd += (vmax - fwd) * Math.min(1, dt * (c.off ? 4 : 2));
      c.a += c.steer * 3.4 * dt * PP.clamp(fwd / 140, 0.25, 1);
      const grip = c.off ? 6 : Math.abs(c.steer) > 0.5 && !c.cpu ? 3.2 : 8;
      lat *= Math.exp(-grip * dt);
      c.vx = fx * fwd - fy * lat; c.vy = fy * fwd + fx * lat;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.lat = lat;
      // drift charge -> boost on release
      if (!c.cpu && c.finishT < 0) {
        if (Math.abs(lat) > 38 && Math.abs(c.steer) > 0.5 && !c.off) {
          c.drift += dt;
          if (Math.random() < 0.6) {
            const col = c.drift > 1.2 ? '#ff7ad9' : c.drift > 0.6 ? '#4dd8ff' : 'rgba(255,255,255,.8)';
            this.parts.burst(c.x - fx * 10, c.y - fy * 10, col, 1, 60, 3, 0.3);
          }
        } else if (c.steer === 0 && c.drift > 0) {
          if (c.drift > 0.6) {
            c.boostT = Math.min(1.3, 0.4 + c.drift * 0.6);
            this.fl.add(c.x, c.y + (this.flip(c) ? 22 : -22), 'BOOST!', '#4dd8ff', 16, this.flip(c));
            PP.audio.sfx.power();
          }
          c.drift = 0;
        } else if (c.off) c.drift = 0;
      }
      if (Math.abs(lat) > 34 && !c.off) {
        const nx = -fy, ny = fx;
        for (const sd of [-5, 5]) this.skids.push({ x: c.x - fx * 8 + nx * sd, y: c.y - fy * 8 + ny * sd, t: 3 });
      }
      if (c.off && fwd > 60 && Math.random() < 0.3) this.parts.burst(c.x - fx * 10, c.y - fy * 10, '#7a5a2e', 1, 40, 3, 0.4);
      // boost pads
      for (const pi of this.pads) {
        const p = this.S[pi];
        if (PP.dist2(c.x, c.y, p.x, p.y) < 18 * 18 && c.boostT < 0.6) {
          c.boostT = 0.8;
          if (!c.cpu) PP.audio.sfx.gateGood();
        }
      }
      // arena walls
      const a = this.ar;
      if (c.x < a.x + 8) { c.x = a.x + 8; c.vx = Math.abs(c.vx) * 0.4; }
      if (c.x > a.x + a.w - 8) { c.x = a.x + a.w - 8; c.vx = -Math.abs(c.vx) * 0.4; }
      if (c.y < a.y + 8) { c.y = a.y + 8; c.vy = Math.abs(c.vy) * 0.4; }
      if (c.y > a.y + a.h - 8) { c.y = a.y + a.h - 8; c.vy = -Math.abs(c.vy) * 0.4; }
    }
    updIdx(c) {
      const N = this.N, old = c.idx;
      let best = c.idx, bd = Infinity;
      for (let k = -20; k <= 20; k++) {
        const i = (c.idx + k + N) % N, p = this.S[i];
        const d = PP.dist2(c.x, c.y, p.x, p.y);
        if (d < bd) { bd = d; best = i; }
      }
      if (bd > (HW * 2.5) ** 2) {
        // lost (cut across the grass): search a limited forward/backward window only
        for (let k = -Math.floor(N * 0.1); k <= Math.floor(N * 0.15); k++) {
          const i = (c.idx + k + N) % N, p = this.S[i];
          const d = PP.dist2(c.x, c.y, p.x, p.y);
          if (d < bd) { bd = d; best = i; }
        }
      }
      c.idx = best;
      if (c.idx > N * 0.4 && c.idx < N * 0.6) c.half = true;
      if (old > N * 0.75 && c.idx < N * 0.25) {
        if (c.half) { c.lap++; c.half = false; this.onLap(c); }
      } else if (old < N * 0.25 && c.idx > N * 0.75 && c.lap > 0) {
        c.lap--; c.half = true;
      }
    }
    onLap(c) {
      if (c.lap >= 2) c.bestLap = Math.min(c.bestLap, this.t - c.lapStart);
      c.lapStart = this.t;
      if (c.lap > LAPS && c.finishT < 0) {
        c.finishT = this.t;
        if (!c.cpu) {
          const rk = this.rank(c);
          this.fl.add(c.x, c.y + (this.flip(c) ? 30 : -30), `FINISH! ${rk}位`, '#ffd23f', 22, this.flip(c));
          (rk === 1 ? PP.audio.sfx.clear : PP.audio.sfx.end)();
        }
      } else if (!c.cpu && c.lap === LAPS) {
        this.fl.add(c.x, c.y + (this.flip(c) ? 30 : -30), 'FINAL LAP!', '#fff', 18, this.flip(c));
        PP.audio.sfx.count();
      }
    }
    collide() {
      const cs = this.cars;
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          const a = cs[i], b = cs[j];
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 > 400 || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (20 - d) / 2;
          a.x += nx * push; a.y += ny * push; b.x -= nx * push; b.y -= ny * push;
          const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (vn < 0) {
            const imp = -0.75 * vn;
            a.vx += nx * imp; a.vy += ny * imp; b.vx -= nx * imp; b.vy -= ny * imp;
            if (vn < -60 && (!a.cpu || !b.cpu)) { this.shake = 4; PP.audio.sfx.pop(); }
          }
        }
      }
    }

    pointer(lp, type, x, y, id) {
      const c = this.humans[lp];
      if (!c) return;
      if (type === 'down') {
        let dir = x < this.w / 2 ? -1 : 1;
        if (this.vs && lp === 1) dir = -dir; // P2 sees the shared field upside down
        c.touch.set(id, dir);
      } else if (type === 'up' || type === 'cancel') c.touch.delete(id);
    }
    key(lp, a, down) {
      const c = this.humans[lp];
      if (!c) return;
      if (a === 'left') c.kl = down;
      if (a === 'right') c.kr = down;
    }
    scores() {
      return this.humans.map((c) => {
        const bl = c.bestLap < Infinity ? fmt(c.bestLap) : '-';
        const rk = this.np === 1 ? `${this.rank(c)}位 / ${this.cars.length} ・ ` : '';
        if (c.finishT >= 0) return { score: Math.round(c.finishT * 100) / 100, text: fmt(c.finishT), detail: `${rk}ベストラップ ${bl}` };
        return { score: 9999 - this.prog(c) / this.N, text: 'リタイア', detail: `${rk}${Math.max(0, c.lap - 1)}周 ・ ベストラップ ${bl}`, valid: false };
      });
    }

    // ---------- drawing ----------
    draw(g) {
      const w = this.w, h = this.h, S = this.S;
      g.save();
      if (this.shake > 0) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      g.fillStyle = '#5bbf5a'; g.fillRect(-20, -20, w + 40, h + 40);
      g.fillStyle = '#53b453';
      for (let y = 0; y < h; y += 40) g.fillRect(0, y, w, 20);
      // track
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      S.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.strokeStyle = '#fff'; g.lineWidth = HW * 2 + 10; g.stroke();
      g.setLineDash([12, 12]); g.strokeStyle = '#ff4d5a'; g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#5a6172'; g.lineWidth = HW * 2; g.stroke();
      g.setLineDash([10, 14]); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
      // skids
      g.fillStyle = '#2b2f3a';
      for (const s of this.skids) {
        if (s.t <= 0) continue;
        g.globalAlpha = Math.min(0.5, s.t / 3 * 0.5);
        g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      }
      g.globalAlpha = 1;
      // start line
      const p0 = S[0], t0 = this.tan(0);
      g.save(); g.translate(p0.x, p0.y); g.rotate(t0);
      for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? '#1d2340' : '#fff';
        g.fillRect(-6 + j * 6, -HW + i * 6, 6, 6);
      }
      g.restore();
      // boost pads
      for (const pi of this.pads) {
        const p = S[pi], a = this.tan(pi);
        g.save(); g.translate(p.x, p.y); g.rotate(a);
        PP.rrect(g, -14, -10, 28, 20, 4); g.fillStyle = '#ffd23f'; g.fill();
        g.strokeStyle = '#c47a00'; g.lineWidth = 3;
        const ph = (this.t * 2) % 1;
        for (let k = 0; k < 2; k++) {
          const ox = -6 + k * 9 + ph * 3;
          g.beginPath(); g.moveTo(ox - 3, -6); g.lineTo(ox + 3, 0); g.lineTo(ox - 3, 6); g.stroke();
        }
        g.restore();
      }
      this.parts.draw(g);
      for (const c of this.cars) this.drawCar(g, c);
      this.fl.draw(g);
      this.drawHud(g);
      g.restore();
    }
    drawCar(g, c) {
      g.save(); g.translate(c.x, c.y); g.rotate(c.a);
      if (c.boostT > 0) {
        g.fillStyle = Math.random() < 0.5 ? '#ffb020' : '#ff5a3c';
        g.beginPath(); g.moveTo(-11, -4); g.lineTo(-22 - Math.random() * 6, 0); g.lineTo(-11, 4); g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,.25)'; PP.rrect(g, -10, -5, 23, 13, 4); g.fill();
      g.fillStyle = '#1d2340';
      g.fillRect(-9, -8, 6, 3); g.fillRect(4, -8, 6, 3); g.fillRect(-9, 5, 6, 3); g.fillRect(4, 5, 6, 3);
      PP.rrect(g, -12, -6.5, 24, 13, 4); g.fillStyle = c.c.main; g.fill();
      g.lineWidth = 2; g.strokeStyle = c.c.dark; g.stroke();
      PP.rrect(g, 1, -4.5, 6, 9, 2); g.fillStyle = 'rgba(210,235,255,.95)'; g.fill();
      g.fillStyle = c.c.dark; g.fillRect(-12, -5.5, 3, 11);
      g.restore();
      if (!c.cpu && this.np === 2) {
        if (this.flip(c)) { g.save(); g.translate(c.x, c.y + 18); g.rotate(Math.PI); PP.text(g, c.c.name, 0, 0, 11, c.c.light, { lw: 3 }); g.restore(); }
        else PP.text(g, c.c.name, c.x, c.y - 18, 11, c.c.light, { lw: 3 });
      } else if (!c.cpu) {
        g.fillStyle = '#fff';
        g.beginPath(); g.moveTo(c.x, c.y - 13); g.lineTo(c.x - 5, c.y - 21); g.lineTo(c.x + 5, c.y - 21); g.fill();
      }
    }
    steerHint(g, c, y) {
      const on = (d) => c.kl && d < 0 || c.kr && d > 0 || [...c.touch.values()].includes(d);
      for (const d of [-1, 1]) {
        const x = d < 0 ? 34 : this.w - 34;
        g.globalAlpha = on(d) ? 0.55 : 0.18;
        PP.circle(g, x, y, 20, '#fff');
        g.fillStyle = '#1d2340';
        g.beginPath(); g.moveTo(x + d * 8, y); g.lineTo(x - d * 5, y - 9); g.lineTo(x - d * 5, y + 9); g.fill();
      }
      g.globalAlpha = 1;
    }
    hudRow(g, c, y) {
      const w = this.w;
      PP.rrect(g, 10, y - 13, 40, 24, 12); g.fillStyle = c.c.main; g.fill();
      PP.text(g, c.c.name, 30, y - 1, 13, '#fff', { stroke: false });
      PP.text(g, `LAP ${PP.clamp(c.lap, 1, LAPS)}/${LAPS}`, 58, y, 15, '#fff', { align: 'left', lw: 3 });
      PP.text(g, fmt(c.finishT >= 0 ? c.finishT : this.t), w / 2 + 34, y, 18, '#fff', { lw: 3 });
      PP.text(g, `${this.rank(c)}位`, w - 14, y, 20, this.rank(c) === 1 ? '#ffd23f' : '#fff', { align: 'right' });
    }
    drawHud(g) {
      const w = this.w, h = this.h;
      if (this.np === 1) {
        const c = this.humans[0];
        PP.text(g, `LAP ${PP.clamp(c.lap, 1, LAPS)}/${LAPS}`, 14, 26, 20, '#fff', { align: 'left' });
        PP.text(g, this.track.name, 14, 52, 12, '#e8ffe0', { align: 'left', lw: 3 });
        PP.text(g, fmt(c.finishT >= 0 ? c.finishT : this.t), w / 2, 26, 24, '#fff');
        PP.text(g, `${this.rank(c)}位 / ${this.cars.length}`, w / 2, 54, 16, this.rank(c) === 1 ? '#ffd23f' : '#fff', { lw: 3 });
        this.steerHint(g, c, h - 34);
        if (this.done) {
          g.fillStyle = 'rgba(20,24,46,.5)'; g.fillRect(0, 0, w, h);
          PP.text(g, c.finishT >= 0 ? `${this.rank(c)}位 FINISH!` : 'TIME UP', w / 2, h / 2 - 20, 36, '#ffd23f');
          if (c.finishT >= 0) PP.text(g, fmt(c.finishT), w / 2, h / 2 + 24, 26, '#fff');
        }
      } else {
        this.hudRow(g, this.humans[0], h - 25);
        this.steerHint(g, this.humans[0], h - 76);
        g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI); g.translate(-w / 2, -h / 2);
        this.hudRow(g, this.humans[1], h - 25);
        this.steerHint(g, this.humans[1], h - 76);
        g.restore();
        for (const c of this.humans) {
          if (c.finishT < 0 || this.done) continue;
          const left = Math.max(0, 15 - (this.t - this.firstFin));
          const other = this.humans[1 - c.pid];
          if (other.finishT >= 0) continue;
          const msg = `あいて：のこり ${Math.ceil(left)}秒`;
          if (this.flip(other)) { g.save(); g.translate(w / 2, h * 0.3); g.rotate(Math.PI); PP.text(g, msg, 0, 0, 16, '#fff', { lw: 3 }); g.restore(); }
          else PP.text(g, msg, w / 2, h * 0.7, 16, '#fff', { lw: 3 });
        }
        if (this.done) {
          g.fillStyle = 'rgba(20,24,46,.45)'; g.fillRect(0, 0, w, h);
          PP.text(g, 'GOAL!', w / 2, h * 0.75, 40, '#ffd23f');
          g.save(); g.translate(w / 2, h * 0.25); g.rotate(Math.PI); PP.text(g, 'GOAL!', 0, 0, 40, '#ffd23f'); g.restore();
        }
      }
    }
  }

  PP.register({
    id: 'race',
    name: 'ドリフトサーキット',
    en: 'DRIFT CIRCUIT',
    bg: '#ff8f6b',
    desc: '画面の左右を押すだけのワンタッチ・レース。ドリフトでためてブースト！',
    howto: ['画面の左右を押して曲がる（アクセルは自動）', '滑りながら曲がって離すとブースト', '黄色い矢印で加速！5周で勝負'],
    layout2P: 'shared',
    tag2P: '同じコースでレース対決',
    lowerIsBetter: true,
    fmt: fmt,
    icon: '<svg viewBox="0 0 64 64" width="58" height="58" aria-hidden="true"><path d="M8 50 C8 20 20 12 34 12 C50 12 56 22 56 32" fill="none" stroke="#5a6172" stroke-width="12" stroke-linecap="round"/><path d="M8 50 C8 20 20 12 34 12 C50 12 56 22 56 32" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5 6"/><g transform="translate(36 38) rotate(-30)"><rect x="-13" y="-7" width="26" height="14" rx="4" fill="#2f80ff" stroke="#1d2340" stroke-width="3"/><rect x="1" y="-4" width="6" height="8" rx="2" fill="#d2ebff"/></g></svg>',
    create: (o) => new Race(o),
  });
})();
