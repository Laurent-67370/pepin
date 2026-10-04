/* Fabrique une vraie partie terminée (monde 1, robot « fonceur »), comme le jeu l'enverrait au serveur */
'use strict';
const { creerMoteur, robotFonceur, mulberry } = require('../tools/moteur-headless.js');
function partieTerminee({ defi = false } = {}) {
  for (let essai = 0; essai < 12; essai++) {
    const m = creerMoteur({ alea: mulberry(1 + essai) });
    // Défi du jour du 10 janvier 2026 (monde 1) : même enchaînement que startLevel(0, true), à une date fixe
    if (defi) m.ev(`dailyRun = '2026-01-10'; loadLevel(0, dailySeed(dailyRun)); recStart(); ghost = null; state = 'play'`); else m.jouerMonde(0);
    m.entrees(robotFonceur(31 + essai));
    for (let k = 0; k < 20000 && m.etat() !== 'results'; k += 60) m.pas(60);
    if (m.etat() !== 'results') continue;
    return { m, robot: String(31 + essai), replay: m.ev('replayForServer(lastReplay)'), score: m.ev('scoreBreakdown(0).total'), time: Math.round(m.ev('stats.time') / 6) / 10, day: defi ? '2026-01-10' : undefined };
  }
  throw new Error('le robot n\'a pas terminé le monde 1');
}
module.exports = { partieTerminee };
