/* Le Jardin d'or, 13e monde bonus : ouvert par les 12 graines d'or, hors de la progression principale.
   Usage : node --test tests/monde13.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerMoteur, joueurRobot, mulberry } = require('../tools/moteur-headless.js');
const J = (m, code) => JSON.parse(m.ev(`JSON.stringify(${code})`));
const rec = (o = {}) => ({ time: 3000, seeds: 10, gems: [true, true, true], gold: true, medal: 2, score: 5000, ...o });
/* Un joueur qui a terminé n mondes de l'aventure, avec g graines d'or */
function joueur(m, n, g) {
  const best = {}; for (let i = 0; i < n; i++) best[i] = rec({ gold: i < g });
  m.ev(`save.best = ${JSON.stringify(best)}; save.unlocked = ${Math.min(12, n + 1)}; persist()`);
}

test('le monde 13 existe, avec son thème, sa musique et 3 rosées', () => {
  const m = creerMoteur();
  assert.equal(m.ev('LEVELS.length'), 13); assert.equal(m.ev('MAIN_WORLDS'), 12);
  assert.equal(m.ev('LEVELS[12].name'), 'Le Jardin d\'or');
  assert.equal(m.ev('THEMES[LEVELS[12].theme].id'), 'golden');
  assert.equal(m.ev('SONGS.length'), 15); assert.equal(m.ev('LEVELS[12].song'), 14);
  m.jouerMonde(12); assert.equal(m.ev('items.filter(it => it.k === \'gem\').length'), 3);
  assert.deepEqual(J(m, 'medalTimes(12)'), [40, 62, 92]);
});

test('ouverture : les 12 graines d\'or de l\'aventure, pas une de moins', () => {
  const m = creerMoteur();
  joueur(m, 12, 11); assert.equal(m.ev('isOpen(12)'), false, '11 graines d\'or');
  m.ev(`save.best[12] = ${JSON.stringify(rec({ gold: true }))}`); assert.equal(m.ev('isOpen(12)'), false, 'une graine du monde 13 ne compte pas');
  joueur(m, 12, 12); assert.equal(m.ev('isOpen(12)'), true);
  assert.equal(m.ev('goldCount()'), 12);
});

test('terminer le monde 12 n\'ouvre pas le 13, et le défi du jour reste dans l\'aventure', () => {
  const m = creerMoteur(); joueur(m, 11, 0);
  m.jouerMonde(11); m.pas(5); m.ev('showResults()');
  assert.equal(m.ev('save.unlocked'), 12); assert.equal(m.ev('isOpen(12)'), false);
  for (let k = 0; k < 1500; k++) { const d = new Date(Date.UTC(2026, 0, 1 + k)).toISOString().slice(0, 10); assert.ok(m.ev(`dailyWorld('${d}')`) < 12, d); }
});

test('fin du monde 13 : succès « Le jardin secret », ni « monde suivant » ni scène de fin', () => {
  const m = creerMoteur(); joueur(m, 12, 12);
  m.ev(`__btns = { children: [], appendChild(c) { this.children.push(c); }, set innerHTML(v) { this.children = []; } };
        const __gid = document.getElementById; document.getElementById = id => id === 'rButtons' ? __btns : __gid(id);
        const __ce = document.createElement; document.createElement = t => t === 'button' ? { textContent: '', className: '', classList: { add() {} } } : __ce(t);`);
  m.jouerMonde(12); m.pas(5); m.ev('showResults()');
  const b = J(m, '__btns.children.map(x => x.textContent)');
  assert.ok(!b.includes('Monde suivant') && !b.includes('Voir la fin du voyage'), b.join(', '));
  assert.ok(m.ev(`!!prof().ach['jardin-secret']`));
  assert.ok(m.ev('save.best[12]'));
  assert.equal(m.ev('save.unlocked'), 12);
});

test('les succès « de l\'aventure » ne comptent que les 12 mondes', () => {
  const m = creerMoteur();
  // 11 mondes de l'aventure + le 13e : pas « Douze lanternes », pas « Collection de rosée », pas « Chercheur d'or »
  const best = {}; for (let i = 0; i < 11; i++) best[i] = rec(); best[12] = rec();
  m.ev(`save.best = ${JSON.stringify(best)}; prof().ach = {}`);
  const ids = J(m, `endRunAchievements({ level: 12, gems: 3, seeds: 1, seedsTotal: 1, crates: 0, cratesTotal: 0, gold: false, deaths: 1, hurts: 1, kills: 1, medal: 1, assisted: false }, prof())`);
  for (const id of ['douze-lanternes', 'toutes-rosees', 'toutes-cachettes', 'tresor']) assert.ok(!ids.includes(id), id);
  assert.ok(ids.includes('jardin-secret'));
});

test('bilan de la fin du voyage : aventure seule (36 rosées, 12 graines d\'or au plus)', () => {
  const m = creerMoteur(); joueur(m, 12, 12); m.ev(`save.best[12] = ${JSON.stringify(rec())}`);
  m.ev('startEnding()'); const d = J(m, 'endingData');
  assert.equal(d.gems, 36); assert.equal(d.gold, 12);
  assert.equal(d.score, 13 * 5000, 'le score total compte tous les mondes, comme le classement total du serveur');
});

test('carte et liste : le monde 13 se dessine verrouillé puis ouvert', () => {
  const m = creerMoteur(); joueur(m, 12, 5);
  m.ev('renderMap(); renderLevelList && renderLevelList()');
  joueur(m, 12, 12); m.ev('renderMap()');
});

test('le monde 13 se joue, s\'enregistre et se rejoue à l\'identique', () => {
  const a = creerMoteur({ alea: mulberry(3) }); joueur(a, 12, 12); a.ev('VW = 480');
  a.jouerMonde(12); a.entrees(joueurRobot(13)); a.pas(2500);
  const str = a.ev('packReplay(rec, stateHash())'), h = a.ev('stateHash()'), n = a.ev('rec.ticks');
  const b = creerMoteur({ alea: mulberry(4) }); b.ev('VW = 224');
  b.ev(`startReplay(${JSON.stringify(str)}, () => {})`); b.pas(n);
  assert.equal(b.ev('stateHash()'), h);
});
