'use strict';
// PALM PARTY - app shell: menus, session, layout (1P / 2P split / 2P shared), input routing
(function () {
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv');
  const g = cv.getContext('2d');
  const LW = 360; // logical width of every game view
  let W = 0, H = 0, DPR = 1;
  let np = PP.store.get('np', 1) === 2 ? 2 : 1;
  let session = null;
  let last = performance.now();

  function area() {
    const aw = Math.min(W, Math.round(H * 0.62));
    return { x: Math.round((W - aw) / 2), y: 0, w: aw, h: H };
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    if (session) { session.layout(); session.draw(); }
    placeOverlays();
  }

  function setXf(f) {
    if (!f.rot) g.setTransform(DPR, 0, 0, DPR, f.x * DPR, f.y * DPR);
    else g.setTransform(-DPR, 0, 0, -DPR, (f.x + f.w) * DPR, (f.y + f.h) * DPR);
  }

  class Session {
    constructor(def, players) {
      this.def = def; this.np = players;
      this.seed = (Math.random() * 2147483647) >>> 0;
      this.mode = players === 2 ? def.layout2P : 'single';
      const a = area(), half = a.h / 2;
      this.inst = []; this.views = [];
      if (this.mode === 'split') {
        for (let i = 0; i < 2; i++) {
          const lh = Math.round((half * LW) / a.w);
          this.views.push({ lw: LW, lh });
          this.inst.push(def.create({ w: LW, h: lh, seed: this.seed, players: [{ color: PP.COLORS[i], idx: i }], versus: true }));
        }
      } else {
        const lh = Math.round((a.h * LW) / a.w);
        this.views.push({ lw: LW, lh });
        const pl = [];
        for (let i = 0; i < players; i++) pl.push({ color: PP.COLORS[i], idx: i });
        this.inst.push(def.create({ w: LW, h: lh, seed: this.seed, players: pl, versus: players === 2 }));
      }
      this.state = 'count'; this.t = 0; this.goT = 0; this.endT = 0;
      this.ptr = new Map();
      this.layout();
    }
    layout() {
      const a = area(), half = a.h / 2;
      this.a = a;
      this.frames = this.np === 2
        ? [{ x: a.x, y: a.y + half, w: a.w, h: half, rot: 0 }, { x: a.x, y: a.y, w: a.w, h: half, rot: 1 }]
        : [{ x: a.x, y: a.y, w: a.w, h: a.h, rot: 0 }];
      const rects = this.mode === 'split' ? this.frames : [{ x: a.x, y: a.y, w: a.w, h: a.h, rot: 0 }];
      this.vr = rects.map((r, i) => {
        const v = this.views[i];
        const s = Math.min(r.w / v.lw, r.h / v.lh);
        return Object.assign({}, r, { s, ox: (r.w - v.lw * s) / 2, oy: (r.h - v.lh * s) / 2, lw: v.lw, lh: v.lh });
      });
    }
    setView(v) {
      if (!v.rot) g.setTransform(v.s * DPR, 0, 0, v.s * DPR, (v.x + v.ox) * DPR, (v.y + v.oy) * DPR);
      else g.setTransform(-v.s * DPR, 0, 0, -v.s * DPR, (v.x + v.w - v.ox) * DPR, (v.y + v.h - v.oy) * DPR);
    }
    toLocal(v, px, py) {
      if (!v.rot) return [(px - v.x - v.ox) / v.s, (py - v.y - v.oy) / v.s];
      return [(v.x + v.w - v.ox - px) / v.s, (v.y + v.h - v.oy - py) / v.s];
    }

    // ----- input -----
    down(e) {
      if (this.state !== 'play') return;
      const px = e.clientX, py = e.clientY;
      let vi = 0, lp = 0;
      if (this.mode === 'split') vi = py < this.a.y + this.a.h / 2 ? 1 : 0;
      else if (this.np === 2) lp = py < this.a.y + this.a.h / 2 ? 1 : 0;
      this.ptr.set(e.pointerId, { vi, lp });
      const [x, y] = this.toLocal(this.vr[vi], px, py);
      this.inst[vi].pointer(lp, 'down', x, y, e.pointerId);
    }
    move(e, type) {
      const p = this.ptr.get(e.pointerId);
      if (!p) return;
      const [x, y] = this.toLocal(this.vr[p.vi], e.clientX, e.clientY);
      this.inst[p.vi].pointer(p.lp, type, x, y, e.pointerId);
      if (type !== 'move') this.ptr.delete(e.pointerId);
    }
    key(pl, action, isDown) {
      if (this.state !== 'play') return;
      if (this.np === 1) pl = 0;
      if (this.mode === 'split') this.inst[pl].key(0, action, isDown);
      else this.inst[0].key(pl, action, isDown);
    }
    releaseAll() {
      for (const [id, p] of this.ptr) this.inst[p.vi].pointer(p.lp, 'cancel', 0, 0, id);
      this.ptr.clear();
      for (const inst of this.inst) for (let i = 0; i < 2; i++) for (const a of ['left', 'right']) inst.key(i, a, false);
    }

    // ----- loop -----
    tick(dt) {
      if (this.state === 'count') {
        const before = Math.ceil(3 - this.t);
        this.t += dt;
        const after = Math.ceil(3 - this.t);
        if (after !== before && after > 0) PP.audio.sfx.count();
        if (this.t >= 3) { this.state = 'play'; this.goT = 0.7; PP.audio.sfx.go(); }
      } else if (this.state === 'play') {
        this.goT = Math.max(0, this.goT - dt);
        for (const inst of this.inst) inst.update(dt);
        if (this.inst.every((i) => i.done)) {
          this.endT += dt;
          if (this.endT > 1.5) this.finish();
        }
      }
      this.draw();
    }
    draw() {
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      g.fillStyle = '#151a2e';
      g.fillRect(0, 0, W, H);
      this.vr.forEach((v, i) => {
        g.save();
        this.setView(v);
        g.beginPath(); g.rect(0, 0, v.lw, v.lh); g.clip();
        this.inst[i].draw(g);
        g.restore();
      });
      if (this.np === 2) {
        g.setTransform(DPR, 0, 0, DPR, 0, 0);
        const my = this.a.y + this.a.h / 2;
        if (this.mode === 'split') {
          g.fillStyle = '#151a2e'; g.fillRect(this.a.x, my - 3, this.a.w, 6);
          g.fillStyle = PP.COLORS[0].main; g.fillRect(this.a.x, my + 1, this.a.w, 2);
          g.fillStyle = PP.COLORS[1].main; g.fillRect(this.a.x, my - 3, this.a.w, 2);
        }
      }
      if (this.state === 'count' || this.goT > 0) this.frames.forEach((f, i) => this.drawCount(f, i));
    }
    drawCount(f, i) {
      setXf(f);
      const cx = f.w / 2, cy = f.h / 2;
      const S = Math.min(f.w, f.h * 1.2);
      if (this.state === 'count') {
        g.fillStyle = 'rgba(15,18,35,.55)';
        g.fillRect(0, 0, f.w, f.h);
        const n = Math.ceil(3 - this.t);
        const k = 1 - (3 - this.t - (n - 1));
        if (this.np === 2) {
          const c = PP.COLORS[i];
          PP.rrect(g, cx - 34, cy - S * 0.36 - 14, 68, 28, 14); g.fillStyle = c.main; g.fill();
          PP.text(g, c.name, cx, cy - S * 0.36, 16, '#fff', { stroke: false });
        }
        PP.text(g, this.def.name, cx, cy - S * 0.24, Math.round(S * 0.075), '#fff');
        PP.text(g, String(n), cx, cy - S * 0.02, Math.round(S * (0.22 + 0.06 * (1 - k))), '#ffd23f');
        this.def.howto.forEach((line, j) => PP.text(g, line, cx, cy + S * 0.17 + j * S * 0.065, Math.round(S * 0.042), '#fff', { lw: 3 }));
      } else {
        g.globalAlpha = Math.min(1, this.goT / 0.3);
        PP.text(g, 'GO!', cx, cy, Math.round(S * 0.22 * (1 + (0.7 - this.goT) * 0.4)), '#ffd23f');
        g.globalAlpha = 1;
      }
    }
    finish() {
      this.state = 'over';
      this.releaseAll();
      $('#pauseBtn').classList.add('hidden');
      const res = this.mode === 'split' ? this.inst.map((i) => i.scores()[0]) : this.inst[0].scores();
      showResult(this.def, res);
    }
  }

  // ---------- screens ----------
  function placeOverlays() {
    const a = area();
    for (const el of [$('#result'), $('#pause')]) { el.style.left = a.x + 'px'; el.style.width = a.w + 'px'; }
    const pb = $('#pauseBtn');
    if (session && session.np === 2) { pb.style.left = a.x + a.w - 46 + 'px'; pb.style.top = a.h / 2 - 20 + 'px'; pb.classList.add('mid'); }
    else { pb.style.left = a.x + a.w - 50 + 'px'; pb.style.top = '10px'; pb.classList.remove('mid'); }
  }

  function renderHome() {
    document.querySelectorAll('.mode button').forEach((b) => b.classList.toggle('on', +b.dataset.np === np));
    $('#modeHint').textContent = np === 1
      ? 'あそびたいゲームをタップしてスタート！'
      : 'スマホを机に置いて向かい合わせで対戦！ 手前が P1（青）、向こう側が P2（オレンジ）';
    $('#cards').innerHTML = PP.games.map((d) => {
      const best = PP.store.get('best_' + d.id, 0);
      return `<button class="card" data-id="${d.id}">
        <span class="ic" style="background:${d.bg}">${d.icon}</span>
        <span class="ct">
          <span class="en">${d.en}</span>
          <span class="nm">${d.name}</span>
          <span class="ds">${d.desc}</span>
          <span class="meta">${np === 2 ? `<span class="tag">${d.tag2P}</span>` : `<span class="best">ベスト ${best}</span>`}</span>
        </span>
        <span class="go" aria-hidden="true">▶</span>
      </button>`;
    }).join('');
    $('#muteBtn').textContent = PP.audio.muted ? 'サウンド OFF' : 'サウンド ON';
  }

  function start(def) {
    PP.audio.unlock();
    PP.audio.sfx.tap();
    $('#home').classList.add('hidden');
    $('#result').classList.add('hidden');
    $('#pause').classList.add('hidden');
    session = new Session(def, np);
    $('#pauseBtn').classList.remove('hidden');
    placeOverlays();
    document.body.classList.add('playing');
  }
  function toMenu() {
    session = null;
    $('#result').classList.add('hidden');
    $('#pause').classList.add('hidden');
    $('#pauseBtn').classList.add('hidden');
    $('#home').classList.remove('hidden');
    document.body.classList.remove('playing');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    renderHome();
  }
  function pause() {
    if (!session || (session.state !== 'play' && session.state !== 'count')) return;
    session.prev = session.state;
    session.state = 'paused';
    session.releaseAll();
    $('#pause').classList.remove('hidden');
  }
  function resume() {
    if (!session || session.state !== 'paused') return;
    session.state = session.prev;
    $('#pause').classList.add('hidden');
    last = performance.now();
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const btns = '<div class="btns"><button class="btn primary" data-act="retry">もう一回</button><button class="btn" data-act="menu">メニュー</button></div>';

  function showResult(def, res) {
    const el = $('#result');
    if (res.length === 1) {
      const key = 'best_' + def.id, best = PP.store.get(key, 0), nr = res[0].score > best;
      if (nr) PP.store.set(key, res[0].score);
      el.innerHTML = `<div class="res-half"><div class="panel">
        <div class="res-game">${esc(def.name)}</div>
        ${nr ? '<div class="badge">NEW RECORD!</div>' : '<div class="res-label">SCORE</div>'}
        <div class="res-score">${res[0].score}</div>
        <div class="res-detail">${esc(res[0].detail)}</div>
        <div class="res-best">ベスト ${Math.max(best, res[0].score)}</div>
        ${btns}</div></div>`;
      (nr ? PP.audio.sfx.win : PP.audio.sfx.end)();
    } else {
      const out = (me, op) => (me > op ? 'win' : me < op ? 'lose' : 'draw');
      const word = { win: 'WIN!', lose: 'LOSE…', draw: 'DRAW' };
      const half = (i, r, flip) => {
        const c = PP.COLORS[i], o = out(r.score, res[1 - i].score);
        return `<div class="res-half${flip ? ' flip' : ''}"><div class="panel ${o}" style="--pc:${c.main}">
          <div class="pl-chip">${c.name}</div>
          <div class="res-out">${word[o]}</div>
          <div class="res-score">${r.score}</div>
          <div class="res-detail">${esc(r.detail)}</div>
          <div class="res-best">あいて ${res[1 - i].score}</div>
          ${btns}</div></div>`;
      };
      el.innerHTML = half(1, res[1], true) + half(0, res[0], false);
      PP.audio.sfx.win();
    }
    el.classList.remove('hidden');
    placeOverlays();
  }

  // ---------- events ----------
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    PP.audio.unlock();
    if (!session) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    session.down(e);
  });
  cv.addEventListener('pointermove', (e) => { if (session) session.move(e, 'move'); });
  cv.addEventListener('pointerup', (e) => { if (session) session.move(e, 'up'); });
  cv.addEventListener('pointercancel', (e) => { if (session) session.move(e, 'cancel'); });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (session) e.preventDefault(); }, { passive: false });

  const KEYS = {
    ArrowLeft: [0, 'left'], ArrowRight: [0, 'right'], ArrowUp: [0, 'up'], ArrowDown: [0, 'down'], ' ': [0, 'up'],
    a: [1, 'left'], d: [1, 'right'], w: [1, 'up'], s: [1, 'down'],
    A: [1, 'left'], D: [1, 'right'], W: [1, 'up'], S: [1, 'down'],
  };
  window.addEventListener('keydown', (e) => {
    if (!session) return;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (session.state === 'paused') resume(); else pause();
      return;
    }
    const k = KEYS[e.key];
    if (!k) return;
    e.preventDefault();
    if (e.repeat) return;
    session.key(k[0], k[1], true);
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYS[e.key];
    if (session && k) session.key(k[0], k[1], false);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  document.querySelector('.mode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    np = +b.dataset.np === 2 ? 2 : 1;
    PP.store.set('np', np);
    PP.audio.unlock(); PP.audio.sfx.tap();
    renderHome();
  });
  $('#cards').addEventListener('click', (e) => {
    const b = e.target.closest('.card');
    if (!b) return;
    const def = PP.games.find((d) => d.id === b.dataset.id);
    if (def) start(def);
  });
  $('#muteBtn').addEventListener('click', () => {
    PP.audio.setMuted(!PP.audio.muted);
    PP.audio.unlock();
    renderHome();
  });
  $('#pauseBtn').addEventListener('click', () => { PP.audio.unlock(); pause(); });
  $('#pause').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    PP.audio.sfx.tap();
    if (b.dataset.act === 'resume') resume();
    else if (b.dataset.act === 'retry') start(session.def);
    else toMenu();
  });
  $('#result').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !session) return;
    PP.audio.sfx.tap();
    if (b.dataset.act === 'retry') start(session.def);
    else toMenu();
  });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (session && session.state !== 'paused' && session.state !== 'over') session.tick(dt);
    requestAnimationFrame(frame);
  }

  resize();
  renderHome();
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.load) document.fonts.load(`800 20px "M PLUS Rounded 1c"`).catch(() => {});

  // debug hook for automated checks
  window.__pp = { get session() { return session; }, start: (id, n) => { np = n || 1; start(PP.games.find((d) => d.id === id)); } };
})();
