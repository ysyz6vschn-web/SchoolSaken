// Сервер игры. Запуск: npm install && node server.js
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

// ===== НАСТРОЙКИ (кд в секундах) =====
const CD = { dima: [20, 30], sonya: [25, 40], maxim: [20], roma: [1.5, 20, 30] };
const DMG = 30, SPRINT_MS = 10000, REVEAL_MS = 5000;
const GENS = [[185, -5], [215, 0], [200, 18]];

let P = {}, pz = [], gens = [0, 0, 0], phase = 'lobby', uid = 0;
const now = Date.now, d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const L = () => Object.values(P), K = () => L().find(p => p.c === 'roma');
const S = () => L().filter(p => p.c && p.c !== 'roma' && p.hp > 0);
const send = (w, o) => w.readyState === 1 && w.send(JSON.stringify(o));
const all = o => wss.clients.forEach(w => send(w, o));

function startGame() {
  phase = 'game'; gens = [0, 0, 0]; pz = []; let n = 0;
  L().forEach(p => {
    Object.assign(p, { hp: 100, hl: 0, cd: [], st: 0, sr: 0, rv: 0 });
    if (!p.c) return;
    const k = p.c === 'roma';
    p.x = k ? 200 : 185 + n++ * 10; p.z = k ? 30 : -30;
  });
  all({ t: 'start', sp: Object.fromEntries(L().map(p => [p.id, [p.x, p.z]])) });
}
function end(w) { phase = 'lobby'; pz = []; L().forEach(p => { p.hp = 100; p.x = p.z = 0; }); all({ t: 'end', w }); }

function act(p, k) {
  const T = now(), kl = K();
  if (!CD[p.c] || k >= CD[p.c].length || (p.cd[k] || 0) > T || p.st > T) return;
  p.cd[k] = T + CD[p.c][k] * 1000;
  const near = r => kl && d(p, kl) < r;
  if (p.c === 'dima') { if (k === 0 && near(8)) kl.st = T + 3000; if (k === 1) p.hl += 30; }
  if (p.c === 'sonya') { if (k === 0) pz.push({ x: p.x, z: p.z, i: ++uid }); if (k === 1) p.sr = T + SPRINT_MS; }
  if (p.c === 'maxim' && near(4)) kl.st = T + 2000;
  if (p.c === 'roma') {
    if (k < 2) {
      const v = S().filter(q => d(p, q) < 4).sort((a, b) => d(p, a) - d(p, b))[0];
      if (v) { v.hp = Math.max(0, v.hp - DMG); if (!S().length) end('Убийца'); }
    } else p.rv = T + REVEAL_MS;
  }
}

wss.on('connection', ws => {
  const id = ++uid;
  const p = P[id] = { id, c: null, x: 0, z: 0, ry: 0, hp: 100, hl: 0, cd: [], st: 0, sr: 0, rv: 0 };
  send(ws, { t: 'hi', id });
  ws.on('message', m => {
    let o; try { o = JSON.parse(m); } catch { return; }
    if (o.t === 'pick' && phase === 'lobby' && CD[o.c] && !L().some(q => q !== p && q.c === o.c)) p.c = o.c;
    if (o.t === 'm' && isFinite(o.x + o.z + o.ry)) { p.x = +o.x; p.z = +o.z; p.ry = +o.ry; }
    if (o.t === 'start' && phase === 'lobby' && K() && S().length) startGame();
    if (phase !== 'game' || p.hp <= 0) return;
    if (o.t === 'a') act(p, o.k);
    if (o.t === 'g' && p.c !== 'roma') {
      const g = GENS[o.i];
      if (g && Math.hypot(p.x - g[0], p.z - g[1]) < 5 && gens[o.i] < 100) {
        gens[o.i] = Math.min(100, gens[o.i] + 2);
        if (gens.every(v => v >= 100)) end('Выжившие');
      }
    }
  });
  ws.on('close', () => { delete P[id]; });
});

setInterval(() => {
  const T = now();
  L().forEach(p => { if (p.hl > 0 && p.hp > 0) { const a = Math.min(p.hl, 0.4); p.hl -= a; p.hp = Math.min(100, p.hp + a); } });
  pz = pz.filter(z => { const q = S().find(q => Math.hypot(q.x - z.x, q.z - z.z) < 2); if (q) q.hl += 40; return !q; });
  all({
    t: 's', gens, pz, p: L().map(p => ({
      id: p.id, c: p.c, x: p.x, z: p.z, ry: p.ry, hp: Math.round(p.hp),
      st: Math.max(0, p.st - T), sr: Math.max(0, p.sr - T), rv: Math.max(0, p.rv - T),
      cd: (CD[p.c] || []).map((_, k) => Math.max(0, (p.cd[k] || 0) - T))
    }))
  });
}, 66);
console.log('Сервер запущен');
