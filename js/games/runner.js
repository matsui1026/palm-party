'use strict';
// COIN DASH - 3-lane endless runner
(function () {
  const LW = 88;      // lane width
  const JUMP = 0.62;  // jump duration (s)

  class Runner {
    constructor(o) {
      this.w = o.w; this.h = o.h;
      this.r = PP.rng(o.seed);
      this.c = o.players[0].color;
      this.vs = o.versus;
      this.cx = this.w / 2;
      this.py = this.h - Math.max(64, Math.min(110, this.h * 0.17));
      this.lane = 1; this.x = this.cx;
      this.dist = 0; this.speed = 240; this.t = 0;
      this.jt = 0; this.lives = 3; this.inv = 0; this.coins = 0;
      this.done = false; this.magnet = 0; this.shield = false;
      this.objs = []; this.next = 380;
      this.parts = new PP.Particles(); this.fl = new PP.Floaters();
      this.shake = 0; this.sw = null;
      this.spawnTo(this.h + 500);
    }
    get score() { return this.coins * 10 + Math.floor(this.dist / 10); }
    lx(i) { return this.cx + (i - 1) * LW; }
    add(type, lane, y, air) { this.objs.push({ type, lane, x: this.lx(lane), y, air: air || 0, hit: false }); }

    // Course generation depends only on the seed and distance -> identical for both players
    spawnTo(lim) {
      const r = this.r;
      while (this.next < lim) {
        const y = this.next, lv = Math.min(1, y / 15000), q = r();
        let gap = 250 + r() * 110 - lv * 70;
        if (q < 0.2) {
          const L = r.int(0, 2);
          for (let k = 0; k < 6; k++) this.add('coin', L, y + k * 36);
          gap += 120;
        } else if (q < 0.48) {
          const free = r.int(0, 2), both = r() < 0.3 + lv * 0.4, other = (free + 1 + r.int(0, 1)) % 3;
          for (let L = 0; L < 3; L++) if (L !== free && (both || L === other)) this.add('wall', L, y);
          for (let k = 0; k < 4; k++) this.add('coin', free, y - 70 + k * 36);
        } else if (q < 0.7) {
          const all = r() < 0.45, L0 = r.int(0, 2);
          for (let L = 0; L < 3; L++) if (all || L === L0) this.add('hurdle', L, y);
          for (let k = 0; k < 3; k++) this.add('coin', L0, y - 36 + k * 36, k === 1 ? 1 : 0.7);
        } else if (q < 0.92) {
          const L = r.int(0, 2), o = (L + 1 + r.int(0, 1)) % 3;
          this.add('wall', L, y);
          this.add('hurdle', o, y + 150);
          for (let k = 0; k < 4; k++) this.add('coin', o, y - 60 + k * 36);
          gap += 90;
        } else {
          this.add(r() < 0.5 ? 'magnet' : 'shield', r.int(0, 2), y);
        }
        this.next += gap;
      }
    }

    height() { return this.jt > 0 ? Math.sin((Math.PI * this.jt) / JUMP) : 0; }

    update(dt) {
      this.parts.update(dt); this.fl.update(dt);
      this.shake = Math.max(0, this.shake - dt * 30);
      if (this.done) return;
      this.t += dt;
      const tgt = Math.min(620, 240 + this.t * 5);
      this.speed += (tgt - this.speed) * Math.min(1, dt * 1.2);
      this.dist += this.speed * dt;
      this.spawnTo(this.dist + this.h + 500);
      this.x += (this.lx(this.lane) - this.x) * Math.min(1, dt * 18);
      if (this.jt > 0) {
        this.jt += dt;
        if (this.jt >= JUMP) { this.jt = 0; this.parts.burst(this.x, this.py + 12, 'rgba(255,255,255,.85)', 6, 70, 3, 0.35); }
      }
      this.inv -= dt; this.magnet -= dt;
      const hg = this.height();
      for (let i = this.objs.length - 1; i >= 0; i--) {
        const o = this.objs[i];
        if (o.y < this.dist - 140) { this.objs.splice(i, 1); continue; }
        if (o.hit) continue;
        const dy = o.y - this.dist;
        if (o.type === 'coin') {
          if (this.magnet > 0 && dy < 280 && dy > -30) {
            o.x += (this.x - o.x) * Math.min(1, dt * 9);
            o.y += (this.dist - o.y) * Math.min(1, dt * 7);
          }
          if (Math.abs(o.y - this.dist) < 24 && Math.abs(o.x - this.x) < 36) {
            o.hit = true; this.coins++;
            this.parts.burst(o.x, this.py - 10, '#ffe14d', 6, 110, 3, 0.4);
            PP.audio.sfx.coin();
          }
        } else if (Math.abs(dy) < 20 && Math.abs(o.x - this.x) < 44) {
          if (o.type === 'wall') this.crash(o);
          else if (o.type === 'hurdle') { if (hg < 0.35) this.crash(o); }
          else {
            o.hit = true;
            if (o.type === 'magnet') { this.magnet = 8; this.fl.add(this.x, this.py - 50, 'マグネット!', '#ff5d6c', 20); }
            else { this.shield = true; this.fl.add(this.x, this.py - 50, 'シールド!', '#5ee7ff', 20); }
            PP.audio.sfx.power();
          }
        }
      }
    }

    crash(o) {
      if (this.inv > 0) return;
      o.hit = true;
      const col = o.type === 'wall' ? '#e5484d' : '#f5a524';
      this.parts.burst(o.x, this.py - 10, col, 14, 200, 5, 0.6, 300);
      if (this.shield) {
        this.shield = false; this.inv = 0.8;
        this.parts.burst(this.x, this.py - 10, '#5ee7ff', 16, 180, 4, 0.5);
        this.fl.add(this.x, this.py - 50, 'ガード!', '#5ee7ff', 22);
        PP.audio.sfx.pop();
        return;
      }
      this.lives--; this.inv = 1.5; this.shake = 10; this.speed *= 0.55;
      PP.audio.sfx.hit(); PP.vibrate(80);
      if (this.lives <= 0) { this.done = true; PP.audio.sfx.lose(); }
    }

    move(d) {
      if (this.done) return;
      const nl = PP.clamp(this.lane + d, 0, 2);
      if (nl !== this.lane) { this.lane = nl; PP.audio.sfx.move(); }
    }
    jump() {
      if (this.done || this.jt > 0) return;
      this.jt = 0.0001; PP.audio.sfx.jump();
    }
    drop() { if (this.jt > 0 && this.jt < JUMP / 2) this.jt = JUMP - this.jt; }

    swipe(dx, dy) {
      if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? 1 : -1);
      else if (dy < 0) this.jump();
      else this.drop();
    }
    pointer(lp, type, x, y, id) {
      if (type === 'down') { this.sw = { id, x, y, ox: x, oy: y, moved: false }; return; }
      const s = this.sw;
      if (!s || s.id !== id) return;
      if (type === 'move') {
        const dx = x - s.x, dy = y - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 26) { this.swipe(dx, dy); s.x = x; s.y = y; s.moved = true; }
      } else {
        if (type === 'up' && !s.moved) {
          const dx = x - s.ox, dy = y - s.oy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) this.swipe(dx, dy);
          else if (x < this.w / 3) this.move(-1);
          else if (x > (this.w * 2) / 3) this.move(1);
          else this.jump();
        }
        this.sw = null;
      }
    }
    key(lp, a, down) {
      if (!down) return;
      if (a === 'left') this.move(-1);
      else if (a === 'right') this.move(1);
      else if (a === 'up') this.jump();
      else if (a === 'down') this.drop();
    }
    scores() { return [{ score: this.score, detail: `コイン ${this.coins}枚 ・ ${Math.floor(this.dist / 10)}m` }]; }

    // ---------- drawing ----------
    sy(wy) { return this.py - (wy - this.dist); }
    draw(g) {
      const w = this.w, h = this.h, d = this.dist;
      g.save();
      if (this.shake > 0) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      // grass with scrolling stripes
      g.fillStyle = '#8bd862'; g.fillRect(-20, -20, w + 40, h + 40);
      g.fillStyle = '#7cca55';
      const P = 120, k0 = Math.floor((d - (h - this.py) - P) / P), k1 = Math.ceil((d + this.py + P) / P);
      for (let k = k0; k <= k1; k++) if (((k % 2) + 2) % 2 === 0) g.fillRect(-20, this.sy((k + 1) * P), w + 40, P);
      // road
      const rl = this.cx - LW * 1.5 - 8, rw = LW * 3 + 16;
      g.fillStyle = '#566078'; g.fillRect(rl, -20, rw, h + 40);
      g.fillStyle = '#4b546b'; g.fillRect(rl, -20, 6, h + 40); g.fillRect(rl + rw - 6, -20, 6, h + 40);
      // curbs
      const C = 36;
      for (let k = Math.floor((d - (h - this.py)) / C) - 1; k <= Math.ceil((d + this.py) / C) + 1; k++) {
        g.fillStyle = ((k % 2) + 2) % 2 ? '#ffffff' : '#ff5a5f';
        const y = this.sy((k + 1) * C);
        g.fillRect(rl - 8, y, 8, C); g.fillRect(rl + rw, y, 8, C);
      }
      // lane dashes
      g.fillStyle = 'rgba(255,255,255,.55)';
      for (const bx of [this.cx - LW / 2, this.cx + LW / 2]) {
        for (let k = Math.floor((d - (h - this.py)) / 70) - 1; k <= Math.ceil((d + this.py) / 70) + 1; k++) {
          g.fillRect(bx - 2, this.sy(k * 70) - 34, 4, 34);
        }
      }
      // bushes
      for (let k = Math.floor((d - (h - this.py)) / 150) - 1; k <= Math.ceil((d + this.py) / 150) + 1; k++) {
        const hsh = Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1;
        const side = hsh < 0.5 ? 0 : 1, y = this.sy(k * 150 + hsh * 60);
        const x = side ? w - 16 - hsh * 8 : 16 + hsh * 8;
        PP.circle(g, x + 3, y + 5, 14, 'rgba(0,0,0,.15)');
        PP.circle(g, x, y, 14, '#3fa34d');
        PP.circle(g, x - 4, y - 4, 7, '#5cc266');
      }
      // speed lines
      if (this.speed > 420 && !this.done) {
        g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const x = rl + 14 + ((i * 97 + Math.floor(this.t * 30) * 53) % (rw - 28));
          const y = (this.t * 900 + i * 211) % (h + 80) - 40;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 40); g.stroke();
        }
      }
      // objects (far first)
      for (let i = this.objs.length - 1; i >= 0; i--) {
        const o = this.objs[i];
        if (o.hit) continue;
        const y = this.sy(o.y);
        if (y < -70 || y > h + 70) continue;
        if (o.type === 'coin') this.drawCoin(g, o.x, y, o.air);
        else if (o.type === 'wall') this.drawWall(g, o.x, y);
        else if (o.type === 'hurdle') this.drawHurdle(g, o.x, y);
        else this.drawPower(g, o.type, o.x, y);
      }
      this.drawPlayer(g);
      this.parts.draw(g);
      this.fl.draw(g);
      this.drawHud(g);
      g.restore();
    }
    drawCoin(g, x, y, air) {
      const lift = air * 22;
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.beginPath(); g.ellipse(x, y + 8, 8, 3, 0, 0, Math.PI * 2); g.fill();
      const sx = Math.max(0.18, Math.abs(Math.cos(this.t * 5 + y * 0.03)));
      g.save(); g.translate(x, y - lift - 4); g.scale(sx, 1);
      PP.circle(g, 0, 0, 10, '#ffd23f', '#b77b00', 2.5);
      PP.circle(g, 0, 0, 5.5, null, '#fff0a6', 2);
      g.restore();
    }
    drawWall(g, x, y) {
      const bw = 72;
      g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x - bw / 2 + 4, y - 4, bw, 18);
      PP.rrect(g, x - bw / 2, y - 38, bw, 24, 6); g.fillStyle = '#ff9a9e'; g.fill();
      PP.rrect(g, x - bw / 2, y - 18, bw, 28, 6); g.fillStyle = '#e5484d'; g.fill();
      g.save(); PP.rrect(g, x - bw / 2, y - 18, bw, 28, 6); g.clip();
      g.fillStyle = '#fff';
      for (let i = -1; i < 5; i++) {
        const sx = x - bw / 2 + i * 20;
        g.beginPath(); g.moveTo(sx, y + 10); g.lineTo(sx + 10, y + 10); g.lineTo(sx + 22, y - 18); g.lineTo(sx + 12, y - 18); g.fill();
      }
      g.restore();
      g.lineWidth = 2.5; g.strokeStyle = '#7a1d22';
      PP.rrect(g, x - bw / 2, y - 38, bw, 48, 6); g.stroke();
    }
    drawHurdle(g, x, y) {
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x - 38, y + 2, 80, 6);
      g.fillStyle = '#6b4a2b';
      g.fillRect(x - 36, y - 22, 6, 28); g.fillRect(x + 30, y - 22, 6, 28);
      for (const yy of [y - 24, y - 8]) {
        PP.rrect(g, x - 42, yy, 84, 11, 4); g.fillStyle = '#ffb020'; g.fill();
        g.lineWidth = 2; g.strokeStyle = '#7a4a00'; g.stroke();
      }
    }
    drawPower(g, type, x, y) {
      const b = Math.sin(this.t * 5) * 3;
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.beginPath(); g.ellipse(x, y + 10, 12, 4, 0, 0, Math.PI * 2); g.fill();
      PP.circle(g, x, y - 12 + b, 18, 'rgba(255,255,255,.95)', type === 'magnet' ? '#ff5d6c' : '#21c4e8', 3);
      if (type === 'magnet') {
        g.lineWidth = 6; g.lineCap = 'butt'; g.strokeStyle = '#ff4757';
        g.beginPath(); g.arc(x, y - 14 + b, 7, Math.PI, 0, true); g.stroke();
        g.fillStyle = '#c9d2e3'; g.fillRect(x - 10, y - 15 + b, 6, 6); g.fillRect(x + 4, y - 15 + b, 6, 6);
      } else {
        const yy = y - 12 + b;
        g.beginPath(); g.moveTo(x, yy - 10); g.lineTo(x + 9, yy - 6); g.lineTo(x + 7, yy + 4); g.lineTo(x, yy + 10); g.lineTo(x - 7, yy + 4); g.lineTo(x - 9, yy - 6); g.closePath();
        g.fillStyle = '#21c4e8'; g.fill();
      }
    }
    drawPlayer(g) {
      const hg = this.height(), x = this.x, py = this.py;
      const by = py - hg * 48 + (this.done || hg > 0 ? 0 : Math.sin(this.t * 18) * 1.5);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath(); g.ellipse(x, py + 13, 17 * (1 - hg * 0.4), 6 * (1 - hg * 0.4), 0, 0, Math.PI * 2); g.fill();
      if (this.inv > 0 && Math.floor(this.inv * 12) % 2) g.globalAlpha = 0.4;
      const step = this.done || hg > 0 ? 0 : Math.sin(this.t * 18) * 4;
      g.fillStyle = this.c.dark;
      g.beginPath(); g.ellipse(x - 8, by + 15 + step, 5, 4, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x + 8, by + 15 - step, 5, 4, 0, 0, Math.PI * 2); g.fill();
      PP.circle(g, x, by, 18, this.c.main, this.c.dark, 3);
      PP.circle(g, x - 6, by - 7, 6, 'rgba(255,255,255,.35)');
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(x - 7, by - 4, 4.5, 6, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x + 7, by - 4, 4.5, 6, 0, 0, Math.PI * 2); g.fill();
      if (this.done) {
        g.strokeStyle = '#1d2340'; g.lineWidth = 2;
        for (const ex of [x - 7, x + 7]) {
          g.beginPath(); g.moveTo(ex - 3, by - 7); g.lineTo(ex + 3, by - 1); g.moveTo(ex + 3, by - 7); g.lineTo(ex - 3, by - 1); g.stroke();
        }
      } else {
        PP.circle(g, x - 7, by - 6, 2.6, '#1d2340');
        PP.circle(g, x + 7, by - 6, 2.6, '#1d2340');
      }
      g.globalAlpha = 1;
      if (this.shield) PP.circle(g, x, by, 26 + Math.sin(this.t * 8) * 1.5, 'rgba(94,231,255,.15)', 'rgba(94,231,255,.9)', 3);
      if (this.magnet > 0) {
        const a = this.t * 6;
        PP.circle(g, x + Math.cos(a) * 26, by + Math.sin(a) * 26, 4, '#ff5d6c');
      }
    }
    drawHud(g) {
      const w = this.w;
      const grd = g.createLinearGradient(0, 0, 0, 70);
      grd.addColorStop(0, 'rgba(20,24,46,.45)'); grd.addColorStop(1, 'rgba(20,24,46,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, 70);
      PP.circle(g, 22, 24, 10, '#ffd23f', '#b77b00', 2.5);
      PP.text(g, String(this.coins), 38, 25, 22, '#fff', { align: 'left' });
      for (let i = 0; i < 3; i++) PP.heart(g, 20 + i * 22, 54, 10, i < this.lives ? '#ff4d6d' : 'rgba(255,255,255,.35)');
      PP.text(g, String(this.score), w / 2, 25, 28, '#fff');
      PP.text(g, `${Math.floor(this.dist / 10)}m`, w / 2, 50, 13, '#e8ecff', { lw: 3 });
      if (this.magnet > 0) {
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(w / 2 - 30, 62, 60, 5);
        g.fillStyle = '#ff5d6c'; g.fillRect(w / 2 - 30, 62, 60 * Math.min(1, this.magnet / 8), 5);
      }
      if (this.done) {
        g.fillStyle = 'rgba(20,24,46,.55)'; g.fillRect(0, 0, w, this.h);
        PP.text(g, 'GAME OVER', w / 2, this.h / 2 - 34, 38, '#fff');
        PP.text(g, `${this.score} pt`, w / 2, this.h / 2 + 12, 28, '#ffd23f');
        if (this.vs) PP.text(g, 'あいてを待っています…', w / 2, this.h / 2 + 52, 15, '#fff', { lw: 3 });
      }
    }
  }

  PP.register({
    id: 'dash',
    name: 'コインダッシュ',
    en: 'COIN DASH',
    bg: '#ffd84d',
    desc: '走ってコインを集めよう。壁はよけて、柵はジャンプ！',
    howto: ['左右スワイプでレーン移動', '上スワイプ / 中央タップでジャンプ', '壁はよけて、柵は飛びこえよう'],
    layout2P: 'split',
    tag2P: '同じコースで画面わけ対戦',
    icon: '<svg viewBox="0 0 64 64" width="58" height="58" aria-hidden="true"><path d="M6 46 H22 M4 36 H18 M8 26 H20" stroke="#1d2340" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="34" r="19" fill="#ffd23f" stroke="#1d2340" stroke-width="4"/><circle cx="40" cy="34" r="10" fill="none" stroke="#fff3b0" stroke-width="4"/></svg>',
    create: (o) => new Runner(o),
  });
})();
