/* Enregistrement et rejeu des parties : une partie enregistrée puis rejouée sur un autre « appareil »
   (autre aléatoire d'affichage, autre largeur d'écran) doit retomber exactement sur le même état.
   Usage : node --test tests/rejeu.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerMoteur, joueurRobot, mulberry } = require('../tools/moteur-headless.js');

/* Joue une partie enregistrée avec le robot ; changeA : pas auquel le joueur active l'assistance en pause */
function partie(monde, { pas = 3000, robot = 5, changeA = null, reglages = {} } = {}) {
  const a = creerMoteur({ alea: mulberry(100 + monde), reglages }); a.ev('VW = 480');
  a.jouerMonde(monde); a.entrees(joueurRobot(robot));
  for (let k = 0; k < pas; k++) {
    // La pause n'est possible qu'en jeu : on attend que Pépin soit jouable (pas en pleine réapparition)
    if (changeA != null && k >= changeA && a.etat() === 'play') { a.ev(`openPause(); save.settings.invincible = true; save.settings.easyJump = true; resumeGame()`); changeA = null; }
    a.pas();
  }
  return { a, str: a.ev('packReplay(rec, stateHash())'), hash: a.ev('stateHash()'), ticks: a.ev('rec.ticks') };
}
function rejouer(str, ticks) {
  const b = creerMoteur({ alea: mulberry(999) }); b.ev('VW = 224');
  b.ev(`__fin = undefined; startReplay(${JSON.stringify(str)}, ok => { __fin = ok; })`);
  b.pas(ticks);
  return b;
}

for (const monde of [0, 3, 5, 8, 11]) {
  test(`monde ${monde + 1} : la partie rejouée retombe sur le même état`, () => {
    const p = partie(monde, { robot: 40 + monde });
    const b = rejouer(p.str, p.ticks);
    assert.equal(b.ev('replay.t'), p.ticks);
    assert.equal(b.ev('stateHash()'), p.hash);
  });
}

test('assistance activée en cours de partie (pause) : rejouée au bon moment', () => {
  const p = partie(2, { changeA: 1200, robot: 8 });
  const codes = JSON.parse(p.a.ev('JSON.stringify(rec.codes)'));
  assert.ok(codes.some(c => c & 64) && !(codes[0] & 64), 'le changement de réglage n\'est pas dans l\'enregistrement');
  const b = rejouer(p.str, p.ticks);
  assert.equal(b.ev('stateHash()'), p.hash);
  assert.equal(b.ev('run.invincible'), true);
});

test('mode classique : rejoué en classique même si l\'appareil qui rejoue ne l\'est pas', () => {
  const p = partie(4, { reglages: { classic: true }, robot: 13, pas: 450 });
  const b = rejouer(p.str, p.ticks);
  assert.equal(b.ev('stats.classic'), true);
  assert.equal(b.ev('stats.lives'), p.a.ev('stats.lives'));
  assert.equal(b.ev('stateHash()'), p.hash);
});

test('mode classique : le rejeu s\'arrête au même game over', () => {
  const p = partie(4, { reglages: { classic: true }, robot: 13, pas: 600 });
  assert.ok(['gameover', 'results'].includes(p.a.etat()), 'le robot devait perdre ses vies');
  const b = rejouer(p.str, p.ticks);
  assert.equal(b.ev('replay'), null, 'rejeu non terminé au game over');
  assert.equal(b.ev('stats.lives'), 0);
});

test('fin du rejeu : retour signalé, rejeu fidèle', () => {
  const p = partie(1, { pas: 900, robot: 3 });
  const b = rejouer(p.str, p.ticks);
  b.ev('showResults()'); // la fin du monde, telle qu'elle survient dans un vrai rejeu
  assert.equal(b.ev('__fin'), true);
  assert.equal(b.ev('replay'), null);
});

test('rejeu interrompu par la pause : retour signalé, aucun score enregistré', () => {
  const p = partie(0, { pas: 600 });
  const b = rejouer(p.str, 300);
  const avant = b.ev('JSON.stringify(save)');
  b.ev('openPause()');
  assert.equal(b.ev('__fin'), null);
  assert.equal(b.ev('replay'), null);
  assert.equal(b.ev('JSON.stringify(save)'), avant);
});

test('fin de monde : partie gardée pour « Revoir » et comme meilleure partie', () => {
  const p = partie(6, { pas: 1500, robot: 2 });
  p.a.ev('showResults()');
  assert.ok(p.a.ev('lastReplay'));
  assert.equal(p.a.ev('bestReplay(6)'), p.a.ev('lastReplay'));
  assert.equal(p.a.ev('JSON.parse(lastReplay).time'), p.a.ev('stats.time'));
  // Une partie plus lente ne remplace pas la meilleure
  const meilleure = p.a.ev('bestReplay(6)');
  p.a.jouerMonde(6); p.a.pas(2500); p.a.ev('showResults()');
  assert.equal(p.a.ev('bestReplay(6)'), meilleure);
  // Supprimer le profil supprime ses parties
  p.a.ev('dropReplays(prof().id)');
  assert.equal(p.a.ev('bestReplay(6)'), null);
});

test('encodage : aller-retour exact, y compris les très longues répétitions', () => {
  const m = creerMoteur();
  const r = { level: 3, seed: 123456789, classic: false, daily: null, ticks: 0, codes: [4096, 4096 + 8 + 2, 0, 8319, 4096], runs: [1, 2, 130, 20000, 3000000] };
  r.ticks = r.runs.reduce((a, b) => a + b, 0);
  const u = JSON.parse(m.ev(`JSON.stringify(unpackReplay(packReplay(${JSON.stringify(r)}, 'abc')))`));
  assert.deepEqual(u.codes, r.codes); assert.deepEqual(u.runs, r.runs);
  assert.equal(u.seed, r.seed); assert.equal(u.fin, 'abc');
  assert.equal(m.ev('unpackReplay("pas un rejeu")'), null);
});

test('taille : une minute d\'entrées tient en moins de 4 Ko (hors trajectoire du fantôme)', () => {
  const p = partie(0, { pas: 3600, robot: 77 }), n = JSON.parse(p.str).data.length;
  console.log(`    une minute d'entrées du robot : ${n} octets`);
  assert.ok(n < 4096, n + ' octets');
});
