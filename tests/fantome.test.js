/* Fantôme du meilleur temps : la trajectoire enregistrée doit reproduire fidèlement celle de Pépin,
   le fantôme doit la suivre au bon rythme, et il ne doit jamais influencer la partie.
   Usage : node --test tests/fantome.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerMoteur, joueurRobot, mulberry } = require('../tools/moteur-headless.js');

/* Joue une partie enregistrée et relève la position arrondie de Pépin avant chaque pas */
function partie(monde, pas, robot, reglages = {}) {
  const m = creerMoteur({ alea: mulberry(monde + 1), reglages });
  m.jouerMonde(monde); m.entrees(joueurRobot(robot));
  const pos = [];
  for (let k = 0; k < pas; k++) { pos.push(JSON.parse(m.ev('JSON.stringify([Math.round(P.x), Math.round(P.y), poseFlags()])'))); m.pas(); }
  return { m, pos };
}
/* Termine la partie comme un monde réussi : elle devient la meilleure partie du monde */
const terminer = m => m.ev('showResults()');

test('trajectoire : chaque échantillon correspond exactement à la position de Pépin', () => {
  for (const monde of [0, 4, 10]) {
    const { m, pos } = partie(monde, 2400, 60 + monde);
    terminer(m);
    const g = JSON.parse(m.ev('JSON.stringify(unpackPath(JSON.parse(lastReplay)))'));
    assert.equal(g.xs.length, 1200);
    for (let i = 0; i < g.xs.length; i++) assert.deepEqual([g.xs[i], g.ys[i], g.fl[i]], pos[2 * i], `monde ${monde + 1}, échantillon ${i}`);
  }
});

test('le fantôme suit la meilleure partie au même rythme que le joueur', () => {
  const { m, pos } = partie(2, 1800, 7);
  terminer(m);
  m.jouerMonde(2); m.entrees(joueurRobot(999)); // autre partie, autres entrées
  assert.ok(m.ev('ghost !== null'), 'fantôme non chargé');
  for (let k = 0; k < 1700; k++) {
    m.pas();
    if (k % 2 === 0) { // après k + 1 pas, sans interpolation, le fantôme est là où était Pépin après k pas (k pair : échantillon exact)
      const q = JSON.parse(m.ev('JSON.stringify(ghostAt(ghost, ghost.t - 1))'));
      assert.deepEqual([q.x, q.y], pos[k].slice(0, 2), `pas ${k + 1}`);
    }
    if (k % 300 === 0) m.ev('{ interpA = 0.5; drawGhost(); const c = cam.x; cam.x += 2000; drawGhost(); cam.x = c; }'); // dessin, à l'écran puis hors écran
  }
});

test('le fantôme n\'influence pas la partie', () => {
  const avec = creerMoteur({ alea: mulberry(1) }), sans = creerMoteur({ alea: mulberry(1), reglages: { ghost: false } });
  for (const m of [avec, sans]) { m.jouerMonde(5); m.entrees(joueurRobot(3)); m.pas(1500); terminer(m); }
  avec.ev('Math.random = () => 0.5'); sans.ev('Math.random = () => 0.5'); // même graine pour la partie suivante
  for (const m of [avec, sans]) { m.jouerMonde(5); m.entrees(joueurRobot(4)); }
  assert.ok(avec.ev('ghost !== null')); assert.equal(sans.ev('ghost'), null);
  for (let k = 0; k < 2000; k += 100) { avec.pas(100); sans.pas(100); assert.equal(avec.empreinte(), sans.empreinte(), `pas ${k + 100}`); }
});

test('pas de fantôme pour le défi du jour, pendant un rejeu, ou sans meilleure partie', () => {
  const { m } = partie(1, 600, 2); terminer(m);
  m.ev('startLevel(1, true)'); assert.equal(m.ev('ghost'), null, 'défi du jour');
  m.ev('startReplay(lastReplay, () => {})'); assert.equal(m.ev('ghost'), null, 'rejeu');
  m.jouerMonde(7); assert.equal(m.ev('ghost'), null, 'monde jamais terminé');
  m.jouerMonde(1); assert.ok(m.ev('ghost !== null'), 'monde terminé');
});

test('le fantôme s\'arrête à l\'arrivée puis s\'efface', () => {
  const { m } = partie(0, 400, 5); terminer(m);
  m.jouerMonde(0); m.pas(400 + 90);
  const q = JSON.parse(m.ev('JSON.stringify(ghostAt(ghost, ghost.t - 1))'));
  assert.equal(q.done, true);
  m.ev('drawGhost()'); // ne doit pas planter une fois effacé
});

test('taille : une minute de partie avec sa trajectoire tient en moins de 8 Ko', () => {
  const { m } = partie(0, 3600, 77); terminer(m);
  const n = m.ev('lastReplay.length'); console.log(`    une minute avec trajectoire : ${n} octets`);
  assert.ok(n < 8192, n + ' octets');
});
