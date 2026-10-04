/* Robot vérificateur des niveaux de Pépin.
   Usage : node tools/verifier-niveaux.js [numéro de monde]   (depuis la racine du dépôt)
   Rejoue la physique du saut depuis chaque position où Pépin peut se tenir et signale :
   arrivée inaccessible, graines, gouttes de rosée ou caisses impossibles à atteindre.
   Hypothèses : ennemis et vent ignorés, plateformes mobiles considérées sur toute leur course. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('function Builder(w)'), b = html.indexOf('const LEVELS = ['), e = html.indexOf('\n];', b) + 3;
const ctxv = { T: 16, ROWS: 15 }; vm.createContext(ctxv); vm.runInContext(html.slice(a, e).replace('const LEVELS', 'var LEVELS'), ctxv);
const { LEVELS, T, ROWS } = ctxv;
const GRAV = 0.38, MAXV = 2.35, JUMPV = -6.7, PW = 10, PH = 14;
function build(i) {
  const def = LEVELS[i]; const g = Array.from({ length: ROWS }, () => Array(def.w).fill('.'));
  const b = { g, fill(x0, x1, y0, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y] && x >= 0 && x < def.w) g[y][x] = c; },
    ground(x0, x1, top) { this.fill(x0, x1, top, ROWS - 1, '#'); }, line(x0, x1, y, c) { this.fill(x0, x1, y, y, c); },
    put(x, y, c) { if (g[y] && x >= 0 && x < def.w) g[y][x] = c; }, row(x, y, s) { for (let k = 0; k < s.length; k++) if (s[k] !== ' ') this.put(x + k, y, s[k]); } };
  def.build(b);
  const L = { def, w: def.w, g, seeds: [], gems: [], crates: [], plats: [], springs: [], start: null, goal: null, ceil: !!def.ceil };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < def.w; x++) {
    const c = g[y][x]; let clr = true;
    if (c === 'P') L.start = { x: x * T + 3, y: y * T + 2 };
    else if (c === 'o') L.seeds.push({ x: x * T + 4, y: y * T + 4, w: 8, h: 8, tx: x, ty: y });
    else if (c === '*') L.gems.push({ x: x * T + 3, y: y * T + 2, w: 10, h: 12, tx: x, ty: y });
    else if (c === 'M') { L.plats.push({ x: x * T - 2.5 * T, y: y * T, w: 48 + 5 * T }); }
    else if (c === 'V') { for (const dy of [-2, -1, 0, 1, 2]) L.plats.push({ x: x * T, y: y * T + dy * T, w: 48 }); }
    else if (c === 'n') L.plats.push({ x: x * T, y: (y + 1) * T - 4, w: 32 });
    else if (c === 'S') L.springs.push({ x: x * T + 2, y: y * T + 8, w: 12, h: 8 });
    else if (c === 'G') L.goal = { x: x * T, y: y * T - 32, w: 16, h: 48 };
    else if (c === 'f') { g[y][x] = '~'; clr = false; }
    else if ('HLKbxwiB'.includes(c)) {}
    else clr = false;
    if (clr) g[y][x] = '.';
    if (c === 'C') L.crates.push({ tx: x, ty: y });
  }
  if (def.boss) { const a = def.arena; L.gems.push({ x: (a.min + a.max) / 2 - 5, y: 9 * T, w: 10, h: 12, boss: true }); }
  return L;
}
const solid = c => c === '#' || c === '=' || c === 'C' || c === '_' || c === 'c';
function sim(L, broken, st, act) {
  const tile = (tx, ty) => { if (ty < 0) return L.ceil ? '#' : '.'; if (ty >= ROWS) return '.'; if (tx < 0 || tx >= L.w) return '#'; const c = L.g[ty][tx]; if (c === 'C' && broken.has(ty * 1000 + tx)) return '.'; return c; };
  const p = { x: st.x, y: st.y, vx: act.v0, vy: 0, jumping: false, dashT: 0, dashUsed: false, face: act.d };
  const touched = [], newBroken = [];
  let onG = true;
  for (let f = 0; f < 170; f++) {
    // inputs
    let ix = f < act.walk ? act.d : f >= act.walk ? act.air : 0;
    const jumpPress = f === act.walk && act.hold > 0, jumpHeld = f >= act.walk && f < act.walk + act.hold;
    if (act.dashAt >= 0 && f === act.walk + act.dashAt && !p.dashUsed) { p.dashT = 11; p.dashUsed = true; p.vy = 0; p.face = act.dashDir; }
    if (jumpPress && onG) { p.vy = JUMPV; p.jumping = true; onG = false; }
    if (p.dashT > 0) { p.dashT--; p.vx = p.face * 5.2; p.vy = 0; if (p.dashT === 0) p.vx = p.face * 2.6; }
    else {
      const target = ix * MAXV;
      if (ix) { const turning = Math.sign(target) !== Math.sign(p.vx) && Math.abs(p.vx) > 0.4; const acc = onG ? (turning ? 0.75 : 0.42) : (turning ? 0.36 : 0.26); p.vx += Math.max(-acc, Math.min(acc, target - p.vx)); }
      else { const fr = onG ? 0.38 : 0.06; p.vx = Math.abs(p.vx) <= fr ? 0 : p.vx - Math.sign(p.vx) * fr; }
      if (!jumpHeld && p.jumping && p.vy < -2) { p.vy *= 0.5; p.jumping = false; }
      if (p.vy >= 0) p.jumping = false;
      p.vy += (p.jumping && jumpHeld && p.vy < 0) ? GRAV * 0.82 : GRAV; if (p.vy > 6.5) p.vy = 6.5;
    }
    // move X
    p.x += p.vx;
    const top = Math.floor(p.y / T), bot = Math.floor((p.y + PH - 0.01) / T);
    const tx = p.vx > 0 ? Math.floor((p.x + PW - 0.01) / T) : Math.floor(p.x / T);
    if (p.vx !== 0) for (let ty = top; ty <= bot; ty++) { const c = tile(tx, ty); if (solid(c)) { if (c === 'C' && p.dashT > 0) { broken.add(ty * 1000 + tx); newBroken.push(ty * 1000 + tx); continue; } p.x = p.vx > 0 ? tx * T - PW : (tx + 1) * T; if (p.dashT > 0) p.dashT = 0; break; } }
    const prevB = p.y + PH; p.y += p.vy; onG = false;
    const l = Math.floor(p.x / T), r = Math.floor((p.x + PW - 0.01) / T);
    if (p.vy > 0) { const ty = Math.floor((p.y + PH - 0.01) / T); for (let x = l; x <= r; x++) { const c = tile(x, ty); if (solid(c) || (c === '-' && prevB <= ty * T + 0.5)) { p.y = ty * T - PH; p.vy = 0; onG = true; break; } } }
    else if (p.vy < 0) { const ty = Math.floor(p.y / T); for (let x = l; x <= r; x++) { const c = tile(x, ty); if (solid(c)) { if (c === 'C') { broken.add(ty * 1000 + x); newBroken.push(ty * 1000 + x); } p.y = (ty + 1) * T; p.vy = 0; break; } } }
    if (p.vy >= 0 && !onG) for (const m of L.plats) if (p.x + PW > m.x + 1 && p.x < m.x + m.w - 1 && prevB <= m.y + 1.5 && p.y + PH >= m.y) { p.y = m.y - PH; p.vy = 0; onG = true; }
    for (const s of L.springs) if (p.vy > 0 && p.x < s.x + s.w && p.x + PW > s.x && p.y + PH > s.y && p.y < s.y + s.h && prevB <= s.y + 5) { p.y = s.y - PH; p.vy = jumpHeld || act.hold > 0 ? -10.6 : -9; onG = false; p.dashUsed = false; }
    // hazards
    if (p.y > ROWS * T + 30) return null;
    const hl = Math.floor((p.x + 2) / T), hr = Math.floor((p.x + PW - 2) / T), ht = Math.floor((p.y + 2) / T), hb = Math.floor((p.y + PH - 1) / T);
    for (let ty = ht; ty <= hb; ty++) for (let x = hl; x <= hr; x++) { const c = tile(x, ty); if ((c === '~' && p.y + PH > ty * T + 5) || (c === '^' && p.y + PH > ty * T + 7) || (c === 'v' && p.y < ty * T + 9)) return null; }
    touched.push(p.x, p.y);
    if (onG && f > act.walk + 2 && p.dashT === 0) return { x: p.x, y: p.y, touched, newBroken };
  }
  return null;
}
function check(i) {
  const L = build(i); const broken = new Set();
  const key = (x, y) => Math.round(x / 4) + ',' + Math.round(y);
  const seen = new Map(); const queue = [];
  const push = (x, y) => { const k = key(x, y); if (!seen.has(k)) { seen.set(k, { x, y }); queue.push({ x, y }); } };
  push(L.start.x, L.start.y + 0); // will settle
  const hitItems = new Set(); let goal = false;
  const acts = [];
  for (const d of [-1, 1]) for (const v0 of [0, d * MAXV]) for (const walk of [0, 6, 16]) for (const hold of [0, 3, 8, 14, 40]) for (const air of [d, 0, -d]) for (const dashAt of (NO_DASH ? [-1] : [-1, 4, 12, 22])) for (const dashDir of dashAt < 0 ? [d] : [d, -d]) {
    if (hold === 0 && walk === 0) continue;
    acts.push({ d, v0, walk, hold, air, dashAt, dashDir });
  }
  let changed = true, guard = 0;
  while (queue.length && guard++ < 200000) {
    const st = queue.shift();
    for (const a of acts) {
      const res = sim(L, broken, st, a); if (!res) continue;
      const t = res.touched;
      for (let k = 0; k < t.length; k += 2) {
        const px = t[k], py = t[k + 1];
        L.seeds.forEach((s, j) => { if (px < s.x + s.w && px + PW > s.x && py < s.y + s.h && py + PH > s.y) hitItems.add('s' + j); });
        L.gems.forEach((s, j) => { if (px < s.x + s.w && px + PW > s.x && py < s.y + s.h && py + PH > s.y) hitItems.add('g' + j); });
        if (L.goal && px < L.goal.x + 16 && px + PW > L.goal.x && py < L.goal.y + 48 && py + PH > L.goal.y) goal = true;
      }
      push(res.x, res.y);
    }
  }
  const miss = []; L.seeds.forEach((s, j) => { if (!hitItems.has('s' + j)) miss.push('graine ' + s.tx + ',' + s.ty); });
  L.gems.forEach((s, j) => { if (!hitItems.has('g' + j) && !s.boss) miss.push('ROSÉE ' + s.tx + ',' + s.ty); });
  const crMiss = L.crates.filter(c => !broken.has(c.ty * 1000 + c.tx)).map(c => 'caisse ' + c.tx + ',' + c.ty);
  console.log(`${i + 1}. ${L.def.name}: arrivée ${goal ? 'OK' : 'INACCESSIBLE'} | ${L.seeds.length - miss.filter(m => m.startsWith('graine')).length}/${L.seeds.length} graines | positions ${seen.size}` + (miss.length || crMiss.length ? '\n   manquants: ' + miss.concat(crMiss).join(' ; ') : ''));
}
const NO_DASH = process.argv.includes('--sans-elan');
const only = process.argv.find((x, i) => i > 1 && /^\d+$/.test(x)) != null ? +process.argv.find((x, i) => i > 1 && /^\d+$/.test(x)) - 1 : null; for (let i = 0; i < LEVELS.length; i++) if (only == null || only === i) check(i);
