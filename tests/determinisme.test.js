/* Déterminisme de Pépin : une même graine et les mêmes entrées doivent donner exactement la même partie,
   quel que soit l'aléatoire de l'affichage, la largeur d'écran ou ce qui a été joué avant.
   C'est la condition pour le rejeu, le fantôme du meilleur temps et la validation des scores par le serveur.
   Usage : node --test tests/determinisme.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerMoteur, joueurRobot, mulberry } = require('../tools/moteur-headless.js');

const PAS = 4000;   // un peu plus d'une minute de jeu par monde
const TOUS = 120;   // comparaison de l'état tous les 2 s de jeu
const MONDES = 12;

/* Joue un monde et renvoie la liste des empreintes successives */
function jouer(moteur, monde, graine, robot) {
  moteur.lancer(monde, graine); moteur.entrees(joueurRobot(robot));
  const traces = [];
  for (let k = 0; k < PAS; k += TOUS) { moteur.pas(TOUS); traces.push(moteur.empreinte()); }
  return traces;
}
function comparer(a, b, quoi) {
  const i = a.findIndex((e, k) => e !== b[k]);
  assert.equal(i, -1, i < 0 ? '' : `${quoi} : divergence vers le pas ${(i + 1) * TOUS}\n  A ${a[i].slice(0, 400)}\n  B ${b[i].slice(0, 400)}`);
}

test('sinus maison : écart avec Math.sin inférieur à 1e-9', () => {
  const m = creerMoteur(); let ecart = 0;
  for (let x = -3000; x < 3000; x += 0.0731) ecart = Math.max(ecart, Math.abs(m.ev(`dsin(${x})`) - Math.sin(x)));
  assert.ok(ecart < 1e-9, 'écart ' + ecart);
});

for (let monde = 0; monde < MONDES; monde++) {
  test(`monde ${monde + 1} : même partie malgré un affichage et un écran différents`, () => {
    const a = creerMoteur({ alea: mulberry(1) }), b = creerMoteur({ alea: mulberry(987654) });
    a.ev('VW = 224'); b.ev('VW = 480'); // téléphone en portrait contre écran large
    const graine = 1000 + monde, robot = 77 + monde;
    comparer(jouer(a, monde, graine, robot), jouer(b, monde, graine, robot), `monde ${monde + 1}`);
  });
}

test('aucun état résiduel : un monde joué après un autre se déroule comme joué en premier', () => {
  for (const [avant, monde] of [[3, 0], [0, 5], [10, 11], [6, 8]]) {
    const neuf = creerMoteur({ alea: mulberry(5) }), use = creerMoteur({ alea: mulberry(6) });
    jouer(use, avant, 42, 9);
    comparer(jouer(neuf, monde, 314, 15), jouer(use, monde, 314, 15), `monde ${monde + 1} après le monde ${avant + 1}`);
  }
});

test('modes classique et assistance également déterministes', () => {
  const variantes = [{ classic: true }, { invincible: true, easyJump: true }];
  for (const reglages of variantes) for (const monde of [2, 5, 9]) {
    const a = creerMoteur({ alea: mulberry(11), reglages }), b = creerMoteur({ alea: mulberry(12), reglages });
    comparer(jouer(a, monde, 7, 21), jouer(b, monde, 7, 21), `${JSON.stringify(reglages)} monde ${monde + 1}`);
  }
});

test('les réglages d\'assistance sont figés pendant la partie', () => {
  const m = creerMoteur(); m.lancer(0, 1);
  m.ev('save.settings.invincible = true; save.settings.easyJump = true');
  assert.equal(m.ev('run.invincible || run.easyJump'), false, 'changement pris en compte sans passer par la pause');
  m.ev('resumeGame()');
  assert.equal(m.ev('run.invincible && run.easyJump'), true, 'changement non pris en compte à la reprise');
});

test('les boss utilisent bien l\'aléatoire à graine', () => {
  for (const monde of [5, 11]) {
    const m = creerMoteur(); jouer(m, monde, 99, 3);
    assert.notEqual(m.ev('rngState'), m.ev('runSeed'), `monde ${monde + 1} : grand() jamais appelé, le test ne couvre pas le boss`);
  }
});
