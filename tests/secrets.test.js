/* Cachettes : dans chacun des 12 mondes, avec le vrai moteur du jeu, Pépin marche sur la trappe sans tomber,
   descend (bas puis Saut), ramasse la graine d'or, puis ressort par la trappe.
   Usage : node --test tests/secrets.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerMoteur } = require('../tools/moteur-headless.js');

const E = (o = {}) => ({ x: 0, down: false, jump: false, dash: false, jumpPressed: false, dashPressed: false, ...o });
const J = (m, code) => JSON.parse(m.ev(`JSON.stringify(${code})`));

/* Pépin posé au centre de la trappe (mise en place du test), puis pilotage pas à pas */
function surLaTrappe(monde) {
  const m = creerMoteur(); m.jouerMonde(monde);
  const [x, t] = J(m, `LEVELS[${monde}].secret`);
  // Ennemis retirés : on teste la mécanique de la cachette, pas l'esquive (une guêpe survole celle du monde 8)
  m.ev(`enemies.length = 0; P.x = ${x * 16 + 11}; P.y = ${t * 16} - P.h; P.vy = 0; cam.x = P.x - 150; state = 'play'; introT = 0`);
  let e = E(); m.entrees(() => e);
  const pas = (n, entree, fin) => { for (let k = 0; k < n; k++) { e = typeof entree === 'function' ? entree() : entree; m.pas(); if (fin && fin()) return k + 1; } return fin ? -1 : n; };
  return { m, x, t, pas, P: () => J(m, '{ x: P.x, y: P.y, h: P.h, onGround: P.onGround }') };
}

for (let monde = 0; monde < 12; monde++) {
  test(`monde ${monde + 1} : trappe, graine d'or, sortie`, () => {
    const s = surLaTrappe(monde), { m, x, t } = s, haut = t * 16;
    s.pas(40, E());
    let p = s.P(); assert.equal(p.y + p.h, haut, 'Pépin devrait tenir debout sur la trappe');
    s.pas(60, E({ x: 0.2 })); // marcher dessus ne fait pas tomber
    assert.equal(s.P().y + s.P().h, haut, 'la trappe ne doit pas céder sous les pas');
    assert.ok(!m.ev('L.secretOpen'), 'cachette révélée trop tôt');
    m.ev(`P.x = ${x * 16 + 11}; P.vx = 0`);
    // Bas puis Saut : Pépin passe à travers et tombe dans la cavité
    let k = 0; const fond = s.pas(80, () => E({ down: true, jump: k < 6, jumpPressed: k++ === 0 }), () => s.P().onGround && s.P().y + s.P().h > haut + 8);
    assert.ok(fond > 0, 'Pépin n\'est pas descendu dans la cavité');
    assert.equal(m.ev('L.secretOpen'), true, 'la cavité devrait se révéler');
    assert.equal(s.P().y + s.P().h, 14 * 16, 'le fond de la cavité est la dernière rangée');
    // La graine d'or est au fond, à droite
    assert.ok(s.pas(200, E({ x: 1 }), () => m.ev('stats.gold')) > 0, 'graine d\'or non ramassée');
    assert.ok(m.ev('stats.score') >= 2000);
    // Retour sous la trappe, saut : Pépin ressort par où il est entré
    const cible = x * 16 + 11;
    const sous = s.pas(240, () => E({ x: Math.abs(s.P().x - cible) < 1.5 ? 0 : Math.sign(cible - s.P().x) * (Math.abs(s.P().x - cible) < 8 ? 0.4 : 1) }), () => Math.abs(s.P().x - cible) < 1.5 && Math.abs(J(m, 'P.vx')) < 0.05);
    assert.ok(sous > 0, 'impossible de revenir sous la trappe');
    k = 0; const sorti = s.pas(120, () => E({ jump: k < 25, jumpPressed: k++ === 0 }), () => s.P().onGround && s.P().y + s.P().h === haut);
    assert.ok(sorti > 0, `Pépin reste coincé dans la cavité (y ${s.P().y + s.P().h}, trappe ${haut})`);
  });
}

test('la graine d\'or est gardée dans les records, sur la carte et à l\'export', () => {
  const s = surLaTrappe(0), { m } = s;
  m.ev(`stats.gold = true; showResults()`);
  assert.equal(m.ev('save.best[0].gold'), true);
  assert.ok(m.ev(`!!prof().ach['cachette']`), 'succès « Ça sonne creux » non débloqué');
  const autre = creerMoteur(); autre.ev(`mergeImport(${m.ev('JSON.stringify(buildExport())')}); save.current = ${JSON.stringify(m.ev('prof().id'))}`);
  assert.equal(autre.ev('save.best[0].gold'), true, 'graine d\'or perdue à l\'import');
  // Une partie suivante sans la graine ne l'efface pas du record
  m.jouerMonde(0); m.ev('showResults()'); assert.equal(m.ev('save.best[0].gold'), true);
});

test('dessin : sol intact avant la découverte, cavité et graine visibles après', () => {
  const s = surLaTrappe(3), { m } = s;
  m.ev('withInterp(0, render)'); // cachette fermée
  m.ev('L.secretOpen = true; withInterp(0, render)'); // cachette ouverte
});
