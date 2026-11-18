'use strict';
// SKY HOP - bounce up endless platforms (hold left/right side to move)
(function () {
  const G = 1500, JUMP = 760, SPRING = 1250, STOMP = 900;

  function mix(a, b, t) {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
  }
  const SKY = [['#8fdcff', '#d8f4ff'], ['#6b8cff', '#bcd0ff'], ['#3b2f8f', '#7b6bd6'], ['#0b0b2a', '#2a1f5c']];
  function skyAt(hgt) {
    const f = Math.min(SKY.length - 1.001, hgt / 4000), i = Math.floor(f), t = f - i;
    return [mix(SKY[i][0], SKY[i + 1][0], t), mix(SKY[i][1], SKY[i + 1][1], t)];
  }

  class Hop {
    constructor(o) {
      this.w = o.w; this.h = o.h;
      this.r = PP.rng(o.seed);
      this.c = o.players[0].color;
      this.vs = o.versus;
      this.px = this.w / 2; this.py = 0; this.vx = 0; this.vy = -JUMP; this.face = 1;
      this.cam = -this.h * 0.62;
      this.plats = [{ x: this.w / 2, y: 0, w: 100, type: 'normal' }];
      this.coinL = []; this.en = [];
      this.nextY = -70; this.lastX = this.w / 2; this.maxH = 0; this.coins = 0; this.stomps = 0;
      this.done = false; this.t = 0; this.squish = 0;
      this.kl = false; this.kr = false; this.touch = new Map();
      this.parts = new PP.Particles(); this.fl = new PP.Floaters();
      this.gen(this.cam - 300);
    }
    get score() { return Math.floor(this.maxH / 10) + this.coins * 20 + this.stomps * 50; }

    // generation depends only on the seed -> same tower for both players
    gen(limit) {
      const r = this.r, w = this.w;
      while (this.nextY > limit) {
        const y = this.nextY, hgt = -y;
        const gapMax = 62 + Math.min(95, hgt / 60);
        const q = r();
        const pBreak = hgt > 1200 ? Math.min(0.22, hgt / 20000) : 0;
        const pMove = hgt > 600 ? Math.min(0.3, hgt / 15000) : 0;
        let type = 'normal';
        if (q < 0.06) type = 'spring';
        else if (q < 0.06 + pBreak) type = 'break';
        else if (q < 0.06 + pBreak + pMove) type = 'move';
        const pw = Math.max(52, 72 - hgt / 400);
        // keep each platform within reach of the previous one (screen wraps horizontally)
        let px = this.lastX + r.range(-150, 150);
        px = ((px % w) + w) % w;
        px = PP.clamp(px, pw / 2 + 6, w - pw / 2 - 6);
        this.lastX = px;
        const p = { x: px, y, w: pw, type };
        if (type === 'move') p.vx = (50 + Math.min(70, hgt / 100) + r() * 30) * (r() < 0.5 ? -1 : 1);
        this.plats.push(p);
        if (r() < 0.3) this.coinL.push({ x: p.x, y: y - 42, got: false });
        if (hgt > 1500 && r() < 0.07) {
          this.en.push({ x: r.range(30, w - 30), y: y - gapMax * 0.5, vx: (40 + r() * 40) * (r() < 0.5 ? -1 : 1), dead: false, vy: 0 });
        }
        this.nextY -= r.range(gapMax * 0.55, gapMax);
      }
    }

    update(dt) {
      this.parts.update(dt); this.fl.update(dt);
      if (this.done) return;
      this.t += dt;
      this.squish = Math.max(0, this.squish - dt);
      let dir = (this.kl ? -1 : 0) + (this.kr ? 1 : 0);
      for (const d of this.touch.values()) dir += d;
      dir = PP.clamp(dir, -1, 1);
      if (dir) this.face = dir;
      this.vx += (dir * 270 - this.vx) * Math.min(1, dt * 8);
      const prev = this.py;
      this.vy += G * dt;
      this.px += this.vx * dt; this.py += this.vy * dt;
      const w = this.w;
      if (this.px < -14) this.px += w + 28;
      if (this.px > w + 14) this.px -= w + 28;
      for (const p of this.plats) {
        if (p.type === 'move') {
          p.x += p.vx * dt;
          if (p.x < p.w / 2) { p.x = p.w / 2; p.vx = Math.abs(p.vx); }
          if (p.x > w - p.w / 2) { p.x = w - p.w / 2; p.vx = -Math.abs(p.vx); }
        }
        if (p.broken) { p.fv = (p.fv || 0) + G * dt; p.y += p.fv * dt; }
      }
      if (this.vy > 0) {
        for (const p of this.plats) {
          if (p.broken) continue;
          if (prev <= p.y && this.py >= p.y && Math.abs(this.px - p.x) < p.w / 2 + 10) {
            this.py = p.y;
            this.vy = p.type === 'spring' ? -SPRING : -JUMP;
            this.squish = 0.15;
            if (p.type === 'spring') { PP.audio.sfx.power(); this.fl.add(this.px, p.y - this.cam - 40, 'ジャンプ!', '#fff', 18); p.sprung = 0.3; }
            else PP.audio.sfx.jump();
            if (p.type === 'break') { p.broken = true; this.parts.burst(p.x, p.y, '#b07a46', 10, 120, 4, 0.5, 400); }
            break;
          }
        }
      }
      const cy = this.py - 16;
      for (const c of this.coinL) {
        if (!c.got && PP.dist2(this.px, cy, c.x, c.y) < 24 * 24) {
          c.got = true; this.coins++;
          this.parts.burst(c.x, c.y, '#ffe14d', 8, 110, 3, 0.4);
          PP.audio.sfx.coin();
        }
      }
      for (const e of this.en) {
        if (e.dead) { e.vy += G * dt; e.y += e.vy * dt; continue; }
        e.x += e.vx * dt;
        if (e.x < 18) { e.x = 18; e.vx = Math.abs(e.vx); }
        if (e.x > w - 18) { e.x = w - 18; e.vx = -Math.abs(e.vx); }
        if (PP.dist2(this.px, cy, e.x, e.y) < 24 * 24) {
          if (this.vy > 0 && cy < e.y) {
            e.dead = true; e.vy = -200; this.vy = -STOMP; this.stomps++;
            this.fl.add(e.x, e.y - this.cam - 20, '+50', '#ffd23f', 20);
            this.parts.burst(e.x, e.y, '#9b5de5', 12, 160, 4, 0.5);
            PP.audio.sfx.pop();
          } else { this.die(); return; }
        }
      }
      this.maxH = Math.max(this.maxH, -this.py);
      const target = this.py - this.h * 0.45;
      if (target < this.cam) this.cam += (target - this.cam) * Math.min(1, dt * 10);
      // the sky slowly rises so nobody can camp on a platform forever
      if (this.t > 3) this.cam -= Math.min(70, 10 + this.t * 0.5) * dt;
      this.gen(this.cam - 300);
      const bottom = this.cam + this.h + 120;
      this.plats = this.plats.filter((p) => p.y < bottom);
      this.coinL = this.coinL.filter((c) => c.y < bottom && !c.got);
      this.en = this.en.filter((e) => e.y < bottom);
      if (this.py - this.cam > this.h + 60) this.die();
    }
    die() {
      if (this.done) return;
      this.done = true;
      PP.audio.sfx.lose(); PP.vibrate(100);
    }

    pointer(lp, type, x, y, id) {
      if (type === 'down') this.touch.set(id, x < this.w / 2 ? -1 : 1);
      else if (type === 'up' || type === 'cancel') this.touch.delete(id);
    }
    key(lp, a, down) {
      if (a === 'left') this.kl = down;
      if (a === 'right') this.kr = down;
    }
    scores() { return [{ score: this.score, detail: `高さ ${Math.floor(this.maxH / 10)}m ・ コイン ${this.coins}枚` }]; }

    // ---------- drawing ----------
    draw(g) {
      const w = this.w, h = this.h, cam = this.cam, hgt = -cam;
      const [c0, c1] = skyAt(hgt);
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, c0); grd.addColorStop(1, c1);
      g.fillStyle = grd; g.fillRect(-10, -10, w + 20, h + 20);
      if (hgt > 3000) {
        g.globalAlpha = Math.min(1, (hgt - 3000) / 3000);
        for (let i = 0; i < 40; i++) {
          const sx = (i * 97.3) % w, sy = (((i * 211.7 - cam * 0.2) % h) + h) % h;
          PP.circle(g, sx, sy, (i % 3) * 0.6 + 0.8, '#fff');
        }
        g.globalAlpha = 1;
      }
      // clouds (parallax)
      g.fillStyle = 'rgba(255,255,255,.55)';
      const CY = 260, base = Math.floor((cam * 0.5) / CY) - 1;
      for (let k = base; k < base + Math.ceil(h / CY) + 3; k++) {
        const hs = Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1;
        const x = hs * (w + 80) - 40, y = k * CY - cam * 0.5;
        g.beginPath(); g.ellipse(x, y, 46, 14, 0, 0, Math.PI * 2); g.ellipse(x + 22, y - 9, 26, 14, 0, 0, Math.PI * 2); g.fill();
      }
      for (const p of this.plats) this.drawPlat(g, p, p.y - cam);
      for (const c of this.coinL) {
        const y = c.y - cam;
        const sx = Math.max(0.2, Math.abs(Math.cos(this.t * 5 + c.y * 0.05)));
        g.save(); g.translate(c.x, y); g.scale(sx, 1);
        PP.circle(g, 0, 0, 9, '#ffd23f', '#b77b00', 2.5);
        g.restore();
      }
      for (const e of this.en) this.drawEnemy(g, e, e.y - cam);
      this.drawPlayer(g, this.px);
      if (this.px < 20) this.drawPlayer(g, this.px + w + 28);
      if (this.px > w - 20) this.drawPlayer(g, this.px - w - 28);
      g.save(); g.translate(0, -cam); this.parts.draw(g); g.restore();
      this.fl.draw(g);
      this.drawHud(g);
    }
    drawPlat(g, p, y) {
      const x = p.x - p.w / 2;
      if (p.type === 'break') {
        g.save(); g.translate(p.x, y); if (p.broken) g.rotate(0.3);
        PP.rrect(g, -p.w / 2, -2, p.w, 12, 5); g.fillStyle = '#b07a46'; g.fill();
        g.lineWidth = 2; g.strokeStyle = '#6b4220'; g.stroke();
        g.beginPath(); g.moveTo(-6, -2); g.lineTo(-2, 5); g.lineTo(-8, 10); g.moveTo(10, -2); g.lineTo(14, 10); g.stroke();
        g.restore();
        return;
      }
      const top = p.type === 'move' ? '#4aa3ff' : '#4cc96a', side = p.type === 'move' ? '#2563c9' : '#8a5a2b';
      PP.rrect(g, x, y - 2, p.w, 13, 6); g.fillStyle = side; g.fill();
      PP.rrect(g, x, y - 3, p.w, 7, 4); g.fillStyle = top; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(29,35,64,.6)'; PP.rrect(g, x, y - 3, p.w, 14, 6); g.stroke();
      if (p.type === 'spring') {
        const ext = p.sprung > 0 ? 10 : 0;
        if (p.sprung > 0) p.sprung -= 1 / 60;
        g.strokeStyle = '#c9d2e3'; g.lineWidth = 3;
        g.beginPath();
        for (let i = 0; i <= 4; i++) g.lineTo(p.x + (i % 2 ? 6 : -6), y - 4 - i * (3 + ext / 4));
        g.stroke();
        PP.rrect(g, p.x - 10, y - 20 - ext, 20, 5, 2); g.fillStyle = '#ff4d6d'; g.fill();
      }
    }
    drawEnemy(g, e, y) {
      const flap = Math.sin(this.t * 14) * 7;
      g.fillStyle = '#5b2a9e';
      g.beginPath(); g.moveTo(e.x - 6, y); g.lineTo(e.x - 22, y - 6 + flap); g.lineTo(e.x - 12, y + 6); g.fill();
      g.beginPath(); g.moveTo(e.x + 6, y); g.lineTo(e.x + 22, y - 6 + flap); g.lineTo(e.x + 12, y + 6); g.fill();
      PP.circle(g, e.x, y, 12, '#9b5de5', '#3b1a6e', 2.5);
      PP.circle(g, e.x - 4, y - 2, 3, '#fff'); PP.circle(g, e.x + 4, y - 2, 3, '#fff');
      PP.circle(g, e.x - 4, y - 1, 1.5, '#1d2340'); PP.circle(g, e.x + 4, y - 1, 1.5, '#1d2340');
    }
    drawPlayer(g, x) {
      const y = this.py - this.cam;
      const sq = this.squish > 0 ? this.squish / 0.15 : 0;
      const sx = 1 + sq * 0.25, sy = 1 - sq * 0.25;
      g.save(); g.translate(x, y); g.scale(sx, sy);
      g.fillStyle = this.c.dark;
      g.beginPath(); g.ellipse(-6, -2, 5, 3.5, 0, 0, Math.PI * 2); g.ellipse(6, -2, 5, 3.5, 0, 0, Math.PI * 2); g.fill();
      PP.circle(g, 0, -16, 15, this.c.main, this.c.dark, 3);
      PP.circle(g, -5, -22, 5, 'rgba(255,255,255,.35)');
      const ex = this.face * 3;
      PP.circle(g, -5 + ex, -18, 4, '#fff'); PP.circle(g, 5 + ex, -18, 4, '#fff');
      if (this.done) {
        g.strokeStyle = '#1d2340'; g.lineWidth = 2;
        for (const cx of [-5 + ex, 5 + ex]) { g.beginPath(); g.moveTo(cx - 2.5, -20.5); g.lineTo(cx + 2.5, -15.5); g.moveTo(cx + 2.5, -20.5); g.lineTo(cx - 2.5, -15.5); g.stroke(); }
      } else {
        PP.circle(g, -5 + ex * 1.4, -18, 2, '#1d2340'); PP.circle(g, 5 + ex * 1.4, -18, 2, '#1d2340');
      }
      g.restore();
    }
    hint(g) {
      const on = (d) => this.kl && d < 0 || this.kr && d > 0 || [...this.touch.values()].includes(d);
      const y = this.h - 34;
      for (const d of [-1, 1]) {
        const x = d < 0 ? 34 : this.w - 34;
        g.globalAlpha = on(d) ? 0.55 : 0.2;
        PP.circle(g, x, y, 20, '#fff');
        g.fillStyle = '#1d2340';
        g.beginPath(); g.moveTo(x + d * 8, y); g.lineTo(x - d * 5, y - 9); g.lineTo(x - d * 5, y + 9); g.fill();
      }
      g.globalAlpha = 1;
    }
    drawHud(g) {
      const w = this.w, h = this.h;
      this.hint(g);
      PP.circle(g, 22, 24, 10, '#ffd23f', '#b77b00', 2.5);
      PP.text(g, String(this.coins), 38, 25, 22, '#fff', { align: 'left' });
      PP.text(g, `${Math.floor(this.maxH / 10)}m`, w / 2, 26, 28, '#fff');
      PP.text(g, `SCORE ${this.score}`, w / 2, 52, 13, '#fff', { lw: 3 });
      if (this.done) {
        g.fillStyle = 'rgba(20,24,46,.55)'; g.fillRect(0, 0, w, h);
        PP.text(g, 'GAME OVER', w / 2, h / 2 - 34, 38, '#fff');
        PP.text(g, `${this.score} pt`, w / 2, h / 2 + 12, 28, '#ffd23f');
        if (this.vs) PP.text(g, 'あいてを待っています…', w / 2, h / 2 + 52, 15, '#fff', { lw: 3 });
      }
    }
  }

  PP.register({
    id: 'hop',
    name: 'ぴょんぴょんスカイ',
    en: 'SKY HOP',
    bg: '#b9a3ff',
    desc: '足場をはねて空の上へ！ バネで大ジャンプ、コウモリは踏んでたおそう',
    howto: ['画面の左右を押して移動', '足場にのると自動でジャンプ', '画面は少しずつ上へ。落ちたら終わり'],
    layout2P: 'split',
    tag2P: '同じタワーで画面わけ対戦',
    icon: '<svg viewBox="0 0 64 64" width="58" height="58" aria-hidden="true"><rect x="6" y="48" width="24" height="8" rx="4" fill="#4cc96a" stroke="#1d2340" stroke-width="3"/><rect x="34" y="30" width="24" height="8" rx="4" fill="#4aa3ff" stroke="#1d2340" stroke-width="3"/><rect x="14" y="10" width="22" height="8" rx="4" fill="#4cc96a" stroke="#1d2340" stroke-width="3"/><circle cx="30" cy="34" r="9" fill="#2f80ff" stroke="#1d2340" stroke-width="3"/><path d="M30 46 v8 M26 50 l4 4 l4 -4" stroke="#1d2340" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
    create: (o) => new Hop(o),
  });
})();
