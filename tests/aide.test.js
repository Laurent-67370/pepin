/* Aide « Comment jouer », astuces en jeu et habillage des textes.
   Usage : node --test tests/aide.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerMoteur, joueurRobot, mulberry } = require('../tools/moteur-headless.js');
const J = (m, code) => JSON.parse(m.ev(`JSON.stringify(${code})`));
const E = () => ({ x: 0, down: false, jump: false, dash: false, jumpPressed: false, dashPressed: false });

/* Éléments de l'aide lisibles depuis le test */
function avecAide(m) {
  m.ev(`__el = {}; const __g = document.getElementById;
        document.getElementById = id => /^help/.test(id) && id !== 'helpCv' ? (__el[id] || (__el[id] = { textContent: '', innerHTML: '', disabled: false, addEventListener() {} })) : __g(id);`);
}

test('8 fiches, chacune avec un titre, un texte et des commandes connues pour les 3 appareils', () => {
  const m = creerMoteur(); const help = J(m, 'HELP'), ctrl = J(m, 'CTRL');
  assert.equal(help.length, 8);
  for (const h of help) { assert.ok(h.t && h.d.length > 20); for (const c of h.c) for (const mode of ['touch', 'keys', 'pad']) assert.ok(ctrl[mode][c], `${mode}.${c}`); }
  assert.ok(help.every(h => ['move', 'jump', 'dash', 'enemy', 'drop', 'items', 'lantern', 'secret'].includes(h.scene)));
});

test('ouvrir l\'aide : fiche remplie selon l\'appareil, navigation, fermeture sur la dernière fiche', () => {
  const m = creerMoteur(); avecAide(m);
  m.ev('openHelp()');
  assert.equal(m.ev('save.helpSeen'), true); assert.equal(m.ev(`panelStack[panelStack.length - 1]`), 'help');
  assert.equal(m.ev('helpMode'), 'keys', 'ni écran tactile ni manette dans le harnais : clavier');
  assert.equal(m.ev(`__el.helpTitle.textContent`), 'Bouger');
  assert.match(m.ev(`__el.helpKeys.innerHTML`), /<kbd>←<\/kbd>/);
  m.ev(`helpMode = 'touch'; fillHelp()`); assert.match(m.ev(`__el.helpKeys.innerHTML`), /Pouce gauche/);
  m.ev(`helpMode = 'pad'; fillHelp()`); assert.match(m.ev(`__el.helpKeys.innerHTML`), /Stick/);
  assert.equal(m.ev(`__el.helpPrev.disabled`), true);
  for (let k = 1; k < 8; k++) m.ev('helpGo(1)');
  assert.equal(m.ev(`__el.helpTitle.textContent`), 'Les secrets'); assert.equal(m.ev(`__el.helpNext.textContent`), 'C\'est parti !');
  m.ev('helpGo(1)'); assert.notEqual(m.ev(`panelStack[panelStack.length - 1]`), 'help', 'la dernière fiche ferme l\'aide');
  m.ev('helpGo(-1)'); // sans effet hors bornes
});

test('les 8 scènes animées se dessinent sans erreur', () => {
  const m = creerMoteur(); m.jouerMonde(0);
  m.ev(`const __cv = { width: 320, height: 180, getContext: () => document.createElement('canvas').getContext('2d') }; const __g2 = document.getElementById; document.getElementById = id => id === 'helpCv' ? __cv : __g2(id)`);
  for (let k = 0; k < 8; k++) { m.ev(`helpIdx = ${k}; helpT = 0`); for (let f = 0; f < 300; f += 7) m.ev(`helpT = ${f}; drawHelpScene()`); }
});

/* Pépin posé juste avant le ressort du Jardin d'or */
function presDuRessort(reglages = {}) {
  const m = creerMoteur({ reglages }); m.ev('save.best = {}; for (let i = 0; i < 12; i++) save.best[i] = { time: 1, seeds: 1, gems: [true,true,true], gold: true, medal: 1, score: 1 }; save.tips = {}');
  m.jouerMonde(12); m.entrees(E); m.pas(200); // fin du carton d'introduction
  m.ev(`enemies.length = 0; tipShow = null; save.tips = {}; P.x = 49 * 16; P.y = 12 * 16 - P.h`); return m; // le scarabée du départ a pu montrer son astuce
}

test('astuce : affichée une fois la première fois qu\'un ressort se présente, puis plus jamais', () => {
  const m = presDuRessort(); m.pas(40);
  assert.match(m.ev('tipShow ? tipShow.txt : ""'), /Ressort/);
  assert.equal(m.ev('save.tips.ressort'), 1);
  m.ev('drawTip(2)'); m.pas(320); assert.equal(m.ev('tipShow'), null);
  m.jouerMonde(12); m.entrees(E); m.pas(200); m.ev(`enemies.length = 0; tipShow = null; P.x = 49 * 16; P.y = 12 * 16 - P.h`); m.pas(40);
  assert.doesNotMatch(m.ev('tipShow ? tipShow.txt : ""'), /Ressort/, 'déjà vue');
});

test('astuces désactivées dans les réglages, ou pendant un rejeu : aucune', () => {
  const m = presDuRessort({ tips: false }); m.pas(40); assert.equal(m.ev('tipShow'), null);
  const a = creerMoteur(); a.jouerMonde(0); a.entrees(joueurRobot(5)); a.pas(600);
  const str = a.ev('packReplay(rec, stateHash())');
  const b = creerMoteur(); b.ev(`save.tips = {}; startReplay(${JSON.stringify(str)}, () => {})`); b.pas(600);
  assert.deepEqual(J(b, 'save.tips'), {});
});

test('les astuces ne changent rien à la partie', () => {
  const a = creerMoteur({ alea: mulberry(1) }), b = creerMoteur({ alea: mulberry(1), reglages: { tips: false } });
  for (const m of [a, b]) { m.ev('save.tips = {}'); m.lancer(0, 77); m.entrees(joueurRobot(9)); }
  for (let k = 0; k < 1500; k += 100) { a.pas(100); b.pas(100); assert.equal(a.empreinte(), b.empreinte()); }
  assert.ok(Object.keys(J(a, 'save.tips')).length > 0, 'au moins une astuce montrée pendant la partie');
});

test('textes : style selon le message, mots des commandes repérés, dessin complet sans erreur', () => {
  const m = creerMoteur();
  const st = t => J(m, `floatStyle(${JSON.stringify(t)})`);
  assert.equal(st('+50').col, '#ffd34d'); assert.equal(st('+2000').size, 10); assert.equal(st('Il accélère !').rim, '#b8402a');
  assert.equal(st('Feuille : plane en gardant Saut').rim, '#2a8fbf'); assert.equal(st('Cachette !').rim, '#3f8f34');
  for (const w of ['Saut', 'l\'Élan', 'bas,', 'rosée.']) assert.ok(m.ev(`KEYWORDS.test(${JSON.stringify(w)})`), w);
  for (const w of ['Pépin', 'sol']) assert.ok(!m.ev(`KEYWORDS.test(${JSON.stringify(w)})`), w);
  m.jouerMonde(0); m.entrees(E); m.pas(30);
  m.ev(`P.x = 9 * 16; texts.push({ x: P.x, y: P.y, txt: '+50', life: 55 }); tipShow = { txt: 'Saute sur la tête des ennemis.', t: 5 }`); m.pas(10);
  m.ev('withInterp(0, render)'); // bandeau, bulle de panneau, textes flottants, astuce
});
