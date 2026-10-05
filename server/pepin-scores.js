/* Serveur de classement en ligne de Pépin.
   Node.js 18+, aucune dépendance. Données dans un fichier JSON (écriture atomique).
   Variables d'environnement : PORT (3215), DATA_DIR (./data), ALLOW_ORIGINS (liste séparée par des virgules),
   GAME_HTML (un index.html à charger au démarrage), GAME_FETCH (0 pour ne jamais télécharger le jeu depuis GitHub).
   Vérification des parties (mode observation) : chaque record reçu avec sa partie est rejoué dans le vrai code du jeu,
   dans un thread séparé, et le résultat est noté (ok, ecart, absent, version, erreur) sans rien refuser. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { Worker } = require('worker_threads');
const PORT = +process.env.PORT || 3215;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'scores.json');
const ORIGINS = (process.env.ALLOW_ORIGINS || 'https://laurent-67370.github.io,https://pepin.lhusser.fr').split(',').map(s => s.trim());
const LEVELS = 13; // 12 mondes de l'aventure + le Jardin d'or, ouvert par les 12 graines d'or
const DAILY_WORLDS = 12; // le défi du jour ne tire que dans l'aventure
// Temps minimal plausible par monde (secondes), d'après le parcours optimal du robot vérificateur
const MIN_TIME = [10, 10, 12, 11, 10, 15, 11, 10, 11, 11, 11, 18, 11];
const MAX_SCORE = 60000;
function dailyWorld(day) { let h = 0; for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % DAILY_WORLDS; }
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_RE = /^[\p{L}\p{N} _.'-]{2,12}$/u;
const MAX_BODY = 256 * 1024; // une partie de 15 minutes tient largement dedans

fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { entries: {} }; // clé "device|level" -> { name, device, level, score, time, date }
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
const PURGE_MS = 30 * 24 * 3600 * 1000; // au-delà de 30 jours
// Seuls les défis du jour expirent : les records par monde restent acquis, même anciens
function purgeOld(dry) {
  const cut = Date.now() - PURGE_MS;
  let n = 0;
  for (const k of Object.keys(db.entries)) if (db.entries[k].day && db.entries[k].date < cut) { if (!dry) delete db.entries[k]; n++; }
  return n;
}
purgeOld(); // au démarrage
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  purgeOld(); // à chaque écriture
  saveTimer = setTimeout(() => { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE); }, 200);
}
function flushSync() { clearTimeout(saveTimer); const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE); }
process.on('SIGTERM', () => { try { flushSync(); } catch (e) {} process.exit(0); });
process.on('SIGINT', () => { try { flushSync(); } catch (e) {} process.exit(0); });
/* Copies du jeu, une par version : une partie est toujours rejouée avec le code qui l'a produite */
const GAME_DIR = path.join(DATA_DIR, 'jeu'), jeux = new Map();
fs.mkdirSync(GAME_DIR, { recursive: true });
const versionDe = html => (html.match(/const APP_VERSION = '([^']+)'/) || [])[1];
function ajouterJeu(html, sauver) {
  const v = versionDe(html); if (!v || !/^[\w.-]{1,20}$/.test(v)) return null;
  if (!jeux.has(v)) { jeux.set(v, html); if (sauver) fs.writeFileSync(path.join(GAME_DIR, v + '.html'), html); }
  return v;
}
for (const f of fs.readdirSync(GAME_DIR)) if (f.endsWith('.html')) ajouterJeu(fs.readFileSync(path.join(GAME_DIR, f), 'utf8'), false);
if (process.env.GAME_HTML) try { ajouterJeu(fs.readFileSync(process.env.GAME_HTML, 'utf8'), true); } catch (e) { console.error('GAME_HTML illisible :', e.message); }
let dernierTelechargement = 0;
/* Version inconnue : on récupère le jeu publié sur GitHub (au plus une fois toutes les 10 minutes) */
async function obtenirJeu(v) {
  if (jeux.has(v) || process.env.GAME_FETCH === '0' || Date.now() - dernierTelechargement < 600000) return jeux.get(v) || null;
  dernierTelechargement = Date.now();
  // L'API GitHub d'abord ; en repli raw.githubusercontent.com, qui peut être en retard mais sans risque : la version est contrôlée
  for (const [url, accept] of [['https://api.github.com/repos/Laurent-67370/pepin/contents/index.html', 'application/vnd.github.raw'], ['https://raw.githubusercontent.com/Laurent-67370/pepin/main/index.html', 'text/plain']]) {
    try {
      const r = await fetch(url, { headers: { Accept: accept, 'User-Agent': 'pepin-scores' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) { console.error(`Téléchargement du jeu refusé (${r.status}) : ${url}`); continue; }
      const nv = ajouterJeu(await r.text(), true); if (nv) console.log(`Jeu ${nv} récupéré depuis ${new URL(url).hostname}`);
      if (jeux.has(v)) break;
    } catch (e) { console.error('Téléchargement du jeu impossible :', e.message); }
  }
  return jeux.get(v) || null;
}
const VERIF = path.join(__dirname, 'verif-partie.js'), file = [], recents = [];
let verifEnCours = false;
function noterVerif(key, date, res, info) {
  const e = db.entries[key];
  if (e && e.date === date) { e.check = { r: res.r, ...(res.why ? { why: res.why } : {}) }; persist(); }
  recents.unshift({ date, ...info, r: res.r, why: res.why || '', ms: res.ms || 0 }); recents.length = Math.min(recents.length, 50);
  console.log(`Vérification ${res.r}${res.why ? ' (' + res.why + ')' : ''} : ${info.name}, monde ${info.level + 1}${info.day ? ' (défi ' + info.day + ')' : ''}, ${info.score} points${res.ms ? ', ' + res.ms + ' ms' : ''}`);
}
function verifier(key, date, replay, annonce, info) {
  if (!replay) return noterVerif(key, date, { r: 'absent' }, info);
  if (file.length >= 30) return noterVerif(key, date, { r: 'erreur', why: 'file de vérification pleine' }, info);
  file.push({ key, date, replay, annonce, info }); suivant();
}
async function suivant() {
  if (verifEnCours || !file.length) return;
  verifEnCours = true;
  const j = file.shift();
  try {
    let v = null; try { v = JSON.parse(j.replay).app; } catch (e) {}
    const html = typeof v === 'string' ? await obtenirJeu(v) : null;
    if (!html) noterVerif(j.key, j.date, { r: v ? 'version' : 'ecart', why: v ? `jeu ${String(v).slice(0, 20)} inconnu du serveur` : 'partie illisible' }, j.info);
    else noterVerif(j.key, j.date, await new Promise(ok => {
      const w = new Worker(VERIF, { workerData: { html, replay: j.replay, annonce: j.annonce }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
      const fin = res => { clearTimeout(t); w.terminate(); ok(res); };
      const t = setTimeout(() => fin({ r: 'erreur', why: 'trop long' }), 30000);
      w.once('message', fin); w.once('error', e => fin({ r: 'erreur', why: String(e.message).slice(0, 200) }));
      w.once('exit', c => fin({ r: 'erreur', why: 'arrêt du thread (' + c + ')' }));
    }), j.info);
  } finally { verifEnCours = false; setImmediate(suivant); }
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
  if (req.method === 'GET' && url.pathname === '/api/health') {
    const verifs = {}; for (const e of Object.values(db.entries)) if (e.check) verifs[e.check.r] = (verifs[e.check.r] || 0) + 1;
    return send(res, 200, { ok: true, entries: Object.keys(db.entries).length, verifs, jeux: [...jeux.keys()], file: file.length }, origin);
  }
  if (req.method === 'GET' && url.pathname === '/api/verifs') return send(res, 200, { recents }, origin);
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
    req.on('data', c => { body += c; if (body.length > MAX_BODY) req.destroy(); });
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
      if (!prev || score > prev.score) {
        const date = Date.now(); db.entries[key] = { name, device, level, score, time: Math.round(time * 10) / 10, date, ...(day ? { day } : {}) }; persist();
        // Observation : le record est accepté tout de suite, la partie est rejouée ensuite
        verifier(key, date, typeof d.replay === 'string' ? d.replay : null, { level, score, time, day }, { name, level, score, day });
      }
      else if (prev.name !== name) { prev.name = name; persist(); }
      const top = day ? topDaily(day, 1000) : topLevel(level, 1000), rank = top.findIndex(e => e.device === device.slice(0, 8) && e.name === name) + 1;
      return send(res, 200, { ok: true, best: (db.entries[key] || {}).score, rank, total: top.length }, origin);
    });
    return;
  }
  send(res, 404, { error: 'introuvable' }, origin);
}).listen(PORT, '127.0.0.1', () => console.log(`Classement Pépin sur http://127.0.0.1:${PORT}`));
