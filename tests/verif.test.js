/* Vérification des parties par le serveur : une partie honnête est validée, toute falsification est repérée.
   Usage : node --test tests/verif.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { verifierPartie } = require('../server/verif-partie.js');
const { creerMoteur } = require('../tools/moteur-headless.js');
const { partieTerminee } = require('./aide-partie.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const P = partieTerminee(), D = partieTerminee({ defi: true });
const annonce = (p, o = {}) => ({ level: 0, score: p.score, time: p.time, day: p.day, ...o });
/* Modifie une partie comme le ferait un tricheur : on décode, on change, on réencode avec le code du jeu */
const outil = creerMoteur();
function trafiquer(replay, fn) {
  const r = JSON.parse(outil.ev(`JSON.stringify(unpackReplay(${JSON.stringify(replay)}))`)); fn(r);
  return outil.ev(`packReplay(${JSON.stringify(r)}, ${JSON.stringify(r.fin)})`);
}
const verif = (replay, a) => verifierPartie(html, replay, a);

test('partie honnête : validée, avec le même score et le même temps', () => {
  const v = verif(P.replay, annonce(P));
  assert.equal(v.r, 'ok', v.why); assert.equal(v.total, P.score); assert.equal(v.time, P.time);
  console.log(`    rejouée en ${v.ms} ms (${JSON.parse(P.replay).ticks} pas)`);
});

test('défi du jour honnête : validé', () => {
  const v = verif(D.replay, annonce(D)); assert.equal(v.r, 'ok', v.why);
});

test('score ou temps falsifiés', () => {
  assert.match(verif(P.replay, annonce(P, { score: P.score + 1000 })).why, /score/);
  assert.match(verif(P.replay, annonce(P, { time: P.time - 3 })).why, /temps/);
  assert.equal(verif(P.replay, annonce(P, { time: P.time + 0.1 })).r, 'ok', 'arrondi au dixième toléré');
});

test('entrées modifiées : la partie ne retombe plus sur ses pieds', () => {
  // Un bit sans effet (saut maintenu en l'air) donne légitimement la même partie : on change donc franchement le parcours
  const t = trafiquer(P.replay, r => { const n = r.codes.length; for (let k = Math.floor(n / 3); k < Math.floor(n / 2); k++) r.codes[k] = r.codes[k] % 128; }); // Pépin recule
  const v = verif(t, annonce(P));
  assert.equal(v.r, 'ecart'); assert.notEqual(v.why, '');
});

test('empreinte finale différente : désynchronisation entre l\'appareil et le serveur signalée', () => {
  // Même entrées, même score, mais l'état final décrit par l'appareil ne correspond pas à celui rejoué
  const t = JSON.stringify({ ...JSON.parse(P.replay), fin: 'deadbeef' });
  const v = verif(t, annonce(P));
  assert.equal(v.r, 'ecart'); assert.match(v.why, /empreinte/); assert.equal(v.total, P.score);
});

test('assistance cachée dans les entrées : repérée', () => {
  const t = trafiquer(P.replay, r => { r.codes = r.codes.map(c => c | 64); });
  assert.match(verif(t, annonce(P)).why, /assistance/);
});

test('défi du jour : graine changée pour un hasard plus favorable', () => {
  const t = trafiquer(D.replay, r => { r.seed = (r.seed + 1) >>> 0; });
  assert.match(verif(t, annonce(D)).why, /graine/);
  assert.match(verif(D.replay, annonce(D, { day: undefined })).why, /défi/, 'partie du défi annoncée hors défi');
});

test('partie incomplète, mauvais monde, illisible ou démesurée', () => {
  const coupee = trafiquer(P.replay, r => { const n = Math.floor(r.codes.length / 2); r.codes.length = n; r.runs.length = n; r.ticks = r.runs.reduce((a, b) => a + b, 0); });
  assert.equal(verif(coupee, annonce(P)).r, 'ecart');
  assert.match(verif(P.replay, annonce(P, { level: 3 })).why, /monde/);
  assert.equal(verif('{"pas":"une partie"', annonce(P)).r, 'ecart');
  assert.equal(verif(JSON.stringify({ ...JSON.parse(P.replay), data: '!!!' }), annonce(P)).r, 'ecart');
  assert.match(verif(JSON.stringify({ ...JSON.parse(P.replay), ticks: 10 ** 8 }), annonce(P)).why, /durée/);
});

test('jeu : la partie est jointe au score, et le score part seul si le serveur la refuse', async () => {
  const m = P.m; m.ev(`save.settings.online = true; if (!save.playerName) save.playerName = 'Testeur'`);
  for (const [panne, desc] of [[`Promise.reject(new TypeError('connexion coupée'))`, 'ancien serveur'], [`Promise.resolve({ json: () => Promise.reject(new SyntaxError('413')) })`, 'nginx 413']]) {
    m.ev(`__corps = []; fetch = (u, o) => { __corps.push(JSON.parse(o.body)); return __corps.length === 1 ? ${panne} : Promise.resolve({ json: () => Promise.resolve({ ok: true, rank: 1 }) }); };
          __res = undefined; submitOnline(0, ${P.score}, ${P.time}, d => { __res = d; })`);
    await new Promise(r => setTimeout(r, 20));
    const corps = JSON.parse(m.ev('JSON.stringify(__corps)'));
    assert.equal(corps.length, 2, desc);
    assert.equal(corps[0].replay, P.replay, `${desc} : partie absente du premier envoi`);
    assert.equal(JSON.parse(corps[0].replay).path, undefined, 'trajectoire du fantôme envoyée inutilement');
    assert.equal(corps[1].replay, undefined, `${desc} : le second envoi devrait partir sans la partie`);
    assert.equal(m.ev('__res && __res.ok'), true, desc);
  }
});
