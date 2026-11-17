'use strict';
// LOOP SNAKE - encircle enemies with your body to catch them and grow
(function () {
  const TAU = Math.PI * 2;
  const GAME_T = 60;
  const ET = {
    blob: { r: 11, val: 1, sp: 26 },
    big: { r: 17, val: 3, sp: 16 },
    gold: { r: 8, val: 5, sp: 58 },
    spike: { r: 12, val: 4, sp: 34 },
  };
  const BLOBC = ['#ff6fa5', '#a77bff', '#38c6ff', '#3fd08a'];

  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  }
  function pip(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }
  function polyArea(poly) {
    let s = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
    return Math.abs(s / 2);
  }

  class Snake {
    constructor(o) {
      this.w = o.w; this.h = o.h;
      this.np = o.players.length; this.vs = o.versus;
      const top = this.np === 2 ? 56 : 70, bot = this.np === 2 ? 56 : 14;
      this.ar = { x: 12, y: top, w: this.w - 24, h: this.h - top - bot };
      this.time = GAME_T; this.t = 0; this.done = false;
      this.sn = o.players.map((p, i) => this.mk(p.color, i));
      this.en = []; this.fx = [];
      this.parts = new PP.Particles(); this.fl = new PP.Floaters();
      this.spawnT = 0; this.shake = 0;
      for (let i = 0; i < 8; i++) this.spawn(true);
    }
    mk(c, i) {
      const a = this.ar;
      let x = a.x + a.w / 2, y = a.y + a.h * 0.7, ang = -Math.PI / 2;
      if (this.np === 2) {
        if (i === 0) { x -= 60; y = a.y + a.h * 0.8; }
        else { x += 60; y = a.y + a.h * 0.2; ang = Math.PI / 2; }
      }
      const pts = [];
      for (let k = 0; k < 30; k++) pts.push({ x: x - Math.cos(ang) * k * 4, y: y - Math.sin(ang) * k * 4 });
      return { i, x, y, ang, len: 220, pts, c, score: 0, caps: 0, maxLen: 220, stun: 0, inv: 0, cool: 0, joy: null, kl: false, kr: false };
    }
    spawn(init) {
      const r = Math.random, a = this.ar, prog = 1 - this.time / GAME_T;
      const q = r();
      let type = q < 0.5 ? 'blob' : q < 0.68 ? 'big' : q < 0.84 ? 'gold' : 'spike';
      if (!init && r() < prog * 0.25) type = 'spike';
      const T = ET[type];
      for (let tries = 0; tries < 24; tries++) {
        const x = a.x + 30 + r() * (a.w - 60), y = a.y + 30 + r() * (a.h - 60);
        if (this.sn.some((s) => PP.dist2(x, y, s.x, s.y) < 110 * 110)) continue;
        const ang = r() * TAU;
        this.en.push({ type, x, y, r: T.r, val: T.val, sp: T.sp, vx: Math.cos(ang) * T.sp, vy: Math.sin(ang) * T.sp, turn: 1 + r() * 2, t: 0, c: BLOBC[(r() * 4) | 0], ph: r() * TAU });
        return;
      }
    }

    update(dt) {
      this.parts.update(dt); this.fl.update(dt);
      this.shake = Math.max(0, this.shake - dt * 30);
      for (const f of this.fx) f.t -= dt;
      this.fx = this.fx.filter((f) => f.t > 0);
      if (this.done) return;
      this.t += dt; this.time -= dt;
      if (this.time <= 0) { this.time = 0; this.done = true; PP.audio.sfx.end(); return; }
      const want = Math.min(16, 8 + Math.floor(this.t / 7)) + (this.np === 2 ? 3 : 0);
      this.spawnT -= dt;
      if (this.en.length < want && this.spawnT <= 0) { this.spawn(false); this.spawnT = 0.5; }
      for (const s of this.sn) this.moveSnake(s, dt);
      this.moveEnemies(dt);
      for (const s of this.sn) {
        if (s.inv > 0) continue;
        for (const e of this.en) {
          if (e.type === 'spike' && e.t > 0.5 && PP.dist2(s.x, s.y, e.x, e.y) < (e.r + 8) ** 2) { this.hurt(s, 0.75, 'いたっ!'); break; }
        }
        if (this.vs && s.inv <= 0) {
          for (const o of this.sn) {
            if (o === s) continue;
            for (let i = 2; i < o.pts.length; i += 2) {
              const p = o.pts[i];
              if (PP.dist2(s.x, s.y, p.x, p.y) < 144) { this.hurt(s, 0.85, 'ゴツン!'); break; }
            }
          }
        }
      }
    }
    hurt(s, k, label) {
      s.len = Math.max(160, s.len * k);
      s.stun = 0.6; s.inv = 1.4; s.cool = 0.6;
      s.ang += (Math.random() < 0.5 ? 1 : -1) * Math.PI * 0.6;
      this.shake = 8;
      this.parts.burst(s.x, s.y, s.c.main, 14, 170, 4, 0.5);
      this.fl.add(s.x, s.y - 22, label, '#ff6b6b', 20, this.flip(s));
      PP.audio.sfx.hit(); PP.vibrate(70);
    }
    flip(s) { return this.vs && s.i === 1; }

    moveSnake(s, dt) {
      s.inv -= dt; s.cool -= dt;
      if (s.stun > 0) s.stun -= dt;
      const j = s.joy;
      if (j && j.m > 14) {
        const d = angDiff(j.a, s.ang), mx = 6.5 * dt;
        s.ang += PP.clamp(d, -mx, mx);
      } else {
        if (s.kl) s.ang -= 5.5 * dt;
        if (s.kr) s.ang += 5.5 * dt;
      }
      const sp = s.stun > 0 ? 60 : 145 + Math.min(35, (s.len - 220) * 0.04);
      s.x += Math.cos(s.ang) * sp * dt;
      s.y += Math.sin(s.ang) * sp * dt;
      const a = this.ar, m = 9;
      if (s.x < a.x + m) { s.x = a.x + m; s.ang = Math.PI - s.ang; }
      else if (s.x > a.x + a.w - m) { s.x = a.x + a.w - m; s.ang = Math.PI - s.ang; }
      if (s.y < a.y + m) { s.y = a.y + m; s.ang = -s.ang; }
      else if (s.y > a.y + a.h - m) { s.y = a.y + a.h - m; s.ang = -s.ang; }
      s.ang = Math.atan2(Math.sin(s.ang), Math.cos(s.ang));
      const p = s.pts;
      p[0].x = s.x; p[0].y = s.y;
      if (PP.dist2(s.x, s.y, p[1].x, p[1].y) >= 16) p.unshift({ x: s.x, y: s.y });
      const maxN = Math.max(10, Math.round(s.len / 4));
      if (p.length > maxN) p.length = maxN;
      s.maxLen = Math.max(s.maxLen, s.len);
      if (s.cool <= 0 && s.stun <= 0) {
        for (let i = 14; i < p.length; i++) {
          if (PP.dist2(s.x, s.y, p[i].x, p[i].y) < 100) { this.closeLoop(s, i); break; }
        }
      }
    }
    closeLoop(s, i) {
      const poly = s.pts.slice(0, i + 1).map((p) => ({ x: p.x, y: p.y }));
      s.cool = 0.3;
      if (polyArea(poly) < 700) return;
      const caught = this.en.filter((e) => pip(e.x, e.y, poly));
      let hunted = null;
      if (this.vs) for (const o of this.sn) if (o !== s && o.inv <= 0 && pip(o.x, o.y, poly)) hunted = o;
      this.fx.push({ poly, c: s.c.main, t: 0.5, T: 0.5, hit: caught.length > 0 || !!hunted });
      if (caught.length) {
        let sum = 0, cx = 0, cy = 0;
        for (const e of caught) {
          sum += e.val; cx += e.x; cy += e.y;
          const col = e.type === 'gold' ? '#ffd400' : e.type === 'spike' ? '#ff4b4b' : e.c;
          this.parts.burst(e.x, e.y, col, 12, 160, 5, 0.6);
        }
        this.en = this.en.filter((e) => !caught.includes(e));
        const combo = caught.length, pts = sum * combo;
        s.score += pts; s.caps += combo;
        s.len = Math.min(1000, s.len + sum * 10);
        cx /= combo; cy /= combo;
        const fl = this.flip(s);
        this.fl.add(cx, cy, '+' + pts, '#fff', 28, fl);
        if (combo > 1) this.fl.add(cx, cy + (fl ? -30 : 30), combo + ' COMBO!', '#ffd400', 18, fl);
        PP.audio.sfx.capture(combo);
      } else if (!hunted) PP.audio.sfx.loop();
      if (hunted) {
        hunted.len = Math.max(160, hunted.len * 0.7);
        hunted.stun = 1; hunted.inv = 1.6;
        s.score += 10;
        this.fl.add(hunted.x, hunted.y + (this.flip(s) ? 24 : -24), 'ハント! +10', s.c.light, 20, this.flip(s));
        this.parts.burst(hunted.x, hunted.y, hunted.c.main, 18, 200, 5, 0.6);
        PP.audio.sfx.hunt();
      }
    }
    moveEnemies(dt) {
      const a = this.ar;
      for (const e of this.en) {
        e.t += dt; e.turn -= dt;
        if (e.turn <= 0) {
          const ang = Math.random() * TAU;
          e.vx = Math.cos(ang) * e.sp; e.vy = Math.sin(ang) * e.sp;
          e.turn = 1 + Math.random() * 2.5;
        }
        let vx = e.vx, vy = e.vy;
        if (e.type === 'gold') {
          for (const s of this.sn) {
            const dx = e.x - s.x, dy = e.y - s.y, d2 = dx * dx + dy * dy;
            if (d2 < 100 * 100) { const d = Math.sqrt(d2) || 1; vx += (dx / d) * 70; vy += (dy / d) * 70; }
          }
        }
        e.x += vx * dt; e.y += vy * dt;
        if (e.x < a.x + e.r) { e.x = a.x + e.r; e.vx = Math.abs(e.vx); }
        if (e.x > a.x + a.w - e.r) { e.x = a.x + a.w - e.r; e.vx = -Math.abs(e.vx); }
        if (e.y < a.y + e.r) { e.y = a.y + e.r; e.vy = Math.abs(e.vy); }
        if (e.y > a.y + a.h - e.r) { e.y = a.y + a.h - e.r; e.vy = -Math.abs(e.vy); }
      }
    }

    pointer(lp, type, x, y, id) {
      const s = this.sn[lp];
      if (!s) return;
      if (type === 'down') { s.joy = { id, ox: x, oy: y, x, y, a: s.ang, m: 0 }; return; }
      const j = s.joy;
      if (!j || j.id !== id) return;
      if (type === 'move') {
        j.x = x; j.y = y;
        const dx = x - j.ox, dy = y - j.oy, m = Math.hypot(dx, dy);
        if (m > 60) { j.ox = x - (dx / m) * 60; j.oy = y - (dy / m) * 60; }
        j.m = Math.min(m, 60);
        if (m > 14) j.a = Math.atan2(dy, dx);
      } else s.joy = null;
    }
    key(lp, a, down) {
      const s = this.sn[lp];
      if (!s) return;
      if (a === 'left') s.kl = down;
      if (a === 'right') s.kr = down;
    }
    scores() {
      return this.sn.map((s) => ({ score: s.score, detail: `つかまえた ${s.caps}匹 ・ 最大ながさ ${Math.round(s.maxLen / 10)}` }));
    }

    // ---------- drawing ----------
    draw(g) {
      const w = this.w, h = this.h, a = this.ar;
      g.save();
      if (this.shake > 0) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      g.fillStyle = '#3f8a3a'; g.fillRect(-20, -20, w + 40, h + 40);
      g.save();
      PP.rrect(g, a.x, a.y, a.w, a.h, 16); g.clip();
      const T = 36;
      for (let y = a.y, r = 0; y < a.y + a.h; y += T, r++) {
        for (let x = a.x, c = 0; x < a.x + a.w; x += T, c++) {
          g.fillStyle = (r + c) % 2 ? '#a6e46b' : '#98da5c';
          g.fillRect(x, y, T, T);
        }
      }
      for (const f of this.fx) {
        g.globalAlpha = Math.min(1, f.t / f.T) * (f.hit ? 0.55 : 0.22);
        g.beginPath();
        f.poly.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
        g.fillStyle = f.c; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
      }
      g.globalAlpha = 1;
      g.restore();
      g.lineWidth = 8; g.strokeStyle = '#d9954e';
      PP.rrect(g, a.x - 4, a.y - 4, a.w + 8, a.h + 8, 18); g.stroke();
      g.lineWidth = 2; g.strokeStyle = '#8a5524';
      PP.rrect(g, a.x - 8, a.y - 8, a.w + 16, a.h + 16, 20); g.stroke();

      for (const e of this.en) this.drawEnemy(g, e);
      for (const s of this.sn) this.drawSnake(g, s);
      this.parts.draw(g);
      this.fl.draw(g);
      for (const s of this.sn) {
        const j = s.joy;
        if (!j) continue;
        PP.circle(g, j.ox, j.oy, 44, 'rgba(255,255,255,.12)', 'rgba(255,255,255,.45)', 3);
        const k = Math.min(1, j.m / 60);
        PP.circle(g, j.ox + Math.cos(j.a) * 44 * k, j.oy + Math.sin(j.a) * 44 * k, 15, 'rgba(255,255,255,.5)', s.c.main, 3);
      }
      this.drawHud(g);
      g.restore();
    }
    drawEnemy(g, e) {
      const k = Math.min(1, e.t / 0.35);
      const sc = k < 1 ? k * 1.15 : 1;
      const wob = Math.sin(this.t * 6 + e.ph) * 0.08;
      const r = e.r * sc;
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.beginPath(); g.ellipse(e.x + 2, e.y + r * 0.7, r * 0.9, r * 0.35, 0, 0, TAU); g.fill();
      if (e.type === 'spike') {
        g.save(); g.translate(e.x, e.y); g.rotate(this.t * 1.5 + e.ph);
        g.fillStyle = '#b3121b';
        for (let i = 0; i < 8; i++) {
          const an = (i / 8) * TAU;
          g.beginPath();
          g.moveTo(Math.cos(an - 0.3) * r * 0.85, Math.sin(an - 0.3) * r * 0.85);
          g.lineTo(Math.cos(an) * r * 1.55, Math.sin(an) * r * 1.55);
          g.lineTo(Math.cos(an + 0.3) * r * 0.85, Math.sin(an + 0.3) * r * 0.85);
          g.fill();
        }
        g.restore();
        PP.circle(g, e.x, e.y, r, '#ff3b47', '#8a0d14', 2);
        g.strokeStyle = '#3a0508'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(e.x - 7, e.y - 6); g.lineTo(e.x - 2, e.y - 3); g.moveTo(e.x + 7, e.y - 6); g.lineTo(e.x + 2, e.y - 3); g.stroke();
        PP.circle(g, e.x - 4, e.y, 2, '#fff'); PP.circle(g, e.x + 4, e.y, 2, '#fff');
        return;
      }
      const col = e.type === 'gold' ? '#ffd400' : e.c;
      g.beginPath();
      g.ellipse(e.x, e.y, r * (1 + wob), r * (1 - wob), 0, 0, TAU);
      g.fillStyle = col; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(30,30,60,.55)'; g.stroke();
      PP.circle(g, e.x - r * 0.35, e.y - r * 0.4, r * 0.28, 'rgba(255,255,255,.55)');
      const es = Math.max(1.6, r * 0.2);
      PP.circle(g, e.x - r * 0.32, e.y - r * 0.05, es, '#1d2340');
      PP.circle(g, e.x + r * 0.32, e.y - r * 0.05, es, '#1d2340');
      if (e.type === 'gold') {
        const tw = (Math.sin(this.t * 8 + e.ph) + 1) / 2;
        g.globalAlpha = tw;
        g.strokeStyle = '#fff'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(e.x + r + 2, e.y - r - 6); g.lineTo(e.x + r + 2, e.y - r + 2); g.moveTo(e.x + r - 2, e.y - r - 2); g.lineTo(e.x + r + 6, e.y - r - 2); g.stroke();
        g.globalAlpha = 1;
      }
    }
    drawSnake(g, s) {
      const p = s.pts;
      if (s.inv > 0 && Math.floor(s.inv * 12) % 2) g.globalAlpha = 0.45;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(p[p.length - 1].x, p[p.length - 1].y);
      for (let i = p.length - 2; i >= 0; i--) g.lineTo(p[i].x, p[i].y);
      g.strokeStyle = s.c.dark; g.lineWidth = 18; g.stroke();
      g.strokeStyle = s.c.main; g.lineWidth = 12.5; g.stroke();
      g.fillStyle = s.c.light;
      for (let i = 6; i < p.length; i += 6) PP.circle(g, p[i].x, p[i].y, 2.8, s.c.light);
      const ex = Math.cos(s.ang), ey = Math.sin(s.ang), nx = -ey, ny = ex;
      if (Math.sin(this.t * 3 + s.i) > 0.75) {
        g.strokeStyle = '#ff3b6b'; g.lineWidth = 2.5;
        const tx = s.x + ex * 18, ty = s.y + ey * 18;
        g.beginPath(); g.moveTo(s.x + ex * 9, s.y + ey * 9); g.lineTo(tx, ty);
        g.lineTo(tx + ex * 4 + nx * 3, ty + ey * 4 + ny * 3); g.moveTo(tx, ty); g.lineTo(tx + ex * 4 - nx * 3, ty + ey * 4 - ny * 3); g.stroke();
      }
      PP.circle(g, s.x, s.y, 11, s.c.main, s.c.dark, 3);
      for (const sd of [1, -1]) {
        const x = s.x + ex * 3 + nx * 5 * sd, y = s.y + ey * 3 + ny * 5 * sd;
        PP.circle(g, x, y, 3.8, '#fff');
        PP.circle(g, x + ex * 1.3, y + ey * 1.3, 2, '#1d2340');
      }
      g.globalAlpha = 1;
      if (s.stun > 0) {
        for (let i = 0; i < 3; i++) {
          const an = this.t * 6 + (i * TAU) / 3;
          PP.circle(g, s.x + Math.cos(an) * 16, s.y - 14 + Math.sin(an) * 5, 3, '#ffe14d', '#8a6a00', 1);
        }
      }
    }
    hudRow(g, s, y) {
      const w = this.w;
      PP.rrect(g, 10, y - 17, 46, 26, 13); g.fillStyle = s.c.main; g.fill();
      PP.text(g, s.c.name, 33, y - 4, 14, '#fff', { stroke: false });
      PP.text(g, String(s.score), 66, y - 4, 26, '#fff', { align: 'left' });
      PP.text(g, `ながさ ${Math.round(s.len / 10)}`, w - 14, y - 4, 13, '#e8ffe0', { align: 'right', lw: 3 });
    }
    drawTimer(g, y) {
      const t = Math.ceil(this.time);
      PP.text(g, String(t), this.w / 2, y, 30, t <= 10 ? '#ff6b6b' : '#fff');
    }
    drawHud(g) {
      const w = this.w, h = this.h;
      if (this.np === 1) {
        const s = this.sn[0];
        PP.text(g, 'SCORE', 14, 18, 11, '#d8ffd0', { align: 'left', stroke: false });
        PP.text(g, String(s.score), 14, 42, 28, '#fff', { align: 'left' });
        this.drawTimer(g, 32);
        PP.text(g, `ながさ ${Math.round(s.len / 10)}`, w / 2, 58, 12, '#e8ffe0', { lw: 3 });
        if (this.done) this.endText(g);
      } else {
        this.hudRow(g, this.sn[0], h - 22);
        this.drawTimer(g, h - 26);
        g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI); g.translate(-w / 2, -h / 2);
        this.hudRow(g, this.sn[1], h - 22);
        this.drawTimer(g, h - 26);
        g.restore();
        if (this.done) {
          g.fillStyle = 'rgba(20,24,46,.5)'; g.fillRect(0, 0, w, h);
          PP.text(g, 'TIME UP!', w / 2, h * 0.75, 40, '#fff');
          g.save(); g.translate(w / 2, h * 0.25); g.rotate(Math.PI);
          PP.text(g, 'TIME UP!', 0, 0, 40, '#fff');
          g.restore();
        }
      }
    }
    endText(g) {
      g.fillStyle = 'rgba(20,24,46,.5)'; g.fillRect(0, 0, this.w, this.h);
      PP.text(g, 'TIME UP!', this.w / 2, this.h / 2 - 20, 42, '#fff');
      PP.text(g, `${this.sn[0].score} pt`, this.w / 2, this.h / 2 + 24, 26, '#ffd23f');
    }
  }

  PP.register({
    id: 'snake',
    name: 'ぐるぐるスネーク',
    en: 'LOOP SNAKE',
    bg: '#8be37a',
    desc: '体でぐるっと囲んで敵をつかまえよう。たくさん囲むほどコンボ！',
    howto: ['ドラッグした方向に進む', '体で囲むと敵をつかまえる', '赤いトゲトゲに当たると縮む'],
    layout2P: 'shared',
    tag2P: '同じフィールドで陣取り対戦',
    icon: '<svg viewBox="0 0 64 64" width="58" height="58" aria-hidden="true"><path d="M14 46 C4 30 14 10 32 10 C50 10 58 28 50 42 C44 52 28 54 22 46" fill="none" stroke="#1d2340" stroke-width="11" stroke-linecap="round"/><path d="M14 46 C4 30 14 10 32 10 C50 10 58 28 50 42 C44 52 28 54 22 46" fill="none" stroke="#2f80ff" stroke-width="6" stroke-linecap="round"/><circle cx="14" cy="46" r="7" fill="#2f80ff" stroke="#1d2340" stroke-width="3"/><circle cx="32" cy="32" r="8" fill="#ff6fa5" stroke="#1d2340" stroke-width="3"/></svg>',
    create: (o) => new Snake(o),
  });
})();
