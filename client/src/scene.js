import 'pixi.js/browser';
import 'pixi.js/app';
import 'pixi.js/events';
import 'pixi.js/graphics';
import 'pixi.js/text';
import { Application, Container, Graphics, Text } from 'pixi.js';

const AMBER = 0xd97706, AMBER_L = 0xf59e0b, AMBER_D = 0x92400e, INK = 0xf5efe1;

function hexPts(r) { const p = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); p.push(r * Math.cos(a), r * Math.sin(a)); } return p; }
function dropShape(g, s) {
  g.clear().circle(0, 0, 6 * s).fill(AMBER_L).poly([-5.6 * s, -2 * s, 5.6 * s, -2 * s, 0, -14 * s]).fill(AMBER_L)
    .circle(-2 * s, -1 * s, 1.6 * s).fill({ color: 0xffffff, alpha: 0.5 });
}

export async function createScene(host, { onTap, onLand, onJarFull } = {}) {
  const app = new Application();
  await app.init({ manageImports: false, preference: 'webgl', resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
  host.appendChild(app.canvas);
  const W = () => app.screen.width, H = () => app.screen.height;
  const st = { progress: 0, jarRatio: 0, ready: false, bees: 1, fullJars: 0 };
  let shownFull = null;
  let jarSlide = 0;

  const glow = new Graphics(); app.stage.addChild(glow);
  const pollenG = new Graphics(); app.stage.addChild(pollenG);
  const pollen = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, v: 0.00012 + Math.random() * 0.0004, ph: Math.random() * 6 }));

  let R = 35;
  const AX = [[0, 0]], DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (let ring = 1; ring <= 2; ring++) { let q = -ring, r = ring; for (let side = 0; side < 6; side++) for (let s = 0; s < ring; s++) { AX.push([q, r]); q += DIRS[side][0]; r += DIRS[side][1]; } }
  const comb = new Container(); app.stage.addChild(comb);
  let cells = [];
  function buildComb() {
    comb.removeChildren().forEach((c) => c.destroy({ children: true }));
    cells = AX.map(([q, r]) => {
      const x = R * Math.sqrt(3) * (q + r / 2), y = R * 1.5 * r;
      const c = new Container(); c.position.set(x, y);
      const back = new Graphics().poly(hexPts(R - 2)).fill({ color: 0x1c140a });
      const mask = new Graphics().poly(hexPts(R - 2)).fill(0xffffff);
      const honey = new Graphics(); honey.mask = mask;
      const shine = new Graphics().poly(hexPts(R - 6)).stroke({ width: 1.2, color: INK, alpha: 0.06 });
      const rim = new Graphics().poly(hexPts(R - 1)).stroke({ width: 3, color: AMBER_D, alpha: 0.9 });
      c.addChild(back, honey, mask, shine, rim); comb.addChild(c);
      return { honey, x, y, level: 0, glow: 0, ph: Math.random() * 6 };
    });
  }

  const jarC = new Container(); app.stage.addChild(jarC);
  const jarGlow = new Graphics(), jarHoney = new Graphics(), jarMask = new Graphics(), jarGlass = new Graphics(), jarGloss = new Graphics();
  jarC.addChild(jarGlow, jarHoney, jarMask, jarGlass, jarGloss); jarHoney.mask = jarMask;
  let JW = 112, JH = 92, jarLevel = 0, jarWave = 0;
  function drawJar() {
    jarMask.clear().roundRect(-JW / 2 + 3, -JH / 2 + 3, JW - 6, JH - 6, 20).fill(0xffffff);
    jarGlass.clear().roundRect(-JW / 2, -JH / 2, JW, JH, 22).stroke({ width: 2.5, color: INK, alpha: 0.35 })
      .roundRect(-JW / 2 + 14, -JH / 2 - 14, JW - 28, 16, 6).fill({ color: 0x2a2433 }).stroke({ width: 2, color: INK, alpha: 0.3 });
    jarGloss.clear().roundRect(-JW / 2 + 10, -JH / 2 + 12, 8, JH - 34, 4).fill({ color: INK, alpha: 0.09 });
  }

  const shelf = new Container(); app.stage.addChild(shelf);
  const movers = [];
  function miniJar(scale) {
    const g = new Graphics(); const w = JW * scale, h = JH * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale + 4).fill({ color: AMBER, alpha: 0.95 }).stroke({ width: 2, color: INK, alpha: 0.35 })
     .roundRect(-w / 2 + w * 0.14, -h / 2 - h * 0.15, w * 0.72, h * 0.17, 4).fill({ color: 0x2a2433 }).stroke({ width: 1.5, color: INK, alpha: 0.3 })
     .roundRect(-w / 2 + w * 0.09, -h / 2 + h * 0.13, Math.max(3, w * 0.07), h * 0.6, 3).fill({ color: INK, alpha: 0.12 });
    return g;
  }
  const badgeL = new Container(), badgeR = new Container(); shelf.addChild(badgeL, badgeR);
  const txtL = new Text({ text: '×0', style: { fill: INK, fontSize: 15, fontWeight: '800', fontFamily: 'system-ui, sans-serif' } }); txtL.anchor.set(0.5);
  const txtR = new Text({ text: '×1', style: { fill: INK, fontSize: 12, fontWeight: '800', fontFamily: 'system-ui, sans-serif' } }); txtR.anchor.set(0.5);
  const hexL = new Graphics(), hexR = new Graphics(), beeIcon = new Graphics();
  badgeL.addChild(hexL, txtL); badgeR.addChild(hexR, beeIcon, txtR);
  let pulseL = 0;
  function badgeSize() { return Math.max(16, R * 0.62); }
  function shelfSlot() { return { x: jarC.x - JW / 2 - badgeSize() * 1.6, y: jarC.y + JH * 0.1, sc: 0.3 }; }
  function drawShelf() {
    const r = badgeSize(), n = shownFull || 0;
    hexL.clear().poly(hexPts(r)).fill({ color: n > 0 ? AMBER : 0x1c140a, alpha: n > 0 ? 0.22 : 1 }).stroke({ width: 2, color: AMBER, alpha: n > 0 ? 1 : 0.45 });
    txtL.text = '×' + n; txtL.style.fontSize = Math.round(r * 0.62); txtL.alpha = n > 0 ? 1 : 0.55;
    hexR.clear().poly(hexPts(r)).fill({ color: AMBER, alpha: 0.12 }).stroke({ width: 2, color: AMBER, alpha: 0.9 });
    beeIcon.clear().ellipse(0, 0, r * 0.32, r * 0.22).fill(AMBER_L).rect(-r * 0.1, -r * 0.21, r * 0.07, r * 0.42).fill(0x1a0d2e).rect(r * 0.06, -r * 0.2, r * 0.07, r * 0.4).fill(0x1a0d2e)
      .ellipse(-r * 0.08, -r * 0.26, r * 0.14, r * 0.09).fill({ color: 0xffffff, alpha: 0.6 }).ellipse(r * 0.1, -r * 0.27, r * 0.14, r * 0.09).fill({ color: 0xffffff, alpha: 0.5 });
    beeIcon.position.set(0, -r * 0.22);
    txtR.text = '×' + st.bees; txtR.style.fontSize = Math.round(r * 0.5); txtR.position.set(0, r * 0.38);
    const sl = shelfSlot(); badgeL.position.set(sl.x, sl.y);
    badgeR.position.set(jarC.x + JW / 2 + badgeSize() * 1.6, jarC.y + JH * 0.1);
    host.dataset.badges = n + ',' + st.bees;
  }

  let follow = null;
  const LEAF = 0x53c7cb;
  let dust = { on: false, x: 0, y: 0, acc: 0 };
  const dustG = new Graphics(); app.stage.addChild(dustG);
  const dustParts = [];

  const beeLayer = new Container(); app.stage.addChild(beeLayer);
  const bees = [];
  function makeBee() {
    const b = new Container();
    const wingL = new Graphics().ellipse(-4, -7, 6, 4).fill({ color: 0xffffff, alpha: 0.55 });
    const wingR = new Graphics().ellipse(4, -7, 6, 4).fill({ color: 0xffffff, alpha: 0.45 });
    const body = new Graphics().ellipse(0, 0, 9, 6.5).fill(AMBER_L).rect(-3.5, -6.2, 2.4, 12.4).fill(0x1a0d2e).rect(1.6, -6, 2.4, 12).fill(0x1a0d2e).circle(9, -1, 3.2).fill(0x1a0d2e);
    b.addChild(wingL, wingR, body); beeLayer.addChild(b); b.position.set(W() + 30, H() * 0.2);
    return { b, wingL, wingR, t: Math.random() * 100, sp: 0.6 + Math.random() * 0.5, rx: R * 3.6 + Math.random() * 30, ry: R * 2.1 + Math.random() * 20, ph: Math.random() * 6 };
  }
  function syncBees() {
    while (bees.length < st.bees) bees.push(makeBee());
    while (bees.length > st.bees) { const b = bees.pop(); beeLayer.removeChild(b.b); b.b.destroy({ children: true }); }
  }

  const fx = new Container(); app.stage.addChild(fx);
  const ringG = new Graphics(), partG = new Graphics(); fx.addChild(ringG, partG);
  const drops = [], parts = [], rings = [], floats = [], fliers = [];
  let squish = 0, time = 0;

  let topPad = 104;
  function layout() {
    const avail = Math.max(120, H() - topPad - 8);
    R = Math.max(18, Math.min(60, W() / 10.6, avail / 12.1));
    buildComb();
    const spare = Math.max(0, avail - R * 11.85);
    const combY = topPad + R * 4.1 + spare * 0.3;
    comb.position.set(W() / 2, combY);
    JW = R * 3.2; JH = R * 2.5;
    jarC.position.set(W() / 2, combY + R * 4.1 + R * 0.7 + R * 0.45 + spare * 0.45 + JH / 2);
    drawJar(); drawShelf();
    host.dataset.jarBottom = String(Math.round(jarC.y + JH / 2)); host.dataset.sceneH = String(Math.round(H()));
    glow.clear(); for (let i = 6; i > 0; i--) glow.circle(W() / 2, combY, R + i * R * 1.1).fill({ color: AMBER, alpha: 0.018 });
    for (const b of bees) { b.rx = R * 3.6 + Math.random() * 30; b.ry = R * 2.1 + Math.random() * 20; }
  }
  layout(); app.renderer.on('resize', layout);

  app.stage.eventMode = 'static'; app.stage.hitArea = app.screen;
  let pressing = false;
  app.stage.on('pointerup', () => { pressing = false; }); app.stage.on('pointerupoutside', () => { pressing = false; });
  app.stage.on('pointermove', (e) => { if (pressing) follow = { x: e.global.x, y: e.global.y, until: time + 2.5 }; });
  app.stage.on('pointerdown', (e) => {
    const p = e.global;
    pressing = true; follow = { x: p.x, y: p.y, until: time + 2.5 };
    if (p.y > jarC.y - JH / 2 - 10) return;
    squish = 1; rings.push({ x: p.x, y: p.y, t: 0 });
    let best = null, bd = 1e9; for (const cl of cells) { const d = Math.hypot(comb.x + cl.x - p.x, comb.y + cl.y - p.y); if (d < bd) { bd = d; best = cl; } }
    if (best && bd < R * 1.2) best.glow = 1;
    onTap?.(p.x, p.y);
  });

  let sizeCheck = 0;
  app.ticker.add((tk) => {
    const dt = Math.min(2, tk.deltaTime); time += dt / 60;
    if ((sizeCheck += dt) > 30) {
      sizeCheck = 0;
      if (Math.abs(host.clientHeight - app.screen.height) > 1 || Math.abs(host.clientWidth - app.screen.width) > 1) { app.resize(); layout(); }
    }
    pollenG.clear();
    for (const p of pollen) { p.y -= p.v * dt; if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); } pollenG.circle(p.x * W() + Math.sin(time + p.ph) * 6, p.y * H(), p.r).fill({ color: AMBER_L, alpha: 0.18 + 0.12 * Math.sin(time * 2 + p.ph) }); }

    squish *= Math.pow(0.86, dt);
    const s = 1 - 0.035 * squish * Math.cos(time * 40); comb.scale.set(s, 1 + (1 - s) * 0.6);

    cells.forEach((cl, i) => {
      const target = Math.max(0, Math.min(1, st.progress * cells.length - i));
      cl.level += (target - cl.level) * Math.min(1, 0.08 * dt); cl.glow *= Math.pow(0.9, dt);
      const g = cl.honey; g.clear();
      if (cl.level > 0.002) {
        const top = R - cl.level * 2 * R, amp = 1.6 + 2.2 * (1 - cl.level) * (0.4 + cl.glow), pts = [];
        for (let k = 0; k <= 10; k++) { const xx = -R + k * (2 * R / 10); pts.push(xx, top + Math.sin(time * 3 + cl.ph + k * 0.7) * amp); }
        pts.push(R, R + 2, -R, R + 2);
        g.poly(pts).fill({ color: AMBER, alpha: 0.95 }); g.rect(-R, top + 3, 2 * R, 3).fill({ color: AMBER_L, alpha: 0.35 });
      }
      if (cl.glow > 0.02) g.poly(hexPts(R - 2)).fill({ color: AMBER_L, alpha: 0.25 * cl.glow });
    });

    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt / 30; if (rings[i].t > 1) rings.splice(i, 1); }
    ringG.clear(); for (const r of rings) ringG.circle(r.x, r.y, 8 + r.t * 46).stroke({ width: 2.5 * (1 - r.t), color: AMBER_L, alpha: 0.7 * (1 - r.t) });

    const mouthY = jarC.y - JH / 2 + (1 - jarLevel) * (JH - 10);
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.vy += 0.35 * dt; d.vx += ((jarC.x - d.x) * 0.0025) * dt; d.vx *= Math.pow(0.985, dt);
      d.x += d.vx * dt; d.y += d.vy * dt; d.g.position.set(d.x, d.y); d.g.rotation = -Math.atan2(d.vx, Math.abs(d.vy) + 1) * 0.6;
      if (d.y >= mouthY && Math.abs(d.x - jarC.x) < JW / 2) {
        for (let k = 0; k < 6; k++) parts.push({ x: d.x, y: mouthY, vx: (Math.random() - 0.5) * 3, vy: -1.5 - Math.random() * 2.4, life: 1 });
        jarWave = Math.min(6, jarWave + 3.5); fx.removeChild(d.g); d.g.destroy(); drops.splice(i, 1); onLand?.();
      } else if (d.y > H() + 30) { fx.removeChild(d.g); d.g.destroy(); drops.splice(i, 1); }
    }
    partG.clear();
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.vy += 0.25 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt / 40; if (p.life <= 0) { parts.splice(i, 1); continue; } partG.circle(p.x, p.y, 2.2 * p.life + 0.6).fill({ color: AMBER_L, alpha: p.life }); }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.life -= dt / 55; f.t.y -= 0.9 * dt; f.t.alpha = Math.max(0, f.life); if (f.life <= 0) { fx.removeChild(f.t); f.t.destroy(); floats.splice(i, 1); } }

    jarSlide *= Math.pow(0.88, dt); jarC.x = W() / 2 + jarSlide;
    for (let i = movers.length - 1; i >= 0; i--) {
      const m = movers[i]; m.t += dt / 40; const k = Math.min(1, m.t), e = 1 - Math.pow(1 - k, 3);
      m.g.position.set(m.x0 + (m.x1 - m.x0) * e, m.y0 + (m.y1 - m.y0) * e - Math.sin(k * Math.PI) * 30);
      m.g.scale.set(1 + (m.sc - 1) * e);
      if (k >= 1) { fx.removeChild(m.g); m.g.destroy(); movers.splice(i, 1); drawShelf(); pulseL = 1; }
    }
    jarLevel += (st.jarRatio - jarLevel) * Math.min(1, 0.06 * dt); jarWave *= Math.pow(0.95, dt);
    jarHoney.clear();
    if (jarLevel > 0.003) {
      const top = JH / 2 - 4 - jarLevel * (JH - 8), pts = [];
      for (let k = 0; k <= 14; k++) { const xx = -JW / 2 + k * (JW / 14); pts.push(xx, top + Math.sin(time * 4 + k * 0.8) * (1.2 + jarWave)); }
      pts.push(JW / 2, JH / 2, -JW / 2, JH / 2);
      jarHoney.poly(pts).fill({ color: AMBER, alpha: 0.95 });
      for (let k = 0; k < 5; k++) { const bx = -JW / 2 + 18 + ((k * 23 + time * 8) % (JW - 30)), by = JH / 2 - 8 - ((time * 14 + k * 17) % Math.max(6, jarLevel * (JH - 14))); jarHoney.circle(bx, by, 1.6).fill({ color: AMBER_L, alpha: 0.5 }); }
    }
    jarGlow.clear(); if (st.ready) jarGlow.roundRect(-JW / 2 - 8, -JH / 2 - 8, JW + 16, JH + 16, 28).fill({ color: AMBER, alpha: 0.10 + 0.07 * Math.sin(time * 3) });

    pulseL *= Math.pow(0.9, dt); badgeL.scale.set(1 + pulseL * 0.25);
    if (follow && time > follow.until) follow = null;
    bees.forEach((b, bi) => {
      b.t += dt / 60 * b.sp;
      let tx = comb.x + Math.cos(b.t + b.ph) * b.rx, ty = comb.y + Math.sin(b.t * 1.7 + b.ph) * b.ry, k = 0.08;
      if (bi === 0 && follow) { tx = follow.x + Math.cos(time * 3) * 14; ty = follow.y - 26 + Math.sin(time * 4) * 6; k = 0.045; }
      b.b.x += (tx - b.b.x) * k * dt; b.b.y += (ty - b.b.y) * k * dt;
      b.b.scale.x = Math.cos(b.t + b.ph + Math.PI / 2) < 0 ? -1 : 1;
      const flap = 0.4 + 0.6 * Math.abs(Math.sin(time * 38 + b.ph)); b.wingL.scale.y = flap; b.wingR.scale.y = 1.4 - flap;
    });
    if (dust.on && (dust.acc += dt) > 20) { dust.acc = 0; dustParts.push({ x: dust.x + (Math.random() - 0.5) * 18, y: dust.y + 6, vx: (Math.random() - 0.5) * 0.25, vy: 0.22 + Math.random() * 0.28, life: 1, ph: Math.random() * 6.3, s: 2.2 + Math.random() * 1.8 }); }
    dustG.clear();
    for (let i = dustParts.length - 1; i >= 0; i--) { const d = dustParts[i]; d.x += d.vx * dt + Math.sin(time * 2 + i) * 0.15; d.y += d.vy * dt; d.life -= dt / 160; if (d.life <= 0) { dustParts.splice(i, 1); continue; } const tw = 0.45 + 0.55 * Math.abs(Math.sin(time * 5 + d.ph)), r = d.s * (0.6 + 0.4 * tw), a = Math.min(1, d.life * 1.6), k = r * 0.28;
      dustG.circle(d.x, d.y, r * 1.6).fill({ color: LEAF, alpha: a * 0.16 * tw });
      dustG.poly([d.x, d.y - r * 1.5, d.x + k, d.y - k, d.x + r * 1.5, d.y, d.x + k, d.y + k, d.x, d.y + r * 1.5, d.x - k, d.y + k, d.x - r * 1.5, d.y, d.x - k, d.y - k]).fill({ color: LEAF, alpha: a * (0.55 + 0.45 * tw) });
      dustG.circle(d.x, d.y, r * 0.32).fill({ color: 0xffffff, alpha: a * tw }); }
    for (let i = fliers.length - 1; i >= 0; i--) {
      const f = fliers[i]; f.t += dt / 50; const k = Math.min(1, Math.max(0, f.t)), e = 1 - Math.pow(1 - k, 3);
      f.g.position.set(f.x0 + (f.x1 - f.x0) * e, f.y0 + (f.y1 - f.y0) * e - Math.sin(k * Math.PI) * 60); f.g.alpha = 1 - k * 0.6; f.g.scale.set(1 - k * 0.5);
      if (f.t >= 1) { fx.removeChild(f.g); f.g.destroy(); fliers.splice(i, 1); }
    }
  });

  return {
    setState(next) {
      Object.assign(st, next); st.bees = Math.max(1, Math.min(6, st.bees | 0)); syncBees(); drawShelf();
      const full = Math.max(0, st.fullJars | 0); host.dataset.fullJars = String(full);
      if (shownFull === null) { shownFull = full; drawShelf(); }
      else if (full > shownFull) {
        const sl = shelfSlot(); const g = miniJar(1); g.position.set(jarC.x, jarC.y); fx.addChild(g);
        movers.push({ g, t: 0, x0: jarC.x, y0: jarC.y, x1: sl.x, y1: sl.y, sc: sl.sc });
        shownFull = full; jarLevel = 0; jarSlide = W() * 0.6; onJarFull?.();
      } else if (full < shownFull) { shownFull = full; drawShelf(); }
    },
    setTopPad(px) { if (Math.abs(px - topPad) > 2) { topPad = px; layout(); } },
    refit() { app.resize(); layout(); },
    setDust(on, x, y) { dust.on = !!on; dust.x = x; dust.y = y; },
    drop(x, y, label) {
      host.dataset.lastDrop = `${Math.round(x)},${Math.round(y)}`;
      const g = new Graphics(); dropShape(g, 1); g.position.set(x, y); fx.addChild(g);
      drops.push({ g, x, y, vx: (jarC.x - x) * 0.018, vy: -2.2 });
      if (label) { const t = new Text({ text: label, style: { fill: AMBER_L, fontSize: 15, fontWeight: '800', fontFamily: 'system-ui, sans-serif' } }); t.anchor.set(0.5); t.position.set(x, y - 16); fx.addChild(t); floats.push({ t, life: 1 }); }
    },
    full() { squish = -0.6; },
    withdraw() {
      for (let k = 0; k < 14; k++) { const g = new Graphics(); dropShape(g, 0.8); fx.addChild(g); fliers.push({ g, t: -k * 0.06, x0: jarC.x + (Math.random() - 0.5) * 60, y0: jarC.y, x1: W() / 2, y1: 40 }); }
      jarWave = 5;
    },
    jarTop() { return jarC.y - JH / 2 - 18; },
  };
}
