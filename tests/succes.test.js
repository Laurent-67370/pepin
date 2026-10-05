/* Succès : conditions, déblocage en jeu et en fin de monde, jamais en rejeu ni (pour l'adresse) en assistance.
   Usage : node --test tests/succes.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerMoteur, robotFonceur, mulberry } = require('../tools/moteur-headless.js');
const { partieTerminee } = require('./aide-partie.js');

const J = (m, code) => JSON.parse(m.ev(`JSON.stringify(${code})`));
const debloques = m => Object.keys(J(m, 'prof().ach')).sort();
const outil = creerMoteur();
const BASE = { level: 2, assisted: false, deaths: 3, hurts: 2, kills: 4, seeds: 10, seedsTotal: 30, gems: 0, medal: 0, classic: false, daily: null, dailyCount: 0, crates: 0, cratesTotal: 5, beatGhost: false };
/* Succès mérités pour un bilan donné, avec un profil (records) donné */
const merites = (r, best = {}) => J(outil, `endRunAchievements(${JSON.stringify({ ...BASE, ...r })}, ${JSON.stringify({ best, daily: {} })})`).sort();

test('liste : 22 succès, identifiants uniques, un succès caché', () => {
  const l = J(outil, 'ACH');
  assert.equal(l.length, 22); assert.equal(new Set(l.map(a => a.id)).size, 22);
  assert.ok(l.some(a => a.hidden));
});

test('conditions de fin de monde, une par une', () => {
  assert.deepEqual(merites({}), ['premiere-lanterne']);
  const cas = [
    [{ level: 5 }, 'grand-frelon'], [{ level: 11 }, 'frelon-royal'], [{ gems: 1 }, 'premiere-rosee'], [{ gems: 3 }, 'trois-rosees'],
    [{ seeds: 30 }, 'jardinier'], [{ crates: 5 }, 'demenageur'], [{ daily: '2026-10-05' }, 'premier-defi'], [{ dailyCount: 7 }, 'sept-defis'],
    [{ deaths: 0 }, 'sans-chute'], [{ medal: 1 }, 'medaille'], [{ beatGhost: true }, 'ombre'],
  ];
  for (const [r, id] of cas) assert.ok(merites(r).includes(id), `${id} attendu pour ${JSON.stringify(r)}`);
  assert.ok(merites({ medal: 3 }).includes('or-pur'));
  assert.ok(merites({ level: 5, deaths: 0, hurts: 0 }).includes('intouchable'));
  assert.ok(!merites({ level: 2, deaths: 0, hurts: 0 }).includes('intouchable'), 'intouchable hors boss');
  assert.ok(!merites({ level: 5, deaths: 0, hurts: 1 }).includes('intouchable'), 'intouchable malgré un coup');
  assert.ok(merites({ classic: true, deaths: 0 }).includes('a-l-ancienne'));
  assert.ok(merites({ level: 0, kills: 0 }).includes('pacifiste'));
  assert.ok(!merites({ level: 1, kills: 0 }).includes('pacifiste'), 'pacifiste hors du Verger');
  assert.ok(!merites({ cratesTotal: 0, crates: 0 }).includes('demenageur'), 'déménageur dans un monde sans caisse');
});

test('succès sur l\'ensemble des mondes : douze lanternes, 36 rosées, or partout', () => {
  const tout = (o) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, { time: 600, seeds: 0, gems: [true, true, true], medal: 3, score: 1, ...o }]));
  const m = merites({}, tout());
  for (const id of ['douze-lanternes', 'toutes-rosees', 'tresor']) assert.ok(m.includes(id), id);
  const presque = tout(); presque[7] = { ...presque[7], gems: [true, false, true], medal: 2 };
  const m2 = merites({}, presque);
  assert.ok(m2.includes('douze-lanternes')); assert.ok(!m2.includes('toutes-rosees')); assert.ok(!m2.includes('tresor'));
  const onze = tout(); delete onze[11]; assert.ok(!merites({}, onze).includes('douze-lanternes'));
});

test('mode assistance : succès d\'adresse refusés, progression et collection acceptées', () => {
  const m = merites({ assisted: true, deaths: 0, hurts: 0, level: 5, medal: 3, gems: 3, beatGhost: true, classic: true });
  assert.ok(m.includes('grand-frelon') && m.includes('trois-rosees'));
  for (const id of ['sans-chute', 'intouchable', 'or-pur', 'medaille', 'ombre', 'a-l-ancienne']) assert.ok(!m.includes(id), id);
});

