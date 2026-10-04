/* Tests du serveur de classement (node:test, aucune dépendance).
   Usage : node --test tests/   (depuis la racine du dépôt, Node 18+)
   Chaque série lance le vrai pepin-scores.js sur un port libre avec un dossier de données temporaire. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');

const SERVEUR = path.join(__dirname, '..', 'server', 'pepin-scores.js');
const ORIGINE = 'https://laurent-67370.github.io';
const APPAREIL = '0123456789abcdef0123';
let ipSuivante = 1; // une IP différente par test, pour que l'anti-abus ne se déclenche pas par accident
const nouvelleIp = () => `10.0.0.${ipSuivante++}`;

function portLibre() {
  return new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
}
async function demarrer(dossier) {
  const port = await portLibre();
  const proc = spawn(process.execPath, [SERVEUR], { env: { ...process.env, PORT: String(port), DATA_DIR: dossier }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, ko) => { proc.stdout.on('data', d => { if (String(d).includes('Classement')) ok(); }); proc.on('exit', c => ko(new Error('serveur arrêté, code ' + c))); });
  return { port, proc, url: `http://127.0.0.1:${port}` };
}
function arreter(srv) { return new Promise(ok => { srv.proc.once('exit', ok); srv.proc.kill('SIGTERM'); }); }
const jourParis = (decalage = 0) => new Date(Date.now() + decalage * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
function mondeDuJour(jour) { let h = 0; for (const c of jour) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 12; }

let srv, dossier;
const get = async q => { const r = await fetch(srv.url + q); return { status: r.status, body: await r.json() }; };
const post = async (corps, { origine = ORIGINE, ip = nouvelleIp(), brut } = {}) => {
  const h = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }; if (origine) h.Origin = origine;
  const r = await fetch(srv.url + '/api/scores', { method: 'POST', headers: h, body: brut ?? JSON.stringify(corps) });
  return { status: r.status, body: await r.json().catch(() => null), cors: r.headers.get('access-control-allow-origin') };
};
const score = (o = {}) => ({ level: 0, score: 1000, time: 42.37, name: 'Laurent', device: APPAREIL, ...o });

before(async () => { dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pepin-')); srv = await demarrer(dossier); });
after(async () => { if (srv) await arreter(srv); fs.rmSync(dossier, { recursive: true, force: true }); });

test('santé', async () => {
  const r = await get('/api/health');
  assert.equal(r.status, 200); assert.equal(r.body.ok, true);
});

test('lecture : monde invalide refusé, monde vide accepté', async () => {
  assert.equal((await get('/api/scores?level=12')).status, 400);
  assert.equal((await get('/api/scores?level=abc')).status, 400);
  assert.equal((await get('/api/scores?daily=2026-13')).status, 400);
  const r = await get('/api/scores?level=11'); assert.equal(r.status, 200); assert.deepEqual(r.body.top, []);
});

test('envoi valide puis lecture du classement', async () => {
  const r = await post(score());
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.rank, 1); assert.equal(r.cors, ORIGINE);
  const l = await get('/api/scores?level=0');
  assert.equal(l.body.top[0].name, 'Laurent'); assert.equal(l.body.top[0].time, 42.4); assert.equal(l.body.top[0].device, APPAREIL.slice(0, 8));
});

test('un score inférieur ne remplace pas le record, un score supérieur oui', async () => {
  const dev = 'aaaaaaaaaaaaaaaa1111';
  await post(score({ device: dev, level: 1, score: 5000 }));
  assert.equal((await post(score({ device: dev, level: 1, score: 3000 }))).body.best, 5000);
  assert.equal((await post(score({ device: dev, level: 1, score: 7000 }))).body.best, 7000);
});

test('origine non autorisée ou absente : 403', async () => {
  assert.equal((await post(score(), { origine: 'https://triche.example' })).status, 403);
  assert.equal((await post(score(), { origine: null })).status, 403);
});

test('données invalides refusées', async () => {
  const cas = [
    [{ level: 12 }, 'monde invalide'], [{ level: 1.5 }, 'monde invalide'],
    [{ score: -1 }, 'score invalide'], [{ score: 60001 }, 'score invalide'], [{ score: 10.5 }, 'score invalide'],
    [{ time: 5 }, 'temps invalide'], [{ level: 11, time: 17.9 }, 'temps invalide'], [{ time: 3601 }, 'temps invalide'],
    [{ name: 'A' }, 'prénom invalide'], [{ name: 'Joueur<script>' }, 'prénom invalide'], [{ name: 'Unprénomtroplong' }, 'prénom invalide'],
    [{ device: 'court' }, 'appareil invalide'],
  ];
  for (const [modif, erreur] of cas) {
    const r = await post(score(modif));
    assert.equal(r.status, 400, JSON.stringify(modif)); assert.equal(r.body.error, erreur, JSON.stringify(modif));
  }
  assert.equal((await post(null, { brut: '{pas du json' })).status, 400);
});

test('prénoms accentués acceptés', async () => {
  assert.equal((await post(score({ name: 'Éloïse', device: 'bbbbbbbbbbbbbbbb2222' }))).status, 200);
});

test('défi du jour : bon monde accepté, mauvais monde et vieille date refusés', async () => {
  const jour = jourParis(), monde = mondeDuJour(jour);
  const ok = await post(score({ day: jour, level: monde, time: 60 }));
  assert.equal(ok.status, 200);
  assert.equal((await get('/api/scores?daily=' + jour)).body.level, monde);
  assert.equal((await post(score({ day: jour, level: (monde + 1) % 12, time: 60 }))).body.error, 'monde du jour invalide');
  assert.equal((await post(score({ day: jourParis(-5), level: mondeDuJour(jourParis(-5)), time: 60 }))).body.error, 'jour invalide');
  // Le défi du jour ne doit pas apparaître dans le classement du monde
  const d = await get('/api/scores?daily=' + jour); assert.equal(d.body.top.length, 1);
});

test('anti-abus : la 21e requête de la minute est refusée', async () => {
  const ip = '10.9.9.9';
  for (let k = 0; k < 20; k++) assert.notEqual((await post(score(), { ip })).status, 429, 'requête ' + (k + 1));
  assert.equal((await post(score(), { ip })).status, 429);
});

test('les scores survivent à un redémarrage (sauvegarde à l\'arrêt)', async () => {
  await post(score({ device: 'cccccccccccccccc3333', level: 2, score: 4242 }));
  await arreter(srv); srv = await demarrer(dossier);
  const l = await get('/api/scores?level=2');
  assert.ok(l.body.top.some(e => e.score === 4242));
});

test('purge : vieux défis du jour supprimés, vieux records conservés', async () => {
  await arreter(srv);
  const vieux = Date.now() - 40 * 86400000, f = path.join(dossier, 'scores.json'), db = JSON.parse(fs.readFileSync(f, 'utf8'));
  db.entries['dddddddddddddddd4444|3'] = { name: 'Ancien', device: 'dddddddddddddddd4444', level: 3, score: 999, time: 30, date: vieux };
  db.entries['dddddddddddddddd4444|D2026-01-01'] = { name: 'Ancien', device: 'dddddddddddddddd4444', level: mondeDuJour('2026-01-01'), score: 999, time: 30, date: vieux, day: '2026-01-01' };
  fs.writeFileSync(f, JSON.stringify(db));
  srv = await demarrer(dossier);
  assert.ok((await get('/api/scores?level=3')).body.top.some(e => e.name === 'Ancien'));
  assert.deepEqual((await get('/api/scores?daily=2026-01-01')).body.top, []);
});

test('classement total : un appareil cumule ses mondes', async () => {
  const dev = 'eeeeeeeeeeeeeeee5555';
  await post(score({ device: dev, level: 4, score: 30000, name: 'Cumul' }));
  await post(score({ device: dev, level: 5, score: 30000, name: 'Cumul' }));
  const t = (await get('/api/scores?level=total')).body.top.find(e => e.name === 'Cumul');
  assert.equal(t.score, 60000); assert.equal(t.worlds, 2);
});
