/* Scène de fin : proposée après le dernier monde, jouable sans toucher à la partie, passable, et retenue par joueur.
   Usage : node --test tests/fin.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerMoteur } = require('../tools/moteur-headless.js');
const J = (m, code) => JSON.parse(m.ev(`JSON.stringify(${code})`));
const E = (o = {}) => ({ x: 0, down: false, jump: false, dash: false, jumpPressed: false, dashPressed: false, ...o });

/* Boutons de l'écran de résultats, lisibles depuis le test */
function avecBoutons(m) {
  m.ev(`__btns = { children: [], appendChild(c) { this.children.push(c); }, set innerHTML(v) { this.children = []; }, get lastChild() { return this.children[this.children.length - 1]; } };
        const __gid = document.getElementById; document.getElementById = id => id === 'rButtons' ? __btns : __gid(id);
        const __ce = document.createElement; document.createElement = t => t === 'button' ? { textContent: '', className: '', classList: { add() {} }, set onclick(f) { this.clic = f; }, addEventListener(e, f) { this.clic = f; } } : __ce(t);`);
  return () => J(m, '__btns.children.map(b => b.textContent)');
}

test('dernier monde terminé : « Voir la fin du voyage » en premier ; pas pour les autres mondes', () => {
  const m = creerMoteur(), boutons = avecBoutons(m);
  m.jouerMonde(11); m.pas(5); m.ev('showResults()');
  assert.equal(boutons()[0], 'Voir la fin du voyage');
  m.jouerMonde(3); m.pas(5); m.ev('showResults()');
  assert.ok(!boutons().includes('Voir la fin du voyage'));
});

test('la scène se lance, retient le joueur, fait le bilan et joue sa musique', () => {
  const m = creerMoteur();
  m.ev(`save.best = { 0: { time: 1, seeds: 1, gems: [true, true, false], gold: true, medal: 2, score: 1000 }, 7: { time: 1, seeds: 1, gems: [true, true, true], gold: false, medal: 1, score: 500 } }; prof().ach = { 'premiere-lanterne': 1, inconnu: 2 }`);
  m.ev('startEnding()');
  assert.equal(m.ev('state'), 'ending'); assert.equal(m.ev('prof().endSeen'), true);
  const d = J(m, 'endingData');
  assert.equal(d.score, 1500); assert.equal(d.gems, 5); assert.equal(d.gold, 1); assert.equal(d.ach, 1);
  assert.deepEqual(d.golds.map(Number), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(m.ev('mus.pending'), 13, 'musique de fin');
  assert.equal(m.ev('SONGS.length'), 14);
});

test('la scène se déroule seule, se dessine à chaque instant, et ne joue pas la partie', () => {
  const m = creerMoteur(); m.ev('startEnding()'); m.entrees(() => E());
  const avant = m.ev('JSON.stringify(save)');
  for (let t = 0; t < 2000; t += 50) { m.pas(50); m.ev('renderEnding()'); }
  assert.equal(m.ev('state'), 'ending'); assert.equal(m.ev('endingT'), 2000);
  assert.equal(m.ev('JSON.stringify(save)'), avant, 'la scène ne doit rien enregistrer d\'autre');
  assert.equal(m.ev('rec'), null); assert.equal(m.ev('ghost'), null);
});

test('passer la scène : générique final au premier appui, menu au second (sans double déclenchement)', () => {
  const m = creerMoteur(); m.ev('startEnding()');
  let e = E(); m.entrees(() => e);
  m.pas(100);
  e = E({ jump: true, jumpPressed: true }); m.pas(); e = E();
  assert.equal(m.ev('endingT'), m.ev('END_HOLD') + 0, 'le premier appui mène au générique final');
  m.ev('endingSkip()'); assert.equal(m.ev('state'), 'ending', 'un second appui trop rapproché est ignoré');
  m.pas(40); m.ev('endingSkip()');
  assert.equal(m.ev('state'), 'menu');
});

test('Échap n\'ouvre pas la pause pendant la scène', () => {
  const m = creerMoteur(); m.ev('startEnding()');
  m.entrees(() => E()); m.ev(`inputFeed = i => Object.assign(i, { x: 0, down: false, jump: false, dash: false, jumpPressed: false, dashPressed: false, pausePressed: true })`);
  m.pas(3); assert.equal(m.ev('state'), 'ending');
});

test('« fin vue » gardée à l\'export, bouton « Revoir la fin » au menu', () => {
  const m = creerMoteur();
  m.ev(`__b = { hidden: true }; const __g = document.getElementById; document.getElementById = id => id === 'endBtn' ? __b : __g(id)`);
  m.ev('updateEndBtn()'); assert.equal(m.ev('__b.hidden'), true);
  m.ev('startEnding(); goMenu(); updateEndBtn()'); assert.equal(m.ev('__b.hidden'), false);
  const autre = creerMoteur(); autre.ev(`mergeImport(${m.ev('JSON.stringify(buildExport())')}); save.current = ${JSON.stringify(m.ev('prof().id'))}`);
  assert.equal(autre.ev('prof().endSeen'), true);
  const piege = creerMoteur(); piege.ev(`mergeImport({ format: 'pepin-sauvegarde', profiles: [{ id: 'profil-fin-0123456', name: 'Ana', endSeen: 'oui' }] }); save.current = 'profil-fin-0123456'`);
  assert.equal(piege.ev('prof().endSeen'), undefined, 'seul true est accepté');
});

test('geste Retour d\'Android pendant la scène : retour au menu', () => {
  const m = creerMoteur();
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(src, /else if \(state === 'results' \|\| state === 'ending'\) goMenu\(\);/);
  m.ev('startEnding()'); assert.equal(m.ev('state'), 'ending');
});