test('vraie partie : succès débloqués à l\'arrivée, aucun en revoyant la partie', () => {
  const p = partieTerminee(), m = p.m;
  assert.deepEqual(debloques(m), ['medaille', 'premiere-lanterne']); // le robot a l'argent, 5 chutes
  assert.ok(J(m, 'achListHtml()').includes('2 succès sur 22'));
  const b = creerMoteur({ alea: mulberry(3) });
  b.ev(`startReplay(${JSON.stringify(p.m.ev('lastReplay'))}, () => {})`); b.pas(100);
  b.ev('const c = stats.combo; stats.combo = 4; killEnemy(enemies.find(e => !e.dead), 0); stats.combo = c'); // succès en cours de partie pendant le rejeu
  b.pas(3900);
  assert.equal(b.ev('replay'), null, 'rejeu non terminé'); assert.deepEqual(debloques(b), [], 'succès débloqué pendant un rejeu');
});

test('en jeu : rebonds en série et déménageur, aussitôt annoncés', () => {
  const m = creerMoteur(); m.jouerMonde(0); m.pas(5);
  m.ev('stats.combo = 4; killEnemy(enemies[0], 0)');
  assert.ok(J(m, 'prof().ach')['combo-5']); assert.equal(m.ev('toastQueue.length + (toastBusy ? 1 : 0)'), 1);
  assert.equal(m.ev('stats.kills'), 1);
  m.ev('P.inv = 0; P.dashT = 0; hurt(P.x + 50)'); assert.equal(m.ev('stats.hurts'), 1, 'coup reçu non compté');
  m.ev('hurt(P.x + 50)'); assert.equal(m.ev('stats.hurts'), 1, 'coup compté pendant l\'invulnérabilité');
  // Monde 1 : on casse toutes ses caisses
  const n = m.ev(`(() => { let n = 0; for (let y = 0; y < ROWS; y++) for (let x = 0; x < L.w; x++) if (L.g[y][x] === 'C') { breakCrate(x, y); n++; } return n; })()`);
  assert.ok(n > 0); assert.equal(m.ev('stats.crates'), n);
  assert.ok(J(m, 'prof().ach')['demenageur']);
});

test('en jeu, en mode assistance : pas de succès d\'adresse', () => {
  const m = creerMoteur({ reglages: { invincible: true } }); m.jouerMonde(0); m.pas(5);
  m.ev('stats.combo = 4; killEnemy(enemies[0], 0)');
  assert.equal(J(m, 'prof().ach')['combo-5'], undefined);
});

test('battre son fantôme', () => {
  const p = partieTerminee(), m = p.m;
  m.jouerMonde(0); assert.ok(m.ev('ghost !== null'));
  m.ev('ghost.time = 1e9'); // fantôme très lent : n'importe quelle arrivée le bat
  // Même graine que la partie de référence : le même robot arrive forcément au bout
  m.ev(`loadLevel(0, ${JSON.parse(p.replay).seed}); recStart(); state = 'play'`); m.entrees(robotFonceur(JSON.parse(p.robot)));
  for (let k = 0; k < 20000 && m.etat() !== 'results'; k += 60) m.pas(60);
  assert.equal(m.etat(), 'results', 'le robot devait terminer le monde');
  assert.ok(J(m, 'prof().ach')['ombre']);
});

test('succès caché masqué tant qu\'il n\'est pas obtenu ; succès gardés à l\'import', () => {
  const m = creerMoteur();
  assert.ok(!m.ev('achListHtml()').includes('Pacifiste')); assert.ok(m.ev('achListHtml()').includes('Succès caché'));
  m.ev(`prof().ach = { pacifiste: 1, 'premiere-lanterne': 2 }`);
  assert.ok(m.ev('achListHtml()').includes('Pacifiste'));
  const f = { ...J(m, 'buildExport()') }; f.profiles[0].ach.inconnu = 3; f.profiles[0].ach['or-pur'] = 'pas une date';
  const b = creerMoteur(); b.ev(`mergeImport(${JSON.stringify(f)}); save.current = ${JSON.stringify(f.profiles[0].id)}`);
  assert.deepEqual(debloques(b), ['pacifiste', 'premiere-lanterne']);
});
