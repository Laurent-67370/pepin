/* Serveur de classement en ligne de Pépin.
   Node.js 18+, aucune dépendance. Données dans un fichier JSON (écriture atomique).
   Variables d'environnement : PORT (3215), DATA_DIR (./data), ALLOW_ORIGINS (liste séparée par des virgules). */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.PORT || 3215;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'scores.json');
const ORIGINS = (process.env.ALLOW_ORIGINS || 'https://laurent-67370.github.io,https://pepin.lhusser.fr').split(',').map(s => s.trim());
const LEVELS = 12;
// Temps minimal plausible par monde (secondes), d'après le parcours optimal du robot vérificateur
const MIN_TIME = [10, 10, 12, 11, 10, 15, 11, 10, 11, 11, 11, 18];
const MAX_SCORE = 60000;
function dailyWorld(day) { let h = 0; for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % LEVELS; }
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_RE = /^[\p{L}\p{N} _.'-]{2,12}$/u;

fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { entries: {} }; // clé "device|level" -> { name, device, level, score, time, date }
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE); }, 200);
}
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60000);
  h.push(now); hits.set(ip, h); return h.length > 20;
}
function topLevel(level, n = 10) {
  return Object.values(db.entries).filter(e => e.level === level && !e.day).sort((a, b) => b.score - a.score || a.time - b.time).slice(0, n)
    .map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, time: e.time, device: e.device.slice(0, 8) }));
}
function topDaily(day, n = 10) {
  return Object.values(db.entries).filter(e => e.day === day).sort((a, b) => b.score - a.score || a.time - b.time).slice(0, n)
    .map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, time: e.time, device: e.device.slice(0, 8) }));
}
function topTotal(n = 10) {
  const per = new Map();
  for (const e of Object.values(db.entries)) {
    if (e.day) continue;
    const p = per.get(e.device) || { name: e.name, score: 0, worlds: 0, last: 0, device: e.device };
    p.score += e.score; p.worlds++; if (e.date > p.last) { p.last = e.date; p.name = e.name; }
    per.set(e.device, p);
  }
  return [...per.values()].sort((a, b) => b.score - a.score).slice(0, n).map((p, i) => ({ rank: i + 1, name: p.name, score: p.score, worlds: p.worlds, device: p.device.slice(0, 8) }));
}
function send(res, code, obj, origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (origin) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'; h['Access-Control-Allow-Headers'] = 'Content-Type'; }
  res.writeHead(code, h); res.end(obj == null ? '' : JSON.stringify(obj));
}
http.createServer((req, res) => {
  const origin = ORIGINS.includes(req.headers.origin) || ORIGINS.includes('*') ? req.headers.origin || '*' : null;
  const url = new URL(req.url, 'http://x');
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (req.method === 'OPTIONS') return send(res, 204, null, origin);
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, entries: Object.keys(db.entries).length }, origin);
  if (req.method === 'GET' && url.pathname === '/api/scores') {
    const dq = url.searchParams.get('daily');
    if (dq) { if (!DAY_RE.test(dq)) return send(res, 400, { error: 'jour invalide' }, origin); return send(res, 200, { day: dq, level: dailyWorld(dq), top: topDaily(dq) }, origin); }
    const lv = url.searchParams.get('level');
    if (lv === 'total') return send(res, 200, { level: 'total', top: topTotal() }, origin);
    const level = +lv; if (!Number.isInteger(level) || level < 0 || level >= LEVELS) return send(res, 400, { error: 'monde invalide' }, origin);
    return send(res, 200, { level, top: topLevel(level) }, origin);
  }
  if (req.method === 'POST' && url.pathname === '/api/scores') {
    if (!origin) return send(res, 403, { error: 'origine refusée' }, null);
    if (limited(ip)) return send(res, 429, { error: 'trop de requêtes' }, origin);
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2000) req.destroy(); });
    req.on('end', () => {
      let d; try { d = JSON.parse(body); } catch (e) { return send(res, 400, { error: 'JSON invalide' }, origin); }
      const level = d.level, score = d.score, time = d.time, name = String(d.name || '').trim(), device = String(d.device || '');
      if (!Number.isInteger(level) || level < 0 || level >= LEVELS) return send(res, 400, { error: 'monde invalide' }, origin);
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return send(res, 400, { error: 'score invalide' }, origin);
      if (typeof time !== 'number' || time < MIN_TIME[level] || time > 3600) return send(res, 400, { error: 'temps invalide' }, origin);
      if (!NAME_RE.test(name)) return send(res, 400, { error: 'prénom invalide' }, origin);
      if (!/^[a-f0-9-]{16,40}$/i.test(device)) return send(res, 400, { error: 'appareil invalide' }, origin);
      let day = null;
      if (d.day != null) {
        day = String(d.day);
        if (!DAY_RE.test(day) || Math.abs(Date.parse(day + 'T12:00:00Z') - Date.now()) > 40 * 3600 * 1000) return send(res, 400, { error: 'jour invalide' }, origin);
        if (dailyWorld(day) !== level) return send(res, 400, { error: 'monde du jour invalide' }, origin);
      }
      const key = device + '|' + (day ? 'D' + day : level), prev = db.entries[key];
      if (!prev || score > prev.score) { db.entries[key] = { name, device, level, score, time: Math.round(time * 10) / 10, date: Date.now(), ...(day ? { day } : {}) }; persist(); }
      else if (prev.name !== name) { prev.name = name; persist(); }
      const top = day ? topDaily(day, 1000) : topLevel(level, 1000), rank = top.findIndex(e => e.device === device.slice(0, 8) && e.name === name) + 1;
      return send(res, 200, { ok: true, best: (db.entries[key] || {}).score, rank, total: top.length }, origin);
    });
    return;
  }
  send(res, 404, { error: 'introuvable' }, origin);
}).listen(PORT, '127.0.0.1', () => console.log(`Classement Pépin sur http://127.0.0.1:${PORT}`));
