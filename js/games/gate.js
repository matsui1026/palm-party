'use strict';
// GATE ARMY - pick gates, grow your squad, upgrade weapons, beat the boss
(function () {
  const WEAP = [
    { n: 'ハンドガン', dmg: 1, c: '#ffe066', len: 7, vy: 560, spread: 0, lw: 3 },
    { n: 'ライフル', dmg: 1.7, c: '#ffae42', len: 13, vy: 700, spread: 0, lw: 3 },
    { n: 'ショットガン', dmg: 2.6, c: '#ff7ab8', len: 7, vy: 560, spread: 150, lw: 4 },
    { n: 'レーザー', dmg: 3.8, c: '#5ef2ff', len: 28, vy: 950, spread: 0, lw: 4 },
  ];
  const OFFS = [];
  for (let i = 0; i < 150; i++) {
    const r = 5.6 * Math.sqrt(i), a = i * 2.39996;
    OFFS.push([Math.cos(a) * r, Math.sin(a) * r * 0.8]);
  }
  const squadR = (n) => 5.6 * Math.sqrt(Math.min(n, 150)) + 8;
  const mobR = (hp) => 5 * Math.sqrt(Math.min(Math.max(hp, 1), 120)) + 8;
  const isGood = (op) => op.k !== 'sub' && op.k !== 'div';
  const label = (op) => ({ add: '+' + op.v, sub: '-' + op.v, mul: '×' + op.v, div: '÷' + op.v, weapon: '武器UP', rapid: '連射UP' })[op.k];
  const VS_STAGES = 3;

  class Gate {
    constructor(o) {
      this.w = o.w; this.h = o.h;
      this.r = PP.rng(o.seed);
      this.c = o.players[0].color;
      this.vs = o.versus;
      this.sy = this.h - Math.max(70, Math.min(120, this.h * 0.17));
      this.x = this.w / 2;
      this.n = 12; this.maxN = 12; this.wl = 0; this.fr = 1;
      this.stage = 1; this.score = 0; this.t = 0;
      this.speed = 125 * PP.clamp(this.h / 720, 0.72, 1);
      this.bul = []; this.parts = new PP.Particles(); this.fl = new PP.Floaters();
      this.fireT = 0; this.done = false; this.cleared = false; this.clearT = 0; this.shake = 0;
      this.kl = false; this.kr = false; this.drag = null;
      this.build();
    }

    build() {
      const r = this.r, s = this.stage;
      this.objs = []; this.dist = 0; this.bul = [];
      const L = 2200 + s * 400;
      let y = this.sy + 140, k = 0;
      while (y < L) {
        if (k % 2 === 0) this.objs.push(this.mkGate(y));
        else {
          const q = r();
          if (q < 0.5) this.objs.push(this.mkMob(y, r.range(70, 290), 1));
          else if (q < 0.75) { this.objs.push(this.mkMob(y, r.range(60, 140), 0.6)); this.objs.push(this.mkMob(y + 50, r.range(220, 300), 0.6)); }
          else this.objs.push(this.mkCrate(y));
        }
        y += r.range(250, 320); k++;
      }
      const hp = Math.round(500 * Math.pow(2.2, s - 1));
      this.boss = { type: 'boss', y: L + 260, x: this.w / 2, hp, max: hp, r: 44, t: 0, active: false, hit: 0 };
      this.objs.push(this.boss);
      this.total = L + 260;
    }
    mkMob(y, x, f) {
      const s = this.stage;
      const c = Math.max(3, Math.round((8 + s * 6) * Math.pow(1.5, s - 1) * this.r.range(0.7, 1.4) * f));
      return { type: 'mob', y, x, hp: c, v: 28 + this.r.range(0, 14) };
    }
    mkCrate(y) {
      const r = this.r, s = this.stage;
      const sc = Math.pow(1.5, s - 1);
      const hp = Math.round((12 + s * 10) * sc * r.range(0.8, 1.3));
      const q = r();
      const rw = q < 0.55 ? { k: 'add', v: Math.round((r.int(8, 15) + s * 4) * sc) } : q < 0.78 ? { k: 'weapon' } : { k: 'rapid' };
      return { type: 'crate', y, x: r.range(70, 290), hp, max: hp, rw };
    }
    mkGate(y) {
      const r = this.r, s = this.stage;
      const sc = Math.pow(1.5, s - 1);
      const good = () => {
        const q = r();
        if (q < 0.52) return { k: 'add', v: Math.round(r.int(5, 12) * sc + (s - 1) * 4) };
        if (q < 0.74) return { k: 'mul', v: r() < 0.9 ? 2 : 3 };
        if (q < 0.87) return { k: 'weapon' };
        return { k: 'rapid' };
      };
      const bad = () => {
        const q = r();
        if (q < 0.6) return { k: 'sub', v: Math.round(r.int(6, 14) * sc + (s - 1) * 6) };
        return { k: 'div', v: s >= 4 && q > 0.85 ? 3 : 2 };
      };
      const q = r();
      let A, B;
      if (q < 0.55) { A = good(); B = bad(); }
      else if (q < 0.88) { A = good(); B = good(); }
      else { A = bad(); B = bad(); }
      if (r() < 0.5) [A, B] = [B, A];
      return { type: 'gate', y, opts: [A, B], used: false, pick: -1, ft: 0 };
    }

    apply(op, x, y) {
      switch (op.k) {
        case 'add': this.n += op.v; break;
        case 'sub': this.n -= op.v; break;
        case 'mul': this.n *= op.v; break;
        case 'div': this.n = Math.ceil(this.n / op.v); break;
        case 'weapon':
          if (this.wl < 3) { this.wl++; this.fl.add(x, y - 28, WEAP[this.wl].n + '!', '#fff', 20); }
          else this.n += 10;
          break;
        case 'rapid':
          if (this.fr < 3) { this.fr = Math.min(3, this.fr + 0.5); this.fl.add(x, y - 28, '連射UP!', '#fff', 20); }
          else this.n += 10;
          break;
      }
      this.n = Math.min(999, Math.max(0, Math.round(this.n)));
      this.maxN = Math.max(this.maxN, this.n);
      if (isGood(op)) { PP.audio.sfx.gateGood(); this.parts.burst(x, y, '#7fb4ff', 14, 160, 4, 0.5); }
      else { PP.audio.sfx.gateBad(); this.parts.burst(x, y, '#ff6b81', 14, 160, 4, 0.5); PP.vibrate(40); }
      if (this.n <= 0) this.die();
    }
    die() {
      if (this.done) return;
      this.n = 0; this.done = true; this.shake = 12;
      this.parts.burst(this.x, this.sy, this.c.main, 30, 240, 5, 0.8);
      PP.audio.sfx.lose(); PP.vibrate(150);
    }
    oy(o) { return this.sy - (o.y - this.dist); }

    update(dt) {
      this.parts.update(dt); this.fl.update(dt);
      this.shake = Math.max(0, this.shake - dt * 30);
      for (const b of this.bul) { b.x += b.vx * dt; b.y += b.vy * dt; }
      if (this.done) { this.bul.length = 0; return; }
      this.t += dt;
      this.moveSquad(dt);
      if (this.clearT > 0) {
        this.clearT -= dt;
        this.bul = this.bul.filter((b) => b.y > -30);
        if (this.clearT <= 0) {
          if (this.vs && this.stage >= VS_STAGES) {
            this.done = true; this.cleared = true; this.score += 300;
            PP.audio.sfx.win();
            return;
          }
          this.stage++;
          this.build();
          this.fl.add(this.w / 2, this.h * 0.45, 'STAGE ' + this.stage, '#fff', 36);
        }
        return;
      }
      const boss = this.boss;
      if (this.oy(boss) >= this.h * 0.24) boss.active = true;
      else this.dist += this.speed * dt;

      this.fireT -= dt;
      if (this.fireT <= 0) { this.fire(); this.fireT = 0.2 / this.fr; }

      const R = squadR(this.n);
      for (let i = this.objs.length - 1; i >= 0; i--) {
        const o = this.objs[i];
        if (o.type === 'mob') {
          o.y -= o.v * dt;
          if (this.oy(o) > 0) o.x += PP.clamp(this.x - o.x, -1, 1) * 14 * dt;
        } else if (o.type === 'boss' && o.active) {
          o.y -= 17 * dt; o.t += dt;
          o.x = this.w / 2 + Math.sin(o.t * 0.9) * 60;
        }
        if (o.hit) o.hit = Math.max(0, o.hit - dt);
        const oy = this.oy(o);
        if (oy > this.h + 90) { this.objs.splice(i, 1); continue; }
        if (o.type === 'gate') {
          if (!o.used && oy >= this.sy) {
            o.used = true; o.pick = this.x < this.w / 2 ? 0 : 1; o.ft = 0.45;
            this.apply(o.opts[o.pick], this.x, this.sy - R);
            if (this.done) return;
          }
          if (o.used) o.ft -= dt;
          continue;
        }
        if (o.type === 'mob') {
          const mr = mobR(o.hp);
          if (Math.abs(oy - this.sy) < mr + R * 0.7 && Math.abs(o.x - this.x) < mr + R * 0.8) {
            this.clash(o); this.objs.splice(i, 1);
            if (this.done) return;
          }
        } else if (o.type === 'crate') {
          if (Math.abs(oy - this.sy) < 22 + R * 0.7 && Math.abs(o.x - this.x) < 28 + R * 0.8) {
            const loss = Math.max(1, Math.ceil(o.hp / 3));
            this.n -= loss;
            this.fl.add(this.x, this.sy - R - 20, '-' + loss, '#ff6b81', 22);
            this.parts.burst(o.x, oy, '#c98a4b', 16, 200, 5, 0.6, 300);
            this.shake = 6; PP.audio.sfx.hit();
            this.objs.splice(i, 1);
            if (this.n <= 0) { this.die(); return; }
          }
        } else if (o.type === 'boss') {
          if (oy + o.r * 0.8 >= this.sy - R * 0.5) { this.die(); return; }
        }
      }
      this.hitTest();
      this.bul = this.bul.filter((b) => !b.dead && b.y > -30 && b.x > -20 && b.x < this.w + 20);
    }
    clash(o) {
      const c = Math.ceil(o.hp);
      const oy = this.oy(o);
      this.parts.burst(o.x, oy, '#e53950', 20, 220, 4, 0.6);
      this.parts.burst(this.x, this.sy, this.c.main, 12, 200, 4, 0.5);
      this.shake = 9; PP.audio.sfx.hit(); PP.vibrate(60);
      if (this.n > c) {
        this.n -= c; this.score += c;
        this.fl.add(this.x, this.sy - squadR(this.n) - 20, '-' + c, '#ff6b81', 24);
      } else this.die();
    }
    fire() {
      const W = WEAP[this.wl];
      const k = Math.min(Math.max(1, Math.ceil(this.n / 2)), 4 + this.wl * 2);
      const dmg = (this.n * 0.26 * W.dmg) / k;
      const m = Math.min(this.n, 150);
      for (let i = 0; i < k; i++) {
        const u = OFFS[(Math.random() * m) | 0];
        const vx = W.spread ? (Math.random() - 0.5) * W.spread : 0;
        this.bul.push({ x: this.x + u[0], y: this.sy + u[1] - 6, vx, vy: -W.vy, dmg, c: W.c, len: W.len, lw: W.lw });
      }
      PP.audio.sfx.shoot();
    }
    hitTest() {
      const vis = [];
      for (const o of this.objs) {
        if (o.type === 'gate') continue;
        const oy = this.oy(o);
        if (oy < -60 || oy > this.h) continue;
        vis.push([o, oy]);
      }
      if (!vis.length) return;
      for (const b of this.bul) {
        if (b.dead) continue;
        for (const [o, oy] of vis) {
          if (o.dead) continue;
          let hit = false;
          if (o.type === 'mob') { const r = mobR(o.hp); hit = PP.dist2(b.x, b.y, o.x, oy) < r * r; }
          else if (o.type === 'crate') hit = Math.abs(b.x - o.x) < 28 && Math.abs(b.y - oy) < 24;
          else if (o.type === 'boss') hit = PP.dist2(b.x, b.y, o.x, oy) < o.r * o.r;
          if (!hit) continue;
          b.dead = true;
          this.damage(o, b.dmg, b.x, b.y, oy);
          break;
        }
      }
      this.objs = this.objs.filter((o) => !o.dead);
    }
    damage(o, d, x, y, oy) {
      const before = Math.ceil(o.hp);
      o.hp -= d;
      const after = Math.max(0, Math.ceil(o.hp));
      if (o.type === 'mob') {
        const k = before - after;
        if (k > 0) { this.score += k; if (Math.random() < 0.5) this.parts.burst(x, y, '#ff5a5a', 2, 90, 3, 0.35); }
        if (o.hp <= 0) { o.dead = true; this.parts.burst(o.x, oy, '#e53950', 16, 200, 4, 0.5); PP.audio.sfx.pop(); }
      } else if (o.type === 'crate') {
        if (o.hp <= 0) {
          o.dead = true; this.score += 5;
          this.parts.burst(o.x, oy, '#c98a4b', 16, 200, 5, 0.6, 300);
          this.fl.add(o.x, oy - 20, label(o.rw), '#7dffb0', 22);
          this.apply(o.rw, o.x, oy);
        }
      } else if (o.type === 'boss') {
        o.hit = 0.06;
        if (o.hp <= 0) {
          o.dead = true;
          this.score += 100 * this.stage + this.n;
          this.clearT = 2;
          this.parts.burst(o.x, oy, '#a66bff', 50, 320, 7, 1);
          this.parts.burst(o.x, oy, '#ffd23f', 30, 260, 5, 1);
          this.fl.add(this.w / 2, this.h * 0.4, 'STAGE CLEAR!', '#ffd23f', 34);
          this.shake = 14; PP.audio.sfx.clear(); PP.vibrate(120);
        }
      }
    }
    moveSquad(dt) {
      if (this.kl) this.x -= 280 * dt;
      if (this.kr) this.x += 280 * dt;
      const R = squadR(this.n);
      this.x = PP.clamp(this.x, 14 + R * 0.5, this.w - 14 - R * 0.5);
    }

    pointer(lp, type, x, y, id) {
      if (type === 'down') { this.drag = { id, lx: x }; return; }
      const d = this.drag;
      if (!d || d.id !== id) return;
      if (type === 'move') { this.x += (x - d.lx) * 1.25; d.lx = x; }
      else this.drag = null;
    }
    key(lp, a, down) {
      if (a === 'left') this.kl = down;
      if (a === 'right') this.kr = down;
    }
    scores() {
      return [{ score: this.score, detail: `ステージ ${this.stage}${this.cleared ? ' クリア' : ''} ・ 最大 ${this.maxN}人` }];
    }

    // ---------- drawing ----------
    draw(g) {
      const w = this.w, h = this.h, d = this.dist;
      g.save();
      if (this.shake > 0) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      g.fillStyle = '#6ccf7f'; g.fillRect(-20, -20, w + 40, h + 40);
      g.fillStyle = '#5fc274';
      for (let k = Math.floor((d - (h - this.sy)) / 90) - 1; k <= Math.ceil((d + this.sy) / 90) + 1; k++) {
        const y = this.sy - (k * 90 - d);
        g.fillRect(0, y, 10, 45); g.fillRect(w - 10, y + 45, 10, 45);
      }
      g.fillStyle = '#e9eef8'; g.fillRect(10, -20, w - 20, h + 40);
      g.strokeStyle = 'rgba(120,140,180,.18)'; g.lineWidth = 2;
      for (let k = Math.floor((d - (h - this.sy)) / 60) - 1; k <= Math.ceil((d + this.sy) / 60) + 1; k++) {
        const y = this.sy - (k * 60 - d);
        g.beginPath(); g.moveTo(10, y); g.lineTo(w - 10, y); g.stroke();
      }
      g.fillStyle = 'rgba(120,140,180,.35)';
      for (let k = Math.floor((d - (h - this.sy)) / 50) - 1; k <= Math.ceil((d + this.sy) / 50) + 1; k++) {
        g.fillRect(w / 2 - 2, this.sy - (k * 50 - d) - 24, 4, 24);
      }
      g.fillStyle = '#b7c4dd'; g.fillRect(6, -20, 4, h + 40); g.fillRect(w - 10, -20, 4, h + 40);

      const list = this.objs.slice().sort((a, b) => b.y - a.y);
      for (const o of list) {
        const oy = this.oy(o);
        if (oy < -120 || oy > h + 100) continue;
        if (o.type === 'gate') this.drawGate(g, o, oy);
        else if (o.type === 'mob') this.drawMob(g, o, oy);
        else if (o.type === 'crate') this.drawCrate(g, o, oy);
        else this.drawBoss(g, o, oy);
      }
      g.lineCap = 'round';
      for (const b of this.bul) {
        g.strokeStyle = b.c; g.lineWidth = b.lw;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx * 0.02, b.y + b.len); g.stroke();
      }
      if (!this.done) this.drawSquad(g);
      this.parts.draw(g);
      this.fl.draw(g);
      this.drawHud(g);
      g.restore();
    }
    drawGate(g, o, oy) {
      const gh = 46, w = this.w;
      for (let side = 0; side < 2; side++) {
        const x0 = side ? w / 2 + 3 : 14, x1 = side ? w - 14 : w / 2 - 3;
        const op = o.opts[side], good = isGood(op);
        let a = 1;
        if (o.used) a = o.pick === side ? Math.max(0, o.ft / 0.45) : Math.max(0, o.ft / 0.45) * 0.4;
        if (a <= 0) continue;
        g.globalAlpha = a;
        PP.rrect(g, x0, oy - gh, x1 - x0, gh, 9);
        g.fillStyle = good ? 'rgba(47,128,255,.62)' : 'rgba(255,64,96,.62)'; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
        g.fillStyle = good ? '#1d4fb8' : '#a8163a';
        g.fillRect(x0 - 3, oy - gh - 6, 7, gh + 10); g.fillRect(x1 - 4, oy - gh - 6, 7, gh + 10);
        PP.text(g, label(op), (x0 + x1) / 2, oy - gh / 2, op.k === 'weapon' || op.k === 'rapid' ? 20 : 26, '#fff');
      }
      g.globalAlpha = 1;
    }
    drawMob(g, o, oy) {
      const c = Math.ceil(o.hp), r = mobR(o.hp), m = Math.min(c, 60);
      const sc = Math.min(1, (r - 8) / (5.6 * Math.sqrt(Math.max(1, m - 1)) + 0.01));
      const bob = Math.sin(this.t * 10) * 1.2;
      for (let i = m - 1; i >= 0; i--) {
        const u = OFFS[i];
        const x = o.x + u[0] * sc, y = oy + u[1] * sc + (i % 2 ? bob : -bob);
        PP.circle(g, x, y, 5.2, '#e53950', '#6d0f22', 1.6);
      }
      PP.text(g, String(c), o.x, oy - r - 12, 18, '#fff');
    }
    drawCrate(g, o, oy) {
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(o.x - 26, oy + 18, 56, 8);
      PP.rrect(g, o.x - 28, oy - 24, 56, 48, 6); g.fillStyle = '#c98a4b'; g.fill();
      g.lineWidth = 3; g.strokeStyle = '#6b4220'; g.stroke();
      g.beginPath(); g.moveTo(o.x - 28, oy - 8); g.lineTo(o.x + 28, oy - 8); g.moveTo(o.x - 28, oy + 8); g.lineTo(o.x + 28, oy + 8); g.lineWidth = 2; g.stroke();
      PP.text(g, String(Math.ceil(o.hp)), o.x, oy, 18, '#fff');
      const lb = label(o.rw);
      g.font = `800 13px ${PP.FONT}`;
      const tw = g.measureText(lb).width + 16;
      PP.rrect(g, o.x - tw / 2, oy - 48, tw, 20, 10); g.fillStyle = '#20b26b'; g.fill();
      PP.text(g, lb, o.x, oy - 38, 13, '#fff', { stroke: false });
    }
    drawBoss(g, o, oy) {
      const r = o.r, x = o.x, wob = Math.sin(this.t * 4) * 2;
      g.fillStyle = 'rgba(0,0,0,.2)';
      g.beginPath(); g.ellipse(x, oy + r * 0.85, r, r * 0.3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4c1d95';
      for (const sd of [-1, 1]) {
        g.beginPath(); g.moveTo(x + sd * r * 0.45, oy - r * 0.7); g.lineTo(x + sd * r * 0.9, oy - r * 1.35 + wob); g.lineTo(x + sd * r * 0.85, oy - r * 0.35); g.fill();
      }
      PP.circle(g, x, oy, r + wob * 0.5, o.hit > 0 ? '#ffffff' : '#7c3aed', '#2e1065', 4);
      PP.circle(g, x - 15, oy - 8, 10, '#fff'); PP.circle(g, x + 15, oy - 8, 10, '#fff');
      PP.circle(g, x - 13, oy - 6, 4.5, '#1d2340'); PP.circle(g, x + 13, oy - 6, 4.5, '#1d2340');
      g.strokeStyle = '#2e1065'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x - 28, oy - 24); g.lineTo(x - 6, oy - 16); g.moveTo(x + 28, oy - 24); g.lineTo(x + 6, oy - 16); g.stroke();
      PP.rrect(g, x - 18, oy + 12, 36, 14, 5); g.fillStyle = '#2e1065'; g.fill();
      g.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x - 16 + i * 9, oy + 12); g.lineTo(x - 11.5 + i * 9, oy + 19); g.lineTo(x - 7 + i * 9, oy + 12); g.fill(); }
      PP.text(g, 'BOSS', x, oy - r - 26, 14, '#fff');
    }
    drawSquad(g) {
      const m = Math.min(this.n, 150), R = squadR(this.n);
      g.fillStyle = 'rgba(0,0,0,.15)';
      g.beginPath(); g.ellipse(this.x, this.sy + 6, R, R * 0.7, 0, 0, Math.PI * 2); g.fill();
      for (let i = m - 1; i >= 0; i--) {
        const u = OFFS[i];
        const x = this.x + u[0], y = this.sy + u[1] + (this.drag || this.kl || this.kr ? Math.sin(this.t * 16 + i) * 1 : 0);
        g.strokeStyle = '#333a55'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x + 2.5, y - 2); g.lineTo(x + 2.5, y - 9); g.stroke();
        PP.circle(g, x, y, 5.4, this.c.main, this.c.dark, 1.6);
      }
      const bw = this.n >= 100 ? 62 : 52;
      PP.rrect(g, this.x - bw / 2, this.sy - R - 36, bw, 26, 13);
      g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = this.c.dark; g.stroke();
      PP.text(g, String(this.n), this.x, this.sy - R - 22, 19, this.c.dark, { stroke: false, weight: 900 });
    }
    drawHud(g) {
      const w = this.w, h = this.h;
      const grd = g.createLinearGradient(0, 0, 0, 74);
      grd.addColorStop(0, 'rgba(20,24,46,.5)'); grd.addColorStop(1, 'rgba(20,24,46,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, 74);
      PP.rrect(g, 12, 12, 92, 24, 12); g.fillStyle = '#1d2340'; g.fill();
      PP.text(g, `STAGE ${this.stage}${this.vs ? '/' + VS_STAGES : ''}`, 58, 24.5, 13, '#fff', { stroke: false });
      PP.text(g, String(this.score), w / 2, 25, 28, '#fff');
      PP.text(g, `${WEAP[this.wl].n}  連射×${this.fr.toFixed(1)}`, 14, 52, 12, '#fff', { align: 'left', lw: 3 });
      const prog = PP.clamp(this.dist / Math.max(1, this.total - this.sy + this.h * 0.24), 0, 1);
      g.fillStyle = 'rgba(255,255,255,.4)'; PP.rrect(g, w / 2 - 40, 46, 80, 7, 3.5); g.fill();
      g.fillStyle = '#ffd23f'; PP.rrect(g, w / 2 - 40, 46, Math.max(7, 80 * prog), 7, 3.5); g.fill();
      if (this.boss && this.boss.active && !this.boss.dead) {
        const bw = w - 60;
        PP.rrect(g, 30, 64, bw, 12, 6); g.fillStyle = 'rgba(20,24,46,.7)'; g.fill();
        PP.rrect(g, 30, 64, Math.max(12, bw * (this.boss.hp / this.boss.max)), 12, 6); g.fillStyle = '#a66bff'; g.fill();
      }
      if (this.done) {
        g.fillStyle = 'rgba(20,24,46,.55)'; g.fillRect(0, 0, w, h);
        PP.text(g, this.cleared ? 'ALL CLEAR!' : 'GAME OVER', w / 2, h / 2 - 34, 38, this.cleared ? '#ffd23f' : '#fff');
        PP.text(g, `${this.score} pt`, w / 2, h / 2 + 12, 28, '#ffd23f');
        if (this.vs) PP.text(g, 'あいてを待っています…', w / 2, h / 2 + 52, 15, '#fff', { lw: 3 });
      }
    }
  }

  PP.register({
    id: 'gate',
    name: 'ゲートぐんだん',
    en: 'GATE ARMY',
    bg: '#86b6ff',
    desc: '2つのゲートから選んで仲間を増やし、武器を強くしてボスを倒せ！',
    howto: ['左右ドラッグで移動（自動で撃つ）', '青いゲートをくぐって仲間を増やそう', 'ボスが来る前に倒せ！'],
    layout2P: 'split',
    tag2P: '同じコースで画面わけ対戦（3ステージ）',
    icon: '<svg viewBox="0 0 64 64" width="58" height="58" aria-hidden="true"><rect x="5" y="12" width="25" height="20" rx="4" fill="#2f80ff" stroke="#1d2340" stroke-width="3"/><rect x="34" y="12" width="25" height="20" rx="4" fill="#ff4060" stroke="#1d2340" stroke-width="3"/><text x="17.5" y="27" font-size="12" font-weight="900" text-anchor="middle" fill="#fff" font-family="sans-serif">x2</text><text x="46.5" y="27" font-size="12" font-weight="900" text-anchor="middle" fill="#fff" font-family="sans-serif">-5</text><g fill="#2f80ff" stroke="#1d2340" stroke-width="2"><circle cx="24" cy="48" r="5"/><circle cx="34" cy="46" r="5"/><circle cx="44" cy="50" r="5"/><circle cx="29" cy="55" r="5"/><circle cx="39" cy="56" r="5"/></g></svg>',
    create: (o) => new Gate(o),
  });
})();
